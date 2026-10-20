/**
 * SOS Vendas — Integration Routes (F1.1-C Radar Hardening & Governance)
 * 
 * Capabilities:
 * 1. GET   /v1/workspaces/:workspaceId/integrations/candidates  — governed candidate snapshot with stable cursor and candidateRevision
 * 2. POST  /v1/workspaces/:workspaceId/integrations/suggestions — semantically idempotent suggestion creation linked to candidateRevision
 * 3. GET   /v1/workspaces/:workspaceId/integrations/suggestions — list suggestions with expiry exclusion
 * 4. GET   /v1/workspaces/:workspaceId/integrations/suggestions/count — active pending count for Cockpit badge
 * 5. PATCH /v1/workspaces/:workspaceId/integrations/suggestions/:suggestionId — transactional decision with governance & origin revalidation
 * 
 * Invariants:
 * - Accepting a suggestion NEVER sends external messages. It only pre-fills the composer draft.
 * - Same key + same payload = 200/201 idempotent replay.
 * - Same key + different payload = 409 Conflict.
 * - Candidate-Suggestion link: POST requires opaque candidateRevision matching current DB facts; returns 409 CANDIDATE_STALE otherwise with zero inserts.
 * - Server-owned configuration: moduleKey ('radar_m01'), ruleVersion (from workspace), and source are strictly server-derived.
 * - Governance revalidation: inactive workspace, disabled radar, or changed rule version invalidates suggestion and persists rejection code before responding 409.
 */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { RbacAuthorizationPolicy, type AuthUser, type Permission } from "@sos-sales/auth";
import {
  withTenantTransaction,
  listIntegrationCandidates,
  createIntegrationSuggestion,
  listIntegrationSuggestions,
  decideSuggestion,
  countPendingSuggestions,
  SuggestionIdempotencyConflictError,
  SuggestionDecisionRejectionError,
  InvalidCursorError,
  type SuggestionStatus,
  type SuggestionSource,
} from "@sos-sales/database";
import type { Role } from "@sos-sales/contracts";

const rbacPolicy = new RbacAuthorizationPolicy();

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const suggestionParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  suggestionId: z.string().uuid(),
});

// Strict candidate query schema: no moduleKey or arbitrary client filters
const listCandidatesQuerySchema = z.object({
  minHoursSinceLastMessage: z.coerce.number().min(0).max(8760).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
}).strict();

const listSuggestionsQuerySchema = z.object({
  status: z.enum(["pending", "accepted", "dismissed", "expired", "invalidated"]).optional(),
  threadId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// Strict evidence schema: closed fields, bounded strings and arrays
const suggestionEvidenceSchema = z.object({
  hoursSinceLastMessage: z.number().nonnegative().optional(),
  lastMessageSnippet: z.string().max(500).optional(),
  lastMessageDirection: z.enum(["inbound", "outbound"]).optional(),
  unreadCount: z.number().int().nonnegative().optional(),
  signals: z.array(z.string().max(100)).max(10).optional(),
}).strict().optional().nullable();

// Strict body schema: unknown fields (including moduleKey, ruleVersion, source, metadata, originSnapshot)
// are rejected with 400 Bad Request
const createSuggestionBodySchema = z.object({
  idempotencyKey: z.string().min(1).max(256),
  threadId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  suggestionType: z.enum(["follow_up", "reengagement", "upsell", "reminder", "custom"]).optional(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  draftMessage: z.string().max(2000).optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  reasonCode: z.enum([
    "COLD_LEAD_REENGAGEMENT",
    "UNANSWERED_CLIENT_INQUIRY",
    "FOLLOWUP_DUE",
    "CART_ABANDONMENT",
    "CUSTOM_FOLLOWUP",
  ]).optional(),
  evidence: suggestionEvidenceSchema,
  candidateRevision: z.string().min(1),
  expiresAt: z.string().datetime().optional().nullable(),
}).strict();

const decideSuggestionBodySchema = z.object({
  status: z.enum(["accepted", "dismissed"]),
  stateVersion: z.number().int().positive(),
}).strict();

const scanRadarBodySchema = z.object({
  minHoursSinceLastMessage: z.number().min(1).max(8760).default(12),
  limit: z.number().int().min(1).max(50).default(20),
  threadId: z.string().uuid().optional(),
}).strict();

/**
 * Inline permission check: returns true if the request's active role
 * has ANY of the provided permissions.
 */
function hasAnyPermission(request: FastifyRequest, ...permissions: Permission[]): boolean {
  const activeRole = (request.activeRole || request.user?.role) as Role | undefined;
  if (!activeRole) return false;

  const userForCheck: AuthUser = {
    id: request.user.id,
    email: request.user.email,
    role: activeRole,
    workspaceId: request.workspaceId || request.user.workspaceId,
  };

  return permissions.some((p) => rbacPolicy.hasPermission(userForCheck, p));
}

function forbidden(reply: FastifyReply, request: FastifyRequest, detail: string) {
  return reply.status(403).send({
    type: "https://chat-sales.mct.br/errors/forbidden",
    title: "Forbidden",
    status: 403,
    detail,
    instance: request.url,
    correlationId: request.id,
  });
}

function badRequest(reply: FastifyReply, request: FastifyRequest, detail: string, code?: string, details?: unknown) {
  return reply.status(400).send({
    type: "https://chat-sales.mct.br/errors/bad-request",
    title: "Bad Request",
    status: 400,
    ...(code ? { code } : {}),
    detail,
    ...(details ? { details } : {}),
    instance: request.url,
    correlationId: request.id,
  });
}

export const integrationRoutes: FastifyPluginAsync = async (app) => {

  // ─────────────────────────────────────────────────────────────────────────
  // 1. GET /v1/workspaces/:workspaceId/integrations/candidates
  //    Permission: integration:candidates:read OR integration:manage
  //    Returns a governed candidate snapshot with stable cursor and candidateRevision.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/v1/workspaces/:workspaceId/integrations/candidates",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:candidates:read", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:candidates:read");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const parsedQuery = listCandidatesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return badRequest(reply, request, "Invalid query parameters for candidates", undefined, parsedQuery.error.format());
      }

      const { workspaceId } = parsedParams.data;
      const { minHoursSinceLastMessage, limit, cursor } = parsedQuery.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          return listIntegrationCandidates(client, workspaceId, {
            minHoursSinceLastMessage,
            limit,
            cursor,
          });
        });

        return reply.status(200).send({
          items: result.items,
          total: result.total,
          nextCursor: result.nextCursor,
        });
      } catch (err: any) {
        if (err instanceof InvalidCursorError || err.code === "INVALID_CURSOR") {
          return badRequest(reply, request, err.message, "INVALID_CURSOR");
        }
        throw err;
      }
    }
  );

  // Governed on-demand scan. It creates reviewable suggestions only; it never sends messages.
  app.post(
    "/v1/workspaces/:workspaceId/integrations/radar/scan",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission to run Radar scan");
      }
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      const parsedBody = scanRadarBodySchema.safeParse(request.body ?? {});
      if (!parsedParams.success || !parsedBody.success) {
        return badRequest(reply, request, "Invalid Radar scan parameters");
      }

      const { workspaceId } = parsedParams.data;
      const result = await withTenantTransaction(workspaceId, async (client) => {
        const config = await client.query<{ radar_enabled: boolean }>(
          `SELECT radar_enabled FROM public.workspaces WHERE id = $1`, [workspaceId]
        );
        if (!config.rows[0]?.radar_enabled) {
          return { enabled: false, candidates: 0, created: 0 };
        }

        const candidates = await listIntegrationCandidates(client, workspaceId, parsedBody.data);
        let created = 0;
        for (const candidate of candidates.items) {
          const hours = candidate.evidence.hoursSinceLastMessage;
          const inbound = candidate.evidence.lastMessageDirection === "inbound";
          const name = candidate.contactName || "este contato";
          const title = inbound ? `Cliente aguardando retorno: ${name}` : `Retomar contato com ${name}`;
          const body = inbound
            ? `A última mensagem do cliente está sem retorno há ${hours} hora(s). Revise a conversa e responda.`
            : `A conversa está parada há ${hours} hora(s). Avalie se existe oportunidade de retomada.`;
          const draftMessage = inbound
            ? `Olá, ${candidate.contactName || "tudo bem"}? Vi sua mensagem e estou retomando seu atendimento agora.`
            : `Olá, ${candidate.contactName || "tudo bem"}? Estou retomando nosso contato para saber se ainda posso ajudar.`;
          const outcome = await createIntegrationSuggestion(client, workspaceId, {
            idempotencyKey: `radar:${candidate.threadId}:${candidate.candidateRevision}`,
            source: "system",
            threadId: candidate.threadId,
            contactId: candidate.contactId,
            suggestionType: inbound ? "follow_up" : "reengagement",
            title,
            body,
            draftMessage,
            priority: inbound ? "high" : "normal",
            reasonCode: candidate.reasonCode,
            evidence: {
              hoursSinceLastMessage: hours,
              lastMessageSnippet: candidate.evidence.lastMessageBody?.slice(0, 500) ?? undefined,
              lastMessageDirection: candidate.evidence.lastMessageDirection as "inbound" | "outbound" | undefined,
              signals: [candidate.reasonCode],
            },
            candidateRevision: candidate.candidateRevision,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          });
          if (outcome.created) created += 1;
        }
        return { enabled: true, candidates: candidates.total, created };
      });

      return reply.status(200).send(result);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 2. POST /v1/workspaces/:workspaceId/integrations/suggestions
  //    Permission: integration:suggestions:create OR integration:manage
  //    Idempotent: same key + same payload -> 200/201. Same key + different -> 409.
  //    Requires candidateRevision matching current DB facts; 409 CANDIDATE_STALE otherwise.
  // ─────────────────────────────────────────────────────────────────────────
  app.post(
    "/v1/workspaces/:workspaceId/integrations/suggestions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:create", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:suggestions:create");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const parseResult = createSuggestionBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return badRequest(reply, request, "Invalid suggestion creation payload", undefined, parseResult.error.format());
      }

      const { workspaceId } = parsedParams.data;
      const data = parseResult.data;

      // Server-derived provenance: integration_service callers are strictly 'n8n'
      const activeRole = (request.activeRole || request.user?.role) as Role | undefined;
      const derivedSource: SuggestionSource = activeRole === "integration_service"
        ? "n8n"
        : "system";

      try {
        const { suggestion, created } = await withTenantTransaction(
          workspaceId,
          async (client) => {
            return createIntegrationSuggestion(client, workspaceId, {
              idempotencyKey: data.idempotencyKey,
              source: derivedSource,
              threadId: data.threadId,
              contactId: data.contactId,
              suggestionType: data.suggestionType,
              title: data.title,
              body: data.body,
              draftMessage: data.draftMessage,
              priority: data.priority,
              reasonCode: data.reasonCode,
              evidence: data.evidence,
              candidateRevision: data.candidateRevision,
              expiresAt: data.expiresAt,
            });
          }
        );

        const statusCode = created ? 201 : 200;
        return reply.status(statusCode).send({
          id: suggestion.id,
          idempotencyKey: suggestion.idempotency_key,
          source: suggestion.source,
          moduleKey: suggestion.module_key,
          ruleVersion: suggestion.rule_version,
          threadId: suggestion.thread_id,
          contactId: suggestion.contact_id,
          suggestionType: suggestion.suggestion_type,
          title: suggestion.title,
          body: suggestion.body,
          draftMessage: suggestion.draft_message,
          priority: suggestion.priority,
          originSnapshot: suggestion.origin_snapshot,
          status: suggestion.status,
          stateVersion: suggestion.state_version,
          expiresAt: suggestion.expires_at?.toISOString() ?? null,
          createdAt: suggestion.created_at.toISOString(),
          created,
        });
      } catch (err: any) {
        if (err instanceof SuggestionIdempotencyConflictError || err.code === "IDEMPOTENCY_CONFLICT") {
          return reply.status(409).send({
            type: "https://chat-sales.mct.br/errors/conflict",
            title: "Idempotency Conflict",
            status: 409,
            code: "IDEMPOTENCY_CONFLICT",
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (err instanceof SuggestionDecisionRejectionError) {
          const statusCode = err.code === "INVALID_SNAPSHOT" ? 400 : 409;
          return reply.status(statusCode).send({
            type: "https://chat-sales.mct.br/errors/conflict",
            title: "Suggestion Rejected",
            status: statusCode,
            code: err.code,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3. GET /v1/workspaces/:workspaceId/integrations/suggestions
  //    Permission: integration:suggestions:manage OR integration:manage
  //    Lists suggestions with optional status/thread filter. Excludes expired.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/v1/workspaces/:workspaceId/integrations/suggestions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:suggestions:manage");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const parsedQuery = listSuggestionsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return badRequest(reply, request, "Invalid query parameters for suggestions", undefined, parsedQuery.error.format());
      }

      const { workspaceId } = parsedParams.data;
      const { status, threadId, limit, offset } = parsedQuery.data;

      const result = await withTenantTransaction(workspaceId, async (client) => {
        return listIntegrationSuggestions(client, workspaceId, {
          status: status as SuggestionStatus | undefined,
          threadId,
          limit,
          offset,
        });
      });

      return reply.status(200).send({
        items: result.items.map((s) => ({
          id: s.id,
          idempotencyKey: s.idempotency_key,
          source: s.source,
          moduleKey: s.module_key,
          ruleVersion: s.rule_version,
          threadId: s.thread_id,
          contactId: s.contact_id,
          suggestionType: s.suggestion_type,
          title: s.title,
          body: s.body,
          draftMessage: s.draft_message,
          priority: s.priority,
          metadata: s.metadata,
          originSnapshot: s.origin_snapshot,
          status: s.status,
          stateVersion: s.state_version,
          decidedByUserId: s.decided_by_user_id,
          decidedAt: s.decided_at?.toISOString() ?? null,
          expiresAt: s.expires_at?.toISOString() ?? null,
          createdAt: s.created_at.toISOString(),
          updatedAt: s.updated_at.toISOString(),
        })),
        total: result.total,
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 4. GET /v1/workspaces/:workspaceId/integrations/suggestions/count
  //    Permission: cockpit:access (operators can see the badge)
  //    Returns active, non-expired pending count for Cockpit badge.
  // ─────────────────────────────────────────────────────────────────────────
  app.get(
    "/v1/workspaces/:workspaceId/integrations/suggestions/count",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "cockpit:access", "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission for suggestion count");
      }

      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId parameter");
      }

      const { workspaceId } = parsedParams.data;

      const count = await withTenantTransaction(workspaceId, async (client) => {
        return countPendingSuggestions(client, workspaceId);
      });

      return reply.status(200).send({ pendingCount: count });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 5. PATCH /v1/workspaces/:workspaceId/integrations/suggestions/:suggestionId
  //    Permission: integration:suggestions:manage OR integration:manage
  //    Accept or dismiss with transactional origin & module state revalidation.
  //    INVARIANT: Accepting ONLY pre-fills composer draft, NEVER auto-sends.
  //    PERSISTENCE: If invalidated or expired, commits state and returns 409.
  // ─────────────────────────────────────────────────────────────────────────
  app.patch(
    "/v1/workspaces/:workspaceId/integrations/suggestions/:suggestionId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
      ],
    },
    async (request, reply) => {
      if (!hasAnyPermission(request, "integration:suggestions:manage", "integration:manage")) {
        return forbidden(reply, request, "Missing permission: integration:suggestions:manage");
      }

      const parsedParams = suggestionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return badRequest(reply, request, "Invalid workspaceId or suggestionId parameter");
      }

      const parseResult = decideSuggestionBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return badRequest(
          reply, request,
          "Invalid decision payload. Required: { status: 'accepted'|'dismissed', stateVersion: number }",
          undefined,
          parseResult.error.format()
        );
      }

      const { workspaceId, suggestionId } = parsedParams.data;
      const { status, stateVersion } = parseResult.data;

      const decisionResult = await withTenantTransaction(workspaceId, async (client) => {
        return decideSuggestion(client, workspaceId, suggestionId, {
          status,
          decidedByUserId: request.user.id,
          expectedStateVersion: stateVersion,
        });
      });

      if (!decisionResult.ok) {
        const statusCode = decisionResult.code === "SUGGESTION_NOT_FOUND" ? 404 : 409;
        return reply.status(statusCode).send({
          type: "https://chat-sales.mct.br/errors/conflict",
          title: "Decision Conflict",
          status: statusCode,
          code: decisionResult.code,
          detail: decisionResult.reason,
          action: decisionResult.action
            ? {
                id: decisionResult.action.id,
                threadId: decisionResult.action.thread_id,
                title: decisionResult.action.title,
                description: decisionResult.action.description,
                dueAt: decisionResult.action.due_at.toISOString(),
                status: decisionResult.action.status,
                origin: decisionResult.action.origin,
              }
            : null,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const updated = decisionResult.suggestion;
      return reply.status(200).send({
        id: updated.id,
        status: updated.status,
        stateVersion: updated.state_version,
        decidedByUserId: updated.decided_by_user_id,
        decidedAt: updated.decided_at?.toISOString() ?? null,
        draftMessage: updated.draft_message,
        threadId: updated.thread_id,
        originSnapshot: updated.origin_snapshot,
        action: decisionResult.action
          ? {
              id: decisionResult.action.id,
              threadId: decisionResult.action.thread_id,
              title: decisionResult.action.title,
              description: decisionResult.action.description,
              dueAt: decisionResult.action.due_at.toISOString(),
              status: decisionResult.action.status,
              origin: decisionResult.action.origin,
            }
          : null,
      });
    }
  );
};
