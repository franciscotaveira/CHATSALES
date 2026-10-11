import type { FC } from "react";
import { Dialog, Button, LoadingState } from "@sos-sales/ui";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

interface QrCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  channelName: string;
  qrDataUri?: string;
  qrText?: string;
  isLoading: boolean;
  isStarting?: boolean;
  isRefreshing?: boolean;
  alreadyConnected?: boolean;
  error?: string;
  onRefresh?: () => void;
}

export const QrCodeDialog: FC<QrCodeDialogProps> = ({
  isOpen,
  onClose,
  channelName,
  qrDataUri,
  isLoading,
  isStarting,
  isRefreshing,
  alreadyConnected,
  error,
  onRefresh,
}) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={alreadyConnected ? `Canal Conectado — ${channelName}` : `Escanear QR Code — ${channelName}`}
      description={
        alreadyConnected
          ? "Esta linha do WhatsApp já está sincronizada e autenticada."
          : "Abra o WhatsApp no seu smartphone, vá em Aparelhos Conectados e aponte a câmera para o código abaixo."
      }
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "12px 0" }}>
        {isLoading ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <LoadingState variant="spinner" text="Verificando sessão e QR Code seguro..." />
          </div>
        ) : isStarting ? (
          <div style={{ padding: "32px 0", textAlign: "center" }}>
            <LoadingState
              variant="spinner"
              text="Inicializando motor WhatsApp no servidor... O QR Code estará disponível em instantes."
            />
          </div>
        ) : alreadyConnected ? (
          <div
            style={{
              padding: "20px",
              backgroundColor: "var(--color-success-subtle, rgba(16, 185, 129, 0.15))",
              color: "var(--color-success, #10b981)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "10px",
              textAlign: "center",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <CheckCircle2 size={40} />
            <div>
              <strong style={{ fontSize: "var(--font-size-base, 1rem)" }}>WhatsApp Autenticado e Operacional!</strong>
              <p style={{ margin: "8px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", opacity: 0.9, lineHeight: 1.5 }}>
                A sessão deste canal já está conectada no servidor. As mensagens e o assistente de IA já podem responder normalmente.
              </p>
            </div>
          </div>
        ) : error ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%" }}>
            <div
              role="alert"
              style={{
                padding: "12px 16px",
                backgroundColor: "var(--color-danger-subtle, rgba(239, 68, 68, 0.12))",
                color: "var(--color-danger, #ef4444)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-sm)",
                display: "flex",
                alignItems: "flex-start",
                gap: "10px",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong>Atenção:</strong> {error}
              </div>
            </div>

            {onRefresh && (
              <Button
                size="sm"
                variant="primary"
                prefixIcon={<RefreshCw size={14} className={isRefreshing ? "spin" : ""} />}
                onClick={onRefresh}
                loading={isRefreshing}
                style={{ marginTop: "4px" }}
              >
                {isRefreshing ? "Reiniciando sessão..." : "Reiniciar Sessão e Gerar Novo QR Code"}
              </Button>
            )}
          </div>
        ) : qrDataUri ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", width: "100%" }}>
            <div
              style={{
                padding: "16px",
                backgroundColor: "#ffffff",
                borderRadius: "var(--radius-lg, 12px)",
                border: "1px solid var(--border-default, #e2e8f0)",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <img
                src={qrDataUri}
                alt="QR Code de Conexão WhatsApp"
                style={{ width: "240px", height: "240px", display: "block" }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: "var(--color-success, #10b981)",
                    boxShadow: "0 0 8px rgba(16, 185, 129, 0.8)",
                  }}
                />
                <span>Aguardando leitura no celular... Sincronização em tempo real.</span>
              </div>

              {onRefresh && (
                <Button
                  size="xs"
                  variant="ghost"
                  prefixIcon={<RefreshCw size={12} className={isRefreshing ? "spin" : ""} />}
                  onClick={onRefresh}
                  loading={isRefreshing}
                  style={{ opacity: 0.85 }}
                >
                  {isRefreshing ? "Renovando..." : "Não conseguiu ler? Gerar novo QR Code"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)", padding: "20px 0" }}>
            QR Code indisponível ou instância inicializando.
            {onRefresh && (
              <div style={{ marginTop: "12px" }}>
                <Button size="xs" variant="secondary" onClick={onRefresh} loading={isRefreshing}>
                  Tentar Novamente
                </Button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", marginTop: "8px" }}>
          <Button size="sm" variant={alreadyConnected ? "primary" : "secondary"} onClick={onClose}>
            {alreadyConnected ? "Concluir" : "Fechar"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
