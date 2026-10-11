/**
 * vps-configure-waha-channels.ts
 *
 * Configura as credenciais de criptografia (AES-256-GCM) para os canais WAHA
 * no Postgres e alinha os webhooks no container WAHA na VPS.
 */

import crypto from "node:crypto";
import { Client } from "pg";

const MASTER_KEY_HEX =
  process.env.APP_MASTER_KEY ||
  process.env.MCT_CREDENTIALS_MASTER_KEY ||
  "4a8f9c1e2d3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f";

const WAHA_API_KEY = process.env.WAHA_API_KEY || "mct_sos_waha_master_2026";
const WAHA_INTERNAL_URL = process.env.WAHA_INTERNAL_URL || "http://sos-sales-waha:3000";
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || "http://chat-sales-api:4400";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://sos_user:sos_sales_master_2026@127.0.0.1:5432/sos_sales_v3";

function encryptPayload(data: string, masterKeyHex: string) {
  const keyBuffer = Buffer.from(masterKeyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(data, "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedBase64: ciphertext.toString("base64"),
    ivBase64: iv.toString("base64"),
    authTagBase64: authTag.toString("base64"),
  };
}

interface WahaChannelConfig {
  channelId: string;
  workspaceId: string;
  sessionName: string;
  phoneE164: string;
  displayName: string;
  credentialId: string;
}

const WAHA_CHANNELS: WahaChannelConfig[] = [
  {
    channelId: "1217962d-c8ed-417e-9863-f22d6f8f03ef",
    workspaceId: "11111111-1111-1111-1111-111111111111",
    sessionName: "default",
    phoneE164: "+554988447562",
    displayName: "WhatsApp (Francisco Taveira)",
    credentialId: "d1111111-1111-1111-1111-111111111111",
  },
  {
    channelId: "d51e4c8d-165c-48fa-9961-d15355b42a5d",
    workspaceId: "22222222-2222-2222-2222-222222222222",
    sessionName: "haven",
    phoneE164: "+554988370054",
    displayName: "WhatsApp (Haven Escovaria)",
    credentialId: "d2222222-2222-2222-2222-222222222222",
  },
  {
    channelId: "fba12c92-84d3-493f-a98e-2aba9179723b",
    workspaceId: "33333333-3333-3333-3333-333333333333",
    sessionName: "sora",
    phoneE164: "+5549988902028",
    displayName: "WhatsApp Sora",
    credentialId: "d3333333-3333-3333-3333-333333333333",
  },
];

async function main() {
  console.log(`[Config WAHA] Conectando ao Postgres em ${DATABASE_URL.replace(/:[^:]*@/, ":***@")}...`);
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    for (const ch of WAHA_CHANNELS) {
      console.log(`\n--- Configurando Canal: ${ch.displayName} (${ch.phoneE164}) ---`);

      const rawCredPayload = JSON.stringify({
        api_key: WAHA_API_KEY,
        webhook_secret: WAHA_API_KEY,
        session: ch.sessionName,
        base_url: WAHA_INTERNAL_URL,
      });

      const encrypted = encryptPayload(rawCredPayload, MASTER_KEY_HEX);

      // Inserir ou atualizar provider_credentials
      await client.query(
        `INSERT INTO public.provider_credentials (
           id, workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, key_version, status, updated_at
         ) VALUES ($1, $2, 'waha', $3, $4, $5, $6, 'v1', 'ACTIVE', NOW())
         ON CONFLICT (workspace_id, provider, account_id) DO UPDATE SET
           encrypted_payload = EXCLUDED.encrypted_payload,
           iv = EXCLUDED.iv,
           auth_tag = EXCLUDED.auth_tag,
           key_version = EXCLUDED.key_version,
           status = EXCLUDED.status,
           updated_at = NOW();`,
        [
          ch.credentialId,
          ch.workspaceId,
          ch.sessionName,
          encrypted.encryptedBase64,
          encrypted.ivBase64,
          encrypted.authTagBase64,
        ]
      );
      console.log(`  ✓ Credencial gravada em provider_credentials (account_id: ${ch.sessionName})`);

      // Obter id real da credencial (caso tenha sido inserida ou atualizada via conflict)
      const credRes = await client.query(
        `SELECT id FROM public.provider_credentials WHERE workspace_id = $1 AND provider = 'waha' AND account_id = $2;`,
        [ch.workspaceId, ch.sessionName]
      );
      const effectiveCredId = credRes.rows[0].id;

      // Inserir ou atualizar channel_instance com a credential_id e status conectado
      const tokenHash = crypto.createHash("sha256").update(`chan-${ch.channelId}`).digest("hex");
      await client.query(
        `INSERT INTO public.channel_instances (
           id, workspace_id, provider, display_name, phone_number_e164,
           endpoint_token_hash, credential_id, is_active, status, updated_at
         ) VALUES ($1, $2, 'waha', $3, $4, $5, $6, true, 'connected', NOW())
         ON CONFLICT (id) DO UPDATE SET
           credential_id = EXCLUDED.credential_id,
           endpoint_token_hash = EXCLUDED.endpoint_token_hash,
           status = 'connected',
           is_active = true,
           updated_at = NOW();`,
        [ch.channelId, ch.workspaceId, ch.displayName, ch.phoneE164, tokenHash, effectiveCredId]
      );
      console.log(`  ✓ Canal ${ch.channelId} gravado/vinculado à credencial ${effectiveCredId} com endpoint chan-${ch.channelId}`);

      // Atualizar configuração do webhook na sessão WAHA
      const webhookUrl = `${API_INTERNAL_URL}/v1/webhooks/whatsapp/chan-${ch.channelId}`;
      console.log(`  → Alinhando webhook no WAHA: ${webhookUrl}`);

      try {
        const wahaRes = await fetch(`${WAHA_INTERNAL_URL}/api/sessions/${ch.sessionName}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": WAHA_API_KEY,
          },
          body: JSON.stringify({
            name: ch.sessionName,
            config: {
              webhooks: [
                {
                  url: webhookUrl,
                  events: ["message", "message.any", "session.status"],
                  customHeaders: [
                    { name: "x-api-key", value: WAHA_API_KEY }
                  ]
                }
              ]
            }
          }),
        });

        if (wahaRes.ok) {
          const wahaJson = await wahaRes.json();
          console.log(`  ✓ WAHA sessão '${ch.sessionName}' atualizada com sucesso (status: ${wahaJson.status})`);
        } else {
          console.warn(`  ⚠️ Falha ao atualizar webhook no WAHA (${wahaRes.status}): ${await wahaRes.text()}`);
        }
      } catch (wahaErr) {
        console.warn(`  ⚠️ Erro ao comunicar com WAHA:`, wahaErr instanceof Error ? wahaErr.message : wahaErr);
      }
    }

    console.log("\n[Config WAHA] Todos os canais configurados com sucesso!");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Erro fatal ao configurar canais WAHA:", err);
  process.exit(1);
});
