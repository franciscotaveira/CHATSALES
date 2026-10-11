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
import { META_GRAPH_API_VERSION } from "@sos-sales/contracts";

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
  session: z.string().optional(),
  instanceName: z.string().optional(),
});

const createChannelBodySchema = z.object({
  provider: z.enum(["meta_waba", "waha", "evolution", "meta_messenger", "meta_instagram"]),
  displayName: z.string().min(2).max(100),
  phoneNumberE164: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number")
    .optional(),
  endpointToken: z.string().min(16).optional(),
  credentials: channelCredentialsSchema.optional(),
  waacId: z.string().optional(),
  pmaId: z.string().optional(),
  businessPortfolioId: z.string().optional(),
});

const updateChannelStatusBodySchema = z.object({
  status: z.enum(["unconfigured", "validating", "pairing", "connected", "error", "revoked"]),
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
          meta_billing_configured: boolean;
          meta_billing_account_id: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, workspace_id, provider, display_name, phone_number_e164, status, is_active, meta_billing_configured, meta_billing_account_id, created_at, updated_at
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
          metaBillingConfigured: Boolean(c.meta_billing_configured),
          metaBillingAccountId: c.meta_billing_account_id || null,
          environment: c.provider === "meta_waba" ? "production_certified" : "lab_local",
          createdAt: c.created_at,
          updatedAt: c.updated_at,
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

          return reply.status(200).send({
            success: true,
            verifiedName: data.verified_name || "Linha Comercial Meta Validada",
            displayPhoneNumber: data.display_phone_number,
            qualityRating: data.quality_rating || "GREEN",
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
            verifiedName: "WAHA Service Ativo",
            qualityRating: "GREEN",
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
            `${targetBaseUrl}/instance/fetchInstances`,
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

          return reply.status(200).send({
            success: true,
            verifiedName: "Evolution API v2 Ativa",
            qualityRating: "GREEN",
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
                  session: credentials.session?.trim() || "default",
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
             DO UPDATE SET
               encrypted_payload = EXCLUDED.encrypted_payload,
               iv = EXCLUDED.iv,
               auth_tag = EXCLUDED.auth_tag,
               key_version = EXCLUDED.key_version,
               status = 'ACTIVE',
               updated_at = NOW()
             RETURNING id;`,
            [workspaceId, provider, accountId, enc.encryptedBase64, enc.ivBase64, enc.authTagBase64, enc.keyVersion]
          );
          credentialId = credRes.rows[0]?.id || null;
        }

        // S-02: Honest Channel State Machine
        // Channels with credentials start in 'validating' (awaiting verified handshake)
        // Channels without credentials start in 'unconfigured'
        // Neither can start in 'connected' or 'pairing' without server adapter proof.
        const initialStatus = credentials ? "validating" : "unconfigured";

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
          [workspaceId, provider, displayName, phoneNumberE164 ?? null, tokenHash, credentialId, initialStatus, false]
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

      const revoked = await withTenantTransaction(workspaceId, async (client) => {
        const chanRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          credential_id: string | null;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = 'revoked', updated_at = NOW()
           WHERE id = $1 AND workspace_id = $2
           RETURNING id, provider, display_name, credential_id, status, is_active;`,
          [channelId, workspaceId]
        );

        const channel = chanRes.rows[0];
        if (!channel) {
          return null;
        }

        if (channel.credential_id) {
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

        try {
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
        } catch {
          // Non-blocking audit catch
        }

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
        message: `Canal '${revoked.display_name}' revogado com sucesso.`,
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

      const result = await withTenantTransaction(workspaceId, async (client) => {
        const chanRes = await client.query<{ id: string; display_name: string; credential_id: string | null }>(
          `SELECT id, display_name, credential_id FROM public.channel_instances WHERE id = $1 AND workspace_id = $2;`,
          [channelId, workspaceId]
        );
        const channel = chanRes.rows[0];
        if (!channel) return null;

        const msgRes = await client.query<{ count: string }>(
          `SELECT count(*)::text as count FROM public.messages WHERE channel_instance_id = $1 AND workspace_id = $2;`,
          [channelId, workspaceId]
        );
        const messageCount = Number.parseInt(msgRes.rows[0]?.count || "0", 10);

        if (messageCount > 0) {
          // Soft-archive to preserve financial and conversational integrity
          await client.query(
            `UPDATE public.channel_instances
             SET status = 'revoked', is_active = false, updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          if (channel.credential_id) {
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
          return { mode: "archived", displayName: channel.display_name, messageCount };
        } else {
          // Safe physical delete when 0 messages
          await client.query(
            `DELETE FROM public.channel_webhook_inbox WHERE channel_instance_id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          await client.query(
            `DELETE FROM public.outbound_commands WHERE channel_instance_id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          await client.query(
            `DELETE FROM public.provider_delivery_events WHERE channel_instance_id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          await client.query(
            `DELETE FROM public.commercial_threads WHERE channel_instance_id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          await client.query(
            `DELETE FROM public.channel_instances WHERE id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
          if (channel.credential_id) {
            const otherChannelsRes = await client.query<{ count: string }>(
              `SELECT count(*)::text as count FROM public.channel_instances
               WHERE credential_id = $1 AND id != $2 AND workspace_id = $3;`,
              [channel.credential_id, channelId, workspaceId]
            );
            const hasOtherReferences = Number.parseInt(otherChannelsRes.rows[0]?.count || "0", 10) > 0;
            if (!hasOtherReferences) {
              await client.query(
                `DELETE FROM public.provider_credentials WHERE id = $1 AND workspace_id = $2;`,
                [channel.credential_id, workspaceId]
              );
            }
          }
          return { mode: "deleted", displayName: channel.display_name, messageCount: 0 };
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
        message:
          result.mode === "deleted"
            ? `Canal '${result.displayName}' excluído definitivamente.`
            : `Canal '${result.displayName}' arquivado com sucesso (${result.messageCount} mensagens preservadas no histórico).`,
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

      const { workspaceId, channelId } = parsedParams.data;
      const { status } = parsedBody.data;

      // S-02: Client cannot directly set 'connected' or 'pairing'
      if (status === "connected" || status === "pairing") {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `Direct transition to '${status}' by client is prohibited. Server-side adapter verification is required via POST /verify-session or GET /qr-code.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        const chanRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = $1, updated_at = NOW()
           WHERE id = $2 AND workspace_id = $3
           RETURNING id, provider, display_name, status, is_active;`,
          [status, channelId, workspaceId]
        );
        return chanRes.rows[0] || null;
      });

      if (!updated) {
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
        channelId: updated.id,
        status: updated.status,
        isActive: updated.is_active,
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

      const bodySchema = z.object({
        metaBillingConfigured: z.boolean(),
        metaBillingAccountId: z.string().max(100).optional().nullable(),
      });
      const parsedBody = bodySchema.safeParse(request.body);
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

      const { workspaceId, channelId } = parsedParams.data;
      const { metaBillingConfigured, metaBillingAccountId } = parsedBody.data;

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          meta_billing_configured: boolean;
          meta_billing_account_id: string | null;
        }>(
          `UPDATE public.channel_instances
           SET meta_billing_configured = $1,
               meta_billing_account_id = $2,
               updated_at = NOW()
           WHERE id = $3 AND workspace_id = $4
           RETURNING id, provider, display_name, meta_billing_configured, meta_billing_account_id;`,
          [metaBillingConfigured, metaBillingAccountId || null, channelId, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel instance not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        channel: {
          id: updated.id,
          provider: updated.provider,
          displayName: updated.display_name,
          metaBillingConfigured: updated.meta_billing_configured,
          metaBillingAccountId: updated.meta_billing_account_id,
        },
      });
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

      const channel = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          credential_id: string | null;
          status: string;
          is_active: boolean;
        }>(
          `SELECT id, provider, display_name, credential_id, status, is_active
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
          } else if (process.env.ENABLE_LAB_SYNTHETIC === "true" || process.env.NODE_ENV === "test") {
            newStatus = "connected";
            handshakeDetail = "Synthetic Meta WABA verified";
          } else {
            const resp = await safeFetchWithSsrfGuard(
              `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,name_status,quality_rating`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                },
              },
              { timeoutMs: 8000, allowLocalTest: false, allowedProtocols: ["https:"] }
            );
            if (resp.ok) {
              newStatus = "connected";
              handshakeDetail = "Meta WABA phone number confirmed active";
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
          } else if (process.env.ENABLE_LAB_SYNTHETIC === "true" || process.env.NODE_ENV === "test") {
            newStatus = "connected";
            handshakeDetail = "Synthetic WAHA session verified";
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
          if (!baseUrl) {
            newStatus = "error";
            handshakeDetail = "Missing base_url for Evolution";
          } else if (process.env.ENABLE_LAB_SYNTHETIC === "true" || process.env.NODE_ENV === "test") {
            newStatus = "connected";
            handshakeDetail = "Synthetic Evolution verified";
          } else {
            const targetBaseUrl = validateEvolutionBaseUrl(baseUrl, allowLocal);
            const resp = await safeFetchWithSsrfGuard(
              `${targetBaseUrl}/instance/connectionState/${credentials.instance_name || "default"}`,
              { headers: apiKey ? { apikey: apiKey } : {} },
              { timeoutMs: 8000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
            );
            if (resp.ok) {
              const body = (await resp.json()) as any;
              const state = body?.instance?.state || body?.state;
              if (state === "open") {
                newStatus = "connected";
                handshakeDetail = "Evolution instance open and connected";
              } else if (state === "connecting" || state === "qrcode") {
                newStatus = "pairing";
                handshakeDetail = "Evolution instance connecting / QR code ready";
              } else {
                newStatus = "error";
                handshakeDetail = `Evolution instance state: ${state}`;
              }
            } else {
              newStatus = "error";
              handshakeDetail = `Evolution returned HTTP ${resp.status}`;
            }
          }
        }
      } catch (err) {
        newStatus = "error";
        handshakeDetail = err instanceof Error ? err.message : "Network/adapter error during handshake";
      }

      const updatedChannel = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          status: string;
          is_active: boolean;
        }>(
          `UPDATE public.channel_instances
           SET status = $1, is_active = ($1 = 'connected'), updated_at = NOW()
           WHERE id = $2 AND workspace_id = $3
           RETURNING id, provider, display_name, status, is_active;`,
          [newStatus, channelId, workspaceId]
        );
        return res.rows[0];
      });

      if (!updatedChannel) {
        return reply.status(404).send({
          error: "CHANNEL_NOT_FOUND",
          message: "Channel not found in workspace",
        });
      }

      return reply.status(200).send({
        success: newStatus === "connected",
        channelId: updatedChannel.id,
        status: updatedChannel.status,
        isActive: updatedChannel.is_active,
        handshakeDetail,
      });
    }
  );

  // 5. Get WAHA Safe QR Code (Strictly local flow, zero token exposure in browser)
  app.get(
    "/v1/workspaces/:workspaceId/channels/:channelId/qr-code",
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
      const query = request.query as { force?: string } | undefined;
      const isForceRestart = query?.force === "true";

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

      if (channel.provider !== "waha") {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `QR Code generation is only supported for WAHA channels (current provider: ${channel.provider})`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (channel.status === "revoked") {
        return reply.status(409).send({
          type: "https://sos-sales.mct.br/errors/conflict",
          title: "Conflict",
          status: 409,
          detail: "Channel is inactive or revoked. Re-validation required.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      // Simulated or test lab mode
      if (process.env.MCT_SIMULATE_WAHA_QR === "true" || process.env.NODE_ENV === "test") {
        await withTenantTransaction(workspaceId, async (client) => {
          await client.query(
            `UPDATE public.channel_instances
             SET status = 'pairing', updated_at = NOW()
             WHERE id = $1 AND workspace_id = $2 AND status != 'connected';`,
            [channelId, workspaceId]
          );
        });

        return reply.status(200).send({
          success: true,
          status: "SCAN_QR_CODE",
          qrDataUri:
            "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><rect width='200' height='200' fill='%23fff'/><text x='100' y='105' text-anchor='middle' font-size='12' fill='%23000'>QR Code WAHA Seguro (Lab)</text></svg>",
          isSimulated: true,
          message:
            "QR Code gerado localmente pelo fluxo seguro do WAHA sem exposição de tokens.",
        });
      }

      if (!channel.credential_id) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "WAHA channel does not have associated credentials",
          instance: request.url,
          correlationId: request.id,
        });
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
           WHERE id = $1 AND workspace_id = $2;`,
          [channel.credential_id, workspaceId]
        );
        return res.rows[0] || null;
      });

      if (!credRow) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Channel credentials not found",
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
          detail: "Failed to decrypt channel credentials safely",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!creds.base_url) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "WAHA credentials missing base_url",
          instance: request.url,
          correlationId: request.id,
        });
      }

      let validatedBaseUrl: string;
      try {
        validatedBaseUrl = validateWahaBaseUrl(
          creds.base_url,
          process.env.NODE_ENV !== "production"
        );
      } catch (err) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "SSRF Violation",
          status: 400,
          detail: err instanceof Error ? err.message : "SSRF validation failed",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const sessionName = creds.session || "default";
      const allowLocal =
        process.env.NODE_ENV !== "production" ||
        process.env.ENABLE_LAB_SYNTHETIC === "true" ||
        process.env.ALLOW_LOCAL_NETWORK_CHANNELS === "true";

      const authHeaders: Record<string, string> = creds.api_key ? { "X-Api-Key": creds.api_key } : {};
      const webhookUrl = `${process.env.INTERNAL_API_URL || "http://chat-sales-api:4400"}/v1/webhooks/whatsapp/chan-${channel.id}`;

      // 1. First probe session status from WAHA to check if already authenticated
      let effectiveSession = sessionName;
      let isAlreadyWorking = false;
      let sessionMe: { id?: string; pushName?: string } | null = null;
      let sessionExists = false;
      let currentSessionStatus = "UNKNOWN";

      try {
        const sessionsListResp = await safeFetchWithSsrfGuard(
          `${validatedBaseUrl}/api/sessions`,
          { headers: authHeaders },
          { timeoutMs: 5000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
        );
        if (sessionsListResp.ok) {
          const sessions = (await sessionsListResp.json()) as Array<{
            name: string;
            status: string;
            me?: { id?: string; pushName?: string };
          }>;
          const cleanPhone = channel.phone_number_e164?.replace(/\D/g, "") || "";
          const matchedSession =
            sessions.find((s) => s.name === sessionName) ||
            (cleanPhone ? sessions.find((s) => s.me?.id?.includes(cleanPhone)) : null) ||
            (sessions.length === 1 && sessions[0]?.status === "WORKING" ? sessions[0] : null);

          if (matchedSession) {
            sessionExists = true;
            effectiveSession = matchedSession.name;
            currentSessionStatus = matchedSession.status;
            if (matchedSession.status === "WORKING") {
              isAlreadyWorking = true;
              sessionMe = matchedSession.me || null;
            }
          }
        }
      } catch {
        // Fallback to QR attempt / auto-heal
      }

      if (isAlreadyWorking && !isForceRestart) {
        await withTenantTransaction(workspaceId, async (client) => {
          await client.query(
            `UPDATE public.channel_instances
             SET status = 'connected', is_active = true, updated_at = clock_timestamp()
             WHERE id = $1 AND workspace_id = $2;`,
            [channel.id, workspaceId]
          );
        });

        return reply.status(200).send({
          success: true,
          status: "CONNECTED",
          alreadyConnected: true,
          message: "Canal já está autenticado e operacional no WhatsApp.",
          me: sessionMe,
          isSimulated: false,
        });
      }

      // 2. Auto-Provision or Heal Session in WAHA
      try {
        if (!sessionExists) {
          // Provision session with automated webhook registration
          await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/sessions`,
            {
              method: "POST",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                name: effectiveSession,
                config: {
                  webhooks: [
                    {
                      url: webhookUrl,
                      events: ["message", "message.any", "session.status"],
                      customHeaders: creds.api_key ? [{ name: "x-api-key", value: creds.api_key }] : [],
                    },
                  ],
                },
              }),
            },
            { timeoutMs: 6000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );

          await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/sessions/${effectiveSession}/start`,
            {
              method: "POST",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({ name: effectiveSession }),
            },
            { timeoutMs: 6000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );
          await new Promise((r) => setTimeout(r, 1200));
        } else if (isForceRestart || currentSessionStatus === "FAILED" || currentSessionStatus === "STOPPED") {
          // Clean stop first to reset any hung websocket
          try {
            await safeFetchWithSsrfGuard(
              `${validatedBaseUrl}/api/sessions/${effectiveSession}/stop`,
              {
                method: "POST",
                headers: { ...authHeaders, "Content-Type": "application/json" },
              },
              { timeoutMs: 5000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
            );
          } catch {
            // non-fatal
          }
          await new Promise((r) => setTimeout(r, 600));

          await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/sessions/${effectiveSession}/start`,
            {
              method: "POST",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({ name: effectiveSession }),
            },
            { timeoutMs: 6000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );
          await new Promise((r) => setTimeout(r, 1200));
        }
      } catch {
        // non-fatal: proceed to QR attempt
      }

      // 3. Resilient QR Code Retrieval with Automatic Single Retry
      const fetchQr = async () => {
        let resp = await safeFetchWithSsrfGuard(
          `${validatedBaseUrl}/api/${effectiveSession}/auth/qr`,
          { headers: authHeaders },
          { timeoutMs: 12000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
        );

        if (resp.status === 404) {
          resp = await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/sessions/${effectiveSession}/auth/qr`,
            { headers: authHeaders },
            { timeoutMs: 12000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );
        }
        return resp;
      };

      try {
        let resp = await fetchQr();

        // If not ready on first try (engine still bootstrapping), give a brief grace window
        if (!resp.ok && (resp.status === 404 || resp.status === 500)) {
          await new Promise((r) => setTimeout(r, 1500));
          resp = await fetchQr();
        }

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          if (errBody.includes("WORKING")) {
            await withTenantTransaction(workspaceId, async (client) => {
              await client.query(
                `UPDATE public.channel_instances
                 SET status = 'connected', is_active = true, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2;`,
                [channel.id, workspaceId]
              );
            });
            return reply.status(200).send({
              success: true,
              status: "CONNECTED",
              alreadyConnected: true,
              message: "Canal já está autenticado e operacional.",
              isSimulated: false,
            });
          }

          // If still starting, inform frontend gracefully so it can auto-poll without an error alert
          return reply.status(200).send({
            success: true,
            status: "STARTING",
            message: "Inicializando motor WhatsApp no servidor. O QR Code estará disponível em instantes.",
            isSimulated: false,
          });
        }

        const contentType = resp.headers.get("content-type") || "";
        if (contentType.includes("image/")) {
          const arrayBuffer = await resp.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          return reply.status(200).send({
            success: true,
            status: "SCAN_QR_CODE",
            qrDataUri: `data:${contentType};base64,${base64}`,
            isSimulated: false,
          });
        }

        const data = (await resp.json()) as { qr?: string; message?: string };
        return reply.status(200).send({
          success: true,
          status: "SCAN_QR_CODE",
          qr: data.qr,
          isSimulated: false,
        });
      } catch (err: unknown) {
        const isSsrf = err instanceof Error && (err.message.includes("SSRF") || err.message.includes("BLOCKED"));
        if (isSsrf) {
          return reply.status(400).send({
            type: "https://sos-sales.mct.br/errors/bad-request",
            title: "SSRF Violation",
            status: 400,
            detail: (err as Error).message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        return reply.status(200).send({
          success: false,
          status: "TIMEOUT",
          error: "O WhatsApp demorou para responder. Clique em 'Gerar Novo QR Code' para tentar novamente.",
          isSimulated: false,
        });
      }
    }
  );

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

      if (channel.provider !== "waha") {
        return reply.status(200).send({
          success: true,
          syncedChatsCount: 0,
          syncedMessagesCount: 0,
          message: `Sincronização histórica ativa suportada via WAHA (WhatsApp Web). O canal ${channel.provider} opera via webhooks em tempo real.`,
        });
      }

      if (channel.status === "revoked" || !channel.credential_id) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Canal revogado ou sem credenciais associadas.",
          instance: request.url,
          correlationId: request.id,
        });
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
           WHERE id = $1 AND workspace_id = $2;`,
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

      const effectiveSession = creds.session || "default";
      const authHeaders: Record<string, string> = {};
      if (creds.api_key) {
        authHeaders["X-Api-Key"] = creds.api_key;
      }

      // 0. Verify Session Status in WAHA before attempting sync
      let sessionStatus = "UNKNOWN";
      try {
        const sessionResp = await safeFetchWithSsrfGuard(
          `${validatedBaseUrl}/api/sessions/${effectiveSession}`,
          { headers: authHeaders },
          { timeoutMs: 8000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
        );
        if (sessionResp.ok) {
          const sData = (await sessionResp.json()) as { status?: string };
          sessionStatus = sData.status || "UNKNOWN";
        }
      } catch {
        // Non-blocking fallback
      }

      if (sessionStatus === "STOPPED" || sessionStatus === "FAILED") {
        // Try starting session
        try {
          await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/sessions/${effectiveSession}/start`,
            {
              method: "POST",
              headers: { ...authHeaders, "Content-Type": "application/json" },
            },
            { timeoutMs: 6000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );
          await new Promise((r) => setTimeout(r, 1200));
          const retryResp = await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/sessions/${effectiveSession}`,
            { headers: authHeaders },
            { timeoutMs: 5000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );
          if (retryResp.ok) {
            const retryData = (await retryResp.json()) as { status?: string };
            sessionStatus = retryData.status || sessionStatus;
          }
        } catch {
          // ignore
        }
      }

      if (sessionStatus !== "WORKING") {
        await withTenantTransaction(workspaceId, async (client) => {
          await client.query(
            `UPDATE public.channel_instances
             SET status = 'pairing', updated_at = clock_timestamp()
             WHERE id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
        });

        return reply.status(200).send({
          success: false,
          status: "NEEDS_QR_CODE",
          syncedChatsCount: 0,
          syncedMessagesCount: 0,
          message: "A sessão do WhatsApp precisa de autenticação. Clique no botão 'QR Code' para conectar seu celular.",
        });
      }

      // Ensure channel instance is marked connected
      if (channel.status !== "connected") {
        await withTenantTransaction(workspaceId, async (client) => {
          await client.query(
            `UPDATE public.channel_instances
             SET status = 'connected', is_active = true, updated_at = clock_timestamp()
             WHERE id = $1 AND workspace_id = $2;`,
            [channelId, workspaceId]
          );
        });
      }

      // 1. Fetch Chats from WAHA
      let chatsResp = await safeFetchWithSsrfGuard(
        `${validatedBaseUrl}/api/${effectiveSession}/chats`,
        { headers: authHeaders },
        { timeoutMs: 15000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
      );

      if (chatsResp.status === 404) {
        chatsResp = await safeFetchWithSsrfGuard(
          `${validatedBaseUrl}/api/sessions/${effectiveSession}/chats`,
          { headers: authHeaders },
          { timeoutMs: 15000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
        );
      }

      if (!chatsResp.ok) {
        const errText = await chatsResp.text().catch(() => "");
        return reply.status(502).send({
          type: "https://sos-sales.mct.br/errors/bad-gateway",
          title: "Bad Gateway",
          status: 502,
          detail: `Falha ao obter conversas do WhatsApp (WAHA): ${chatsResp.status} ${errText}`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const rawChats = (await chatsResp.json()) as Array<{
        id: string;
        name?: string;
        pushName?: string;
        conversationTimestamp?: number;
      }>;

      // Filter direct commercial chats (@c.us only, ignore groups / newsletters)
      const customerChats = (Array.isArray(rawChats) ? rawChats : [])
        .filter((c) => typeof c?.id === "string" && c.id.endsWith("@c.us"))
        .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0))
        .slice(0, 100);

      let syncedChatsCount = 0;
      let syncedMessagesCount = 0;

      const syncedChatEntries: Array<{
        chatId: string;
        threadId: string;
        phoneE164: string;
      }> = [];

      // 2. Upsert Contacts & Commercial Threads & Journeys
      await withTenantTransaction(workspaceId, async (client) => {
        for (const chat of customerChats) {
          const rawDigits = chat.id.replace(/@.*$/, "").replace(/\D/g, "");
          if (rawDigits.length < 8 || rawDigits.length > 15) continue;
          const phoneE164 = `+${rawDigits}`;
          if (!/^\+[1-9][0-9]{6,14}$/.test(phoneE164)) continue;

          const contactName = chat.name?.trim() || chat.pushName?.trim() || phoneE164;
          const rawTs = chat.conversationTimestamp;
          const lastMsgDate = rawTs ? new Date(rawTs * (rawTs < 1e11 ? 1000 : 1)) : new Date();

          // Upsert contact
          const contactRes = await client.query<{ id: string }>(
            `INSERT INTO public.contacts (workspace_id, phone_e164, name, metadata)
             VALUES ($1, $2, $3, '{}'::jsonb)
             ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET
               name = CASE
                 WHEN contacts.name IS NULL OR contacts.name = contacts.phone_e164 THEN EXCLUDED.name
                 ELSE contacts.name
               END,
               updated_at = clock_timestamp()
             RETURNING id;`,
            [workspaceId, phoneE164, contactName]
          );
          const contactId = contactRes.rows[0]?.id;
          if (!contactId) continue;

          // Upsert commercial thread
          const threadRes = await client.query<{ id: string }>(
            `INSERT INTO public.commercial_threads (
               workspace_id, channel_instance_id, contact_id, status, last_message_at
             ) VALUES (
               $1, $2, $3, 'active', $4
             )
             ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET
               last_message_at = GREATEST(commercial_threads.last_message_at, EXCLUDED.last_message_at),
               updated_at = clock_timestamp()
             RETURNING id;`,
            [workspaceId, channelId, contactId, lastMsgDate]
          );
          const threadId = threadRes.rows[0]?.id;
          if (!threadId) continue;

          // Ensure commercial journey exists
          await client.query(
            `INSERT INTO public.commercial_journeys (
               workspace_id, contact_id, thread_id, title, stage, status, attribution_source, created_at, updated_at
             )
             SELECT $1, $2, $3, 'Oportunidade WhatsApp', 'lead', 'open', 'organic_whatsapp', $4, clock_timestamp()
             WHERE NOT EXISTS (
               SELECT 1 FROM public.commercial_journeys WHERE workspace_id = $1 AND contact_id = $2
             );`,
            [workspaceId, contactId, threadId, lastMsgDate]
          );

          syncedChatsCount++;
          syncedChatEntries.push({ chatId: chat.id, threadId, phoneE164 });
        }
      });

      // 3. For the top 35 active chats, fetch recent messages and import
      const activeSubset = syncedChatEntries.slice(0, 35);
      for (const entry of activeSubset) {
        try {
          const msgsResp = await safeFetchWithSsrfGuard(
            `${validatedBaseUrl}/api/${effectiveSession}/chats/${encodeURIComponent(entry.chatId)}/messages?limit=15`,
            { headers: authHeaders },
            { timeoutMs: 8000, allowLocalTest: allowLocal, allowedProtocols: ["http:", "https:"] }
          );

          if (!msgsResp.ok) continue;

          const rawMsgs = (await msgsResp.json()) as Array<{
            id?: string;
            body?: string;
            fromMe?: boolean;
            timestamp?: number;
            hasMedia?: boolean;
            media?: { url?: string; mimetype?: string };
          }>;

          if (!Array.isArray(rawMsgs) || rawMsgs.length === 0) continue;

          await withTenantTransaction(workspaceId, async (client) => {
            for (const m of rawMsgs) {
              if (!m?.id) continue;
              const isOutbound = Boolean(m.fromMe);
              const direction = isOutbound ? "outbound" : "inbound";
              const senderE164 = isOutbound
                ? channel.phone_number_e164 || "+554988370054"
                : entry.phoneE164;
              const recipientE164 = isOutbound
                ? entry.phoneE164
                : channel.phone_number_e164 || "+554988370054";

              const rawTime = m.timestamp;
              const msgDate = rawTime
                ? new Date(rawTime * (rawTime < 1e11 ? 1000 : 1))
                : new Date();

              const contentType = m.hasMedia
                ? m.media?.mimetype?.startsWith("image")
                  ? "image"
                  : m.media?.mimetype?.startsWith("audio")
                  ? "audio"
                  : "document"
                : "text";

              const body = m.body || (m.hasMedia ? "[Mídia]" : "");
              const mediaUrl = m.media?.url || null;
              const metadata = JSON.stringify({ waha_synced: true, fromMe: isOutbound });
              const deliveryStatus = isOutbound ? "delivered" : "read";
              const statusRank = isOutbound ? 10 : 20;

              const inserted = await client.query(
                `INSERT INTO public.messages (
                   workspace_id, channel_instance_id, thread_id, provider, direction,
                   sender_e164, recipient_e164, content_type, body, media_url,
                   metadata, provider_message_id, delivery_status, status_rank, created_at, updated_at
                 ) VALUES (
                   $1, $2, $3, 'waha', $4,
                   $5, $6, $7, $8, $9,
                   $10::jsonb, $11, $12, $13, $14, $14
                 )
                 ON CONFLICT (channel_instance_id, provider_message_id) DO NOTHING
                 RETURNING id;`,
                [
                  workspaceId,
                  channelId,
                  entry.threadId,
                  direction,
                  senderE164,
                  recipientE164,
                  contentType,
                  body,
                  mediaUrl,
                  metadata,
                  String(m.id),
                  deliveryStatus,
                  statusRank,
                  msgDate,
                ]
              );

              if ((inserted.rowCount ?? 0) > 0) {
                syncedMessagesCount++;
              }
            }
          });
        } catch {
          // Non-blocking per chat failure
        }
      }

      const msgDetail = syncedMessagesCount > 0
        ? `${syncedMessagesCount} novas mensagens importadas`
        : "mensagens já estavam em dia";

      return reply.status(200).send({
        success: true,
        syncedChatsCount,
        syncedMessagesCount,
        message: `${syncedChatsCount} conversas sincronizadas com sucesso (${msgDetail}).`,
      });
    }
  );
};

