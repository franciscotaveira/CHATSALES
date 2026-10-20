import type { PoolClient } from "pg";

export type FlowCategory =
  | "LEAD_GENERATION"
  | "APPOINTMENT_BOOKING"
  | "CUSTOMER_SUPPORT"
  | "SURVEY";

export type FlowStatus = "DRAFT" | "PUBLISHED" | "DEPRECATED" | "BLOCKED";

export interface FlowScreenPreviewField {
  id: string;
  type: "text" | "select" | "radio" | "date" | "textarea";
  label: string;
  required?: boolean;
  options?: Array<{ id: string; title: string }>;
}

export interface FlowScreenPreview {
  id: string;
  title: string;
  fields: FlowScreenPreviewField[];
}

export interface WhatsAppFlowRecord {
  id: string;
  workspace_id: string;
  name: string;
  title: string;
  description: string | null;
  category: FlowCategory;
  status: FlowStatus;
  meta_flow_id: string;
  cta_label: string;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  initial_screen: string;
  screens_preview: FlowScreenPreview[];
  created_at: Date;
  updated_at: Date;
}

export interface CanonicalMasterFlow {
  name: string;
  title: string;
  description: string;
  category: FlowCategory;
  status: FlowStatus;
  meta_flow_id: string;
  cta_label: string;
  header_text: string;
  body_text: string;
  footer_text: string;
  initial_screen: string;
  screens_preview: FlowScreenPreview[];
}

export const CANONICAL_MASTER_FLOWS: CanonicalMasterFlow[] = [
  {
    name: "agendamento_horario_v1",
    title: "Agendamento de Horário 🗓️",
    description: "Permite ao cliente escolher data, horário e serviço diretamente na tela do WhatsApp.",
    category: "APPOINTMENT_BOOKING" as FlowCategory,
    status: "DRAFT" as FlowStatus,
    meta_flow_id: "meta_flow_booking_canon_01",
    cta_label: "Escolher Horário 🗓️",
    header_text: "Agendamento Online",
    body_text: "Olá! Selecione o melhor dia e horário para o seu atendimento diretamente pelo formulário abaixo.",
    footer_text: "SOS Sales Oficial",
    initial_screen: "SERVICE_SELECTION",
    screens_preview: [
      {
        id: "SERVICE_SELECTION",
        title: "1. Escolha o Atendimento",
        fields: [
          {
            id: "servico",
            type: "radio",
            label: "Qual tipo de atendimento você deseja?",
            required: true,
            options: [
              { id: "comercial", title: "Apresentação Comercial VIP" },
              { id: "consultoria", title: "Consultoria Estratégica" },
              { id: "suporte", title: "Suporte & Dúvidas Rápidas" },
            ],
          },
        ],
      },
      {
        id: "DATE_TIME",
        title: "2. Data e Turno de Preferência",
        fields: [
          {
            id: "data_preferida",
            type: "date",
            label: "Melhor data para você",
            required: true,
          },
          {
            id: "turno",
            type: "select",
            label: "Turno de preferência",
            required: true,
            options: [
              { id: "manha", title: "Manhã (09:00 - 12:00)" },
              { id: "tarde", title: "Tarde (14:00 - 18:00)" },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "qualificacao_lead_v1",
    title: "Qualificação Comercial 🎯",
    description: "Mapeia porte da empresa, orçamento e urgência do lead em poucos segundos.",
    category: "LEAD_GENERATION" as FlowCategory,
    status: "DRAFT" as FlowStatus,
    meta_flow_id: "meta_flow_qualify_canon_02",
    cta_label: "Iniciar Diagnóstico 🎯",
    header_text: "Diagnóstico Comercial",
    body_text: "Para indicarmos a solução ideal para seu momento, responda a estas breves perguntas diretamente no formulário.",
    footer_text: "Atendimento Especializado",
    initial_screen: "QUALIFY_SCREEN",
    screens_preview: [
      {
        id: "QUALIFY_SCREEN",
        title: "Perfil Comercial",
        fields: [
          {
            id: "faturamento",
            type: "select",
            label: "Qual o faturamento mensal da sua operação?",
            required: true,
            options: [
              { id: "ate_20k", title: "Até R$ 20.000 / mês" },
              { id: "20k_50k", title: "R$ 20.000 a R$ 50.000 / mês" },
              { id: "acima_50k", title: "Acima de R$ 50.000 / mês" },
            ],
          },
          {
            id: "urgencia",
            type: "radio",
            label: "Qual o seu prazo para implementar?",
            required: true,
            options: [
              { id: "imediato", title: "Imediato (esta semana)" },
              { id: "30_dias", title: "Próximos 30 dias" },
              { id: "pesquisando", title: "Apenas conhecendo" },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "pesquisa_nps_v1",
    title: "Pesquisa de Satisfação ⭐",
    description: "Coleta feedback rápido com nota NPS e comentário para melhoria contínua.",
    category: "SURVEY" as FlowCategory,
    status: "DRAFT" as FlowStatus,
    meta_flow_id: "meta_flow_nps_canon_03",
    cta_label: "Avaliar Atendimento ⭐",
    header_text: "Sua Avaliação",
    body_text: "Sua experiência é fundamental para nós. Como você avalia nosso atendimento de hoje?",
    footer_text: "Leva menos de 30 segundos",
    initial_screen: "NPS_RATING",
    screens_preview: [
      {
        id: "NPS_RATING",
        title: "Avaliação do Atendimento",
        fields: [
          {
            id: "nota",
            type: "select",
            label: "De 0 a 10, que nota você dá ao nosso atendimento?",
            required: true,
            options: [
              { id: "10", title: "⭐ 10 — Excelente" },
              { id: "9", title: "⭐ 9 — Muito Bom" },
              { id: "8", title: "⭐ 8 — Bom" },
              { id: "7", title: "7 — Regular" },
              { id: "5", title: "5 ou menos — Precisa Melhorar" },
            ],
          },
          {
            id: "comentario",
            type: "textarea",
            label: "Gostaria de deixar algum elogio ou sugestão? (Opcional)",
            required: false,
          },
        ],
      },
    ],
  },
];

export async function listWhatsAppFlows(
  client: PoolClient,
  workspaceId: string,
  options?: { category?: FlowCategory; status?: FlowStatus }
): Promise<WhatsAppFlowRecord[]> {
  let query = `
    SELECT 
      id,
      workspace_id,
      name,
      title,
      description,
      category,
      status,
      meta_flow_id,
      cta_label,
      header_text,
      body_text,
      footer_text,
      initial_screen,
      screens_preview,
      created_at,
      updated_at
    FROM public.whatsapp_flows
    WHERE workspace_id = $1
  `;
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;

  if (options?.category) {
    query += ` AND category = $${paramIdx++}`;
    params.push(options.category);
  }

  if (options?.status) {
    query += ` AND status = $${paramIdx++}`;
    params.push(options.status);
  }

  query += ` ORDER BY created_at ASC`;

  const result = await client.query(query, params);

  return result.rows.map(mapRowToFlow);
}

export async function upsertWhatsAppFlow(
  client: PoolClient,
  flow: {
    workspaceId: string;
    name: string;
    title: string;
    description?: string | null;
    category?: FlowCategory;
    status?: FlowStatus;
    metaFlowId: string;
    ctaLabel: string;
    headerText?: string | null;
    bodyText: string;
    footerText?: string | null;
    initialScreen?: string;
    screensPreview?: FlowScreenPreview[];
  }
): Promise<WhatsAppFlowRecord> {
  const query = `
    INSERT INTO public.whatsapp_flows (
      workspace_id,
      name,
      title,
      description,
      category,
      status,
      meta_flow_id,
      cta_label,
      header_text,
      body_text,
      footer_text,
      initial_screen,
      screens_preview,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now()
    )
    ON CONFLICT (workspace_id, name) DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      category = EXCLUDED.category,
      status = EXCLUDED.status,
      meta_flow_id = EXCLUDED.meta_flow_id,
      cta_label = EXCLUDED.cta_label,
      header_text = EXCLUDED.header_text,
      body_text = EXCLUDED.body_text,
      footer_text = EXCLUDED.footer_text,
      initial_screen = EXCLUDED.initial_screen,
      screens_preview = EXCLUDED.screens_preview,
      updated_at = now()
    RETURNING *
  `;

  const params = [
    flow.workspaceId,
    flow.name,
    flow.title,
    flow.description || null,
    flow.category || "LEAD_GENERATION",
    flow.status || "DRAFT",
    flow.metaFlowId,
    flow.ctaLabel,
    flow.headerText || null,
    flow.bodyText,
    flow.footerText || null,
    flow.initialScreen || "START_SCREEN",
    JSON.stringify(flow.screensPreview || []),
  ];

  const result = await client.query(query, params);
  return mapRowToFlow(result.rows[0]);
}

export async function seedMasterFlows(
  client: PoolClient,
  workspaceId: string
): Promise<void> {
  for (const flow of CANONICAL_MASTER_FLOWS) {
    await upsertWhatsAppFlow(client, {
      workspaceId,
      name: flow.name,
      title: flow.title,
      description: flow.description,
      category: flow.category,
      status: flow.status,
      metaFlowId: flow.meta_flow_id,
      ctaLabel: flow.cta_label,
      headerText: flow.header_text,
      bodyText: flow.body_text,
      footerText: flow.footer_text,
      initialScreen: flow.initial_screen,
      screensPreview: flow.screens_preview,
    });
  }
}

function mapRowToFlow(row: Record<string, unknown>): WhatsAppFlowRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    title: String(row.title),
    description: row.description ? String(row.description) : null,
    category: row.category as FlowCategory,
    status: row.status as FlowStatus,
    meta_flow_id: String(row.meta_flow_id),
    cta_label: String(row.cta_label),
    header_text: row.header_text ? String(row.header_text) : null,
    body_text: String(row.body_text),
    footer_text: row.footer_text ? String(row.footer_text) : null,
    initial_screen: String(row.initial_screen),
    screens_preview: (Array.isArray(row.screens_preview)
      ? row.screens_preview
      : typeof row.screens_preview === "string"
      ? JSON.parse(row.screens_preview)
      : []) as FlowScreenPreview[],
    created_at: new Date(row.created_at as string | number | Date),
    updated_at: new Date(row.updated_at as string | number | Date),
  };
}
