import {withTenantTransaction} from "@sos-sales/database";
import {listAiRevisionTests,runAiRevisionTest,reviewAiRevisionTest} from '../services/ai-revision-tests';
import {simulateAiText} from '../services/ai-agent-simulation';
import {getEditableAiConfig,saveAiConfigDraft,prepareGuidedAiDraft,getAiSimulationBase,suspendActiveAi,AiDraftError} from "../services/ai-config-drafts";
import {updateAiAgentBodySchema} from "../services/ai-config-schema";
import { guidedAgentRoutes } from "./guided-agent.routes";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {NICHE_PLAYBOOKS} from "@sos-sales/application";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});


const simulateBodySchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      })
    ).max(16).refine(items=>items.reduce((sum,item)=>sum+item.content.length,0)<=32000,"Histórico excede o limite de 32000 caracteres.")
    .optional(),
  draftRevision: z.number().int().min(0).optional(),
  draftConfig: updateAiAgentBodySchema.omit({expectedRevision:true}).optional(),
  mockLead: z
    .object({
      name: z.string().max(100).optional(),
      lastPixStatus: z.enum(["PAID", "PENDING", "EXPIRED"]).optional(),
      lastPixAmountCents: z.number().int().optional(),
      isReturningCustomer: z.boolean().optional(),
    })
    .optional(),
});

export const aiAgentRoutes: FastifyPluginAsync = async (app) => {
  await app.register(guidedAgentRoutes);
  app.get('/v1/workspaces/:workspaceId/ai-agent/availability',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('cockpit:handoff')]},async(request,reply)=>{
    const params=workspaceParamsSchema.safeParse(request.params);if(!params.success)return reply.code(400).send({detail:'Empresa inválida.'});
    return withTenantTransaction(params.data.workspaceId,async client=>{
      const row=(await client.query<{ai_receptionist_enabled:boolean}>('SELECT ai_receptionist_enabled FROM public.workspaces WHERE id=$1',[params.data.workspaceId])).rows[0];
      if(!row)return reply.code(404).send({detail:'Empresa não encontrada.'});
      return {success:true,activeEnabled:row.ai_receptionist_enabled===true};
    });
  });
  const guarded={preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")]};
  app.get('/v1/workspaces/:workspaceId/ai-agent/tests',guarded,async(request,reply)=>{
    const params=workspaceParamsSchema.safeParse(request.params),query=z.object({revision:z.coerce.number().int().positive()}).strict().safeParse(request.query);
    if(!params.success||!query.success)return reply.code(400).send({detail:'Informe uma revisão salva válida.'});
    try{return await listAiRevisionTests(params.data.workspaceId,query.data.revision);}catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
  });
  app.post('/v1/workspaces/:workspaceId/ai-agent/tests',guarded,async(request,reply)=>{
    const params=workspaceParamsSchema.safeParse(request.params),body=z.object({expectedRevision:z.number().int().positive(),scenarioId:z.string().min(1).max(100),requestKey:z.string().uuid()}).strict().safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({detail:'Revisão, cenário ou identificador de teste inválido.'});
    try{const result=await runAiRevisionTest(params.data.workspaceId,request.user!.id,body.data);return reply.code(result.status==='running'?202:200).send(result);}catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
  });
  app.post('/v1/workspaces/:workspaceId/ai-agent/tests/:runId/review',guarded,async(request,reply)=>{
    const params=workspaceParamsSchema.extend({runId:z.string().uuid()}).safeParse(request.params),body=z.object({expectedRevision:z.number().int().positive(),expectedReviewRevision:z.number().int().min(0),verdict:z.enum(['adequate','needs_changes']),note:z.string().trim().min(10).max(2000)}).strict().safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({detail:'Informe a avaliação e uma observação com 10 a 2000 caracteres.'});
    try{return await reviewAiRevisionTest(params.data.workspaceId,request.user!.id,params.data.runId,body.data);}catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
  });
  // GET /v1/workspaces/:workspaceId/ai-agent
  app.get(
    "/v1/workspaces/:workspaceId/ai-agent",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext, app.requirePermission("workspace:manage")],
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

      try{return await getEditableAiConfig(parsedParams.data.workspaceId);}
      catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}

    }
  );

  // PUT /v1/workspaces/:workspaceId/ai-agent
  app.put(
    "/v1/workspaces/:workspaceId/ai-agent",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext, app.requirePermission("workspace:manage")],
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

      const parsedBody = updateAiAgentBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid AI agent payload: " + parsedBody.error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }

      try{return await saveAiConfigDraft(parsedParams.data.workspaceId,request.user!.id,parsedBody.data);}
      catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}

    }
  );

  app.post("/v1/workspaces/:workspaceId/ai-agent/suspend",{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")]},async(request,reply)=>{
    const params=workspaceParamsSchema.safeParse(request.params);
    const body=z.object({reason:z.string().trim().min(10).max(500)}).strict().safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({detail:"Informe o motivo da suspensão."});
    try{return await suspendActiveAi(params.data.workspaceId,request.user!.id,body.data.reason);}
    catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
  });

  app.post("/v1/workspaces/:workspaceId/ai-agent/draft/from-guided",{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("workspace:manage")]},async(request,reply)=>{
    const params=workspaceParamsSchema.safeParse(request.params);
    const body=z.object({expectedRevision:z.number().int().min(0),expectedGuidedRevision:z.number().int().positive()}).strict().safeParse(request.body);
    if(!params.success||!body.success)return reply.code(400).send({detail:"Revisão do plano ou do rascunho inválida."});
    try{return await prepareGuidedAiDraft(params.data.workspaceId,request.user!.id,body.data.expectedRevision,body.data.expectedGuidedRevision);}
    catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
  });

  // GET /v1/workspaces/:workspaceId/ai-agent/niche-playbooks
  app.get(
    "/v1/workspaces/:workspaceId/ai-agent/niche-playbooks",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext],
    },
    async (_request, reply) => {
      return reply.status(200).send({
        success: true,
        playbooks: NICHE_PLAYBOOKS,
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/ai-agent/simulate (Dry-Run Playground)
  app.post(
    "/v1/workspaces/:workspaceId/ai-agent/simulate",
    {
      preHandler: [app.authenticate, app.requireWorkspaceContext, app.requirePermission("workspace:manage")],
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

      const parsedBody = simulateBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid simulate payload: " + parsedBody.error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;

      let ws:Record<string,any>;
      try{ws=await getAiSimulationBase(workspaceId,parsedBody.data.draftRevision);}
      catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
      try{return reply.status(200).send(await simulateAiText(workspaceId,ws,parsedBody.data));}
      catch(error){if(error instanceof AiDraftError)return reply.code(error.status).send({detail:error.message});throw error;}
    }
  );
};
