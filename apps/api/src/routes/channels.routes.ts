import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import crypto from "node:crypto";
import {
  withTenantTransaction,
  encryptPayload,
  decryptPayload,
  parseKeyringFromEnv,
  recordSecurityAuditEvent,
} from "@sos-sales/database";
import {
  validateWahaBaseUrl,
  validateEvolutionBaseUrl,
  safeFetchWithSsrfGuard,
} from "@sos-sales/application";
import {assertMetaPhoneMembership} from "../services/meta-phone-membership.js";
import {checkMetaSubscription} from "../services/meta-subscription.js";
import { readWahaQr, activateWaha, mutateWaha, reviewWahaOperation } from "../services/waha-connection.js";
import { parseHistoryMessage, historyDate, historyPhone } from "../services/channel-history.js";
import { hasWorkspacePermission, META_GRAPH_API_VERSION } from "@sos-sales/contracts";

const channelRevisionExpression = "(extract(epoch FROM updated_at) * 1000000)::numeric(30,0)::text";
const channelChangeSchema = z.object({ expectedRevision: z.string().regex(/^[0-9]{10,30}$/) });
function channelConflict(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
async function lockChannelManager(client: Parameters<Parameters<typeof withTenantTransaction>[1]>[0], workspaceId: string, actorId: string) {
  const member = (await client.query<{ role: string }>("SELECT role FROM public.workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [workspaceId, actorId])).rows[0];
  if (!member || !hasWorkspacePermission(member.role, "workspace:manage")) throw channelConflict(403, "Seu acesso de gestão mudou. Atualize seu perfil antes de continuar.");
}

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const channelParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid(),
});

const channelCredentialsSchema = z.object({
  accessToken: z.string().optional(),
  phoneNumberId: z.string().optional(),
  wabaAccountId: z.string().optional(),
  appSecret: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  session: z.string().trim().min(1).max(150).refine(value=>Array.from(value).every(character=>character.charCodeAt(0)>=32&&![47,92,63,35,127].includes(character.charCodeAt(0))),"Nome da sessão contém caracteres não permitidos").optional(),
  instanceName: z.string().optional(),
});

const createChannelBodySchema = z.object({
  provider: z.enum(["meta_waba", "waha", "evolution", "meta_messenger", "meta_instagram"]),
  displayName: z.string().min(2).max(100),
  phoneNumberE164: z
    .string()
    .nullish()
    .transform((val) => {
      if (!val) return undefined;
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const digits = trimmed.replace(/\D/g, "");
      if (!digits) return undefined;
      if (digits.length === 10 || digits.length === 11) {
        return `+55${digits}`;
      }
      return `+${digits}`;
    })
    .pipe(z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number").optional()),
  endpointToken: z.string().min(16).optional(),
  credentials: channelCredentialsSchema.optional(),
  waacId: z.string().optional(),
  pmaId: z.string().optional(),
  businessPortfolioId: z.string().optional(),
});

const updateChannelStatusBodySchema = z.object({
  status: z.enum(["unconfigured", "validating", "pairing", "connected", "error", "revoked"]),
});

const metaEmbeddedSignupBodySchema = z.object({
  displayName: z.string().min(2).max(100),
  wabaAccountId: z.string().min(5),
  phoneNumberId: z.string().min(5),
  code: z.string().optional(),
  accessToken: z.string().optional(),
});

const testConnectionBodySchema = z.object({
  provider: z.enum(["meta_waba", "waha", "evolution"]),
  credentials: channelCredentialsSchema,
});

const listChannelsQuerySchema = z.object({
  includeInactive: z
    .string()
    .optional()
    .transform((val) => val === "true" || val === "1"),
});

export const channelsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List Channels for Workspace
  app.get(
    "/v1/workspaces/:workspaceId/channels",
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
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const parsedQuery = listChannelsQuerySchema.safeParse(request.query);
      const includeInactive = parsedQuery.success ? Boolean(parsedQuery.data.includeInactive) : false;

      const channels = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          meta_subscription_status: string;
          meta_subscription_checked_at: string|null;
          meta_billing_configured: boolean;
          meta_billing_account_id: string | null;
          created_at: string;
          updated_at: string;
          revision: string;
        }>(
          `SELECT id, workspace_id, provider, display_name, phone_number_e164, status, is_active, meta_subscription_status, meta_subscription_checked_at, meta_billing_configured, meta_billing_account_id, created_at, updated_at, ${channelRevisionExpression} AS revision
           FROM public.channel_instances
           WHERE workspace_id = $1
             AND ($2::boolean = true OR (status != 'revoked' AND is_active = true))
           ORDER BY created_at ASC;`,
          [workspaceId, includeInactive]
        );
        return res.rows;
      });

      return reply.status(200).send({
        channels: channels.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          provider: c.provider,
          displayName: c.display_name,
          phoneNumberE164: c.phone_number_e164,
          isActive: c.is_active,
          status: c.status,
          metaSubscriptionStatus: c.meta_subscription_status,
          metaSubscriptionCheckedAt: c.meta_subscription_checked_at,
          metaBillingConfigured: Boolean(c.meta_billing_configured),
          metaBillingAccountId: c.meta_billing_account_id || null,
          environment: process.env.APP_ENV === "lab" ? "lab" : process.env.NODE_ENV === "production" ? "production" : "unknown",
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          revision: c.revision,
        })),
        total: channels.length,
      });
    }
  );

  // 2. Test Connection with WhatsApp Provider before saving (Truth in Data: real I/O and SSRF validation)
  app.post(
    "/v1/workspaces/:workspaceId/channels/test-connection",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = testConnectionBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { provider, credentials } = parsedBody.data;

      if (provider === "meta_waba") {
        if (!credentials.phoneNumberId || !credentials.accessToken) {
          return reply.status(400).send({
            success: false,
            error: "Phone Number ID e Access Token são obrigatórios para validar a Meta Cloud API.",
          });
        }

        try {
          const url = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(
            credentials.phoneNumberId
          )}?fields=verified_name,code_verification_status,display_phone_number,quality_rating`;
          const resp = await safeFetchWithSsrfGuard(
            url,
            {
              headers: {
                Authorization: `Bearer ${credentials.accessToken}`,
              },
            },
            {
              timeoutMs: 8000,
              allowedProtocols: ["https:"],
            }
          );

          const data = (await resp.json()) as {
            id?: string;
            verified_name?: string;
            display_phone_number?: string;
            quality_rating?: string;
            code_verification_status?: string;
            error?: { message?: string };
          };

          if (!resp.ok) {
            return reply.status(200).send({
              success: false,
              error: data.error?.message || `Erro de validação Meta Graph API (HTTP ${resp.status})`,
            });
          }

          if (!data || data.id !== credentials.phoneNumberId) {
            return reply.status(200).send({success:false,error:"A Meta não confirmou o identificador do número consultado. Revise o Phone Number ID e o token."});
          }

          return reply.status(200).send({
            success: true,
            checkScope: "meta_phone_lookup",
            message: "Consulta do número na Meta concluída. Isso não confirma envio, recebimento, cobrança ou autorização da IA.",
            verifiedName: data.verified_name,
            displayPhoneNumber: data.display_phone_number,
            qualityRating: data.quality_rating,
            codeVerificationStatus: data.code_verification_status,
          });
        } catch (err: unknown) {
          const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
          if (isSsrf) {
            return reply.status(400).send({
              success: false,
              error: `SSRF_VIOLATION: ${(err as Error).message}`,
            });
          }
          return reply.status(200).send({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Tempo limite ou erro de rede ao conectar com a Meta Graph API.",
          });
        }
      }

      if (provider === "waha") {
        if (!credentials.baseUrl) {
          return reply.status(400).send({
            success: false,
            error: "URL Base da Instância é obrigatória para validar WAHA.",
          });
        }

        let targetBaseUrl: string;
        try {
          targetBaseUrl = validateWahaBaseUrl(
            credentials.baseUrl,
            process.env.NODE_ENV !== "production"
          );
        } catch (ssrfErr) {
          return reply.status(400).send({
            success: false,
            error:
              ssrfErr instanceof Error
                ? ssrfErr.message
                : "Validação SSRF falhou para a URL fornecida.",
          });
        }

        const allowLocal =
          process.env.NODE_ENV !== "production" ||
          process.env.ENABLE_LAB_SYNTHETIC === "true" ||
          process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

        try {
          const resp = await safeFetchWithSsrfGuard(
            `${targetBaseUrl}/api/server/version`,
            {
              headers: credentials.apiKey ? { "X-Api-Key": credentials.apiKey } : {},
            },
            {
              timeoutMs: 8000,
              allowLocalTest: allowLocal,
              allowedProtocols: ["http:", "https:"],
            }
          );

          if (!resp.ok) {
            return reply.status(200).send({
              success: false,
              error: `Falha na conexão com WAHA (HTTP ${resp.status})`,
            });
          }

          return reply.status(200).send({
            success: true,
            checkScope: "waha_server_reachability",
            message: "Servidor WAHA respondeu à consulta de versão. A sessão, o número e o envio de mensagens ainda precisam de verificação.",
          });
        } catch (err: unknown) {
          const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
          if (isSsrf) {
            return reply.status(400).send({
              success: false,
              error: `SSRF_VIOLATION: ${(err as Error).message}`,
            });
          }
          return reply.status(200).send({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Tempo limite ou erro de rede ao conectar com o serviço WAHA.",
          });
        }
      }

      if (provider === "evolution") {
        if (!credentials.baseUrl) {
          return reply.status(400).send({
            success: false,
            error: "URL Base da Instância é obrigatória para validar Evolution API.",
          });
        }

        let targetBaseUrl: string;
        try {
          targetBaseUrl = validateEvolutionBaseUrl(
            credentials.baseUrl,
            process.env.NODE_ENV !== "production"
          );
        } catch (ssrfErr) {
          return reply.status(400).send({
            success: false,
            error:
              ssrfErr instanceof Error
                ? ssrfErr.message
                : "Validação SSRF falhou para a URL fornecida.",
          });
        }

        const allowLocal =
          process.env.NODE_ENV !== "production" ||
          process.env.ENABLE_LAB_SYNTHETIC === "true" ||
          process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

        try {
          const resp = await safeFetchWithSsrfGuard(
            credentials.instanceName?.trim()
              ? `${targetBaseUrl}/instance/connectionState/${encodeURIComponent(credentials.instanceName.trim())}`
              : `${targetBaseUrl}/instance/fetchInstances`,
            {
              headers: credentials.apiKey ? { apikey: credentials.apiKey } : {},
            },
            {
              timeoutMs: 8000,
              allowLocalTest: allowLocal,
              allowedProtocols: ["http:", "https:"],
            }
          );

          if (!resp.ok) {
            return reply.status(200).send({
              success: false,
              error: `Falha na conexão com Evolution API (HTTP ${resp.status})`,
            });
          }

          if (credentials.instanceName?.trim()) {
            const proof = await resp.json() as {instance?:{instanceName?:unknown;state?:unknown}};
            const name=credentials.instanceName.trim();
            const state=proof?.instance?.state;
            if(proof?.instance?.instanceName!==name || typeof state!=="string" || !["open","close","connecting","qrcode"].includes(state)) {
              return reply.status(200).send({success:false,checkScope:"evolution_instance_state",error:"Evolution não confirmou o nome e o estado da instância solicitada. Revise o nome no servidor."});
            }
            const label=({open:"aberta no provedor",close:"fechada",connecting:"conectando",qrcode:"aguardando QR Code"} as Record<string,string>)[state];
            return reply.status(200).send({success:true,checkScope:"evolution_instance_state",instanceState:state,message:`Instância ${name}: ${label}. Esta consulta não confirma o número, não ativa o canal e não comprova envio ou recebimento.`});
          }

          return reply.status(200).send({
            success: true,
            checkScope: "evolution_instance_listing",
            message: "Evolution respondeu à consulta de instâncias. Isso não confirma a conexão de uma linha nem o envio de mensagens.",
          });
        } catch (err: unknown) {
          const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
          if (isSsrf) {
            return reply.status(400).send({
              success: false,
              error: `SSRF_VIOLATION: ${(err as Error).message}`,
            });
          }
          return reply.status(200).send({
            success: false,
            error:
              err instanceof Error
                ? err.message
                : "Tempo limite ou erro de rede ao conectar com a Evolution API.",
          });
        }
      }

      return reply.status(400).send({
        success: false,
        error: `Provider '${provider}' não suportado para teste de conexão`,
      });
    }
  );

  // 3. Create / Register Channel Instance (with optional automated encrypted credential provisioning)
  app.post(
    "/v1/workspaces/:workspaceId/channels",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createChannelBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { provider, displayName, phoneNumberE164, endpointToken, credentials } = parsedBody.data;

      // Generate a raw endpoint token if not provided, and hash it with SHA-256
      const rawToken = endpointToken ?? crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        await lockChannelManager(client,workspaceId,request.user.id);
        let credentialId: string | null = null;

        if (credentials) {
          const rawPayload =
            provider === "meta_waba"
              ? {
                  access_token: credentials.accessToken,
                  phone_number_id: credentials.phoneNumberId,
                  app_secret: credentials.appSecret,
                  waba_account_id: credentials.wabaAccountId,
                }
              : provider === "waha"
              ? {
                  api_key: credentials.apiKey,
                  base_url: credentials.baseUrl,
                  session: credentials.session?.trim() || `cs-${crypto.randomUUID()}`,
                  webhook_token: rawToken,
                  webhook_secret: crypto.randomBytes(32).toString("hex"),
                }
              : {
                  api_key: credentials.apiKey,
                  base_url: credentials.baseUrl,
                  instance_name: credentials.instanceName?.trim() || "default",
                };

          const envKeyring = parseKeyringFromEnv();
          let keyringOrKey: string | Record<string, string> | undefined = envKeyring?.keyring;
          if (!keyringOrKey) {
            const rawKey =
              process.env.MCT_CREDENTIALS_MASTER_KEY ||
              process.env.APP_MASTER_KEY ||
              process.env.MASTER_ENCRYPTION_KEY;
            if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
              keyringOrKey = rawKey;
            } else if (process.env.NODE_ENV === "test" || process.env.VITEST) {
              keyringOrKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
            } else {
              throw new Error(
                "FATAL_CONFIG_ERROR: Master encryption key must be explicitly provided as a 64-character hex string (no hardcoded fallback allowed outside test suites)"
              );
            }
          }

          const enc = encryptPayload(JSON.stringify(rawPayload), keyringOrKey);
          const accountId =
            credentials.phoneNumberId ||
            credentials.wabaAccountId ||
            displayName.toLowerCase().replace(/[^a-z0-9_-]/g, "_");

          const credRes = await client.query<{ id: string }>(
            `INSERT INTO public.provider_credentials (
               workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, key_version, status
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE')
             ON CONFLICT (workspace_id, provider, account_id)
             DO NOTHING
             RETURNING id;`,
            [workspaceId, provider, accountId, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64, enc.keyVersion]
          );
          credentialId = credRes.rows[0]?.id || null;
          if(!credentialId)throw channelConflict(409,"Já existe uma configuração com este identificador. Consulte o canal existente; cadastrar outra linha não substitui suas credenciais.");
        }

        // S-02: Honest Channel State Machine
        // Channels with credentials start in 'validating' (awaiting verified handshake)
        // Channels without credentials start in 'unconfigured'
        // Neither can start in 'connected' or 'pairing' without server adapter proof.
        const initialStatus = credentials ? "validating" : "unconfigured";

        const effectivePhoneNumberE164: string | null = phoneNumberE164 ?? null;


        const res = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          created_at: string;
        }>(
          `INSERT INTO public.channel_instances (
             workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, credential_id, status, is_active
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id, workspace_id, provider, display_name, phone_number_e164, status, is_active, created_at;`,
          [workspaceId, provider, displayName, effectivePhoneNumberE164, tokenHash, credentialId, initialStatus, false]
        );
        return res.rows[0];
      });

      if (!channel) {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Internal Server Error",
          status: 500,
          detail: "Failed to persist channel instance",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(201).send({
        channel: {
          id: channel.id,
          workspaceId: channel.workspace_id,
          provider: channel.provider,
          displayName: channel.display_name,
          phoneNumberE164: channel.phone_number_e164,
          status: channel.status,
          isActive: channel.is_active,
          createdAt: channel.created_at,
          // Return the raw token only once on creation so the webhook URL can be configured
          webhookToken: rawToken,
          webhookUrl: `/v1/webhooks/whatsapp/${rawToken}`,
        },
        webhookToken: rawToken,
        webhookUrl: `/v1/webhooks/whatsapp/${rawToken}`,
      });
    }
  );

  // 3.1 Meta WhatsApp Embedded Signup (1-Clique Onboarding)
  app.post(
    "/v1/workspaces/:workspaceId/channels/meta-embedded-signup",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = metaEmbeddedSignupBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { displayName, wabaAccountId, phoneNumberId, code, accessToken } = parsedBody.data;

      const metaAppId = process.env.META_APP_ID || "2294262161340902";
      const metaAppSecret = process.env.META_APP_SECRET?.trim();

      let finalToken = accessToken?.trim() || "";

      // If code was provided, exchange it for a permanent token
      if (!finalToken && code) {
        if (!metaAppSecret) {
          return reply.status(503).send({
            type: "https://sos-sales.mct.br/errors/service-unavailable",
            title: "Meta OAuth Not Configured",
            status: 503,
            detail: "Meta OAuth is not configured on this server.",
            instance: request.url,
            correlationId: request.id,
          });
        }
        try {
          const exchangeUrl = `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token?client_id=${encodeURIComponent(
            metaAppId
          )}&client_secret=${encodeURIComponent(metaAppSecret)}&code=${encodeURIComponent(code)}`;

          const exchangeResp = await safeFetchWithSsrfGuard(
            exchangeUrl,
            { method: "GET" },
            { timeoutMs: 12000, allowedProtocols: ["https:"] }
          );

          if (exchangeResp.ok) {
            const tokenData = (await exchangeResp.json()) as { access_token?: string };
            if (tokenData.access_token) {
              finalToken = tokenData.access_token;
            }
          } else {

            return reply.status(400).send({
              type: "https://sos-sales.mct.br/errors/bad-request",
              title: "Meta Token Exchange Failed",
              status: 400,
              detail: "A Meta recusou o código de autorização. Confira a configuração e inicie uma nova autorização se necessário.",
              instance: request.url,
              correlationId: request.id,
            });
          }
        } catch (err: unknown) {
          return reply.status(502).send({
            type: "https://sos-sales.mct.br/errors/bad-gateway",
            title: "Meta OAuth Exchange Error",
            status: 502,
            detail: "Não foi possível confirmar a troca do código na Meta. Não repita o mesmo código automaticamente.",
            instance: request.url,
            correlationId: request.id,
          });
        }
      }

      if (!finalToken) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Código de autorização Meta ou Access Token é obrigatório.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Reject duplicate registrations before any remote setup action.
      await withTenantTransaction(workspaceId,async client=>{
        await lockChannelManager(client,workspaceId,request.user.id);
        const existing=await client.query("SELECT id FROM public.provider_credentials WHERE workspace_id=$1 AND provider='meta_waba' AND account_id=$2",[workspaceId,phoneNumberId]);
        if(existing.rows.length)throw channelConflict(409,"Esta linha já tem configuração cadastrada. Consulte o canal existente; este cadastro não substitui credenciais nem reativa linhas suspensas.");
      });

      let resolvedPhoneE164: string | null = null;
      try {
        const response=await safeFetchWithSsrfGuard(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number`,{headers:{Authorization:`Bearer ${finalToken}`}},{timeoutMs:8000,allowedProtocols:["https:"]});
        if(!response.ok)return reply.status(422).send({message:"A Meta não confirmou a linha selecionada. Nenhum canal foi cadastrado."});
        const data:unknown=await response.json();
        const proof=data&&typeof data==='object'?data as Record<string,unknown>:{};
        const phone=typeof proof.display_phone_number==='string'&&/^[+0-9 ()-]+$/.test(proof.display_phone_number)?`+${proof.display_phone_number.replace(/\D/g,'')}`:null;
        if(proof.id!==phoneNumberId||!phone||!/^\+[1-9][0-9]{6,14}$/.test(phone))return reply.status(422).send({message:"A identidade da linha selecionada não foi confirmada pela Meta. Revise a conta e tente novamente."});
        await assertMetaPhoneMembership(wabaAccountId,phoneNumberId,finalToken,phone);
        resolvedPhoneE164=phone;
      }catch(error){return reply.status((error as {statusCode?:number}).statusCode===422?422:502).send({message:(error as {statusCode?:number}).statusCode===422?(error as Error).message:"Não foi possível conferir a linha e sua conta na Meta. Nenhum canal foi cadastrado. Consulte o estado antes de repetir a autorização."});}

      // Subscription acknowledgement is distinct from local activation and delivery proof.
      let subscriptionStatus:"confirmed"|"failed"|"uncertain"="uncertain";
      try {
        await withTenantTransaction(workspaceId,async client=>{await lockChannelManager(client,workspaceId,request.user.id);});
        const response=await safeFetchWithSsrfGuard(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(wabaAccountId)}/subscribed_apps`,{method:"POST",headers:{Authorization:`Bearer ${finalToken}`}},{timeoutMs:8000,allowedProtocols:["https:"]});
        if(response.ok){const body:unknown=await response.json();subscriptionStatus=body&&typeof body==='object'&&(body as {success?:unknown}).success===true?'confirmed':'uncertain';}
        else subscriptionStatus=response.status>=500?'uncertain':'failed';
      }catch(error){if((error as {statusCode?:number}).statusCode===403)throw error;subscriptionStatus="uncertain";}

      // Persist credentials and channel
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        await lockChannelManager(client,workspaceId,request.user.id);
        const rawPayload = {
          access_token: finalToken,
          phone_number_id: phoneNumberId,
          waba_account_id: wabaAccountId,
          app_id: metaAppId,
        };

        const envKeyring = parseKeyringFromEnv();
        let keyringOrKey: string | Record<string, string> | undefined = envKeyring?.keyring;
        if (!keyringOrKey) {
          keyringOrKey =
            process.env.MCT_CREDENTIALS_MASTER_KEY ||
            process.env.APP_MASTER_KEY ||
            process.env.MASTER_ENCRYPTION_KEY ||
            (process.env.NODE_ENV === "test"
              ? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
              : undefined);
        }

        if (!keyringOrKey) {
          throw new Error("Master encryption key missing");
        }

        const enc = encryptPayload(JSON.stringify(rawPayload), keyringOrKey);
        const credRes = await client.query<{ id: string }>(
          `INSERT INTO public.provider_credentials (
             workspace_id, provider, account_id, encrypted_payload, iv, auth_tag, key_version, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (workspace_id, provider, account_id)
           DO NOTHING
           RETURNING id;`,
          [workspaceId, "meta_waba", phoneNumberId, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64, enc.keyVersion, "ACTIVE"]
        );

        const credentialId = credRes.rows[0]?.id;
        if (!credentialId) throw channelConflict(409,"Esta linha já foi cadastrada. Consulte os canais antes de repetir; as credenciais anteriores foram preservadas.");

        const chanRes = await client.query<{
          id: string;
          workspace_id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          created_at: string;
        }>(
          `INSERT INTO public.channel_instances (
             workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, credential_id, status, is_active, meta_subscription_status, meta_subscription_checked_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, clock_timestamp())
           RETURNING id, workspace_id, provider, display_name, phone_number_e164, status, is_active, created_at;`,
          [workspaceId, "meta_waba", displayName, resolvedPhoneE164, tokenHash, credentialId, "validating", false, subscriptionStatus]
        );

        const createdChannel = chanRes.rows[0];
        if (!createdChannel) throw new Error("Channel insert returned no record");
        await recordSecurityAuditEvent({workspaceId,actorId:request.user.id,actorType:"user",action:"channel.meta_registered",resourceType:"channel",resourceId:createdChannel.id,metadata:{subscriptionStatus,locallyActivated:false,correlationId:request.id}},client);
        return createdChannel;
      });

      return reply.status(201).send({
        setup: {subscriptionStatus,requiresConnectionApproval:true,message:subscriptionStatus==='confirmed'
          ? "Cadastro salvo. A Meta confirmou a solicitação de assinatura; recebimento e envio ainda precisam de teste. O canal permanece inativo até confirmar a conexão."
          : subscriptionStatus==='failed'
          ? "Cadastro salvo, mas a Meta recusou a assinatura de webhooks. Revise a integração antes de confirmar a conexão. O canal permanece inativo."
          : "Cadastro salvo, mas o resultado da assinatura de webhooks não foi confirmado. Consulte a configuração antes de repetir a ação. O canal permanece inativo."},
        channel: {
          id: channel.id,
          workspaceId: channel.workspace_id,
          provider: channel.provider,
          displayName: channel.display_name,
          phoneNumberE164: channel.phone_number_e164,
          status: channel.status,
          isActive: channel.is_active,
          createdAt: channel.created_at,
          webhookToken: rawToken,
          webhookUrl: `/v1/webhooks/whatsapp/${rawToken}`,
        },
      });
    }
  );

  // 4. Revoke / Disconnect Channel Instance
  app.post(
    "/v1/workspaces/:workspaceId/channels/:channelId/revoke",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;
      const change = channelChangeSchema.safeParse(request.body);
      if (!change.success) return reply.status(428).send({ message: "Atualize os canais e revise a ação novamente antes de suspender." });

      const revoked = await withTenantTransaction(workspaceId, async (client) => {
        await lockChannelManager(client, workspaceId, request.user.id);
        const current = (await client.query<{ revision: string }>(`SELECT ${channelRevisionExpression} AS revision FROM public.channel_instances WHERE id=$1 AND workspace_id=$2 FOR UPDATE`, [channelId, workspaceId])).rows[0];
        if (!current) return null;
        if (current.revision !== change.data.expectedRevision) throw channelConflict(409, "O canal mudou desde a revisão. Atualize a lista e confira a ação novamente.");
        const chanRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          credential_id: string | null;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = 'revoked', is_active = false, meta_billing_configured = false, meta_billing_account_id = NULL, updated_at = clock_timestamp()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, provider, display_name, credential_id, status, is_active;`,
          [channelId, workspaceId]
        );

        const channel = chanRes.rows[0];
        if (!channel) {
          return null;
        }

        if (channel.credential_id) {
          await client.query("SELECT id FROM public.provider_credentials WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [channel.credential_id, workspaceId]);
          const otherActiveRes = await client.query<{ count: string }>(
            `SELECT count(*)::text as count FROM public.channel_instances
             WHERE credential_id = $1 AND id != $2 AND workspace_id = $3 AND is_active = true;`,
            [channel.credential_id, channelId, workspaceId]
          );
          const hasOtherActive = Number.parseInt(otherActiveRes.rows[0]?.count || "0", 10) > 0;
          if (!hasOtherActive) {
            await client.query(
              `UPDATE public.provider_credentials
               SET status = 'REVOKED', updated_at = NOW()
               WHERE id = $1 AND workspace_id = $2;`,
              [channel.credential_id, workspaceId]
            );
          }
        }

        await recordSecurityAuditEvent(
            {
              workspaceId,
              actorId: request.user.id,
              actorType: "user",
              action: "channel.revoked",
              resourceType: "channel",
              resourceId: channelId,
              metadata: {
                channelId,
                provider: channel.provider,
                displayName: channel.display_name,
                correlationId: request.id,
                revokedAt: new Date().toISOString(),
              },
              ipAddress: request.ip,
            },
            client
          );


        return channel;
      });

      if (!revoked) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        channelId: revoked.id,
        status: revoked.status,
        isActive: revoked.is_active,
        message: `Canal '${revoked.display_name}' suspenso no SOS Vendas. A sessão no provedor não foi desconectada.`,
      });
    }
  );

  // 4b. Delete or Soft-Archive Channel Instance safely
  app.delete(
    "/v1/workspaces/:workspaceId/channels/:channelId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;
      const change = channelChangeSchema.safeParse(request.body);
      if (!change.success) return reply.status(428).send({ message: "Atualize os canais e revise a ação novamente antes de arquivar." });

      const result = await withTenantTransaction(workspaceId, async (client) => {
        await lockChannelManager(client, workspaceId, request.user.id);
        const chanRes = await client.query<{ id: string; display_name: string; credential_id: string | null; revision: string }>(
          `SELECT id, display_name, credential_id, ${channelRevisionExpression} AS revision FROM public.channel_instances WHERE id = $1 AND workspace_id = $2 FOR UPDATE;`,
          [channelId, workspaceId]
        );
        const channel = chanRes.rows[0];
        if (!channel) return null;
        if (channel.revision !== change.data.expectedRevision) throw channelConflict(409, "O canal mudou desde a revisão. Atualize a lista e confira a ação novamente.");

        const msgRes = await client.query<{ count: string }>(
          `SELECT count(*)::text as count FROM public.messages WHERE channel_instance_id = $1 AND workspace_id = $2;`,
          [channelId, workspaceId]
        );
        const messageCount = Number.parseInt(msgRes.rows[0]?.count || "0", 10);

        { // Always archive: preserve history and avoid broad queue DELETE privileges.
          // Soft-archive to preserve financial and conversational integrity
          await client.query(
            `UPDATE public.channel_instances
             SET status = 'revoked', is_active = false, meta_billing_configured = false, meta_billing_account_id = NULL, updated_at = clock_timestamp()
             WHERE id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          if (channel.credential_id) {
          await client.query("SELECT id FROM public.provider_credentials WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [channel.credential_id, workspaceId]);
            const otherActiveRes = await client.query<{ count: string }>(
              `SELECT count(*)::text as count FROM public.channel_instances
               WHERE credential_id = $1 AND id != $2 AND workspace_id = $3 AND is_active = true;`,
              [channel.credential_id, channelId, workspaceId]
            );
            const hasOtherActive = Number.parseInt(otherActiveRes.rows[0]?.count || "0", 10) > 0;
            if (!hasOtherActive) {
              await client.query(
                `UPDATE public.provider_credentials
                 SET status = 'REVOKED', updated_at = NOW()
                 WHERE id = $1 AND workspace_id = $2;`,
                [channel.credential_id, workspaceId]
              );
            }
          }
          await recordSecurityAuditEvent({ workspaceId, actorId: request.user.id, action: "channel.archived", resourceType: "channel", resourceId: channelId, metadata: { messageCount, providerSessionDisconnected: false, correlationId: request.id } }, client);
          return { mode: "archived", displayName: channel.display_name, messageCount };

        }
      });

      if (!result) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        mode: result.mode,
        message: `Canal '${result.displayName}' arquivado (${result.messageCount} mensagens preservadas). A sessão no provedor não foi desconectada.`,
      });
    }
  );

  // 4c. Update Channel Lifecycle Status (State Machine)
  app.patch(
    "/v1/workspaces/:workspaceId/channels/:channelId/status",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = updateChannelStatusBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { status } = parsedBody.data;

      // S-02: Client cannot directly set 'connected' or 'pairing'
      if (status === "connected" || status === "pairing") {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `Direct transition to '${status}' by client is prohibited. Server-side adapter verification is required via reviewed POST /verify-session. GET /qr-code is read-only.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Lifecycle is derived from provider proof or an explicit reviewed operation.
      // Keep this legacy route read-only so older clients cannot bypass those decisions.
      return reply.status(410).send({
        type: "https://sos-sales.mct.br/errors/channel-status-retired",
        title: "Alteração direta de status removida",
        status: 410,
        detail: "O status não pode ser editado diretamente. Consulte o canal e use a ação específica: conexão revisada, confirmação de conexão, suspensão ou arquivamento.",
        instance: request.url,
        correlationId: request.id,
      });
    }
  );

  // 4d. Update Channel Meta Direct Billing Guardrail
  app.patch(
    "/v1/workspaces/:workspaceId/channels/:channelId/billing",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const bodySchema = channelChangeSchema.extend({
        metaBillingConfigured: z.boolean(),
        acknowledgedDeclaration: z.boolean().optional(),
        metaBillingAccountId: z.string().trim().min(1).max(100).optional().nullable(),
      }).strict();
      const parsedBody = bodySchema.safeParse(request.body);
      if (!parsedBody.success) return reply.status(400).send({ message: "Informe a revisão do canal e a declaração de faturamento válida." });
      const { workspaceId, channelId } = parsedParams.data;
      const input = parsedBody.data;
      if (input.metaBillingConfigured && input.acknowledgedDeclaration !== true) return reply.status(422).send({ message: "Confirme que conferiu o faturamento na Meta. O SOS Vendas registra uma declaração, sem verificar ou cadastrar seu cartão." });
      const updated = await withTenantTransaction(workspaceId, async client => {
        await lockChannelManager(client, workspaceId, request.user.id);
        const current = (await client.query<{ id: string; provider: string; status: string; is_active: boolean; revision: string; meta_billing_configured: boolean; meta_billing_account_id: string | null }>(`SELECT id,provider,status,is_active,meta_billing_configured,meta_billing_account_id,${channelRevisionExpression} AS revision FROM public.channel_instances WHERE id=$1 AND workspace_id=$2 FOR UPDATE`, [channelId, workspaceId])).rows[0];
        if (!current) return null;
        if (current.provider !== "meta_waba") throw channelConflict(422, "A declaração de faturamento Meta se aplica somente ao canal oficial WhatsApp da Meta.");
        if (current.revision !== input.expectedRevision) throw channelConflict(409, "O canal mudou desde a revisão. Atualize a lista antes de alterar o faturamento.");
        if (input.metaBillingConfigured && (!current.is_active || current.status !== "connected")) throw channelConflict(409, "Conecte o canal antes de declarar o faturamento Meta.");
        const account = input.metaBillingConfigured ? input.metaBillingAccountId === undefined ? current.meta_billing_account_id : input.metaBillingAccountId : null;
        const changed = (await client.query<{ id: string; provider: string; display_name: string; meta_billing_configured: boolean; meta_billing_account_id: string | null; revision: string }>(`UPDATE public.channel_instances SET meta_billing_configured=$1,meta_billing_account_id=$2,updated_at=clock_timestamp() WHERE id=$3 AND workspace_id=$4 RETURNING id,provider,display_name,meta_billing_configured,meta_billing_account_id,${channelRevisionExpression} AS revision`, [input.metaBillingConfigured,account,channelId,workspaceId])).rows[0]!;
        await recordSecurityAuditEvent({ workspaceId, actorId: request.user.id, action: "channel.billing_declared", resourceType: "channel", resourceId: channelId, metadata: { previouslyDeclared: current.meta_billing_configured, declared: changed.meta_billing_configured, source: "responsible_declaration", providerVerified: false, correlationId: request.id } }, client);
        return changed;
      });
      if (!updated) return reply.status(404).send({ message: "Canal não encontrado nesta empresa." });
      return reply.send({ success: true, channel: { id: updated.id, provider: updated.provider, displayName: updated.display_name, metaBillingConfigured: updated.meta_billing_configured, metaBillingAccountId: updated.meta_billing_account_id, revision: updated.revision }, message: updated.meta_billing_configured ? "Declaração de faturamento registrada. A situação do cartão não foi verificada pelo SOS Vendas." : "Declaração de faturamento removida. Disparos dependentes dessa condição ficam bloqueados." });
    }
  );

  // 4c. Verify Session with Provider Adapter and Transition to Connected/Pairing/Error
  app.post(
    "/v1/workspaces/:workspaceId/channels/:channelId/verify-session",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;
      const approval=channelChangeSchema.extend({acknowledgedConnection:z.literal(true)}).strict().safeParse(request.body);
      if(!approval.success)return reply.status(428).send({message:"Atualize o canal, confira a identidade e confirme explicitamente o uso desta conexão."});

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          credential_id: string | null;
          status: string;
          is_active: boolean;
          revision: string;
          phone_number_e164: string | null;
          meta_subscription_status: string;
        }>(
          `SELECT id, provider, display_name, credential_id, status, is_active, phone_number_e164, meta_subscription_status, ${channelRevisionExpression} AS revision
           FROM public.channel_instances
           WHERE id = $1 AND workspace_id = $2;`,
          [channelId, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!channel) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if(channel.status==='revoked')return reply.status(409).send({message:"Canal suspenso ou arquivado. Revise o cadastro antes de reconectar."});
      if(channel.revision!==approval.data.expectedRevision)return reply.status(409).send({message:"O canal mudou. Atualize antes de confirmar a conexão."});
      if(channel.provider==='waha')return reply.send(await activateWaha(workspaceId,channelId,request.user.id,approval.data.expectedRevision));
      if(channel.provider==='meta_waba'&&channel.meta_subscription_status!=="confirmed")return reply.status(409).send({message:"A assinatura de webhooks desta linha está pendente. Confira a integração antes de confirmar a conexão; a consulta de identidade não resolve essa pendência."});
      if(process.env.APP_ENV==='lab'&&process.env.ENABLE_LAB_SYNTHETIC==='true')return reply.send({success:false,isSimulated:true,status:channel.status,isActive:channel.is_active,handshakeDetail:"SIMULAÇÃO — a consulta não ativa um canal real."});
      if (!channel.credential_id) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Channel does not have credentials configured. Status is unconfigured.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const credRow = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          encrypted_payload: string;
          iv: string;
          auth_tag: string;
          key_version?: string;
        }>(
          `SELECT encrypted_payload, iv, auth_tag, key_version
           FROM public.provider_credentials
           WHERE id = $1 AND workspace_id = $2 AND status = 'ACTIVE';`,
          [channel.credential_id, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!credRow) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Active provider credentials not found for channel.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      let credentials: Record<string, any>;
      try {
        const envKeyring = parseKeyringFromEnv();
        const masterKey =
          envKeyring?.keyring ||
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY ||
          process.env.MASTER_ENCRYPTION_KEY ||
          (process.env.NODE_ENV === "test" || process.env.VITEST
            ? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            : undefined);

        if (!masterKey) {
          throw new Error("Master encryption key not configured");
        }

        const decrypted = decryptPayload(
          credRow.encrypted_payload,
          credRow.iv,
          credRow.auth_tag,
          masterKey,
          credRow.key_version ? { keyVersion: credRow.key_version } : undefined
        );
        credentials = JSON.parse(decrypted);
      } catch {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Decryption Failed",
          status: 500,
          detail: "Failed to decrypt provider credentials",
          instance: request.url,
          correlationId: request.id,
        });
      }

      let newStatus: "connected" | "pairing" | "error" = "error";
      let handshakeDetail = "";
      let verifiedPhone: string | null = null;

      const allowLocal =
        process.env.NODE_ENV !== "production" ||
        process.env.ENABLE_LAB_SYNTHETIC === "true" ||
        process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

      try {
        if (channel.provider === "meta_waba") {
          const phoneNumberId = credentials.phone_number_id;
          const accessToken = credentials.access_token;
          if (!phoneNumberId || !accessToken) {
            newStatus = "error";
            handshakeDetail = "Missing phone_number_id or access_token in credentials";
          } else {
            const resp = await safeFetchWithSsrfGuard(
              `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(String(phoneNumberId))}?fields=id,display_phone_number,name_status,quality_rating`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
              { timeoutMs: 8000, allowLocalTest: false, allowedProtocols: ["https:"] }
            );
            if (resp.ok) {
              const body: unknown = await resp.json();
              const proof = body && typeof body === "object" ? body as Record<string,unknown> : {};
              const displayPhone = typeof proof.display_phone_number === "string" && /^[+0-9 ()-]+$/.test(proof.display_phone_number) ? `+${proof.display_phone_number.replace(/\D/g, "")}` : null;
              if (proof.id !== phoneNumberId || !displayPhone || !/^\+[1-9][0-9]{6,14}$/.test(displayPhone)) {
                handshakeDetail = "A Meta não confirmou o identificador e o telefone da linha. Nenhuma conexão foi aprovada.";
              } else if (channel.phone_number_e164 && channel.phone_number_e164 !== displayPhone) {
                handshakeDetail = "O telefone retornado pela Meta é diferente do cadastro. Revise a configuração antes de ativar.";
              } else {
                await assertMetaPhoneMembership(credentials.waba_account_id,phoneNumberId,accessToken,displayPhone);
                verifiedPhone = displayPhone;
                newStatus = "connected";
                handshakeDetail = "Identidade do número e vínculo com a conta conferidos na Meta. Envio, recebimento e cobrança ainda exigem homologação própria.";
              }
            } else {
              newStatus = "error";
              handshakeDetail = `Meta Graph API returned HTTP ${resp.status}`;
            }
          }
        } else if (channel.provider === "waha") {
          const baseUrl = credentials.base_url;
          const apiKey = credentials.api_key;
          if (!baseUrl) {
            newStatus = "error";
            handshakeDetail = "Missing base_url for WAHA";
          } else {
            const targetBaseUrl = validateWahaBaseUrl(baseUrl, allowLocal);
            const sessionName = credentials.session ? String(credentials.session).trim() : "default";
            const resp = await safeFetchWithSsrfGuard(
              `${targetBaseUrl}/api/sessions/${encodeURIComponent(sessionName)}`,
              { headers: apiKey ? { "X-Api-Key": apiKey } : {} },
              { timeoutMs: 8000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
            );
            if (resp.ok) {
              const body = (await resp.json()) as any;
              const wahaStatus = body.status;
              if (wahaStatus === "WORKING") {
                newStatus = "connected";
                handshakeDetail = "WAHA session working and connected";
              } else if (wahaStatus === "SCAN_QR_CODE") {
                newStatus = "pairing";
                handshakeDetail = "WAHA awaiting QR code scan";
              } else {
                newStatus = "error";
                handshakeDetail = `WAHA session status: ${wahaStatus}`;
              }
            } else {
              newStatus = "error";
              handshakeDetail = `WAHA returned HTTP ${resp.status}`;
            }
          }
        } else if (channel.provider === "evolution") {
          const baseUrl = credentials.base_url;
          const apiKey = credentials.api_key;
          const instanceName=typeof credentials.instance_name === "string" ? credentials.instance_name.trim() : "";
          if (!baseUrl || !apiKey || !instanceName) {
            newStatus = "error";
            handshakeDetail = "Revise o servidor, a chave e o nome da instância Evolution antes de confirmar a conexão.";
          } else {
            const targetBaseUrl = validateEvolutionBaseUrl(baseUrl, allowLocal);
            const options={timeoutMs:8000,allowLocalTest:allowLocal,allowedProtocols:["http:","https:"]};
            const headers={apikey:apiKey};
            const resp = await safeFetchWithSsrfGuard(`${targetBaseUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`,{headers},options);
            if (!resp.ok) {
              newStatus="error";handshakeDetail=`Evolution não confirmou o estado da instância (HTTP ${resp.status}).`;
            } else {
              const proof=await resp.json() as {instance?:{instanceName?:unknown;state?:unknown}};
              const state=proof?.instance?.state;
              if(proof?.instance?.instanceName!==instanceName){
                handshakeDetail="Evolution não confirmou a instância solicitada. Nenhuma conexão foi aprovada.";
              } else if(state==="open"){
                const identityResponse=await safeFetchWithSsrfGuard(`${targetBaseUrl}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,{headers},options);
                const identity=identityResponse.ok ? await identityResponse.json() : null;
                const matches=Array.isArray(identity)?identity.filter(row=>row?.name===instanceName):[];
                const record=matches.length===1?matches[0]:null;
                const jid=typeof record?.ownerJid==="string"?record.ownerJid:"";
                const digits=/^([1-9][0-9]{6,14})(?::[0-9]+)?@s\.whatsapp\.net$/.exec(jid)?.[1];
                const phone=digits?`+${digits}`:null;
                if(record?.connectionStatus!=="open"||!phone){
                  handshakeDetail="Evolution não confirmou o telefone da instância aberta. Nenhuma conexão foi aprovada.";
                } else if(channel.phone_number_e164&&channel.phone_number_e164!==phone){
                  handshakeDetail="O telefone retornado pela Evolution é diferente do cadastro. Revise a configuração antes de ativar.";
                } else {
                  verifiedPhone=phone;newStatus="connected";
                  handshakeDetail="Instância e telefone conferidos na Evolution. Envio e recebimento ainda exigem homologação própria.";
                }
              } else if(state==="connecting"||state==="qrcode"){
                newStatus="pairing";handshakeDetail="A instância Evolution ainda aguarda concluir o vínculo. Nenhuma ativação foi aplicada.";
              } else {
                handshakeDetail="A instância Evolution não está aberta. Nenhuma conexão foi aprovada.";
              }
            }
          }
        }
      } catch (err) {
        newStatus = "error";
        handshakeDetail = err instanceof Error ? err.message : "Network/adapter error during handshake";
      }

      const updatedChannel = await withTenantTransaction(workspaceId, async (client) => {
        await lockChannelManager(client,workspaceId,request.user.id);
        const current=(await client.query<{revision:string;credential_id:string|null;status:string}>(`SELECT ${channelRevisionExpression} AS revision,credential_id,status FROM public.channel_instances WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,[workspaceId,channelId])).rows[0];
        if(!current||current.status==='revoked'||current.revision!==channel.revision||current.credential_id!==channel.credential_id)throw channelConflict(409,"O canal mudou durante a verificação. Nenhuma ativação foi aplicada.");
        const credential=(await client.query<{encrypted_payload:string}>("SELECT encrypted_payload FROM public.provider_credentials WHERE workspace_id=$1 AND id=$2 AND status='ACTIVE' FOR SHARE",[workspaceId,channel.credential_id])).rows[0];
        if(!credential||credential.encrypted_payload!==credRow.encrypted_payload)throw channelConflict(409,"As credenciais mudaram durante a verificação.");
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = $1, is_active = ($1 = 'connected'), phone_number_e164 = COALESCE(phone_number_e164,$4), updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3
           RETURNING id, provider, display_name, status, is_active;`,
          [newStatus, channelId, workspaceId, verifiedPhone]
        );
        await recordSecurityAuditEvent({workspaceId,actorId:request.user.id,actorType:"user",action:"channel.connection_checked",resourceType:"channel",resourceId:channelId,metadata:{provider:channel.provider,previousStatus:channel.status,status:newStatus,identityConfirmed:verifiedPhone!==null,correlationId:request.id}},client);
        return res.rows[0];
      });

      if (!updatedChannel) {
        return reply.status(404).send({
          error: "CHANNEL_NOT_FOUND",
          message: "Channel not found in workspace",
        });
      }

      return reply.status(200).send({
        isSimulated: false,
        success: newStatus === "connected",
        channelId: updatedChannel.id,
        status: updatedChannel.status,
        isActive: updatedChannel.is_active,
        handshakeDetail,
        verifiedPhoneNumber: verifiedPhone,
      });
    }
  );

  app.post("/v1/workspaces/:workspaceId/channels/:channelId/meta-subscription/check",{
    preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")],
  },async(request,reply)=>{
    const params=channelParamsSchema.safeParse(request.params),body=channelChangeSchema.strict().safeParse(request.body);
    if(!params.success)return reply.status(400).send({message:"Empresa ou canal inválido."});
    if(!body.success)return reply.status(428).send({message:"Atualize o canal e revise a consulta antes de continuar."});
    return reply.send(await checkMetaSubscription(params.data.workspaceId,params.data.channelId,request.user.id,body.data.expectedRevision));
  });

  // Consultation never starts/restarts a session or changes local activation.
  app.get("/v1/workspaces/:workspaceId/channels/:channelId/qr-code", {
    preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")],
  },async(request,reply)=>{
    const parsed=channelParamsSchema.safeParse(request.params);
    if(!parsed.success)return reply.status(400).send({message:"Empresa ou canal inválido."});
    if((request.query as {force?:string})?.force)return reply.status(409).send({message:"A consulta não reinicia sessões. Revise e confirme uma ação de conexão separadamente."});
    reply.header('Cache-Control','no-store');
    return reply.send(await readWahaQr(parsed.data.workspaceId,parsed.data.channelId,request.user.id));
  });
  app.post("/v1/workspaces/:workspaceId/channels/:channelId/connection", {
    preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")],
  },async(request,reply)=>{
    const parsed=channelParamsSchema.safeParse(request.params);
    const body=channelChangeSchema.extend({action:z.enum(['create','start','restart']),requestKey:z.string().uuid(),acknowledged:z.literal(true)}).strict().safeParse(request.body);
    if(!parsed.success||!body.success)return reply.status(400).send({message:"Informe uma ação revisada, a revisão do canal e a identificação da tentativa."});
    return reply.send(await mutateWaha(parsed.data.workspaceId,parsed.data.channelId,request.user.id,body.data));
  });
  app.post("/v1/workspaces/:workspaceId/channels/:channelId/connection/review", {
    preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")],
  },async(request,reply)=>{
    const parsed=channelParamsSchema.safeParse(request.params);
    const body=channelChangeSchema.extend({operationId:z.string().uuid(),acknowledged:z.literal(true)}).strict().safeParse(request.body);
    if(!parsed.success||!body.success)return reply.status(400).send({message:"Confira a operação pendente e reconheça a incerteza antes de prosseguir."});
    return reply.send(await reviewWahaOperation(parsed.data.workspaceId,parsed.data.channelId,request.user.id,body.data));
  });

  // 6. Sync Conversations & Contacts from Provider (WAHA)
  app.post(
    "/v1/workspaces/:workspaceId/channels/:channelId/sync",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = channelParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or channelId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, channelId } = parsedParams.data;

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          is_active: boolean;
          status: string;
          credential_id: string | null;
          phone_number_e164: string | null;
        }>(
          `SELECT id, provider, display_name, is_active, status, credential_id, phone_number_e164
           FROM public.channel_instances
           WHERE id = $1 AND workspace_id = $2;`,
          [channelId, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!channel) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: `Channel ${channelId} not found in workspace`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (channel.provider !== "waha" || !channel.is_active || channel.status !== "connected" || !channel.credential_id) {
        return reply.status(409).send({ success: false, message: "A importação exige um canal WAHA ativo e conectado. Configure a conexão antes de importar o histórico.", syncedChatsCount: 0, syncedMessagesCount: 0 });
      }

      const credRow = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          encrypted_payload: string;
          iv: string;
          auth_tag: string;
          key_version: string;
        }>(
          `SELECT encrypted_payload, iv, auth_tag, key_version
           FROM public.provider_credentials
           WHERE id = $1 AND workspace_id = $2 AND status = 'ACTIVE';`,
          [channel.credential_id, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!credRow) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Credenciais do canal não encontradas",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const envKeyring = parseKeyringFromEnv();
      let keyringOrKey: string | Record<string, string> | undefined = envKeyring?.keyring;
      if (!keyringOrKey) {
        const rawKey =
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY ||
          process.env.MASTER_ENCRYPTION_KEY;
        if (rawKey && /^[0-9a-fA-F]{64}$/.test(rawKey)) {
          keyringOrKey = rawKey;
        } else if (process.env.NODE_ENV === "test" || process.env.VITEST) {
          keyringOrKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        }
      }

      if (!keyringOrKey) {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Internal Error",
          status: 500,
          detail: "Master encryption key unavailable",
          instance: request.url,
          correlationId: request.id,
        });
      }

      let creds: { api_key?: string; base_url?: string; session?: string };
      try {
        const decryptedJson = decryptPayload(
          credRow.encrypted_payload,
          credRow.iv,
          credRow.auth_tag,
          keyringOrKey,
          { keyVersion: credRow.key_version }
        );
        creds = JSON.parse(decryptedJson);
      } catch {
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Decryption Failed",
          status: 500,
          detail: "Falha ao decifrar credenciais do canal",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!creds.base_url) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Base URL ausente nas credenciais",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const allowLocal =
        process.env.NODE_ENV === "development" ||
        process.env.NODE_ENV === "test" ||
        process.env.MCT_ALLOW_LOCAL_WAHA === "true";

      let validatedBaseUrl: string;
      try {
        validatedBaseUrl = validateWahaBaseUrl(creds.base_url, allowLocal);
      } catch (err: unknown) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "SSRF Violation",
          status: 400,
          detail: err instanceof Error ? err.message : "Invalid WAHA Base URL",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const effectiveSession = encodeURIComponent(creds.session || "default");
      const authHeaders: Record<string, string> = {};
      if (creds.api_key) authHeaders["X-Api-Key"] = creds.api_key;
      const deadline = Date.now() + 30_000;
      const getProvider = async (path: string) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("history_time_budget");
        return safeFetchWithSsrfGuard(`${validatedBaseUrl}${path}`, { headers: authHeaders }, {
          timeoutMs: Math.min(8000, remaining), allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"],
        });
      };
      const providerError = (message: string, status = 502) => reply.status(status).send({ success: false, syncedChatsCount: 0, syncedMessagesCount: 0, message });
      let ownPhone: string | null = null;
      let rawChats: unknown;
      try {
        const sessionResp = await getProvider(`/api/sessions/${effectiveSession}`);
        if (!sessionResp.ok) return providerError("Não foi possível verificar a sessão. Nenhuma conexão foi alterada.");
        const session = await sessionResp.json() as { status?: unknown; me?: { id?: unknown } };
        if (session.status !== "WORKING") return providerError("A sessão não está pronta. Confira a conexão do canal antes de importar.", 409);
        ownPhone = historyPhone(session.me?.id);
        if (!ownPhone) {
          const meResp = await getProvider(`/api/sessions/${effectiveSession}/me`);
          if (meResp.ok) ownPhone = historyPhone((await meResp.json() as { id?: unknown }).id);
        }
        if (!ownPhone || (channel.phone_number_e164 && channel.phone_number_e164 !== ownPhone)) {
          return providerError("A identidade da sessão não corresponde ao canal ou não pôde ser confirmada. Confira a conexão.", 409);
        }
        let chatsResp = await getProvider(`/api/${effectiveSession}/chats?limit=100&offset=0&sortBy=conversationTimestamp&sortOrder=desc`);
        if (!chatsResp.ok) {
          chatsResp = await getProvider(`/api/${effectiveSession}/chats?limit=100&offset=0`);
        }
        if (chatsResp.status === 404 || !chatsResp.ok) {
          chatsResp = await getProvider(`/api/sessions/${effectiveSession}/chats?limit=100&offset=0`);
        }
        if (!chatsResp.ok) return providerError("O provedor não retornou as conversas. Tente novamente após conferir a conexão.");
        rawChats = await chatsResp.json();
        if (!Array.isArray(rawChats)) return providerError("O provedor retornou uma lista de conversas inválida. Nenhum histórico foi importado.");
      } catch {
        return providerError("Não foi possível consultar o histórico. Nenhuma conexão foi alterada.");
      }
      const customerChats = (rawChats as Array<{ id?: unknown; name?: unknown; pushName?: unknown; conversationTimestamp?: unknown }>).
        filter(chat => chat && historyPhone(chat.id)).slice(0, 100);
      let syncedChatsCount = 0, syncedMessagesCount = 0, failedChatsCount = 0, skippedMessagesCount = 0;
      let checkedChatsCount = 0;
      // A recent batch only: importing history never creates opportunities, emits inbox events or changes channel configuration.
      for (const chat of customerChats.slice(0, 35)) {
        if (Date.now() >= deadline) break;
        checkedChatsCount++;
        const phoneE164 = historyPhone(chat.id)!;
        try {
          const response = await getProvider(`/api/${effectiveSession}/chats/${encodeURIComponent(String(chat.id))}/messages?limit=15&offset=0&downloadMedia=false`);
          if (!response.ok) { failedChatsCount++; continue; }
          const rawMessages: unknown = await response.json();
          if (!Array.isArray(rawMessages)) { failedChatsCount++; continue; }
          const messages = rawMessages.slice(0, 15).map(message => parseHistoryMessage(message, validatedBaseUrl)).filter(message => message !== null);
          skippedMessagesCount += rawMessages.slice(0, 15).length - messages.length;
          const dates = [historyDate(chat.conversationTimestamp), ...messages.map(message => message.createdAt)].filter((date): date is Date => date !== null);
          if (!dates.length) { failedChatsCount++; continue; }
          const lastMessageAt = new Date(Math.max(...dates.map(date => date.getTime())));
          const contactName = [
            chat.name,
            chat.pushName,
            ...rawMessages.map(m => (m && typeof m === "object" ? (m as { pushName?: unknown; _data?: { pushName?: unknown } }).pushName || (m as { pushName?: unknown; _data?: { pushName?: unknown } })._data?.pushName : undefined))
          ].find(name => typeof name === "string" && name.trim()) as string | undefined;
          const importedCount = await withTenantTransaction(workspaceId, async client => {
            const member = (await client.query<{ role: string }>("SELECT role FROM public.workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE", [workspaceId, request.user.id])).rows[0];
            if (!member || !hasWorkspacePermission(member.role, "cockpit:access")) throw new Error("history_access_changed");
            const credential = (await client.query<{ id: string }>("SELECT id FROM public.provider_credentials WHERE workspace_id=$1 AND id=$2 AND status='ACTIVE' FOR SHARE", [workspaceId, channel.credential_id])).rows[0];
            if (!credential) throw new Error("history_channel_changed");
            const current = (await client.query<{ id: string }>(`SELECT id FROM public.channel_instances WHERE id=$1 AND workspace_id=$2 AND is_active=true AND status='connected' AND credential_id=$3 AND phone_number_e164 IS NOT DISTINCT FROM $4 FOR SHARE`, [channelId, workspaceId, channel.credential_id, channel.phone_number_e164])).rows[0];
            if (!current) throw new Error("history_channel_changed");
            const contact = (await client.query<{ id: string }>(`INSERT INTO public.contacts (workspace_id,phone_e164,name,metadata) VALUES ($1,$2,$3,'{}'::jsonb)
              ON CONFLICT (workspace_id,phone_e164) DO UPDATE SET name=CASE WHEN contacts.name IS NULL OR contacts.name=contacts.phone_e164 THEN EXCLUDED.name ELSE contacts.name END RETURNING id`, [workspaceId, phoneE164, contactName?.trim().slice(0, 200) || phoneE164])).rows[0]!;
            const thread = (await client.query<{ id: string }>(`INSERT INTO public.commercial_threads (workspace_id,channel_instance_id,contact_id,status,last_message_at) VALUES ($1,$2,$3,'active',$4)
              ON CONFLICT (workspace_id,channel_instance_id,contact_id) DO UPDATE SET last_message_at=GREATEST(commercial_threads.last_message_at,EXCLUDED.last_message_at) RETURNING id`, [workspaceId, channelId, contact.id, lastMessageAt])).rows[0]!;
            let insertedCount = 0;
            for (const message of messages) {
              const result = await client.query(`INSERT INTO public.messages (workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,media_url,metadata,provider_message_id,delivery_status,status_rank,created_at,updated_at)
                VALUES ($1,$2,$3,'waha',$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$14)
                ON CONFLICT (channel_instance_id,provider_message_id) DO NOTHING RETURNING id`, [workspaceId, channelId, thread.id, message.outbound ? "outbound" : "inbound", message.outbound ? ownPhone : phoneE164, message.outbound ? phoneE164 : ownPhone, message.contentType, message.body, message.mediaUrl, JSON.stringify({ waha_synced: true, fromMe: message.outbound, history_ack: message.ack, history_import_version: 2 }), message.id, message.deliveryStatus, message.statusRank, message.createdAt]);
              insertedCount += result.rowCount ?? 0;
            }
            return insertedCount;
          });
          syncedChatsCount++;
          syncedMessagesCount += importedCount;
        } catch (error) {
          failedChatsCount++;
          if (error instanceof Error && ["history_access_changed", "history_channel_changed"].includes(error.message)) break;
        }
      }
      const partial = failedChatsCount > 0 || skippedMessagesCount > 0 || checkedChatsCount < customerChats.length || (rawChats as unknown[]).length >= 100;
      const success = failedChatsCount === 0 || syncedChatsCount > 0;
      return reply.status(success ? 200 : 502).send({ success, partial, syncedChatsCount, syncedMessagesCount, failedChatsCount, skippedMessagesCount,
        message: `${syncedMessagesCount} novas mensagens importadas de ${syncedChatsCount} conversas. Lote recente: até 35 conversas e 15 mensagens por conversa; não representa o histórico completo.${partial ? ` Há pendências: ${failedChatsCount} conversas com falha, ${skippedMessagesCount} mensagens inválidas e/ou conversas fora deste lote.` : ""}`,
      });
    }
  );
};
