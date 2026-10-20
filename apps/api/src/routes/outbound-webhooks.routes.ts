import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { z } from "zod";
import {
  withTenantTransaction,
  listOutboundWebhooks,
  getOutboundWebhookById,
  createOutboundWebhook,
  updateOutboundWebhook,
  deleteOutboundWebhook,
  recordWebhookDelivery,
  listWebhookDeliveries,
} from "@sos-sales/database";
import { safeFetchWithSsrfGuard, getInternalAllowedHosts } from "@sos-sales/application";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const webhookParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  webhookId: z.string().uuid(),
});

const createWebhookSchema = z.object({
  url: z.string().url().max(1024),
  description: z.string().max(255).optional().nullable(),
  events: z.array(z.string().min(1).max(100)).max(20).optional(),
  secret: z.string().min(16).max(128).optional(),
  supportsIdempotency: z.boolean().optional().default(false),
});

const updateWebhookSchema = z.object({
  url: z.string().url().max(1024).optional(),
  description: z.string().max(255).optional().nullable(),
  events: z.array(z.string().min(1).max(100)).max(20).optional(),
  is_active: z.boolean().optional(),
  expectedConfiguration: z.object({url:z.string().url().max(1024),events:z.array(z.string().min(1).max(100)).max(20),isActive:z.boolean()}).strict().optional(),
});

export const outboundWebhooksRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/workspaces/:workspaceId/webhooks
  app.get(
    "/v1/workspaces/:workspaceId/webhooks",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:view"),
      ],
    },
    async (request, reply) => {
      const { workspaceId } = workspaceParamsSchema.parse(request.params);

      const webhooks = await withTenantTransaction(workspaceId, async (client) => {
        return listOutboundWebhooks(client, workspaceId);
      });

      return reply.status(200).send({
        success: true,
        webhooks: webhooks.map(({secret,...webhook})=>["owner","admin"].includes(request.activeRole??"")?{...webhook,secret}:webhook),
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/webhooks
  app.post(
    "/v1/workspaces/:workspaceId/webhooks",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId } = workspaceParamsSchema.parse(request.params);
      const body = createWebhookSchema.parse(request.body);

      const secret = body.secret || `whsec_${crypto.randomBytes(24).toString("hex")}`;

      const webhook = await withTenantTransaction(workspaceId, async (client) => {
        return createOutboundWebhook(client, {
          workspaceId,
          url: body.url,
          secret,
          description: body.description,
          events: body.events,
          supportsIdempotency: body.supportsIdempotency,
        });
      });

      return reply.status(201).send({
        success: true,
        webhook,
      });
    }
  );

  // PATCH /v1/workspaces/:workspaceId/webhooks/:webhookId
  app.patch(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams=webhookParamsSchema.safeParse(request.params);
      const parsedBody=updateWebhookSchema.safeParse(request.body);
      if(!parsedParams.success||!parsedBody.success)return reply.code(400).send({title:"Dados inválidos",detail:"Revise o identificador e os dados da integração antes de confirmar."});
      const { workspaceId, webhookId } = parsedParams.data;
      const body = parsedBody.data;

      const result = await withTenantTransaction(workspaceId, async (client) => {
        // Serialize activation with configuration changes.
        await client.query("SELECT id FROM public.outbound_webhook_subscriptions WHERE workspace_id=$1 AND id=$2 FOR UPDATE", [workspaceId,webhookId]);
        const current=await getOutboundWebhookById(client,workspaceId,webhookId);
        if (!current) return {webhook:null};
        const expected=body.expectedConfiguration;
        if(expected&&(expected.url!==current.url||JSON.stringify(expected.events)!==JSON.stringify(current.events)||expected.isActive!==current.is_active))return {reviewConflict:true,webhook:null};
        const changed=(body.url !== undefined && body.url !== current.url) || (body.events !== undefined && JSON.stringify(body.events)!==JSON.stringify(current.events));
        if (body.is_active === true) {
          const fingerprint=crypto.createHash("sha256").update(JSON.stringify({url:current.url,events:current.events,supportsIdempotency:current.supports_idempotency})).digest("hex");
          const tested=await client.query("SELECT 1 FROM public.outbound_webhook_deliveries WHERE workspace_id=$1 AND subscription_id=$2 AND event_type='webhook.test' AND status='delivered' AND payload->>'configurationFingerprint'=$3 AND created_at>now()-interval '24 hours' LIMIT 1", [workspaceId,webhookId,fingerprint]);
          if(changed || !tested.rowCount) return {needsTest:true,webhook:null};
        }
        const webhook=await updateOutboundWebhook(client, {
          workspaceId,
          webhookId,
          url: body.url,
          description: body.description,
          events: body.events,
          is_active: changed ? false : body.is_active,
        });
        return {webhook};
      });
      if ("reviewConflict" in result) return reply.code(409).send({title:"Configuração alterada",detail:"O destino, os eventos ou o estado da integração mudaram. Atualize as integrações e revise novamente antes de confirmar."});
      if ("needsTest" in result) return reply.code(422).send({detail:"Teste com sucesso a configuração atual antes de ativar a integração."});
      const webhook=result.webhook;
      if (!webhook) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Webhook Not Found",
          status: 404,
          detail: "A assinatura de webhook especificada não foi encontrada.",
        });
      }

      return reply.status(200).send({
        success: true,
        webhook,
      });
    }
  );

  // DELETE /v1/workspaces/:workspaceId/webhooks/:webhookId
  app.delete(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);

      const deleted = await withTenantTransaction(workspaceId, async (client) => {
        return deleteOutboundWebhook(client, workspaceId, webhookId);
      });

      if (!deleted) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Webhook Not Found",
          status: 404,
          detail: "A assinatura de webhook especificada não foi encontrada.",
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Integração desativada. Histórico e pendências foram preservados.",
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/webhooks/:webhookId/test
  app.post(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId/test",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:manage"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);

      const webhook = await withTenantTransaction(workspaceId, async (client) => {
        return getOutboundWebhookById(client, workspaceId, webhookId);
      });

      if (!webhook) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Webhook Not Found",
          status: 404,
          detail: "A assinatura de webhook especificada não foi encontrada.",
        });
      }

      const deliveryId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const testPayload = {
        id: deliveryId,
        event: "webhook.test",
        configurationFingerprint: crypto.createHash("sha256").update(JSON.stringify({url:webhook.url,events:webhook.events,supportsIdempotency:webhook.supports_idempotency})).digest("hex"),
        timestamp,
        workspace_id: workspaceId,
        data: {
          message: "Ping de teste do SOS Vendas",
          system: "SOS Vendas v3",
          status: "connected",
        },
      };

      const payloadString = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac("sha256", webhook.secret)
        .update(payloadString)
        .digest("hex");

      const startTime = Date.now();
      let status: "delivered" | "failed" = "failed";
      let statusCode: number | null = null;
      let responseBody: string | null = null;
      let errorMessage: string | null = null;
      let durationMs = 0;

      try {
        const resp = await safeFetchWithSsrfGuard(
          webhook.url,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "ChatSales-Outbound-Webhook/3.0",
              "X-ChatSales-Signature-256": `sha256=${signature}`,
              "X-ChatSales-Event": "webhook.test",
              "X-ChatSales-Delivery": deliveryId,
            },
            body: payloadString,
          },
          {
            timeoutMs: 10000,
            allowLocalTest: process.env.NODE_ENV !== "production",
            allowedProtocols: ["http:", "https:"],
            allowedInternalHosts: getInternalAllowedHosts(),
          }
        );

        durationMs = Date.now() - startTime;
        statusCode = resp.status;
        const text = await resp.text();
        responseBody = text.slice(0, 1000);

        if (resp.ok) {
          status = "delivered";
        } else {
          status = "failed";
          errorMessage = `HTTP ${resp.status}: ${responseBody.slice(0, 200)}`;
        }
      } catch (err: unknown) {
        durationMs = Date.now() - startTime;
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
      }

      // Persist delivery log in DB
      await withTenantTransaction(workspaceId, async (client) => {
        return recordWebhookDelivery(client, {
          subscriptionId: webhook.id,
          workspaceId,
          eventType: "webhook.test",
          payload: testPayload,
          status,
          statusCode,
          responseBody,
          errorMessage,
          durationMs,
        });
      });

      return reply.status(200).send({
        success: status === "delivered",
        status,
        statusCode,
        durationMs,
        responseBody,
        errorMessage,
      });
    }
  );

  app.get("/v1/workspaces/:workspaceId/webhooks/:webhookId/jobs", {
    preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("integration:view")],
  }, async(request,reply)=>{
    const {workspaceId,webhookId}=webhookParamsSchema.parse(request.params);
    const query=z.object({beforeCreatedAt:z.string().datetime({offset:true}).optional(),beforeId:z.string().uuid().optional()}).strict().refine(value=>Boolean(value.beforeCreatedAt)===Boolean(value.beforeId)).safeParse(request.query);
    if(!query.success)return reply.status(400).send({message:"Cursor de eventos inválido. Atualize a consulta e tente novamente."});
    const rows=await withTenantTransaction(workspaceId,async client=>(await client.query(`SELECT id,event_type,status,attempts,next_attempt_at,error_message,created_at,updated_at,
      to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
      FROM public.outbound_webhook_jobs WHERE workspace_id=$1 AND subscription_id=$2
      AND ($3::timestamptz IS NULL OR (created_at,id)<($3::timestamptz,$4::uuid))
      ORDER BY created_at DESC,id DESC LIMIT 51`,[workspaceId,webhookId,query.data.beforeCreatedAt??null,query.data.beforeId??null])).rows);
    const page=rows.slice(0,50),last=page.at(-1),hasMore=rows.length>50;
    return reply.send({jobs:page.map(({cursor_created_at,...job})=>job),pagination:{hasMore,nextCursor:hasMore&&last?{createdAt:last.cursor_created_at,id:last.id}:null},dispatchEnabled:process.env.OUTBOUND_WEBHOOK_DISPATCH_ENABLED==="true"});
  });

  // GET /v1/workspaces/:workspaceId/webhooks/:webhookId/deliveries
  app.get(
    "/v1/workspaces/:workspaceId/webhooks/:webhookId/deliveries",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("integration:view"),
      ],
    },
    async (request, reply) => {
      const { workspaceId, webhookId } = webhookParamsSchema.parse(request.params);

      const deliveries = await withTenantTransaction(workspaceId, async (client) => {
        return listWebhookDeliveries(client, workspaceId, webhookId, 15);
      });

      return reply.status(200).send({
        success: true,
        deliveries,
      });
    }
  );
};
