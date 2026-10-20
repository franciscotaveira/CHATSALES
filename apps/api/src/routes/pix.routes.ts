import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createPixCharge,
  type PixChargeRecord,
  listPixChargesByThread,
  confirmPixChargeManual,
} from "@sos-sales/database";
import { enqueuePixConfirmationMessage } from "../services/pix-notification";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const chargeParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  chargeId: z.string().uuid(),
});

const createChargeBodySchema = z.object({
  requestKey: z.string().uuid().optional(),
  contactId: z.string().uuid(),
  productId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120),
  amountCents: z.number().int().min(100).max(2147483647), // Mínimo R$ 1,00
  expiresMinutes: z.number().int().min(5).max(1440).default(30),
});

export const pixRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/workspaces/:workspaceId/threads/:threadId/checkout-requests',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('cockpit:access')]},async(request,reply)=>{
    const params=workspaceParamsSchema.safeParse(request.params),query=z.object({before:z.string().max(150).optional()}).strict().safeParse(request.query);
    if(!params.success||!query.success)return reply.code(400).send({detail:'Conversa ou página inválida.'});
    let beforeTime:string|null=null,beforeId:string|null=null;
    if(query.data.before){const parts=query.data.before.split('~');if(parts.length!==2||!z.string().datetime().safeParse(parts[0]).success||!z.string().uuid().safeParse(parts[1]).success)return reply.code(400).send({detail:'Página de resumos inválida.'});[beforeTime,beforeId]=parts as [string,string];}
    const {workspaceId,threadId}=params.data;
    return withTenantTransaction(workspaceId,async client=>{
      if(!(await client.query('SELECT id FROM commercial_threads WHERE workspace_id=$1 AND id=$2',[workspaceId,threadId])).rows.length)return reply.code(404).send({detail:'Conversa não encontrada.'});
      const rows=(await client.query(`SELECT r.*,p.stock_policy,c.created_at AS confirmed_at,
        to_char(r.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,
        (r.status='pending' AND r.valid_until<=clock_timestamp()) AS has_expired,
        EXISTS(SELECT 1 FROM messages m JOIN outbound_commands o ON o.workspace_id=m.workspace_id AND o.message_id=m.id WHERE m.workspace_id=r.workspace_id AND m.id=r.summary_message_id AND m.delivery_status IN ('sent','delivered','read') AND o.status='sent' AND o.external_message_id IS NOT NULL) AS summary_sent
        FROM ai_checkout_requests r JOIN products p ON p.workspace_id=r.workspace_id AND p.id=r.product_id
        LEFT JOIN messages c ON c.workspace_id=r.workspace_id AND c.id=r.confirmation_message_id
        WHERE r.workspace_id=$1 AND r.thread_id=$2 AND ($3::timestamptz IS NULL OR (r.created_at,r.id)<($3::timestamptz,$4::uuid))
        ORDER BY r.created_at DESC,r.id DESC LIMIT 21`,[workspaceId,threadId,beforeTime,beforeId])).rows;
      const items=rows.slice(0,20),last=items.at(-1);
      return {items:items.map(r=>({id:r.id,productTitle:r.product_title,retailerId:r.retailer_id,quantity:r.quantity,unitPriceCents:r.unit_price_cents,totalCents:r.total_cents,status:r.has_expired?'expired':r.status,validUntil:r.valid_until.toISOString(),createdAt:r.created_at.toISOString(),summarySent:r.summary_sent,confirmedAt:r.confirmed_at?.toISOString()??null,chargeId:r.charge_id,stockPolicy:r.stock_policy})),nextCursor:rows.length>20?`${last.cursor_time}~${last.id}`:null};
    });
  });

  // 1. Create a new Pix charge for a thread
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/pix-charges",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createChargeBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues[0]?.message || "Invalid payload",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const body = parsedBody.data;

      try {
        const charge = await withTenantTransaction(workspaceId, async (client) => {
          const fingerprint=crypto.createHash("sha256").update(JSON.stringify({threadId,contactId:body.contactId,productId:body.productId??null,title:body.title,amountCents:body.amountCents,expiresMinutes:body.expiresMinutes})).digest("hex");
          if(body.requestKey){
            await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`${workspaceId}:${body.requestKey}`]);
            const existing=(await client.query<PixChargeRecord&{request_fingerprint:string}>("SELECT p.*,r.request_fingerprint FROM pix_creation_requests r JOIN pix_charges p ON p.id=r.charge_id AND p.workspace_id=r.workspace_id WHERE r.workspace_id=$1 AND r.request_key=$2",[workspaceId,body.requestKey])).rows[0];
            if(existing){if(existing.request_fingerprint!==fingerprint)throw new Error("PIX_REQUEST_CONFLICT");return existing;}
          }
          const created=await createPixCharge(client, {
            workspaceId,
            threadId,
            contactId: body.contactId,
            productId: body.productId,
            title: body.title,
            amountCents: body.amountCents,
            expiresMinutes: body.expiresMinutes,
          });
          if(body.requestKey)await client.query("INSERT INTO pix_creation_requests(workspace_id,request_key,request_fingerprint,charge_id) VALUES($1,$2,$3,$4)",[workspaceId,body.requestKey,fingerprint,created.id]);
          return created;
        });

        const amountFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: charge.currency,
        }).format(charge.amount_cents / 100);

        return reply.status(201).send({
          charge: {
            id: charge.id,
            workspaceId: charge.workspace_id,
            threadId: charge.thread_id,
            contactId: charge.contact_id,
            productId: charge.product_id,
            proposalId: charge.proposal_id ?? null,
            title: charge.title,
            amountCents: charge.amount_cents,
            amountFormatted,
            currency: charge.currency,
            pixCode: charge.pix_code,
            pixQrUrl: charge.pix_qr_url,
            status: charge.status,
            expiresAt: charge.expires_at.toISOString(),
            paidAt: charge.paid_at?.toISOString() ?? null,
            createdAt: charge.created_at.toISOString(),
            updatedAt: charge.updated_at.toISOString(),
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if(message==="PIX_REQUEST_CONFLICT")return reply.code(409).send({detail:"Esta solicitação já foi usada para outra cobrança. Confira a lista antes de criar uma nova."});
        if (message.includes("PIX_KEY_NOT_CONFIGURED")) {
          return reply.status(422).send({
            type: "https://sos-sales.mct.br/errors/pix-key-not-configured",
            title: "Chave Pix Não Configurada",
            status: 422,
            detail: message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // 2. List Pix charges for a thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/pix-charges",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const charges = await withTenantTransaction(workspaceId, async (client) => {
        return listPixChargesByThread(client, workspaceId, threadId);
      });

      return reply.status(200).send({
        charges: charges.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          threadId: c.thread_id,
          contactId: c.contact_id,
          productId: c.product_id,
          proposalId: c.proposal_id ?? null,
          title: c.title,
          amountCents: c.amount_cents,
          amountFormatted: new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: c.currency,
          }).format(c.amount_cents / 100),
          currency: c.currency,
          pixCode: c.pix_code,
          pixQrUrl: c.pix_qr_url,
          status: c.status,
          verificationMethod: c.verification_method,
          verifiedByUserId: c.verified_by_user_id,
          verifiedAt: c.verified_at?.toISOString() ?? null,
          verificationNotes: c.verification_notes,
          expiresAt: c.expires_at.toISOString(),
          paidAt: c.paid_at?.toISOString() ?? null,
          createdAt: c.created_at.toISOString(),
          updatedAt: c.updated_at.toISOString(),
        })),
        total: charges.length,
      });
    }
  );

  // 3. Confirm Pix Payment (Manual settlement by operator / cashier)
  app.post(
    "/v1/workspaces/:workspaceId/pix-charges/:chargeId/confirm-payment",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
      ],
    },
    async (request, reply) => {
      const parsedParams = chargeParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or chargeId parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, chargeId } = parsedParams.data;
      const actorUserId = request.user?.id;
      if (!actorUserId) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Human actor user ID is strictly required for cashier settlement",
          instance: request.url,
          correlationId: request.id,
        });
      }

      try {
        const { charge, alreadySettled, notification } = await withTenantTransaction(
          workspaceId,
          async (client) => {
            const res = await confirmPixChargeManual(client, {
              workspaceId,
              chargeId,
              actorUserId,
              verificationNotes: "Conferência manual efetuada pelo operador",
            });

            // A financial receipt is not authority to choose or close a negotiation.
            // Commercial outcomes remain an explicit operation on the correct journey.
            const notification = res.alreadySettled ? "unchanged" :
              (await enqueuePixConfirmationMessage(client, workspaceId, res.charge) ? "queued" : "not_queued");
            return {...res,notification};
          }
        );

        const amountFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: charge.currency,
        }).format(charge.amount_cents / 100);

        return reply.status(200).send({
          success: true,
          alreadySettled: !!alreadySettled,
          notification,
          commercialOutcome: "unchanged",
          charge: {
            id: charge.id,
            proposalId: charge.proposal_id ?? null,
            status: charge.status,
            verificationMethod: charge.verification_method,
            verifiedByUserId: charge.verified_by_user_id,
            verifiedAt: charge.verified_at?.toISOString() ?? null,
            verificationNotes: charge.verification_notes,
            amountCents: charge.amount_cents,
            amountFormatted,
            paidAt: charge.paid_at?.toISOString() ?? null,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Settlement Error",
          status: 400,
          detail: message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
