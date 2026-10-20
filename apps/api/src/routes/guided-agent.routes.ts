import type { FastifyPluginAsync } from "fastify";
import { z, guidedDraftSchema, guidedChecks, guidedScenarios, type GuidedRecord } from "@sos-sales/contracts";
import { withTenantTransaction } from "@sos-sales/database";
const params = z.object({ workspaceId: z.string().uuid() });
const saveSchema = z.object({ expectedRevision: z.number().int().min(0), draft: guidedDraftSchema }).strict();
const reviewSchema = z.object({ expectedRevision: z.number().int().positive(), scenarioId: z.string().min(1).max(100), note: z.string().trim().min(10).max(1000) }).strict();
const approveSchema = z.object({ expectedRevision: z.number().int().positive(), acknowledgeAssistedTestOnly: z.literal(true) }).strict();
const columns = `revision, draft, reviews, approved_revision AS "approvedRevision", approved_by AS "approvedBy", approved_at AS "approvedAt"`;
export const guidedAgentRoutes: FastifyPluginAsync = async app => {
  const auth = [app.authenticate, app.requireWorkspaceContext, app.requirePermission("workspace:manage")];
  const url = "/v1/workspaces/:workspaceId/guided-agent";
  app.get(url, { preHandler: auth }, async (request, reply) => {
    const p = params.safeParse(request.params);
    if (!p.success) return reply.code(400).send({ detail: "Empresa inválida" });
    const plan = await withTenantTransaction(p.data.workspaceId, async client => (await client.query<GuidedRecord>(`SELECT ${columns} FROM public.guided_agent_plans WHERE workspace_id=$1`, [p.data.workspaceId])).rows[0] ?? null);
    return { plan };
  });
  app.put(url, { preHandler: auth }, async (request, reply) => {
    const p = params.safeParse(request.params); const b = saveSchema.safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ detail: "Rascunho inválido" });
    const plan = await withTenantTransaction(p.data.workspaceId, async client => {
      // Serialize initial creation as well as updates; stale clients cannot overwrite.
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`guided-plan:${p.data.workspaceId}`]);
      const current = (await client.query<GuidedRecord>(`SELECT ${columns} FROM public.guided_agent_plans WHERE workspace_id=$1 FOR UPDATE`, [p.data.workspaceId])).rows[0];
      if ((current?.revision ?? 0) !== b.data.expectedRevision) return null;
      const result = await client.query<GuidedRecord>(`INSERT INTO public.guided_agent_plans (workspace_id,draft) VALUES ($1,$2::jsonb)
        ON CONFLICT (workspace_id) DO UPDATE SET draft=EXCLUDED.draft, revision=guided_agent_plans.revision+1, reviews='{}'::jsonb,
        approved_revision=NULL, approved_by=NULL, approved_at=NULL, updated_at=now() RETURNING ${columns}`, [p.data.workspaceId, JSON.stringify(b.data.draft)]);
      return result.rows[0];
    });
    if (!plan) return reply.code(409).send({ detail: "O plano mudou. Recarregue antes de salvar; seu texto continua na tela." });
    return { plan };
  });
  for (const action of ["review", "approve"] as const) app.post(`${url}/${action}`, { preHandler: auth }, async (request, reply) => {
    const p = params.safeParse(request.params);
    const b = action === "review" ? reviewSchema.safeParse(request.body) : approveSchema.safeParse(request.body);
    if (!p.success || !b.success) return reply.code(400).send({ detail: "Revisão inválida" });
    const outcome = await withTenantTransaction(p.data.workspaceId, async client => {
      const current = (await client.query<GuidedRecord>(`SELECT ${columns} FROM public.guided_agent_plans WHERE workspace_id=$1 FOR UPDATE`, [p.data.workspaceId])).rows[0];
      if (!current || current.revision !== b.data.expectedRevision) return { code: 409, detail: "Versão mudou. Recarregue o plano antes de revisar." };
      if (action === "review") {
        const review = reviewSchema.parse(b.data);
        if (!guidedScenarios(current.draft).some(s => s.id === review.scenarioId)) return { code: 400, detail: "Cenário não pertence a esta versão" };
        const result = await client.query<GuidedRecord>(`UPDATE public.guided_agent_plans SET reviews=reviews || $2::jsonb,
          approved_revision=NULL, approved_by=NULL, approved_at=NULL, updated_at=now() WHERE workspace_id=$1 RETURNING ${columns}`,
          [p.data.workspaceId, JSON.stringify({ [review.scenarioId]: review.note })]);
        return { plan: result.rows[0] };
      }
      if (guidedChecks(current.draft).some(c => !c.passed) || guidedScenarios(current.draft).some(s => !current.reviews[s.id]?.trim()))
        return { code: 422, detail: "Complete a configuração e registre a revisão de todos os cenários desta versão." };
      const result = await client.query<GuidedRecord>(`UPDATE public.guided_agent_plans SET approved_revision=revision, approved_by=$2,
        approved_at=now(), updated_at=now() WHERE workspace_id=$1 RETURNING ${columns}`, [p.data.workspaceId, request.user!.id]);
      return { plan: result.rows[0] };
    });
    if ("code" in outcome) return reply.code(outcome.code!).send({ detail: outcome.detail });
    return outcome;
  });
};
