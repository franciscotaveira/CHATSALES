import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { enqueuePixConfirmationMessage } from "../services/pix-notification";
import type { PixChargeRecord, PoolClient } from "@sos-sales/database";

describe("Pix Notification Service (Automatic WhatsApp Celebration Receipt)", () => {
  const workspaceId = crypto.randomUUID();
  const threadId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  const chargeId = crypto.randomUUID();

  const mockCharge: PixChargeRecord = {
    id: chargeId,
    workspace_id: workspaceId,
    thread_id: threadId,
    contact_id: contactId,
    product_id: null,
    title: "Mentoria de Vendas High-Ticket",
    amount_cents: 199700, // R$ 1.997,00
    currency: "BRL",
    pix_code: "000201...",
    pix_qr_url: "https://example.com/qr.png",
    status: "PAID",
    verification_method: "MANUAL_CASHIER",
    verified_by_user_id: crypto.randomUUID(),
    verified_at: new Date(),
    verification_notes: "Conferido no extrato bancário",
    expires_at: new Date(Date.now() + 3600000),
    paid_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  it("returns null when thread or contact channel is not found", async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    } as unknown as PoolClient;

    const result = await enqueuePixConfirmationMessage(mockClient, workspaceId, mockCharge);
    expect(result).toBeNull();
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it("does not invent a sender or enqueue a message when the channel phone is missing",async()=>{
    const mockClient={query:vi.fn().mockResolvedValue({rows:[{channel_instance_id:crypto.randomUUID(),provider:"waha",channel_phone:null,contact_phone:"+5500999900001"}]})} as unknown as PoolClient;
    expect(await enqueuePixConfirmationMessage(mockClient,workspaceId,mockCharge)).toBeNull();
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it("enqueues celebratory message into public.messages and outbox command into public.outbound_commands", async () => {
    const channelInstanceId = crypto.randomUUID();
    const createdMsgId = crypto.randomUUID();

    const mockClient = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes("FROM public.commercial_threads t")) {
          return Promise.resolve({
            rows: [
              {
                channel_instance_id: channelInstanceId,
                provider: "evolution",
                channel_phone: "+5549999990000",
                contact_phone: "+5549988887777",
              },
            ],
          });
        }
        if (sql.includes("INSERT INTO public.messages")) {
          return Promise.resolve({
            rows: [{ id: createdMsgId }],
          });
        }
        if (sql.includes("INSERT INTO public.outbound_commands")) {
          return Promise.resolve({
            rows: [],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as PoolClient;

    const result = await enqueuePixConfirmationMessage(mockClient, workspaceId, mockCharge);

    expect(result).toBe(createdMsgId);
    expect(mockClient.query).toHaveBeenCalledTimes(5);

    // Verify messages insert call
    const msgCall = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls[3]!;
    expect(msgCall[0]).toContain("INSERT INTO public.messages");
    const msgParams = msgCall[1];
    expect(msgParams[0]).toBe(workspaceId);
    expect(msgParams[1]).toBe(channelInstanceId);
    expect(msgParams[2]).toBe(threadId);
    expect(msgParams[3]).toBe("evolution");
    expect(msgParams[6]).toContain("🎉 *PAGAMENTO CONFIRMADO!*");
    expect(msgParams[6]).toContain("Mentoria de Vendas High-Ticket");

    // Verify outbox command insert call
    const outboxCall = (mockClient.query as ReturnType<typeof vi.fn>).mock.calls[4]!;
    expect(outboxCall[0]).toContain("INSERT INTO public.outbound_commands");
    const outboxParams = outboxCall[1];
    expect(outboxParams[0]).toBe(workspaceId);
    expect(outboxParams[1]).toBe(channelInstanceId);
    expect(outboxParams[3]).toBe(createdMsgId);
    expect(outboxParams[4]).toBe("+5549988887777");
    expect(outboxParams[6]).toBe(`pix-confirm-${chargeId}`);
  });
});
