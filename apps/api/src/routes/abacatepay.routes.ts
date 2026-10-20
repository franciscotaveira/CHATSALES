import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createPixCharge,
  getCommercialProposalById,
  type PixChargeRecord,
} from "@sos-sales/database";
import { logger } from "@sos-sales/observability";
import {
  getAbacatePayConfig,
  createAbacatePayBilling,
} from "../services/abacatepay.service";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const threadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const proposalParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  proposalId: z.string().uuid(),
});

const updateConfigSchema = z.object({
  apiKey: z.string().min(10).max(255).optional().nullable(),
  webhookSecret: z.string().min(8).max(255).optional().nullable(),
  enabled: z.boolean().optional(),
});

const createThreadBillingSchema = z.object({
  contactId: z.string().uuid(),
  title: z.string().min(1).max(120),
  amountCents: z.number().int().min(100).max(2147483647), // Mínimo R$ 1,00
  productId: z.string().uuid().nullable().optional(),
  requestKey: z.string().uuid().optional(),
});

export const abacatePayRoutes: FastifyPluginAsync = async (app) => {
  // 1. Get AbacatePay configuration status (redacted)
  app.get(
    "/v1/workspaces/:workspaceId/abacatepay/config",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsed = workspaceParamsSchema.safeParse(request.params);
      if (!parsed.success) return reply.code(400).send({ detail: "workspaceId inválido" });

      const { workspaceId } = parsed.data;
      const config = await withTenantTransaction(workspaceId, async (client) => {
        return getAbacatePayConfig(client, workspaceId);
      });

      return reply.code(200).send({
        enabled: config.enabled,
        isConfigured: Boolean(config.apiKey),
        hasWebhookSecret: Boolean(config.webhookSecret),
        maskedApiKey: config.apiKey
          ? `${config.apiKey.slice(0, 4)}...${config.apiKey.slice(-4)}`
          : null,
      });
    }
  );

  // 2. Update AbacatePay configuration (API Key, Webhook Secret, Enabled toggle)
  app.patch(
    "/v1/workspaces/:workspaceId/abacatepay/config",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      const parsedBody = updateConfigSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.code(400).send({ detail: "Dados de configuração inválidos" });
      }

      const { workspaceId } = parsedParams.data;
      const body = parsedBody.data;

      await withTenantTransaction(workspaceId, async (client) => {
        const updates: string[] = [];
        const values: unknown[] = [];
        let idx = 1;

        if (body.apiKey !== undefined) {
          updates.push(`abacatepay_api_key = $${idx++}`);
          values.push(body.apiKey);
        }
        if (body.webhookSecret !== undefined) {
          updates.push(`abacatepay_webhook_secret = $${idx++}`);
          values.push(body.webhookSecret);
        }
        if (body.enabled !== undefined) {
          updates.push(`abacatepay_enabled = $${idx++}`);
          values.push(body.enabled);
        }

        if (updates.length > 0) {
          updates.push("updated_at = clock_timestamp()");
          values.push(workspaceId);
          await client.query(
            `UPDATE public.workspaces SET ${updates.join(", ")} WHERE id = $${idx}`,
            values
          );

          await client.query(
            `INSERT INTO public.audit_events (workspace_id, actor_id, actor_type, action, resource_type, resource_id, metadata)
             VALUES ($1, $2, 'user', 'workspace.abacatepay_config_updated', 'workspace', $1, $3::jsonb)`,
            [
              workspaceId,
              request.user.id,
              JSON.stringify({
                hasApiKey: Boolean(body.apiKey),
                hasWebhookSecret: Boolean(body.webhookSecret),
                enabled: body.enabled,
              }),
            ]
          );
        }
      });

      return reply.code(200).send({ success: true });
    }
  );

  // 3. Create AbacatePay billing in a conversation thread
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/abacatepay/billings",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      const parsedBody = createThreadBillingSchema.safeParse(request.body);

      if (!parsedParams.success || !parsedBody.success) {
        return reply.code(400).send({ detail: "Parâmetros ou payload da cobrança inválidos" });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const body = parsedBody.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          const config = await getAbacatePayConfig(client, workspaceId);
          if (!config.apiKey || !config.enabled) {
            throw new Error("ABACATEPAY_NOT_CONFIGURED: Gateway AbacatePay não está ativo ou chave ausente.");
          }

          // Fetch contact details for fiscal/customer metadata
          const contactRes = await client.query<{
            name: string | null;
            phone_e164: string;
            metadata: Record<string, any> | null;
          }>(
            `SELECT name, phone_e164, metadata FROM public.contacts WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, body.contactId]
          );
          const contact = contactRes.rows[0];

          // Create billing on AbacatePay API
          const billing = await createAbacatePayBilling({
            apiKey: config.apiKey,
            amountCents: body.amountCents,
            title: body.title,
            customer: {
              name: contact?.name || undefined,
              cellphone: contact?.phone_e164 || undefined,
              email: contact?.metadata?.fiscal?.email || contact?.metadata?.email || undefined,
              taxId: contact?.metadata?.fiscal?.cpf_cnpj || undefined,
            },
            metadata: {
              workspaceId,
              threadId,
              contactId: body.contactId,
              productId: body.productId || "",
            },
          });

          // Insert into pix_charges with AbacatePay gateway references
          const charge = await createPixCharge(client, {
            workspaceId,
            threadId,
            contactId: body.contactId,
            productId: body.productId,
            title: body.title,
            amountCents: body.amountCents,
            pixCode: billing.pixCode || undefined,
            pixQrUrl: billing.pixQrCode || undefined,
            gatewayProvider: "abacatepay",
            gatewayChargeId: billing.id,
            gatewayCheckoutUrl: billing.url,
          });

          return { charge, billing };
        });

        const amountFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: result.charge.currency,
        }).format(result.charge.amount_cents / 100);

        return reply.code(201).send({
          charge: {
            id: result.charge.id,
            workspaceId: result.charge.workspace_id,
            threadId: result.charge.thread_id,
            contactId: result.charge.contact_id,
            productId: result.charge.product_id,
            title: result.charge.title,
            amountCents: result.charge.amount_cents,
            amountFormatted,
            currency: result.charge.currency,
            pixCode: result.charge.pix_code,
            pixQrUrl: result.charge.pix_qr_url,
            status: result.charge.status,
            gatewayProvider: "abacatepay",
            gatewayChargeId: result.billing.id,
            gatewayCheckoutUrl: result.billing.url,
            expiresAt: result.charge.expires_at.toISOString(),
            createdAt: result.charge.created_at.toISOString(),
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("ABACATEPAY_NOT_CONFIGURED")) {
          return reply.code(422).send({ detail: message });
        }
        logger.error({ err, workspaceId, threadId }, "Failed to create AbacatePay billing");
        return reply.code(502).send({ detail: "Falha na comunicação com gateway de pagamento AbacatePay." });
      }
    }
  );

  // 4. Create AbacatePay charge directly for a commercial proposal
  app.post(
    "/v1/workspaces/:workspaceId/proposals/:proposalId/abacatepay-charge",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
      ],
    },
    async (request, reply) => {
      const parsedParams = proposalParamsSchema.safeParse(request.params);
      if (!parsedParams.success) return reply.code(400).send({ detail: "Parâmetros inválidos" });

      const { workspaceId, proposalId } = parsedParams.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          const config = await getAbacatePayConfig(client, workspaceId);
          if (!config.apiKey || !config.enabled) {
            throw new Error("ABACATEPAY_NOT_CONFIGURED: Gateway AbacatePay não está ativo ou chave ausente.");
          }

          const prop = await getCommercialProposalById(client, workspaceId, proposalId);
          if (!prop) throw new Error("PROPOSAL_NOT_FOUND: Proposta não encontrada.");

          if (["cancelled", "rejected", "expired"].includes(prop.status)) {
            throw new Error(`INVALID_PROPOSAL_STATE: Proposta está '${prop.status}'.`);
          }

          const contactRes = await client.query<{
            name: string | null;
            phone_e164: string;
            metadata: Record<string, any> | null;
          }>(
            `SELECT name, phone_e164, metadata FROM public.contacts WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, prop.contact_id]
          );
          const contact = contactRes.rows[0];

          const billing = await createAbacatePayBilling({
            apiKey: config.apiKey,
            amountCents: prop.total_cents,
            title: prop.title,
            customer: {
              name: contact?.name || undefined,
              cellphone: contact?.phone_e164 || undefined,
              email: contact?.metadata?.fiscal?.email || contact?.metadata?.email || undefined,
              taxId: contact?.metadata?.fiscal?.cpf_cnpj || undefined,
            },
            metadata: {
              workspaceId,
              proposalId: prop.id,
              threadId: prop.thread_id,
              contactId: prop.contact_id,
            },
          });

          const charge = await createPixCharge(client, {
            workspaceId,
            threadId: prop.thread_id,
            contactId: prop.contact_id,
            proposalId: prop.id,
            title: prop.title,
            amountCents: prop.total_cents,
            currency: prop.currency,
            pixCode: billing.pixCode || undefined,
            pixQrUrl: billing.pixQrCode || undefined,
            gatewayProvider: "abacatepay",
            gatewayChargeId: billing.id,
            gatewayCheckoutUrl: billing.url,
          });

          return { proposal: prop, charge, billing };
        });

        return reply.code(201).send({
          proposal: result.proposal,
          charge: {
            ...result.charge,
            gatewayProvider: "abacatepay",
            gatewayChargeId: result.billing.id,
            gatewayCheckoutUrl: result.billing.url,
          },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("PROPOSAL_NOT_FOUND")) return reply.code(404).send({ detail: message });
        if (message.includes("ABACATEPAY_NOT_CONFIGURED")) return reply.code(422).send({ detail: message });
        if (message.includes("INVALID_PROPOSAL_STATE")) return reply.code(409).send({ detail: message });
        logger.error({ err, workspaceId, proposalId }, "Failed to create AbacatePay charge for proposal");
        return reply.code(502).send({ detail: "Falha ao gerar cobrança AbacatePay para proposta." });
      }
    }
  );
};
