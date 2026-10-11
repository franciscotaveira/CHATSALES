import { useState, useEffect, type FC } from "react";
import { PageHeader, useBreakpoint } from "@sos-sales/ui";
import { Radio, Bot, QrCode, AlertTriangle, Braces, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type ChannelSummary } from "../../services/api-client";
import { ChannelsSection } from "./ChannelsSection";
import { TeamSection } from "./TeamSection";
import { AiAgentSection } from "./AiAgentSection";
import { PixSection } from "./PixSection";
import { DangerSection } from "./DangerSection";
import { IntegrationsSection } from "./IntegrationsSection";
import { ChannelWizardDialog } from "./ChannelWizardDialog";
import { QrCodeDialog } from "./QrCodeDialog";

type SettingsTab = "canais" | "equipe" | "ia" | "pix" | "integracoes" | "perigo";

export const SettingsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const { isMobile } = useBreakpoint();
  const [activeTab, setActiveTab] = useState<SettingsTab>("canais");

  // Channels state
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [isLoadingChannels, setIsLoadingChannels] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Dialogs
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [qrModal, setQrModal] = useState<{
    channelId: string;
    channelName: string;
    qrDataUri?: string;
    isLoading: boolean;
    isStarting?: boolean;
    isRefreshing?: boolean;
    alreadyConnected?: boolean;
    error?: string;
  } | null>(null);

  const loadChannels = async () => {
    if (!activeWorkspace || !token) return;
    setIsLoadingChannels(true);
    try {
      const res = await apiClient.getChannels(activeWorkspace.id, { token, includeInactive: true });
      setChannels(res.channels || []);
    } catch {
      // Non-fatal
    } finally {
      setIsLoadingChannels(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [activeWorkspace?.id, token]);

  // Sequential, non-overlapping auto-poll while dialog is open and not yet connected
  useEffect(() => {
    if (!qrModal || qrModal.alreadyConnected || !activeWorkspace?.id || !token) return;

    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!isMounted || !qrModal?.channelId || qrModal.alreadyConnected) return;
      try {
        const res = await apiClient.getChannelQrCode(activeWorkspace.id, qrModal.channelId, { token });
        if (!isMounted) return;

        if (res.success) {
          if (res.alreadyConnected) {
            setQrModal((prev) =>
              prev
                ? {
                    ...prev,
                    isLoading: false,
                    isStarting: false,
                    isRefreshing: false,
                    alreadyConnected: true,
                    qrDataUri: undefined,
                    error: undefined,
                  }
                : null
            );
            loadChannels();
            return;
          } else if (res.status === "STARTING") {
            setQrModal((prev) =>
              prev ? { ...prev, isLoading: false, isStarting: true, error: undefined } : null
            );
          } else if (res.qrDataUri && res.qrDataUri !== qrModal.qrDataUri) {
            setQrModal((prev) =>
              prev
                ? {
                    ...prev,
                    qrDataUri: res.qrDataUri,
                    isLoading: false,
                    isStarting: false,
                    isRefreshing: false,
                    error: undefined,
                  }
                : null
            );
          }
        }
      } catch {
        // Silently wait for next sequential poll
      }

      if (isMounted) {
        timeoutId = setTimeout(poll, 3500);
      }
    };

    timeoutId = setTimeout(poll, 3500);

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [qrModal?.channelId, qrModal?.alreadyConnected, activeWorkspace?.id, token]);

  const handleOpenQr = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    setQrModal({ channelId, channelName, isLoading: true, isStarting: false, isRefreshing: false });
    try {
      const res = await apiClient.getChannelQrCode(activeWorkspace.id, channelId, { token });
      if (res.success) {
        if (res.alreadyConnected) {
          setQrModal({ channelId, channelName, isLoading: false, alreadyConnected: true });
          await loadChannels();
        } else if (res.status === "STARTING") {
          setQrModal({ channelId, channelName, isLoading: false, isStarting: true });
        } else {
          setQrModal({ channelId, channelName, qrDataUri: res.qrDataUri, isLoading: false });
        }
      } else {
        setQrModal({ channelId, channelName, isLoading: false, error: res.error || "QR Code indisponível." });
      }
    } catch (err: unknown) {
      setQrModal({
        channelId,
        channelName,
        isLoading: false,
        error: err instanceof Error ? err.message : "Erro ao carregar QR Code.",
      });
    }
  };

  const handleRefreshQr = async () => {
    if (!activeWorkspace || !token || !qrModal?.channelId) return;
    setQrModal((prev) => (prev ? { ...prev, isRefreshing: true, error: undefined } : null));
    try {
      const res = await apiClient.getChannelQrCode(activeWorkspace.id, qrModal.channelId, {
        token,
        force: true,
      });
      if (res.success) {
        if (res.alreadyConnected) {
          setQrModal((prev) =>
            prev
              ? {
                  ...prev,
                  isRefreshing: false,
                  isLoading: false,
                  isStarting: false,
                  alreadyConnected: true,
                  qrDataUri: undefined,
                }
              : null
          );
          await loadChannels();
        } else if (res.status === "STARTING") {
          setQrModal((prev) =>
            prev
              ? {
                  ...prev,
                  isRefreshing: false,
                  isLoading: false,
                  isStarting: true,
                  qrDataUri: undefined,
                  error: undefined,
                }
              : null
          );
        } else {
          setQrModal((prev) =>
            prev
              ? {
                  ...prev,
                  isRefreshing: false,
                  isLoading: false,
                  isStarting: false,
                  qrDataUri: res.qrDataUri,
                  error: undefined,
                }
              : null
          );
        }
      } else {
        setQrModal((prev) =>
          prev ? { ...prev, isRefreshing: false, error: res.error || "Falha ao renovar QR Code." } : null
        );
      }
    } catch (err: unknown) {
      setQrModal((prev) =>
        prev
          ? {
              ...prev,
              isRefreshing: false,
              error: err instanceof Error ? err.message : "Erro ao renovar QR Code.",
            }
          : null
      );
    }
  };

  const handleRevoke = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    const confirmed = window.confirm(`Deseja revogar as credenciais do canal "${channelName}"?`);
    if (!confirmed) return;

    setRevokingId(channelId);
    try {
      await apiClient.revokeChannel(activeWorkspace.id, channelId, { token });
      await loadChannels();
    } catch {
      // Non-fatal
    } finally {
      setRevokingId(null);
    }
  };

  const handleDelete = async (channelId: string, channelName: string) => {
    if (!activeWorkspace || !token) return;
    const confirmed = window.confirm(`Deseja excluir ou arquivar o canal "${channelName}"?`);
    if (!confirmed) return;

    setDeletingId(channelId);
    try {
      const res = await apiClient.deleteChannel(activeWorkspace.id, channelId, { token });
      await loadChannels();
      alert(res.message);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erro ao excluir canal.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleBilling = async (channelId: string, currentConfigured: boolean) => {
    if (!activeWorkspace || !token) return;
    const targetState = !currentConfigured;
    const message = targetState
      ? "Confirmação de Faturamento Direto na Meta:\n\nSua empresa confirma que possui um Cartão de Crédito ou linha de crédito ativa configurada diretamente no Gerenciador de Negócios da Meta (Meta Business Manager) vinculada a este número?\n\nO SOS Sales NÃO cobra nem intermedeia tarifas de mensagens da Meta — todos os envios são faturados diretamente pela Meta no seu cartão."
      : "Deseja desativar a confirmação de faturamento Meta para este canal? Disparos em massa ficarão bloqueados até que o cartão seja reconfirmado.";

    if (!window.confirm(message)) return;

    try {
      await apiClient.updateChannelBilling(
        activeWorkspace.id,
        channelId,
        { metaBillingConfigured: targetState },
        { token }
      );
      await loadChannels();
    } catch (err: unknown) {
      alert((err as Error).message || "Falha ao atualizar faturamento do canal.");
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: LucideIcon }> = [
    { id: "canais", label: "Canais WhatsApp", icon: Radio },
    { id: "equipe", label: "Equipe & Acessos", icon: Users },
    { id: "ia", label: "Atendimento IA & Skills", icon: Bot },
    { id: "pix", label: "Cobrança Pix", icon: QrCode },
    { id: "integracoes", label: "API & Webhooks", icon: Braces },
    { id: "perigo", label: "Zona de Perigo", icon: AlertTriangle },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--bg-canvas)",
        overflowY: "auto",
        padding: "var(--space-6)",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: "1080px", width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: "20px" }}>
        <PageHeader
          title="Configurações"
          description="Gerencie os canais do WhatsApp, cobranças e integrações da empresa."
        />

        {/* Layout: 200px Left Nav + 720px Right Content */}
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: "24px",
            alignItems: "flex-start",
          }}
        >
          {/* 220px Left Section Navigation Card */}
          <nav
            aria-label="Seções de Configuração"
            style={{
              width: isMobile ? "100%" : "220px",
              minWidth: isMobile ? "100%" : "220px",
              display: "flex",
              flexDirection: isMobile ? "row" : "column",
              gap: "4px",
              overflowX: isMobile ? "auto" : "visible",
              backgroundColor: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              boxShadow: "0 1px 3px rgba(0, 0, 0, 0.03)",
              padding: "8px",
              boxSizing: "border-box",
            }}
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const isDanger = tab.id === "perigo";

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: "var(--font-size-sm)",
                    fontWeight: isActive ? 600 : 500,
                    backgroundColor: isActive
                      ? isDanger
                        ? "var(--color-danger-subtle)"
                        : "var(--color-action-subtle)"
                      : "transparent",
                    color: isDanger
                      ? "var(--color-danger)"
                      : isActive
                      ? "var(--color-action)"
                      : "var(--text-secondary)",
                    boxShadow: "none",
                    whiteSpace: "nowrap",
                    transition: "background-color var(--transition-fast, 150ms ease), color var(--transition-fast, 150ms ease)",
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Max 720px Right Content Area */}
          <div style={{ flex: 1, maxWidth: "720px", width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
            {activeTab === "canais" && (
              <ChannelsSection
                channels={channels}
                isLoading={isLoadingChannels}
                onOpenWizard={() => setIsWizardOpen(true)}
                onOpenQr={handleOpenQr}
                onRevoke={handleRevoke}
                revokingId={revokingId}
                onDelete={handleDelete}
                deletingId={deletingId}
                onToggleBilling={handleToggleBilling}
              />
            )}
            {activeTab === "equipe" && <TeamSection session={session} />}
            {activeTab === "ia" && <AiAgentSection workspaceId={activeWorkspace?.id} token={token ?? undefined} />}
            {activeTab === "pix" && <PixSection session={session} />}
            {activeTab === "integracoes" && <IntegrationsSection session={session} />}
            {activeTab === "perigo" && <DangerSection session={session} />}
          </div>
        </div>
      </div>

      {/* Connection Wizard Dialog */}
      <ChannelWizardDialog
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        workspaceId={activeWorkspace?.id}
        token={token ?? undefined}
        onChannelCreated={loadChannels}
        onOpenQr={handleOpenQr}
      />

      {/* WAHA QR Code Dialog */}
      <QrCodeDialog
        isOpen={Boolean(qrModal)}
        onClose={() => setQrModal(null)}
        channelName={qrModal?.channelName || ""}
        qrDataUri={qrModal?.qrDataUri}
        isLoading={Boolean(qrModal?.isLoading)}
        isStarting={Boolean(qrModal?.isStarting)}
        isRefreshing={Boolean(qrModal?.isRefreshing)}
        alreadyConnected={qrModal?.alreadyConnected}
        error={qrModal?.error}
        onRefresh={handleRefreshQr}
      />
    </div>
  );
};

export default SettingsPage;
