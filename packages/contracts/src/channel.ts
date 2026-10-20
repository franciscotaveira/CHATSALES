import { z } from "zod";
import {
  ChannelProviderEnum,
  MessageContentTypeEnum,
  MessageDirectionEnum,
} from "./inbound";

export const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;
export const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

export const MessageDeliveryStatusEnum = z.enum([
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
]);
export type MessageDeliveryStatus = z.infer<typeof MessageDeliveryStatusEnum>;

export const DELIVERY_STATUS_RANK: Record<MessageDeliveryStatus, number> = {
  queued: 0,
  sent: 10,
  delivered: 20,
  read: 30,
  failed: -1,
};

export const InboundMessageEventSchema = z.object({
  channelInstanceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  provider: ChannelProviderEnum,
  externalMessageId: z.string().min(1),
  senderPhoneE164: z.string().regex(E164_PHONE_REGEX),
  recipientPhoneE164: z.string().regex(E164_PHONE_REGEX),
  contentType: MessageContentTypeEnum,
  body: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  timestamp: z.string().datetime(),
  rawPayloadHash: z.string().regex(SHA256_HEX_REGEX),
  metadata: z.record(z.unknown()).optional(),
});
export type InboundMessageEvent = z.infer<typeof InboundMessageEventSchema>;

export const DeliveryStatusEventSchema = z.object({
  channelInstanceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  provider: ChannelProviderEnum,
  externalMessageId: z.string().min(1),
  externalEventId: z.string().min(1),
  recipientPhoneE164: z.string().regex(E164_PHONE_REGEX),
  status: MessageDeliveryStatusEnum,
  timestamp: z.string().datetime(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  rawPayloadHash: z.string().regex(SHA256_HEX_REGEX),
});
export type DeliveryStatusEvent = z.infer<typeof DeliveryStatusEventSchema>;

export const ChannelLifecycleEventTypeEnum = z.enum([
  "connected",
  "disconnected",
  "qr_received",
  "auth_failure",
]);
export type ChannelLifecycleEventType = z.infer<
  typeof ChannelLifecycleEventTypeEnum
>;

export const ChannelLifecycleEventSchema = z.object({
  channelInstanceId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  provider: ChannelProviderEnum,
  eventType: ChannelLifecycleEventTypeEnum,
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});
export type ChannelLifecycleEvent = z.infer<typeof ChannelLifecycleEventSchema>;

export const NormalizedInboundEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("message"),
    event: InboundMessageEventSchema,
  }),
  z.object({
    kind: z.literal("delivery_status"),
    event: DeliveryStatusEventSchema,
  }),
  z.object({
    kind: z.literal("lifecycle"),
    event: ChannelLifecycleEventSchema,
  }),
]);
export type NormalizedInboundEvent = z.infer<typeof NormalizedInboundEventSchema>;

export const OutboundCommandStatusEnum = z.enum([
  "pending",
  "processing",
  "sent",
  "failed",
  "dead_letter",
  "reconciliation_required",
]);
export type OutboundCommandStatus = z.infer<typeof OutboundCommandStatusEnum>;

export const WabaTemplateComponentSchema = z.object({
  type: z.enum(["header", "body", "button"]),
  parameters: z.array(z.record(z.unknown())).optional(),
  sub_type: z.string().optional(),
  index: z.number().optional(),
});
export type WabaTemplateComponent = z.infer<typeof WabaTemplateComponentSchema>;

export const WabaTemplateMessageSchema = z.object({
  name: z.string().min(1),
  language: z.string().min(2),
  components: z.array(WabaTemplateComponentSchema).optional(),
});
export type WabaTemplateMessage = z.infer<typeof WabaTemplateMessageSchema>;

export const WabaFlowActionParametersSchema = z.object({
  flow_message_version: z.string().default("3"),
  flow_token: z.string().min(1),
  flow_id: z.string().min(1),
  flow_cta: z.string().min(1).max(40),
  flow_action: z.enum(["navigate", "data_exchange"]).default("navigate"),
  flow_action_payload: z
    .object({
      screen: z.string().min(1),
      data: z.record(z.unknown()).optional(),
    })
    .optional(),
});
export type WabaFlowActionParameters = z.infer<typeof WabaFlowActionParametersSchema>;

export const WabaInteractiveMessageSchema = z.object({
  type: z.enum([
    "flow",
    "button",
    "list",
    "product",
    "product_list",
    "catalog_message",
  ]),
  header: z
    .object({
      type: z.enum(["text", "image", "video", "document"]).default("text"),
      text: z.string().max(60).optional(),
    })
    .optional(),
  body: z.object({
    text: z.string().min(1).max(1024),
  }),
  footer: z
    .object({
      text: z.string().max(60),
    })
    .optional(),
  action: z.record(z.unknown()),
});
export type WabaInteractiveMessage = z.infer<typeof WabaInteractiveMessageSchema>;

export const OutboundChannelCommandSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  channelInstanceId: z.string().uuid(),
  messageId: z.string().uuid(),
  recipientPhoneE164: z.string().regex(E164_PHONE_REGEX),
  body: z.string().min(1),
  mediaUrl: z.string().url().optional(),
  template: WabaTemplateMessageSchema.optional(),
  interactive: WabaInteractiveMessageSchema.optional(),
  idempotencyKey: z.string().min(1),
  payloadFingerprint: z.string().regex(SHA256_HEX_REGEX).nullable().optional(),
  status: OutboundCommandStatusEnum,
  retryCount: z.number().int().min(0),
  maxRetries: z.number().int().min(0),
  nextAttemptAt: z.string().datetime(),
  externalMessageId: z.string().nullable().optional(),
  sentAt: z.string().datetime().nullable().optional(),
  leaseUntil: z.string().datetime().nullable().optional(),
  leaseToken: z.string().uuid().nullable().optional(),
  workerId: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type OutboundChannelCommand = z.infer<typeof OutboundChannelCommandSchema>;

/**
 * Public outbound dispatch request schema.
 * Strict: rejects any unauthorized or injected authority fields (workspaceId, actorId, role, permissions) with HTTP 400.
 */
export const PublicOutboundRequestSchema = z
  .object({
    recipientPhoneE164: z
      .string()
      .regex(E164_PHONE_REGEX, "E.164 phone format required (e.g. +5511999998888)"),
    contentType: z.enum(["text", "image", "audio", "video", "document", "template", "interactive"]),
    body: z.string().min(1).max(4096),
    mediaUrl: z.string().url().optional(),
    template: WabaTemplateMessageSchema.optional(),
    interactive: WabaInteractiveMessageSchema.optional(),
    metadata: z.record(z.unknown()).optional(),
    idempotencyKey: z
      .string()
      .min(1)
      .max(128)
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "idempotencyKey must be alphanumeric with dashes or underscores"
      ),
  })
  .strict();
export type PublicOutboundRequest = z.infer<typeof PublicOutboundRequestSchema>;

/**
 * Trusted server-side outbound context derived strictly from JWT, route params, and RBAC authorization.
 */
export const TrustedOutboundContextSchema = z.object({
  workspaceId: z.string().uuid(),
  channelInstanceId: z.string().uuid(),
  actorId: z.string().uuid(),
  role: z.enum(["owner", "admin", "manager", "operator"]),
  permissions: z.array(z.string()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type TrustedOutboundContext = z.infer<typeof TrustedOutboundContextSchema>;

/**
 * Canonical produce outbound output schema returned by the transactional producer.
 */
export const ProduceOutboundOutputSchema = z.object({
  messageId: z.string().uuid(),
  commandId: z.string().uuid(),
  threadId: z.string().uuid(),
  contactId: z.string().uuid(),
  idempotencyKey: z.string(),
  status: OutboundCommandStatusEnum,
  deliveryStatus: MessageDeliveryStatusEnum,
  isIdempotentReplay: z.boolean(),
  createdAt: z.string().datetime(),
});
export type ProduceOutboundOutput = z.infer<typeof ProduceOutboundOutputSchema>;


export const ChannelDeliveryReceiptSchema = z.object({
  externalMessageId: z.string().min(1),
  status: z.enum(["sent", "failed"]),
  timestamp: z.string().datetime(),
  error: z.string().optional(),
});
export type ChannelDeliveryReceipt = z.infer<typeof ChannelDeliveryReceiptSchema>;

export const MessageSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  channelInstanceId: z.string().uuid(),
  threadId: z.string().uuid(),
  provider: ChannelProviderEnum,
  direction: MessageDirectionEnum,
  senderE164: z.string().regex(E164_PHONE_REGEX),
  recipientE164: z.string().regex(E164_PHONE_REGEX),
  contentType: MessageContentTypeEnum,
  body: z.string().nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
  providerMessageId: z.string().nullable().optional(),
  deliveryStatus: MessageDeliveryStatusEnum.or(z.literal("unknown")).default("queued"),
  statusRank: z.number().int().default(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Message = z.infer<typeof MessageSchema>;

/**
 * Meta Graph API Governance Constants (October 2026 Platform Standard)
 */
export const META_GRAPH_API_VERSION = "v26.0";
export const META_GRAPH_API_ALLOWED_VERSIONS = ["v25.0", "v26.0"] as const;
export type MetaGraphApiVersion = (typeof META_GRAPH_API_ALLOWED_VERSIONS)[number];
