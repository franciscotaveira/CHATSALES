import {hasWorkspacePermission} from "@sos-sales/contracts";
import { useState, useEffect, useRef, type FC } from "react";
import { Button, Input, Alert, useBreakpoint } from "@sos-sales/ui";
import { useDiscardChanges, UnsavedChangesNotice } from "../UnsavedChangesNotice";
import { Check } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient } from "../../services/api-client";
import { userFacingError } from "../../utils/user-facing-error";

const pixKeyTypes=["cpf","cnpj","email","phone","random"];
const displayPixKeyType=(value:string|null|undefined)=>{const stored=value?.trim()||"cnpj";return pixKeyTypes.includes(stored.toLowerCase())?stored.toLowerCase():stored;};

export const PixSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const context=JSON.stringify([session.activeWorkspace?.id,session.activeWorkspace?.role,session.token]);
  return <PixConfiguration key={context} session={session}/>;
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
