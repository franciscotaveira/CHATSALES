import {
  type NormalizedInboundEvent,
  type MessageContentType,
  type MessageDeliveryStatus,
  type ChannelLifecycleEventType,
  InboundMessageEventSchema,
  DeliveryStatusEventSchema,
  ChannelLifecycleEventSchema,
} from "@sos-sales/contracts";
import type { ChannelInboundContext } from "../../ports/channel-gateway.port";
import { detectMediaType } from "../security/ssrf-guard";

export class WahaNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WahaNormalizationError";
  }
}

function jidToE164(jid: string): string {
  const clean = jid.split("@")[0] || jid;
  const digits = clean.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function isValidPhoneE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

function resolveTimestamp(
  rawTimestamp: unknown,
  context: ChannelInboundContext
): { iso: string; epochSec: number } {
  if (rawTimestamp !== undefined && rawTimestamp !== null && rawTimestamp !== "") {
    const num = Number(rawTimestamp);
    if (!isNaN(num) && num > 0) {
      const timeMs = num > 1e11 ? num : num * 1000;
      const date = new Date(timeMs);
      if (!isNaN(date.getTime())) {
        return { iso: date.toISOString(), epochSec: Math.floor(timeMs / 1000) };
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

  const now = new Date();
  return {
    iso: now.toISOString(),
    epochSec: Math.floor(now.getTime() / 1000),
  };
}

/**
 * Pure, deterministic normalizer for WAHA (WhatsApp HTTP API) webhooks.
 *
 * Truth in Data guarantees:
 * - Uses rawPayloadHash provided directly from rawBody ingress context.
 * - Rejects empty IDs, invalid phone numbers, or missing event payloads.
 * - Completely deterministic: no Date.now() fallback, no network, database or secrets involved.
 */
export class WahaWebhookNormalizer {
  static normalize(
    rawPayload: Record<string, unknown>,
    context: ChannelInboundContext
  ): NormalizedInboundEvent[] {
    if (
      !context.rawPayloadHash ||
      !/^[0-9a-f]{64}$/.test(context.rawPayloadHash)
    ) {
      throw new WahaNormalizationError(
        "WAHA_NORMALIZATION_ERROR: ChannelInboundContext.rawPayloadHash must be a 64-character lowercase hex string"
      );
    }

    const rawPayloadHash = context.rawPayloadHash;
    const eventType = String(rawPayload.event || "").trim();
    const payload = rawPayload.payload as Record<string, unknown> | undefined;

    if (!payload || typeof payload !== "object") {
      throw new WahaNormalizationError(
        "WAHA_NORMALIZATION_ERROR: Missing payload object in event"
      );
    }

    // 1. Process ACK (Delivery Status) Event
    if (eventType === "message.ack") {
      const externalMessageId = String(payload.id || "").trim();
      if (!externalMessageId) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty payload.id in message.ack"
        );
      }

      const rawTo = String(payload.to || "").trim();
      if (!rawTo || rawTo.includes("@broadcast") || rawTo.includes("@g.us")) {
        return [];
      }

      const recipientPhoneE164 = jidToE164(rawTo);
      if (!isValidPhoneE164(recipientPhoneE164)) {
        return [];
      }

      const ackValue = Number(payload.ack);
      if (isNaN(ackValue)) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Invalid or non-numeric ack value in message.ack"
        );
      }

      let status: MessageDeliveryStatus = "sent";
      if (ackValue === 2) {
        status = "delivered";
      } else if (ackValue >= 3) {
        status = "read";
      } else if (ackValue < 0) {
        status = "failed";
      }

      const { iso: timestamp, epochSec } = resolveTimestamp(
        payload.timestamp ?? rawPayload.timestamp,
        context
      );

      // Rule: Versioned external_event_id derivation for deduplication
      const externalEventId = `v1:waha:${externalMessageId}:${ackValue}:${epochSec}`;

      const event = DeliveryStatusEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        externalMessageId,
        externalEventId,
        recipientPhoneE164,
        status,
        timestamp,
        rawPayloadHash,
      });

      return [
        {
          kind: "delivery_status",
          event,
        },
      ];
    }

    // 2. Process Message Event (supports both 'message' and 'message.any')
    if (eventType === "message" || eventType === "message.any") {
      const externalMessageId = String(payload.id || "").trim();
      if (!externalMessageId) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty payload.id in message"
        );
      }

      const rawData = (payload._data && typeof payload._data === "object") ? (payload._data as Record<string, unknown>) : undefined;
      const rawInfo = (rawData?.Info && typeof rawData.Info === "object") ? (rawData.Info as Record<string, unknown>) : undefined;
      const rawMsg = (rawData?.Message && typeof rawData.Message === "object") ? (rawData.Message as Record<string, unknown>) : undefined;

      const rawChat = String(rawInfo?.Chat || "").trim();
      let rawFrom = String(payload.from || rawInfo?.Sender || "").trim();
      let rawTo = String(payload.to || rawInfo?.Recipient || "").trim();

      if (
        rawFrom.includes("@broadcast") ||
        rawTo.includes("@broadcast") ||
        rawChat.includes("@g.us") ||
        rawFrom.includes("@g.us") ||
        rawTo.includes("@g.us")
      ) {
        return [];
      }

      const fromMe = Boolean(payload.fromMe ?? rawInfo?.IsFromMe);

      // In WAHA inbound messages, payload.to is often null/empty; resolve from me.id or me.jid
      const meObj = (rawPayload.me && typeof rawPayload.me === "object") ? (rawPayload.me as Record<string, unknown>) : undefined;
      const meJid = String(meObj?.id || meObj?.jid || "").trim();

      if (!rawTo && !fromMe && meJid) {
        rawTo = meJid;
      }
      if (!rawFrom && fromMe && meJid) {
        rawFrom = meJid;
      }

      // Handle WhatsApp LID (privacy pseudo-JIDs, e.g. 271635491872968@lid)
      const senderAlt = String(rawInfo?.SenderAlt || "").trim();
      if (rawFrom.includes("@lid") && senderAlt) {
        rawFrom = senderAlt;
      }

      const recipientAlt = String(rawInfo?.RecipientAlt || "").trim();
      if (rawTo.includes("@lid") && recipientAlt) {
        rawTo = recipientAlt;
      } else if (rawTo.includes("@lid") && !fromMe && meJid) {
        rawTo = meJid;
      }

      const senderPhoneE164 = jidToE164(rawFrom);
      const recipientPhoneE164 = jidToE164(rawTo);
      if (!isValidPhoneE164(senderPhoneE164) || !isValidPhoneE164(recipientPhoneE164)) {
        return [];
      }

      const { iso: timestamp } = resolveTimestamp(payload.timestamp ?? rawPayload.timestamp, context);

      let contentType: MessageContentType = "text";
      const body: string | undefined = payload.body
        ? String(payload.body)
        : undefined;

      const mediaObj = (payload.media && typeof payload.media === "object") ? (payload.media as Record<string, unknown>) : null;
      const mediaUrl: string | undefined = payload.mediaUrl
        ? String(payload.mediaUrl)
        : mediaObj?.url
        ? String(mediaObj.url)
        : undefined;

      const rawMsgType = String(rawInfo?.MediaType || rawData?.type || payload.type || "").toLowerCase();
      const hasMediaFlag = Boolean(
        payload.hasMedia ||
        mediaUrl ||
        rawMsg?.imageMessage ||
        rawMsg?.audioMessage ||
        rawMsg?.videoMessage ||
        rawMsg?.documentMessage ||
        rawMsg?.stickerMessage ||
        rawMsgType === "media" ||
        rawMsgType === "image" ||
        rawMsgType === "audio" ||
        rawMsgType === "ptt" ||
        rawMsgType === "video" ||
        rawMsgType === "document"
      );

      const mediaMime = String(
        mediaObj?.mimetype ||
        mediaObj?.mimeType ||
        rawData?.mimetype ||
        (rawMsg?.audioMessage as Record<string, unknown> | undefined)?.mimetype ||
        (rawMsg?.imageMessage as Record<string, unknown> | undefined)?.mimetype ||
        (rawMsg?.videoMessage as Record<string, unknown> | undefined)?.mimetype ||
        (rawMsg?.documentMessage as Record<string, unknown> | undefined)?.mimetype ||
        ""
      ).toLowerCase();

      const mediaFilename = String(
        mediaObj?.filename ||
        (rawMsg?.documentMessage as Record<string, unknown> | undefined)?.fileName ||
        (rawMsg?.documentMessage as Record<string, unknown> | undefined)?.title ||
        ""
      ).trim() || undefined;

      if (hasMediaFlag) {
        if (
          rawMsgType === "audio" ||
          rawMsgType === "ptt" ||
          rawMsg?.audioMessage ||
          mediaMime.startsWith("audio/")
        ) {
          contentType = "audio";
        } else if (
          rawMsgType === "video" ||
          rawMsg?.videoMessage ||
          mediaMime.startsWith("video/")
        ) {
          contentType = "video";
        } else if (
          rawMsgType === "document" ||
          rawMsg?.documentMessage ||
          mediaMime.includes("pdf") ||
          mediaMime.includes("document") ||
          mediaMime.includes("sheet") ||
          mediaMime.includes("msword")
        ) {
          contentType = "document";
        } else if (
          rawMsgType === "image" ||
          rawMsgType === "sticker" ||
          rawMsg?.imageMessage ||
          rawMsg?.stickerMessage ||
          mediaMime.startsWith("image/")
        ) {
          contentType = "image";
        } else if (mediaUrl) {
          contentType = detectMediaType(mediaUrl);
        } else {
          contentType = "image";
        }
      }

      const contactName = !fromMe && typeof rawData?.notifyName === "string"
        ? (rawData.notifyName as string).trim()
        : !fromMe && typeof rawInfo?.PushName === "string"
        ? (rawInfo.PushName as string).trim()
        : undefined;

      const event = InboundMessageEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        externalMessageId,
        senderPhoneE164,
        recipientPhoneE164,
        contentType,
        body,
        mediaUrl,
        timestamp,
        rawPayloadHash,
        metadata: {
          direction: fromMe ? "outbound" : "inbound",
          fromMe,
          wahaSession: payload.session ?? rawPayload.session,
          ...(typeof (payload.replyTo as Record<string,unknown> | undefined)?.id === "string" ? { replyToProviderMessageId: (payload.replyTo as Record<string,unknown>).id } : {}),
          ...(contactName ? { contactName } : {}),
          ...(mediaFilename ? { filename: mediaFilename } : {}),
          ...(mediaMime ? { mimetype: mediaMime } : {}),
          ...(mediaObj ? { media: mediaObj } : {}),
        },
      });

      return [
        {
          kind: "message",
          event,
        },
      ];
    }

    // 3. Process Session Lifecycle Events
    if (eventType === "session.status") {
      const rawStatus = String(payload.status || "").toUpperCase();
      let eventTypeEnum: ChannelLifecycleEventType | undefined;
      if (rawStatus === "WORKING" || rawStatus === "CONNECTED" || rawStatus === "ONLINE") {
        eventTypeEnum = "connected";
      } else if (
        rawStatus === "STOPPED" ||
        rawStatus === "DISCONNECTED" ||
        rawStatus === "FAILED" ||
        rawStatus === "OFFLINE"
      ) {
        eventTypeEnum = "disconnected";
      } else if (rawStatus === "SCAN_QR_CODE") {
        eventTypeEnum = "qr_received";
      }

      if (eventTypeEnum) {
        const { iso: timestamp } = resolveTimestamp(payload.timestamp ?? rawPayload.timestamp, context);
        const event = ChannelLifecycleEventSchema.parse({
          channelInstanceId: context.channelInstanceId,
          workspaceId: context.workspaceId,
          provider: "waha",
          eventType: eventTypeEnum,
          details: {
            session: payload.name || payload.session,
            rawStatus,
          },
          timestamp,
        });

        return [
          {
            kind: "lifecycle",
            event,
          },
        ];
      }
    }

    if (eventType === "session.qr") {
      const qr = typeof payload.qr === "string" ? payload.qr : undefined;
      if (!qr) {
        throw new WahaNormalizationError(
          "WAHA_NORMALIZATION_ERROR: Missing or empty qr code in session.qr event"
        );
      }

      const { iso: timestamp } = resolveTimestamp(payload.timestamp ?? rawPayload.timestamp, context);
      const event = ChannelLifecycleEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        eventType: "qr_received",
        details: {
          session: payload.name || payload.session,
          qr,
        },
        timestamp,
      });

      return [
        {
          kind: "lifecycle",
          event,
        },
      ];
    }

    if (eventType === "session.auth_failure" || eventType === "session.unpaired") {
      const { iso: timestamp } = resolveTimestamp(payload.timestamp ?? rawPayload.timestamp, context);
      const event = ChannelLifecycleEventSchema.parse({
        channelInstanceId: context.channelInstanceId,
        workspaceId: context.workspaceId,
        provider: "waha",
        eventType: "auth_failure",
        details: {
          session: payload.name || payload.session,
          reason: payload.reason || "session_unpaired",
        },
        timestamp,
      });

      return [
        {
          kind: "lifecycle",
          event,
        },
      ];
    }

    return [];
  }

  static normalizeBatch = WahaWebhookNormalizer.normalize;
}
