import {Button} from "@sos-sales/ui";
import { useState, useMemo, useRef, useEffect, type FC } from "react";
import { Check, CheckCheck, Clock, AlertCircle, FileText, Download, Mic } from "lucide-react";
import { apiClient, type ThreadMessageSummary } from "../../../services/api-client";
import { formatDateTimeFull } from "../utils/formatTime";
import { renderWhatsappMarkdown } from "../utils/whatsappMarkdown";

interface MessageBubbleProps {
  message: ThreadMessageSummary;
}

export const MessageBubble: FC<MessageBubbleProps> = ({ message }) => {
  const isOutbound = message.direction === "outbound";
  const formattedTime = formatDateTimeFull(message.createdAt);
  const validTimestamp = formattedTime ? new Date(message.createdAt).toISOString() : undefined;
  const [failedMedia,setFailedMedia]=useState<string|null>(null);

  // Extract mediaUrl from message or metadata fallback
  const resolvedMedia = useMemo(() => {
    const text=(value:unknown)=>typeof value==="string"?value:"";
    let url = text(message.mediaUrl);
    let mime = "";
    let filename = "";

    const meta = message.metadata as Record<string, unknown> | undefined;
    if (meta) {
      if (!url) {
        if (meta.mediaId && message.channelInstanceId) {
          url = `/v1/workspaces/${message.workspaceId || text(meta.workspaceId)}/media/proxy?mediaId=${encodeURIComponent(String(meta.mediaId))}&channelInstanceId=${message.channelInstanceId}`;
        } else if (typeof meta.media_payload === "string") {
          try {
            const parsed = JSON.parse(meta.media_payload);
            url = text(parsed?.url);
            mime = text(parsed?.mimetype);
          } catch {}
        } else if (typeof meta.media_payload === "object" && meta.media_payload !== null) {
          const mp = meta.media_payload as Record<string, string>;
          url = text(mp.url);
          mime = text(mp.mimetype);
        } else if (typeof (meta as any).media === "object" && (meta as any).media !== null) {
          const m = (meta as any).media;
          url = text(m.url);
          mime = text(m.mimetype);
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
        const wsId = message.workspaceId || text(meta?.workspaceId);
        url = `/v1/workspaces/${wsId}/media/proxy?wahaPath=${encodeURIComponent(match[0])}&channelInstanceId=${message.channelInstanceId || ""}`;
      }
    }

    if (url && url.startsWith("/")) {
      url = `${apiClient.getBaseUrl().replace(/\/$/, "")}${url}`;
    }

    if(url){try{const parsed=new URL(url,window.location.origin);if(!['http:','https:'].includes(parsed.protocol))url='';}catch{url='';}}

    // Attach auth token if accessing media proxy so browser audio/img tags don't 401
    const apiOrigin=new URL(apiClient.getBaseUrl(),window.location.origin).origin;
    let trustedProxy=false;
    try{const parsed=new URL(url,window.location.origin);trustedProxy=parsed.origin===apiOrigin && /^\/v1\/workspaces\/[a-f0-9-]+\/media\/proxy$/.test(parsed.pathname);}catch{/* Invalid media URL stays unauthenticated. */}
    if (trustedProxy && !url.includes("token=")) {
      let storedToken:string|null=null;
      try{storedToken=localStorage.getItem("sos_sales_auth_token")||sessionStorage.getItem("sos_v3_lab_token")||sessionStorage.getItem("sos_sales_auth_token");}catch{/* Media stays unauthenticated when storage is unavailable. */}
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
  }, [message.mediaUrl, message.contentType, message.metadata,message.workspaceId,message.channelInstanceId]);

  const mediaIdentity=JSON.stringify([message.id,resolvedMedia.url,resolvedMedia.type]);
  const mediaElement=useRef<HTMLElement|null>(null),failureStatus=useRef<HTMLParagraphElement|null>(null),focusRetry=useRef(false),focusFailure=useRef(false);
  useEffect(()=>{
    if(focusRetry.current&&failedMedia!==mediaIdentity){focusRetry.current=false;mediaElement.current?.focus();}
    if(focusFailure.current&&failedMedia===mediaIdentity){focusFailure.current=false;failureStatus.current?.focus();}
  },[failedMedia,mediaIdentity]);
  const markMediaFailed=()=>{focusFailure.current=document.activeElement===mediaElement.current;setFailedMedia(mediaIdentity);};

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
    return Boolean(isOutbound && (meta?.source === "ai_receptionist" || (typeof meta?.agentName === "string" && meta.agentName.trim())));
  }, [isOutbound, message.metadata]);

  const aiAgentName = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return typeof meta?.agentName === "string" && meta.agentName.trim() ? meta.agentName : "IA Atendente";
  }, [message.metadata]);

  const aiNeedsHandoff = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return meta?.needsHandoff === true;
  }, [message.metadata]);

  const isPixConfirmation = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return isOutbound && meta?.source === "pix_confirmation";
  }, [isOutbound, message.metadata]);

  const hasPixCharge = useMemo(() => {
    const meta = message.metadata as Record<string, unknown> | undefined;
    return isOutbound && [meta?.generatedPixChargeId, meta?.chargeId].some(value=>typeof value==="string"&&Boolean(value.trim()));
  }, [isOutbound, message.metadata]);

  const renderStatus = () => {
    if (!isOutbound) return null;
    const statuses = {
      read: { label: "Lida", icon: <CheckCheck size={14} aria-hidden="true" style={{ color: "var(--color-action)" }} /> },
      delivered: { label: "Entregue", icon: <CheckCheck size={14} aria-hidden="true" /> },
      sent: { label: "Enviada", icon: <Check size={14} aria-hidden="true" /> },
      failed: { label: "Falha no envio", icon: <AlertCircle size={14} aria-hidden="true" style={{ color: "var(--color-danger)" }} /> },
      queued: { label: "Na fila", icon: <Clock size={12} aria-hidden="true" /> },
    };
    const status = Object.prototype.hasOwnProperty.call(statuses, message.deliveryStatus)
      ? statuses[message.deliveryStatus as keyof typeof statuses]
      : null;
    if (!status) return <span role="img" aria-label="Status de envio não confirmado" title="Sem confirmação do provedor">Status não confirmado</span>;
    return <span role="img" aria-label={`Status de envio: ${status.label}`} title={status.label}>{status.icon}</span>;
  };

  const renderMediaContent = () => {
    if(!resolvedMedia.url)return resolvedMedia.type!=='text'?<p role="status">Anexo registrado, mas sem arquivo acessível nesta consulta.</p>:null;
    if(failedMedia===mediaIdentity)return <div style={{display:'grid',gap:6,marginBottom:6}}>
      <p ref={failureStatus} tabIndex={-1} role="status">Não foi possível carregar este anexo. A mensagem foi preservada; o arquivo pode estar indisponível ou sem acesso nesta consulta.</p>
      <Button size="sm" variant="secondary" onClick={()=>{focusRetry.current=true;setFailedMedia(null);}}>Tentar carregar anexo novamente</Button>
      <a href={resolvedMedia.url} target="_blank" rel="noreferrer noopener" style={{color:'var(--color-action)'}}>Abrir anexo em outra aba</a>
    </div>;

    if (resolvedMedia.type === "audio") {
      return (
        <div style={{ marginBottom: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            <Mic size={14} style={{ color: "var(--color-action)" }} />
            <span>Mensagem de Áudio</span>
          </div>
          <audio
            ref={element=>{mediaElement.current=element;}}
            controls
            src={resolvedMedia.url}
            style={{ width: "100%", maxWidth: "280px", height: "36px" }}
            preload="metadata"
            aria-label="Áudio da conversa"
            onError={markMediaFailed}
          />
        </div>
      );
    }

    if (resolvedMedia.type === "video") {
      return (
        <div style={{ marginBottom: "6px" }}>
          <video
            ref={element=>{mediaElement.current=element;}}
            controls
            src={resolvedMedia.url}
            preload="metadata"
            aria-label="Vídeo da conversa"
            onError={markMediaFailed}
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
            rel="noreferrer noopener"
            aria-label={`Abrir ${resolvedMedia.filename || "documento anexado"} em outra aba`}
            title={resolvedMedia.filename || "Documento anexado"}
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
                Abrir em outra aba
              </span>
            </div>
            <Download size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
          </a>
        </div>
      );
    }

    // Default to Image
    {
      return (
        <div style={{ marginBottom: "6px" }}>
          <a ref={element=>{mediaElement.current=element;}} href={resolvedMedia.url} target="_blank" rel="noreferrer noopener" aria-label="Abrir imagem em outra aba" style={{display:'block'}}><img
            src={resolvedMedia.url}
            alt={isOutbound?"Imagem enviada na conversa":"Imagem recebida na conversa"}
            onError={markMediaFailed}
            style={{
              maxWidth: "100%",
              maxHeight: "300px",
              borderRadius: "var(--radius-md, 8px)",
              objectFit: "cover",
              display: "block",
              cursor: "pointer",
            }}
          /></a>
        </div>
      );
    }


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
              Mensagem de confirmação Pix
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
                title="Solicitação registrada nesta mensagem; confira no cabeçalho o estado atual do atendimento."
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
                ⚠️ Encaminhamento solicitado
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
          {message.metadata?.waha_synced === true && <span title="Importada do histórico do provedor">Histórico ·</span>}
          {validTimestamp ? <time dateTime={validTimestamp}>{formattedTime}</time> : <span>Data não informada</span>}
          {renderStatus()}
        </div>
      </div>
    </div>
  );
};
