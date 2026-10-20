import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  confirmPixChargeBankWebhook,
} from "@sos-sales/database";
import { enqueuePixConfirmationMessage } from "../services/pix-notification";

const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 64 * 1024;

/** Anti-replay store abstraction. In-memory adapter (no schema change); swap for Redis when approved. */
export interface PixWebhookReplayStore {
  /** Returns true when the key is new (and records it); false when already seen. */
  claim(key: string, ttlMs: number): boolean;
}

export class InMemoryReplayStore implements PixWebhookReplayStore {
  private readonly seen = new Map<string, number>();

  claim(key: string, ttlMs: number): boolean {
    const now = Date.now();
    for (const [k, expiresAt] of this.seen) {
      if (expiresAt <= now) this.seen.delete(k);
    }
    if (this.seen.has(key)) return false;
    this.seen.set(key, now + ttlMs);
    return true;
  }
}

export interface PixWebhookRoutesOptions {
  /** HMAC secret. Falls back to PIX_WEBHOOK_SECRET. Absent => fail-closed 503. */
  secret?: string;
  replayStore?: PixWebhookReplayStore;
  now?: () => number;
}

const paramsSchema = z.object({ workspaceId: z.string().uuid() });

const eventSchema = z
  .object({
    eventId: z.string().min(8).max(128).regex(/^[a-zA-Z0-9_-]+$/),
    chargeId: z.string().uuid(),
    amountCents: z.number().int().min(1),
    status: z.literal("PAID"),
  })
  .strict();

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
    instance: "/v1/webhooks/pix/[redacted]",
    correlationId: request.id,
  });

function signatureMatches(secret: string, timestamp: string, rawBody: Buffer, provided: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const given = Buffer.from(provided, "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * POST /v1/webhooks/pix/:workspaceId — PSP payment notification.
 * Auth: HMAC-SHA256 over `${x-psp-timestamp}.${rawBody}` in `x-psp-signature` (hex), timing-safe.
 * Anti-replay: timestamp window (±5 min) + one-time eventId. Idempotent settlement.
 */
export const pixWebhookRoutes: FastifyPluginAsync<PixWebhookRoutesOptions> = async (app, options) => {
  // Database receipts are transactional and durable across API instances/restarts.
  const now = options.now ?? Date.now;

  app.post("/v1/webhooks/pix/:workspaceId", async (request, reply) => {
    const secret = options.secret ?? process.env.PIX_WEBHOOK_SECRET;
    if (!secret || secret.length < 32) {
      request.log.error({ correlationId: request.id }, "Pix webhook secret not configured (fail-closed)");
      return problem(reply, request, 503, "service-unavailable", "Service Unavailable", "Pix webhook not configured");
    }

    const parsedParams = paramsSchema.safeParse(request.params);
    const rawBody = request.rawBody;
    if (!parsedParams.success || !rawBody || rawBody.length === 0) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "Invalid request");
    }
    if (rawBody.length > MAX_BODY_BYTES) {
      return problem(reply, request, 413, "payload-too-large", "Payload Too Large", "Payload too large");
    }

    const timestamp = String(request.headers["x-psp-timestamp"] ?? "");
    const signature = String(request.headers["x-psp-signature"] ?? "");
    const tsMs = Number(timestamp) * 1000;
    if (
      !/^\d{10}$/.test(timestamp) ||
      !signature ||
      !signatureMatches(secret, timestamp, rawBody, signature) ||
      Math.abs(now() - tsMs) > SIGNATURE_WINDOW_MS
    ) {
      return problem(reply, request, 401, "unauthorized", "Unauthorized", "Invalid webhook signature");
    }

    const parsedEvent = eventSchema.safeParse(request.body);
    if (!parsedEvent.success) {
      return problem(reply, request, 400, "bad-request", "Bad Request", "Invalid event payload");
    }
    const event = parsedEvent.data;
    const { workspaceId } = parsedParams.data;

    try {
      const payloadHash = crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex");
      const result = await withTenantTransaction(workspaceId, async (client) => {
        const inserted = await client.query(
          `INSERT INTO public.integration_event_receipts(workspace_id,provider,event_key,payload_hash)
           VALUES ($1,'pix',$2,$3) ON CONFLICT DO NOTHING RETURNING event_key`,
          [workspaceId,event.eventId,payloadHash]
        );
        if (!inserted.rows.length) {
          const previous = await client.query<{payload_hash:string}>("SELECT payload_hash FROM public.integration_event_receipts WHERE workspace_id=$1 AND provider='pix' AND event_key=$2", [workspaceId,event.eventId]);
          if (previous.rows[0]?.payload_hash !== payloadHash) throw new Error("COBRANCA_INVALID_STATE: Event identity conflict");
          return { duplicate: true as const };
        }
        const res = await confirmPixChargeBankWebhook(client, {
          workspaceId,
          chargeId: event.chargeId,
          paidAmountCents: event.amountCents,
          providerEventId: event.eventId,
        });

        if (!res.alreadySettled) {
          // Settlement is a financial fact, not an automatic commercial win.
          // Do not invent a human actor or choose a journey by contact alone.
          // Enqueue celebratory payment confirmation message to WhatsApp thread
          await enqueuePixConfirmationMessage(client, workspaceId, res.charge);
        }

        return res;
      });
      if ("duplicate" in result) return reply.code(200).send({ received: true, status: "duplicate" });
      return reply.status(200).send({
        received: true,
        status: result.alreadySettled ? "already_settled" : "settled",
        chargeId: result.charge.id,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message.startsWith("COBRANCA_NOT_FOUND")) {
        return problem(reply, request, 404, "not-found", "Not Found", "Charge not found");
      }
      if (message.startsWith("COBRANCA_AMOUNT_MISMATCH") || message.startsWith("COBRANCA_INVALID_STATE")) {
        return problem(reply, request, 409, "conflict", "Conflict", "Charge cannot be settled");
      }
      throw err;
    }
  });
};
