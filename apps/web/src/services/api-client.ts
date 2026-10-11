/**
 * SOS Sales V3 — API Client (MCT OS v2.0)
 * Strict, typed Fastify client with AbortController, tenant headers & correlation tracking.
 */

export interface MeUser {
  id: string;
  email: string;
  activeRole: string;
  activeWorkspaceId: string | null;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: string;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "manager" | "operator";
  joinedAt: string;
}

export interface MeResponse {
  user: MeUser;
  workspaces: WorkspaceSummary[];
}

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  isActive: boolean;
  defaultPixKey?: string | null;
  defaultPixKeyType?: string | null;
  defaultPixMerchantName?: string | null;
  defaultPixMerchantCity?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDetailsResponse {
  workspace: WorkspaceRecord;
  userRole: string;
  permissions: string[];
  membership?: {
    role: string;
  };
}

export interface HealthResponse {
  status: string;
  checks?: {
    database?: { healthy: boolean; latencyMs: number };
    redis?: { healthy: boolean; latencyMs: number };
  };
  timestamp?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
    public correlationId?: string,
    public instance?: string
  ) {
    super(`[${status}] ${title}: ${detail}`);
    this.name = "ApiError";
  }
}

export class AuthError extends ApiError {
  constructor(detail = "Sessão inválida ou expirada", correlationId?: string) {
    super(401, "Não Autorizado", detail, correlationId);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(detail = "Acesso negado para este workspace", correlationId?: string) {
    super(403, "Acesso Proibido", detail, correlationId);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(detail = "Recurso não encontrado", correlationId?: string) {
    super(404, "Não Encontrado", detail, correlationId);
    this.name = "NotFoundError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Falha de conectividade com a API Fastify") {
    super(message);
    this.name = "NetworkError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  token?: string | null;
  workspaceId?: string | null;
  correlationId?: string;
  isPublic?: boolean;
}

export interface ChannelSummary {
  id: string;
  workspaceId: string;
  provider: "meta_waba" | "waha" | "evolution" | "meta_messenger" | "meta_instagram";
  displayName: string;
  phoneNumberE164: string | null;
  isActive: boolean;
  metaBillingConfigured?: boolean;
  metaBillingAccountId?: string | null;
  status?: "connected" | "revoked" | "configuring" | "unconfigured" | "error";
  environment?: "production_certified" | "lab_local";
  createdAt: string;
  updatedAt: string;
}

export interface CommercialThreadSummary {
  id: string;
  workspaceId: string;
  channelInstanceId: string;
  channelProvider: string;
  channelName: string;
  contactId: string;
  contactPhone: string;
  contactName: string | null;
  status: "active" | "waiting_client" | "waiting_human" | "closed";
  handoffReason?: string | null;
  handoffAt?: string | null;
  lastMessageAt: string;
  lastMessage: {
    body: string;
    direction: "inbound" | "outbound";
    createdAt: string;
    deliveryStatus: string;
  } | null;
  nextAction?: {
    id: string;
    title: string;
    dueAt: string | null;
    status: string;
    assigneeUserId: string | null;
  } | null;
  fepExpiresAt?: string | null;
  attributionSource?: string | null;
  journeyStage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialActionSummary {
  id: string;
  workspaceId: string;
  threadId: string;
  journeyId: string | null;
  suggestionId: string | null;
  title: string;
  description: string | null;
  assigneeUserId: string | null;
  dueAt: string;
  status: "open" | "completed" | "cancelled";
  origin: "manual" | "radar_suggestion" | "system";
  postponedCount: number;
  postponedReason: string | null;
  postponedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommercialActionHistorySummary {
  id: string;
  actionId: string;
  actionType: "created" | "assigned" | "rescheduled" | "completed" | "cancelled";
  previousDueAt: string | null;
  newDueAt: string | null;
  previousAssigneeId: string | null;
  newAssigneeId: string | null;
  reason: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export interface CommercialProposalItem {
  productId: string | null;
  title: string;
  unitPriceCents: number;
  quantity: number;
  subtotalCents: number;
}

export interface CommercialProposalSummary {
  id: string;
  workspaceId: string;
  threadId: string;
  contactId: string;
  journeyId: string | null;
  title: string;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled";
  items: CommercialProposalItem[];
  totalCents: number;
  currency: string;
  conditions: string | null;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessageSummary {
  id: string;
  workspaceId: string;
  channelInstanceId: string;
  threadId: string;
  provider: string;
  direction: "inbound" | "outbound";
  senderE164: string;
  recipientE164: string;
  contentType: string;
  body: string | null;
  mediaUrl: string | null;
  metadata?: Record<string, unknown> | null;
  providerMessageId: string | null;
  deliveryStatus: "queued" | "sent" | "delivered" | "read" | "failed";
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplateButton {
  type: string;
  text: string;
  url?: string;
  phone_number?: string;
}

export interface MessageTemplateSummary {
  id: string;
  workspaceId: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: MessageTemplateButton[];
  variables: string[];
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
  metaTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WabaTemplateComponent {
  type: "header" | "body" | "button";
  parameters?: Array<Record<string, unknown>>;
  sub_type?: string;
  index?: number;
}

export interface WabaTemplateMessage {
  name: string;
  language: string;
  components?: WabaTemplateComponent[];
}

export interface FlowScreenField {
  id: string;
  type: "text" | "select" | "radio" | "date" | "textarea";
  label: string;
  required?: boolean;
  options?: Array<{ id: string; title: string }>;
}

export interface FlowScreen {
  id: string;
  title: string;
  fields: FlowScreenField[];
}

export interface WhatsAppFlowSummary {
  id: string;
  workspaceId: string;
  name: string;
  title: string;
  description: string | null;
  category: "LEAD_GENERATION" | "APPOINTMENT_BOOKING" | "CUSTOMER_SUPPORT" | "SURVEY";
  status: "DRAFT" | "PUBLISHED" | "DEPRECATED" | "BLOCKED";
  metaFlowId: string;
  ctaLabel: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  initialScreen: string;
  screensPreview: FlowScreen[];
  createdAt: string;
  updatedAt: string;
}

export interface WabaInteractiveFlowActionParameters {
  flow_message_version: string;
  flow_token: string;
  flow_id: string;
  flow_cta: string;
  flow_action: "navigate" | "data_exchange";
  flow_action_payload?: {
    screen: string;
    data?: Record<string, unknown>;
  };
}

export interface ProductRecord {
  id: string;
  workspaceId: string;
  catalogId: string;
  retailerId: string;
  title: string;
  subtitle: string | null;
  description: string;
  priceCents: number;
  priceFormatted: string;
  currency: string;
  category: string;
  imageUrl: string;
  badge: string | null;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PixChargeSummary {
  id: string;
  workspaceId: string;
  threadId: string;
  contactId: string;
  productId: string | null;
  title: string;
  amountCents: number;
  amountFormatted: string;
  currency: string;
  pixCode: string;
  pixQrUrl: string | null;
  verificationMethod?: "UNVERIFIED" | "MANUAL_CASHIER" | "BANK_WEBHOOK" | null;
  verifiedByUserId?: string | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSuggestionSummary {
  id: string;
  idempotencyKey: string;
  source: string;
  threadId: string | null;
  contactId: string | null;
  suggestionType: string;
  title: string;
  body: string;
  draftMessage: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  metadata: Record<string, unknown>;
  status: "pending" | "accepted" | "dismissed" | "expired" | "invalidated";
  stateVersion: number;
  decidedByUserId: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationSuggestionDecisionResult {
  id: string;
  status: "accepted" | "dismissed";
  stateVersion: number;
  decidedByUserId: string | null;
  decidedAt: string | null;
  draftMessage: string | null;
  threadId: string | null;
  action?: CommercialActionSummary | null;
}

export interface WabaInteractiveMessage {
  type: "flow" | "button" | "list" | "product" | "product_list" | "catalog_message";
  header?: {
    type: "text" | "image" | "video" | "document";
    text?: string;
  };
  body: {
    text: string;
  };
  footer?: {
    text: string;
  };
  action: {
    name?: string;
    parameters?: WabaInteractiveFlowActionParameters | Record<string, unknown>;
    catalog_id?: string;
    product_retailer_id?: string;
    sections?: Array<{
      title: string;
      product_items: Array<{ product_retailer_id: string }>;
    }>;
    [key: string]: unknown;
  };
}

export interface SendOutboundMessagePayload {
  recipientPhoneE164: string;
  contentType: "text" | "image" | "audio" | "video" | "document" | "template" | "interactive";
  body: string;
  mediaUrl?: string;
  template?: WabaTemplateMessage;
  interactive?: WabaInteractiveMessage;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface UploadMediaResponse {
  mediaUrl: string;
  expiresInSeconds: number;
  contentType: string;
  category: "image" | "audio" | "video" | "document";
  sizeBytes: number;
  fileName: string;
}

export interface ContactSummary {
  id: string;
  workspaceId: string;
  phoneE164: string;
  name: string | null;
  optOut: boolean;
  metadata: {
    email?: string;
    company?: string;
    notes?: string;
    tags?: string[];
    isRecurring?: boolean;
    totalOrders?: number;
    totalSpentCents?: number;
    lastOrderAt?: string;
    customerSince?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type JourneyStage = "lead" | "qualified" | "proposal" | "scheduled" | "won" | "lost";

export interface JourneySummary {
  id: string;
  contactId: string;
  threadId?: string | null;
  title: string | null;
  stage: JourneyStage;
  status?: string;
  attributionSource?: string | null;
  estimatedValueCents: number | null;
  createdAt: string;
  updatedAt?: string;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl.replace(/\/$/, "");
    } else if (
      typeof window !== "undefined" &&
      window.location.hostname !== "localhost" &&
      window.location.hostname !== "127.0.0.1"
    ) {
      this.baseUrl = window.location.origin;
    } else {
      this.baseUrl = ((import.meta as any).env?.VITE_API_BASE_URL || "http://localhost:4400").replace(/\/$/, "");
    }
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  private getCorrelationId(custom?: string): string {
    return (
      custom ||
      `v3-web-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`
    );
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-correlation-id": this.getCorrelationId(options.correlationId),
    };

    if (options.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }

    if (options.workspaceId) {
      headers["X-Workspace-Id"] = options.workspaceId;
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw err;
      }
      throw new NetworkError(
        `Falha ao conectar com o serviço em ${url}. Verifique a API Fastify no Docker Lab.`
      );
    }

    if (!response.ok) {
      let body: { title?: string; detail?: string; correlationId?: string; instance?: string } = {};
      try {
        body = await response.json();
      } catch {
        // Body was not JSON
      }

      const correlationId = response.headers.get("x-correlation-id") || body.correlationId;
      const detail = body.detail || response.statusText;

      if (response.status === 401) {
        throw new AuthError(detail, correlationId);
      }
      if (response.status === 403) {
        throw new ForbiddenError(detail, correlationId);
      }
      if (response.status === 404) {
        throw new NotFoundError(detail, correlationId);
      }

      throw new ApiError(
        response.status,
        body.title || "Erro da API",
        detail,
        correlationId,
        body.instance
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new NetworkError(`Resposta inesperada do servidor (${response.status})`);
    }

    return response.json() as Promise<T>;
  }

  async getReady(options?: RequestOptions): Promise<HealthResponse> {
    try {
      return await this.request<HealthResponse>("/ready", options);
    } catch (err) {
      // Resilient fallback to /health if /ready is not routed
      try {
        const live = await this.request<{ status: string }>("/health", options);
        return {
          status: live.status === "live" ? "ready" : "degraded",
        };
      } catch {
        throw err;
      }
    }
  }

  async loginWithPassword(
    payload: { email: string; password: string; workspaceId?: string },
    options?: RequestOptions
  ): Promise<{ token: string; user: MeUser; workspaces: WorkspaceSummary[] }> {
    return this.request<{ token: string; user: MeUser; workspaces: WorkspaceSummary[] }>(
      "/v1/auth/login",
      {
        ...options,
        method: "POST",
        body: payload,
      }
    );
  }

  async switchWorkspace(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ token: string; user: MeUser; workspaces: WorkspaceSummary[] }> {
    return this.request<{ token: string; user: MeUser; workspaces: WorkspaceSummary[] }>(
      "/v1/auth/switch-workspace",
      {
        ...options,
        method: "POST",
        body: { workspaceId },
      }
    );
  }

  async requestAuthSession(
    payload: { email: string; accessKey?: string },
    options?: RequestOptions
  ): Promise<{ token: string; user: MeUser; workspaces: WorkspaceSummary[] }> {
    return this.request<{ token: string; user: MeUser; workspaces: WorkspaceSummary[] }>(
      "/v1/auth/session",
      {
        ...options,
        method: "POST",
        body: payload,
      }
    );
  }

  async getWorkspaceMembers(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ members: WorkspaceMember[] }> {
    return this.request<{ members: WorkspaceMember[] }>(
      `/v1/workspaces/${workspaceId}/members`,
      {
        ...options,
        workspaceId,
      }
    );
  }

  async addWorkspaceMember(
    workspaceId: string,
    payload: { name: string; email: string; role: "admin" | "manager" | "operator"; password?: string },
    options?: RequestOptions
  ): Promise<{ member: WorkspaceMember; initialPassword?: string }> {
    return this.request<{ member: WorkspaceMember; initialPassword?: string }>(
      `/v1/workspaces/${workspaceId}/members`,
      {
        ...options,
        method: "POST",
        body: payload,
        workspaceId,
      }
    );
  }

  async updateWorkspaceMember(
    workspaceId: string,
    memberId: string,
    payload: { role?: "admin" | "manager" | "operator"; password?: string },
    options?: RequestOptions
  ): Promise<{ member: WorkspaceMember }> {
    return this.request<{ member: WorkspaceMember }>(
      `/v1/workspaces/${workspaceId}/members/${memberId}`,
      {
        ...options,
        method: "PATCH",
        body: payload,
        workspaceId,
      }
    );
  }

  async removeWorkspaceMember(
    workspaceId: string,
    memberId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; message?: string }> {
    return this.request<{ success: boolean; message?: string }>(
      `/v1/workspaces/${workspaceId}/members/${memberId}`,
      {
        ...options,
        method: "DELETE",
        workspaceId,
      }
    );
  }

  async getMe(options?: RequestOptions): Promise<MeResponse> {
    return this.request<MeResponse>("/v1/me", options);
  }

  async getWorkspace(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<WorkspaceDetailsResponse> {
    const raw = await this.request<{
      workspace: WorkspaceRecord;
      userRole?: string;
      permissions?: string[];
      membership?: { role?: string };
    }>(`/v1/workspaces/${workspaceId}`, {
      ...options,
      workspaceId,
    });

    const userRole = raw.userRole || raw.membership?.role || "owner";
    const defaultPermissionsForRole = (role: string): string[] => {
      switch (role) {
        case "owner":
        case "admin":
          return [
            "workspace:view",
            "workspace:manage",
            "workspace:invite",
            "cockpit:access",
            "cockpit:send_message",
            "cockpit:handoff",
            "journey:view",
            "journey:transition_stage",
            "outcome:register",
            "integration:view",
            "integration:manage",
            "capi:dispatch",
            "audit:view",
          ];
        case "manager":
          return [
            "workspace:view",
            "workspace:invite",
            "cockpit:access",
            "cockpit:send_message",
            "cockpit:handoff",
            "journey:view",
            "journey:transition_stage",
            "outcome:register",
            "integration:view",
            "audit:view",
          ];
        case "operator":
          return [
            "cockpit:access",
            "cockpit:send_message",
            "cockpit:handoff",
            "journey:view",
            "journey:transition_stage",
            "outcome:register",
          ];
        case "analyst":
          return ["workspace:view", "journey:view", "integration:view", "audit:view"];
        default:
          return ["workspace:view", "cockpit:access"];
      }
    };

    return {
      workspace: raw.workspace,
      userRole,
      permissions:
        Array.isArray(raw.permissions) && raw.permissions.length > 0
          ? raw.permissions
          : defaultPermissionsForRole(userRole),
      membership: { role: raw.membership?.role || userRole },
    };
  }

  async getChannels(
    workspaceId: string,
    options?: RequestOptions & { includeInactive?: boolean }
  ): Promise<{ channels: ChannelSummary[]; total: number }> {
    const qs = options?.includeInactive ? "?includeInactive=true" : "";
    return this.request<{ channels: ChannelSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/channels${qs}`,
      { ...options, workspaceId }
    );
  }

  async getThreads(
    workspaceId: string,
    query?: { status?: string; needsAttention?: boolean },
    options?: RequestOptions
  ): Promise<{ threads: CommercialThreadSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.needsAttention) params.set("needsAttention", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request<{ threads: CommercialThreadSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads${qs}`,
      { ...options, workspaceId }
    );
  }

  async getThreadActions(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ actions: CommercialActionSummary[]; openAction: CommercialActionSummary | null }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/actions`,
      { ...options, workspaceId }
    );
  }

  async createThreadAction(
    workspaceId: string,
    threadId: string,
    payload: {
      title: string;
      description?: string | null;
      dueAt: string;
      assigneeUserId?: string | null;
      origin?: "manual" | "radar_suggestion" | "system";
    },
    options?: RequestOptions
  ): Promise<{ created: boolean; action: CommercialActionSummary }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/actions`,
      {
        ...options,
        method: "POST",
        body: payload,
        workspaceId,
      }
    );
  }

  async patchCommercialAction(
    workspaceId: string,
    actionId: string,
    payload:
      | { action: "complete" }
      | { action: "cancel"; reason?: string | null }
      | { action: "reschedule"; newDueAt: string; reason: string }
      | { action: "assign"; assigneeUserId: string | null },
    options?: RequestOptions
  ): Promise<{ action: CommercialActionSummary }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/actions/${actionId}`,
      {
        ...options,
        method: "PATCH",
        body: payload,
        workspaceId,
      }
    );
  }

  async getActionHistory(
    workspaceId: string,
    actionId: string,
    options?: RequestOptions
  ): Promise<{ history: CommercialActionHistorySummary[] }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/actions/${actionId}/history`,
      { ...options, workspaceId }
    );
  }

  // ─── Commercial Proposals (M6) ──────────────────────────────────────────

  async getThreadProposals(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ items: CommercialProposalSummary[] }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
      { ...options, workspaceId }
    );
  }

  async createThreadProposal(
    workspaceId: string,
    threadId: string,
    payload: {
      contactId: string;
      journeyId?: string | null;
      title: string;
      items: Array<{
        productId?: string | null;
        title?: string;
        unitPriceCents?: number;
        quantity: number;
      }>;
      currency?: string;
      conditions?: string | null;
      validUntil?: string | null;
    },
    options?: RequestOptions
  ): Promise<CommercialProposalSummary> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
      {
        ...options,
        method: "POST",
        body: payload,
        workspaceId,
      }
    );
  }

  async getProposal(
    workspaceId: string,
    proposalId: string,
    options?: RequestOptions
  ): Promise<CommercialProposalSummary> {
    return this.request(
      `/v1/workspaces/${workspaceId}/proposals/${proposalId}`,
      { ...options, workspaceId }
    );
  }

  async patchProposalStatus(
    workspaceId: string,
    proposalId: string,
    payload: {
      status: "draft" | "sent" | "accepted" | "rejected" | "expired" | "cancelled";
      reason?: string | null;
    },
    options?: RequestOptions
  ): Promise<CommercialProposalSummary> {
    return this.request(
      `/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
      {
        ...options,
        method: "PATCH",
        body: payload,
        workspaceId,
      }
    );
  }

  async getThreadMessages(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ messages: ThreadMessageSummary[]; total: number }> {
    return this.request<{ messages: ThreadMessageSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/messages`,
      { ...options, workspaceId }
    );
  }

  async sendOutboundMessage(
    workspaceId: string,
    channelInstanceId: string,
    payload: SendOutboundMessagePayload,
    options?: RequestOptions
  ): Promise<{
    messageId: string;
    outboundCommandId: string;
    deliveryStatus: string;
    idempotentReplay: boolean;
  }> {
    const idempotencyKey =
      payload.idempotencyKey ||
      `web-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;

    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelInstanceId}/messages`,
      {
        ...options,
        workspaceId,
        method: "POST",
        body: {
          recipientPhoneE164: payload.recipientPhoneE164,
          contentType: payload.contentType,
          body: payload.body,
          mediaUrl: payload.mediaUrl,
          template: payload.template,
          interactive: payload.interactive,
          metadata: payload.metadata,
          idempotencyKey,
        },
      }
    );
  }

  async uploadMedia(
    workspaceId: string,
    file: File,
    options?: RequestOptions
  ): Promise<UploadMediaResponse> {
    const query = options?.isPublic ? "?public=true" : "";
    const url = `${this.baseUrl}/v1/workspaces/${workspaceId}/media${query}`;
    const headers: Record<string, string> = {
      "Content-Type": file.type,
      "x-file-name": file.name,
      "x-correlation-id": this.getCorrelationId(options?.correlationId),
      ...(options?.isPublic ? { "x-public": "true" } : {}),
    };
    if (options?.token) {
      headers["Authorization"] = `Bearer ${options.token}`;
    }
    if (options?.workspaceId || workspaceId) {
      headers["X-Workspace-Id"] = options?.workspaceId || workspaceId;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: file,
      signal: options?.signal,
    });

    if (!response.ok) {
      let body: { detail?: string; title?: string } = {};
      try {
        body = await response.json();
      } catch {}
      throw new ApiError(
        response.status,
        body.title || "Erro no upload",
        body.detail || "Falha ao enviar arquivo"
      );
    }

    return response.json() as Promise<UploadMediaResponse>;
  }

  async updateThreadStatus(
    workspaceId: string,
    threadId: string,
    status: "active" | "waiting_client" | "waiting_human" | "closed",
    options?: RequestOptions
  ): Promise<{ thread: CommercialThreadSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/threads/${threadId}`, {
      ...options,
      workspaceId,
      method: "PATCH",
      body: { status },
    });
  }

  async recordOutcome(
    workspaceId: string,
    threadId: string,
    payload: {
      status: "won" | "lost";
      valueCents: number;
      currency?: string;
      reason?: string;
    },
    options?: RequestOptions
  ): Promise<{
    outcome: {
      id: string;
      workspaceId: string;
      journeyId: string;
      status: "won" | "lost";
      valueCents: number;
      currency: string;
      reason: string | null;
      createdAt: string;
    };
    conversionEvent: {
      id: string;
      eventName: string;
      valueCents: number | null;
      status: string;
      createdAt: string;
    } | null;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/outcomes`,
      {
        ...options,
        workspaceId,
        method: "POST",
        body: payload,
      }
    );
  }

  async getThreadJourney(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{
    journey: {
      id: string;
      workspaceId: string;
      contactId: string;
      threadId: string | null;
      stage: string;
      status: string;
      estimatedValueCents: number;
      createdAt: string;
    } | null;
    latestOutcome: {
      id: string;
      status: "won" | "lost";
      valueCents: number;
      currency: string;
      reason: string | null;
      createdAt: string;
    } | null;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/journey`,
      {
        ...options,
        workspaceId,
        method: "GET",
      }
    );
  }

  async getConversions(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{
    items: Array<{
      id: string;
      journeyId: string;
      outcomeId: string | null;
      eventName: string;
      valueCents: number | null;
      currency: string;
      status: string;
      providerReceipt: Record<string, unknown> | null;
      errorMessage: string | null;
      createdAt: string;
    }>;
    total: number;
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/conversions`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createChannel(
    workspaceId: string,
    payload: {
      provider: "meta_waba" | "waha" | "evolution" | "meta_messenger" | "meta_instagram";
      displayName: string;
      phoneNumberE164?: string;
      endpointToken?: string;
      credentials?: {
        accessToken?: string;
        phoneNumberId?: string;
        wabaAccountId?: string;
        appSecret?: string;
        apiKey?: string;
        baseUrl?: string;
      };
    },
    options?: RequestOptions
  ): Promise<{
    channel: ChannelSummary;
    webhookToken: string;
    webhookUrl: string;
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/channels`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async metaEmbeddedSignup(
    workspaceId: string,
    payload: {
      displayName: string;
      wabaAccountId: string;
      phoneNumberId: string;
      code?: string;
      accessToken?: string;
    },
    options?: RequestOptions
  ): Promise<{
    channel: ChannelSummary;
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/channels/meta-embedded-signup`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async testChannelConnection(
    workspaceId: string,
    payload: {
      provider: "meta_waba" | "waha" | "evolution";
      credentials: {
        accessToken?: string;
        phoneNumberId?: string;
        wabaAccountId?: string;
        appSecret?: string;
        apiKey?: string;
        baseUrl?: string;
      };
    },
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    verifiedName?: string;
    displayPhoneNumber?: string;
    qualityRating?: string;
    codeVerificationStatus?: string;
    error?: string;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/test-connection`,
      {
        ...options,
        workspaceId,
        method: "POST",
        body: payload,
      }
    );
  }

  async revokeChannel(
    workspaceId: string,
    channelId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; channelId: string; status: string; message: string }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelId}/revoke`,
      {
        ...options,
        workspaceId,
        method: "POST",
      }
    );
  }

  async deleteChannel(
    workspaceId: string,
    channelId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; mode: "deleted" | "archived"; message: string }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelId}`,
      {
        ...options,
        workspaceId,
        method: "DELETE",
      }
    );
  }

  async getChannelQrCode(
    workspaceId: string,
    channelId: string,
    options?: RequestOptions & { force?: boolean }
  ): Promise<{
    success: boolean;
    status: string;
    qr?: string;
    qrDataUri?: string;
    alreadyConnected?: boolean;
    me?: { id?: string; pushName?: string } | null;
    isSimulated?: boolean;
    message?: string;
    error?: string;
  }> {
    const query = options?.force ? "?force=true" : "";
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelId}/qr-code${query}`,
      {
        ...options,
        workspaceId,
        method: "GET",
      }
    );
  }

  async syncChannelChats(
    workspaceId: string,
    channelId: string,
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    syncedChatsCount: number;
    syncedMessagesCount: number;
    message: string;
  }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelId}/sync`,
      {
        ...options,
        workspaceId,
        method: "POST",
      }
    );
  }

  async updateChannelBilling(
    workspaceId: string,
    channelId: string,
    payload: { metaBillingConfigured: boolean; metaBillingAccountId?: string | null },
    options?: RequestOptions
  ): Promise<{ success: boolean; channel: Partial<ChannelSummary> }> {
    return this.request(
      `/v1/workspaces/${workspaceId}/channels/${channelId}/billing`,
      {
        ...options,
        workspaceId,
        method: "PATCH",
        body: payload,
      }
    );
  }

  async updateWorkspace(
    workspaceId: string,
    payload: {
      name?: string;
      defaultPixKey?: string | null;
      defaultPixKeyType?: string | null;
      defaultPixMerchantName?: string | null;
      defaultPixMerchantCity?: string | null;
    },
    options?: RequestOptions
  ): Promise<{ workspace: WorkspaceRecord }> {
    return this.request<{ workspace: WorkspaceRecord }>(
      `/v1/workspaces/${workspaceId}`,
      {
        ...options,
        workspaceId,
        method: "PATCH",
        body: payload,
      }
    );
  }

  async createWorkspace(
    payload: {
      name: string;
      ownerName: string;
      ownerEmail: string;
      initialPassword?: string;
    },
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    workspace: { id: string; name: string; slug: string };
    owner: { id: string; name: string; email: string; tempPassword?: string | null; isExistingUser?: boolean };
    welcomeMessage: string;
  }> {
    return this.request<{
      success: boolean;
      workspace: { id: string; name: string; slug: string };
      owner: { id: string; name: string; email: string; tempPassword?: string | null; isExistingUser?: boolean };
      welcomeMessage: string;
    }>("/v1/workspaces", {
      ...options,
      method: "POST",
      body: payload,
    });
  }

  async getContacts(
    workspaceId: string,
    query?: { search?: string; limit?: number; offset?: number; status?: "active" | "inactive" | "all" },
    options?: RequestOptions
  ): Promise<{
    contacts: ContactSummary[];
    total: number;
  }> {
    const params = new URLSearchParams();
    if (query?.search) params.set("search", query.search);
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.offset) params.set("offset", String(query.offset));
    if (query?.status) params.set("status", query.status);
    const qs = params.toString() ? `?${params.toString()}` : "";

    return this.request(`/v1/workspaces/${workspaceId}/contacts${qs}`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createContact(
    workspaceId: string,
    payload: { phoneE164: string; name?: string },
    options?: RequestOptions
  ): Promise<{ contact: ContactSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/contacts`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async updateContact(
    workspaceId: string,
    contactId: string,
    payload: {
      phoneE164?: string;
      name?: string | null;
      optOut?: boolean;
      metadata?: ContactSummary["metadata"];
    },
    options?: RequestOptions
  ): Promise<{ contact: ContactSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/contacts/${contactId}`, {
      ...options,
      workspaceId,
      method: "PATCH",
      body: payload,
    });
  }

  async deleteContact(workspaceId: string, contactId: string, options?: RequestOptions): Promise<void> {
    return this.request(`/v1/workspaces/${workspaceId}/contacts/${contactId}`, {
      ...options,
      workspaceId,
      method: "DELETE",
    });
  }

  async listJourneys(
    workspaceId: string,
    query?: { status?: string; limit?: number },
    options?: RequestOptions
  ): Promise<{ items: JourneySummary[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.status) params.set("status", query.status);
    if (query?.limit) params.set("limit", String(query.limit));
    const qs = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/v1/workspaces/${workspaceId}/journeys${qs}`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createJourney(
    workspaceId: string,
    payload: {
      contactId: string;
      title?: string;
      stage?: JourneyStage;
      attributionSource?: string;
      estimatedValueCents?: number;
    },
    options?: RequestOptions
  ): Promise<JourneySummary> {
    return this.request(`/v1/workspaces/${workspaceId}/journeys`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async updateJourneyStage(
    workspaceId: string,
    journeyId: string,
    stage: Exclude<JourneyStage, "won" | "lost">,
    options?: RequestOptions
  ): Promise<{ journey: JourneySummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/journeys/${journeyId}/stage`, {
      ...options,
      workspaceId,
      method: "PATCH",
      body: { stage },
    });
  }

  async recordJourneyOutcome(
    workspaceId: string,
    journeyId: string,
    payload: { status: "won" | "lost"; valueCents: number; currency?: string; reason?: string },
    options?: RequestOptions
  ): Promise<unknown> {
    return this.request(`/v1/workspaces/${workspaceId}/journeys/${journeyId}/outcomes`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async getTemplates(
    workspaceId: string,
    query?: { category?: string; status?: string },
    options?: RequestOptions
  ): Promise<{ templates: MessageTemplateSummary[]; total: number }> {
    const params = new URLSearchParams();
    if (query?.category) params.set("category", query.category);
    if (query?.status) params.set("status", query.status);
    const qs = params.toString() ? `?${params.toString()}` : "";

    return this.request(`/v1/workspaces/${workspaceId}/templates${qs}`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async createTemplate(
    workspaceId: string,
    payload: {
      name: string;
      category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
      language?: string;
      headerText?: string | null;
      bodyText: string;
      footerText?: string | null;
      buttons?: MessageTemplateButton[];
      variables?: string[];
      status?: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED";
      metaTemplateId?: string;
    },
    options?: RequestOptions
  ): Promise<{ template: MessageTemplateSummary }> {
    return this.request(`/v1/workspaces/${workspaceId}/templates`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async generateTemplate(
    workspaceId: string,
    payload: {
      objective: string;
      audience: string;
      tone: "PROFESSIONAL" | "FRIENDLY" | "DIRECT";
      strategy?: "UTILITY_TROJAN" | "DIRECT_MARKETING";
    },
    options?: RequestOptions
  ): Promise<{
    generated: {
      name: string;
      category: "UTILITY" | "MARKETING";
      headerText: string | null;
      bodyText: string;
      footerText: string | null;
      buttonText: string | null;
      variableLabels: string[];
      explanation: string;
    };
    model: string;
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/templates/generate`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }

  async getFlows(
    workspaceId: string,
    query?: { category?: string; status?: string },
    options?: RequestOptions
  ): Promise<{ flows: WhatsAppFlowSummary[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (query?.category) searchParams.set("category", query.category);
    if (query?.status) searchParams.set("status", query.status);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<{ flows: WhatsAppFlowSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/flows${qs}`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async getProducts(
    workspaceId: string,
    query?: { category?: string; search?: string },
    options?: RequestOptions
  ): Promise<{ products: ProductRecord[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (query?.category) searchParams.set("category", query.category);
    if (query?.search) searchParams.set("search", query.search);
    const qs = searchParams.toString() ? `?${searchParams.toString()}` : "";
    return this.request<{ products: ProductRecord[]; total: number }>(
      `/v1/workspaces/${workspaceId}/products${qs}`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async createProduct(
    workspaceId: string,
    payload: {
      retailerId: string;
      title: string;
      subtitle?: string | null;
      description: string;
      priceCents: number;
      currency?: string;
      category?: string;
      imageUrl: string;
      badge?: string | null;
      catalogId?: string;
      status?: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
      isFeatured?: boolean;
    },
    options?: RequestOptions
  ): Promise<{ product: ProductRecord }> {
    return this.request<{ product: ProductRecord }>(
      `/v1/workspaces/${workspaceId}/products`,
      {
        ...options,
        method: "POST",
        workspaceId,
        body: payload,
      }
    );
  }

  async createPixCharge(
    workspaceId: string,
    threadId: string,
    payload: {
      contactId: string;
      productId?: string | null;
      title: string;
      amountCents: number;
      expiresMinutes?: number;
    },
    options?: RequestOptions
  ): Promise<{ charge: PixChargeSummary }> {
    return this.request<{ charge: PixChargeSummary }>(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/pix-charges`,
      {
        ...options,
        method: "POST",
        workspaceId,
        body: payload,
      }
    );
  }

  async getPixChargesByThread(
    workspaceId: string,
    threadId: string,
    options?: RequestOptions
  ): Promise<{ charges: PixChargeSummary[]; total: number }> {
    return this.request<{ charges: PixChargeSummary[]; total: number }>(
      `/v1/workspaces/${workspaceId}/threads/${threadId}/pix-charges`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async confirmPixPayment(
    workspaceId: string,
    chargeId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; charge: PixChargeSummary; outcomeId?: string }> {
    return this.request<{ success: boolean; charge: PixChargeSummary; outcomeId?: string }>(
      `/v1/workspaces/${workspaceId}/pix-charges/${chargeId}/confirm-payment`,
      {
        ...options,
        method: "POST",
        workspaceId,
      }
    );
  }

  // ─── Integration Suggestions (F1 Radar) ──────────────────────────────────

  async getIntegrationSuggestionCount(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ pendingCount: number }> {
    return this.request<{ pendingCount: number }>(
      `/v1/workspaces/${workspaceId}/integrations/suggestions/count`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async scanRadar(
    workspaceId: string,
    payload: { minHoursSinceLastMessage?: number; limit?: number; threadId?: string } = {},
    options?: RequestOptions
  ): Promise<{ enabled: boolean; candidates: number; created: number }> {
    return this.request(`/v1/workspaces/${workspaceId}/integrations/radar/scan`, {
      ...options,
      method: "POST",
      workspaceId,
      body: payload,
    });
  }

  async getIntegrationSuggestions(
    workspaceId: string,
    params?: { status?: string; threadId?: string; limit?: number; offset?: number },
    options?: RequestOptions
  ): Promise<{ items: IntegrationSuggestionSummary[]; total: number }> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.threadId) searchParams.set("threadId", params.threadId);
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.offset) searchParams.set("offset", String(params.offset));
    const qs = searchParams.toString();
    const url = `/v1/workspaces/${workspaceId}/integrations/suggestions${qs ? `?${qs}` : ""}`;
    return this.request<{ items: IntegrationSuggestionSummary[]; total: number }>(url, {
      ...options,
      method: "GET",
      workspaceId,
    });
  }

  async decideIntegrationSuggestion(
    workspaceId: string,
    suggestionId: string,
    decision: { status: "accepted" | "dismissed"; stateVersion: number },
    options?: RequestOptions
  ): Promise<IntegrationSuggestionDecisionResult> {
    return this.request<IntegrationSuggestionDecisionResult>(
      `/v1/workspaces/${workspaceId}/integrations/suggestions/${suggestionId}`,
      {
        ...options,
        method: "PATCH",
        workspaceId,
        body: decision,
      }
    );
  }

  async listWebhooks(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ webhooks: OutboundWebhookSubscription[] }> {
    return this.request<{ webhooks: OutboundWebhookSubscription[] }>(
      `/v1/workspaces/${workspaceId}/webhooks`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }

  async createWebhook(
    workspaceId: string,
    payload: { url: string; description?: string; events?: string[]; secret?: string },
    options?: RequestOptions
  ): Promise<{ webhook: OutboundWebhookSubscription }> {
    return this.request<{ webhook: OutboundWebhookSubscription }>(
      `/v1/workspaces/${workspaceId}/webhooks`,
      {
        ...options,
        method: "POST",
        workspaceId,
        body: payload,
      }
    );
  }

  async testWebhook(
    workspaceId: string,
    webhookId: string,
    options?: RequestOptions
  ): Promise<WebhookTestResult> {
    return this.request<WebhookTestResult>(
      `/v1/workspaces/${workspaceId}/webhooks/${webhookId}/test`,
      {
        ...options,
        method: "POST",
        workspaceId,
      }
    );
  }

  async deleteWebhook(
    workspaceId: string,
    webhookId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/v1/workspaces/${workspaceId}/webhooks/${webhookId}`,
      {
        ...options,
        method: "DELETE",
        workspaceId,
      }
    );
  }

  async getAiAgentConfig(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; config: AiAgentConfig }> {
    return this.request<{ success: boolean; config: AiAgentConfig }>(
      `/v1/workspaces/${workspaceId}/ai-agent`,
      { ...options, workspaceId }
    );
  }

  async updateAiAgentConfig(
    workspaceId: string,
    payload: Partial<AiAgentConfig>,
    options?: RequestOptions
  ): Promise<{ success: boolean; config: AiAgentConfig }> {
    return this.request<{ success: boolean; config: AiAgentConfig }>(
      `/v1/workspaces/${workspaceId}/ai-agent`,
      {
        ...options,
        method: "PUT",
        body: payload,
        workspaceId,
      }
    );
  }

  async simulateAiAgent(
    workspaceId: string,
    payload: {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      draftConfig?: Partial<AiAgentConfig>;
      mockLead?: {
        name?: string;
        lastPixStatus?: "PAID" | "PENDING" | "EXPIRED";
        lastPixAmountCents?: number;
        isReturningCustomer?: boolean;
      };
    },
    options?: RequestOptions
  ): Promise<AiSimulationResult> {
    return this.request<AiSimulationResult>(
      `/v1/workspaces/${workspaceId}/ai-agent/simulate`,
      {
        ...options,
        method: "POST",
        body: payload,
        workspaceId,
      }
    );
  }

  async getNichePlaybooks(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{ success: boolean; playbooks: Record<string, any> }> {
    return this.request<{ success: boolean; playbooks: Record<string, any> }>(
      `/v1/workspaces/${workspaceId}/ai-agent/niche-playbooks`,
      {
        ...options,
        method: "GET",
        workspaceId,
      }
    );
  }


  async getBroadcastPreflight(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    channels: Array<ChannelSummary & { isBlockedForBroadcast: boolean }>;
    templates: MessageTemplateSummary[];
    totalActiveContacts: number;
    billingNotice: { policy: string; description: string };
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/broadcasts/preflight`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async getBroadcastCampaigns(
    workspaceId: string,
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    campaigns: BroadcastCampaignSummary[];
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/broadcasts/campaigns`, {
      ...options,
      workspaceId,
      method: "GET",
    });
  }

  async getAudienceCount(
    workspaceId: string,
    params: {
      type: "ALL_CONTACTS" | "BY_STAGE" | "SMART_FILTER";
      stage?: string;
      smartFilter?: "NON_BUYERS" | "PIX_ABANDONED" | "INACTIVE_30_DAYS" | "CTWA_RESCUE";
    },
    options?: RequestOptions
  ): Promise<{ success: boolean; count: number; type: string; stage?: string; smartFilter?: string }> {
    const q = new URLSearchParams();
    q.set("type", params.type);
    if (params.stage) q.set("stage", params.stage);
    if (params.smartFilter) q.set("smartFilter", params.smartFilter);
    return this.request(`/v1/workspaces/${workspaceId}/broadcasts/audience-count?${q.toString()}`, {
      ...options,
      workspaceId,
    });
  }

  async createBroadcast(
    workspaceId: string,
    payload: {
      name?: string;
      channelInstanceId: string;
      templateId: string;
      isAbTest?: boolean;
      variantBTemplateId?: string;
      audience: {
        type: "ALL_CONTACTS" | "BY_STAGE" | "MANUAL" | "IMPORT_LIST" | "SMART_FILTER";
        stage?: string;
        customPhoneNumbers?: string[];
        importedContacts?: Array<{ phoneE164: string; name?: string | null }>;
        smartFilter?: "NON_BUYERS" | "PIX_ABANDONED" | "INACTIVE_30_DAYS" | "CTWA_RESCUE";
      };
      variables?: Record<string, string>;
      variantBVariables?: Record<string, string>;
    },
    options?: RequestOptions
  ): Promise<{
    success: boolean;
    batchId: string;
    campaignId?: string;
    enqueuedCount: number;
    totalTargeted: number;
    template: { name: string; category: string };
    channel: { id: string; displayName: string; provider: string };
    billingSummary: { policy: string; estimatedUnitCost: string; message: string };
  }> {
    return this.request(`/v1/workspaces/${workspaceId}/broadcasts`, {
      ...options,
      workspaceId,
      method: "POST",
      body: payload,
    });
  }
}

export interface BroadcastCampaignMetrics {
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  clicked: number;
  deliveryRate: number; // %
  openRate: number; // %
  replyRate: number; // %
  ctr: number; // %
  salesCount?: number;
  salesCents?: number;
  conversionRate?: number; // %
  averageTicketCents?: number;
}

export interface BroadcastAbVariantStats {
  templateName: string;
  category: string;
  sent: number;
  delivered: number;
  read: number;
  replied: number;
  openRate: number;
  replyRate: number;
  salesCount?: number;
  salesCents?: number;
  salesFormatted?: string;
  conversionRate?: number; // %
}

export interface BroadcastAbReport {
  winner: "A" | "B" | "TIED";
  variantA: BroadcastAbVariantStats;
  variantB: BroadcastAbVariantStats;
}

export interface BroadcastCampaignSales {
  count: number;
  totalCents: number;
  totalFormatted: string;
  conversionRate: number; // %
  averageTicketCents: number;
  averageTicketFormatted: string;
}

export interface BroadcastCampaignSummary {
  id: string;
  name: string;
  status: string;
  channel: {
    id: string;
    name: string;
    provider: string;
  };
  isAbTest: boolean;
  template: {
    id: string;
    name: string;
    category: string;
  };
  audienceType: string;
  audienceStage?: string | null;
  totalTargeted: number;
  metrics: BroadcastCampaignMetrics;
  sales?: BroadcastCampaignSales;
  abReport?: BroadcastAbReport | null;
  createdAt: string;
}

export interface AiFaqItem {
  id?: string;
  question: string;
  answer: string;
}

export interface AiObjections {
  priceDiscount?: string;
  thinkAboutIt?: string;
  guaranteeTrust?: string;
  deliveryTimeline?: string;
}

export type GroundedObjections = AiObjections;

export interface AiBusinessRules {
  companyName?: string;
  agentRole?: string;
  valueProposition?: string;
  niche?: "ecommerce" | "clinic" | "infoproduct" | "services" | "general" | string;
  openingHours?: string;
  address?: string;
  cancellationPolicy?: string;
  paymentMethods?: string;
  generalRules?: string;
  objections?: AiObjections;
  ctaRule?: boolean;
  emojiDensity?: "sober" | "moderate" | "expressive";
  [key: string]: any;
}


export interface AiAgentConfig {
  enabled: boolean;
  name: string;
  systemPrompt: string;
  personality: "cordial_comercial" | "direto_objetivo" | "especialista_consultivo" | "empatico_acolhedor";
  provider?: "nvidia" | "openrouter";
  model?: string;
  apiKey?: string;
  hasCustomApiKey?: boolean;
  skills: {
    qualify_lead?: boolean;
    catalog_offers?: boolean;
    pix_charges?: boolean;
    appointments?: boolean;
    capi_tracking?: boolean;
    [key: string]: boolean | undefined;
  };
  businessRules?: AiBusinessRules;
  faq?: AiFaqItem[];
  strictMode?: boolean;
  temperature?: number;
}

export interface AiSimulationResult {
  success: boolean;
  replyText: string;
  needsHandoff: boolean;
  handoffReason: string | null;
  matchedCatalogCount: number;
  groundedRulesCount?: number;
  groundedFaqCount?: number;
  isCustomPromptUsed?: boolean;
  strictMode: boolean;
  provider: "nvidia" | "openrouter";
  model: string;
  latencyMs: number;
}

export interface OutboundWebhookSubscription {
  id: string;
  workspace_id: string;
  url: string;
  secret: string;
  description: string | null;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookTestResult {
  success: boolean;
  status: "delivered" | "failed";
  statusCode: number | null;
  durationMs: number;
  responseBody: string | null;
  errorMessage: string | null;
}

export const apiClient = new ApiClient();

