import crypto from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import {
  verifyAbacatePayWebhookSignature,
  createAbacatePayBilling,
  reconcileAbacatePaySettlement,
} from "../services/abacatepay.service";

describe("AbacatePay Service Suite", () => {
  const secret = "abacate_sec_1234567890abcdef12345678";

  describe("verifyAbacatePayWebhookSignature", () => {
    it("validates authentic HMAC-SHA256 signature header", () => {
      const rawBody = Buffer.from(JSON.stringify({ event: "billing.paid", data: { id: "bill_1" } }));
      const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

      const valid = verifyAbacatePayWebhookSignature({
        secret,
        rawBody,
        signatureHeader: hmac,
      });

      expect(valid).toBe(true);
    });

    it("validates signature with sha256= prefix", () => {
      const rawBody = Buffer.from(JSON.stringify({ event: "billing.paid", data: { id: "bill_2" } }));
      const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

      const valid = verifyAbacatePayWebhookSignature({
        secret,
        rawBody,
        signatureHeader: `sha256=${hmac}`,
      });

      expect(valid).toBe(true);
    });

    it("rejects forged or altered signature", () => {
      const rawBody = Buffer.from(JSON.stringify({ event: "billing.paid", data: { id: "bill_tampered" } }));

      const valid = verifyAbacatePayWebhookSignature({
        secret,
        rawBody,
        signatureHeader: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      });

      expect(valid).toBe(false);
    });

    it("validates constant-time query secret fallback", () => {
      const valid = verifyAbacatePayWebhookSignature({
        secret,
        querySecret: secret,
      });

      expect(valid).toBe(true);
    });

    it("rejects invalid query secret", () => {
      const valid = verifyAbacatePayWebhookSignature({
        secret,
        querySecret: "wrong_secret_123",
      });

      expect(valid).toBe(false);
    });

    it("fails closed when secret is empty or too short", () => {
      const valid = verifyAbacatePayWebhookSignature({
        secret: "short",
        querySecret: "short",
      });

      expect(valid).toBe(false);
    });
  });

  describe("createAbacatePayBilling", () => {
    it("sends standard payload and maps billing response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: "bill_mock_123",
            url: "https://abacatepay.com/pay/bill_mock_123",
            amount: 5000,
            status: "PENDING",
            pix: {
              code: "00020126580014br.gov.bcb.pix0136abacate...",
              qrCode: "data:image/png;base64,iVBORw0KGgo...",
            },
          },
        }),
      });

      const result = await createAbacatePayBilling({
        apiKey: "api_key_test_123",
        amountCents: 5000,
        title: "Kit Adesivos Chapecó",
        customer: {
          name: "João Silva",
          cellphone: "+5549999990000",
          email: "joao@email.com",
          taxId: "123.456.789-00",
        },
        metadata: {
          workspaceId: "ws-1",
          threadId: "th-1",
        },
        fetchFn: mockFetch as any,
      });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.abacatepay.com/v1/billing/create");
      expect(init.headers["Authorization"]).toBe("Bearer api_key_test_123");

      const body = JSON.parse(init.body);
      expect(body.frequency).toBe("ONE_TIME");
      expect(body.methods).toEqual(["PIX"]);
      expect(body.products[0].price).toBe(5000);
      expect(body.customer.taxId).toBe("12345678900");

      expect(result.id).toBe("bill_mock_123");
      expect(result.url).toBe("https://abacatepay.com/pay/bill_mock_123");
      expect(result.pixCode).toContain("00020126580014br.gov.bcb.pix");
    });

    it("throws descriptive error on HTTP 400/401/500 from AbacatePay", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized token",
      });

      await expect(
        createAbacatePayBilling({
          apiKey: "invalid_key",
          amountCents: 1000,
          title: "Teste",
          fetchFn: mockFetch as any,
        })
      ).rejects.toThrow(/ABACATEPAY_ERROR_401/);
    });
  });

  describe("reconcileAbacatePaySettlement", () => {
    it("settles charge, accepts linked proposal, advances journey, and enriches fiscal contact", async () => {
      const queries: Array<{ sql: string; params: any[] }> = [];

      const mockClient: any = {
        query: vi.fn(async (sql: string, params: any[]) => {
          queries.push({ sql, params });

          // Advisory lock
          if (sql.includes("pg_advisory_xact_lock")) return { rows: [] };

          // Idempotency receipt
          if (sql.includes("integration_event_receipts")) {
            return { rows: [{ event_key: "evt_1:bill_100" }] };
          }

          // Locate charge
          if (sql.includes("SELECT * FROM public.pix_charges")) {
            return {
              rows: [
                {
                  id: "11111111-1111-1111-1111-111111111111",
                  workspace_id: "ws-test",
                  thread_id: "th-test",
                  contact_id: "ct-test",
                  proposal_id: "prop-test",
                  amount_cents: 9900,
                  status: "PENDING",
                  title: "Serviço Película",
                  currency: "BRL",
                  verification_method: "UNVERIFIED",
                },
              ],
            };
          }

          // Update charge
          if (sql.includes("UPDATE public.pix_charges")) {
            return {
              rows: [
                {
                  id: "11111111-1111-1111-1111-111111111111",
                  status: "PAID",
                  amount_cents: 9900,
                  currency: "BRL",
                  verification_method: "BANK_WEBHOOK",
                  proposal_id: "prop-test",
                  contact_id: "ct-test",
                  thread_id: "th-test",
                },
              ],
            };
          }

          // External confirmation
          if (sql.includes("external_payment_confirmations")) {
            return { rows: [] };
          }

          // Proposal query
          if (sql.includes("SELECT id, status, journey_id")) {
            return {
              rows: [
                {
                  id: "prop-test",
                  status: "sent",
                  journey_id: "j-test",
                  total_cents: 9900,
                  currency: "BRL",
                },
              ],
            };
          }

          // Proposal update
          if (sql.includes("UPDATE public.commercial_proposals")) {
            return { rows: [] };
          }

          // Journey update
          if (sql.includes("UPDATE public.commercial_journeys")) {
            return { rows: [] };
          }

          // Outcome insert
          if (sql.includes("commercial_outcomes")) {
            return { rows: [] };
          }

          // Contacts fiscal update
          if (sql.includes("UPDATE public.contacts")) {
            return { rows: [] };
          }

          // Audit events
          if (sql.includes("INSERT INTO public.audit_events")) {
            return { rows: [] };
          }

          // Channel thread query for post-sale
          if (sql.includes("commercial_threads")) {
            return { rows: [{ id: "chan-1" }] };
          }

          // Outbound command insert
          if (sql.includes("outbound_commands")) {
            return { rows: [] };
          }

          return { rows: [] };
        }),
      };

      const res = await reconcileAbacatePaySettlement(mockClient, {
        workspaceId: "ws-test",
        eventId: "evt_1",
        billingId: "bill_100",
        paidAmountCents: 9900,
        customerData: {
          taxId: "000.111.222-33",
          email: "cliente@teste.com",
        },
        metadata: {
          chargeId: "11111111-1111-1111-1111-111111111111",
        },
      });

      expect(res.alreadySettled).toBe(false);
      expect(res.proposalAccepted).toBe(true);
      expect(res.charge.status).toBe("PAID");

      // Verify proposal was updated to accepted
      const propUpdate = queries.find((q) => q.sql.includes("UPDATE public.commercial_proposals"));
      expect(propUpdate).toBeDefined();

      // Verify commercial outcome won was recorded
      const outcomeInsert = queries.find((q) => q.sql.includes("INSERT INTO public.commercial_outcomes"));
      expect(outcomeInsert).toBeDefined();

      // Verify contact was enriched with fiscal data
      const contactUpdate = queries.find((q) => q.sql.includes("UPDATE public.contacts"));
      expect(contactUpdate).toBeDefined();
      expect(contactUpdate?.params[1]).toBe("000.111.222-33");
    });
  });
});
