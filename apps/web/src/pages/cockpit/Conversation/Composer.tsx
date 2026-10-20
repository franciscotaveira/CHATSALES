import {attachmentAccept,attachmentFileError,attachmentSizeLabel} from "../utils/attachment-file";
import { type FC, type KeyboardEvent, useRef, useState, useId } from "react";
import { Button, IconButton } from "@sos-sales/ui";
import { Send, Paperclip, FileCode, ShoppingBag, Workflow, QrCode, File, X } from "lucide-react";
import type { WindowInfo } from "../hooks/useConversation";

interface ComposerProps {
  draft: string;
  onDraftChange: (text: string) => void;
  attachedFile?: File | null;
  onAttachFile?: (file: File | null) => void;
  onSend: () => void;
  isSending: boolean;
  windowInfo: WindowInfo;
  onOpenTemplates: () => void;
  onOpenCatalog?: () => void;
  onOpenFlows?: () => void;
  onOpenPix?: () => void;
  isMobile?: boolean;
  onRefreshChannel?:()=>void;
  isCheckingChannel?:boolean;
}

export const Composer: FC<ComposerProps> = ({
  draft,
  onDraftChange,
  attachedFile,
  onAttachFile,
  onSend,
  isSending,
  windowInfo,
  onOpenTemplates,
  onOpenCatalog,
  onOpenFlows,
  onOpenPix,
  isMobile = false,
  onRefreshChannel,
  isCheckingChannel=false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentError,setAttachmentError]=useState<string|null>(null);const attachmentErrorId=useId();
  const isWindowClosed = !windowInfo.isOpen;
  const blocked=windowInfo.sendBlockedReason;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if(e.nativeEvent.isComposing||e.keyCode===229)return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if(e.repeat)return;
      if ((draft.trim() || attachedFile) && !isSending && !isWindowClosed && !blocked) {
        onSend();
      }
    }
  };

  const handleTextChange = (val: string) => {
    onDraftChange(val);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const nextHeight = Math.min(textareaRef.current.scrollHeight, 140);
      textareaRef.current.style.height = `${nextHeight}px`;
    }
  };

  return (
    <footer
      style={{
        backgroundColor: "var(--bg-surface-elevated)",
        borderTop: "2px solid var(--border-strong)",
        padding: "var(--space-3, 12px) var(--space-4, 16px)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        boxSizing: "border-box",
        flexShrink:0,
        minHeight:0,
        maxHeight:"70%",
        overflowY:"auto",
      }}
    >
      {/* Quick Action Tools Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          flexWrap: "wrap",
        }}
      >
        <Button
          size="xs"
          variant={isWindowClosed ? "primary" : "secondary"}
          prefixIcon={<FileCode size={14} />}
          onClick={onOpenTemplates}
          title="Selecionar ou disparar modelo Meta Cloud API"
        >
          Modelo
        </Button>
        {onOpenCatalog && (
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={<ShoppingBag size={14} />}
            onClick={onOpenCatalog}
            title="Catálogo de Produtos"
          >
            Catálogo
          </Button>
        )}
        {onOpenFlows && (
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={<Workflow size={14} />}
            onClick={onOpenFlows}
            title="Formulários nativos WhatsApp"
          >
            Flow
          </Button>
        )}
        {onOpenPix && (
          <Button
            size="xs"
            variant="secondary"
            prefixIcon={<QrCode size={14} />}
            onClick={onOpenPix}
            title="Gerar Cobrança Instantânea Pix"
          >
            Pix
          </Button>
        )}
      </div>

      {/* Main Composer Input Area */}
      {blocked&&<div role="status"><p>{blocked}</p>{onRefreshChannel&&<Button size="sm" variant="secondary" disabled={isCheckingChannel||isSending} onClick={onRefreshChannel}>Atualizar disponibilidade</Button>}</div>}
      {windowInfo.isLoading ? <p role="status">{windowInfo.badgeText}</p> : isWindowClosed&&!blocked ? (
        <div
          style={{
            backgroundColor: "var(--bg-canvas)",
            border: "1px dashed var(--border-default)",
            borderRadius: "var(--radius-md, 8px)",
            padding: "var(--space-3, 12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <span
            style={{
              fontSize: isMobile ? "16px" : "var(--font-size-sm, 0.875rem)",
              color: "var(--text-secondary)",
            }}
          >
            Janela de 24h fechada — só modelos aprovados
          </span>
          <Button size="sm" variant="primary" onClick={onOpenTemplates}>
            Enviar Modelo
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {attachmentError&&<p id={attachmentErrorId} role="alert">{attachmentError} O texto e o anexo anterior foram preservados.</p>}
          <p style={{fontSize:12,color:"var(--text-muted)",margin:0}}>Imagens JPG, PNG e WebP até 5 MB; PDF, MP4, OGG e MP3 até 16 MB.</p>
          {attachedFile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 10px",
                backgroundColor: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                <File size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                <span
                  style={{
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    maxWidth: isMobile ? "180px" : "320px",
                  }}
                >
                  {attachedFile.name}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "11px", flexShrink: 0 }}>
                  ({attachmentSizeLabel(attachedFile.size)})
                </span>
              </div>
              <IconButton
                aria-label="Remover anexo"
                icon={<X size={14} />}
                size="sm"
                variant="ghost"
                disabled={isSending}
                onClick={() => {if(isSending)return;onAttachFile?.(null);setAttachmentError(null);textareaRef.current?.focus();}}
                tooltip="Remover anexo"
              />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept={attachmentAccept}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if(file&&!isSending){const error=attachmentFileError(file);setAttachmentError(error);if(!error)onAttachFile?.(file);}
                e.target.value = "";
              }}
            />

            <IconButton
              aria-label="Anexar arquivo"
              icon={<Paperclip size={18} />}
              size="sm"
              variant="ghost"
              tooltip="Anexar arquivo"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending||!onAttachFile}
              aria-describedby={attachmentError?attachmentErrorId:undefined}
            />

            <textarea
              ref={textareaRef}
              aria-label="Mensagem para o cliente"
              value={draft}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escrever mensagem..."
              rows={1}
              style={{
                flex: 1,
                resize: "none",
                minHeight: "36px",
                maxHeight: "140px",
                padding: "8px 12px",
                fontSize: isMobile ? "16px" : "var(--font-size-base, 1rem)",
                lineHeight: "1.4",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                border: "1.5px solid var(--border-default, #CBD5E1)",
                boxShadow: "inset 0 1px 2px rgba(15, 23, 42, 0.04)",
                borderRadius: "var(--radius-md, 8px)",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />

            <Button
              size="sm"
              variant="primary"
              disabled={Boolean(blocked)||(!draft.trim() && !attachedFile) || isSending}
              onClick={()=>{if(!blocked)onSend();}}
              prefixIcon={<Send size={15} />}
              title="Enviar mensagem (Enter)"
            >
              Enviar
            </Button>
          </div>
        </div>
      )}
    </footer>
  );
};

