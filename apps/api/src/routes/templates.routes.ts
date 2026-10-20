import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { safeFetchWithSsrfGuard } from "@sos-sales/application";
import {
  META_GRAPH_API_VERSION,
  CANONICAL_TEMPLATE_LIBRARY,
  TEMPLATE_SEGMENTS,
  filterTemplateLibrary,
} from "@sos-sales/contracts";
import {
  withTenantTransaction,
  decryptPayload,
  parseKeyringFromEnv,
  listMessageTemplates,
  upsertMessageTemplate,
  type TemplateCategory,
  type TemplateStatus,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listTemplatesQuerySchema = z.object({
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]).optional(),
  status: z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED"]).optional(),
});

const templateButtonSchema = z.object({
  type: z.string().min(1),
  text: z.string().min(1),
  url: z.string().url().optional(),
  phone_number: z.string().optional(),
});

const createTemplateBodySchema = z.object({
  createOnly:z.boolean().default(true),
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9_]+$/, "Template name must contain only lowercase alphanumeric characters and underscores"),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().min(2).max(10).default("pt_BR"),
  headerText: z.string().max(60).nullable().optional(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).nullable().optional(),
  buttons: z.array(templateButtonSchema).optional(),
  variables: z.array(z.string()).optional(),
  status: z.enum(["APPROVED", "PENDING", "REJECTED", "PAUSED"]).default("PENDING"),
  metaTemplateId: z.string().optional(),
});

const generateTemplateBodySchema = z.object({
  objective: z.string().min(10).max(800),
  audience: z.string().min(2).max(200),
  tone: z.enum(["PROFESSIONAL", "FRIENDLY", "DIRECT"]).default("FRIENDLY"),
  strategy: z.enum(["UTILITY_TROJAN", "DIRECT_MARKETING"]).default("UTILITY_TROJAN"),
});

const generatedTemplateSchema = z.object({
  name: z.string().regex(/^[a-z0-9_]+$/).max(100),
  category: z.enum(["UTILITY", "MARKETING"]),
  headerText: z.string().max(60).nullable(),
  bodyText: z.string().min(1).max(1024),
  footerText: z.string().max(60).nullable(),
  buttonText: z.string().max(25).nullable(),
  variableLabels: z.array(z.string().max(60)).max(10),
  explanation: z.string().min(1).max(500),
});

export const templatesRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/workspaces/:workspaceId/templates/sync", {
    preHandler: [app.authenticate, app.requireWorkspaceContext, app.requirePermission("workspace:manage")],
  }, async (request, reply) => {
    const p = workspaceParamsSchema.safeParse(request.params);
    const b = z.object({ channelId: z.string().uuid(), language: z.string().min(2).max(10).default("pt_BR") }).safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ detail: "Empresa, canal ou idioma inválido" });
    const { workspaceId } = p.data;
    const source = await withTenantTransaction(workspaceId, async client => (await client.query(
      `SELECT c.id, pc.encrypted_payload, pc.iv, pc.auth_tag, pc.key_version
       FROM public.channel_instances c JOIN public.provider_credentials pc ON pc.id=c.credential_id AND pc.workspace_id=c.workspace_id
       WHERE c.workspace_id=$1 AND c.id=$2 AND c.provider='meta_waba' AND c.is_active=true
         AND c.status='connected' AND pc.status='ACTIVE'`, [workspaceId, b.data.channelId]
    )).rows[0]);
    if (!source) return reply.code(422).send({ detail: "Selecione um canal Meta conectado com credenciais ativas" });
    let token: string; let waba: string;
    try {
      const key = parseKeyringFromEnv()?.keyring || process.env.MCT_CREDENTIALS_MASTER_KEY;
      if (!key) throw new Error("Missing encryption key");
      const credentials = JSON.parse(decryptPayload(source.encrypted_payload, source.iv, source.auth_tag, key, { keyVersion: source.key_version }));
      token = credentials.access_token; waba = credentials.waba_account_id;
      if (!token || !waba) throw new Error("Missing provider credentials");
    } catch { return reply.code(503).send({ detail: "Credenciais Meta indisponíveis para consulta" }); }
    const remoteSchema = z.object({ id: z.string().regex(/^\d+$/), name: z.string().min(1), category: z.enum(["UTILITY","MARKETING","AUTHENTICATION"]), language: z.string(), status: z.string(), parameter_format:z.enum(["POSITIONAL","NAMED"]).default("POSITIONAL"), components: z.array(z.object({ type: z.string(), format:z.string().optional(), text: z.string().optional(), buttons: z.array(z.object({type:z.string(),text:z.string().optional(),url:z.string().optional(),phone_number:z.string().optional()})).optional() }).passthrough()).default([]) });
    const collected: z.infer<typeof remoteSchema>[] = [];
    let after: string | undefined;
    try {
      for (let page = 0; page < 10; page++) {
        const url = new URL(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(waba)}/message_templates`);
        url.searchParams.set("fields", "id,name,status,category,language,components"); url.searchParams.set("limit", "100");
        if (after) url.searchParams.set("after", after);
        const response = await safeFetchWithSsrfGuard(url.toString(), { headers: { Authorization: `Bearer ${token}` } }, { timeoutMs: 10000, allowLocalTest: false, allowedProtocols: ["https:"] });
        if (!response.ok) throw new Error("Provider query failed");
        const payload = z.object({ data: z.array(remoteSchema), paging: z.object({ next: z.string().optional(), cursors: z.object({ after: z.string().optional() }).optional() }).optional() }).parse(await response.json());
        collected.push(...payload.data);
        if (!payload.paging?.next) break;
        after = payload.paging.cursors?.after;
        if (!after || page === 9) throw new Error("Provider pagination incomplete");
      }
    } catch { return reply.code(502).send({ detail: "Consulta Meta não concluída; nenhum estado de aprovação foi atualizado" }); }
    const selected = collected.filter(tpl => tpl.language === b.data.language);
    await withTenantTransaction(workspaceId, async client => {
      // Invalidate previous proof from this channel, including templates removed at Meta.
      await client.query("UPDATE public.message_templates SET status='PENDING',meta_verified_at=NULL WHERE workspace_id=$1 AND meta_verified_channel_id=$2", [workspaceId,b.data.channelId]);
      for (const tpl of selected) {
        const body = tpl.components.find(c => c.type === "BODY")?.text;
        if (!body) continue;
        const record = await upsertMessageTemplate(client, {
          workspaceId, name: tpl.name, category: tpl.category, language: tpl.language,
          headerText: tpl.components.find(c => c.type === "HEADER")?.text,
          bodyText: body, footerText: tpl.components.find(c => c.type === "FOOTER")?.text,
          buttons: tpl.components.find(c => c.type === "BUTTONS")?.buttons?.map(button=>({...button,text:button.text??button.type})),
          providerComponents:tpl.components.map(c=>({type:c.type,...(c.format?{format:c.format}:{}),...(c.text?{text:c.text}:{}),...(c.buttons?{buttons:c.buttons}:{})})),
          parameterFormat:tpl.parameter_format,
          variables: Array.from(new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1]!))),
          status: (["APPROVED","PAUSED","REJECTED"].includes(tpl.status) ? tpl.status : "PENDING") as TemplateStatus, metaTemplateId: tpl.id,
        });
        await client.query("UPDATE public.message_templates SET meta_verified_at=now(),meta_verified_channel_id=$3 WHERE workspace_id=$1 AND id=$2", [workspaceId,record.id,b.data.channelId]);
      }
    });
    return { success: true, imported: selected.filter(t => t.components.some(c => c.type === "BODY" && c.text)).length, language: b.data.language };
  });

  app.post(
    "/v1/workspaces/:workspaceId/templates/generate",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      const parsedBody = generateTemplateBodySchema.safeParse(request.body);
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.success ? "Invalid workspaceId parameter" : parsedBody.error.issues[0]?.message,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) {
        return reply.status(503).send({
          type: "https://sos-sales.mct.br/errors/ai-unavailable",
          title: "AI assistant unavailable",
          status: 503,
          detail: "O assistente de criação ainda não foi configurado neste ambiente.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { objective, audience, tone, strategy = "UTILITY_TROJAN" } = parsedBody.data;
      const model = process.env.NVIDIA_TEMPLATE_MODEL || "nvidia/nemotron-3-super-120b-a12b";

      const systemPrompt = `Crie um rascunho de template WhatsApp fiel ao objetivo informado.
Não prometa aprovação, categoria definitiva, economia ou preço do provedor.
Não disfarce ofertas promocionais como avisos transacionais. Classifique pela finalidade real:
UTILITY apenas para informação operacional solicitada ou ligada a uma transação real; MARKETING para divulgação comercial.
Preferência de trabalho: ${strategy === "UTILITY_TROJAN" ? "avaliar se há finalidade transacional verdadeira; se não houver, usar MARKETING" : "mensagem comercial clara"}.
Não invente reserva, crédito, benefício, urgência ou vínculo comercial existente.
Use variáveis sequenciais {{1}}, {{2}} com finalidade indicada, botão curto e conteúdo claro.
Retorne somente JSON com name (snake_case), category (UTILITY ou MARKETING), headerText, bodyText, footerText,
buttonText, variableLabels (array) e explanation. Limites: headerText/footerText 60, bodyText 1024, buttonText 25 caracteres.
Explique a finalidade proposta e a necessidade de revisão e submissão ao provedor, sem prometer resultado.`;

      try {
        const aiResponse = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 1600,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: `Objetivo: ${objective}\nPúblico: ${audience}\nTom: ${tone}\nEstratégia: ${strategy}`,
              },
            ],
          }),
          signal: AbortSignal.timeout(45000),
        });
        if (!aiResponse.ok) throw new Error(`NVIDIA returned ${aiResponse.status}`);
        const payload = await aiResponse.json() as { choices?: Array<{ message?: { content?: string } }> };
        const raw = payload.choices?.[0]?.message?.content?.trim() || "";
        const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
        const candidate = JSON.parse(jsonText) as Record<string, unknown>;
        if (
          candidate.variableLabels &&
          typeof candidate.variableLabels === "object" &&
          !Array.isArray(candidate.variableLabels)
        ) {
          candidate.variableLabels = Object.entries(candidate.variableLabels as Record<string, unknown>)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([, value]) => String(value));
        }
        const generated = generatedTemplateSchema.parse(candidate);
        return reply.status(200).send({ generated, model });
      } catch (error) {
        const safeError = error instanceof Error
          ? { name: error.name, message: error.message }
          : { name: "UnknownError", message: String(error) };
        request.log.error({ aiError: safeError }, "WABA template AI generation failed");
        return reply.status(502).send({
          type: "https://sos-sales.mct.br/errors/ai-generation-failed",
          title: "AI generation failed",
          status: 502,
          detail: "A IA não conseguiu gerar um modelo válido agora. Tente novamente ou use um modelo facilitado.",
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );

  // 1. List message templates (with auto-seed of canonical templates if workspace is new)
  app.get(
    "/v1/workspaces/:workspaceId/templates",
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

      const parsedQuery = listTemplatesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid query parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { category, status } = parsedQuery.data;

      const templates = await withTenantTransaction(workspaceId, async (client) => {
        return listMessageTemplates(client, workspaceId, {
          category: category as TemplateCategory | undefined,
          status: status as TemplateStatus | undefined,
        });
      });

      return reply.status(200).send({
        templates: templates.map((t) => ({
          id: t.id,
          workspaceId: t.workspace_id,
          name: t.name,
          category: t.category,
          language: t.language,
          headerText: t.header_text,
          bodyText: t.body_text,
          footerText: t.footer_text,
          buttons: t.buttons,
          variables: t.variables,
          status: t.status,
          metaTemplateId: t.meta_template_id,
          providerComponents:t.provider_components??[],parameterFormat:t.parameter_format??"POSITIONAL",
          metaVerifiedAt:t.meta_verified_at?.toISOString()??null,metaVerifiedChannelId:t.meta_verified_channel_id??null,
          createdAt: t.created_at.toISOString(),
          updatedAt: t.updated_at.toISOString(),
        })),
        total: templates.length,
      });
    }
  );

  // 2. Register or update a message template
  app.post(
    "/v1/workspaces/:workspaceId/templates",
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

      const parsedBody = createTemplateBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        const issues = parsedBody.error.issues
          .map((i) => i.message || i.path.join("."))
          .join("; ");
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: `Request body validation failed: ${issues}`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const data = parsedBody.data;

      const template = await withTenantTransaction(workspaceId, async (client) => {
        const saved = data.createOnly ? (await client.query(`INSERT INTO public.message_templates(workspace_id,name,category,language,header_text,body_text,footer_text,buttons,variables,status,meta_template_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',NULL) ON CONFLICT(workspace_id,name) DO NOTHING RETURNING *`,[workspaceId,data.name,data.category,data.language,data.headerText??null,data.bodyText,data.footerText??null,JSON.stringify(data.buttons??[]),JSON.stringify(data.variables??[])])).rows[0] : await upsertMessageTemplate(client, {
          workspaceId,
          name: data.name,
          category: data.category as TemplateCategory,
          language: data.language,
          headerText: data.headerText,
          bodyText: data.bodyText,
          footerText: data.footerText,
          buttons: data.buttons,
          variables: data.variables,
          status: "PENDING",
          metaTemplateId: null,
        });
        if(!saved)return null;
        await client.query("UPDATE public.message_templates SET meta_template_id=NULL,meta_verified_at=NULL,meta_verified_channel_id=NULL WHERE workspace_id=$1 AND id=$2", [workspaceId,saved.id]);
        return { ...saved, meta_template_id: null };
      });

      if(!template)return reply.code(409).send({detail:"Já existe um modelo com este identificador. Escolha outro nome para preservar o modelo existente."});
      return reply.status(201).send({
        template: {
          id: template.id,
          workspaceId: template.workspace_id,
          name: template.name,
          category: template.category,
          language: template.language,
          headerText: template.header_text,
          bodyText: template.body_text,
          footerText: template.footer_text,
          buttons: template.buttons,
          variables: template.variables,
          status: template.status,
          metaTemplateId: template.meta_template_id,
          createdAt: template.created_at.toISOString(),
          updatedAt: template.updated_at.toISOString(),
        },
      });
    }
  );

  // 3. Get Canonical Template Library with rich niches, CTWA, and Pix
  app.get(
    "/v1/workspaces/:workspaceId/templates/library",
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
        return reply.status(400).send({ detail: "Invalid workspaceId parameter" });
      }
      const query = request.query as Record<string, string | undefined>;
      const items = filterTemplateLibrary({
        category: (query.category as any) || "ALL",
        segment: (query.segment as any) || "ALL",
        search: query.search || "",
      });
      return reply.status(200).send({
        items,
        total: items.length,
        segments: TEMPLATE_SEGMENTS,
      });
    }
  );

  // 4. One-Click Import from Canonical Library into Workspace
  app.post(
    "/v1/workspaces/:workspaceId/templates/library/import",
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
        return reply.status(400).send({ detail: "Invalid workspaceId parameter" });
      }
      const importSchema = z.object({
        templateId: z.string().min(1),
      });
      const parsedBody = importSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ detail: "Informe o templateId para importação" });
      }
      const { workspaceId } = parsedParams.data;
      const { templateId } = parsedBody.data;

      const found = CANONICAL_TEMPLATE_LIBRARY.find((t) => t.id === templateId);
      if (!found) {
        return reply.status(404).send({ detail: "Modelo não encontrado na biblioteca canônica" });
      }

      const imported = await withTenantTransaction(workspaceId, async (client) => {
        const existing = (
          await client.query(
            `SELECT id, name FROM public.message_templates WHERE workspace_id = $1 AND name = $2`,
            [workspaceId, found.name]
          )
        ).rows[0];

        let targetName = found.name;
        if (existing) {
          targetName = `${found.name}_${Date.now().toString().slice(-4)}`;
        }

        const saved = await upsertMessageTemplate(client, {
          workspaceId,
          name: targetName,
          category: found.category,
          language: "pt_BR",
          headerText: found.headerText,
          bodyText: found.bodyText,
          footerText: found.footerText,
          buttons: found.buttons,
          variables: found.variables,
          status: "PENDING",
          metaTemplateId: null,
        });

        return saved;
      });

      return reply.status(201).send({
        template: {
          id: imported.id,
          workspaceId: imported.workspace_id,
          name: imported.name,
          category: imported.category,
          language: imported.language,
          headerText: imported.header_text,
          bodyText: imported.body_text,
          footerText: imported.footer_text,
          buttons: imported.buttons,
          variables: imported.variables,
          status: imported.status,
          metaTemplateId: imported.meta_template_id,
          createdAt: imported.created_at.toISOString(),
          updatedAt: imported.updated_at.toISOString(),
        },
        message: "Modelo importado para o seu workspace com sucesso!",
      });
    }
  );
};
