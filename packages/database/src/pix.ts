import type { PoolClient } from "pg";
import QRCode from "qrcode";

export type PixChargeStatus = "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
export type PixVerificationMethod = "UNVERIFIED" | "MANUAL_CASHIER" | "BANK_WEBHOOK";

export interface PixChargeRecord {
  id: string;
  workspace_id: string;
  thread_id: string;
  contact_id: string;
  product_id: string | null;
  title: string;
  amount_cents: number;
  currency: string;
  proposal_id?: string | null;
  pix_code: string;
  pix_qr_url: string | null;
  status: PixChargeStatus;
  verification_method: PixVerificationMethod;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  verification_notes: string | null;
  expires_at: Date;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
  gateway_provider?: "bacen_native" | "abacatepay" | "cakto" | null;
  gateway_charge_id?: string | null;
  gateway_checkout_url?: string | null;
}

export interface CreatePixChargeParams {
  workspaceId: string;
  threadId: string;
  contactId: string;
  productId?: string | null;
  proposalId?: string | null;
  title: string;
  amountCents: number;
  currency?: string;
  expiresMinutes?: number;
  gatewayProvider?: "bacen_native" | "abacatepay" | "cakto";
  gatewayChargeId?: string | null;
  gatewayCheckoutUrl?: string | null;
  pixCode?: string;
  pixQrUrl?: string | null;
}

/**
 * Standard CRC-16/CCITT-FALSE (EMVCo & BACEN Pix BR Code standard)
 * Polynomial: 0x1021, Initial: 0xFFFF, No reflection, Final XOR: 0x0000
 */
export function calculateCRC16CCITT(payload: string): string {
  let crc = 0xFFFF;
  const polynomial = 0x1021;
  const buffer = Buffer.from(payload, "utf-8");

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i] ?? 0;
    crc ^= (byte << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Validates a Pix Copia e Cola / BR Code string according to BACEN specs
 */
export function validatePixCopiaECola(payload: string): { isValid: boolean; error?: string } {
  if (!payload || typeof payload !== "string" || payload.length < 25) {
    return { isValid: false, error: "Payload muito curto para ser um BR Code válido." };
  }
  if (!payload.startsWith("000201")) {
    return { isValid: false, error: "Cabeçalho EMV Payload Format Indicator inválido (esperado '000201')." };
  }
  const crcIndex = payload.lastIndexOf("6304");
  if (crcIndex === -1 || crcIndex !== payload.length - 8) {
    return { isValid: false, error: "Tag de CRC 6304 não encontrada na posição final correta." };
  }
  const dataToVerify = payload.substring(0, crcIndex + 4);
  const expectedCrc = payload.substring(crcIndex + 4).toUpperCase();
  const calculatedCrc = calculateCRC16CCITT(dataToVerify);
  if (expectedCrc !== calculatedCrc) {
    return {
      isValid: false,
      error: `Checksum CRC16 inválido. Esperado: ${expectedCrc}, Calculado: ${calculatedCrc}.`,
    };
  }
  return { isValid: true };
}

function formatEMV(id: string, value: string): string {
  const len = String(Buffer.byteLength(value, "utf-8")).padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Generate a standard compliant BACEN Pix BR Code Copia e Cola payload with computed CRC16
 */
export function generatePixCopiaECola(params: {
  amountCents: number;
  title: string;
  chargeId: string;
  pixKey: string;
  merchantName?: string | null;
  merchantCity?: string | null;
}): string {
  if (!params.pixKey || !params.pixKey.trim()) {
    throw new Error("PIX_KEY_REQUIRED: Chave Pix válida é obrigatória para gerar Copia e Cola.");
  }

  const pixKey = params.pixKey.trim();
  const amountFormatted = (params.amountCents / 100).toFixed(2);
  const ref = params.chargeId.replace(/[^a-zA-Z0-9]/g, "").substring(0, 15) || "COBRANCA";
  const rawMerchant = (params.merchantName || "MCT SOS SALES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .substring(0, 25) || "MCT SOS SALES";
  const rawCity = (params.merchantCity || "CHAPECO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .substring(0, 15) || "CHAPECO";

  // Build Merchant Account Information (Tag 26)
  const mai = formatEMV("00", "br.gov.bcb.pix") + formatEMV("01", pixKey);

  // Build Additional Data Field Template (Tag 62)
  const addData = formatEMV("05", ref);

  // Build Payload without CRC
  const payloadWithoutCRC =
    formatEMV("00", "01") +
    formatEMV("26", mai) +
    formatEMV("52", "0000") +
    formatEMV("53", "986") +
    formatEMV("54", amountFormatted) +
    formatEMV("58", "BR") +
    formatEMV("59", rawMerchant) +
    formatEMV("60", rawCity) +
    formatEMV("62", addData) +
    "6304";

  // Calculate real CRC16-CCITT-FALSE
  const crc = calculateCRC16CCITT(payloadWithoutCRC);
  return `${payloadWithoutCRC}${crc}`;
}

export async function createPixCharge(
  client: PoolClient,
  params: CreatePixChargeParams
): Promise<PixChargeRecord> {
  const currency = params.currency || "BRL";
  const minutes = params.expiresMinutes || 30;
  const expiresAt = new Date(Date.now() + minutes * 60 * 1000);

  const idResult = await client.query("SELECT gen_random_uuid() as id");
  const chargeId = idResult.rows[0].id;

  let pixCode = params.pixCode;
  let pixQrUrl = params.pixQrUrl ?? null;

  if (!pixCode) {
    const wsRes = await client.query(
      "SELECT default_pix_key, default_pix_merchant_name, default_pix_merchant_city FROM public.workspaces WHERE id = $1",
      [params.workspaceId]
    );
    const wsRow = wsRes.rows[0];

    if (!wsRow?.default_pix_key || !wsRow.default_pix_key.trim()) {
      throw new Error(
        "PIX_KEY_NOT_CONFIGURED: Workspace não possui chave Pix configurada. Cadastre uma chave em Configurações antes de emitir cobranças."
      );
    }

    pixCode = generatePixCopiaECola({
      amountCents: params.amountCents,
      title: params.title,
      chargeId,
      pixKey: wsRow.default_pix_key,
      merchantName: wsRow.default_pix_merchant_name,
      merchantCity: wsRow.default_pix_merchant_city,
    });

    const validation = validatePixCopiaECola(pixCode);
    if (!validation.isValid) {
      throw new Error(`PIX_CODE_GENERATION_FAILED: ${validation.error}`);
    }
  }

  // Generate QR Code locally in-process as Data URL (zero call to api.qrserver.com)
  if (!pixQrUrl && pixCode) {
    pixQrUrl = await QRCode.toDataURL(pixCode, {
      width: 300,
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });
  }

  const result = await client.query(
    `
    INSERT INTO public.pix_charges (
      id,
      workspace_id,
      thread_id,
      contact_id,
      product_id,
      proposal_id,
      title,
      amount_cents,
      currency,
      pix_code,
      pix_qr_url,
      status,
      verification_method,
      expires_at,
      gateway_provider,
      gateway_charge_id,
      gateway_checkout_url
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING', 'UNVERIFIED', $12, $13, $14, $15)
    RETURNING *
  `,
    [
      chargeId,
      params.workspaceId,
      params.threadId,
      params.contactId,
      params.productId ?? null,
      params.proposalId ?? null,
      params.title,
      params.amountCents,
      currency,
      pixCode,
      pixQrUrl,
      expiresAt,
      params.gatewayProvider || "bacen_native",
      params.gatewayChargeId ?? null,
      params.gatewayCheckoutUrl ?? null,
    ]
  );

  const row = result.rows[0];

  // Automatically advance commercial journey to proposal stage
  await client.query(
    `UPDATE public.commercial_journeys
     SET stage = 'proposal',
         estimated_value_cents = GREATEST(estimated_value_cents, $1),
         updated_at = clock_timestamp()
     WHERE workspace_id = $2 AND (thread_id = $3 OR contact_id = $4)
       AND stage IN ('lead', 'qualified') AND status = 'open';`,
    [params.amountCents, params.workspaceId, params.threadId, params.contactId]
  );

  return {
    ...row,
    amount_cents: Number(row.amount_cents),
  };
}

export async function listPixChargesByThread(
  client: PoolClient,
  workspaceId: string,
  threadId: string
): Promise<PixChargeRecord[]> {
  const result = await client.query(
    `
    SELECT *
    FROM public.pix_charges
    WHERE workspace_id = $1 AND thread_id = $2
    ORDER BY created_at DESC
  `,
    [workspaceId, threadId]
  );

  return result.rows.map((row) => ({
    ...row,
    amount_cents: Number(row.amount_cents),
  }));
}

export async function getPixChargeById(
  client: PoolClient,
  workspaceId: string,
  chargeId: string
): Promise<PixChargeRecord | null> {
  const result = await client.query(
    `
    SELECT *
    FROM public.pix_charges
    WHERE workspace_id = $1 AND id = $2
    LIMIT 1
  `,
    [workspaceId, chargeId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    amount_cents: Number(row.amount_cents),
  };
}

export async function getPixChargeByGatewayId(
  client: PoolClient,
  workspaceId: string,
  gatewayChargeId: string
): Promise<PixChargeRecord | null> {
  const result = await client.query(
    `
    SELECT *
    FROM public.pix_charges
    WHERE workspace_id = $1 AND gateway_charge_id = $2
    LIMIT 1
  `,
    [workspaceId, gatewayChargeId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    amount_cents: Number(row.amount_cents),
  };
}

export interface ConfirmPixChargeManualParams {
  workspaceId: string;
  chargeId: string;
  actorUserId: string;
  verificationNotes?: string | null;
}

/**
 * Manually confirms payment receipt for a Pix charge (Cashier verification)
 * Strictly updates financial receipt state. Does NOT alter commercial journeys,
 * does NOT register commercial outcomes, and does NOT enqueue Meta CAPI.
 * Enforces human actor attribution and supports idempotent repeated/concurrent calls.
 */
export async function confirmPixChargeManual(
  client: PoolClient,
  params: ConfirmPixChargeManualParams
): Promise<{ charge: PixChargeRecord; alreadySettled?: boolean }> {
  if (!params.actorUserId || !params.actorUserId.trim()) {
    throw new Error("ACTOR_REQUIRED: Responsável pela conferência manual é obrigatório");
  }

  const updateResult = await client.query(
    `
    UPDATE public.pix_charges
    SET 
      status = 'PAID',
      verification_method = 'MANUAL_CASHIER',
      verified_by_user_id = $3,
      verified_at = now(),
      verification_notes = $4,
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
    WHERE workspace_id = $1 AND id = $2 AND status = 'PENDING'
    RETURNING *
  `,
    [
      params.workspaceId,
      params.chargeId,
      params.actorUserId.trim(),
      params.verificationNotes || "Conferência manual efetuada pelo atendente/caixa.",
    ]
  );

  if (updateResult.rows.length === 0) {
    const existing = await getPixChargeById(client, params.workspaceId, params.chargeId);
    if (!existing) {
      throw new Error("COBRANCA_NOT_FOUND: Cobrança Pix não encontrada");
    }
    if (existing.status === "PAID") {
      return { charge: existing, alreadySettled: true };
    }
    throw new Error(`COBRANCA_INVALID_STATE: Cobrança Pix já está com status ${existing.status}`);
  }

  const chargeRow = updateResult.rows[0];
  const charge: PixChargeRecord = {
    ...chargeRow,
    amount_cents: Number(chargeRow.amount_cents),
  };

  return { charge, alreadySettled: false };
}

export interface ConfirmPixChargeBankWebhookParams {
  workspaceId: string;
  chargeId: string;
  paidAmountCents: number;
  providerEventId: string;
}

/**
 * Settles a Pix charge from an authenticated PSP webhook (verification_method = BANK_WEBHOOK).
 * Idempotent (only PENDING -> PAID); rejects amount mismatches; no human actor is recorded.
 * Does NOT register commercial outcomes and does NOT enqueue Meta CAPI.
 */
export async function confirmPixChargeBankWebhook(
  client: PoolClient,
  params: ConfirmPixChargeBankWebhookParams
): Promise<{ charge: PixChargeRecord; alreadySettled: boolean }> {
  const existing = await getPixChargeById(client, params.workspaceId, params.chargeId);
  if (!existing) {
    throw new Error("COBRANCA_NOT_FOUND: Cobrança Pix não encontrada");
  }
  if (Number(existing.amount_cents) !== params.paidAmountCents) {
    throw new Error("COBRANCA_AMOUNT_MISMATCH: Valor pago difere do valor da cobrança");
  }

  const updated = await client.query(
    `
    UPDATE public.pix_charges
    SET
      status = 'PAID',
      verification_method = 'BANK_WEBHOOK',
      verified_at = now(),
      verification_notes = $3,
      paid_at = COALESCE(paid_at, now()),
      updated_at = now()
    WHERE workspace_id = $1 AND id = $2 AND status = 'PENDING'
    RETURNING *
  `,
    [params.workspaceId, params.chargeId, `PSP event ${params.providerEventId}`.slice(0, 200)]
  );

  if (updated.rows.length === 0) {
    if (existing.status === "PAID") {
      return { charge: existing, alreadySettled: true };
    }
    throw new Error(`COBRANCA_INVALID_STATE: Cobrança Pix já está com status ${existing.status}`);
  }

  const row = updated.rows[0];
  return { charge: { ...row, amount_cents: Number(row.amount_cents) }, alreadySettled: false };
}

/**
 * Backward compatibility alias for confirmPixChargeManual
 */
export async function markPixChargeAsPaid(
  client: PoolClient,
  workspaceId: string,
  chargeId: string,
  actorUserId?: string | null
): Promise<{ charge: PixChargeRecord; alreadySettled?: boolean }> {
  return confirmPixChargeManual(client, {
    workspaceId,
    chargeId,
    actorUserId: actorUserId || "00000000-0000-0000-0000-000000000000",
    verificationNotes: "Conferência manual via legado",
  });
}
