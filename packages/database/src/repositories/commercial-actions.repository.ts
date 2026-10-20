import type { Pool, PoolClient } from "pg";

export type CommercialActionStatus = "open" | "completed" | "cancelled";
export type CommercialActionOrigin = "manual" | "radar_suggestion" | "system";

export interface CommercialActionRecord {
  id: string;
  workspace_id: string;
  thread_id: string;
  journey_id: string | null;
  suggestion_id: string | null;
  title: string;
  description: string | null;
  assignee_user_id: string | null;
  due_at: Date;
  status: CommercialActionStatus;
  origin: CommercialActionOrigin;
  postponed_count: number;
  postponed_reason: string | null;
  postponed_at: Date | null;
  completed_at: Date | null;
  completed_by_user_id: string | null;
  cancelled_at: Date | null;
  cancelled_by_user_id: string | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CommercialActionHistoryRecord {
  id: string;
  workspace_id: string;
  action_id: string;
  action_type: "created" | "assigned" | "rescheduled" | "completed" | "cancelled";
  previous_due_at: Date | null;
  new_due_at: Date | null;
  previous_assignee_id: string | null;
  new_assignee_id: string | null;
  reason: string | null;
  created_by_user_id: string | null;
  created_at: Date;
}

export interface CreateCommercialActionInput {
  workspaceId: string;
  threadId: string;
  journeyId?: string | null;
  suggestionId?: string | null;
  title: string;
  description?: string | null;
  assigneeUserId?: string | null;
  dueAt: Date;
  origin?: CommercialActionOrigin;
  createdByUserId?: string | null;
}

/**
 * Creates a commercial action for a thread.
 * If an open action already exists, returns { created: false, action: existingAction }
 * ensuring strictly one open commercial action per thread.
 */
export async function createCommercialAction(
  client: Pool | PoolClient,
  input: CreateCommercialActionInput
): Promise<{ created: boolean; action: CommercialActionRecord }> {
  const origin = input.origin ?? "manual";
  const description = input.description ? input.description.trim() : null;

  // Validate assignee membership if provided
  if (input.assigneeUserId) {
    const memberRes = await client.query<{ user_id: string }>(
      `SELECT user_id FROM public.workspace_memberships WHERE workspace_id = $1 AND user_id = $2 AND role IN ('owner','admin','manager','operator') FOR KEY SHARE;`,
      [input.workspaceId, input.assigneeUserId]
    );
    if (!memberRes.rows[0]) {
      throw new Error(`ASSIGNEE_NOT_MEMBER: O usuário ${input.assigneeUserId} não possui acesso operacional nesta empresa.`);
    }
  }

  // Insert with ON CONFLICT DO NOTHING against the partial unique index
  const res = await client.query<CommercialActionRecord>(
    `INSERT INTO public.commercial_actions (
       workspace_id,
       thread_id,
       journey_id,
       suggestion_id,
       title,
       description,
       assignee_user_id,
       due_at,
       status,
       origin,
       created_by_user_id,
       created_at,
       updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open', $9, $10, clock_timestamp(), clock_timestamp())
     ON CONFLICT (workspace_id, thread_id) WHERE status = 'open' DO NOTHING
     RETURNING *;`,
    [
      input.workspaceId,
      input.threadId,
      input.journeyId ?? null,
      input.suggestionId ?? null,
      input.title.trim(),
      description,
      input.assigneeUserId ?? null,
      input.dueAt,
      origin,
      input.createdByUserId ?? null,
    ]
  );

  const inserted = res.rows[0];
  if (inserted) {
    // Record history
    await client.query(
      `INSERT INTO public.commercial_action_history (
         workspace_id, action_id, action_type, new_due_at, new_assignee_id, created_by_user_id, created_at
       ) VALUES ($1, $2, 'created', $3, $4, $5, clock_timestamp());`,
      [
        input.workspaceId,
        inserted.id,
        inserted.due_at,
        inserted.assignee_user_id,
        input.createdByUserId ?? null,
      ]
    );

    // Automatically advance commercial journey to 'scheduled' stage
    await client.query(
      `UPDATE public.commercial_journeys
       SET stage = 'scheduled', updated_at = clock_timestamp()
       WHERE workspace_id = $1 AND (thread_id = $2 OR id = $3)
         AND stage IN ('lead', 'qualified', 'proposal') AND status = 'open';`,
      [input.workspaceId, input.threadId, input.journeyId ?? null]
    );

    return { created: true, action: inserted };
  }

  // Already exists: fetch the current open action
  const existingRes = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND thread_id = $2 AND status = 'open'
     LIMIT 1;`,
    [input.workspaceId, input.threadId]
  );

  const existing = existingRes.rows[0];
  if (!existing) {
    throw new Error("Concorrência inesperada: ação aberta não pôde ser recuperada.");
  }

  return { created: false, action: existing };
}

/**
 * Returns the currently open commercial action for a thread, or null if none.
 */
export async function getOpenCommercialAction(
  client: Pool | PoolClient,
  workspaceId: string,
  threadId: string
): Promise<CommercialActionRecord | null> {
  const res = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND thread_id = $2 AND status = 'open'
     LIMIT 1;`,
    [workspaceId, threadId]
  );
  return res.rows[0] ?? null;
}

/**
 * Returns a commercial action by its ID.
 */
export async function getCommercialActionById(
  client: Pool | PoolClient,
  workspaceId: string,
  actionId: string
): Promise<CommercialActionRecord | null> {
  const res = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND id = $2;`,
    [workspaceId, actionId]
  );
  return res.rows[0] ?? null;
}

/**
 * Lists all commercial actions for a thread (history + current).
 */
export async function listCommercialActionsForThread(
  client: Pool | PoolClient,
  workspaceId: string,
  threadId: string
): Promise<CommercialActionRecord[]> {
  const res = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND thread_id = $2
     ORDER BY created_at DESC;`,
    [workspaceId, threadId]
  );
  return res.rows;
}

/**
 * Reschedules an open commercial action with postponement audit.
 */
export async function rescheduleCommercialAction(
  client: Pool | PoolClient,
  workspaceId: string,
  actionId: string,
  params: {
    newDueAt: Date;
    reason: string;
    userId?: string | null;
  }
): Promise<CommercialActionRecord> {
  // Lock the action for update
  const actionRes = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE;`,
    [workspaceId, actionId]
  );

  const action = actionRes.rows[0];
  if (!action) {
    throw new Error("Ação comercial não encontrada");
  }

  if (action.status !== "open") {
    throw new Error(`Não é possível reagendar ação com status '${action.status}'`);
  }

  const prevDueAt = action.due_at;

  const updateRes = await client.query<CommercialActionRecord>(
    `UPDATE public.commercial_actions
     SET due_at = $3,
         postponed_count = postponed_count + 1,
         postponed_reason = $4,
         postponed_at = clock_timestamp(),
         updated_at = clock_timestamp()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *;`,
    [workspaceId, actionId, params.newDueAt, params.reason.trim()]
  );

  const updated = updateRes.rows[0];
  if (!updated) {
    throw new Error("Falha ao atualizar prazo da ação comercial");
  }

  // Audit history
  await client.query(
    `INSERT INTO public.commercial_action_history (
       workspace_id, action_id, action_type, previous_due_at, new_due_at, reason, created_by_user_id, created_at
     ) VALUES ($1, $2, 'rescheduled', $3, $4, $5, $6, clock_timestamp());`,
    [
      workspaceId,
      actionId,
      prevDueAt,
      params.newDueAt,
      params.reason.trim(),
      params.userId ?? null,
    ]
  );

  return updated;
}

/**
 * Assigns an open commercial action to a user.
 */
export async function assignCommercialAction(
  client: Pool | PoolClient,
  workspaceId: string,
  actionId: string,
  params: {
    assigneeUserId: string | null;
    userId?: string | null;
  }
): Promise<CommercialActionRecord> {
  const actionRes = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE;`,
    [workspaceId, actionId]
  );

  const action = actionRes.rows[0];
  if (!action) {
    throw new Error("Ação comercial não encontrada");
  }

  if (action.status !== "open") {
    throw new Error(`Não é possível atribuir ação com status '${action.status}'`);
  }

  // Validate assignee membership if assigning to a user
  if (params.assigneeUserId) {
    const memberRes = await client.query<{ user_id: string }>(
      `SELECT user_id FROM public.workspace_memberships WHERE workspace_id = $1 AND user_id = $2 AND role IN ('owner','admin','manager','operator') FOR KEY SHARE;`,
      [workspaceId, params.assigneeUserId]
    );
    if (!memberRes.rows[0]) {
      throw new Error(`ASSIGNEE_NOT_MEMBER: O usuário ${params.assigneeUserId} não possui acesso operacional nesta empresa.`);
    }
  }

  if(action.assignee_user_id===params.assigneeUserId)return action;
  const prevAssigneeId = action.assignee_user_id;

  const updateRes = await client.query<CommercialActionRecord>(
    `UPDATE public.commercial_actions
     SET assignee_user_id = $3,
         updated_at = clock_timestamp()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *;`,
    [workspaceId, actionId, params.assigneeUserId ?? null]
  );

  const updated = updateRes.rows[0];
  if (!updated) {
    throw new Error("Falha ao atribuir responsável à ação comercial");
  }

  await client.query(
    `INSERT INTO public.commercial_action_history (
       workspace_id, action_id, action_type, previous_assignee_id, new_assignee_id, created_by_user_id, created_at
     ) VALUES ($1, $2, 'assigned', $3, $4, $5, clock_timestamp());`,
    [
      workspaceId,
      actionId,
      prevAssigneeId,
      params.assigneeUserId ?? null,
      params.userId ?? null,
    ]
  );

  return updated;
}

/**
 * Completes a commercial action.
 * Idempotent: If already completed, returns existing without error.
 */
export async function completeCommercialAction(
  client: Pool | PoolClient,
  workspaceId: string,
  actionId: string,
  params: {
    userId?: string | null;
    reason?: string | null;
  }
): Promise<CommercialActionRecord> {
  const actionRes = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE;`,
    [workspaceId, actionId]
  );

  const action = actionRes.rows[0];
  if (!action) {
    throw new Error("Ação comercial não encontrada");
  }

  if (action.status === "completed") {
    return action; // Idempotent success
  }

  if (action.status === "cancelled") {
    throw new Error("Ação já foi cancelada e não pode ser concluída");
  }

  const updateRes = await client.query<CommercialActionRecord>(
    `UPDATE public.commercial_actions
     SET status = 'completed',
         completed_at = clock_timestamp(),
         completed_by_user_id = $3,
         updated_at = clock_timestamp()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *;`,
    [workspaceId, actionId, params.userId ?? null]
  );

  const updated = updateRes.rows[0];
  if (!updated) {
    throw new Error("Falha ao concluir ação comercial");
  }

  await client.query(
    `INSERT INTO public.commercial_action_history (
       workspace_id, action_id, action_type, created_by_user_id, reason, created_at
     ) VALUES ($1, $2, 'completed', $3, $4, clock_timestamp());`,
    [workspaceId, actionId, params.userId ?? null, params.reason?.trim()||null]
  );

  return updated;
}

/**
 * Cancels a commercial action.
 * Idempotent: If already cancelled, returns existing without error.
 */
export async function cancelCommercialAction(
  client: Pool | PoolClient,
  workspaceId: string,
  actionId: string,
  params: {
    reason?: string | null;
    userId?: string | null;
  }
): Promise<CommercialActionRecord> {
  const actionRes = await client.query<CommercialActionRecord>(
    `SELECT * FROM public.commercial_actions 
     WHERE workspace_id = $1 AND id = $2
     FOR UPDATE;`,
    [workspaceId, actionId]
  );

  const action = actionRes.rows[0];
  if (!action) {
    throw new Error("Ação comercial não encontrada");
  }

  if (action.status === "cancelled") {
    return action; // Idempotent success
  }

  if (action.status === "completed") {
    throw new Error("Ação já foi concluída e não pode ser cancelada");
  }

  const updateRes = await client.query<CommercialActionRecord>(
    `UPDATE public.commercial_actions
     SET status = 'cancelled',
         cancelled_at = clock_timestamp(),
         cancelled_by_user_id = $3,
         updated_at = clock_timestamp()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *;`,
    [workspaceId, actionId, params.userId ?? null]
  );

  const updated = updateRes.rows[0];
  if (!updated) {
    throw new Error("Falha ao cancelar ação comercial");
  }

  await client.query(
    `INSERT INTO public.commercial_action_history (
       workspace_id, action_id, action_type, reason, created_by_user_id, created_at
     ) VALUES ($1, $2, 'cancelled', $3, $4, clock_timestamp());`,
    [workspaceId, actionId, params.reason ?? null, params.userId ?? null]
  );

  return updated;
}

/**
 * Retrieves the action history audit trail.
 */
export async function getCommercialActionHistory(
  client: Pool | PoolClient,
  workspaceId: string,
  actionId: string
): Promise<CommercialActionHistoryRecord[]> {
  const res = await client.query<CommercialActionHistoryRecord>(
    `SELECT * FROM public.commercial_action_history
     WHERE workspace_id = $1 AND action_id = $2
     ORDER BY created_at ASC;`,
    [workspaceId, actionId]
  );
  return res.rows;
}
