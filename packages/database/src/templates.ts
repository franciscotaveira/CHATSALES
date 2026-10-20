import type { PoolClient } from "pg";

export interface StoredTemplateComponent{type:string;format?:string;text?:string;buttons?:Array<{type:string;text?:string;url?:string;phone_number?:string}>;}

export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";
export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";

export interface MessageTemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface MessageTemplateRecord {
  id: string;
  workspace_id: string;
  name: string;
  category: TemplateCategory;
  language: string;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: MessageTemplateButton[];
  variables: string[];
  status: TemplateStatus;
  meta_template_id: string | null;
  provider_components?:StoredTemplateComponent[];
  parameter_format?:string;
  meta_verified_at?:Date|null;
  meta_verified_channel_id?:string|null;
  created_at: Date;
  updated_at: Date;
}

export const CANONICAL_MASTER_TEMPLATES = [
  {
    name: "confirmacao_agendamento_v1",
    category: "UTILITY" as TemplateCategory,
    language: "pt_BR",
    header_text: "Confirmação de Agendamento",
    body_text: "Olá {{1}}, confirmamos o seu agendamento para {{2}} às {{3}}. Caso precise alterar ou reagendar, basta responder por aqui.",
    footer_text: "Atendimento Oficial",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar Presença" },
      { type: "QUICK_REPLY", text: "Reagendar Horário" },
    ],
    variables: ["nome", "data", "horario"],
  },
  {
    name: "lembrete_2h_atendimento_v1",
    category: "UTILITY" as TemplateCategory,
    language: "pt_BR",
    header_text: "Lembrete de Horário",
    body_text: "Olá {{1}}, passando para lembrar que seu atendimento será hoje às {{2}} (em aproximadamente 2 horas). Nossa equipe já está preparada.",
    footer_text: "SOS Sales",
    buttons: [
      { type: "QUICK_REPLY", text: "Estou a Caminho" },
      { type: "QUICK_REPLY", text: "Preciso de Ajuda" },
    ],
    variables: ["nome", "horario"],
  },
  {
    name: "reativacao_lead_esfriado_v1",
    category: "MARKETING" as TemplateCategory,
    language: "pt_BR",
    header_text: "Condição Especial Reservada",
    body_text: "Olá {{1}}, notamos seu interesse em nossa solução e separamos uma condição exclusiva com bônus especial válida até {{2}}. Deseja conferir?",
    footer_text: "Oferta Exclusiva",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero Ver Detalhes" },
      { type: "QUICK_REPLY", text: "Falar com Consultor" },
    ],
    variables: ["nome", "prazo"],
  },
  {
    name: "oferta_relampago_vip_v1",
    category: "MARKETING" as TemplateCategory,
    language: "pt_BR",
    header_text: "Acesso Liberado ⚡",
    body_text: "{{1}}, liberamos a condição VIP com desconto especial para {{2}}. Toque no botão abaixo para garantir o seu acesso antes do encerramento.",
    footer_text: "Tempo Limitado",
    buttons: [
      { type: "QUICK_REPLY", text: "Garantir Agora" },
      { type: "QUICK_REPLY", text: "Tirar Dúvidas" },
    ],
    variables: ["nome", "produto"],
  },
];

export async function listMessageTemplates(
  client: PoolClient,
  workspaceId: string,
  options?: { category?: TemplateCategory; status?: TemplateStatus }
): Promise<MessageTemplateRecord[]> {
  let query = `
    SELECT 
      id,
      workspace_id,
      name,
      category,
      language,
      header_text,
      body_text,
      footer_text,
      buttons,
      variables,
      status,
      meta_template_id,
      provider_components,parameter_format,meta_verified_at,meta_verified_channel_id,
      created_at,
      updated_at
    FROM public.message_templates
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

  query += ` ORDER BY category ASC, name ASC`;

  const result = await client.query(query, params);

  return result.rows.map(mapRowToTemplate);
}

export async function getMessageTemplateByName(
  client: PoolClient,
  workspaceId: string,
  name: string
): Promise<MessageTemplateRecord | null> {
  const query = `
    SELECT 
      id,
      workspace_id,
      name,
      category,
      language,
      header_text,
      body_text,
      footer_text,
      buttons,
      variables,
      status,
      meta_template_id,
      provider_components,parameter_format,meta_verified_at,meta_verified_channel_id,
      created_at,
      updated_at
    FROM public.message_templates
    WHERE workspace_id = $1 AND name = $2
    LIMIT 1
  `;
  const result = await client.query(query, [workspaceId, name]);
  if (result.rows.length === 0) return null;
  return mapRowToTemplate(result.rows[0]);
}

export async function upsertMessageTemplate(
  client: PoolClient,
  template: {
    workspaceId: string;
    name: string;
    category: TemplateCategory;
    language?: string;
    headerText?: string | null;
    bodyText: string;
    footerText?: string | null;
    buttons?: MessageTemplateButton[];
    variables?: string[];
    status?: TemplateStatus;
    metaTemplateId?: string | null;
    providerComponents?:StoredTemplateComponent[];
    parameterFormat?:string;
  }
): Promise<MessageTemplateRecord> {
  const query = `
    INSERT INTO public.message_templates (
      workspace_id,
      name,
      category,
      language,
      header_text,
      body_text,
      footer_text,
      buttons,
      variables,
      status,
      meta_template_id,provider_components,parameter_format,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, now()
    )
    ON CONFLICT (workspace_id, name) DO UPDATE SET
      category = EXCLUDED.category,
      language = EXCLUDED.language,
      header_text = EXCLUDED.header_text,
      body_text = EXCLUDED.body_text,
      footer_text = EXCLUDED.footer_text,
      buttons = EXCLUDED.buttons,
      variables = EXCLUDED.variables,
      status = EXCLUDED.status,
      meta_template_id = COALESCE(EXCLUDED.meta_template_id, public.message_templates.meta_template_id),
      provider_components=EXCLUDED.provider_components,parameter_format=EXCLUDED.parameter_format,
      updated_at = now()
    RETURNING *
  `;

  const params = [
    template.workspaceId,
    template.name,
    template.category,
    template.language || "pt_BR",
    template.headerText || null,
    template.bodyText,
    template.footerText || null,
    JSON.stringify(template.buttons || []),
    JSON.stringify(template.variables || []),
    template.status || "PENDING",
    template.metaTemplateId || null,
    JSON.stringify(template.providerComponents??[]),template.parameterFormat??"POSITIONAL",
  ];

  const result = await client.query(query, params);
  return mapRowToTemplate(result.rows[0]);
}

export async function seedMasterTemplates(
  client: PoolClient,
  workspaceId: string
): Promise<void> {
  for (const tpl of CANONICAL_MASTER_TEMPLATES) {
    await upsertMessageTemplate(client, {
      workspaceId,
      name: tpl.name,
      category: tpl.category,
      language: tpl.language,
      headerText: tpl.header_text,
      bodyText: tpl.body_text,
      footerText: tpl.footer_text,
      buttons: tpl.buttons,
      variables: tpl.variables,
      status: "PENDING",
    });
  }
}

function mapRowToTemplate(row: Record<string, unknown>): MessageTemplateRecord {
  return {
    id: String(row.id),
    workspace_id: String(row.workspace_id),
    name: String(row.name),
    category: row.category as TemplateCategory,
    language: String(row.language),
    header_text: row.header_text ? String(row.header_text) : null,
    body_text: String(row.body_text),
    footer_text: row.footer_text ? String(row.footer_text) : null,
    buttons: (Array.isArray(row.buttons)
      ? row.buttons
      : typeof row.buttons === "string"
      ? JSON.parse(row.buttons)
      : []) as MessageTemplateButton[],
    variables: (Array.isArray(row.variables)
      ? row.variables
      : typeof row.variables === "string"
      ? JSON.parse(row.variables)
      : []) as string[],
    status: row.status as TemplateStatus,
    meta_template_id: row.meta_template_id ? String(row.meta_template_id) : null,
    provider_components:(Array.isArray(row.provider_components)?row.provider_components:[]) as StoredTemplateComponent[],
    parameter_format:String(row.parameter_format??"POSITIONAL"),
    meta_verified_at:row.meta_verified_at?new Date(row.meta_verified_at as string|Date):null,
    meta_verified_channel_id:row.meta_verified_channel_id?String(row.meta_verified_channel_id):null,
    created_at: new Date(row.created_at as string | number | Date),
    updated_at: new Date(row.updated_at as string | number | Date),
  };
}
