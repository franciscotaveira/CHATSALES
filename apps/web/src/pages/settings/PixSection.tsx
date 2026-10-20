import {hasWorkspacePermission} from "@sos-sales/contracts";
import { useState, useEffect, useRef, type FC } from "react";
import { Button, Input, Alert, Badge, useBreakpoint } from "@sos-sales/ui";
import { useDiscardChanges, UnsavedChangesNotice } from "../UnsavedChangesNotice";
import { Check, Copy, ExternalLink, Wrench } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient } from "../../services/api-client";
import { userFacingError } from "../../utils/user-facing-error";

const pixKeyTypes=["cpf","cnpj","email","phone","random"];
const displayPixKeyType=(value:string|null|undefined)=>{const stored=value?.trim()||"cnpj";return pixKeyTypes.includes(stored.toLowerCase())?stored.toLowerCase():stored;};

export const PixSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const context=JSON.stringify([session.activeWorkspace?.id,session.activeWorkspace?.role,session.token]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <PixConfiguration key={`pix-${context}`} session={session} />
      <AbacatePayConfiguration key={`abacate-${context}`} session={session} />
    </div>
  );
};
const PixConfiguration: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const live=useRef(true),busy=useRef(false),refreshBusy=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const { activeWorkspace, activeWorkspaceDetails, token, refreshWorkspace } = session;
  const canManage=hasWorkspacePermission(activeWorkspace?.role,"workspace:manage");
  const { isMobile } = useBreakpoint();
  const scope=useRef("");scope.current=`${activeWorkspace?.id ?? ""}:${token ?? ""}`;
  const formScope=useRef("");
  const dirty=useRef(false);
  const baseline=useRef<{key:string;type:string;name:string;city:string}|null>(null);
  const ready=Boolean(activeWorkspace&&activeWorkspaceDetails?.workspace.id===activeWorkspace.id&&!session.isLoadingWorkspace);

  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cnpj");
  const [merchantName, setMerchantName] = useState("");
  const [merchantCity, setMerchantCity] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isRefreshing,setIsRefreshing]=useState(false);
  const [refreshError,setRefreshError]=useState<string|null>(null);
  const refreshButton=useRef<HTMLButtonElement>(null),restoreRefreshFocus=useRef(false);
  useEffect(()=>{if(isRefreshing||!restoreRefreshFocus.current)return;restoreRefreshFocus.current=false;if(document.activeElement===document.body||document.activeElement===refreshButton.current)refreshButton.current?.focus();},[isRefreshing]);
  const edited=()=>{setSuccessMsg(null);};

  useEffect(() => {
    if(formScope.current!==scope.current){formScope.current=scope.current;dirty.current=false;setPixKey("");setMerchantName("");setMerchantCity("");setPixKeyType("cnpj");baseline.current=null;setSuccessMsg(null);setErrorMsg(null);}
    if (ready && activeWorkspaceDetails?.workspace && !dirty.current) {
      const w = activeWorkspaceDetails.workspace;
      baseline.current={key:w.defaultPixKey?.trim()||"",type:displayPixKeyType(w.defaultPixKeyType),name:w.defaultPixMerchantName?.trim()||"",city:w.defaultPixMerchantCity?.trim()||""};
      setPixKey(w.defaultPixKey || "");
      setPixKeyType(displayPixKeyType(w.defaultPixKeyType) as typeof pixKeyType);
      setMerchantName(w.defaultPixMerchantName || "");
      setMerchantCity(w.defaultPixMerchantCity || "");
    }
  }, [activeWorkspaceDetails,activeWorkspace?.id,token,ready]);

  const values={key:pixKey.trim(),type:pixKeyType as string,name:merchantName.trim(),city:merchantCity.trim()};
  const original=baseline.current;
  const keyChanged=Boolean(original&&(values.key!==original.key||values.type!==original.type));
  const hasChanges=Boolean(original&&(keyChanged||values.name!==original.name||values.city!==original.city));
  const knownKeyType=pixKeyTypes.includes(values.type);
  dirty.current=hasChanges;
  const nameRef=useRef<HTMLInputElement>(null);
  const discard=useDiscardChanges(canManage&&hasChanges,scope.current,()=>nameRef.current,true);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace || !token || !ready || !canManage || busy.current || refreshBusy.current || !original || !hasChanges || discard.isPending) return;
    if(keyChanged&&!knownKeyType){setErrorMsg("Escolha um tipo de chave reconhecido antes de alterar a chave Pix.");return;}
    const payload:Parameters<typeof apiClient.updateWorkspace>[1]={};
    if(keyChanged){payload.defaultPixKey=values.key||null;payload.defaultPixKeyType=values.type;}
    if(values.name!==original.name)payload.defaultPixMerchantName=values.name||null;
    if(values.city!==original.city)payload.defaultPixMerchantCity=values.city||null;
    const requestedScope=scope.current;

    busy.current=true;setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const result=await apiClient.updateWorkspace(
        activeWorkspace.id,
        payload,
        { token }
      );
      if(!live.current||requestedScope!==scope.current)return;
      if(result?.workspace?.id!==activeWorkspace.id||Object.entries(payload).some(([field,value])=>result.workspace[field as keyof typeof result.workspace]!==value)){
        throw new Error("O servidor não confirmou os dados Pix solicitados. O preenchimento foi preservado; atualize os dados da empresa para conferir antes de salvar novamente.");
      }
      baseline.current={...values};dirty.current=false;
      setSuccessMsg("Configurações de Cobrança Pix salvas com sucesso!");
      if (refreshWorkspace) {
        try {await refreshWorkspace({preserveView:true});}
        catch {if(live.current&&requestedScope===scope.current)setErrorMsg("Configuração salva, mas não foi possível atualizar os dados exibidos. Atualize os dados da empresa para conferir.");}
      }
    } catch (err: unknown) {
      if(live.current&&requestedScope===scope.current)setErrorMsg(userFacingError(err,"Falha ao salvar configurações de Pix. Os dados foram preservados."));
    } finally {
      if(live.current&&requestedScope===scope.current){busy.current=false;setIsSaving(false);}
    }
  };

  const refreshData=async()=>{
    if(refreshBusy.current||busy.current||discard.isPending||!activeWorkspace||!token)return;
    const requestedScope=scope.current;refreshBusy.current=true;setIsRefreshing(true);setRefreshError(null);
    try{await refreshWorkspace({preserveView:true});}
    catch(error){if(live.current&&scope.current===requestedScope)setRefreshError(userFacingError(error,"Não foi possível atualizar os dados da empresa. Os dados anteriores foram preservados."));}
    finally{if(live.current&&scope.current===requestedScope){refreshBusy.current=false;setIsRefreshing(false);}}
  };
  const refreshFeedback=<>{isRefreshing&&<p role="status">Atualizando dados da empresa… Os dados exibidos são da consulta anterior.</p>}{refreshError&&<Alert variant="danger" title="Atualização não concluída">{refreshError} Os dados exibidos são da última consulta concluída.</Alert>}</>;
  const refreshControl=<Button ref={refreshButton} type="button" onClick={()=>{restoreRefreshFocus.current=document.activeElement===refreshButton.current;void refreshData();}} disabled={discard.isPending||isSaving||isRefreshing||session.isLoadingWorkspace}>Atualizar dados da empresa</Button>;

  if(!hasWorkspacePermission(activeWorkspace?.role,'workspace:view'))return <Alert variant="info" title="Configuração Pix restrita">Seu perfil não permite consultar a configuração financeira desta empresa.</Alert>;
  if(!canManage)return <section aria-label="Consulta das configurações Pix" style={{display:'grid',gap:12}}><h2>Configuração de cobrança Pix</h2><Alert variant="info" title="Somente consulta">Alterações exigem proprietário ou administrador.</Alert>{ready?<dl style={{overflowWrap:'anywhere'}}><dt>Tipo de chave</dt><dd>{activeWorkspaceDetails!.workspace.defaultPixKeyType||'Não informado'}</dd><dt>Chave Pix</dt><dd>{activeWorkspaceDetails!.workspace.defaultPixKey||'Não configurada'}</dd><dt>Nome do recebedor</dt><dd>{activeWorkspaceDetails!.workspace.defaultPixMerchantName||'Não configurado'}</dd><dt>Cidade do recebedor</dt><dd>{activeWorkspaceDetails!.workspace.defaultPixMerchantCity||'Não configurada'}</dd></dl>:<p>Os dados desta empresa ainda não estão disponíveis.</p>}{refreshFeedback}{refreshControl}</section>;

  return (
    <form
      onSubmit={handleSave}
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
      {!canManage&&<Alert variant="info" title="Consulta das configurações Pix">Seu perfil pode consultar. Alterações exigem proprietário ou administrador.</Alert>}
      <div>
        <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
          Configuração de cobrança Pix
        </h2>
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
          Configure a chave Pix padrão para geração de QR Codes e chaves Copia e Cola no Cockpit (Padrão Banco Central / EMV).
        </p>
        <p style={{fontSize:12,color:"var(--text-secondary)"}}>Salvar estes dados permite gerar cobranças. A confirmação do pagamento depende do provedor integrado ou da conferência por uma pessoa autorizada.</p>
      </div>

      {successMsg && (
        <Alert variant="info" title="Sucesso">
          {successMsg}
        </Alert>
      )}

      {errorMsg && (
        <Alert variant="danger" title="Erro">
          {errorMsg}
        </Alert>
      )}

      {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={isSaving||isRefreshing}/>}
      {refreshFeedback}
      {refreshControl}
      {ready&&!hasChanges&&!successMsg&&<p role="status">Não há alterações para salvar.</p>}
      {!ready && <Alert variant="info" title="Dados da empresa indisponíveis">{session.isLoadingWorkspace ? "Carregando a configuração da empresa..." : "Atualize os dados da empresa antes de editar a cobrança Pix."}</Alert>}
      <fieldset disabled={discard.isPending||isSaving||isRefreshing||!ready||!canManage} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:16}}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 2fr", gap: "12px", alignItems: "end" }}>
        <div>
          <label
            style={{
              display: "block",
              fontSize: "var(--font-size-xs)",
              fontWeight: 500,
              color: "var(--text-secondary)",
              marginBottom: "4px",
            }}
          >
            Tipo de Chave
          </label>
          <select
            aria-label="Tipo de chave Pix"
            value={pixKeyType}
            onChange={(e) => {edited();setPixKeyType(e.target.value as any);}}
            style={{
              width: "100%",
              height: isMobile ? "44px" : "36px",
              padding: "0 10px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-surface)",
              fontSize: "var(--font-size-sm)",
              outline: "none",
            }}
          >
            {!knownKeyType&&<option value={pixKeyType} disabled>Tipo cadastrado não reconhecido</option>}
            <option value="cnpj">CNPJ</option>
            <option value="cpf">CPF</option>
            <option value="phone">Telefone</option>
            <option value="email">E-mail</option>
            <option value="random">Chave Aleatória</option>
          </select>
        </div>

        <Input
          label="Chave Pix"
          placeholder="Digite sua chave Pix..."
          value={pixKey}
          onChange={(e) => {edited();setPixKey(e.target.value);}}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
        <Input
          ref={nameRef}
          label="Nome do Beneficiário"
          placeholder="Ex: Minha Empresa LTDA"
          value={merchantName}
          maxLength={25}
          helperText={`${merchantName.length}/25 caracteres (máx. 25 — padrão Bacen)`}
          onChange={(e) => {edited();setMerchantName(e.target.value);}}
        />
        <Input
          label="Cidade do Beneficiário"
          placeholder="Ex: São Paulo"
          value={merchantCity}
          maxLength={15}
          helperText={`${merchantCity.length}/15 caracteres (máx. 15 — padrão Bacen)`}
          onChange={(e) => {edited();setMerchantCity(e.target.value);}}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
        <Button
          style={isMobile?{width:"100%",minHeight:44,height:"auto",whiteSpace:"normal",overflowWrap:"anywhere"}:undefined}
          size="sm"
          variant="primary"
          type="submit"
          disabled={discard.isPending||isSaving||isRefreshing||!ready||!canManage||!hasChanges}
          prefixIcon={<Check size={14} />}
        >
          {isSaving ? "Salvando..." : "Salvar Configurações Pix"}
        </Button>
      </div>
      </fieldset>
    </form>
  );
};

const AbacatePayConfiguration: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const canManage = hasWorkspacePermission(activeWorkspace?.role, "workspace:manage");
  const { isMobile } = useBreakpoint();

  const [config, setConfig] = useState<import("../../services/api-client").AbacatePayConfigResponse | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = activeWorkspace?.id
    ? `${window.location.origin}/v1/webhooks/abacatepay/${activeWorkspace.id}`
    : "";

  useEffect(() => {
    if (!activeWorkspace?.id || !token) return;
    setIsLoading(true);
    apiClient
      .getAbacatePayConfig(activeWorkspace.id)
      .then((res) => {
        setConfig(res);
        setEnabled(res.enabled);
      })
      .catch((err) => {
        setErrorMsg(userFacingError(err, "Não foi possível carregar as credenciais do AbacatePay."));
      })
      .finally(() => setIsLoading(false));
  }, [activeWorkspace?.id, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWorkspace?.id || isSaving || !canManage) return;

    setIsSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload: { apiKey?: string; webhookSecret?: string; enabled?: boolean } = {
        enabled,
      };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();

      await apiClient.updateAbacatePayConfig(activeWorkspace.id, payload);

      setSuccessMsg("Credenciais do AbacatePay atualizadas com sucesso!");
      setApiKey("");
      setWebhookSecret("");
      const updated = await apiClient.getAbacatePayConfig(activeWorkspace.id);
      setConfig(updated);
      setEnabled(updated.enabled);
    } catch (err) {
      setErrorMsg(userFacingError(err, "Falha ao salvar credenciais do AbacatePay."));
    } finally {
      setIsSaving(false);
    }
  };

  const copyWebhookUrl = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusVariant = config?.enabled && config?.isConfigured
    ? ("operational" as const)
    : config?.isConfigured
    ? ("warning" as const)
    : ("neutral" as const);

  const statusLabel = config?.enabled && config?.isConfigured
    ? "Ativo em Produção"
    : config?.isConfigured
    ? "Pausado"
    : "Não Configurado";

  return (
    <form
      onSubmit={handleSave}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
              Gateway AbacatePay (Pix Dinâmico & Baixa Automática)
            </h2>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: "4px 0 0 0" }}>
            Integração nativa com AbacatePay para emissão de QRCodes dinâmicos com identificação do cliente e baixa em tempo real via Webhook HMAC-SHA256.
          </p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "rgba(34, 197, 94, 0.06)",
          border: "1px solid rgba(34, 197, 94, 0.22)",
          borderRadius: "var(--radius-md)",
          padding: "12px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <div style={{ maxWidth: "480px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ fontSize: "15px" }} role="img" aria-label="Abacate">🥑</span>
            <strong style={{ fontSize: "var(--font-size-xs)", color: "var(--text-primary)" }}>
              Ainda não possui conta no AbacatePay?
            </strong>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "11px", color: "var(--text-secondary)", lineHeight: "1.4" }}>
            Crie sua conta pelo link parceiro oficial CHAT SALES para obter baixa em tempo real e taxas reduzidas, ou contrate nossa equipe para fazer todo o setup.
          </p>
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <a
            href="https://abacatepay.com?utm_source=chatsales&utm_medium=partner_portal&utm_campaign=parceiro_mct"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "#16A34A",
              color: "#FFFFFF",
              fontSize: "12px",
              fontWeight: 600,
              textDecoration: "none",
              transition: "opacity 0.2s",
            }}
          >
            <span>Criar Conta AbacatePay</span>
            <ExternalLink size={13} />
          </a>

          <a
            href="https://wa.me/554988447562?text=Ol%C3%A1%20Francisco%2C%20estou%20no%20Cockpit%20do%20Chat%20Sales%20e%20gostaria%20de%20contratar%20a%20implanta%C3%A7%C3%A3o%20assistida%20do%20AbacatePay%20e%20WhatsApp%20para%20minha%20empresa."
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              fontSize: "12px",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <Wrench size={13} />
            <span>Contratar Implantação Assistida</span>
          </a>
        </div>
      </div>

      {successMsg && <Alert variant="info" title="Sucesso">{successMsg}</Alert>}
      {errorMsg && <Alert variant="danger" title="Erro">{errorMsg}</Alert>}
      {isLoading && <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Carregando status do gateway...</p>}

      <fieldset disabled={!canManage || isSaving} style={{ border: 0, padding: 0, margin: 0, display: "grid", gap: "14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "12px" }}>
          <div>
            <Input
              type="password"
              label="API Key (Token de Acesso)"
              placeholder={config?.isConfigured ? `Configurado (${config.maskedApiKey || "••••"})` : "abacate_api_..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              helperText={config?.isConfigured ? "Preencha apenas se desejar substituir a chave atual do CNPJ" : "Chave de API gerada no dashboard do AbacatePay"}
            />
          </div>
          <div>
            <Input
              type="password"
              label="Webhook Secret (Segredo Criptográfico)"
              placeholder={config?.hasWebhookSecret ? "••••••••••••••••" : "abacate_sec_..."}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              helperText={config?.hasWebhookSecret ? "Segredo ativo para validação HMAC" : "Segredo de assinatura configurado no Webhook do AbacatePay"}
            />
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>
            URL do Webhook (Cole no painel da AbacatePay)
          </label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input
              type="text"
              readOnly
              value={webhookUrl}
              style={{
                flex: 1,
                height: isMobile ? "44px" : "36px",
                padding: "0 10px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-subtle)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "monospace",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyWebhookUrl}
              prefixIcon={copied ? <Check size={14} /> : <Copy size={14} />}
            >
              {copied ? "Copiado!" : "Copiar URL"}
            </Button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
          <input
            type="checkbox"
            id="abacatepay-enabled-toggle"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: "16px", height: "16px", cursor: "pointer" }}
          />
          <label htmlFor="abacatepay-enabled-toggle" style={{ fontSize: "var(--font-size-sm)", color: "var(--text-primary)", cursor: "pointer" }}>
            Habilitar AbacatePay como gateway ativo para novas cobranças e propostas
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
          <Button
            size="sm"
            variant="primary"
            type="submit"
            disabled={!canManage || isSaving}
            prefixIcon={<Check size={14} />}
          >
            {isSaving ? "Salvando..." : "Salvar Configurações AbacatePay"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
};
