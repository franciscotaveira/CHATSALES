import {commercialHistoryRoutes} from './commercial-history.routes';
import {hasWorkspacePermission} from "@sos-sales/contracts";
import { stageSettingsRoutes } from "./stage-settings.routes";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createCommercialJourney,
  getJourneyByThread,
  listCommercialJourneys,
  recordCommercialOutcome,
  type JourneyStage,
  type AttributionSource,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const journeyParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  journeyId: z.string().uuid(),
});

const threadParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  threadId: z.string().uuid(),
});

const createJourneyBodySchema = z.object({
  contactId: z.string().uuid(),
  threadId: z.string().uuid().optional().nullable(),
  title: z.string().min(1).max(200).optional(),
  stage: z.enum(["lead", "qualified", "proposal", "scheduled"] as const).optional(),
  attributionSource: z.enum([
    "ctwa_meta",
    "lead_ads_meta",
    "tracked_link_meta",
    "organic_whatsapp",
    "manual_input",
  ] as const).optional(),
  campaignId: z.string().optional().nullable(),
  adId: z.string().optional().nullable(),
  ctwaClid: z.string().optional().nullable(),
  estimatedValueCents: z.number().int().nonnegative().max(2147483647).optional(),
});

const transitionJourneyBodySchema = z.object({
  expectedUpdatedAt:z.string().datetime().optional(),
  stage: z.enum(["lead", "qualified", "proposal", "scheduled"] as const),
});

const recordOutcomeBodySchema = z.object({
  expectedUpdatedAt:z.string().datetime().optional(),
  status: z.enum(["won", "lost"]),
  valueCents: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3).default("BRL"),
  reason: z.string().max(500).optional().nullable(),
  userPhoneE164: z.string().optional(),
});

export const commercialRoutes: FastifyPluginAsync = async (app) => {
  await app.register(stageSettingsRoutes);
  await app.register(commercialHistoryRoutes);
  // 1. List commercial journeys (opportunities)
  app.get(
    "/v1/workspaces/:workspaceId/journeys",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:view"),
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
      const parsedQuery=z.object({search:z.string().trim().max(200).optional(),profile:z.enum(['all','recurring','new']).default('all'),value:z.enum(['all','has_value','no_value']).default('all'),period:z.enum(['all','7d','30d']).default('all'),status:z.enum(['open','won','lost','archived']).optional(),limit:z.coerce.number().int().min(1).max(100).default(50),beforeUpdatedAt:z.string().datetime({offset:true}).optional(),beforeId:z.string().uuid().optional()}).strict().refine(q=>Boolean(q.beforeUpdatedAt)===Boolean(q.beforeId)).safeParse(request.query);
      if(!parsedQuery.success)return reply.status(400).send({message:'Consulta de oportunidades inválida. Confira o limite e o cursor.'});
      const query=parsedQuery.data;
      if(query.profile!=='all'&&!hasWorkspacePermission(request.activeRole,'cockpit:access'))return reply.status(403).send({message:'Seu perfil não permite filtrar por informações do contato.'});
      const rows=await withTenantTransaction(workspaceId,async client=>(await client.query<Awaited<ReturnType<typeof listCommercialJourneys>>[number]&{cursor_updated_at:string}>(`SELECT j.*,to_char(j.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at
        FROM public.commercial_journeys j WHERE j.workspace_id=$1 AND ($2::text IS NULL OR j.status=$2)
        AND ($3::timestamptz IS NULL OR (j.updated_at,j.id)<($3::timestamptz,$4::uuid))
        AND ($6::text IS NULL OR strpos(lower(COALESCE(j.title,'')),lower($6))>0 OR ($7::boolean AND EXISTS(SELECT 1 FROM public.contacts c WHERE c.workspace_id=j.workspace_id AND c.id=j.contact_id AND (strpos(lower(COALESCE(c.name,'')),lower($6))>0 OR strpos(COALESCE(c.phone_e164,''),$6)>0))))
        AND ($8::text='all' OR ($8='has_value' AND j.estimated_value_cents IS NOT NULL AND j.estimated_value_cents>=0) OR ($8='no_value' AND (j.estimated_value_cents IS NULL OR j.estimated_value_cents<0)))
        AND ($9::int IS NULL OR (j.created_at<=now() AND j.created_at>=now()-($9*interval '1 day')))
        AND ($10::text='all' OR ($10='recurring')=EXISTS(SELECT 1 FROM public.contacts c WHERE c.workspace_id=j.workspace_id AND c.id=j.contact_id AND (c.metadata->'isRecurring'='true'::jsonb OR (jsonb_typeof(c.metadata->'totalOrders')='number' AND CASE WHEN jsonb_typeof(c.metadata->'totalOrders')='number' THEN (c.metadata->>'totalOrders')::numeric BETWEEN 1 AND 9007199254740991 AND trunc((c.metadata->>'totalOrders')::numeric)=(c.metadata->>'totalOrders')::numeric ELSE false END) OR (jsonb_typeof(c.metadata->'tags')='array' AND c.metadata->'tags' @> '["cliente_recorrente"]'::jsonb))))
        ORDER BY j.updated_at DESC,j.id DESC LIMIT $5`,[workspaceId,query.status??null,query.beforeUpdatedAt??null,query.beforeId??null,query.limit+1,query.search||null,hasWorkspacePermission(request.activeRole,'cockpit:access'),query.value,query.period==='all'?null:query.period==='7d'?7:30,query.profile])).rows);
      const journeys=rows.slice(0,query.limit),last=journeys.at(-1),hasMore=rows.length>query.limit;
      const contactIds=Array.from(new Set(journeys.map(j=>j.contact_id)));
      const contacts=hasWorkspacePermission(request.activeRole,'cockpit:access')&&contactIds.length?await withTenantTransaction(workspaceId,async client=>(await client.query(`SELECT id,workspace_id,phone_e164,name,opt_out,metadata,created_at,updated_at FROM public.contacts WHERE workspace_id=$1 AND id=ANY($2::uuid[])`,[workspaceId,contactIds])).rows):[];


      return reply.status(200).send({
        items: journeys.map((j) => ({
          id: j.id,
          workspaceId: j.workspace_id,
          contactId: j.contact_id,
          threadId: j.thread_id,
          assignedUserId: j.assigned_user_id,
          title: j.title,
          stage: j.stage,
          status: j.status,
          attributionSource: j.attribution_source,
          campaignId: j.campaign_id,
          adId: j.ad_id,
          ctwaClid: j.ctwa_clid,
          estimatedValueCents: j.estimated_value_cents,
          createdAt: j.created_at.toISOString(),
          updatedAt: j.updated_at.toISOString(),
        })),
        contacts:contacts.map(c=>({id:c.id,workspaceId:c.workspace_id,phoneE164:c.phone_e164,name:c.name,optOut:c.opt_out,metadata:c.metadata,createdAt:c.created_at.toISOString(),updatedAt:c.updated_at.toISOString()})),
        total: journeys.length,
        pagination:{hasMore,nextCursor:hasMore&&last?{updatedAt:last.cursor_updated_at,id:last.id}:null},
      });
    }
  );

  // 2. Create commercial journey
  app.post(
    "/v1/workspaces/:workspaceId/journeys",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
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

      const parseResult = createJourneyBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid journey creation payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const data = parseResult.data;

      const journey = await withTenantTransaction(workspaceId, async (client) => {
        if(data.threadId){const linked=await client.query('SELECT id FROM public.commercial_threads WHERE workspace_id=$1 AND id=$2 AND contact_id=$3 FOR KEY SHARE',[workspaceId,data.threadId,data.contactId]);if(!linked.rows.length)return null;}
        return createCommercialJourney(client, workspaceId, {
          contactId: data.contactId,
          threadId: data.threadId,
          assignedUserId: request.user?.id || null,
          title: data.title,
          stage: data.stage as JourneyStage,
          attributionSource: data.attributionSource as AttributionSource,
          campaignId: data.campaignId,
          adId: data.adId,
          ctwaClid: data.ctwaClid,
          estimatedValueCents: data.estimatedValueCents,
        });
      });

      if(!journey)return reply.status(409).send({message:'A conversa não corresponde ao contato nesta empresa. Atualize antes de criar a oportunidade.'});

      return reply.status(201).send({
        id: journey.id,
        workspaceId: journey.workspace_id,
        contactId: journey.contact_id,
        threadId: journey.thread_id,
        title: journey.title,
        stage: journey.stage,
        status: journey.status,
        attributionSource: journey.attribution_source,
        estimatedValueCents: journey.estimated_value_cents,
        createdAt: journey.created_at.toISOString(),
      });
    }
  );

  // 2.1 Move an open opportunity between non-terminal funnel stages.
  // Won/lost must use the governed outcome endpoint so conversion/audit remains consistent.
  app.patch(
    "/v1/workspaces/:workspaceId/journeys/:journeyId/stage",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:transition_stage"),
      ],
    },
    async (request, reply) => {
      const parsedParams = journeyParamsSchema.safeParse(request.params);
      const parsedBody = transitionJourneyBodySchema.safeParse(request.body);
      if (!parsedParams.success || !parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Etapa inválida. Ganhos e perdas devem ser registrados como desfecho.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, journeyId } = parsedParams.data;
      let stale=false;
      const journey = await withTenantTransaction(workspaceId, async (client) => {
        if(parsedBody.data.expectedUpdatedAt){
          const current=await client.query("SELECT updated_at FROM public.commercial_journeys WHERE workspace_id=$1 AND id=$2 FOR UPDATE",[workspaceId,journeyId]);
          if(current.rows[0]&&current.rows[0].updated_at.toISOString()!==parsedBody.data.expectedUpdatedAt){stale=true;return null;}
        }
        const result = await client.query(
          `UPDATE public.commercial_journeys
           SET stage = $1, updated_at = GREATEST(clock_timestamp(),updated_at+interval '1 millisecond')
           WHERE workspace_id = $2 AND id = $3
             AND status NOT IN ('won', 'lost')
           RETURNING *;`,
          [parsedBody.data.stage, workspaceId, journeyId]
        );
        return result.rows[0];
      });

      if(stale)return reply.status(409).send({type:"https://sos-sales.mct.br/errors/conflict",title:"Conflict",status:409,detail:"Esta oportunidade foi alterada por outra ação. Atualize a lista e confira os dados antes de salvar.",instance:request.url,correlationId:request.id});
      if (!journey) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Oportunidade não encontrada ou já encerrada.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        journey: {
          id: journey.id,
          contactId: journey.contact_id,
          threadId: journey.thread_id,
          title: journey.title,
          stage: journey.stage,
          status: journey.status,
          estimatedValueCents: journey.estimated_value_cents,
          updatedAt: journey.updated_at.toISOString(),
        },
      });
    }
  );

  // 3. Record outcome (close deal with financial value + trigger CAPI)
  app.post(
    "/v1/workspaces/:workspaceId/journeys/:journeyId/outcomes",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
      ],
    },
    async (request, reply) => {
      const parsedParams = journeyParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or journeyId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = recordOutcomeBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid outcome payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, journeyId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          if(data.expectedUpdatedAt){
            const current=await client.query("SELECT updated_at FROM public.commercial_journeys WHERE workspace_id=$1 AND id=$2 FOR UPDATE",[workspaceId,journeyId]);
            if(current.rows[0]&&current.rows[0].updated_at.toISOString()!==data.expectedUpdatedAt)throw Object.assign(new Error("Esta oportunidade foi alterada por outra ação. Atualize a lista e confira os dados antes de registrar o desfecho."),{status:409});
          }
          return recordCommercialOutcome(client, workspaceId, {
            journeyId,
            status: data.status,
            valueCents: data.valueCents,
            currency: data.currency,
            reason: data.reason || undefined,
            registeredByUserId: request.user.id,
            userPhoneE164: data.userPhoneE164,
          });
        });

        return reply.status(201).send({
          outcome: {
            id: result.outcome.id,
            journeyId: result.outcome.journey_id,
            status: result.outcome.status,
            valueCents: result.outcome.value_cents,
            currency: result.outcome.currency,
            registeredByUserId: result.outcome.registered_by_user_id,
            createdAt: result.outcome.created_at.toISOString(),
          },
          conversionEvent: result.conversionEvent
            ? {
                id: result.conversionEvent.id,
                eventName: result.conversionEvent.event_name,
                status: result.conversionEvent.status,
                valueCents: result.conversionEvent.value_cents,
                currency: result.conversionEvent.currency,
                createdAt: result.conversionEvent.created_at.toISOString(),
              }
            : null,
        });
      } catch (err: any) {
        if (err.message && err.message.includes("not found")) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (
          err.code === "OUTCOME_CONFLICT" ||
          err.status === 409 ||
          err.message?.includes("already reached terminal outcome") ||
          err.message?.includes("is already in terminal status") ||
          err.message?.includes("uq_commercial_outcomes_journey_won")
        ) {
          return reply.status(409).send({
            type: "https://sos-sales.mct.br/errors/conflict",
            title: "Conflict",
            status: 409,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (err.message?.includes("REASON_REQUIRED") || err.message?.includes("ACTOR_REQUIRED")) {
          return reply.status(400).send({
            type: "https://sos-sales.mct.br/errors/bad-request",
            title: "Bad Request",
            status: 400,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // 3.1 Get Journey and latest outcome by Thread ID
  app.get(
    "/v1/workspaces/:workspaceId/threads/:threadId/journey",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("journey:view"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;

      const result = await withTenantTransaction(workspaceId, async (client) => {
        const journey = await getJourneyByThread(client, workspaceId, threadId);
        if (!journey) {
          return { journey: null, latestOutcome: null };
        }

        const outcomeRes = await client.query(
          `SELECT * FROM public.commercial_outcomes
           WHERE workspace_id = $1 AND journey_id = $2
           ORDER BY created_at DESC
           LIMIT 1;`,
          [workspaceId, journey.id]
        );

        return {
          journey: {
            id: journey.id,
            workspaceId: journey.workspace_id,
            contactId: journey.contact_id,
            threadId: journey.thread_id,
            title:journey.title,
            updatedAt:journey.updated_at.toISOString(),
            stage: journey.stage,
            status: journey.status,
            estimatedValueCents: journey.estimated_value_cents,
            createdAt: journey.created_at.toISOString(),
          },
          latestOutcome: outcomeRes.rows[0]
            ? {
                id: outcomeRes.rows[0].id,
                status: outcomeRes.rows[0].status,
                valueCents: outcomeRes.rows[0].value_cents,
                currency: outcomeRes.rows[0].currency,
                reason: outcomeRes.rows[0].reason,
                createdAt: outcomeRes.rows[0].created_at.toISOString(),
              }
            : null,
        };
      });

      return reply.status(200).send(result);
    }
  );

  // 3.2 Record outcome directly for a Thread (auto-provisions Journey if needed + triggers CAPI)
  app.post(
    "/v1/workspaces/:workspaceId/threads/:threadId/outcomes",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
      ],
    },
    async (request, reply) => {
      const parsedParams = threadParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId or threadId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = recordOutcomeBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid outcome payload",
          details: parseResult.error.format(),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId, threadId } = parsedParams.data;
      const data = parseResult.data;
      const userId = request.user.id;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          // 1. Get or create journey for this thread under RLS
          let journey = await getJourneyByThread(client, workspaceId, threadId);
          if (!journey) {
            const threadRes = await client.query<{ contact_id: string }>(
              `SELECT contact_id FROM public.commercial_threads WHERE workspace_id = $1 AND id = $2;`,
              [workspaceId, threadId]
            );
            if (!threadRes.rows[0]) {
              throw new Error(`Commercial thread ${threadId} not found in workspace ${workspaceId}`);
            }

            journey = await createCommercialJourney(client, workspaceId, {
              contactId: threadRes.rows[0].contact_id,
              threadId,
              assignedUserId: userId,
              title: "Oportunidade Comercial WhatsApp",
              stage: data.status,
              attributionSource: "organic_whatsapp",
              estimatedValueCents: data.valueCents,
            });
          }

          // 2. Resolve user phone for Meta CAPI SHA-256 matching
          let userPhone = data.userPhoneE164;
          if (!userPhone) {
            const contactRes = await client.query<{ phone_e164: string }>(
              `SELECT phone_e164 FROM public.contacts WHERE workspace_id = $1 AND id = $2;`,
              [workspaceId, journey.contact_id]
            );
            userPhone = contactRes.rows[0]?.phone_e164;
          }

          // 3. Record outcome & enqueue CAPI
          return recordCommercialOutcome(client, workspaceId, {
            journeyId: journey.id,
            status: data.status,
            valueCents: data.valueCents,
            currency: data.currency,
            reason: data.reason || undefined,
            registeredByUserId: userId,
            userPhoneE164: userPhone,
          });
        });

        return reply.status(201).send({
          outcome: {
            id: result.outcome.id,
            workspaceId: result.outcome.workspace_id,
            journeyId: result.outcome.journey_id,
            status: result.outcome.status,
            valueCents: result.outcome.value_cents,
            currency: result.outcome.currency,
            reason: result.outcome.reason,
            createdAt: result.outcome.created_at.toISOString(),
          },
          conversionEvent: result.conversionEvent
            ? {
                id: result.conversionEvent.id,
                eventName: result.conversionEvent.event_name,
                status: result.conversionEvent.status,
                valueCents: result.conversionEvent.value_cents,
                createdAt: result.conversionEvent.created_at.toISOString(),
              }
            : null,
        });
      } catch (err: any) {
        if (err.message && err.message.includes("not found")) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (
          err.code === "OUTCOME_CONFLICT" ||
          err.status === 409 ||
          err.message?.includes("already reached terminal outcome") ||
          err.message?.includes("is already in terminal status") ||
          err.message?.includes("uq_commercial_outcomes_journey_won")
        ) {
          return reply.status(409).send({
            type: "https://sos-sales.mct.br/errors/conflict",
            title: "Conflict",
            status: 409,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (err.message?.includes("REASON_REQUIRED") || err.message?.includes("ACTOR_REQUIRED")) {
          return reply.status(400).send({
            type: "https://sos-sales.mct.br/errors/bad-request",
            title: "Bad Request",
            status: 400,
            detail: err.message,
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // 4. List conversion events (Meta CAPI verification & audit)
  app.get(
    "/v1/workspaces/:workspaceId/conversions",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("outcome:register"),
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

      const query=z.object({beforeId:z.string().uuid().optional()}).strict().safeParse(request.query);
      if(!query.success)return reply.status(400).send({detail:"Cursor de conversões inválido."});
      const beforeId=query.data.beforeId;
      const rows = await withTenantTransaction(workspaceId, async (client) => {
        if(beforeId){
          const cursor=await client.query(`SELECT id FROM public.conversion_events WHERE workspace_id=$1 AND id=$2`,[workspaceId,beforeId]);
          if(!cursor.rowCount)return null;
        }
        const res = await client.query(
          `SELECT * FROM public.conversion_events
           WHERE workspace_id = $1
             AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM public.conversion_events WHERE workspace_id=$1 AND id=$2))
           ORDER BY created_at DESC,id DESC
           LIMIT 51;`,
          [workspaceId,beforeId??null]
        );
        return res.rows;
      });
      if(rows===null)return reply.status(400).send({detail:"A continuação não está disponível nesta empresa. Atualize a consulta."});
      const hasMore=rows.length>50,page=rows.slice(0,50);

      return reply.status(200).send({
        items: page.map((r: any) => ({
          id: r.id,
          journeyId: r.journey_id,
          outcomeId: r.outcome_id,
          eventName: r.event_name,
          valueCents: r.value_cents,
          currency: r.currency,
          status: r.status,
          providerReceipt: r.provider_receipt,
          errorMessage: r.error_message,
          createdAt: r.created_at.toISOString(),
        })),
        total: page.length,
        pagination:{hasMore,nextCursor:hasMore?page[page.length-1].id:null},
      });
    }
  );
};
