import { useState, useMemo, type FC } from "react";
import { Check, CheckCheck, Clock, AlertCircle, FileText, Download, Mic, ExternalLink } from "lucide-react";
import type { ThreadMessageSummary } from "../../../services/api-client";
import { formatTime } from "../utils/formatTime";
import { renderWhatsappMarkdown } from "../utils/whatsappMarkdown";

interface MessageBubbleProps {
  message: ThreadMessageSummary;
}

export const MessageBubble: FC<MessageBubbleProps> = ({ message }) => {
  const isOutbound = message.direction === "outbound";
  const formattedTime = formatTime(message.createdAt);
  const [imgError, setImgError] = useState(false);

  // Extract mediaUrl from message or metadata fallback
  const resolvedMedia = useMemo(() => {
    let url = message.mediaUrl || "";
    let mime = "";
    let filename = "";

    const meta = message.metadata as Record<string, unknown> | undefined;
    if (meta) {
      if (!url) {
        if (meta.mediaId && message.channelInstanceId) {
          url = `/v1/workspaces/${(meta.workspaceId as string) || message.workspaceId || ""}/media/proxy?mediaId=${encodeURIComponent(String(meta.mediaId))}&channelInstanceId=${message.channelInstanceId}`;
        } else if (typeof meta.media_payload === "string") {
          try {
            const parsed = JSON.parse(meta.media_payload);
            url = parsed.url || "";
            mime = parsed.mimetype || "";
          } catch {}
        } else if (typeof meta.media_payload === "object" && meta.media_payload !== null) {
          const mp = meta.media_payload as Record<string, string>;
          url = mp.url || "";
          mime = mp.mimetype || "";
        } else if (typeof (meta as any).media === "object" && (meta as any).media !== null) {
          const m = (meta as any).media;
          url = m.url || "";
          mime = m.mimetype || "";
        } else if (typeof meta.mediaUrl === "string") {
          url = meta.mediaUrl;
        } else if (typeof meta.url === "string") {
          url = meta.url;
        }
      }

      if (!mime) {
        mime = String(meta.mimeType || meta.mimetype || "").toLowerCase();
      }
      if (typeof meta.filename === "string") {
        filename = meta.filename;
      }
    }

    // Rewrite internal WAHA container URLs (e.g. from historical data) to authenticated API proxy
    if (url && (url.includes("waha:3000") || url.includes(":3006") || url.includes("/channels/waha/media-proxy") || (url.includes("/api/files/") && !url.includes("/media/proxy")))) {
      const match = url.match(/\/api\/files\/[a-zA-Z0-9_\-./]+/);
      if (match) {
        const wsId = (meta?.workspaceId as string) || message.workspaceId || "";
        url = `/v1/workspaces/${wsId}/media/proxy?wahaPath=${encodeURIComponent(match[0])}&channelInstanceId=${message.channelInstanceId || ""}`;
      }
    }

    if (url && url.startsWith("/")) {
      url = `${window.location.origin}${url}`;
    }

    // Attach auth token if accessing media proxy so browser audio/img tags don't 401
    if (url && url.includes("/media/proxy") && !url.includes("token=")) {
      const storedToken =
        localStorage.getItem("sos_sales_auth_token") ||
        sessionStorage.getItem("sos_v3_lab_token") ||
        sessionStorage.getItem("sos_sales_auth_token");
      if (storedToken) {
        url = `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(storedToken)}`;
      }
    }

    // Determine media type
    let type: "text" | "image" | "audio" | "video" | "document" =
      message.contentType === "image" ||
      message.contentType === "audio" ||
      message.contentType === "video" ||
      message.contentType === "document"
        ? message.contentType
        : "text";

    if (
      mime.startsWith("audio/") ||
      url.match(/\.(ogg|oga|mp3|m4a|wav|aac|opus|flac|weba)($|\?)/i) ||
      message.contentType === "audio"
    ) {
      type = "audio";
    } else if (
      mime.startsWith("video/") ||
      url.match(/\.(mp4|webm|mov|qt|3gp|mkv|avi)($|\?)/i) ||
      message.contentType === "video"
    ) {
      type = "video";
    } else if (
      mime.startsWith("image/") ||
      url.match(/\.(jpeg|jpg|png|webp|gif|svg)($|\?)/i) ||
      message.contentType === "image"
    ) {
      type = "image";
    } else if (
      mime.includes("pdf") ||
      mime.includes("document") ||
      mime.includes("sheet") ||
      mime.includes("msword") ||
      url.match(/\.(pdf|docx?|xlsx?|txt|zip)($|\?)/i) ||
      message.contentType === "document"
    ) {
      type = "document";
    } else if (url && type === "text") {
      type = "image";
    }

    return { url, type, filename, mime };
  }, [message.mediaUrl, message.contentType, message.metadata]);

  // Check if message body is a filename for an attachment
  const isAttachmentFilename = useMemo(() => {
    if (!message.body) return false;
    const trimmed = message.body.trim();
    return /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|mp3|ogg|oga|mp4|wav)$/i.test(trimmed);
  }, [message.body]);

  // Strip placeholder text when media is present
  const isPlaceholderBody = useMemo(() => {
    if (!message.body) return true;
    const trimmed = message.body.trim();
    return (
      trimmed === "📎 [OTHER]" ||
      trimmed === "📎 [MÍDIA]" ||
      trimmed === "[OTHER]" ||
      trimmed === "[MÍDIA]" ||
      trimmed === "Anexo" ||
      trimmed === "📎"
    );
  }, [message.body]);

  const isAiGenerated = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return Boolean(isOutbound && (meta?.source === "ai_receptionist" || meta?.agentName));
  }, [isOutbound, message.metadata]);

  const aiAgentName = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return (meta?.agentName as string) || "IA Atendente";
  }, [message.metadata]);

  const aiNeedsHandoff = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return Boolean(meta?.needsHandoff);
  }, [message.metadata]);

  const isPixConfirmation = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return meta?.source === "pix_confirmation";
  }, [message.metadata]);

  const hasPixCharge = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return Boolean(meta?.generatedPixChargeId || meta?.chargeId);
  }, [message.metadata]);

  const renderStatus = () => {
    if (!isOutbound) return null;
    switch (message.deliveryStatus) {
      case "read":
        return <span title="Lida"><CheckCheck size={14} style={{ color: "var(--color-action)" }} /></span>;
      case "delivered":
        return <span title="Entregue"><CheckCheck size={14} style={{ color: "var(--text-muted)" }} /></span>;
      case "sent":
        return <span title="Enviada"><Check size={14} style={{ color: "var(--text-muted)" }} /></span>;
      case "failed":
        return <span title="Falha no envio"><AlertCircle size={14} style={{ color: "var(--color-danger)" }} /></span>;
      case "queued":
      default:
        return <span title="Na fila"><Clock size={12} style={{ color: "var(--text-muted)" }} /></span>;
    }
  };

  const renderMediaContent = () => {
    if (!resolvedMedia.url) return null;

    if (resolvedMedia.type === "audio") {
      return (
        <div style={{ marginBottom: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            <Mic size={14} style={{ color: "var(--color-action)" }} />
            <span>Mensagem de Áudio</span>
          </div>
          <audio
            controls
            src={resolvedMedia.url}
            style={{ width: "100%", maxWidth: "280px", height: "36px" }}
            preload="metadata"
          />
        </div>
      );
    }

    if (resolvedMedia.type === "video") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <video
            controls
            src={resolvedMedia.url}
            style={{
              maxWidth: "100%",
              maxHeight: "300px",
              borderRadius: "var(--radius-md, 8px)",
              display: "block",
            }}
          />
        </div>
      );
    }

    if (resolvedMedia.type === "document") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <a
            href={resolvedMedia.url}
            target="_blank"
            rel="noreferrer"
            download={resolvedMedia.filename || "documento"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 12px",
              backgroundColor: "rgba(0, 0, 0, 0.04)",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default)",
              textDecoration: "none",
              color: "inherit",
              maxWidth: "280px",
            }}
          >
            <FileText size={24} style={{ color: "var(--color-action)", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div
                style={{
                  fontSize: "var(--font-size-xs)",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {resolvedMedia.filename || "Documento anexado"}
              </div>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>
                Clique para baixar
              </span>
            </div>
            <Download size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </a>
        </div>
      );
    }

    // Default to Image
    if (!imgError) {
      return (
        <div style={{ marginBottom: "6px" }}>
          <img
            src={resolvedMedia.url}
            alt="Foto recebida"
            onError={() => setImgError(true)}
            onClick={() => window.open(resolvedMedia.url, "_blank")}
            style={{
              maxWidth: "100%",
              maxHeight: "300px",
              borderRadius: "var(--radius-md, 8px)",
              objectFit: "cover",
              display: "block",
              cursor: "pointer",
            }}
          />
        </div>
      );
    }

    return (
      <div
        style={{
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 10px",
          backgroundColor: "rgba(0, 0, 0, 0.03)",
          borderRadius: "6px",
          fontSize: "var(--font-size-xs)",
        }}
      >
        <ExternalLink size={14} />
        <a href={resolvedMedia.url} target="_blank" rel="noreferrer" style={{ color: "var(--color-action)" }}>
          Abrir anexo de mídia
        </a>
      </div>
    );
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isOutbound ? "flex-end" : "flex-start",
        marginBottom: "8px",
        width: "100%",
      }}
    >
      <div
        className="sos-message-bubble"
        style={{
          maxWidth: "min(640px, 85%)",
          backgroundColor: isPixConfirmation
            ? "rgba(16, 185, 129, 0.08)"
            : isOutbound
            ? "var(--color-action-subtle)"
            : "var(--bg-surface)",
          border: isPixConfirmation
            ? "1px solid var(--color-action)"
            : isOutbound
            ? "1px solid rgba(0, 128, 105, 0.15)"
            : "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          borderBottomRightRadius: isOutbound ? "var(--radius-xs, 4px)" : "var(--radius-lg, 12px)",
          borderBottomLeftRadius: !isOutbound ? "var(--radius-xs, 4px)" : "var(--radius-lg, 12px)",
          padding: "var(--space-2, 8px) var(--space-3, 12px)",
          boxShadow: "var(--shadow-xs, 0 1px 2px rgba(0, 0, 0, 0.05))",
          wordBreak: "break-word",
          position: "relative",
        }}
      >
        {isPixConfirmation && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "6px",
              fontSize: "11px",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "var(--color-primary, #10b981)",
              }}
            >
              🎉 Recibo Pix Confirmado
            </span>
          </div>
        )}

        {hasPixCharge && !isPixConfirmation && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "6px",
              fontSize: "10px",
              fontWeight: 600,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor: "rgba(245, 158, 11, 0.12)",
                color: "#b45309",
              }}
            >
              ⚡ Cobrança Pix Anexada
            </span>
          </div>
        )}
        {isAiGenerated && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "6px",
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "2px 6px",
                borderRadius: "4px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                color: "var(--color-primary, #10b981)",
              }}
            >
              🤖 {aiAgentName} (IA)
            </span>
            {aiNeedsHandoff && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 6px",
                  borderRadius: "4px",
                  backgroundColor: "rgba(245, 158, 11, 0.15)",
                  color: "#d97706",
                }}
              >
                ⚠️ Transbordo
              </span>
            )}
          </div>
        )}

        {renderMediaContent()}

        {isAttachmentFilename && !resolvedMedia.url && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 10px",
              marginBottom: "4px",
              backgroundColor: "rgba(0, 0, 0, 0.04)",
              borderRadius: "8px",
              border: "1px solid var(--border-default)",
            }}
          >
            <FileText size={16} style={{ color: "var(--color-action)" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>{message.body}</span>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Anexo registrado no histórico</span>
            </div>
          </div>
        )}

        {(!isPlaceholderBody || !resolvedMedia.url) && !isAttachmentFilename && (
          <div
            style={{
              fontSize: "var(--font-size-base, 1rem)",
              lineHeight: "var(--line-height-normal, 1.5)",
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {message.body ? renderWhatsappMarkdown(message.body) : (!resolvedMedia.url ? "Mensagem sem conteúdo textual" : null)}
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "4px",
            marginTop: "4px",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-secondary)",
          }}
        >
          <span>{formattedTime}</span>
          {renderStatus()}
        </div>
      </div>
    </div>
  );
};
