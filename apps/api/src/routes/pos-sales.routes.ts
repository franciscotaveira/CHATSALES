import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createOrGetContact,
  createCommercialProposal,
  recordCommercialOutcome,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const posSaleBodySchema = z.object({
  customer: z.object({
    name: z.string().trim().min(2, "Nome deve ter ao menos 2 caracteres").max(150),
    phoneE164: z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/, "Telefone deve estar no formato E.164 (ex: +5549999999999)"),
    documentType: z.enum(["CPF", "CNPJ"]),
    documentNumber: z.string().trim().min(11).max(18),
    email: z.string().email("E-mail inválido").optional().or(z.literal("")),
    companyName: z.string().trim().max(200).optional(),
    tradeName: z.string().trim().max(200).optional(),
    address: z
      .object({
        zipCode: z.string().max(10).optional(),
        street: z.string().max(200).optional(),
        number: z.string().max(30).optional(),
        neighborhood: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(2).optional(),
      })
      .optional(),
  }),
  sale: z.object({
    title: z.string().trim().min(1).max(200).default("Venda de Balcão"),
    items: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          unitPriceCents: z.number().int().positive("Valor unitário deve ser positivo"),
          quantity: z.number().int().positive().default(1),
        })
      )
      .min(1, "Adicione ao menos um item na venda"),
    totalCents: z.number().int().positive(),
    paymentMethod: z.enum(["dinheiro", "pix", "credito", "debito", "outros"]).default("pix"),
  }),
  fiscal: z
    .object({
      emitNfe: z.boolean().default(false),
      naturezaOperacao: z.string().max(100).optional().default("Venda presencial no balcão"),
    })
    .optional(),
  postSale: z
    .object({
      sendUtilityWhatsapp: z.boolean().default(true),
      bonusPercent: z.number().int().min(1).max(100).default(10),
      bonusCoupon: z.string().max(50).default("CLIENTEVIP"),
      followUpFlow: z.enum(["agendamento", "pesquisa_satisfacao", "oferta_recompra"]).default("oferta_recompra"),
    })
    .optional(),
});

export const posSalesRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/v1/workspaces/:workspaceId/pos/sales",
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
          title: "Parâmetro Inválido",
          status: 400,
          detail: "workspaceId inválido",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = posSaleBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Dados da Venda Inválidos",
          status: 400,
          detail: parseResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const data = parseResult.data;

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          // 1. Obter ou criar contato no workspace
          const contact = await createOrGetContact(
            client,
            workspaceId,
            data.customer.phoneE164,
            data.customer.name
          );

          // 2. Enriquecer metadados fiscais no contato
          const fiscalMetadata = {
            documentType: data.customer.documentType,
            documentNumber: data.customer.documentNumber,
            companyName: data.customer.companyName || (data.customer.documentType === "CNPJ" ? data.customer.name : undefined),
            tradeName: data.customer.tradeName,
            address: data.customer.address,
            lastSaleAt: new Date().toISOString(),
            preferredPaymentMethod: data.sale.paymentMethod,
          };

          await client.query(
            `UPDATE public.contacts 
             SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{fiscal}', $1::jsonb),
                 display_name = COALESCE($2, display_name),
                 email = COALESCE(NULLIF($3, ''), email),
                 updated_at = clock_timestamp()
             WHERE workspace_id = $4 AND id = $5`,
            [
              JSON.stringify(fiscalMetadata),
              data.customer.name,
              data.customer.email || null,
              workspaceId,
              contact.id,
            ]
          );

          // 3. Localizar canal ativo para comunicação WhatsApp
          const channel = (
            await client.query<{ id: string; provider: string; name: string }>(
              `SELECT id, provider, name 
               FROM public.channel_instances 
               WHERE workspace_id = $1 AND status = 'active' 
               ORDER BY updated_at DESC LIMIT 1`,
              [workspaceId]
            )
          ).rows[0];

          // 4. Localizar ou criar conversa (commercial_threads)
          let threadId: string | null = null;
          if (channel) {
            const existingThread = (
              await client.query<{ id: string }>(
                `SELECT id FROM public.commercial_threads 
                 WHERE workspace_id = $1 AND contact_id = $2 
                 ORDER BY last_message_at DESC NULLS LAST LIMIT 1`,
                [workspaceId, contact.id]
              )
            ).rows[0];

            if (existingThread) {
              threadId = existingThread.id;
            } else {
              const newThread = (
                await client.query<{ id: string }>(
                  `INSERT INTO public.commercial_threads (workspace_id, channel_instance_id, contact_id, status)
                   VALUES ($1, $2, $3, 'active')
                   RETURNING id`,
                  [workspaceId, channel.id, contact.id]
                )
              ).rows[0];
              threadId = newThread?.id ?? null;
            }
          }

          // 5. Criar a proposta de venda balcão já no estado aceito
          const proposal = await createCommercialProposal(client, {
            workspaceId,
            threadId: threadId ?? undefined,
            contactId: contact.id,
            title: data.sale.title,
            items: data.sale.items,
            currency: "BRL",
            userId: request.user.id,
          });

          // Aceitar proposta e registrar data de fechamento
          await client.query(
            `UPDATE public.commercial_proposals 
             SET status = 'accepted', accepted_at = clock_timestamp() 
             WHERE workspace_id = $1 AND id = $2`,
            [workspaceId, proposal.id]
          );

          // 6. Registrar resultado comercial (Venda Ganha / WON)
          if (proposal.journey_id) {
            try {
              await recordCommercialOutcome(client, workspaceId, {
                journeyId: proposal.journey_id,
                status: "won",
                valueCents: data.sale.totalCents,
                currency: "BRL",
                registeredByUserId: request.user.id,
                reason: `Venda balcão realizada (${data.sale.paymentMethod})`,
              });
            } catch (err) {
              request.log.warn({ err }, "Aviso: não foi possível registrar desfecho comercial na jornada");
            }
          }

          // 7. Preparar mensagem de pós-venda WABA (Utility) se solicitado
          let whatsappQueued = false;
          let utilityMessageText = "";

          if (data.postSale?.sendUtilityWhatsapp && channel && threadId) {
            const formattedTotal = new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(data.sale.totalCents / 100);

            utilityMessageText =
              `Olá, ${data.customer.name}! Obrigado por sua compra. ` +
              `Registramos o seu pedido no valor de ${formattedTotal}.\n\n` +
              `📄 Deseja receber a sua Nota Fiscal por aqui agora?\n` +
              `Responda *SIM* para emitir e receber o documento em PDF.`;

            // Gravar mensagem no histórico da conversa
            const msgResult = await client.query<{ id: string }>(
              `INSERT INTO public.commercial_messages 
               (workspace_id, thread_id, direction, body, delivery_status, created_at)
               VALUES ($1, $2, 'outbound', $3, 'pending', clock_timestamp())
               RETURNING id`,
              [workspaceId, threadId, utilityMessageText]
            );

            // Enfileirar no outbox para disparo imediato pelo worker WAHA/Cloud API
            await client.query(
              `INSERT INTO public.outbound_commands 
               (workspace_id, channel_instance_id, contact_id, command_type, payload, status)
               VALUES ($1, $2, $3, 'send_text', $4::jsonb, 'pending')`,
              [
                workspaceId,
                channel.id,
                contact.id,
                JSON.stringify({
                  text: utilityMessageText,
                  recipientPhone: data.customer.phoneE164,
                  messageId: msgResult.rows[0]?.id,
                  category: "UTILITY",
                  intent: "post_sale_invoice_prompt",
                  bonusCoupon: data.postSale.bonusCoupon,
                  bonusPercent: data.postSale.bonusPercent,
                }),
              ]
            );

            whatsappQueued = true;
          }

          return {
            success: true,
            contactId: contact.id,
            proposalId: proposal.id,
            threadId,
            totalCents: data.sale.totalCents,
            fiscalStatus: data.fiscal?.emitNfe ? "solicitada" : "nao_solicitada",
            whatsappDispatched: whatsappQueued,
            postSalePrompt: utilityMessageText || null,
          };
        });

        return reply.status(201).send(result);
      } catch (err: unknown) {
        const error = err as Error;
        request.log.error({ err: error }, "Falha ao registrar venda de balcão");
        return reply.status(500).send({
          type: "https://sos-sales.mct.br/errors/internal",
          title: "Erro ao registrar venda",
          status: 500,
          detail: error.message,
          instance: request.url,
          correlationId: request.id,
        });
      }
    }
  );
};
