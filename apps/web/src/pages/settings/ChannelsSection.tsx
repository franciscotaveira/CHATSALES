import { useState, useEffect, useRef, type FC } from "react";
import { Badge, Button, EmptyState } from "@sos-sales/ui";
import { Radio, Plus, QrCode, Trash2, Smartphone, CreditCard, ShieldCheck, ShieldAlert, Link2, Check, RefreshCw } from "lucide-react";
import type { ChannelSummary } from "../../services/api-client";

const waMeLink=(phone:unknown)=>{
  if(typeof phone!=="string"||!/^\+?[\d\s().-]+$/.test(phone.trim()))return null;
  const digits=phone.replace(/\D/g,"");
  return /^[1-9]\d{7,14}$/.test(digits)?`https://wa.me/${digits}`:null;
};

interface ChannelsSectionProps {
  canManage?:boolean;
  isActionPending?: boolean;
  onReload?: () => void;
  onCheckMetaSubscription?: (channel:ChannelSummary)=>void;
  onApproveConnection?: (channel:ChannelSummary)=>void;
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
  hasLoadError?: boolean;
  lastCheckedAt?: string|null;
}

export const ChannelsSection: FC<ChannelsSectionProps> = ({
  channels,
  canManage=false,
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
  hasLoadError,
  lastCheckedAt,
  isActionPending=false,
  onReload,
  onCheckMetaSubscription,
  onApproveConnection,
}) => {
  const controlsBusy = isActionPending || Boolean(syncingId);
  const existingChannelBusy=controlsBusy||isLoading||Boolean(hasLoadError);
  const refreshButton=useRef<HTMLButtonElement>(null),restoreRefreshFocus=useRef(false);
  useEffect(()=>{if(isLoading||!restoreRefreshFocus.current)return;restoreRefreshFocus.current=false;if(document.activeElement===document.body||document.activeElement===refreshButton.current)refreshButton.current?.focus();},[isLoading]);
  const [copiedChannelId, setCopiedChannelId] = useState<string | null>(null);

  const [copyError, setCopyError] = useState<string | null>(null);
  const copyGeneration = useRef(0);
  useEffect(() => { copyGeneration.current++; setCopiedChannelId(null); setCopyError(null); return () => { copyGeneration.current++; }; }, [channels]);
  const handleCopyWaMe = async (phone: string, channelId: string) => {
    const generation = ++copyGeneration.current;
    setCopiedChannelId(null); setCopyError(null);
    const url=waMeLink(phone);
    if(!url){setCopyError("O telefone deste canal não permite gerar um link de contato. Revise o número com código do país.");return;}
    try {
      await navigator.clipboard.writeText(url);
      if (generation !== copyGeneration.current) return;
      setCopiedChannelId(channelId);
      setTimeout(() => { if (generation === copyGeneration.current) setCopiedChannelId(null); }, 2500);
    } catch {
      if (generation === copyGeneration.current) setCopyError(`Não foi possível copiar. Selecione e copie este link: ${url}`);
    }
  };
  const getStatusBadge = (channel:ChannelSummary) => {
    switch (channel.status) {
      case "connected":
        return channel.isActive ? <Badge variant="action">Conectado</Badge> : <Badge variant="warning">Uso local pausado</Badge>;
      case "revoked":
        return <Badge variant="danger">Suspenso / arquivado</Badge>;
      case "validating":
        return <Badge variant="warning">Aguardando confirmação</Badge>;
      case "pairing":
        return <Badge variant="warning">Aguardando vínculo</Badge>;
      case "configuring":
        return <Badge variant="warning">Configurando</Badge>;
      case "unconfigured":
        return <Badge variant="neutral">Não configurado</Badge>;
      case "error":
        return <Badge variant="danger">Erro de Conexão</Badge>;
      default:
        return <Badge variant="neutral">Estado não confirmado</Badge>;
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
      {copiedChannelId&&<p role="status">Link de contato copiado para {channels.find(channel=>channel.id===copiedChannelId)?.displayName||"o canal selecionado"}.</p>}
      {copyError && <p role="alert" style={{ overflowWrap: "anywhere" }}>{copyError}</p>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
            Canais WhatsApp
          </h2>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Instâncias Meta Cloud API (Oficial Nuvem) e WAHA (WhatsApp Web via QR Code).
          </p>
        </div>

        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {onReload && <Button ref={refreshButton} size="sm" variant="secondary" onClick={()=>{restoreRefreshFocus.current=document.activeElement===refreshButton.current;onReload();}} disabled={isLoading || controlsBusy}>Atualizar canais</Button>}
        {canManage&&<div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button
            size="sm"
            variant="primary"
            prefixIcon={<Plus size={14} />}
            onClick={onOpenWizard}
            disabled={controlsBusy || isLoading}
          >
            Conectar Canal
          </Button>
        </div>}
        </div>
      </div>

      {isLoading&&channels.length>0&&<p role="status">Atualizando canais… Os cartões mostram a última consulta concluída.</p>}
      {hasLoadError&&channels.length>0&&!isLoading&&<p role="status">Não foi possível atualizar os canais. Os cartões podem estar desatualizados; atualize a consulta antes de operar sobre eles.</p>}
      {lastCheckedAt&&<p style={{fontSize:"var(--font-size-xs)",color:"var(--text-secondary)",margin:0}}>Última consulta concluída: <time dateTime={lastCheckedAt}>{new Date(lastCheckedAt).toLocaleString("pt-BR")}</time>. Este registro não comprova envio ou recebimento de mensagens.</p>}
      {!canManage&&<p>Você pode consultar os canais e sincronizar conversas. Conexão, QR Code, credenciais e faturamento são gerenciados por proprietário ou administrador.</p>}
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
        <details style={{flex:1,minWidth:0}}>
          <summary style={{fontWeight:600,color:"var(--text-primary)",cursor:"pointer",overflowWrap:"anywhere",padding:"4px 0"}}>Como conectar e importar histórico</summary>
          <div style={{display:"flex",flexDirection:"column",gap:8,paddingTop:8}}>
          <span>
            • <strong>Meta Cloud API (Oficial):</strong> Use a configuração Meta para vincular a conta. Confira as permissões, a conexão e as condições de cobrança no provedor antes de enviar.
          </span>
          <span>
            • <strong>WAHA (WhatsApp Web):</strong> Conecta via <strong>leitura de QR Code</strong> no aplicativo WhatsApp (<em>Aparelhos Conectados</em>). Para conectar uma linha com QR Code, clique em <strong>Conectar Canal</strong> e selecione <strong>WAHA (QR Code)</strong>.
          </span>
          <span><strong>Importar histórico recente:</strong> lote de até 35 conversas diretas e 15 mensagens por conversa no WAHA. Exige canal ativo e conectado; não importa todo o histórico nem cria oportunidades.</span>
          </div>
        </details>
      </div>

      {isLoading && channels.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px", color: "var(--text-secondary)", fontSize: "var(--font-size-sm)" }}>
          Carregando canais conectados...
        </div>
      ) : channels.length === 0 && hasLoadError ? null : channels.length === 0 ? (
        <EmptyState
          icon={<Radio size={40} />}
          title="Nenhum canal conectado"
          description={canManage?"Conecte uma linha WhatsApp oficial Meta Cloud API ou instância WAHA para começar a receber leads.":"Peça ao proprietário ou administrador para configurar uma linha WhatsApp."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {channels.map((ch) => {
            const channelLabel=ch.displayName||ch.phoneNumberE164||ch.id;
            const contactLink=waMeLink(ch.phoneNumberE164);
            const isWaha = ch.provider === "waha";
            const isRevoking = revokingId === ch.id;
            const isDeleting = deletingId === ch.id;

            return (
              <div
                key={ch.id}
                role="group"
                aria-label={`Canal: ${channelLabel}`}
                className="sos-card-interactive"
                style={{
                  padding: "16px 18px",
                  backgroundColor: "var(--bg-canvas)",
                  borderRadius: "var(--radius-lg, 12px)",
                  border: "1px solid var(--border-default)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                {/* Top Row: Icon + Channel Info + Primary Badges */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, flex: "1 1 240px" }}>
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        minWidth: "38px",
                        minHeight: "38px",
                        borderRadius: "10px",
                        backgroundColor: isWaha ? "rgba(16, 185, 129, 0.12)" : "rgba(59, 130, 246, 0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: isWaha ? "#059669" : "#2563eb",
                        flexShrink: 0,
                      }}
                    >
                      <Smartphone size={18} />
                    </div>

                    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontSize: "var(--font-size-sm, 14px)", fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                          {ch.displayName || "Linha WhatsApp"}
                        </span>
                        {getStatusBadge(ch)}
                      </div>
                      <div style={{ fontSize: "var(--font-size-xs, 12px)", color: "var(--text-secondary)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontWeight: 500 }}>{ch.provider.toUpperCase()}</span>
                        {ch.phoneNumberE164 && <span>· {ch.phoneNumberE164}</span>}
                        {ch.phoneNumberE164&&!contactLink&&<span>Link de contato indisponível: revise o telefone com código do país.</span>}
                        {contactLink && (
                          <button
                            type="button"
                            onClick={() => handleCopyWaMe(ch.phoneNumberE164!, ch.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "3px",
                              background: "none",
                              border: "none",
                              padding: "1px 6px",
                              cursor: "pointer",
                              borderRadius: "4px",
                              fontSize: "11px",
                              color: copiedChannelId === ch.id ? "#10b981" : "var(--color-action)",
                              backgroundColor: "var(--color-action-subtle)",
                            }}
                            title="Copiar link wa.me"
                            aria-label={`Copiar link wa.me de ${channelLabel}`}
                          >
                            {copiedChannelId === ch.id ? <Check size={11} /> : <Link2 size={11} />}
                            {copiedChannelId === ch.id ? "Copiado!" : "wa.me"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Badges / Tags */}
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    {ch.provider === "meta_waba" ? (
                      <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "6px", backgroundColor: "rgba(59, 130, 246, 0.12)", color: "#2563eb", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        ☁️ Nuvem Meta (Sem QR Code)
                      </span>
                    ) : isWaha ? (
                      <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "6px", backgroundColor: "rgba(16, 185, 129, 0.12)", color: "#059669", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        📱 WhatsApp Web (Via QR Code)
                      </span>
                    ) : null}

                    {ch.provider === "meta_waba" && (
                      ch.metaBillingConfigured ? (
                        <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "6px", backgroundColor: "rgba(16, 185, 129, 0.15)", color: "#10b981", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <ShieldCheck size={12} /> Faturamento declarado
                        </span>
                      ) : (
                        <span style={{ fontSize: "0.72rem", padding: "2px 8px", borderRadius: "6px", backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#ef4444", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <ShieldAlert size={12} /> Faturamento não declarado
                        </span>
                      )
                    )}
                  </div>
                </div>

                {ch.provider === "meta_waba" && (
                  <div style={{fontSize:"var(--font-size-xs)",lineHeight:1.5,overflowWrap:"anywhere",padding:"8px 0",color:"var(--text-secondary)"}}>
                    <strong>Assinatura de webhooks: </strong>
                    {ch.metaSubscriptionStatus === "confirmed"
                      ? "solicitação confirmada pela Meta. Isso não comprova recebimento ou envio de mensagens."
                      : ch.metaSubscriptionStatus === "failed"
                      ? "não estabelecida ou recusada pela Meta. Revise a integração; o canal não pode ser liberado por uma consulta de identidade."
                      : ch.metaSubscriptionStatus === "uncertain"
                      ? "resultado não confirmado. Consulte a configuração antes de repetir a ação ou liberar o canal."
                      : "sem verificação registrada. Não presuma que eventos estão chegando."}
                    {ch.metaSubscriptionCheckedAt && <div>Registro da consulta: {new Date(ch.metaSubscriptionCheckedAt).toLocaleString("pt-BR")}</div>}
                  </div>
                )}

                {/* Bottom Row: Actions Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    gap: "8px",
                    flexWrap: "wrap",
                    paddingTop: "10px",
                    borderTop: "1px solid var(--border-default)",
                  }}
                >
                  {canManage&&(ch.provider === "meta_waba"||ch.provider === "evolution")&&!ch.isActive&&onApproveConnection&&<Button size="xs" variant="secondary" disabled={existingChannelBusy||!ch.revision||ch.status==='revoked'} aria-label={`Revisar conexão de ${channelLabel}`} onClick={()=>onApproveConnection(ch)}>Revisar conexão {ch.provider === "evolution" ? "Evolution" : "Meta"}</Button>}
                  {canManage&&ch.provider === "meta_waba"&&onCheckMetaSubscription&&<Button size="xs" variant="secondary" disabled={existingChannelBusy||!ch.revision||ch.status==='revoked'} aria-label={`Consultar assinatura de ${channelLabel}`} onClick={()=>onCheckMetaSubscription(ch)}>Consultar assinatura</Button>}
                  {canManage&&ch.provider === "meta_waba" && onToggleBilling && (
                    <Button
                      size="xs"
                      variant={ch.metaBillingConfigured ? "secondary" : "primary"}
                      prefixIcon={<CreditCard size={12} />}
                      aria-label={`${ch.metaBillingConfigured?"Remover declaração de faturamento":"Declarar faturamento Meta"} de ${channelLabel}`}
                      onClick={() => onToggleBilling(ch.id, Boolean(ch.metaBillingConfigured))}
                      title="Declaração do responsável. O SOS Vendas não verifica nem cadastra cartão na Meta."
                      disabled={existingChannelBusy || !ch.revision || (!ch.metaBillingConfigured && (!ch.isActive || ch.status !== "connected"))}
                    >
                      {ch.metaBillingConfigured ? "Remover declaração" : "Declarar faturamento Meta"}
                    </Button>
                  )}
                  {canManage&&isWaha && ch.status !== "revoked" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      prefixIcon={<QrCode size={13} />}
                      aria-label={`QR Code de ${channelLabel}`}
                      onClick={() => onOpenQr(ch.id, ch.displayName || "WAHA")}
                      disabled={existingChannelBusy}
                    >
                      QR Code
                    </Button>
                  )}
                  {isWaha && onSync && (
                    <Button
                      size="xs"
                      variant="primary"
                      prefixIcon={<RefreshCw size={12} className={syncingId === ch.id ? "animate-spin" : ""} />}
                      aria-label={`Importar histórico recente de ${channelLabel}`}
                      onClick={() => onSync(ch.id, ch.displayName || "WAHA")}
                      disabled={existingChannelBusy || !ch.isActive || ch.status !== "connected" || isRevoking || isDeleting}
                      title={ch.isActive && ch.status === "connected" ? "Importar lote recente de até 35 conversas, com até 15 mensagens por conversa. Não cria oportunidades." : "Conecte e ative o canal antes de importar o histórico."}
                    >
                      {syncingId === ch.id ? "Sincronizando..." : "Importar histórico recente"}
                    </Button>
                  )}
                  {canManage&&ch.status === "connected" && (
                    <Button
                      size="xs"
                      variant="secondary"
                      aria-label={`Suspender canal ${channelLabel}`}
                      onClick={() => onRevoke(ch.id, ch.displayName || ch.phoneNumberE164 || "Linha WhatsApp")}
                      disabled={existingChannelBusy || !ch.revision}
                    >
                      {isRevoking ? "Suspendendo..." : "Suspender canal"}
                    </Button>
                  )}
                  {canManage&&<Button
                    size="xs"
                    variant="danger"
                    prefixIcon={<Trash2 size={13} />}
                    aria-label={`Arquivar canal ${channelLabel}`}
                    onClick={() => onDelete?.(ch.id, ch.displayName || ch.phoneNumberE164 || "Linha WhatsApp")}
                    disabled={!onDelete || existingChannelBusy || !ch.revision || ch.status === "revoked"}
                  >
                    {isDeleting ? "Arquivando..." : ch.status === "revoked" ? "Canal suspenso / arquivado" : "Arquivar canal"}
                  </Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
