import type { Pool, PoolClient } from "pg";

export type ChannelProvider =
  | "meta_waba"
  | "waha"
  | "evolution"
  | "meta_messenger"
  | "meta_instagram";

export type MessageDirection = "inbound" | "outbound";

export type MessageContentType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "template"
  | "interactive";

export type MessageDeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "unknown";

export type CommercialThreadStatus =
  | "active"
  | "waiting_client"
  | "waiting_human"
  | "closed";

export interface ContactRecord {
  id: string;
  workspace_id: string;
  phone_e164: string;
  name: string | null;
  opt_out: boolean;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export interface CommercialThreadRecord {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  contact_id: string;
  status: CommercialThreadStatus;
  handoff_reason?: string | null;
  handoff_at?: Date | null;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface MessageRecord {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  thread_id: string;
  provider: ChannelProvider;
  direction: MessageDirection;
  sender_e164: string;
  recipient_e164: string;
  content_type: MessageContentType;
  body: string | null;
  media_url: string | null;
  metadata?: Record<string, unknown> | null;
  provider_message_id: string | null;
  delivery_status: MessageDeliveryStatus;
  status_rank: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateContactParams {
  workspaceId: string;
  phoneE164: string;
  name?: string | null;
}

export interface GetOrCreateThreadParams {
  workspaceId: string;
  channelInstanceId: string;
  contactId: string;
  status?: CommercialThreadStatus;
}

export interface CreateMessageParams {
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  provider: ChannelProvider;
  direction: MessageDirection;
  senderE164: string;
  recipientE164: string;
  contentType: MessageContentType;
  body?: string | null;
  mediaUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  providerMessageId?: string | null;
  deliveryStatus?: MessageDeliveryStatus;
  statusRank?: number;
}

export interface ListThreadMessagesParams {
  workspaceId: string;
  threadId: string;
  limit?: number;
  ascending?: boolean;
}

/**
 * Creates or retrieves an existing contact by phone within a workspace.
 * Guaranteed tenant-safe with composite unique constraint (workspace_id, phone_e164).
 */
export async function createOrGetContact(
  client: Pool | PoolClient,
  params: CreateContactParams
): Promise<ContactRecord> {
  const res = await client.query<ContactRecord>(
    `INSERT INTO public.contacts (workspace_id, phone_e164, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (workspace_id, phone_e164)
     DO UPDATE SET 
       name = COALESCE(EXCLUDED.name, public.contacts.name),
       updated_at = now()
     RETURNING id, workspace_id, phone_e164, name, opt_out, metadata, created_at, updated_at;`,
    [params.workspaceId, params.phoneE164, params.name || null]
  );
  return res.rows[0]!;
}

export interface ListContactsParams {
  workspaceId: string;
  search?: string;
  limit?: number;
  offset?: number;
  status?: "active" | "inactive" | "all";
}

/**
 * Lists contacts for a workspace with optional search query (name or phone), under RLS.
 */
export async function listContacts(
  client: Pool | PoolClient,
  params: ListContactsParams
): Promise<ContactRecord[]> {
  const limit = Math.min(params.limit ?? 50, 100);
  const offset = params.offset ?? 0;

  if (params.search && params.search.trim().length > 0) {
    const pattern = `%${params.search.trim().toLowerCase()}%`;
    const res = await client.query<ContactRecord>(
      `SELECT id, workspace_id, phone_e164, name, opt_out, metadata, created_at, updated_at
       FROM public.contacts
       WHERE workspace_id = $1 
         AND ($5 = 'all' OR ($5 = 'active' AND opt_out = false) OR ($5 = 'inactive' AND opt_out = true))
         AND (LOWER(COALESCE(name, '')) LIKE $2 OR phone_e164 LIKE $2)
       ORDER BY updated_at DESC
       LIMIT $3 OFFSET $4;`,
      [params.workspaceId, pattern, limit, offset, params.status ?? "all"]
    );
    return res.rows;
  }

  const res = await client.query<ContactRecord>(
    `SELECT id, workspace_id, phone_e164, name, opt_out, metadata, created_at, updated_at
     FROM public.contacts
     WHERE workspace_id = $1
       AND ($4 = 'all' OR ($4 = 'active' AND opt_out = false) OR ($4 = 'inactive' AND opt_out = true))
     ORDER BY updated_at DESC
     LIMIT $2 OFFSET $3;`,
    [params.workspaceId, limit, offset, params.status ?? "all"]
  );
  return res.rows;
}

/**
 * Updates a contact's name and/or phone. Returns null when the contact does not exist in the workspace.
 */
export async function updateContact(
  client: Pool | PoolClient,
  params: {
    workspaceId: string;
    contactId: string;
    name?: string | null;
    phoneE164?: string;
    optOut?: boolean;
    metadata?: Record<string, unknown>;
  }
): Promise<ContactRecord | null> {
  const res = await client.query<ContactRecord>(
    `UPDATE public.contacts
     SET name = CASE WHEN $3::boolean THEN $4 ELSE name END,
         phone_e164 = COALESCE($5, phone_e164),
         opt_out = CASE WHEN $6::boolean THEN $7 ELSE opt_out END,
         metadata = CASE WHEN $8::boolean THEN metadata || $9::jsonb ELSE metadata END,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, phone_e164, name, opt_out, metadata, created_at, updated_at;`,
    [params.workspaceId, params.contactId, params.name !== undefined, params.name ?? null, params.phoneE164 ?? null,
      params.optOut !== undefined, params.optOut ?? false, params.metadata !== undefined, JSON.stringify(params.metadata ?? {})]
  );
  return res.rows[0] ?? null;
}

/**
 * Deletes a contact. Returns false when the contact does not exist in the workspace.
 */
export async function deleteContact(
  client: Pool | PoolClient,
  params: { workspaceId: string; contactId: string }
): Promise<boolean> {
  const res = await client.query(
    `DELETE FROM public.contacts WHERE workspace_id = $1 AND id = $2;`,
    [params.workspaceId, params.contactId]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Creates or retrieves a commercial thread between a channel instance and a contact.
 * Enforces composite FKs linking workspace_id with channel_instance_id and contact_id.
 */
export async function getOrCreateCommercialThread(
  client: Pool | PoolClient,
  params: GetOrCreateThreadParams
): Promise<CommercialThreadRecord> {
  const res = await client.query<CommercialThreadRecord>(
    `INSERT INTO public.commercial_threads (
       workspace_id, channel_instance_id, contact_id, status
     ) VALUES (
       $1, $2, $3, COALESCE($4, 'active')
     )
     ON CONFLICT (workspace_id, channel_instance_id, contact_id)
     DO UPDATE SET updated_at = now()
     RETURNING id, workspace_id, channel_instance_id, contact_id, status, last_message_at, created_at, updated_at;`,
    [
      params.workspaceId,
      params.channelInstanceId,
      params.contactId,
      params.status || "active",
    ]
  );
  return res.rows[0]!;
}

/**
 * Inserts a conversational message linked to a thread and channel instance,
 * and updates the thread's last_message_at timestamp.
 */
export async function insertMessage(
  client: Pool | PoolClient,
  params: CreateMessageParams
): Promise<MessageRecord> {
  const rank =
    params.statusRank !== undefined
      ? params.statusRank
      : params.deliveryStatus === "sent"
      ? 10
      : params.deliveryStatus === "delivered"
      ? 20
      : params.deliveryStatus === "read"
      ? 30
      : params.deliveryStatus === "failed"
      ? -1
      : 0;

  const res = await client.query<MessageRecord>(
    `INSERT INTO public.messages (
       workspace_id, channel_instance_id, thread_id, provider, direction,
       sender_e164, recipient_e164, content_type, body, media_url,
       metadata, provider_message_id, delivery_status, status_rank
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10,
       COALESCE($11::jsonb, '{}'::jsonb), $12, COALESCE($13, 'queued'), $14
     )
     RETURNING *;`,
    [
      params.workspaceId,
      params.channelInstanceId,
      params.threadId,
      params.provider,
      params.direction,
      params.senderE164,
      params.recipientE164,
      params.contentType,
      params.body ?? null,
      params.mediaUrl ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null,
      params.providerMessageId ?? null,
      params.deliveryStatus || "queued",
      rank,
    ]
  );

  // Update thread's last_message_at
  await client.query(
    `UPDATE public.commercial_threads
     SET last_message_at = now(), updated_at = now()
     WHERE workspace_id = $1 AND id = $2;`,
    [params.workspaceId, params.threadId]
  );

  return res.rows[0]!;
}

/**
 * Lists messages for a thread strictly within the specified tenant workspace.
 */
export async function listThreadMessages(
  client: Pool | PoolClient,
  params: ListThreadMessagesParams
): Promise<MessageRecord[]> {
  const limit = params.limit ?? 50;

  if (params.ascending) {
    // When ascending is requested (typical chat viewport view), fetch the latest `limit` messages
    // and sort them chronologically (oldest at top, newest at bottom).
    const res = await client.query<MessageRecord>(
      `SELECT * FROM (
         SELECT * FROM public.messages
         WHERE workspace_id = $1 AND thread_id = $2
         ORDER BY created_at DESC
         LIMIT $3
       ) sub
       ORDER BY created_at ASC;`,
      [params.workspaceId, params.threadId, limit]
    );
    return res.rows;
  }

  const res = await client.query<MessageRecord>(
    `SELECT * FROM public.messages
     WHERE workspace_id = $1 AND thread_id = $2
     ORDER BY created_at DESC
     LIMIT $3;`,
    [params.workspaceId, params.threadId, limit]
  );

  return res.rows;
}

export interface CommercialThreadWithContactRecord extends CommercialThreadRecord {
  activity_cursor: string;
  contact_phone: string;
  contact_name: string | null;
  channel_provider: ChannelProvider;
  channel_name: string;
  last_message_body: string | null;
  last_message_direction: MessageDirection | null;
  last_message_created_at: Date | null;
  last_message_delivery_status: MessageDeliveryStatus | null;
  next_action_id?: string | null;
  next_action_title?: string | null;
  next_action_due_at?: Date | null;
  next_action_status?: string | null;
  next_action_assignee_id?: string | null;
  fep_expires_at?: Date | null;
  attribution_source?: string | null;
  journey_stage?: string | null;
}

export interface ListCommercialThreadsParams {
  workspaceId: string;
  status?: CommercialThreadStatus | "open";
  limit?: number;
  needsAttention?: boolean;
  threadId?:string;
  beforeActivityAt?:string;
  beforeId?:string;
  search?:string;
  channelInstanceId?:string;
}

/**
 * Lists commercial threads with contact details and last message projection
 * strictly scoped to the workspace under RLS.
 */
export async function listCommercialThreads(
  client: Pool | PoolClient,
  params: ListCommercialThreadsParams
): Promise<CommercialThreadWithContactRecord[]> {
  const limit = params.limit ?? 50;
  const res = await client.query<CommercialThreadWithContactRecord>(
    `SELECT 
       to_char(COALESCE(t.last_message_at,t.created_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS activity_cursor,
       t.id,
       t.workspace_id,
       t.channel_instance_id,
       t.contact_id,
       t.status,
       t.handoff_reason,
       t.handoff_at,
       t.last_message_at,
       t.created_at,
       t.updated_at,
       c.phone_e164 AS contact_phone,
       c.name AS contact_name,
       ci.provider AS channel_provider,
       ci.display_name AS channel_name,
       lm.body AS last_message_body,
       lm.direction AS last_message_direction,
       lm.created_at AS last_message_created_at,
       lm.delivery_status AS last_message_delivery_status,
       nact.id AS next_action_id,
       nact.title AS next_action_title,
       nact.due_at AS next_action_due_at,
       nact.status AS next_action_status,
       nact.assignee_user_id AS next_action_assignee_id,
       j.fep_expires_at,
       j.attribution_source,
       j.journey_stage
     FROM public.commercial_threads t
     INNER JOIN public.contacts c 
       ON c.workspace_id = t.workspace_id AND c.id = t.contact_id
     INNER JOIN public.channel_instances ci
       ON ci.workspace_id = t.workspace_id AND ci.id = t.channel_instance_id
     LEFT JOIN LATERAL (
       SELECT m.body, m.direction, m.created_at, m.delivery_status
       FROM public.messages m
       WHERE m.workspace_id = t.workspace_id AND m.thread_id = t.id
       ORDER BY m.created_at DESC
       LIMIT 1
     ) lm ON true
     LEFT JOIN LATERAL (
       SELECT ca.id, ca.title, ca.due_at, ca.status, ca.assignee_user_id
       FROM public.commercial_actions ca
       WHERE ca.workspace_id = t.workspace_id AND ca.thread_id = t.id AND ca.status = 'open'
       LIMIT 1
     ) nact ON true
     LEFT JOIN LATERAL (
       SELECT cj.fep_expires_at, cj.attribution_source, cj.stage as journey_stage
       FROM public.commercial_journeys cj
       WHERE cj.workspace_id = t.workspace_id AND cj.thread_id = t.id
       ORDER BY cj.created_at DESC
       LIMIT 1
     ) j ON true
     WHERE t.workspace_id = $1
       AND ($2::text IS NULL OR ($2='open' AND t.status <> 'closed') OR t.status = $2)
       AND (
         $4::boolean IS NOT TRUE 
         OR (
           t.status <> 'closed' AND ((nact.id IS NOT NULL AND nact.due_at <= now() + interval '24 hours')
           OR t.status = 'waiting_human')
         )
       )
       AND ($5::timestamptz IS NULL OR (COALESCE(t.last_message_at,t.created_at),t.id)<($5::timestamptz,$6::uuid))
       AND ($7::text IS NULL OR c.name ILIKE $7 ESCAPE '\\' OR c.phone_e164 ILIKE $7 ESCAPE '\\' OR lm.body ILIKE $7 ESCAPE '\\')
       AND ($8::uuid IS NULL OR t.channel_instance_id=$8::uuid)
       AND ($9::uuid IS NULL OR t.id=$9::uuid)
     ORDER BY COALESCE(t.last_message_at,t.created_at) DESC,t.id DESC
     LIMIT $3;`,
    [params.workspaceId, params.status ?? null, limit, params.needsAttention ?? false,params.beforeActivityAt??null,params.beforeId??null,params.search?.trim()?`%${params.search.trim().replace(/[\\%_]/g,'\\$&')}%`:null,params.channelInstanceId??null,params.threadId??null]
  );
  return res.rows;
}

/**
 * Updates a commercial thread status (e.g. active, waiting_client, waiting_human, closed)
 * within the workspace boundary under RLS.
 */
export async function updateCommercialThreadStatus(
  client: Pool | PoolClient,
  params: {
    workspaceId: string;
    threadId: string;
    status: CommercialThreadStatus;
  }
): Promise<CommercialThreadRecord | null> {
  const res = await client.query<CommercialThreadRecord>(
    `UPDATE public.commercial_threads
     SET status = $3, updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *;`,
    [params.workspaceId, params.threadId, params.status]
  );
  return res.rows[0] ?? null;
}
