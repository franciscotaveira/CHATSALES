import { useState, type FC } from "react";
import { Badge, Button, EmptyState } from "@sos-sales/ui";
import { Radio, Plus, QrCode, Trash2, Smartphone, CreditCard, ShieldCheck, ShieldAlert, Link2, Check, RefreshCw } from "lucide-react";
import type { ChannelSummary } from "../../services/api-client";

interface ChannelsSectionProps {
  channels: ChannelSummary[];
  isLoading: boolean;
  onOpenWizard: () => void;
  onOpenQr: (channelId: string, channelName: string) => void;
  onRevoke: (channelId: string, channelName: string) => void;
  revokingId: string | null;
  onDelete?: (channelId: string, channelName: string) => void;
  deletingId?: string | null;
  onToggleBilling?: (channelId: string, currentConfigured: boolean) => void;
  onSync?: (channelId: string, channelName: string) => void;
  syncingId?: string | null;
}

export const ChannelsSection: FC<ChannelsSectionProps> = ({
  channels,
  isLoading,
  onOpenWizard,
  onOpenQr,
  onRevoke,
  revokingId,
  onDelete,
  deletingId,
  onToggleBilling,
  onSync,
  syncingId,
}) => {
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);

  const handleCopyWaMe = (phone: string, channelId: string) => {
    const cleanPhone = phone.replace(/\D/g, "");
    const url = `https://wa.me/${cleanPhone}`;
    navigator.clipboard.writeText(url);
    setCopiedChannelId(channelId);
    setTimeout(() => setCopiedChannelId(null), 2500);
  };
  const getStatusBadge = (status?: string) => {
    switch (status) {
      case "connected":
      case "active":
        return <Badge variant="action">Conectado</Badge>;
      case "revoked":
        return <Badge variant="danger">Revogado</Badge>;
      case "configuring":
        return <Badge variant="warning">Configurando</Badge>;
      case "error":
        return <Badge variant="danger">Erro de Conexão</Badge>;
      default:
        return <Badge variant="neutral">{status || "Desconhecido"}</Badge>;
    }
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            Canais WhatsApp Conectados
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Instâncias Meta Cloud API (Oficial Nuvem) e WAHA (WhatsApp Web via QR Code).
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button
            size="sm"
            variant="primary"
            prefixIcon={<Plus size={14} />}
            onClick={onOpenWizard}
          >
            Conectar Canal
          </Button>
        </div>
      </div>

      {/* Explanatory callout for WhatsApp Web / WAHA vs Cloud API */}
      <div
        style={{
          padding: "12px 14px",
          backgroundColor: "rgba(0, 128, 105, 0.06)",
          border: "1px solid rgba(0, 128, 105, 0.2)",
          borderRadius: "var(--radius-md)",
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          fontSize: "var(--font-size-xs)",
          color: "var(--text-secondary)",
          lineHeight: 1.5,
        }}
      >
        <QrCode size={18} color="var(--color-action)" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            Como funciona a conexão por QR Code (WAHA) vs Meta Cloud API:
          </span>
          <span>
            • <strong>Meta Cloud API (Oficial):</strong> Opera direto na nuvem da Meta — <em>não usa QR Code</em>, nunca desconecta por celular desligado, mas exige cartão na Meta para disparos ativos.
          </span>
          <span>
            • <strong>WAHA (WhatsApp Web):</strong> Conecta via <strong>leitura de QR Code</strong> no aplicativo WhatsApp (<em>Aparelhos Conectados</em>). Para conectar uma linha com QR Code, clique em <strong>+ Conectar Canal</strong> e selecione <strong>WAHA (QR Code)</strong>.
          </span>
        </div>
      </div>

      {isLoading && channels.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
          Carregando canais conectados...
        </div>
      ) : channels.length === 0 ? (
        <EmptyState
          icon={<Radio size={40} />}
          title="Nenhum canal conectado"
          description="Conecte uma linha WhatsApp oficial Meta Cloud API ou instância WAHA para começar a receber leads."
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {channels.map((ch) => {
            const isWaha = ch.provider === "waha";
            const isRevoking = revokingId === ch.id;
            const isDeleting = deletingId === ch.id;

            return (
              <div
                key={ch.id}
                className="sos-card-interactive"
                style={{
                  padding: "12px 14px",
                  backgroundColor: "var(--bg-canvas)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "50%",
                      backgroundColor: "var(--color-operational-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--color-operational)",
                    }}
                  >
                    <Smartphone size={16} />
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
                        {ch.displayName || "Linha WhatsApp"}
                      </span>
                      {getStatusBadge(ch.status)}
                    </div>
                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", marginTop: "3px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                      <span>{ch.provider.toUpperCase()} {ch.phoneNumberE164 ? `· ${ch.phoneNumberE164}` : ""}</span>
                      {ch.provider === "meta_waba" ? (
                        <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#2563eb", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          ☁️ Nuvem Meta (Sem QR Code)
                        </span>
                      ) : ch.provider === "waha" ? (
                        <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                          📱 WhatsApp Web (Via QR Code)
                        </span>
                      ) : null}
                      {ch.provider === "meta_waba" && (
                        ch.metaBillingConfigured ? (
                          <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <ShieldCheck size={11} /> Cartão Meta Ativo (Disparos Liberados)
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.68rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "3px" }}>
                            <ShieldAlert size={11} /> Sem Cartão Meta (Disparo Travado)
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {ch.phoneNumberE164 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      prefixIcon={copiedChannelId === ch.id ? <Check size={12} color="#10b981" /> : <Link2 size={12} />}
                      onClick={() => handleCopyWaMe(ch.phoneNumberE164!, ch.id)}
                      title={`Copiar link direto https://wa.me/${ch.phoneNumberE164.replace(/\D/g, "")}`}
                    >
                      {copiedChannelId === ch.id ? "Copiado!" : "wa.me"}
                    </Button>
                  )}
                  {ch.provider === "meta_waba" && onToggleBilling && (
                    <Button
                      size="xs"
                      variant={ch.metaBillingConfigured ? "secondary" : "primary"}
                      prefixIcon={<CreditCard size={12} />}
                      onClick={() => onToggleBilling(ch.id, Boolean(ch.metaBillingConfigured))}
                      title="O SOS Sales não cobra mensagens: tarifação ocorre direto no seu cartão na Meta"
                    >
                      {ch.metaBillingConfigured ? "Cartão Meta OK" : "Ativar Cartão Meta"}
                    </Button>
                  )}
                  {isWaha && ch.status !== "revoked" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      prefixIcon={<QrCode size={13} />}
                      onClick={() => onOpenQr(ch.id, ch.displayName || "WAHA")}
                    >
                      QR Code
                    </Button>
                  )}
                  {isWaha && ch.status === "connected" && onSync && (
                    <Button
                      size="xs"
                      variant="primary"
                      prefixIcon={<RefreshCw size={12} className={syncingId === ch.id ? "animate-spin" : ""} />}
                      onClick={() => onSync(ch.id, ch.displayName || "WAHA")}
                      disabled={syncingId === ch.id || isRevoking || isDeleting}
                      title="Importar conversas e contatos do WhatsApp Web para o Cockpit e Kanban"
                    >
                      {syncingId === ch.id ? "Sincronizando..." : "Sincronizar Conversas"}
                    </Button>
                  )}
                  {ch.status === "connected" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => onRevoke(ch.id, ch.displayName || ch.phoneNumberE164 || "Linha WhatsApp")}
                      disabled={isRevoking || isDeleting}
                    >
                      {isRevoking ? "Revogando..." : "Desconectar"}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="danger"
                    prefixIcon={<Trash2 size={13} />}
                    onClick={() => onDelete?.(ch.id, ch.displayName || ch.phoneNumberE164 || "Linha WhatsApp")}
                    disabled={isRevoking || isDeleting}
                  >
                    {isDeleting ? "Excluindo..." : ch.status === "revoked" ? "Excluir" : "Excluir / Arquivar"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
