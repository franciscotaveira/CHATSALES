import crypto from "node:crypto";
import {describeBroadcastBlockReason,assembleTemplate,storedTemplateLayout,templateTokens,isRecipientNameVariable} from "@sos-sales/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { withTenantTransaction, resolveBroadcastAudience, type BroadcastTarget, type MessageTemplateRecord } from "@sos-sales/database";
import {
  TransactionalOutboundProducerService,
  type ITransactionalOutboundProducerService,
} from "@sos-sales/application";
import type { TrustedOutboundContext } from "@sos-sales/contracts";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const createBroadcastBodySchema = z.object({
  requestKey: z.string().uuid().optional(),
  preparedAudienceId: z.string().uuid().optional(),
  approvedTestIds: z.array(z.string().uuid()).max(2).optional(),
  testPhone: z.string().regex(/^\+[1-9][0-9]{8,14}$/).optional(),
  testVariant: z.enum(["A","B"]).optional(),
  name: z.string().max(120).optional(),
  channelInstanceId: z.string().uuid(),
  templateId: z.string().uuid(),
  isAbTest: z.boolean().optional().default(false),
  variantBTemplateId: z.string().uuid().optional(),
  audience: z.object({
    type: z.enum(["ALL_CONTACTS", "BY_STAGE", "MANUAL", "IMPORT_LIST", "SMART_FILTER"]),
    stage: z.string().max(50).optional(),
    customPhoneNumbers: z.array(z.string().regex(/^\+[1-9][0-9]{8,14}$/)).max(1000).optional(),
    importedContacts: z
      .array(
        z.object({
          phoneE164: z.string().regex(/^\+[1-9][0-9]{8,14}$/),
          name: z.string().max(150).nullable().optional(),
        })
      )
      .max(1000)
      .optional(),
    smartFilter: z.enum(["NON_BUYERS", "PIX_ABANDONED", "INACTIVE_30_DAYS", "CTWA_RESCUE"]).optional(),
  }),
  variables: z.record(z.string().max(2048)).optional(),
  variantBVariables: z.record(z.string().max(2048)).optional(),
});

/** Same rendering for the controlled test and every campaign recipient. */
function renderBroadcastMessage(template:MessageTemplateRecord,variables:Record<string,string>,name:string|null|undefined){
 const layout=storedTemplateLayout(template);
 const values={...variables};const firstName=name?.trim().split(/\s+/)[0]||"cliente";
 for(const key of templateTokens(template.body_text))if(isRecipientNameVariable(key))values[key]=firstName;
 return assembleTemplate(layout,values);
}

export interface BroadcastsRoutesOptions {
  producerService?: ITransactionalOutboundProducerService;
}

export const broadcastsRoutes: FastifyPluginAsync<BroadcastsRoutesOptions> = async (
  app,
  options
) => {

  // 1. GET /v1/workspaces/:workspaceId/broadcasts/preflight
  // Verifies channels, billing guardrail, contact volume, and templates readiness
  app.get(
    "/v1/workspaces/:workspaceId/broadcasts/preflight",
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

      const preflightData = await withTenantTransaction(workspaceId, async (client) => {
        // Channels with billing status
        const channelsRes = await client.query<{
          id: string;
          provider: string;
          display_name: string;
          phone_number_e164: string | null;
          status: string;
          is_active: boolean;
          meta_billing_configured: boolean;
          meta_billing_account_id: string | null;
        }>(
          `SELECT id, provider, display_name, phone_number_e164, status, is_active, meta_billing_configured, meta_billing_account_id
           FROM public.channel_instances
           WHERE workspace_id = $1 AND status != 'revoked'
           ORDER BY created_at ASC;`,
          [workspaceId]
        );

        // Active templates count
        const templatesRes = await client.query<MessageTemplateRecord>(
          `SELECT *
           FROM public.message_templates
           WHERE workspace_id = $1
           ORDER BY name ASC;`,
          [workspaceId]
        );

        // Contacts count (active, non-opt-out contacts with valid phone)
        const contactsCountRes = await client.query<{ count: string }>(
          `SELECT count(*)::text as count
           FROM public.contacts
           WHERE workspace_id = $1 AND opt_out = false AND phone_e164 IS NOT NULL;`,
          [workspaceId]
        );

        return {
          channels: channelsRes.rows,
          templates: templatesRes.rows,
          totalActiveContacts: Number(contactsCountRes.rows[0]?.count || 0),
        };
      });

      return reply.status(200).send({
        success: true,
        channels: preflightData.channels.map((ch) => ({
          id: ch.id,
          provider: ch.provider,
          displayName: ch.display_name,
          phoneNumberE164: ch.phone_number_e164,
          status: ch.status,
          isActive: ch.is_active,
          metaBillingConfigured: ch.meta_billing_configured,
          metaBillingAccountId: ch.meta_billing_account_id,
          isBlockedForBroadcast: ch.provider === "meta_waba" && !ch.meta_billing_configured,
        })),
        templates: preflightData.templates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          headerText: t.header_text || undefined,
          footerText:t.footer_text,buttons:t.buttons,language:t.language,providerComponents:t.provider_components??[],parameterFormat:t.parameter_format??"POSITIONAL",
          metaTemplateId:t.meta_template_id,
          metaVerifiedAt:t.meta_verified_at,
          metaVerifiedChannelId:t.meta_verified_channel_id,
          bodyText: t.body_text || "",
          variables: t.variables || [],
          status: t.status,
        })),
        totalActiveContacts: preflightData.totalActiveContacts,
        billingNotice: {
          policy: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
          description:
            "O Chat Sales não cobra nem intermedeia custos de mensagens Meta. Todo envio ativo no canal oficial é debitado diretamente no cartão de crédito cadastrado na Meta pelo cliente.",
        },
      });
    }
  );

  // 1.1 GET /v1/workspaces/:workspaceId/broadcasts/audience-count
  // Fast query to provide live recipient counter for any audience type or smart filter
  app.get(
    "/v1/workspaces/:workspaceId/broadcasts/audience-count",
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

      const querySchema = z.object({
        type: z.enum(["ALL_CONTACTS", "BY_STAGE", "SMART_FILTER"]),
        stage: z.string().optional(),
        smartFilter: z.enum(["NON_BUYERS", "PIX_ABANDONED", "INACTIVE_30_DAYS", "CTWA_RESCUE"]).optional(),
      });

      const parsedQuery = querySchema.safeParse(request.query);
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
      const { type, stage, smartFilter } = parsedQuery.data;

      const count = await withTenantTransaction(workspaceId, async (client) => {
        if (type === "BY_STAGE" && stage) {
          const res = await client.query<{ count: string }>(
            `SELECT count(DISTINCT c.id)::text as count
             FROM public.contacts c
             INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
             WHERE c.workspace_id = $1 AND c.opt_out = false AND c.phone_e164 IS NOT NULL AND LOWER(cj.stage) = LOWER($2);`,
            [workspaceId, stage]
          );
          return Number(res.rows[0]?.count || 0);
        }

        if (type === "SMART_FILTER" && smartFilter) {
          if (smartFilter === "NON_BUYERS") {
            const res = await client.query<{ count: string }>(
              `SELECT count(DISTINCT c.id)::text as count
               FROM public.contacts c
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM public.commercial_journeys cj 
                   WHERE cj.contact_id = c.id 
                     AND cj.workspace_id = c.workspace_id 
                     AND LOWER(cj.stage) = 'won'
                 )
                 AND NOT EXISTS (
                   SELECT 1 FROM public.pix_charges pc
                   WHERE pc.contact_id = c.id
                     AND pc.workspace_id = c.workspace_id
                     AND pc.status = 'PAID'
                 );`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
          if (smartFilter === "PIX_ABANDONED") {
            const res = await client.query<{ count: string }>(
              `SELECT count(DISTINCT c.id)::text as count
               FROM public.contacts c
               INNER JOIN public.pix_charges pc 
                 ON pc.contact_id = c.id 
                 AND pc.workspace_id = c.workspace_id
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND pc.status IN ('EXPIRED', 'PENDING')
                 AND NOT EXISTS (
                   SELECT 1 FROM public.pix_charges pc_paid 
                   WHERE pc_paid.contact_id = c.id 
                     AND pc_paid.workspace_id = c.workspace_id 
                     AND pc_paid.status = 'PAID'
                 );`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
          if (smartFilter === "INACTIVE_30_DAYS") {
            const res = await client.query<{ count: string }>(
              `SELECT count(*)::text as count
               FROM public.contacts c
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND NOT EXISTS (
                   SELECT 1 FROM public.messages m
                   WHERE m.contact_id = c.id 
                     AND m.workspace_id = c.workspace_id
                     AND m.created_at >= (now() - interval '30 days')
                 );`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
          if (smartFilter === "CTWA_RESCUE") {
            const res = await client.query<{ count: string }>(
              `SELECT count(DISTINCT c.id)::text as count
               FROM public.contacts c
               INNER JOIN public.commercial_journeys cj ON cj.contact_id = c.id AND cj.workspace_id = c.workspace_id
               WHERE c.workspace_id = $1 
                 AND c.opt_out = false 
                 AND c.phone_e164 IS NOT NULL
                 AND cj.attribution_source = 'ctwa_meta'
                 AND LOWER(cj.stage) IN ('lead', 'qualified');`,
              [workspaceId]
            );
            return Number(res.rows[0]?.count || 0);
          }
        }

        // Default: ALL_CONTACTS
        const res = await client.query<{ count: string }>(
          `SELECT count(*)::text as count
           FROM public.contacts
           WHERE workspace_id = $1 AND opt_out = false AND phone_e164 IS NOT NULL;`,
          [workspaceId]
        );
        return Number(res.rows[0]?.count || 0);
      });

      return reply.status(200).send({
        success: true,
        type,
        stage,
        smartFilter,
        count,
      });
    }
  );

  // Read-only recipient evidence; never requeues a campaign or contacts a provider.
  app.get("/v1/workspaces/:workspaceId/broadcasts/:campaignId/recipients",{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("cockpit:access")]},async(request,reply)=>{
    const params=z.object({workspaceId:z.string().uuid(),campaignId:z.string().uuid()}).safeParse(request.params);
    const query=z.object({afterId:z.string().uuid().optional(),search:z.string().trim().max(120).optional(),group:z.enum(['ALL','ATTENTION','PENDING','CONFIRMED']).default('ALL')}).strict().safeParse(request.query);
    if(!params.success||!query.success)return reply.status(400).send({detail:"Consulta de destinatários inválida. Atualize a campanha e tente novamente."});
    const {workspaceId,campaignId}=params.data;
    const result=await withTenantTransaction(workspaceId,async client=>{
      const campaign=(await client.query<{name:string;total_targeted:number;recorded:number}>(`SELECT c.name,c.total_targeted,(SELECT count(*)::int FROM public.broadcast_recipients r WHERE r.workspace_id=c.workspace_id AND r.campaign_id=c.id) AS recorded FROM public.broadcast_campaigns c WHERE c.workspace_id=$1 AND c.id=$2`,[workspaceId,campaignId])).rows[0];
      if(!campaign)return null;
      const search=query.data.search||null,digits=search&&/^[+\d\s().-]+$/.test(search)?search.replace(/\D/g,'')||null:null;
      const matching=`AND ($3::text IS NULL OR strpos(lower(COALESCE(c.name,'')),lower($3))>0 OR strpos(r.phone_e164,$3)>0 OR ($5::text IS NOT NULL AND strpos(regexp_replace(r.phone_e164,'[^0-9]','','g'),$5)>0))
        AND ($4::text='ALL' OR ($4='ATTENTION' AND r.status IN ('failed','blocked','uncertain')) OR ($4='PENDING' AND r.status='queued') OR ($4='CONFIRMED' AND r.sent_at IS NOT NULL))`;
      const values=[workspaceId,campaignId,search,query.data.group,digits];
      const totalMatching=(await client.query<{total:number}>(`SELECT count(*)::int AS total FROM public.broadcast_recipients r LEFT JOIN public.contacts c ON c.id=r.contact_id AND c.workspace_id=r.workspace_id WHERE r.workspace_id=$1 AND r.campaign_id=$2 ${matching}`,values)).rows[0]!.total;
      const records=await client.query<{id:string;phone_e164:string;name:string|null;variant:string;status:string;sent_at:Date|null;delivered_at:Date|null;read_at:Date|null;replied_at:Date|null;clicked_at:Date|null;error_message:string|null}>(`SELECT r.id,r.phone_e164,c.name,r.variant,r.status,r.sent_at,r.delivered_at,r.read_at,r.replied_at,r.clicked_at,r.error_message
        FROM public.broadcast_recipients r LEFT JOIN public.contacts c ON c.id=r.contact_id AND c.workspace_id=r.workspace_id
        WHERE r.workspace_id=$1 AND r.campaign_id=$2 ${matching} AND ($6::uuid IS NULL OR r.id>$6::uuid) ORDER BY r.id ASC LIMIT 51`,[...values,query.data.afterId??null]);
      const rows=records.rows.slice(0,50);
      return {campaign:{id:campaignId,name:campaign.name,totalTargeted:campaign.total_targeted,totalRecorded:campaign.recorded,totalMatching},recipients:rows.map(row=>({id:row.id,phoneE164:row.phone_e164,name:row.name,variant:row.variant,status:row.status,sentAt:row.sent_at?.toISOString()??null,deliveredAt:row.delivered_at?.toISOString()??null,readAt:row.read_at?.toISOString()??null,repliedAt:row.replied_at?.toISOString()??null,clickedAt:row.clicked_at?.toISOString()??null,reason:describeBroadcastBlockReason(row.error_message)})),pagination:{hasMore:records.rows.length>50,nextCursor:records.rows.length>50?rows.at(-1)!.id:null}};
    });
    if(!result)return reply.status(404).send({detail:"Campanha não encontrada nesta empresa."});
    return reply.send(result);
  });

  // 2. GET /v1/workspaces/:workspaceId/broadcasts/campaigns
  // Email-marketing style campaign list with delivery, read, click, and reply rates + A/B test comparison
  app.get(
    "/v1/workspaces/:workspaceId/broadcasts/campaigns",
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
      const query=z.object({beforeCreatedAt:z.string().datetime({offset:true}).optional(),beforeId:z.string().uuid().optional(),search:z.string().trim().max(200).optional(),type:z.enum(["ALL","AB_ONLY","SINGLE"]).default("ALL")}).strict().refine(value=>Boolean(value.beforeCreatedAt)===Boolean(value.beforeId)).safeParse(request.query);
      if(!query.success)return reply.status(400).send({message:"Cursor de campanhas inválido. Atualize a lista e tente novamente."});
      const cursor=query.data;


      const page = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          name: string;
          status: string;
          channel_instance_id: string;
          channel_name: string;
          channel_provider: string;
          is_ab_test: boolean;
          variant_a_template_id: string;
          variant_a_name: string;
          variant_a_category: string;
          variant_b_template_id: string | null;
          variant_b_name: string | null;
          variant_b_category: string | null;
          audience_type: string;
          audience_stage: string | null;
          total_targeted: number;
          sent_count: number;
          delivered_count: number;
          read_count: number;
          replied_count: number;
          clicked_count: number;
          failed_count: number;
          created_at: Date;
          cursor_created_at:string;
        }>(
          `SELECT c.id, c.name, c.status, c.channel_instance_id,
                  ci.display_name as channel_name, ci.provider as channel_provider,
                  c.is_ab_test,
                  c.variant_a_template_id, tpl_a.name as variant_a_name, tpl_a.category as variant_a_category,
                  c.variant_b_template_id, tpl_b.name as variant_b_name, tpl_b.category as variant_b_category,
                  c.audience_type, c.audience_stage,
                  c.total_targeted, c.sent_count, c.delivered_count, c.read_count,
                  c.replied_count, c.clicked_count, c.failed_count, c.created_at,
                  to_char(c.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at
           FROM public.broadcast_campaigns c
           LEFT JOIN public.channel_instances ci ON ci.id = c.channel_instance_id AND ci.workspace_id = c.workspace_id
           LEFT JOIN public.message_templates tpl_a ON tpl_a.id = c.variant_a_template_id AND tpl_a.workspace_id = c.workspace_id
           LEFT JOIN public.message_templates tpl_b ON tpl_b.id = c.variant_b_template_id AND tpl_b.workspace_id = c.workspace_id
           WHERE c.workspace_id = $1
             AND ($2::timestamptz IS NULL OR (c.created_at,c.id) < ($2::timestamptz,$3::uuid))
             AND ($4::text IS NULL OR strpos(lower(COALESCE(c.name,'')),lower($4))>0 OR strpos(lower(COALESCE(tpl_a.name,'')),lower($4))>0 OR strpos(lower(COALESCE(tpl_b.name,'')),lower($4))>0 OR strpos(lower(COALESCE(ci.display_name,'')),lower($4))>0)
             AND ($5::text='ALL' OR ($5='AB_ONLY' AND c.is_ab_test) OR ($5='SINGLE' AND NOT c.is_ab_test))
           ORDER BY c.created_at DESC,c.id DESC
           LIMIT 51;`,
          [workspaceId,cursor.beforeCreatedAt??null,cursor.beforeId??null,cursor.search||null,cursor.type]
        );

        // Fetch A/B breakdowns for split test campaigns
        const campaignsWithAb = [];
        for (const camp of res.rows.slice(0,50)) {
            const sent = Number(camp.sent_count || 0);
            const delivered = Number(camp.delivered_count || 0);
            const read = Number(camp.read_count || 0);
            const replied = Number(camp.replied_count || 0);
            const clicked = Number(camp.clicked_count || 0);

            const deliveryRate = sent > 0 ? Number(((delivered / sent) * 100).toFixed(1)) : 0;
            const openRate = delivered > 0 ? Number(((read / delivered) * 100).toFixed(1)) : 0;
            const replyRate = delivered > 0 ? Number(((replied / delivered) * 100).toFixed(1)) : 0;
            const ctr = delivered > 0 ? Number(((clicked / delivered) * 100).toFixed(1)) : 0;

            // Principal credit: latest tracked reply, same negotiation, up to seven days.
            // This is a reporting rule, not proof of causality.
            // Pix Sales Attribution
            // Attributes paid Pix charges to broadcast recipients who converted on or after campaign dispatch
            const salesRes = await client.query<{
              variant: string;
              sales_count: string;
              sales_cents: string;
            }>(
              `WITH candidates AS (
                 SELECT pc.id, pc.amount_cents, br.campaign_id, br.variant,
                   row_number() OVER (PARTITION BY pc.id ORDER BY br.replied_at DESC,br.id DESC) AS credit
                 FROM public.pix_charges pc
                 JOIN public.broadcast_recipients br ON br.workspace_id=pc.workspace_id AND br.contact_id=pc.contact_id
                 JOIN public.outbound_commands oc ON oc.id=br.outbound_command_id AND oc.workspace_id=br.workspace_id
                 WHERE pc.workspace_id=$1 AND pc.status='PAID' AND pc.thread_id=oc.thread_id
                   AND br.replied_at IS NOT NULL AND br.replied_at >= br.sent_at
                   AND pc.paid_at >= br.replied_at AND pc.paid_at <= br.replied_at + interval '7 days'
               )
               SELECT COALESCE(variant,'A') AS variant,count(*)::text AS sales_count,sum(amount_cents)::text AS sales_cents
               FROM candidates WHERE credit=1 AND campaign_id=$2 GROUP BY variant;`,
              [workspaceId, camp.id]
            );

            let totalSalesCount = 0;
            let totalSalesCents = 0;
            let salesCountA = 0;
            let salesCentsA = 0;
            let salesCountB = 0;
            let salesCentsB = 0;

            for (const row of salesRes.rows) {
              const count = Number(row.sales_count || 0);
              const cents = Number(row.sales_cents || 0);
              totalSalesCount += count;
              totalSalesCents += cents;
              if (row.variant === "A") {
                salesCountA += count;
                salesCentsA += cents;
              } else if (row.variant === "B") {
                salesCountB += count;
                salesCentsB += cents;
              }
            }

            const totalConversionRate = delivered > 0 ? Number(((totalSalesCount / delivered) * 100).toFixed(2)) : 0;
            const averageTicketCents = totalSalesCount > 0 ? Math.round(totalSalesCents / totalSalesCount) : 0;
            const totalFormatted = (totalSalesCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const averageTicketFormatted = (averageTicketCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

            let abReport = null;

            if (camp.is_ab_test) {
              const abRes = await client.query<{
                variant: string;
                sent: string;
                delivered: string;
                read: string;
                replied: string;
                clicked: string;
              }>(
                `SELECT variant,
                        count(*) FILTER (WHERE sent_at IS NOT NULL) as sent,
                        count(*) FILTER (WHERE delivered_at IS NOT NULL) as delivered,
                        count(*) FILTER (WHERE read_at IS NOT NULL) as read,
                        count(*) FILTER (WHERE replied_at IS NOT NULL) as replied,
                        count(*) FILTER (WHERE clicked_at IS NOT NULL) as clicked
                 FROM public.broadcast_recipients
                 WHERE workspace_id = $1 AND campaign_id = $2
                 GROUP BY variant;`,
                [workspaceId, camp.id]
              );

              const rowA = abRes.rows.find((r) => r.variant === "A") || {
                sent: "0", delivered: "0", read: "0", replied: "0", clicked: "0",
              };
              const rowB = abRes.rows.find((r) => r.variant === "B") || {
                sent: "0", delivered: "0", read: "0", replied: "0", clicked: "0",
              };

              const sentA = Number(rowA.sent);
              const delA = Number(rowA.delivered);
              const readA = Number(rowA.read);
              const repA = Number(rowA.replied);
              const openRateA = delA > 0 ? Number(((readA / delA) * 100).toFixed(1)) : 0;
              const replyRateA = delA > 0 ? Number(((repA / delA) * 100).toFixed(1)) : 0;
              const convRateA = delA > 0 ? Number(((salesCountA / delA) * 100).toFixed(2)) : 0;
              const salesFormattedA = (salesCentsA / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

              const sentB = Number(rowB.sent);
              const delB = Number(rowB.delivered);
              const readB = Number(rowB.read);
              const repB = Number(rowB.replied);
              const openRateB = delB > 0 ? Number(((readB / delB) * 100).toFixed(1)) : 0;
              const replyRateB = delB > 0 ? Number(((repB / delB) * 100).toFixed(1)) : 0;
              const convRateB = delB > 0 ? Number(((salesCountB / delB) * 100).toFixed(2)) : 0;
              const salesFormattedB = (salesCentsB / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

              let winner: "A" | "B" | "TIED" = "TIED";
              // Highest revenue determines the commercial winner. If revenue tied, fallback to conversion, replies, opens
              if (salesCentsA > salesCentsB) winner = "A";
              else if (salesCentsB > salesCentsA) winner = "B";
              else if (convRateA > convRateB) winner = "A";
              else if (convRateB > convRateA) winner = "B";
              else if (replyRateA > replyRateB) winner = "A";
              else if (replyRateB > replyRateA) winner = "B";
              else if (openRateA > openRateB) winner = "A";
              else if (openRateB > openRateA) winner = "B";

              abReport = {
                winner,
                variantA: {
                  templateName: camp.variant_a_name,
                  category: camp.variant_a_category,
                  sent: sentA,
                  delivered: delA,
                  read: readA,
                  replied: repA,
                  openRate: openRateA,
                  replyRate: replyRateA,
                  salesCount: salesCountA,
                  salesCents: salesCentsA,
                  salesFormatted: salesFormattedA,
                  conversionRate: convRateA,
                },
                variantB: {
                  templateName: camp.variant_b_name,
                  category: camp.variant_b_category,
                  sent: sentB,
                  delivered: delB,
                  read: readB,
                  replied: repB,
                  openRate: openRateB,
                  replyRate: replyRateB,
                  salesCount: salesCountB,
                  salesCents: salesCentsB,
                  salesFormatted: salesFormattedB,
                  conversionRate: convRateB,
                },
              };
            }

            campaignsWithAb.push({
              id: camp.id,
              name: camp.name,
              status: camp.status,
              channel: {
                id: camp.channel_instance_id,
                name: camp.channel_name || "Linha WhatsApp",
                provider: camp.channel_provider,
              },
              isAbTest: camp.is_ab_test,
              template: {
                id: camp.variant_a_template_id,
                name: camp.variant_a_name,
                category: camp.variant_a_category,
              },
              audienceType: camp.audience_type,
              audienceStage: camp.audience_stage,
              totalTargeted: Number(camp.total_targeted),
              metrics: {
                failed: Number(camp.failed_count || 0),
                sent,
                delivered,
                read,
                replied,
                clicked,
                deliveryRate,
                openRate,
                replyRate,
                ctr,
                salesCount: totalSalesCount,
                salesCents: totalSalesCents,
                conversionRate: totalConversionRate,
                averageTicketCents,
              },
              sales: {
                count: totalSalesCount,
                totalCents: totalSalesCents,
                totalFormatted,
                conversionRate: totalConversionRate,
                averageTicketCents,
                averageTicketFormatted,
              },
              abReport,
              createdAt: camp.created_at.toISOString(),
            });
        }

        const last=res.rows.slice(0,50).at(-1);
        return {campaigns:campaignsWithAb,pagination:{hasMore:res.rows.length>50,nextCursor:res.rows.length>50&&last?{createdAt:last.cursor_created_at,id:last.id}:null}};
      });

      return reply.status(200).send({
        success: true,
        ...page,
      });
    }
  );

  // Preparing is read-only for contacts and never creates outbound commands.
  // Executes active broadcast or 50/50 A/B split test with MANDATORY Credit Card / Meta Billing Guardrail
  for (const mode of ["prepare","test","confirm"] as const) app.post(
    mode==="prepare" ? "/v1/workspaces/:workspaceId/broadcasts/prepare" : mode==="test" ? "/v1/workspaces/:workspaceId/broadcasts/test" : "/v1/workspaces/:workspaceId/broadcasts",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:send_message"),
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

      const parsedBody = createBroadcastBodySchema.safeParse(request.body);
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
      const {
        name: customName,
        channelInstanceId,
        templateId,
        isAbTest = false,
        variantBTemplateId,
        audience,
        variables = {},
        variantBVariables = {},
      } = parsedBody.data;

      // 1. Verify Channel & Apply Mandatory Meta Billing Gate
      const { channel, templateA, templateB, recipients: audienceCandidates } = await withTenantTransaction(
        workspaceId,
        async (client) => {
          const chanRes = await client.query<{
            id: string;
            provider: string;
            display_name: string;
            phone_number_e164: string | null;
            status: string;
            is_active: boolean;
            meta_billing_configured: boolean;
          }>(
            `SELECT id, provider, display_name, phone_number_e164, status, is_active, meta_billing_configured
             FROM public.channel_instances
             WHERE id = $1 AND workspace_id = $2;`,
            [channelInstanceId, workspaceId]
          );

          const ch = chanRes.rows[0];
          if (!ch) {
            return { channel: null, templateA: null, templateB: null, recipients: [] };
          }

          // Fetch Template A
          const tplARes = await client.query<MessageTemplateRecord>(
            `SELECT *
             FROM public.message_templates
             WHERE id = $1 AND workspace_id = $2;`,
            [templateId, workspaceId]
          );
          const tplA = tplARes.rows[0] || null;

          // Fetch Template B if A/B test
          let tplB = null;
          if (isAbTest && variantBTemplateId) {
            const tplBRes = await client.query<MessageTemplateRecord>(
              `SELECT *
               FROM public.message_templates
               WHERE id = $1 AND workspace_id = $2;`,
              [variantBTemplateId, workspaceId]
            );
            tplB = tplBRes.rows[0] || null;
          }

          const targetNumbers = mode==="prepare" ? await resolveBroadcastAudience(client,workspaceId,audience) : [];

          return { channel: ch, templateA: tplA, templateB: tplB, recipients: targetNumbers };
        }
      );

      let recipients:BroadcastTarget[]=audienceCandidates;
      if (!channel) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Canal de envio não encontrado no workspace",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!channel.is_active || channel.status !== "connected") {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/channel-inactive",
          title: "Canal Inativo",
          status: 422,
          detail: `O canal "${channel.display_name}" não está conectado no momento.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      // 🛑 MANDATORY BILLING GUARDRAIL: Lock if no direct card configured on Meta
      if (channel.provider === "meta_waba" && !channel.meta_billing_configured) {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/meta-billing-unconfigured",
          title: "Disparo Bloqueado — Faturamento Meta Não Declarado",
          status: 422,
          detail:
            "Disparo ativo bloqueado: o responsável ainda não declarou que conferiu o faturamento deste número na Meta. Confira diretamente na Meta e registre a declaração em Configurações > Canais WhatsApp. O CHAT-SALES não verifica nem cadastra cartão e não intermedeia tarifas da Meta.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (!templateA) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Modelo de mensagem (Variante A) não encontrado",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const verifiedForChannel = (tpl: MessageTemplateRecord) => tpl.status === "APPROVED" && !!tpl.meta_template_id && tpl.meta_verified_channel_id === channel.id && new Date(String(tpl.meta_verified_at)).getTime() > Date.now() - 86400000;
      if (channel.provider === "meta_waba" && !verifiedForChannel(templateA)) {
        return reply.status(422).send({
          type: "https://sos-sales.mct.br/errors/template-not-approved",
          title: "Modelo A Não Aprovado",
          status: 422,
          detail: `O modelo "${templateA.name}" está com status "${templateA.status}". Sincronize os modelos aprovados na Meta para este canal antes de enviar.`,
          instance: request.url,
          correlationId: request.id,
        });
      }

      if (isAbTest) {
        if (!templateB) {
          return reply.status(404).send({
            type: "https://sos-sales.mct.br/errors/not-found",
            title: "Not Found",
            status: 404,
            detail: "Modelo de mensagem para o Teste A/B (Variante B) não encontrado",
            instance: request.url,
            correlationId: request.id,
          });
        }
        if (channel.provider === "meta_waba" && !verifiedForChannel(templateB)) {
          return reply.status(422).send({
            type: "https://sos-sales.mct.br/errors/template-not-approved",
            title: "Modelo B Não Aprovado",
            status: 422,
            detail: `O modelo B "${templateB.name}" está com status "${templateB.status}". Sincronize os modelos aprovados na Meta para este canal antes de enviar.`,
            instance: request.url,
            correlationId: request.id,
          });
        }
      }

      if (!channel.phone_number_e164) return reply.code(422).send({ detail: "O canal precisa ter um telefone de envio confirmado antes de criar a campanha." });

      for(const [template,values] of [[templateA,variables],...(isAbTest&&templateB?[[templateB,variantBVariables] as const]:[])] as const){
        const rendered=renderBroadcastMessage(template,values,"[Nome do contato]");
        if(rendered.missing.length||rendered.errors.length||rendered.unsupported.length)return reply.code(422).send({code:"BROADCAST_VARIABLES_REQUIRED",detail:[...rendered.unsupported,...rendered.errors,...rendered.missing.map(label=>`Preencha ${label}.`)].join(" ")});
      }
      const requestPayload={name:customName,channelInstanceId,templateId,isAbTest,variantBTemplateId,audience,variables,variantBVariables};
      const fingerprint=crypto.createHash("sha256").update(JSON.stringify(requestPayload)).digest("hex");
      const contentFingerprint=crypto.createHash("sha256").update(JSON.stringify({channel,templateA,templateB})).digest("hex");
      if(mode==="prepare"){
        const included=audienceCandidates.filter(target=>!target.opt_out).map(({phone_e164,name,contact_id})=>({phone_e164,name,contact_id}));
        const excluded=audienceCandidates.filter(target=>target.opt_out).map(target=>({phoneE164:target.phone_e164,name:target.name,reason:"Mensagens comerciais bloqueadas"}));
        const preparation=await withTenantTransaction(workspaceId,async client=>(await client.query<{id:string;expires_at:Date}>(
          `INSERT INTO public.broadcast_preparations(workspace_id,actor_id,request_fingerprint,content_fingerprint,target_snapshot,excluded_snapshot) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id,expires_at`,
          [workspaceId,request.user.id,fingerprint,contentFingerprint,JSON.stringify(included),JSON.stringify(excluded)]
        )).rows[0]!);
        return reply.code(200).send({success:true,preparedAudienceId:preparation.id,expiresAt:preparation.expires_at,limit:1000,included:included.map(target=>({phoneE164:target.phone_e164,name:target.name})),excluded});
      }
      if(!parsedBody.data.preparedAudienceId)return reply.code(422).send({code:"BROADCAST_REVIEW_REQUIRED",detail:"Prepare e revise os destinatários antes de confirmar a campanha."});
      const preparation=await withTenantTransaction(workspaceId,async client=>(await client.query<{request_fingerprint:string;content_fingerprint:string;target_snapshot:BroadcastTarget[];valid:boolean}>(
        `SELECT p.request_fingerprint,p.content_fingerprint,p.target_snapshot,(p.expires_at>now() OR EXISTS(SELECT 1 FROM public.broadcast_campaigns bc WHERE bc.workspace_id=p.workspace_id AND bc.request_key=p.id)) AS valid FROM public.broadcast_preparations p WHERE p.id=$1 AND p.workspace_id=$2 AND p.actor_id=$3`,
        [parsedBody.data.preparedAudienceId,workspaceId,request.user.id]
      )).rows[0]);
      if(!preparation)return reply.code(404).send({code:"BROADCAST_REVIEW_NOT_FOUND",detail:"A revisão não está disponível para esta pessoa e empresa."});
      if(!preparation.valid||preparation.request_fingerprint!==fingerprint||preparation.content_fingerprint!==contentFingerprint)return reply.code(409).send({code:"BROADCAST_REVIEW_CHANGED",detail:"A revisão venceu ou a configuração mudou. Prepare o público novamente antes de confirmar."});
      if(mode==="test"){
        const phone=parsedBody.data.testPhone,variant=parsedBody.data.testVariant||"A";
        if(!phone||phone===channel.phone_number_e164)return reply.code(422).send({detail:"Informe um número de teste diferente do número do canal, com + e código do país."});
        const testContact=await withTenantTransaction(workspaceId,async client=>(await client.query<{opt_out:boolean;name:string|null}>("SELECT opt_out,name FROM contacts WHERE workspace_id=$1 AND phone_e164=$2",[workspaceId,phone])).rows[0]);
        if(!testContact)return reply.code(422).send({detail:"Cadastre primeiro o número de teste em Contatos & Leads. O teste usa um contato existente e não adiciona destinatários à campanha."});
        if(testContact.opt_out)return reply.code(422).send({detail:"O contato de teste bloqueou mensagens comerciais. Escolha outro contato autorizado."});
        if(variant==="B"&&(!isAbTest||!templateB))return reply.code(422).send({detail:"Esta revisão não possui variante B."});
        const template=variant==="B"&&templateB?templateB:templateA;
        const values=variant==="B"?variantBVariables:variables;
        const rendered=renderBroadcastMessage(template,values,testContact.name);
        const existing=await withTenantTransaction(workspaceId,async client=>(await client.query<{id:string;phone_e164:string}>("SELECT id,phone_e164 FROM broadcast_message_tests WHERE workspace_id=$1 AND preparation_id=$2 AND variant=$3",[workspaceId,parsedBody.data.preparedAudienceId,variant])).rows[0]);
        if(existing){
          if(existing.phone_e164!==phone)return reply.code(409).send({detail:"Esta variante já tem um teste. Consulte o resultado ou prepare uma nova revisão para trocar o número."});
          return {success:true,testId:existing.id,replayed:true};
        }
        const role=request.activeRole;
        if(!role||!["owner","admin","manager","operator"].includes(role))return reply.code(403).send({detail:"Papel não autorizado para teste de disparo"});
        const testId=crypto.randomUUID();
        const linkTest=async(client:import("@sos-sales/database").PoolClient,output:import("@sos-sales/contracts").ProduceOutboundOutput)=>{
          await client.query("INSERT INTO broadcast_message_tests(id,workspace_id,preparation_id,actor_id,variant,phone_e164,body_text,template_id,template_body,template_name,template_language,outbound_command_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(workspace_id,preparation_id,variant) DO NOTHING",[testId,workspaceId,parsedBody.data.preparedAudienceId,request.user.id,variant,phone,rendered.renderedText,template.id,template.body_text,template.name,template.language||"pt_BR",output.commandId]);
        };
        const producer=options.producerService??new TransactionalOutboundProducerService({onCreated:linkTest});
        const output=await producer.produce({recipientPhoneE164:phone,contentType:channel.provider==="meta_waba"?"template":rendered.mediaType,body:rendered.renderedText,mediaUrl:channel.provider!=="meta_waba"?rendered.mediaUrl:undefined,template:channel.provider==="meta_waba"?{name:template.name,language:template.language||"pt_BR",components:rendered.components}:undefined,idempotencyKey:`btest_${parsedBody.data.preparedAudienceId}_${variant}`},{workspaceId,channelInstanceId:channel.id,actorId:request.user.id,role:role as TrustedOutboundContext["role"],ipAddress:request.ip,userAgent:request.headers["user-agent"]});
        if(output.isIdempotentReplay||options.producerService)await withTenantTransaction(workspaceId,client=>linkTest(client,output));
        const saved=await withTenantTransaction(workspaceId,async client=>(await client.query<{id:string;phone_e164:string}>("SELECT id,phone_e164 FROM broadcast_message_tests WHERE workspace_id=$1 AND preparation_id=$2 AND variant=$3",[workspaceId,parsedBody.data.preparedAudienceId,variant])).rows[0]);
        if(!saved||saved.phone_e164!==phone)return reply.code(409).send({detail:"Já existe um teste desta variante para outro número. Consulte o resultado antes de continuar."});
        return {success:true,testId:saved.id,replayed:output.isIdempotentReplay};
      }
      const approved=await withTenantTransaction(workspaceId,async client=>(await client.query<{variant:string}>(`SELECT t.variant FROM broadcast_message_tests t JOIN outbound_commands oc ON oc.id=t.outbound_command_id AND oc.workspace_id=t.workspace_id WHERE t.workspace_id=$1 AND t.preparation_id=$2 AND t.actor_id=$3 AND t.id=ANY($4::uuid[]) AND oc.status='sent'`,[workspaceId,parsedBody.data.preparedAudienceId,request.user.id,parsedBody.data.approvedTestIds||[]])).rows);
      if(!approved.some(t=>t.variant==="A")||(isAbTest&&!approved.some(t=>t.variant==="B")))return reply.code(422).send({code:"BROADCAST_TEST_REQUIRED",detail:"Envie e confira o teste de cada variante antes de liberar a campanha. Aguarde a confirmação de envio do provedor."});
      const currentCandidates=await withTenantTransaction(workspaceId,client=>resolveBroadcastAudience(client,workspaceId,audience,preparation.target_snapshot,true));
      const eligible=new Set(currentCandidates.filter(target=>!target.opt_out).map(target=>target.phone_e164));
      const currentByPhone=new Map(currentCandidates.map(target=>[target.phone_e164,target]));
      recipients=preparation.target_snapshot.filter(target=>eligible.has(target.phone_e164)).map(target=>({...target,contact_id:currentByPhone.get(target.phone_e164)?.contact_id}));

      if (recipients.length === 0) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/empty-audience",
          title: "Público Vazio",
          status: 400,
          detail: "Nenhum contato ativo encontrado para os critérios de público selecionados.",
          instance: request.url,
          correlationId: request.id,
        });
      }


      // Generate Campaign Name
      const campaignName =
        customName?.trim() ||
        (isAbTest
          ? `Teste A/B: ${templateA.name} vs ${templateB?.name} · ${new Date().toLocaleDateString("pt-BR")}`
          : `${templateA.name} · ${new Date().toLocaleDateString("pt-BR")}`);

      // 2. Create Campaign Record in Database
      const requestKey = parsedBody.data.preparedAudienceId!;
      const campaign = await withTenantTransaction(workspaceId, async (client) => {
        const campRes = await client.query<{ id: string; request_fingerprint: string; status: string; target_snapshot: typeof recipients }>(
          `INSERT INTO public.broadcast_campaigns (
             workspace_id, name, channel_instance_id, is_ab_test,
             variant_a_template_id, variant_b_template_id,
             audience_type, audience_stage, total_targeted, status, request_key, request_fingerprint, target_snapshot
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued', $10, $11, $12::jsonb)
           ON CONFLICT (workspace_id,request_key) WHERE request_key IS NOT NULL DO UPDATE SET request_key=EXCLUDED.request_key
           RETURNING id,request_fingerprint,status,target_snapshot;`,
          [
            workspaceId,
            campaignName,
            channel.id,
            isAbTest,
            templateA.id,
            templateB ? templateB.id : null,
            audience.type,
            (audience.type==="SMART_FILTER" ? audience.smartFilter : audience.stage) || null,
            recipients.length, requestKey, fingerprint, JSON.stringify(recipients),
          ]
        );
        return campRes.rows[0]!;
      });
      if (campaign.request_fingerprint !== fingerprint) return reply.code(409).send({ detail: "Esta solicitação já foi usada com outra configuração" });
      recipients=campaign.target_snapshot;
      if (campaign.status === "cancelled") return reply.code(409).send({ detail: "Campanha cancelada não pode ser retomada" });

      // 3. Enqueue Outbound Messages via Producer & Track Granular Recipients
      let enqueuedCount = 0;

      for (let i = 0; i < recipients.length; i++) {
        const rec = recipients[i]!;
        // 50/50 Split for A/B Test
        const isVariantB = isAbTest && Boolean(templateB) && i % 2 !== 0;
        const currentVariant = isVariantB ? "B" : "A";
        const currentTemplate = isVariantB && templateB ? templateB : templateA;
        const currentVariables = isVariantB ? variantBVariables : variables;

        const rendered=renderBroadcastMessage(currentTemplate,currentVariables,rec.name);

        const idempotencyKey = `bcast_${campaign.id}_${rec.phone_e164}`;
        const rawRole = request.activeRole;
        if (!rawRole || !["owner", "admin", "manager", "operator"].includes(rawRole)) return reply.code(403).send({ detail: "Papel não autorizado para disparo" });
        const role = rawRole as "owner" | "admin" | "manager" | "operator";

        const context: TrustedOutboundContext = {
          workspaceId,
          channelInstanceId: channel.id,
          actorId: request.user.id,
          role,
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
        };

        const isMetaWaba = channel.provider === "meta_waba";


        try {
          const linkRecipient = async (client: import("@sos-sales/database").PoolClient, output: import("@sos-sales/contracts").ProduceOutboundOutput) => {
            await client.query(
              `INSERT INTO public.broadcast_recipients (
                 campaign_id, workspace_id, contact_id, phone_e164, variant, template_id, outbound_command_id, status
               ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued') ON CONFLICT (outbound_command_id) WHERE outbound_command_id IS NOT NULL DO NOTHING;`,
              [
                campaign.id,
                workspaceId,
                rec.contact_id || null,
                rec.phone_e164,
                currentVariant,
                currentTemplate.id,
                output.commandId,
              ]
            );
          };
          const campaignProducer = options.producerService ?? new TransactionalOutboundProducerService({ onCreated: linkRecipient });
          const produceResult = await campaignProducer.produce(
            {
              recipientPhoneE164: rec.phone_e164,
              contentType: isMetaWaba ? "template" : rendered.mediaType,
              body: rendered.renderedText,
              mediaUrl:isMetaWaba?undefined:rendered.mediaUrl,
              template: isMetaWaba
                ? {
                    name: currentTemplate.name,
                    language: currentTemplate.language || "pt_BR",
                    components:rendered.components,
                  }
                : undefined,
              idempotencyKey,
            },
            context
          );

          // Real producer commits the recipient link atomically with the outbox command.
          // Replays repair only an already recorded intention, without another send.
          if (produceResult.isIdempotentReplay || options.producerService) {
            await withTenantTransaction(workspaceId, client => linkRecipient(client, produceResult));
          }

          enqueuedCount++;
        } catch (error) {
          const cause = error as {name?: string;code?: string};
          request.log.warn({campaignId:campaign.id,errorName:cause.name,errorCode:cause.code}, "Campaign recipient could not be queued");
        }
      }

      // Update Campaign sent count
      await withTenantTransaction(workspaceId, async (client) => {
        await client.query(
          `UPDATE public.broadcast_campaigns
           SET status = CASE WHEN status='cancelled' THEN status WHEN $1 < total_targeted THEN 'partial' WHEN sent_count>=total_targeted THEN 'completed' ELSE 'queued' END, updated_at = clock_timestamp()
           WHERE id = $2 AND workspace_id = $3;`,
          [enqueuedCount, campaign.id, workspaceId]
        );

        // Audit Event
        await client.query(
          `INSERT INTO public.audit_events (
             workspace_id, actor_id, actor_type, action, resource_type, resource_id, metadata
           ) VALUES ($1, $2, 'human', $3, $4, $5, $6);`,
          [
            workspaceId,
            request.user.id,
            "broadcast.dispatched",
            "broadcast_campaign",
            campaign.id,
            JSON.stringify({
              campaignId: campaign.id,
              campaignName,
              channelId: channel.id,
              channelName: channel.display_name,
              isAbTest,
              templateAName: templateA.name,
              templateBName: templateB?.name || null,
              recipientsTargeted: recipients.length,
              enqueuedCount,
              billingMode: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
            }),
          ]
        );
      });

      return reply.status(200).send({
        success: enqueuedCount > 0,
        failedCount: recipients.length - enqueuedCount,
        requestKey,
        batchId: campaign.id,
        campaignId: campaign.id,
        campaignName,
        enqueuedCount,
        totalTargeted: recipients.length,
        isAbTest,
        template: {
          name: templateA.name,
          category: templateA.category,
        },
        templateB: templateB
          ? {
              name: templateB.name,
              category: templateB.category,
            }
          : undefined,
        channel: {
          id: channel.id,
          displayName: channel.display_name,
          provider: channel.provider,
        },
        billingSummary: {
          policy: "DIRECT_TO_META_CUSTOMER_ACCOUNT",
          estimatedUnitCost: "Consulte os valores vigentes no provedor; estimativa não disponível aqui.",
          message: "A fila confirma preparação para envio. Entrega e custos dependem do canal e do provedor.",
        },
      });
    }
  );
  app.get("/v1/workspaces/:workspaceId/broadcasts/preparations/:preparationId/tests",{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission("cockpit:send_message")]},async(request,reply)=>{
    const p=z.object({workspaceId:z.string().uuid(),preparationId:z.string().uuid()}).safeParse(request.params);
    if(!p.success)return reply.code(400).send({detail:"Revisão inválida"});
    const tests=await withTenantTransaction(p.data.workspaceId,async client=>(await client.query(`SELECT t.id,t.variant,t.phone_e164 AS "phoneE164",t.body_text AS body,oc.status FROM broadcast_message_tests t JOIN outbound_commands oc ON oc.id=t.outbound_command_id AND oc.workspace_id=t.workspace_id JOIN broadcast_preparations p ON p.id=t.preparation_id AND p.workspace_id=t.workspace_id WHERE t.workspace_id=$1 AND t.preparation_id=$2 AND p.actor_id=$3 ORDER BY t.variant`,[p.data.workspaceId,p.data.preparationId,request.user.id])).rows);
    return {tests};
  });
  app.post("/v1/workspaces/:workspaceId/broadcasts/:campaignId/cancel", {
    preHandler: [app.authenticate, app.requireWorkspaceContext, app.requirePermission("workspace:manage")],
  }, async (request, reply) => {
    const p=z.object({workspaceId:z.string().uuid(),campaignId:z.string().uuid()}).safeParse(request.params);
    if (!p.success) return reply.code(400).send({detail:"Campanha inválida"});
    const result=await withTenantTransaction(p.data.workspaceId, async client => {
      const current=(await client.query<{id:string;status:string}>(
        "SELECT id,status FROM public.broadcast_campaigns WHERE workspace_id=$1 AND id=$2 FOR UPDATE",[p.data.workspaceId,p.data.campaignId]
      )).rows[0];
      if(!current||current.status==="cancelled"||!["queued","partial","processing"].includes(current.status))return current;
      return (await client.query<{id:string;status:string}>(
        "UPDATE public.broadcast_campaigns SET status='cancelled',updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING id,status",[p.data.workspaceId,p.data.campaignId]
      )).rows[0];
    });
    if(!result) return reply.code(404).send({detail:"Campanha não encontrada"});
    if(result.status!=="cancelled")return reply.code(409).send({detail:"Esta campanha já terminou e não pode ser cancelada. Atualize a lista para conferir o resultado."});
    return {campaign:result, detail:"Novos envios foram bloqueados. Envios já iniciados podem ter ocorrido e precisam de conferência."};
  });

};
