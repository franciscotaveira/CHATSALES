import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { rawBodyPlugin } from "../plugins/raw-body.plugin";
import { abacatePayWebhookRoutes } from "../routes/abacatepay-webhook.routes";
import * as abacateService from "../services/abacatepay.service";
import * as databaseModule from "@sos-sales/database";

describe("AbacatePay Webhook Routes", () => {
  let app: ReturnType<typeof Fastify>;
  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const secret = "abacate_webhook_secret_test_32_bytes";

  beforeEach(async () => {
    app = Fastify();
    await app.register(rawBodyPlugin);
    await app.register(abacatePayWebhookRoutes);
    await app.ready();
  });

  it("returns 400 for invalid workspaceId parameter", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/webhooks/abacatepay/invalid-uuid",
      payload: { event: "billing.paid", data: { id: "bill_1" } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().title).toBe("Bad Request");
  });

  it("returns 400 when body is empty", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/abacatepay/${workspaceId}`,
      headers: { "content-type": "application/json" },
      payload: "",
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 503 when webhook secret is not configured", async () => {
    vi.spyOn(databaseModule, "withTenantTransaction").mockImplementation(async (_ws, callback: any) => {
      const mockClient: any = {};
      return callback(mockClient);
    });
    vi.spyOn(abacateService, "getAbacatePayConfig").mockResolvedValue({
      apiKey: null,
      webhookSecret: null,
      enabled: false,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/abacatepay/${workspaceId}`,
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ event: "billing.paid", data: { id: "bill_1" } }),
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().title).toBe("Service Unavailable");
  });

  it("returns 401 when signature and query secret are invalid", async () => {
    vi.spyOn(databaseModule, "withTenantTransaction").mockImplementation(async (_ws, callback: any) => {
      const mockClient: any = {};
      return callback(mockClient);
    });
    vi.spyOn(abacateService, "getAbacatePayConfig").mockResolvedValue({
      apiKey: "key",
      webhookSecret: secret,
      enabled: true,
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/abacatepay/${workspaceId}?webhookSecret=wrong_secret`,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": "bad_signature",
      },
      payload: JSON.stringify({ event: "billing.paid", data: { id: "bill_1" } }),
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().title).toBe("Unauthorized");
  });

  it("acknowledges non-settlement event with 200 ignored", async () => {
    vi.spyOn(databaseModule, "withTenantTransaction").mockImplementation(async (_ws, callback: any) => {
      const mockClient: any = {};
      return callback(mockClient);
    });
    vi.spyOn(abacateService, "getAbacatePayConfig").mockResolvedValue({
      apiKey: "key",
      webhookSecret: secret,
      enabled: true,
    });

    const body = JSON.stringify({
      event: "billing.created",
      data: { id: "bill_created_1", status: "PENDING" },
    });
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/abacatepay/${workspaceId}`,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signature,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true, ignored: true, event: "billing.created" });
  });

  it("processes billing.paid event and returns settlement details", async () => {
    vi.spyOn(databaseModule, "withTenantTransaction").mockImplementation(async (_ws, callback: any) => {
      const mockClient: any = {};
      return callback(mockClient);
    });
    vi.spyOn(abacateService, "getAbacatePayConfig").mockResolvedValue({
      apiKey: "key",
      webhookSecret: secret,
      enabled: true,
    });
    vi.spyOn(abacateService, "reconcileAbacatePaySettlement").mockResolvedValue({
      charge: { id: "charge-uuid-1", status: "PAID" } as any,
      proposalAccepted: true,
      alreadySettled: false,
    });

    const body = JSON.stringify({
      event: "billing.paid",
      data: {
        id: "bill_paid_1",
        amount: 15000,
        status: "PAID",
        customer: { name: "Cliente Teste", email: "cliente@teste.com" },
      },
    });
    const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");

    const res = await app.inject({
      method: "POST",
      url: `/v1/webhooks/abacatepay/${workspaceId}`,
      headers: {
        "content-type": "application/json",
        "x-webhook-signature": signature,
      },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.received).toBe(true);
    expect(json.status).toBe("settled");
    expect(json.chargeId).toBe("charge-uuid-1");
    expect(json.proposalAccepted).toBe(true);
  });
});
