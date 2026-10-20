import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listCommercialThreads,
  listThreadMessages,
  updateCommercialThreadStatus,
  type CommercialThreadStatus,
  type CommercialThreadWithContactRecord,
} from "@sos-sales/database";

export const formatThread=(t:CommercialThreadWithContactRecord)=>({
          id: t.id,
          workspaceId: t.workspace_id,
          channelInstanceId: t.channel_instance_id,
          channelProvider: t.channel_provider,
          channelName: t.channel_name,
          contactId: t.contact_id,
          contactPhone: t.contact_phone,
          contactName: t.contact_name,
          status: t.status,
          handoffReason: t.handoff_reason ?? null,
          handoffAt: t.handoff_at ? t.handoff_at.toISOString() : null,
          lastMessageAt: t.last_message_at,
          lastMessage: t.last_message_created_at
            ? {
                body: t.last_message_body ?? "",
                direction: t.last_message_direction,
                createdAt: t.last_message_created_at,
                deliveryStatus: t.last_message_delivery_status,
              }
            : null,
          nextAction: t.next_action_id
            ? {
                id: t.next_action_id,
                title: t.next_action_title,
                dueAt: t.next_action_due_at ? t.next_action_due_at.toISOString() : null,
                status: t.next_action_status,
                assigneeUserId: t.next_action_assignee_id,
              }
            : null,
          fepExpiresAt: t.fep_expires_at ? t.fep_expires_at.toISOString() : null,
          attributionSource: t.attribution_source ?? null,
          journeyStage: t.journey_stage ?? null,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        });

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const threadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const listThreadsQuerySchema = z.object({
  status: z
    .enum(["open", "active", "waiting_client", "waiting_human", "closed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  needsAttention: z.enum(["true","false"]).transform(value=>value==="true").optional(),
  beforeActivityAt:z.string().datetime({offset:true}).optional(),beforeId:z.string().uuid().optional(),search:z.string().trim().max(200).optional(),channelInstanceId:z.string().uuid().optional(),
}).refine(query=>Boolean(query.beforeActivityAt)===Boolean(query.beforeId),{message:'Cursor incompleto.'});

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  ascending: z.coerce.boolean().default(true),
});

const updateThreadBodySchema = z.object({
  status: z.enum(["active", "waiting_client", "waiting_human", "closed"]),
});

export const threadsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List Commercial Threads for Workspace
  app.get(
    "/v1/workspaces/:workspaceId/threads",
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

      const parsedQuery = listThreadsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedQuery.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { status, limit, needsAttention,beforeActivityAt,beforeId,search,channelInstanceId } = parsedQuery.data;

      const rows = await withTenantTransaction(workspaceId, async (client) => {
        return listCommercialThreads(client, {
          workspaceId,
          status,
          limit:limit+1,
          needsAttention,beforeActivityAt,beforeId,search,channelInstanceId,
        });
      });

      const threads=rows.slice(0,limit),last=threads.at(-1),hasMore=rows.length>limit;
      return reply.status(200).send({
        pagination:{hasMore,nextCursor:hasMore&&last?{activityAt:last.activity_cursor,id:last.id}:null},
        threads: threads.map(formatThread),
        total: threads.length,
      });
    }
  );

  app.get('/v1/workspaces/:workspaceId/threads/:threadId',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('cockpit:access')]},async(request,reply)=>{
    const parsed=threadParamsSchema.safeParse(request.params);if(!parsed.success)return reply.code(400).send({detail:'Conversa inválida.'});
    const {workspaceId,threadId}=parsed.data;const row=await withTenantTransaction(workspaceId,async client=>(await listCommercialThreads(client,{workspaceId,threadId,limit:1}))[0]);
    if(!row)return reply.code(404).send({detail:'Conversa não encontrada nesta empresa.'});return {thread:formatThread(row)};
  });

  // 2. List Messages for Thread
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/messages",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid route parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedQuery = listMessagesQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedQuery.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const { limit, ascending } = parsedQuery.data;

      const messages = await withTenantTransaction(workspaceId, async (client) => {
        return listThreadMessages(client, {
          workspaceId,
          threadId,
          limit,
          ascending,
        });
      });

      return reply.status(200).send({
        messages: messages.map((m) => ({
          id: m.id,
          workspaceId: m.workspace_id,
          channelInstanceId: m.channel_instance_id,
          threadId: m.thread_id,
          provider: m.provider,
          direction: m.direction,
          senderE164: m.sender_e164,
          recipientE164: m.recipient_e164,
          contentType: m.content_type,
          body: m.body,
          mediaUrl: m.media_url,
          metadata: m.metadata || {},
          providerMessageId: m.provider_message_id,
          deliveryStatus: m.delivery_status,
          statusRank: m.status_rank,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        })),
        total: messages.length,
      });
    }
  );

  // Explicit hand-back: check runtime availability and the reviewed conversation under the same transaction.
  app.post('/v1/workspaces/:workspaceId/threads/:threadId/resume-automation',{
    preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('cockpit:handoff')],
  },async(request,reply)=>{
    const params=threadParamsSchema.safeParse(request.params),body=z.object({expectedUpdatedAt:z.string().datetime({offset:true})}).strict().safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({detail:'Atualize e confira a conversa antes de devolver à IA.'});
    const {workspaceId,threadId}=params.data;
    return withTenantTransaction(workspaceId,async client=>{
      // SHARE conflicts with suspension/publication writes until this decision commits.
      const workspace=(await client.query<{ai_receptionist_enabled:boolean}>('SELECT ai_receptionist_enabled FROM public.workspaces WHERE id=$1 FOR SHARE',[workspaceId])).rows[0];
      const thread=(await client.query<{id:string;workspace_id:string;channel_instance_id:string;contact_id:string;status:string;updated_at:Date}>('SELECT id,workspace_id,channel_instance_id,contact_id,status,updated_at FROM public.commercial_threads WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,threadId])).rows[0];
      if(!thread)return reply.code(404).send({detail:'Conversa não encontrada nesta empresa.'});
      if(workspace?.ai_receptionist_enabled!==true)return reply.code(409).send({detail:'A IA está desativada na configuração em uso. A conversa não foi devolvida.'});
      if(thread.status==='active')return {thread:{id:thread.id,workspaceId,channelInstanceId:thread.channel_instance_id,contactId:thread.contact_id,status:'active',updatedAt:thread.updated_at},alreadyActive:true};
      if(thread.status!=='waiting_human')return reply.code(409).send({detail:'Esta conversa não está aguardando atendimento humano. Consulte seu estado antes de devolver à IA.'});
      if(new Date(thread.updated_at).getTime()!==Date.parse(body.data.expectedUpdatedAt))return reply.code(409).send({detail:'A conversa mudou desde a revisão. Atualize e confira o histórico antes de devolver à IA.'});
      const updated=await updateCommercialThreadStatus(client,{workspaceId,threadId,status:'active'});
      if(!updated)throw new Error('Conversa indisponível durante a devolução.');
      await client.query("INSERT INTO public.audit_events(workspace_id,actor_id,actor_type,action,resource_type,resource_id,metadata) VALUES($1,$2,'human','thread.automation_resumed','commercial_thread',$3,$4)",[workspaceId,request.user!.id,threadId,JSON.stringify({fromStatus:thread.status,toStatus:'active',source:'explicit_handoff',reviewedUpdatedAt:body.data.expectedUpdatedAt})]);
      return {thread:{id:updated.id,workspaceId,channelInstanceId:updated.channel_instance_id,contactId:updated.contact_id,status:updated.status,updatedAt:updated.updated_at},alreadyActive:false};
    });
  });

  // 3. Update Thread Status (e.g. waiting_human, closed, active)
  app.patch(
    "/v1/workspaces/:workspaceId/threads/:threadId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid route parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = updateThreadBodySchema.safeParse(request.body);
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

      const { workspaceId, threadId } = parsedParams.data;
      const { status } = parsedBody.data;

      let requiresExplicitHandoff=false;
      const updated = await withTenantTransaction(workspaceId, async (client) => {
        if(status==='active'){
          const source=(await client.query<{status:string}>('SELECT status FROM public.commercial_threads WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[workspaceId,threadId])).rows[0];
          if(source?.status==='waiting_human'){requiresExplicitHandoff=true;return null;}
        }
        return updateCommercialThreadStatus(client, {
          workspaceId,
          threadId,
          status: status as CommercialThreadStatus,
        });
      });

      if(requiresExplicitHandoff)return reply.code(409).send({detail:'Use a devolução explícita à IA para esta conversa, após conferir sua disponibilidade.'});
      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Commercial thread not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        thread: {
          id: updated.id,
          workspaceId: updated.workspace_id,
          channelInstanceId: updated.channel_instance_id,
          contactId: updated.contact_id,
          status: updated.status,
          lastMessageAt: updated.last_message_at,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      });
    }
  );
};
