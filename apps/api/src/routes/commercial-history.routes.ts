import type {FastifyPluginAsync} from 'fastify';
import {z} from 'zod';
import {withTenantTransaction} from '@sos-sales/database';
const paramsSchema=z.object({workspaceId:z.string().uuid(),threadId:z.string().uuid()});
const querySchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(50),beforeOccurredAt:z.string().datetime({offset:true}).optional(),beforeEventId:z.string().max(100).regex(/^[a-z_]+:[0-9a-f-]{36}$/).optional()}).strict().refine(q=>Boolean(q.beforeOccurredAt)===Boolean(q.beforeEventId));
export const commercialHistoryRoutes:FastifyPluginAsync=async app=>{
 app.get('/v1/workspaces/:workspaceId/threads/:threadId/commercial-history',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('cockpit:access')]},async(request,reply)=>{
  const params=paramsSchema.safeParse(request.params),query=querySchema.safeParse(request.query);
  if(!params.success||!query.success)return reply.code(400).send({message:'Consulta do histórico inválida.'});
  const {workspaceId,threadId}=params.data,q=query.data;
  return withTenantTransaction(workspaceId,async client=>{
   if(!(await client.query('SELECT id FROM public.commercial_threads WHERE workspace_id=$1 AND id=$2',[workspaceId,threadId])).rows.length)return reply.code(404).send({message:'Conversa não encontrada nesta empresa.'});
   const journey=(await client.query<{id:string;title:string|null;stage:string}>('SELECT id,title,stage FROM public.commercial_journeys WHERE workspace_id=$1 AND thread_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[workspaceId,threadId])).rows[0]??null;
   const rows=(await client.query<{id:string;label:string;resource_type:string;resource_id:string;occurred_at:Date;cursor_time:string}>(`WITH events AS (
    SELECT 'journey_created:'||j.id AS id,'Oportunidade criada'::text AS label,'opportunity'::text AS resource_type,j.id AS resource_id,j.created_at AS occurred_at FROM public.commercial_journeys j WHERE j.workspace_id=$1 AND j.thread_id=$2
    UNION ALL SELECT 'outcome_recorded:'||o.id,CASE WHEN o.status='won' THEN 'Ganho registrado' ELSE 'Perda registrada' END,'outcome',o.id,o.created_at FROM public.commercial_outcomes o JOIN public.commercial_journeys j ON j.workspace_id=o.workspace_id AND j.id=o.journey_id WHERE o.workspace_id=$1 AND j.thread_id=$2
    UNION ALL SELECT 'proposal_created:'||p.id,'Proposta criada','proposal',p.id,p.created_at FROM public.commercial_proposals p WHERE p.workspace_id=$1 AND p.thread_id=$2
    UNION ALL SELECT 'proposal_sent:'||p.id,'Envio da proposta registrado','proposal',p.id,p.sent_at FROM public.commercial_proposals p WHERE p.workspace_id=$1 AND p.thread_id=$2 AND p.sent_at IS NOT NULL
    UNION ALL SELECT 'proposal_accepted:'||p.id,'Aceite da proposta registrado','proposal',p.id,p.accepted_at FROM public.commercial_proposals p WHERE p.workspace_id=$1 AND p.thread_id=$2 AND p.accepted_at IS NOT NULL
    UNION ALL SELECT 'proposal_rejected:'||p.id,'Recusa da proposta registrada','proposal',p.id,p.rejected_at FROM public.commercial_proposals p WHERE p.workspace_id=$1 AND p.thread_id=$2 AND p.rejected_at IS NOT NULL
    UNION ALL SELECT 'proposal_cancelled:'||p.id,'Cancelamento da proposta registrado','proposal',p.id,p.cancelled_at FROM public.commercial_proposals p WHERE p.workspace_id=$1 AND p.thread_id=$2 AND p.cancelled_at IS NOT NULL
    UNION ALL SELECT 'pix_created:'||p.id,'Cobrança Pix criada','payment',p.id,p.created_at FROM public.pix_charges p WHERE p.workspace_id=$1 AND p.thread_id=$2
    UNION ALL SELECT 'pix_verified:'||p.id,CASE WHEN p.verification_method='BANK_WEBHOOK' THEN 'Recebimento confirmado pelo provedor' ELSE 'Recebimento registrado no caixa' END,'payment',p.id,p.verified_at FROM public.pix_charges p WHERE p.workspace_id=$1 AND p.thread_id=$2 AND p.status='PAID' AND p.verified_at IS NOT NULL AND (p.verification_method='BANK_WEBHOOK' OR p.verification_method='MANUAL_CASHIER' AND p.verified_by_user_id IS NOT NULL)
    UNION ALL SELECT 'task_event:'||h.id,CASE h.action_type WHEN 'created' THEN 'Tarefa criada' WHEN 'assigned' THEN 'Responsável da tarefa alterado' WHEN 'rescheduled' THEN 'Tarefa reagendada' WHEN 'completed' THEN 'Tarefa concluída' WHEN 'cancelled' THEN 'Tarefa cancelada' ELSE 'Registro de tarefa' END,'task',h.action_id,h.created_at FROM public.commercial_action_history h JOIN public.commercial_actions a ON a.workspace_id=h.workspace_id AND a.id=h.action_id WHERE h.workspace_id=$1 AND a.thread_id=$2
   ) SELECT *,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM events WHERE ($3::timestamptz IS NULL OR (occurred_at,id)<($3::timestamptz,$4::text)) ORDER BY occurred_at DESC,id DESC LIMIT $5`,[workspaceId,threadId,q.beforeOccurredAt??null,q.beforeEventId??null,q.limit+1])).rows;
   const items=rows.slice(0,q.limit),last=items.at(-1),hasMore=rows.length>q.limit;
   return {journey,items:items.map(row=>({id:row.id,label:row.label,resourceType:row.resource_type,resourceId:row.resource_id,occurredAt:row.occurred_at.toISOString()})),pagination:{hasMore,nextCursor:hasMore&&last?{occurredAt:last.cursor_time,eventId:last.id}:null}};
  });
 });
};
