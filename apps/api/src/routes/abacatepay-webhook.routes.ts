import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction } from "@sos-sales/database";
import { logger } from "@sos-sales/observability";
import {
  getAbacatePayConfig,
  verifyAbacatePayWebhookSignature,
  reconcileAbacatePaySettlement,
} from "../services/abacatepay.service";

const MAX_BODY_BYTES = 64 * 1024;

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const webhookQuerySchema = z.object({
  webhookSecret: z.string().min(8).max(128).optional(),
});

const webhookPayloadSchema = z.object({
  event: z.string().min(1).max(100),
  devMode: z.boolean().optional(),
  data: z.object({
    id: z.string().min(1).max(200),
    amount: z.number().optional(),
    status: z.string().optional(),
    customer: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        cellphone: z.string().optional(),
        taxId: z.string().optional(),
      })
      .optional(),
    metadata: z.record(z.string()).optional(),
  }),
});

const problem = (
  reply: import("fastify").FastifyReply,
  request: import("fastify").FastifyRequest,
  status: number,
  slug: string,
  title: string,
  detail: string
) =>
  reply.status(status).send({
    type: `https://sos-sales.mct.br/errors/${slug}`,
    title,
    status,
    detail,
    instance: request.url,
    correlationId: request.id,
  });

export const abacatePayWebhookRoutes: FastifyPluginAsync = async (app) => {
  // Handler for tenant-scoped webhook: POST /v1/webhooks/abacatepay/:workspaceId
  app.post("/v1/webhooks/abacatepay/:workspaceId", async (request, reply) => {
    const parsedParams = workspaceParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "workspaceId inválido");
    }

    const { workspaceId } = parsedParams.data;
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "Corpo da requisição vazio");
    }

    if (rawBody.length > MAX_BODY_BYTES) {
      return problem(reply, request, 413, "payload-too-large", "Payload Too Large", "Payload superior a 64KB");
    }

    const queryParsed = webhookQuerySchema.safeParse(request.query);
    const querySecret = queryParsed.success ? queryParsed.data.webhookSecret : undefined;

    const signatureHeader =
      (request.headers["x-webhook-signature"] as string | undefined) ||
      (request.headers["abacatepay-signature"] as string | undefined);

    // Resolve secret inside tenant context
    const config = await withTenantTransaction(workspaceId, async (client) => {
      return getAbacatePayConfig(client, workspaceId);
    });

    const expectedSecret = config.webhookSecret;
    if (!expectedSecret || expectedSecret.length < 8) {
      logger.error({ workspaceId, correlationId: request.id }, "AbacatePay webhook secret not configured");
      return problem(reply, request, 503, "service-unavailable", "Service Unavailable", "Webhook do AbacatePay não configurado neste ambiente");
    }

    const isValid = verifyAbacatePayWebhookSignature({
      secret: expectedSecret,
      rawBody,
      signatureHeader,
      querySecret,
    });

    if (!isValid) {
      logger.warn({ workspaceId, correlationId: request.id }, "AbacatePay webhook signature verification failed");
      return problem(reply, request, 401, "unauthorized", "Unauthorized", "Assinatura do webhook inválida");
    }

    const parsedPayload = webhookPayloadSchema.safeParse(request.body);
    if (!parsedPayload.success) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "Estrutura do payload inválida");
    }

    const { event, data } = parsedPayload.data;
    const isPaidEvent =
      event === "billing.paid" ||
      event === "charge.paid" ||
      data.status?.toUpperCase() === "PAID";

    if (!isPaidEvent) {
      logger.info({ workspaceId, event, billingId: data.id }, "AbacatePay non-settlement event ignored");
      return reply.code(200).send({ received: true, ignored: true, event });
    }

    const eventId = `abacate_${data.id}_${event}_${Date.now()}`;

    try {
      const result = await withTenantTransaction(workspaceId, async (client) => {
        return reconcileAbacatePaySettlement(client, {
          workspaceId,
          eventId,
          billingId: data.id,
          paidAmountCents: data.amount ? Math.round(data.amount) : undefined,
          customerData: data.customer,
          metadata: data.metadata,
        });
      });

      return reply.status(200).send({
        received: true,
        status: result.alreadySettled ? "already_settled" : "settled",
        chargeId: result.charge.id,
        proposalAccepted: result.proposalAccepted,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("COBRANCA_NOT_FOUND")) {
        return problem(reply, request, 404, "not-found", "Not Found", message);
      }
      logger.error({ err, workspaceId, billingId: data.id }, "AbacatePay settlement error");
      throw err;
    }
  });

  // Global fallback endpoint: POST /v1/webhooks/abacatepay (resolves workspaceId from metadata)
  app.post("/v1/webhooks/abacatepay", async (request, reply) => {
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "Corpo da requisição vazio");
    }

    const parsedPayload = webhookPayloadSchema.safeParse(request.body);
    if (!parsedPayload.success) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "Estrutura do payload inválida");
    }

    const { data } = parsedPayload.data;
    const targetWorkspaceId = data.metadata?.workspaceId;

    if (!targetWorkspaceId || !z.string().uuid().safeParse(targetWorkspaceId).success) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "workspaceId ausente nos metadados da cobrança");
    }

    // Re-route internally to tenant handler logic
    const config = await withTenantTransaction(targetWorkspaceId, async (client) => {
      return getAbacatePayConfig(client, targetWorkspaceId);
    });

    const expectedSecret = config.webhookSecret;
    if (!expectedSecret) {
      return problem(reply, request, 503, "service-unavailable", "Service Unavailable", "Webhook do AbacatePay não configurado neste ambiente");
    }

    const signatureHeader =
      (request.headers["x-webhook-signature"] as string | undefined) ||
      (request.headers["abacatepay-signature"] as string | undefined);

    const queryParsed = webhookQuerySchema.safeParse(request.query);
    const querySecret = queryParsed.success ? queryParsed.data.webhookSecret : undefined;

    const isValid = verifyAbacatePayWebhookSignature({
      secret: expectedSecret,
      rawBody,
      signatureHeader,
      querySecret,
    });

    if (!isValid) {
      return problem(reply, request, 401, "unauthorized", "Unauthorized", "Assinatura do webhook inválida");
    }

    const isPaid =
      parsedPayload.data.event === "billing.paid" ||
      parsedPayload.data.event === "charge.paid" ||
      data.status?.toUpperCase() === "PAID";

    if (!isPaid) {
      return reply.code(200).send({ received: true, ignored: true });
    }

    const result = await withTenantTransaction(targetWorkspaceId, async (client) => {
      return reconcileAbacatePaySettlement(client, {
        workspaceId: targetWorkspaceId,
        eventId: `abacate_${data.id}_${Date.now()}`,
        billingId: data.id,
        paidAmountCents: data.amount ? Math.round(data.amount) : undefined,
        customerData: data.customer,
        metadata: data.metadata,
      });
    });

    return reply.status(200).send({
      received: true,
      status: result.alreadySettled ? "already_settled" : "settled",
      chargeId: result.charge.id,
      proposalAccepted: result.proposalAccepted,
    });
  });
};
