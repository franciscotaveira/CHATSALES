import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createCommercialAction,
  getOpenCommercialAction,
  listCommercialActionsForThread,
  rescheduleCommercialAction,
  assignCommercialAction,
  completeCommercialAction,
  cancelCommercialAction,
  getCommercialActionHistory,
} from "@sos-sales/database";

const workspaceThreadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const workspaceActionParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  actionId: z.string().uuid(),
});

const createActionBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  dueAt: z.string().datetime(),
  assigneeUserId: z.string().uuid().optional().nullable(),
  origin: z.enum(["manual", "radar_suggestion", "system"]).default("manual"),
  journeyId: z.string().uuid().optional().nullable(),
});

const patchActionBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("complete"),
    reason: z.string().trim().min(1).max(1000).optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    reason: z.string().max(1000).optional().nullable(),
  }),
  z.object({
    action: z.literal("reschedule"),
    newDueAt: z.string().datetime(),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal("assign"),
    assigneeUserId: z.string().uuid().nullable(),
  }),
]);

export const commercialActionsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/workspaces/:workspaceId/action-assignees',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('cockpit:access')]},async(request,reply)=>{
    const parsed=z.object({workspaceId:z.string().uuid()}).safeParse(request.params);if(!parsed.success)return reply.code(400).send({detail:'Empresa inválida.'});
    const members=await withTenantTransaction(parsed.data.workspaceId,async client=>(await client.query<{user_id:string;name:string}>("SELECT m.user_id,u.name FROM workspace_memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.role IN ('owner','admin','manager','operator') ORDER BY u.name,m.user_id",[parsed.data.workspaceId])).rows);
    return {assignees:members.map(member=>({userId:member.user_id,name:member.name}))};
  });

  // 1. List actions for a specific thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/actions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceThreadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://chat-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Parâmetros inválidos",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const { actions, openAction } = await withTenantTransaction(workspaceId, async (client) => {
        const allActions = await listCommercialActionsForThread(client, workspaceId, threadId);
        const currentOpen = await getOpenCommercialAction(client, workspaceId, threadId);
        return { actions: allActions, openAction: currentOpen };
      });

      return reply.status(200).send({
        actions: actions.map((a) => ({
          id: a.id,
          workspaceId: a.workspace_id,
          threadId: a.thread_id,
          journeyId: a.journey_id,
          suggestionId: a.suggestion_id,
          title: a.title,
          description: a.description,
          assigneeUserId: a.assignee_user_id,
          dueAt: a.due_at.toISOString(),
          status: a.status,
          origin: a.origin,
          postponedCount: a.postponed_count,
          postponedReason: a.postponed_reason,
          postponedAt: a.postponed_at?.toISOString() ?? null,
          completedAt: a.completed_at?.toISOString() ?? null,
          completedByUserId: a.completed_by_user_id,
          cancelledAt: a.cancelled_at?.toISOString() ?? null,
          cancelledByUserId: a.cancelled_by_user_id,
          createdByUserId: a.created_by_user_id,
          createdAt: a.created_at.toISOString(),
          updatedAt: a.updated_at.toISOString(),
        })),
        openAction: openAction
          ? {
              id: openAction.id,
              workspaceId: openAction.workspace_id,
              threadId: openAction.thread_id,
              journeyId: openAction.journey_id,
              suggestionId: openAction.suggestion_id,
              title: openAction.title,
              description: openAction.description,
              assigneeUserId: openAction.assignee_user_id,
              dueAt: openAction.due_at.toISOString(),
              status: openAction.status,
              origin: openAction.origin,
              postponedCount: openAction.postponed_count,
              postponedReason: openAction.postponed_reason,
              createdAt: openAction.created_at.toISOString(),
            }
          : null,
      });
    }
  );

  // 2. Create Commercial Action for a thread
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/actions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceThreadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://chat-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Parâmetros inválidos",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseBody = createActionBodySchema.safeParse(request.body);
      if (!parseBody.success) {
        return reply.status(400).send({
          type: "https://chat-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const body = parseBody.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          return createCommercialAction(client, {
            workspaceId,
            threadId,
            journeyId: body.journeyId,
            title: body.title,
            description: body.description,
            dueAt: new Date(body.dueAt),
            assigneeUserId: body.assigneeUserId,
            origin: body.origin,
            createdByUserId: request.user.id,
          });
        });

        const action = result.action;
        const status = result.created ? 201 : 200;

        return reply.status(status).send({
          created: result.created,
          action: {
            id: action.id,
            workspaceId: action.workspace_id,
            threadId: action.thread_id,
            journeyId: action.journey_id,
            suggestionId: action.suggestion_id,
            title: action.title,
            description: action.description,
            assigneeUserId: action.assignee_user_id,
            dueAt: action.due_at.toISOString(),
            status: action.status,
            origin: action.origin,
            postponedCount: action.postponed_count,
            createdAt: action.created_at.toISOString(),
            updatedAt: action.updated_at.toISOString(),
          },
        });
      } catch (err: unknown) {
        const error = err as Error;
        const isAssigneeNotMember = error.message.includes("ASSIGNEE_NOT_MEMBER");
        const status = isAssigneeNotMember ? 400 : 409;
        return reply.status(status).send({
          type: "https://chat-sales.mct.br/errors/action-error",
          title: isAssigneeNotMember ? "Bad Request" : "Erro na Ação Comercial",
          status,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 3. Patch Commercial Action (complete, cancel, reschedule, assign)
  app.patch(
    "/v1/workspaces/:workspaceId/actions/:actionId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceActionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://chat-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Parâmetros inválidos",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseBody = patchActionBodySchema.safeParse(request.body);
      if (!parseBody.success) {
        return reply.status(400).send({
          type: "https://chat-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, actionId } = parsedParams.data;
      const payload = parseBody.data;

      try {
        const updated = await withTenantTransaction(workspaceId, async (client) => {
          if (payload.action === "complete") {
            return completeCommercialAction(client, workspaceId, actionId, {
              reason: payload.reason,
              userId: request.user.id,
            });
          } else if (payload.action === "cancel") {
            return cancelCommercialAction(client, workspaceId, actionId, {
              reason: payload.reason,
              userId: request.user.id,
            });
          } else if (payload.action === "reschedule") {
            return rescheduleCommercialAction(client, workspaceId, actionId, {
              newDueAt: new Date(payload.newDueAt),
              reason: payload.reason,
              userId: request.user.id,
            });
          } else if (payload.action === "assign") {
            return assignCommercialAction(client, workspaceId, actionId, {
              assigneeUserId: payload.assigneeUserId,
              userId: request.user.id,
            });
          }
          throw new Error("Ação não suportada");
        });

        return reply.status(200).send({
          action: {
            id: updated.id,
            workspaceId: updated.workspace_id,
            threadId: updated.thread_id,
            journeyId: updated.journey_id,
            suggestionId: updated.suggestion_id,
            title: updated.title,
            description: updated.description,
            assigneeUserId: updated.assignee_user_id,
            dueAt: updated.due_at.toISOString(),
            status: updated.status,
            origin: updated.origin,
            postponedCount: updated.postponed_count,
            postponedReason: updated.postponed_reason,
            postponedAt: updated.postponed_at?.toISOString() ?? null,
            completedAt: updated.completed_at?.toISOString() ?? null,
            cancelledAt: updated.cancelled_at?.toISOString() ?? null,
            updatedAt: updated.updated_at.toISOString(),
          },
        });
      } catch (err: unknown) {
        const error = err as Error;
        const isNotFound = error.message.includes("não encontrada");
        const isAssigneeNotMember = error.message.includes("ASSIGNEE_NOT_MEMBER");
        const status = isNotFound ? 404 : isAssigneeNotMember ? 400 : 409;
        return reply.status(status).send({
          type: "https://chat-sales.mct.br/errors/action-error",
          title: isAssigneeNotMember ? "Bad Request" : "Erro na Ação Comercial",
          status,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 4. Get Commercial Action History
  app.get(
    "/v1/workspaces/:workspaceId/actions/:actionId/history",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceActionParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://chat-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Parâmetros inválidos",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, actionId } = parsedParams.data;

      const history = await withTenantTransaction(workspaceId, async (client) => {
        return getCommercialActionHistory(client, workspaceId, actionId);
      });

      return reply.status(200).send({
        history: history.map((h) => ({
          id: h.id,
          actionId: h.action_id,
          actionType: h.action_type,
          previousDueAt: h.previous_due_at?.toISOString() ?? null,
          newDueAt: h.new_due_at?.toISOString() ?? null,
          previousAssigneeId: h.previous_assignee_id,
          newAssigneeId: h.new_assignee_id,
          reason: h.reason,
          createdByUserId: h.created_by_user_id,
          createdAt: h.created_at.toISOString(),
        })),
      });
    }
  );
};
