import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction } from "@sos-sales/database";
const params=z.object({workspaceId:z.string().uuid()});
const label=z.string().trim().min(1).max(60).optional();
const body=z.object({expectedVersion:z.number().int().min(0),labels:z.object({lead:label,qualified:label,proposal:label,scheduled:label,won:label,lost:label}).strict()}).strict();
export const stageSettingsRoutes:FastifyPluginAsync=async app=>{
 const url="/v1/workspaces/:workspaceId/commercial/stage-labels";
 app.get(url,{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("cockpit:access")]},async(request,reply)=>{
  const p=params.safeParse(request.params);if(!p.success)return reply.code(400).send({detail:"Empresa inválida"});
  const result=await withTenantTransaction(p.data.workspaceId,async client=>(await client.query("SELECT commercial_stage_labels AS labels,commercial_stage_labels_version AS version FROM public.workspaces WHERE id=$1",[p.data.workspaceId])).rows[0]);
  if(!result)return reply.code(404).send({detail:"Empresa não encontrada"});return result;
 });
 app.put(url,{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")]},async(request,reply)=>{
  const p=params.safeParse(request.params),b=body.safeParse(request.body);if(!p.success||!b.success)return reply.code(400).send({detail:"Rótulos inválidos"});
  const result=await withTenantTransaction(p.data.workspaceId,async client=>(await client.query(`UPDATE public.workspaces SET commercial_stage_labels=$2::jsonb,commercial_stage_labels_version=commercial_stage_labels_version+1 WHERE id=$1 AND commercial_stage_labels_version=$3 RETURNING commercial_stage_labels AS labels,commercial_stage_labels_version AS version`,[p.data.workspaceId,JSON.stringify(b.data.labels),b.data.expectedVersion])).rows[0]);
  if(!result)return reply.code(409).send({detail:"As etapas mudaram; recarregue antes de salvar. Seu texto pode ser preservado para comparação."});return result;
 });
};
