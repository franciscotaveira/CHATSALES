import {
  type NormalizedInboundEvent,
  type MessageContentType,
  type MessageDeliveryStatus,
  InboundMessageEventSchema,
  DeliveryStatusEventSchema,
} from "@sos-sales/contracts";
import type { ChannelInboundContext } from "../../ports/channel-gateway.port";

export class WabaMetadataMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WabaMetadataMissingError";
  }
}

export class WabaUnknownStatusError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WabaUnknownStatusError";
  }
}

export class WabaInvalidFieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WabaInvalidFieldError";
  }
}

function formatToE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `+${digits}`;
}

function resolveTimestamp(
  rawTimestamp: unknown,
  context: ChannelInboundContext
): { iso: string; epochSec: number } {
  if (rawTimestamp !== undefined && rawTimestamp !== null && rawTimestamp !== "") {
    const num = Number(rawTimestamp);
    if (!isNaN(num) && num > 0) {
      // In Meta Cloud API timestamps are Unix epoch seconds
      const date = new Date(num * 1000);
      if (!isNaN(date.getTime())) {
        return { iso: date.toISOString(), epochSec: num };
      }
    }
    const date = new Date(String(rawTimestamp));
    if (!isNaN(date.getTime())) {
      return {
        iso: date.toISOString(),
        epochSec: Math.floor(date.getTime() / 1000),
      };
    }
  }

  if (context.receivedAt) {
    const date = new Date(context.receivedAt);
    if (!isNaN(date.getTime())) {
      return {
        iso: date.toISOString(),
        epochSec: Math.floor(date.getTime() / 1000),
      };
    }
  }

  throw new WabaInvalidFieldError(
    "WABA_NORMALIZATION_ERROR: Missing or invalid timestamp in payload and no explicit receivedAt provided"
  );
}

/**
 * Pure, deterministic batch normalizer for Meta Cloud API (WABA) webhooks.
 *
 * Truth in Data guarantees:
 * - Uses rawPayloadHash provided directly from rawBody ingress context (zero JSON.stringify recalculations).
 * - Requires authentic metadata (phone_number_id and display_phone_number); never invents fake phone numbers.
 * - Rejects unknown or unmapped delivery statuses; never defaults to 'sent'.
 * - Validates non-empty IDs, E.164 phone numbers, and timestamps.
 * - Processes all entries, changes, messages, and statuses without discarding any event.
 */
export class WabaWebhookNormalizer {
  static normalize(
    rawPayload: Record<string, unknown>,
    context: ChannelInboundContext
  ): NormalizedInboundEvent[] {
    if (
      !context.rawPayloadHash ||
      !/^[0-9a-f]{64}$/.test(context.rawPayloadHash)
    ) {
      throw new WabaInvalidFieldError(
        "WABA_NORMALIZATION_ERROR: ChannelInboundContext.rawPayloadHash must be a 64-character lowercase hex string"
      );
    }

    const rawPayloadHash = context.rawPayloadHash;
    const events: NormalizedInboundEvent[] = [];

    const entries = Array.isArray(rawPayload.entry)
      ? (rawPayload.entry as Record<string, unknown>[])
      : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes)
        ? (entry.changes as Record<string, unknown>[])
        : [];

      for (const change of changes) {
        const value =
          change && typeof change.value === "object"
            ? (change.value as Record<string, unknown>)
            : null;

        if (!value) continue;

        const metadata = value.metadata as Record<string, unknown> | undefined;

        // Check metadata strictly when messages or statuses are processed
        const hasStatuses = Array.isArray(value.statuses) && value.statuses.length > 0;
        const hasMessages = Array.isArray(value.messages) && value.messages.length > 0;

        if (hasStatuses || hasMessages) {
          if (
            !metadata ||
            !metadata.phone_number_id ||
            !metadata.display_phone_number ||
            String(metadata.phone_number_id).trim() === "" ||
            String(metadata.display_phone_number).trim() === ""
          ) {
            throw new WabaMetadataMissingError(
              "WABA_NORMALIZATION_ERROR: Missing or empty required metadata (display_phone_number or phone_number_id)"
            );
          }
        }

        const businessPhone = metadata?.display_phone_number
          ? formatToE164(String(metadata.display_phone_number))
          : "";

        if (hasMessages && (!businessPhone || businessPhone === "+")) {
          throw new WabaInvalidFieldError(
            "WABA_NORMALIZATION_ERROR: Invalid business display_phone_number in metadata"
          );
        }

        // 1. Process All Status Events in this change
        if (hasStatuses) {
          const statuses = value.statuses as Record<string, unknown>[];
          for (const statusObj of statuses) {
            const externalMessageId = String(statusObj.id || "").trim();
            if (!externalMessageId) {
              throw new WabaInvalidFieldError(
                "WABA_NORMALIZATION_ERROR: Missing or empty externalMessageId in status"
              );
            }

            const rawRecipientId = String(statusObj.recipient_id || "").trim();
            if (!rawRecipientId) {
              throw new WabaInvalidFieldError(
                "WABA_NORMALIZATION_ERROR: Missing or empty recipient_id in status"
              );
            }

            const recipientPhoneE164 = formatToE164(rawRecipientId);
            if (!recipientPhoneE164 || recipientPhoneE164 === "+") {
              throw new WabaInvalidFieldError(
                "WABA_NORMALIZATION_ERROR: Invalid recipient_id phone number in status"
              );
            }

            const statusRaw = String(statusObj.status || "").toLowerCase().trim();
            if (
              statusRaw !== "sent" &&
              statusRaw !== "delivered" &&
              statusRaw !== "read" &&
              statusRaw !== "failed"
            ) {
              throw new WabaUnknownStatusError(
                `WABA_NORMALIZATION_ERROR: Unknown or unsupported WABA status '${statusObj.status}'`
              );
            }
            const status: MessageDeliveryStatus = statusRaw;

            const { iso: timestamp, epochSec } = resolveTimestamp(
              statusObj.timestamp,
              context
            );

            // Rule: Versioned external_event_id derivation for deduplication
            const externalEventId = `v1:waba:${externalMessageId}:${status}:${epochSec}`;

            let errorCode: string | undefined;
            let errorMessage: string | undefined;

            if (Array.isArray(statusObj.errors) && statusObj.errors.length > 0) {
              const err = statusObj.errors[0] as Record<string, unknown>;
              errorCode = err.code ? String(err.code) : undefined;
              errorMessage = err.message ? String(err.message) : undefined;
            }

            const parsedEvent = DeliveryStatusEventSchema.parse({
              channelInstanceId: context.channelInstanceId,
              workspaceId: context.workspaceId,
              provider: "meta_waba",
              externalMessageId,
              externalEventId,
              recipientPhoneE164,
              status,
              timestamp,
              errorCode,
              errorMessage,
              rawPayloadHash,
            });

            events.push({
              kind: "delivery_status",
              event: parsedEvent,
            });
          }
        }

        // 2. Process All Inbound Messages in this change
        if (hasMessages) {
          const messages = value.messages as Record<string, unknown>[];
          for (const msgObj of messages) {
            const externalMessageId = String(msgObj.id || "").trim();
            if (!externalMessageId) {
              throw new WabaInvalidFieldError(
                "WABA_NORMALIZATION_ERROR: Missing or empty externalMessageId in message"
              );
            }

            const rawFrom = String(msgObj.from || "").trim();
            if (!rawFrom) {
              throw new WabaInvalidFieldError(
                "WABA_NORMALIZATION_ERROR: Missing or empty from in message"
              );
            }

            const senderPhoneE164 = formatToE164(rawFrom);
            if (!senderPhoneE164 || senderPhoneE164 === "+") {
              throw new WabaInvalidFieldError(
                "WABA_NORMALIZATION_ERROR: Invalid sender phone number in message"
              );
            }

            const recipientPhoneE164 = businessPhone;

            const { iso: timestamp } = resolveTimestamp(
              msgObj.timestamp,
              context
            );

            const rawType = String(msgObj.type || "text").toLowerCase();
            let contentType: MessageContentType = "text";
            let body: string | undefined;
            let mediaUrl: string | undefined;
            let mediaId: string | undefined;
            let mimeType: string | undefined;
            let fileSha256: string | undefined;
            let filename: string | undefined;
            let interactiveMetadata: Record<string, unknown> | undefined;

            if (
              rawType === "text" &&
              msgObj.text &&
              typeof msgObj.text === "object"
            ) {
              contentType = "text";
              body = String((msgObj.text as Record<string, unknown>).body || "");
            } else if (rawType === "image") {
              contentType = "image";
              const img = msgObj.image as Record<string, unknown> | undefined;
              body = img?.caption ? String(img.caption) : undefined;
              mediaId = img?.id ? String(img.id) : undefined;
              mimeType = img?.mime_type ? String(img.mime_type) : undefined;
              fileSha256 = img?.sha256 ? String(img.sha256) : undefined;
            } else if (rawType === "audio" || rawType === "voice") {
              contentType = "audio";
              const aud = (msgObj.audio || msgObj.voice) as Record<string, unknown> | undefined;
              mediaId = aud?.id ? String(aud.id) : undefined;
              mimeType = aud?.mime_type ? String(aud.mime_type) : undefined;
              fileSha256 = aud?.sha256 ? String(aud.sha256) : undefined;
            } else if (rawType === "video") {
              contentType = "video";
              const vid = msgObj.video as Record<string, unknown> | undefined;
              body = vid?.caption ? String(vid.caption) : undefined;
              mediaId = vid?.id ? String(vid.id) : undefined;
              mimeType = vid?.mime_type ? String(vid.mime_type) : undefined;
              fileSha256 = vid?.sha256 ? String(vid.sha256) : undefined;
            } else if (rawType === "document") {
              contentType = "document";
              const doc = msgObj.document as Record<string, unknown> | undefined;
              body = doc?.caption ? String(doc.caption) : undefined;
              filename = doc?.filename ? String(doc.filename) : undefined;
              mediaId = doc?.id ? String(doc.id) : undefined;
              mimeType = doc?.mime_type ? String(doc.mime_type) : undefined;
              fileSha256 = doc?.sha256 ? String(doc.sha256) : undefined;
            } else if (rawType === "interactive") {
              contentType = "interactive";
              const interactive = msgObj.interactive as Record<string, unknown> | undefined;
              const interactiveType = interactive?.type ? String(interactive.type) : undefined;
              if (interactiveType === "button_reply") {
                const reply = interactive?.button_reply as Record<string, unknown> | undefined;
                body = reply?.title ? String(reply.title) : undefined;
                interactiveMetadata = {
                  interactiveType: "button_reply",
                  buttonId: reply?.id ? String(reply.id) : undefined,
                };
              } else if (interactiveType === "list_reply") {
                const reply = interactive?.list_reply as Record<string, unknown> | undefined;
                body = reply?.title ? String(reply.title) : undefined;
                interactiveMetadata = {
                  interactiveType: "list_reply",
                  listRowId: reply?.id ? String(reply.id) : undefined,
                  ...(reply?.description ? { description: String(reply.description) } : {}),
                };
              } else if (interactiveType === "nfm_reply") {
                const reply = interactive?.nfm_reply as Record<string, unknown> | undefined;
                let summary = "📋 Formulário Respondido:";
                let parsedResponse: Record<string, unknown> = {};
                if (reply?.response_json) {
                  try {
                    parsedResponse =
                      typeof reply.response_json === "string"
                        ? JSON.parse(reply.response_json)
                        : (reply.response_json as Record<string, unknown>);
                    for (const [key, val] of Object.entries(parsedResponse)) {
                      if (key === "flow_token") continue;
                      const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                      summary += `\n• ${label}: ${String(val)}`;
                    }
                  } catch {
                    summary = reply?.body ? String(reply.body) : "📋 Formulário Respondido";
                  }
                } else if (reply?.body) {
                  summary = String(reply.body);
                }
                body = summary;
                interactiveMetadata = {
                  interactiveType: "nfm_reply",
                  flowName: reply?.name ? String(reply.name) : undefined,
                  response: parsedResponse,
                };
              }
            } else if (rawType === "order") {
              contentType = "interactive";
              const order = msgObj.order as Record<string, unknown> | undefined;
              const productItems = (order?.product_items as Array<Record<string, unknown>>) || [];
              let summary = "🛍️ Pedido Enviado pelo Cliente (Catálogo):";
              if (order?.text) {
                summary += `\n"${String(order.text)}"`;
              }
              let totalAmount = 0;
              let currency = "BRL";
              for (const item of productItems) {
                const sku = String(item.product_retailer_id || "Item");
                const qty = Number(item.quantity || 1);
                const price = Number(item.item_price || 0);
                currency = String(item.currency || "BRL");
                totalAmount += price * qty;
                summary += `\n• ${sku} (x${qty}) — ${currency} ${price.toFixed(2)}`;
              }
              if (productItems.length > 0) {
                summary += `\nTotal: ${currency} ${totalAmount.toFixed(2)}`;
              }
              body = summary;
              interactiveMetadata = {
                interactiveType: "order",
                catalogId: order?.catalog_id ? String(order.catalog_id) : undefined,
                productItems,
                totalAmount,
                currency,
              };
            }

            let contactName: string | undefined;
            let bsuid: string | undefined;
            let username: string | undefined;
            if (Array.isArray(value.contacts)) {
              const matchingContact = (
                value.contacts as Array<{
                  wa_id?: string;
                  user_id?: string;
                  bsuid?: string;
                  username?: string;
                  profile?: { name?: string };
                }>
              ).find(
                (c) =>
                  c.wa_id === rawFrom ||
                  (c.wa_id && formatToE164(c.wa_id) === senderPhoneE164)
              );
              contactName = matchingContact?.profile?.name;
              bsuid = matchingContact?.bsuid || matchingContact?.user_id;
              username = matchingContact?.username;
            }

            const rawReferral = msgObj.referral as Record<string, unknown> | undefined;
            let referralData: Record<string, unknown> | undefined;
            let ctwaClid: string | undefined;
            if (rawReferral && typeof rawReferral === "object") {
              const rawClid = rawReferral.ctwa_clid;
              if (typeof rawClid === "string" && rawClid.trim().length > 0) {
                ctwaClid = rawClid.trim();
              }
              referralData = {
                ...(rawReferral.source_url ? { sourceUrl: String(rawReferral.source_url) } : {}),
                ...(rawReferral.source_id ? { sourceId: String(rawReferral.source_id) } : {}),
                ...(rawReferral.source_type ? { sourceType: String(rawReferral.source_type) } : {}),
                ...(rawReferral.headline ? { headline: String(rawReferral.headline) } : {}),
                ...(rawReferral.body ? { body: String(rawReferral.body) } : {}),
                ...(rawReferral.media_type ? { mediaType: String(rawReferral.media_type) } : {}),
                ...(rawReferral.image_url ? { imageUrl: String(rawReferral.image_url) } : {}),
                ...(rawReferral.video_url ? { videoUrl: String(rawReferral.video_url) } : {}),
                ...(rawReferral.thumbnail_url ? { thumbnailUrl: String(rawReferral.thumbnail_url) } : {}),
                ...(ctwaClid ? { ctwaClid } : {}),
              };
            }

            const parsedEvent = InboundMessageEventSchema.parse({
              channelInstanceId: context.channelInstanceId,
              workspaceId: context.workspaceId,
              provider: "meta_waba",
              externalMessageId,
              senderPhoneE164,
              recipientPhoneE164,
              contentType,
              body,
              mediaUrl,
              timestamp,
              rawPayloadHash,
              metadata: {
                wabaPhoneNumberId: metadata?.phone_number_id,
                ...(typeof (msgObj.context as Record<string,unknown> | undefined)?.id === "string" ? { replyToProviderMessageId: (msgObj.context as Record<string,unknown>).id } : {}),
                ...(contactName ? { contactName } : {}),
                ...(bsuid ? { bsuid } : {}),
                ...(username ? { username } : {}),
                ...(mediaId ? { mediaId } : {}),
                ...(mimeType ? { mimeType } : {}),
                ...(fileSha256 ? { fileSha256 } : {}),
                ...(filename ? { filename } : {}),
                ...(interactiveMetadata ? interactiveMetadata : {}),
                ...(referralData ? { referral: referralData } : {}),
                ...(ctwaClid ? { ctwaClid } : {}),
              },
            });

            events.push({
              kind: "message",
              event: parsedEvent,
            });
          }
        }
      }
    }

    return events;
  }

  static normalizeBatch = WabaWebhookNormalizer.normalize;
}
