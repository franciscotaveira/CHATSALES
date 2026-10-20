import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createCommercialProposal,
  getCommercialProposalById,
  listCommercialProposalsForThread,
  updateCommercialProposalStatus,
  createProposalWithPixCharge,
  createPixCharge,
  recordCommercialOutcome,
  type CommercialProposalRecord,
  type PixChargeRecord,
  type CommercialProposalStatus,
} from "@sos-sales/database";

const workspaceThreadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const workspaceProposalParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  proposalId: z.string().uuid(),
});

const createProposalBodySchema = z.object({
  requestKey:z.string().uuid().optional(),
  contactId: z.string().uuid(),
  journeyId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  items: z
    .array(
      z.object({
        productId: z.string().uuid().optional().nullable(),
        title: z.string().trim().min(1).max(200).optional(),
        unitPriceCents: z.number().int().nonnegative().optional(),
        quantity: z.number().int().positive().default(1),
      })
    )
    .min(1),
  currency: z.string().length(3).default("BRL"),
  conditions: z.string().max(1000).optional().nullable(),
  validUntil: z.string().datetime().optional().nullable(),
  generatePixCharge: z.boolean().optional(),
  expiresMinutes: z.number().int().min(5).max(1440).optional(),
});

const patchProposalStatusBodySchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "rejected", "expired", "cancelled"] as const),
  expectedVersion: z.number({
    required_error: "expectedVersion is strictly required for proposal status transitions",
    invalid_type_error: "expectedVersion is strictly required for proposal status transitions",
  }).int().positive(),
  reason: z.string().max(500).optional().nullable(),
});

const createProposalPixChargeBodySchema = z.object({
  requestKey:z.string().uuid().optional(),
  expectedVersion:z.number().int().positive().optional(),
  expiresMinutes: z.number().int().min(5).max(1440).default(30).optional(),
});

function formatProposalResponse(p: CommercialProposalRecord) {
  return {
    id: p.id,
    workspaceId: p.workspace_id,
    threadId: p.thread_id,
    contactId: p.contact_id,
    journeyId: p.journey_id,
    title: p.title,
    status: p.status,
    items: p.items,
    totalCents: p.total_cents,
    currency: p.currency,
    conditions: p.conditions,
    validUntil: p.valid_until ? p.valid_until.toISOString() : null,
    sentAt: p.sent_at ? p.sent_at.toISOString() : null,
    acceptedAt: p.accepted_at ? p.accepted_at.toISOString() : null,
    rejectedAt: p.rejected_at ? p.rejected_at.toISOString() : null,
    cancelledAt: p.cancelled_at ? p.cancelled_at.toISOString() : null,
    createdByUserId: p.created_by_user_id,
    stateVersion: p.state_version ?? 1,
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
  };
}

function formatPixChargeResponse(c: PixChargeRecord) {
  const amountFormatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: c.currency,
  }).format(c.amount_cents / 100);

  return {
    id: c.id,
    workspaceId: c.workspace_id,
    threadId: c.thread_id,
    contactId: c.contact_id,
    proposalId: c.proposal_id ?? null,
    productId: c.product_id ?? null,
    title: c.title,
    amountCents: c.amount_cents,
    amountFormatted,
    currency: c.currency,
    pixCode: c.pix_code,
    pixQrUrl: c.pix_qr_url,
    status: c.status,
    expiresAt: c.expires_at.toISOString(),
    paidAt: c.paid_at?.toISOString() ?? null,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  };
}

export const commercialProposalsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List proposals for a thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/proposals",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:view"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceThreadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const proposals = await withTenantTransaction(workspaceId, async (client) => {
        return listCommercialProposalsForThread(client, workspaceId, threadId);
      });

      return reply.status(200).send({
        items: proposals.map(formatProposalResponse),
      });
    }
  );

  // 2. Create proposal for a thread (optionally with atomic Pix charge generation)
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/proposals",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceThreadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = createProposalBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid proposal creation payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const {proposal,pixCharge}=await withTenantTransaction(workspaceId,async client=>{
          const {requestKey,...terms}=data;
          const fingerprint=crypto.createHash("sha256").update(JSON.stringify({threadId,...terms})).digest("hex");
          if(requestKey){
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${workspaceId}:proposal:${requestKey}`]);
            const existing=(await client.query<{proposal_id:string;pix_charge_id:string|null;request_fingerprint:string}>("SELECT proposal_id,pix_charge_id,request_fingerprint FROM proposal_creation_requests WHERE workspace_id=$1 AND request_key=$2",[workspaceId,requestKey])).rows[0];
            if(existing){
              if(existing.request_fingerprint!==fingerprint)throw new Error("PROPOSAL_REQUEST_CONFLICT");
              const proposal=await getCommercialProposalById(client,workspaceId,existing.proposal_id);
              if(!proposal)throw new Error("Proposta registrada não está disponível para consulta.");
              const pixCharge=existing.pix_charge_id?(await client.query<PixChargeRecord>("SELECT * FROM pix_charges WHERE workspace_id=$1 AND id=$2",[workspaceId,existing.pix_charge_id])).rows[0]:undefined;
              return {proposal,pixCharge};
            }
          }
          const params={workspaceId,threadId,contactId:data.contactId,journeyId:data.journeyId,title:data.title,items:data.items,currency:data.currency,conditions:data.conditions,validUntil:data.validUntil,userId:request.user.id};
          const result=data.generatePixCharge?await createProposalWithPixCharge(client,{...params,expiresMinutes:data.expiresMinutes}):{proposal:await createCommercialProposal(client,params),pixCharge:undefined};
          if(requestKey)await client.query("INSERT INTO proposal_creation_requests(workspace_id,request_key,request_fingerprint,proposal_id,pix_charge_id) VALUES($1,$2,$3,$4,$5)",[workspaceId,requestKey,fingerprint,result.proposal.id,result.pixCharge?.id||null]);
          return result;
        });
        return reply.status(201).send({...formatProposalResponse(proposal),...(pixCharge?{pixCharge:formatPixChargeResponse(pixCharge)}:{})});
      } catch (err: unknown) {
        const error = err as Error;
        if(error.message==="PROPOSAL_REQUEST_CONFLICT")return reply.code(409).send({detail:"Esta solicitação já foi usada com outra proposta. Confira a lista antes de criar uma nova."});
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 3. Get proposal by ID
  app.get(
    "/v1/workspaces/:workspaceId/proposals/:proposalId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:view"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceProposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or proposalId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, proposalId } = parsedParams.data;

      const proposal = await withTenantTransaction(workspaceId, async (client) => {
        return getCommercialProposalById(client, workspaceId, proposalId);
      });

      if (!proposal) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Proposal ${proposalId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send(formatProposalResponse(proposal));
    }
  );

  // 4. Update proposal status (send, accept, reject, cancel) with optimistic concurrency
  app.patch(
    "/v1/workspaces/:workspaceId/proposals/:proposalId/status",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceProposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or proposalId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = patchProposalStatusBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail:
            parseResult.error.issues.map((i) => i.message).join(", ") ||
            "Invalid proposal status payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, proposalId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const updated = await withTenantTransaction(workspaceId, async (client) => {
          const proposal = await updateCommercialProposalStatus(client, workspaceId, proposalId, {
            status: data.status as CommercialProposalStatus,
            expectedVersion: data.expectedVersion,
            userId: request.user.id,
            reason: data.reason,
          });

          if (data.status === "accepted" && proposal.journey_id) {
            try {
              await recordCommercialOutcome(client, workspaceId, {
                journeyId: proposal.journey_id,
                status: "won",
                valueCents: proposal.total_cents,
                currency: proposal.currency,
                registeredByUserId: request.user.id,
                reason: data.reason || "Proposta aceita no cockpit",
              });
            } catch (outcomeErr) {
              request.log.warn({ err: outcomeErr }, "Could not record won outcome for accepted proposal");
            }
          } else if (data.status === "rejected" && proposal.journey_id) {
            try {
              await recordCommercialOutcome(client, workspaceId, {
                journeyId: proposal.journey_id,
                status: "lost",
                valueCents: proposal.total_cents,
                currency: proposal.currency,
                registeredByUserId: request.user.id,
                reason: data.reason || "Proposta rejeitada",
              });
            } catch (outcomeErr) {
              request.log.warn({ err: outcomeErr }, "Could not record lost outcome for rejected proposal");
            }
          }

          return proposal;
        });

        return reply.status(200).send(formatProposalResponse(updated));
      } catch (err: unknown) {
        const error = err as Error;
        const isNotFound = error.message.includes("PROPOSAL_NOT_FOUND");
        const isConflict =
          error.message.includes("OPTIMISTIC_LOCK_CONFLICT") ||
          error.message.includes("INVALID_TRANSITION");

        const statusCode = isNotFound ? 404 : isConflict ? 409 : 400;

        return reply.status(statusCode).send({
          type:
            statusCode === 404
              ? "https://sos-sales.mct.br/errors/not-found"
              : statusCode === 409
              ? "https://sos-sales.mct.br/errors/conflict"
              : "https://sos-sales.mct.br/errors/bad-request",
          title:
            statusCode === 404
              ? "Not Found"
              : statusCode === 409
              ? "Conflict"
              : "Bad Request",
          status: statusCode,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 5. Generate Pix Charge for an existing proposal
  app.post(
    "/v1/workspaces/:workspaceId/proposals/:proposalId/pix-charge",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceProposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or proposalId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = createProposalPixChargeBodySchema.safeParse(request.body || {});
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid proposal pix charge payload",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, proposalId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const { proposal, charge } = await withTenantTransaction(
          workspaceId,
          async (client) => {
            await client.query("SELECT id FROM commercial_proposals WHERE workspace_id=$1 AND id=$2 FOR UPDATE",[workspaceId,proposalId]);
            const prop = await getCommercialProposalById(client, workspaceId, proposalId);
            if (!prop) {
              throw new Error(`PROPOSAL_NOT_FOUND: Proposal ${proposalId} not found`);
            }

            const fingerprint=crypto.createHash("sha256").update(JSON.stringify({proposalId,expiresMinutes:data.expiresMinutes??30})).digest("hex");
            if(data.requestKey){
              await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${workspaceId}:${data.requestKey}`]);
              const receipt=(await client.query<PixChargeRecord&{request_fingerprint:string}>("SELECT p.*,r.request_fingerprint FROM pix_creation_requests r JOIN pix_charges p ON p.id=r.charge_id AND p.workspace_id=r.workspace_id WHERE r.workspace_id=$1 AND r.request_key=$2",[workspaceId,data.requestKey])).rows[0];
              if(receipt){if(receipt.request_fingerprint!==fingerprint)throw new Error("INVALID_PROPOSAL_STATE: A solicitação já foi usada com outros dados.");return {proposal:prop,charge:receipt};}
            }
            if(data.expectedVersion!==undefined&&prop.state_version!==data.expectedVersion)throw new Error("INVALID_PROPOSAL_STATE: A proposta mudou. Consulte a versão atual antes de emitir cobrança.");
            let expiresMinutes=data.expiresMinutes??30;
            if(prop.valid_until){
              const remainingMinutes=Math.floor((new Date(prop.valid_until).getTime()-Date.now())/60_000);
              if(!Number.isFinite(remainingMinutes)||remainingMinutes<5)throw new Error("INVALID_PROPOSAL_STATE: A proposta venceu ou tem menos de cinco minutos de validade. Revise a proposta antes de cobrar.");
              expiresMinutes=Math.min(expiresMinutes,remainingMinutes);
            }
            if (["cancelled", "rejected", "expired"].includes(prop.status)) {
              throw new Error(
                `INVALID_PROPOSAL_STATE: Não é possível emitir cobrança Pix para proposta com status '${prop.status}'.`
              );
            }

            const outstanding=(await client.query<PixChargeRecord>("SELECT * FROM pix_charges WHERE workspace_id=$1 AND proposal_id=$2 AND (status='PAID' OR (status='PENDING' AND expires_at>now())) ORDER BY CASE WHEN status='PAID' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE",[workspaceId,prop.id])).rows[0];
            if(outstanding){
              if(outstanding.status==='PAID')throw new Error("INVALID_PROPOSAL_STATE: Esta proposta já tem pagamento registrado. Confira as cobranças antes de emitir outra.");
              if(outstanding.amount_cents!==prop.total_cents||outstanding.currency!==prop.currency||(prop.valid_until&&new Date(outstanding.expires_at).getTime()>new Date(prop.valid_until).getTime()))throw new Error("INVALID_PROPOSAL_STATE: Existe cobrança pendente com condições diferentes. Revise as cobranças antes de continuar.");
              if(data.requestKey)await client.query("INSERT INTO pix_creation_requests(workspace_id,request_key,request_fingerprint,charge_id) VALUES($1,$2,$3,$4)",[workspaceId,data.requestKey,fingerprint,outstanding.id]);
              return {proposal:prop,charge:outstanding};
            }
            const pixCharge = await createPixCharge(client, {
              workspaceId,
              threadId: prop.thread_id,
              contactId: prop.contact_id,
              proposalId: prop.id,
              title: prop.title,
              amountCents: prop.total_cents,
              currency: prop.currency,
              expiresMinutes,
            });
            if(data.requestKey)await client.query("INSERT INTO pix_creation_requests(workspace_id,request_key,request_fingerprint,charge_id) VALUES($1,$2,$3,$4)",[workspaceId,data.requestKey,fingerprint,pixCharge.id]);

            return { proposal: prop, charge: pixCharge };
          }
        );

        return reply.status(201).send({
          proposal: formatProposalResponse(proposal),
          charge: formatPixChargeResponse(charge),
        });
      } catch (err: unknown) {
        const error = err as Error;
        const isNotFound = error.message.includes("PROPOSAL_NOT_FOUND");
        const isConflict = error.message.includes("INVALID_PROPOSAL_STATE");
        const statusCode = isNotFound ? 404 : isConflict ? 409 : 400;

        return reply.status(statusCode).send({
          type:
            statusCode === 404
              ? "https://sos-sales.mct.br/errors/not-found"
              : statusCode === 409
              ? "https://sos-sales.mct.br/errors/conflict"
              : "https://sos-sales.mct.br/errors/bad-request",
          title:
            statusCode === 404
              ? "Not Found"
              : statusCode === 409
              ? "Invalid Proposal State"
              : "Bad Request",
          status: statusCode,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
