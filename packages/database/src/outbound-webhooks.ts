import type { PoolClient } from "pg";

export interface OutboundWebhookSubscription {
  id: string;
  workspace_id: string;
  url: string;
  secret: string;
  description: string | null;
  events: string[];
  is_active: boolean;
  supports_idempotency: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface OutboundWebhookDelivery {
  id: string;
  subscription_id: string;
  workspace_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: "delivered" | "failed";
  status_code: number | null;
  response_body: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: Date;
}

export async function listOutboundWebhooks(
  client: PoolClient,
  workspaceId: string
): Promise<OutboundWebhookSubscription[]> {
  const result = await client.query(
    `SELECT id, workspace_id, url, secret, description, events, is_active, supports_idempotency, created_at, updated_at
     FROM public.outbound_webhook_subscriptions
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );
  return result.rows;
}

export async function getOutboundWebhookById(
  client: PoolClient,
  workspaceId: string,
  webhookId: string
): Promise<OutboundWebhookSubscription | null> {
  const result = await client.query(
    `SELECT id, workspace_id, url, secret, description, events, is_active, supports_idempotency, created_at, updated_at
     FROM public.outbound_webhook_subscriptions
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, webhookId]
  );
  return result.rows[0] || null;
}

export async function createOutboundWebhook(
  client: PoolClient,
  params: {
    workspaceId: string;
    url: string;
    secret: string;
    description?: string | null;
    events?: string[];
    supportsIdempotency?: boolean;
  }
): Promise<OutboundWebhookSubscription> {
  const events = params.events && params.events.length > 0 ? params.events : ["*"];
  const result = await client.query(
    `INSERT INTO public.outbound_webhook_subscriptions
      (workspace_id, url, secret, description, events, is_active, supports_idempotency)
     VALUES ($1, $2, $3, $4, $5, false, $6)
     RETURNING id, workspace_id, url, secret, description, events, is_active, supports_idempotency, created_at, updated_at`,
    [
      params.workspaceId,
      params.url,
      params.secret,
      params.description || null,
      events, params.supportsIdempotency ?? false,
    ]
  );
  return result.rows[0];
}

export async function updateOutboundWebhook(
  client: PoolClient,
  params: {
    workspaceId: string;
    webhookId: string;
    url?: string;
    description?: string | null;
    events?: string[];
    is_active?: boolean;
  }
): Promise<OutboundWebhookSubscription | null> {
  const current = await getOutboundWebhookById(client, params.workspaceId, params.webhookId);
  if (!current) return null;

  const newUrl = params.url ?? current.url;
  const newDescription = params.description !== undefined ? params.description : current.description;
  const newEvents = params.events ?? current.events;
  const newIsActive = params.is_active ?? current.is_active;

  const result = await client.query(
    `UPDATE public.outbound_webhook_subscriptions
     SET url = $3, description = $4, events = $5, is_active = $6, updated_at = now()
     WHERE workspace_id = $1 AND id = $2
     RETURNING id, workspace_id, url, secret, description, events, is_active, supports_idempotency, created_at, updated_at`,
    [params.workspaceId, params.webhookId, newUrl, newDescription, newEvents, newIsActive]
  );
  return result.rows[0] || null;
}

export async function deleteOutboundWebhook(
  client: PoolClient,
  workspaceId: string,
  webhookId: string
): Promise<boolean> {
  const result = await client.query(
    `UPDATE public.outbound_webhook_subscriptions SET is_active=false,updated_at=now()
     WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, webhookId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function recordWebhookDelivery(
  client: PoolClient,
  params: {
    subscriptionId: string;
    workspaceId: string;
    eventType: string;
    payload: Record<string, unknown>;
    status: "delivered" | "failed";
    statusCode?: number | null;
    responseBody?: string | null;
    errorMessage?: string | null;
    durationMs?: number | null;
  }
): Promise<OutboundWebhookDelivery> {
  const result = await client.query(
    `INSERT INTO public.outbound_webhook_deliveries
      (subscription_id, workspace_id, event_type, payload, status, status_code, response_body, error_message, duration_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, subscription_id, workspace_id, event_type, payload, status, status_code, response_body, error_message, duration_ms, created_at`,
    [
      params.subscriptionId,
      params.workspaceId,
      params.eventType,
      JSON.stringify(params.payload),
      params.status,
      params.statusCode ?? null,
      params.responseBody ? params.responseBody.slice(0, 1000) : null,
      params.errorMessage ? params.errorMessage.slice(0, 1000) : null,
      params.durationMs ?? null,
    ]
  );
  return result.rows[0];
}

export async function listWebhookDeliveries(
  client: PoolClient,
  workspaceId: string,
  subscriptionId: string,
  limit = 20
): Promise<OutboundWebhookDelivery[]> {
  const result = await client.query(
    `SELECT id, subscription_id, workspace_id, event_type, payload, status, status_code, response_body, error_message, duration_ms, created_at
     FROM public.outbound_webhook_deliveries
     WHERE workspace_id = $1 AND subscription_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [workspaceId, subscriptionId, limit]
  );
  return result.rows;
}
