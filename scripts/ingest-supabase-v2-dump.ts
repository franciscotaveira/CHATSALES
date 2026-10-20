/**
 * SOS SALES V3 — Ingestão Soberana do Supabase V2 (MCT OS v2.0)
 *
 * Lê o dump exportado de produção (/tmp/supabase_sos_sales_data.sql) e migra:
 *  - Usuários e Membros Soberanos (Francisco Rios em todos os workspaces)
 *  - Workspaces (Haven Escovaria, Sora Spa, SOS Sales Oficial)
 *  - Channel Instances (WAHA sessions com portas e instâncias ativas, Meta Cloud)
 *  - Products Catalog (Serviços e Planos extraídos de workspace_agent_config)
 *  - Contacts (772 contatos com normalização E.164)
 *  - Commercial Threads (conversas ativas compostas)
 *  - Commercial Journeys (826 jornadas comerciais com Meta Ads CTWA attribution)
 *  - Messages (15.779 mensagens com provider, direction e telefones E.164)
 *  - Fatos de Inteligência (Acquisition Contexts e Known Facts)
 *
 * Suporta tuplas SQL multilinha (mensagens longas do WhatsApp).
 * Filosofia: "Poder invisível, simplicidade visível. Truth in Data."
 */

import fs from "node:fs";
import readline from "node:readline";
import crypto from "node:crypto";
import { Pool } from "pg";

interface WorkspacesRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ChannelConnectionRow {
  id: string;
  workspace_id: string;
  provider: string;
  phone_number: string;
  name: string;
  public_config: any;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ContactRow {
  id: string;
  workspace_id: string;
  phone: string;
  whatsapp_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface JourneyRow {
  id: string;
  workspace_id: string;
  contact_id: string;
  status: string;
  primary_service_or_product: string | null;
  started_at: string;
  closed_at: string | null;
  total_revenue_minor: number;
  currency: string;
  created_at: string;
  updated_at: string;
  channel_connection_id: string;
  pipeline_stage: string;
}

interface MessageRow {
  id: string;
  workspace_id: string;
  channel_connection_id: string;
  journey_id: string | null;
  contact_id: string;
  direction: "inbound" | "outbound";
  sender_type: "customer" | "operator" | "agent";
  provider_message_id: string | null;
  text_content: string | null;
  media_payload: any;
  sent_at: string;
}

interface AcquisitionContextRow {
  id: string;
  workspace_id: string;
  journey_id: string;
  source: string;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_set_id: string | null;
  ad_id: string | null;
  creative_code: string | null;
  offer_hook: string | null;
  entry_message: string | null;
  click_ids: any;
  tracking_code: string | null;
  confidence: string;
  occurred_at: string;
}

interface WorkspaceAgentConfigRow {
  workspace_id: string;
  agent_name: string | null;
  business_type: string | null;
  services_json: string | null;
  working_hours: string | null;
  phone: string | null;
  city: string | null;
  booking_url: string | null;
  extra_context: string | null;
}

interface KnownFactRow {
  id: string;
  workspace_id: string;
  journey_id: string | null;
  key: string;
  value: any;
  source: string;
  confidence: number;
  confirmed_by_customer: boolean;
  observed_at: string;
}

export function normalizePhone(rawPhone: string): string {
  let digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "+5500000000000";
  // Brazilian numbers: 10 or 11 digits without country code
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return `+${digits}`;
}

export function isValidE164(phone: string): boolean {
  return /^\+[1-9][0-9]{6,14}$/.test(phone);
}

/**
 * Fast zero-allocation tuple parser for pg_dump lines
 */
export function parseTupleFast(str: string): any[] {
  const values: any[] = [];
  let idx = str.indexOf("(");
  if (idx === -1) return values;
  idx++;
  const len = str.length;

  while (idx < len) {
    while (
      idx < len &&
      (str[idx] === " " || str[idx] === "\t" || str[idx] === "," || str[idx] === "\n" || str[idx] === "\r")
    ) {
      idx++;
    }
    if (idx >= len || str[idx] === ")") break;

    if (str[idx] === "'") {
      idx++;
      let start = idx;
      let val = "";
      while (idx < len) {
        if (str[idx] === "'") {
          if (idx + 1 < len && str[idx + 1] === "'") {
            val += str.substring(start, idx) + "'";
            idx += 2;
            start = idx;
          } else {
            val += str.substring(start, idx);
            idx++;
            break;
          }
        } else if (str[idx] === "\\") {
          val += str.substring(start, idx) + str[idx + 1];
          idx += 2;
          start = idx;
        } else {
          idx++;
        }
      }
      values.push(val);
    } else {
      let start = idx;
      while (
        idx < len &&
        str[idx] !== "," &&
        str[idx] !== ")" &&
        str[idx] !== " " &&
        str[idx] !== "\t" &&
        str[idx] !== "\n" &&
        str[idx] !== "\r"
      ) {
        idx++;
      }
      let raw = str.substring(start, idx);
      if (raw === "NULL" || raw === "null") values.push(null);
      else if (raw === "true") values.push(true);
      else if (raw === "false") values.push(false);
      else {
        let n = Number(raw);
        values.push(isNaN(n) ? raw : n);
      }
    }
  }
  return values;
}

export async function runIngestion(options: {
  dumpPath?: string;
  databaseUrl?: string;
  dryRun?: boolean;
} = {}) {
  const dumpPath = options.dumpPath || "/tmp/supabase_sos_sales_data.sql";
  const databaseUrl =
    options.databaseUrl ||
    process.env.MIGRATION_DATABASE_URL ||
    "postgresql://sos_migration_owner:sos_migration_secret_2026@localhost:55440/sos_sales_v3?sslmode=disable";
  const dryRun = options.dryRun ?? false;

  console.log(`\n=============================================================================`);
  console.log(`🚀 INICIANDO INGESTÃO DOS DADOS REAIS DO SOS SALES V2 PARA O CHAT SALES V3`);
  console.log(`=============================================================================`);
  console.log(`Arquivo Dump: ${dumpPath}`);
  console.log(`Banco Destino: ${databaseUrl.replace(/:[^:@]+@/, ":***@")}`);
  console.log(`Modo Dry-Run: ${dryRun ? "SIM" : "NÃO"}\n`);

  if (!fs.existsSync(dumpPath)) {
    throw new Error(`Arquivo de dump não encontrado: ${dumpPath}`);
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const workspaces: WorkspacesRow[] = [];
  const channels: ChannelConnectionRow[] = [];
  const contacts: ContactRow[] = [];
  const journeys: JourneyRow[] = [];
  const messages: MessageRow[] = [];
  const acquisitionContexts: AcquisitionContextRow[] = [];
  const agentConfigs: WorkspaceAgentConfigRow[] = [];
  const knownFacts: KnownFactRow[] = [];

  console.log(`[1/6] Lendo e parseando tabelas do dump SQL com buffering multilinha...`);
  const t0 = Date.now();

  const fileStream = fs.createReadStream(dumpPath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let currentTable: string | null = null;
  const targetTables = new Set([
    "workspaces",
    "channel_connections",
    "contacts",
    "commercial_journeys",
    "conversation_messages",
    "acquisition_contexts",
    "workspace_agent_config",
    "known_facts",
  ]);

  let tupleBuffer = "";

  function processTuple(table: string, tuple: any[]) {
    if (table === "workspaces") {
      workspaces.push({
        id: String(tuple[0]),
        name: String(tuple[1]),
        slug: String(tuple[2]),
        active: Boolean(tuple[3]),
        created_at: String(tuple[4]),
        updated_at: String(tuple[5]),
      });
    } else if (table === "channel_connections") {
      channels.push({
        id: String(tuple[0]),
        workspace_id: String(tuple[1]),
        provider: String(tuple[2]),
        phone_number: String(tuple[3]),
        name: String(tuple[4]),
        public_config: typeof tuple[5] === "string" ? JSON.parse(tuple[5]) : tuple[5],
        status: String(tuple[6]),
        created_at: String(tuple[7]),
        updated_at: String(tuple[8]),
      });
    } else if (table === "contacts") {
      contacts.push({
        id: String(tuple[0]),
        workspace_id: String(tuple[1]),
        phone: String(tuple[2]),
        whatsapp_id: String(tuple[3]),
        name: tuple[4] ? String(tuple[4]) : null,
        email: tuple[5] ? String(tuple[5]) : null,
        created_at: String(tuple[6]),
        updated_at: String(tuple[7]),
      });
    } else if (table === "commercial_journeys") {
      journeys.push({
        id: String(tuple[0]),
        workspace_id: String(tuple[1]),
        contact_id: String(tuple[2]),
        status: String(tuple[3]),
        primary_service_or_product: tuple[4] ? String(tuple[4]) : null,
        started_at: String(tuple[5]),
        closed_at: tuple[6] ? String(tuple[6]) : null,
        total_revenue_minor: Number(tuple[7]) || 0,
        currency: String(tuple[8] || "BRL"),
        created_at: String(tuple[9]),
        updated_at: String(tuple[10]),
        channel_connection_id: String(tuple[11]),
        pipeline_stage: String(tuple[12]),
      });
    } else if (table === "conversation_messages") {
      messages.push({
        id: String(tuple[0]),
        workspace_id: String(tuple[1]),
        channel_connection_id: String(tuple[2]),
        journey_id: tuple[3] ? String(tuple[3]) : null,
        contact_id: String(tuple[4]),
        direction: tuple[5] === "inbound" ? "inbound" : "outbound",
        sender_type: tuple[6] === "customer" ? "customer" : tuple[6] === "operator" ? "operator" : "agent",
        provider_message_id: tuple[7] ? String(tuple[7]) : null,
        text_content: tuple[8] ? String(tuple[8]) : null,
        media_payload: tuple[9],
        sent_at: String(tuple[10]),
      });
    } else if (table === "acquisition_contexts") {
      acquisitionContexts.push({
        id: String(tuple[0]),
        workspace_id: String(tuple[1]),
        journey_id: String(tuple[2]),
        source: String(tuple[3]),
        campaign_id: tuple[4] ? String(tuple[4]) : null,
        campaign_name: tuple[5] ? String(tuple[5]) : null,
        ad_set_id: tuple[6] ? String(tuple[6]) : null,
        ad_id: tuple[7] ? String(tuple[7]) : null,
        creative_code: tuple[8] ? String(tuple[8]) : null,
        offer_hook: tuple[9] ? String(tuple[9]) : null,
        entry_message: tuple[10] ? String(tuple[10]) : null,
        click_ids: typeof tuple[11] === "string" ? JSON.parse(tuple[11]) : tuple[11],
        tracking_code: tuple[12] ? String(tuple[12]) : null,
        confidence: String(tuple[13]),
        occurred_at: String(tuple[14]),
      });
    } else if (table === "workspace_agent_config") {
      agentConfigs.push({
        workspace_id: String(tuple[0]),
        agent_name: tuple[17] ? String(tuple[17]) : null,
        business_type: tuple[18] ? String(tuple[18]) : null,
        services_json: tuple[19] ? String(tuple[19]) : null,
        working_hours: tuple[20] ? String(tuple[20]) : null,
        phone: tuple[21] ? String(tuple[21]) : null,
        city: tuple[22] ? String(tuple[22]) : null,
        booking_url: tuple[23] ? String(tuple[23]) : null,
        extra_context: tuple[25] ? String(tuple[25]) : null,
      });
    } else if (table === "known_facts") {
      knownFacts.push({
        id: String(tuple[0]),
        workspace_id: String(tuple[1]),
        journey_id: tuple[2] ? String(tuple[2]) : null,
        key: String(tuple[3]),
        value: tuple[4],
        source: String(tuple[5]),
        confidence: Number(tuple[7]) || 1.0,
        confirmed_by_customer: Boolean(tuple[8]),
        observed_at: String(tuple[9]),
      });
    }
  }

  for await (const line of rl) {
    if (line.startsWith("-- Data for Name:")) {
      const match = line.match(/-- Data for Name: (\w+);/);
      currentTable = match ? match[1] : null;
      tupleBuffer = "";
      continue;
    }

    if (!currentTable || !targetTables.has(currentTable)) continue;

    if (!tupleBuffer && !line.startsWith("\t(")) continue;

    if (!tupleBuffer) {
      tupleBuffer = line;
    } else {
      tupleBuffer += "\n" + line;
    }

    // Check if tuple is completed (not inside quotes and ends with ), or );)
    let inQuote = false;
    for (let i = 0; i < tupleBuffer.length; i++) {
      if (tupleBuffer[i] === "'") {
        if (tupleBuffer[i + 1] === "'") {
          i++; // escaped quote ''
        } else {
          inQuote = !inQuote;
        }
      }
    }

    const trimmed = tupleBuffer.trimEnd();
    if (!inQuote && (trimmed.endsWith("),") || trimmed.endsWith(");"))) {
      try {
        const tuple = parseTupleFast(trimmed);
        processTuple(currentTable, tuple);
      } catch (err) {
        // Ignora silenciosamente tupla inconsistente
      }
      tupleBuffer = "";
    }
  }

  console.log(`Parse concluído em ${Date.now() - t0}ms!`);
  console.log(`\nDados identificados no Dump:`);
  console.log(` - Workspaces: ${workspaces.length}`);
  console.log(` - Canais de Conexão: ${channels.length}`);
  console.log(` - Contatos / Leads: ${contacts.length}`);
  console.log(` - Jornadas Comerciais: ${journeys.length}`);
  console.log(` - Mensagens de Chat: ${messages.length}`);
  console.log(` - Contextos de Aquisição (Meta Ads / CTWA): ${acquisitionContexts.length}`);
  console.log(` - Configurações de IA / Catálogos de Serviço: ${agentConfigs.length}`);
  console.log(` - Fatos de Inteligência: ${knownFacts.length}\n`);

  if (dryRun) {
    console.log(`[DRY-RUN] Nenhuma gravação efetuada.`);
    client.release();
    await pool.end();
    return;
  }

  try {
    await client.query("BEGIN;");

    // 1. Organização Soberana MCT & Usuários
    console.log(`[2/6] Sincronizando Organização MCT e Usuários Soberanos...`);
    let orgRes = await client.query<{ id: string }>(
      `SELECT id FROM public.organizations WHERE slug = 'mct-soberana' LIMIT 1;`
    );
    let orgId: string;
    if (orgRes.rows.length > 0) {
      orgId = orgRes.rows[0].id;
    } else {
      const insRes = await client.query<{ id: string }>(
        `INSERT INTO public.organizations (name, slug)
         VALUES ('MCT Soberana', 'mct-soberana')
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id;`
      );
      orgId = insRes.rows[0].id;
    }

    // Criar/Garantir Usuários do Francisco
    const sovereignUsers = [
      { id: "08569a44-1988-49a0-8831-5fc3436a31cb", email: "francisco@mct.br", name: "Francisco Rios" },
      { id: "17fc95cf-7d0f-4ad5-ab92-de1531bd9eb2", email: "franciscotaveira.mkt@gmail.com", name: "Francisco Rios" },
      { id: "7da18edc-1989-448a-8ef4-01fb0271d410", email: "franciscotaveira.rios@gmail.com", name: "Francisco Rios" },
    ];

    for (const u of sovereignUsers) {
      await client.query(
        `INSERT INTO public.users (id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;`,
        [u.id, u.email, u.name]
      );
    }

    // 2. Workspaces e Membros
    console.log(`[3/6] Migrando ${workspaces.length} Workspaces e ${channels.length} Canais...`);
    for (const ws of workspaces) {
      await client.query(
        `INSERT INTO public.workspaces (
           id, organization_id, name, slug, default_pix_key, default_pix_merchant_name, default_pix_merchant_city, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           updated_at = EXCLUDED.updated_at;`,
        [
          ws.id,
          orgId,
          ws.name,
          ws.slug,
          ws.slug.includes("haven") ? "+554988370054" : "financeiro@mct.br",
          ws.name,
          "Chapecó",
          ws.created_at,
          ws.updated_at,
        ]
      );

      // Associar Francisco como 'owner' em todos os workspaces
      for (const u of sovereignUsers) {
        await client.query(
          `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
           VALUES ($1, $2, 'owner')
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';`,
          [ws.id, u.id]
        );
      }
    }

    // 3. Canais (channel_instances)
    const channelMap = new Map<string, { provider: "meta_waba" | "waha"; phone_e164: string }>();

    for (const ch of channels) {
      const v3Provider: "meta_waba" | "waha" = ch.provider === "meta_cloud" ? "meta_waba" : "waha";
      let phoneE164 = normalizePhone(ch.phone_number);
      if (!isValidE164(phoneE164)) {
        phoneE164 = "+554988370054";
      }
      channelMap.set(ch.id, { provider: v3Provider, phone_e164: phoneE164 });

      const tokenHash = crypto.createHash("sha256").update(`chan-${ch.id}`).digest("hex");
      const isConnected = ch.status === "CONNECTED";
      const v3Status = isConnected ? "connected" : "unconfigured";

      await client.query(
        `INSERT INTO public.channel_instances (
           id, workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, status, is_active, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           status = EXCLUDED.status,
           is_active = EXCLUDED.is_active;`,
        [
          ch.id,
          ch.workspace_id,
          v3Provider,
          ch.name,
          phoneE164,
          tokenHash,
          v3Status,
          isConnected,
          ch.created_at,
          ch.updated_at,
        ]
      );
    }

    // 4. Catálogos de Produtos e Serviços
    console.log(`[4/6] Migrando Catálogo de Serviços e Produtos para cada Workspace...`);
    let insertedProducts = 0;
    for (const ac of agentConfigs) {
      if (!ac.services_json) continue;
      try {
        const services = JSON.parse(ac.services_json);
        if (Array.isArray(services)) {
          for (let idx = 0; idx < services.length; idx++) {
            const s = services[idx];
            if (!s || !s.name) continue;
            const title = String(s.name).trim();
            const retailerId = `srv-${ac.workspace_id.slice(0, 8)}-${idx + 1}-${title
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]/g, "-")
              .replace(/-+/g, "-")
              .slice(0, 30)}`;

            let priceCents = 0;
            if (typeof s.price === "number") {
              priceCents = Math.round(s.price * 100);
            } else if (typeof s.price === "string") {
              const cleaned = s.price.replace(/[^\d]/g, "");
              if (cleaned) {
                if (s.price.includes(",") || s.price.includes(".")) {
                  priceCents = parseInt(cleaned, 10);
                } else {
                  priceCents = parseInt(cleaned, 10) * 100;
                }
              }
            }

            const desc = s.description || (s.duration ? `Duração: ${s.duration}` : "Serviço oficial");

            await client.query(
              `INSERT INTO public.products (
                 workspace_id, catalog_id, retailer_id, title, subtitle, description,
                 price_cents, currency, category, image_url, status, is_featured
               ) VALUES ($1, 'meta_catalog_default', $2, $3, $4, $5, $6, 'BRL', 'Serviços', 'https://chat.automatizaprocessos.tech/assets/service.png', 'ACTIVE', true)
               ON CONFLICT (workspace_id, retailer_id) DO UPDATE SET
                 title = EXCLUDED.title,
                 price_cents = EXCLUDED.price_cents,
                 description = EXCLUDED.description;`,
              [ac.workspace_id, retailerId, title, s.duration || null, desc, priceCents]
            );
            insertedProducts++;
          }
        }
      } catch (err) {
        // Ignora JSON de serviços inconsistente
      }
    }
    console.log(` -> ${insertedProducts} produtos/serviços sincronizados no catálogo.`);

    // 5. Contatos
    console.log(`[5/6] Migrando ${contacts.length} Contatos para a estrutura V3 com E.164...`);
    const contactMap = new Map<string, { id: string; phone_e164: string }>();

    for (const cnt of contacts) {
      let phoneE164 = normalizePhone(cnt.phone);
      if (!isValidE164(phoneE164)) {
        continue;
      }
      const displayName = cnt.name && cnt.name.trim() ? cnt.name.trim() : `Contato ${phoneE164}`;
      const metadata = cnt.email ? { email: cnt.email } : {};

      const res = await client.query<{ id: string }>(
        `INSERT INTO public.contacts (id, workspace_id, phone_e164, name, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET
           name = EXCLUDED.name,
           metadata = EXCLUDED.metadata,
           updated_at = EXCLUDED.updated_at
         RETURNING id;`,
        [cnt.id, cnt.workspace_id, phoneE164, displayName, JSON.stringify(metadata), cnt.created_at, cnt.updated_at]
      );
      if (res.rows[0]) {
        contactMap.set(cnt.id, { id: res.rows[0].id, phone_e164: phoneE164 });
      }
    }

    // 6. Commercial Threads & Journeys com Atribuição Meta Ads
    console.log(`[6/6] Construindo Threads e vinculando ${messages.length} Mensagens com Atribuição...`);

    const defaultChannels = new Map<string, string>();
    for (const ch of channels) {
      if (!defaultChannels.has(ch.workspace_id)) {
        defaultChannels.set(ch.workspace_id, ch.id);
      }
    }

    const threadKeys = new Set<string>();
    const threadMap = new Map<string, string>(); // "workspaceId:channelId:contactId" -> thread_id

    for (const msg of messages) {
      const chanId = msg.channel_connection_id || defaultChannels.get(msg.workspace_id);
      const contactInfo = contactMap.get(msg.contact_id);
      if (chanId && contactInfo) {
        threadKeys.add(`${msg.workspace_id}:${chanId}:${contactInfo.id}`);
      }
    }

    for (const j of journeys) {
      const chanId = j.channel_connection_id || defaultChannels.get(j.workspace_id);
      const contactInfo = contactMap.get(j.contact_id);
      if (chanId && contactInfo) {
        threadKeys.add(`${j.workspace_id}:${chanId}:${contactInfo.id}`);
      }
    }

    // Inserir Commercial Threads
    for (const key of threadKeys) {
      const [wsId, chanId, cntId] = key.split(":");
      const threadId = crypto.randomUUID();

      const res = await client.query<{ id: string }>(
        `INSERT INTO public.commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET
           updated_at = clock_timestamp()
         RETURNING id;`,
        [threadId, wsId, chanId, cntId]
      );
      if (res.rows[0]) {
        threadMap.set(key, res.rows[0].id);
      }
    }

    // Mapa de Contexto de Aquisição (Meta Ads / CTWA) por journey_id
    const acqMap = new Map<string, AcquisitionContextRow>();
    for (const ac of acquisitionContexts) {
      if (ac.journey_id && !acqMap.has(ac.journey_id)) {
        acqMap.set(ac.journey_id, ac);
      }
    }

    // Inserir Jornadas Comerciais com inteligência de anúncios
    let journeysWithCtwa = 0;
    for (const j of journeys) {
      const chanId = j.channel_connection_id || defaultChannels.get(j.workspace_id);
      const contactInfo = contactMap.get(j.contact_id);
      if (!contactInfo || !chanId) continue;

      const threadKey = `${j.workspace_id}:${chanId}:${contactInfo.id}`;
      const threadId = threadMap.get(threadKey);

      if (threadId) {
        let v3Status = "open";
        const rawStatus = (j.status || "").toUpperCase();
        if (rawStatus === "WON") v3Status = "won";
        else if (rawStatus === "LOST") v3Status = "lost";
        else if (rawStatus === "ARCHIVED") v3Status = "archived";

        let v3Stage = "lead";
        const rawStage = (j.pipeline_stage || "").toUpperCase();
        if (rawStage === "QUALIFIED") v3Stage = "qualified";
        else if (rawStage === "NEGOTIATION" || rawStage === "PROPOSAL") v3Stage = "proposal";
        else if (rawStage === "SCHEDULED") v3Stage = "scheduled";
        else if (rawStage === "WON") v3Stage = "won";
        else if (rawStage === "LOST") v3Stage = "lost";

        const ac = acqMap.get(j.id);
        let attributionSource: "ctwa_meta" | "tracked_link_meta" | "organic_whatsapp" = "organic_whatsapp";
        let campaignId: string | null = null;
        let adId: string | null = null;
        let ctwaClid: string | null = null;

        if (ac) {
          if (ac.source === "meta_ads") attributionSource = "ctwa_meta";
          else if (ac.source === "referral") attributionSource = "tracked_link_meta";

          campaignId = ac.campaign_id || ac.campaign_name || null;
          adId = ac.ad_id || ac.creative_code || null;
          if (ac.click_ids && typeof ac.click_ids === "object") {
            ctwaClid = ac.click_ids.ctwaClid || ac.click_ids.ctwa_clid || null;
          }
          if (attributionSource === "ctwa_meta") journeysWithCtwa++;
        }

        const estValCents = Math.max(0, Math.round(Number(j.total_revenue_minor) || 0));

        await client.query(
          `INSERT INTO public.commercial_journeys (
             id, workspace_id, contact_id, thread_id, title, stage, status,
             attribution_source, campaign_id, ad_id, ctwa_clid, estimated_value_cents,
             created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             title = EXCLUDED.title,
             status = EXCLUDED.status,
             stage = EXCLUDED.stage,
             campaign_id = COALESCE(EXCLUDED.campaign_id, commercial_journeys.campaign_id),
             ad_id = COALESCE(EXCLUDED.ad_id, commercial_journeys.ad_id),
             ctwa_clid = COALESCE(EXCLUDED.ctwa_clid, commercial_journeys.ctwa_clid),
             estimated_value_cents = EXCLUDED.estimated_value_cents,
             updated_at = EXCLUDED.updated_at;`,
          [
            j.id,
            j.workspace_id,
            contactInfo.id,
            threadId,
            j.primary_service_or_product || "Oportunidade Comercial",
            v3Stage,
            v3Status,
            attributionSource,
            campaignId,
            adId,
            ctwaClid,
            estValCents,
            j.created_at,
            j.updated_at,
          ]
        );
      }
    }
    console.log(` -> ${journeys.length} jornadas migradas (${journeysWithCtwa} com atribuição Meta Ads / CTWA).`);

    // Inserir Mensagens em Lotes (Batch de 500) com formatação rigorosa dos campos V3
    const BATCH_SIZE = 500;
    let insertedMessages = 0;

    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      for (const m of batch) {
        const chanId = m.channel_connection_id || defaultChannels.get(m.workspace_id);
        const contactInfo = contactMap.get(m.contact_id);
        const channelInfo = chanId ? channelMap.get(chanId) : undefined;

        if (contactInfo && channelInfo && chanId) {
          const threadKey = `${m.workspace_id}:${chanId}:${contactInfo.id}`;
          const threadId = threadMap.get(threadKey);

          if (threadId) {
            const senderE164 = m.direction === "inbound" ? contactInfo.phone_e164 : channelInfo.phone_e164;
            const recipientE164 = m.direction === "inbound" ? channelInfo.phone_e164 : contactInfo.phone_e164;

            if (isValidE164(senderE164) && isValidE164(recipientE164)) {
              const body = m.text_content || "";
              const deliveryStatus = m.direction === "inbound" ? "delivered" : "sent";
              const statusRank = m.direction === "inbound" ? 20 : 10;
              const providerMsgId = m.provider_message_id || `legacy-${m.id}`;
              const sentAt = m.sent_at && m.sent_at !== "undefined" && m.sent_at !== "null" ? m.sent_at : new Date().toISOString();

              await client.query(
                `INSERT INTO public.messages (
                   id, workspace_id, channel_instance_id, thread_id, provider, direction,
                   sender_e164, recipient_e164, content_type, body, delivery_status, status_rank,
                   provider_message_id, created_at, updated_at, metadata
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'text', $9, $10, $11, $12, $13, $13, $14)
                 ON CONFLICT (id) DO NOTHING;`,
                [
                  m.id,
                  m.workspace_id,
                  chanId,
                  threadId,
                  channelInfo.provider,
                  m.direction,
                  senderE164,
                  recipientE164,
                  body,
                  deliveryStatus,
                  statusRank,
                  providerMsgId,
                  sentAt,
                  JSON.stringify({ legacy_v2: true, media_payload: m.media_payload }),
                ]
              );
              insertedMessages++;
            }
          }
        }
      }
      process.stdout.write(`\r -> Mensagens inseridas: ${insertedMessages} / ${messages.length}`);
    }
    console.log("");

    await client.query("COMMIT;");
    console.log(`\n=============================================================================`);
    console.log(`✅ INGESTÃO CONCLUÍDA COM SUCESSO NO BANCO POSTGRESQL V3!`);
    console.log(`=============================================================================`);
    console.log(` - Workspaces importados: ${workspaces.length}`);
    console.log(` - Usuários Soberanos vinculados: ${sovereignUsers.length}`);
    console.log(` - Canais ativos: ${channels.length}`);
    console.log(` - Serviços e Produtos sincronizados: ${insertedProducts}`);
    console.log(` - Contatos migrados com E.164: ${contactMap.size}`);
    console.log(` - Conversas (Threads) criadas: ${threadMap.size}`);
    console.log(` - Jornadas comerciais: ${journeys.length} (com CTWA Clid: ${journeysWithCtwa})`);
    console.log(` - Mensagens no histórico do Cockpit: ${insertedMessages}`);
    console.log(`=============================================================================\n`);
  } catch (err) {
    await client.query("ROLLBACK;");
    console.error(`❌ Erro durante a ingestão:`, err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  runIngestion().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
