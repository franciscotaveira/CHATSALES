import { useState, useCallback, useEffect, useRef, type FC, type CSSProperties } from "react";
import { Dialog, Button, Input, SegmentedControl, Alert, useBreakpoint } from "@sos-sales/ui";
import { Check, ArrowRight, ArrowLeft, QrCode } from "lucide-react";
import { apiClient, ApiError } from "../../services/api-client";
import { userFacingError } from "../../utils/user-facing-error";
import { UnsavedChangesNotice, useDiscardChanges } from "../UnsavedChangesNotice";

interface ChannelWizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  token?: string;
  onChannelCreated: () => void;
  onReviewChannels?:()=>void;
  onOpenQr?: (channelId: string, channelName: string) => void;
  initialProvider?: "meta_waba" | "waha" | "evolution";
}

export function sanitizeChannelPhoneE164(raw:string):string|undefined{
 const value=raw.trim(),digits=value.replace(/\D/g,"");
 if(!value)return undefined;
 if(value.startsWith("+"))return /^\+[1-9][0-9]{8,14}$/.test(`+${digits}`)?`+${digits}`:undefined;
 if(digits.length===10||digits.length===11)return `+55${digits}`;
 if((digits.length===12||digits.length===13)&&digits.startsWith("55"))return `+${digits}`;
 return undefined;
}

export const ChannelWizardDialog: FC<ChannelWizardDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onChannelCreated,
  onReviewChannels,
  onOpenQr,
  initialProvider = "meta_waba",
}) => {
  const {isMobile}=useBreakpoint();
  const mobileActionStyle:CSSProperties|undefined=isMobile?{width:"100%",height:"auto",minHeight:44,whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.35}:undefined;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<"meta_waba" | "waha" | "evolution">(initialProvider);
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  // Meta credentials
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaAccountId, setWabaAccountId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  // WAHA / Evolution credentials
  const [sessionName,setSessionName]=useState("");
  const [instanceName,setInstanceName]=useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);
  const [createdChannelName, setCreatedChannelName] = useState<string>("");
  const [wabaMode, setWabaMode] = useState<"manual" | "embedded">("manual");
  const [isEmbeddedLoading, setIsEmbeddedLoading] = useState(false);
  const scope=useRef("");scope.current=`${workspaceId ?? ""}:${token ?? ""}:${isOpen}`;
  const embeddedAttempt=useRef(0);
  const embeddedCleanup=useRef<()=>void>(()=>{});
  const cancelEmbedded=useCallback(()=>{embeddedAttempt.current++;embeddedCleanup.current();embeddedCleanup.current=()=>{};setIsEmbeddedLoading(false);},[]);
  useEffect(()=>()=>{embeddedAttempt.current++;embeddedCleanup.current();},[]);
  const contextGeneration=useRef(0),creationBusy=useRef(false),lookupBusy=useRef(false);
  const credentialsRevision=useRef(0);
  const testRequest=useRef(0);
  const credentialsChanged=()=>{credentialsRevision.current++;setTestResult(null);setErrorMsg(null);};

  // Sync initialProvider when dialog opens
  useEffect(() => {
    contextGeneration.current++;creationBusy.current=false;lookupBusy.current=false;
    cancelEmbedded();
    setIsSubmitting(false);setRegistrationUncertain(false);setWabaMode("manual");
    if (isOpen) {
      credentialsRevision.current++;
      testRequest.current++;setIsTesting(false);
      setStep(1);setDisplayName("");setPhoneNumber("");setCreatedChannelId(null);setSetupMessage(null);setCreatedChannelName("");setTestResult(null);setErrorMsg(null);
      setProvider(initialProvider);
      setBaseUrl("");setApiKey("");setSessionName("");setInstanceName("");setPhoneNumberId("");setAccessToken("");setWabaAccountId("");setAppSecret("");

    }
    return()=>{contextGeneration.current++;testRequest.current++;};
  }, [isOpen, initialProvider,workspaceId,token,cancelEmbedded]);

  const handleProviderChange = (newProvider: "meta_waba" | "waha" | "evolution") => {
    credentialsChanged();
    setProvider(newProvider);
    setBaseUrl("");setApiKey("");setSessionName("");setInstanceName("");setPhoneNumberId("");setAccessToken("");setWabaAccountId("");setAppSecret("");setTestResult(null);setErrorMsg(null);
  };

  const [isTesting, setIsTesting] = useState(false);
  const [setupMessage,setSetupMessage]=useState<string|null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [registrationUncertain,setRegistrationUncertain]=useState(false);
  const fieldsRef=useRef<HTMLFieldSetElement>(null);
  const hasUnsavedChanges=step!==3&&[displayName,phoneNumber,phoneNumberId,accessToken,wabaAccountId,appSecret,sessionName,instanceName,apiKey,baseUrl].some(value=>value.length>0);
  const discardChanges=useDiscardChanges(hasUnsavedChanges,`${workspaceId??""}:${token??""}:${isOpen}:${initialProvider}`,()=>fieldsRef.current?.querySelector<HTMLInputElement>("input")??null,isOpen);



  const handleTestConnection = async () => {
    if (!isOpen || !workspaceId || !token || lookupBusy.current || creationBusy.current || isTesting || discardChanges.isPending) return;
    const requestedScope=scope.current,revision=credentialsRevision.current,context=contextGeneration.current;
    const isCurrent=()=>requestedScope===scope.current&&revision===credentialsRevision.current&&context===contextGeneration.current;
    const request=++testRequest.current;
    lookupBusy.current=true;setIsTesting(true);
    setTestResult(null);

    try {
      const res = await apiClient.testChannelConnection(
        workspaceId,
        {
          provider,
          credentials: {
            accessToken: accessToken.trim() || undefined,
            phoneNumberId: phoneNumberId.trim() || undefined,
            wabaAccountId: wabaAccountId.trim() || undefined,
            appSecret: appSecret.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
            session: provider === "waha" ? sessionName.trim() || undefined : undefined,
            instanceName: provider === "evolution" ? instanceName.trim() || undefined : undefined,
          },
        },
        { token }
      );
      if(!isCurrent())return;
      if(!res||typeof res.success!=='boolean'||[res.message,res.error,res.displayPhoneNumber].some(value=>value!=null&&typeof value!=='string'))throw new Error('O servidor não confirmou um resultado válido para o teste. Revise os dados e consulte novamente.');
      setTestResult({
        success: res.success,
        message: res.success
          ? res.message || "Consulta ao provedor concluída. Sessão, envio e recebimento ainda precisam de verificação."
          : res.error || res.message || "O provedor não confirmou a consulta. Revise os dados e tente novamente.",
      });
      if (res.success && res.displayPhoneNumber && !phoneNumber.trim()) {
        setPhoneNumber(res.displayPhoneNumber);
      }
    } catch (err: unknown) {
      if(!isCurrent())return;
      setTestResult({
        success: false,
        message: userFacingError(err,"Falha ao testar conexão."),
      });
    } finally {
      if(request===testRequest.current&&context===contextGeneration.current){lookupBusy.current=false;setIsTesting(false);}
    }
  };

  const recordRegistrationFailure=(error:unknown)=>{
    const rejected=error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408;
    if(rejected)setErrorMsg(userFacingError(error,"O servidor recusou o cadastro. Revise os dados antes de tentar novamente."));
    else {setRegistrationUncertain(true);setErrorMsg(null);}
  };

  const handleCreateChannel = async () => {
    if (!isOpen || !workspaceId || !token || !displayName.trim() || creationBusy.current || isSubmitting || registrationUncertain || discardChanges.isPending) return;
    if(provider === "evolution" && !instanceName.trim()){setErrorMsg("Informe o nome exato da instância Evolution fornecido pelo responsável técnico.");return;}
    if(phoneNumber.trim()&&!sanitizeChannelPhoneE164(phoneNumber)){setErrorMsg("Informe um telefone válido: número brasileiro com DDD ou formato internacional com + e código do país.");return;}
    const requestedScope=scope.current,revision=credentialsRevision.current,context=contextGeneration.current;
    const isCurrent=()=>requestedScope===scope.current&&revision===credentialsRevision.current&&context===contextGeneration.current;
    creationBusy.current=true;setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.createChannel(
        workspaceId,
        {
          provider,
          displayName: displayName.trim(),
          phoneNumberE164: sanitizeChannelPhoneE164(phoneNumber),
          credentials: {
            accessToken: accessToken.trim() || undefined,
            phoneNumberId: phoneNumberId.trim() || undefined,
            wabaAccountId: wabaAccountId.trim() || undefined,
            appSecret: appSecret.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
            session: provider === "waha" ? sessionName.trim() || undefined : undefined,
            instanceName: provider === "evolution" ? instanceName.trim() || undefined : undefined,
          },
        },
        { token }
      );
      if(!isCurrent())return;
      if (typeof res?.channel?.id!=='string'||!res.channel.id.trim()||typeof res.channel.displayName!=='string'||res.channel.displayName!==displayName.trim()||res.channel.provider!==provider||res.channel.workspaceId!==workspaceId||typeof res.channel.isActive!=='boolean')throw new Error("O cadastro não confirmou o canal solicitado. Confira a lista antes de tentar novamente.");
      if (res?.channel?.id) {
        setCreatedChannelId(res.channel.id);
        setCreatedChannelName(res.channel.displayName);
      }
      setStep(3);
      try{await onChannelCreated();}catch{if(isCurrent())setSetupMessage("Cadastro salvo, mas a lista não pôde ser atualizada. Atualize os canais ao concluir.");}
    } catch (err: unknown) {
      if(isCurrent())recordRegistrationFailure(err);
    } finally {
      if(isCurrent()){creationBusy.current=false;setIsSubmitting(false);}
    }
  };

  const handleLaunchFacebookLogin = () => {
    if(!workspaceId||!token||!displayName.trim()||isEmbeddedLoading||isSubmitting||registrationUncertain)return;
    cancelEmbedded();
    const attempt=++embeddedAttempt.current,requestedScope=scope.current;
    const valid=()=>attempt===embeddedAttempt.current&&requestedScope===scope.current;
    let provisioning=false;
    let ids={phone:"",waba:""};
    setPhoneNumberId("");setWabaAccountId("");
    let auth:{code?:string;accessToken?:string}|null=null;
    let script:HTMLScriptElement|null=null;
    setIsEmbeddedLoading(true);setErrorMsg(null);setSetupMessage(null);
    const cleanup=()=>{
      window.clearTimeout(timer);window.removeEventListener("message",messageListener);
      if(script){script.onload=null;script.onerror=null;script.remove();}
    };
    embeddedCleanup.current=cleanup;
    const fail=(message:string)=>{if(!valid()||provisioning)return;cleanup();embeddedAttempt.current++;setIsEmbeddedLoading(false);setErrorMsg(message);};
    const maybeProvision=()=>{
      if(!valid()||provisioning||!auth||!ids.phone||!ids.waba)return;
      provisioning=true;cleanup();setIsEmbeddedLoading(false);setIsSubmitting(true);
      void apiClient.metaEmbeddedSignup(workspaceId,{displayName:displayName.trim(),...auth,wabaAccountId:ids.waba,phoneNumberId:ids.phone},{token})
        .then(async res=>{if(!valid())return;if(typeof res?.channel?.id!=="string"||!res.channel.id.trim()||res.channel.workspaceId!==workspaceId||res.channel.provider!=="meta_waba"||res.channel.displayName!==displayName.trim()||res.channel.isActive!==false||!res.setup||!["confirmed","failed","uncertain"].includes(res.setup.subscriptionStatus)||res.setup.requiresConnectionApproval!==true||typeof res.setup.message!=="string")throw new Error("O retorno não confirmou o cadastro Meta solicitado. Confira os canais antes de tentar novamente.");setCreatedChannelId(res.channel.id);setCreatedChannelName(res.channel.displayName);setSetupMessage(res.setup.message||"Cadastro salvo. Confira a assinatura de webhooks e confirme a conexão antes de usar a linha.");setStep(3);try{await onChannelCreated();}catch{if(valid())setSetupMessage("Cadastro salvo, mas a lista não pôde ser atualizada. Atualize os canais ao concluir.");}})
        .catch(error=>{if(valid())recordRegistrationFailure(error);})
        .finally(()=>{if(valid())setIsSubmitting(false);});
    };
    const messageListener=(event:MessageEvent)=>{
      if(!valid()||provisioning||!["https://www.facebook.com","https://web.facebook.com"].includes(event.origin))return;
      try{
        const data=typeof event.data==="string"?JSON.parse(event.data):event.data;
        if(!data||data.type!=="WA_EMBEDDED_SIGNUP")return;
        if(data.event==="CANCEL"){fail("Conexão cancelada na Meta. Você pode tentar novamente.");return;}
        if(data.event==="ERROR"){fail("A Meta não concluiu a conexão. Confira a conta e tente novamente.");return;}
        if(!data.data||typeof data.data!=="object")return;
        if(typeof data.data.phone_number_id==="string"&&/^\d+$/.test(data.data.phone_number_id)){ids.phone=data.data.phone_number_id;setPhoneNumberId(ids.phone);}
        if(typeof data.data.waba_id==="string"&&/^\d+$/.test(data.data.waba_id)){ids.waba=data.data.waba_id;setWabaAccountId(ids.waba);}
        maybeProvision();
      }catch{ /* Malformed provider messages do not change this attempt. */ }
    };
    const timer=window.setTimeout(()=>fail(auth?"A autorização chegou sem os identificadores da linha. Confira a seleção na Meta e tente novamente.":"A Meta não concluiu o login. Confira se o navegador bloqueou a janela e tente novamente."),45000);
    window.addEventListener("message",messageListener);
    const executeLogin=()=>{
      if(!valid())return;
      try{
        (window as any).FB.login((response:any)=>{
          if(!valid()||provisioning)return;
          if(!response?.authResponse?.code&&!response?.authResponse?.accessToken){fail("Autenticação da Meta cancelada ou janela fechada.");return;}
          auth={code:response.authResponse.code,accessToken:response.authResponse.accessToken};
          if(!ids.phone&&/^\d+$/.test(response.authResponse.phone_number_id||""))ids.phone=response.authResponse.phone_number_id;
          if(!ids.waba&&/^\d+$/.test(response.authResponse.waba_id||""))ids.waba=response.authResponse.waba_id;
          maybeProvision();
        },{scope:"whatsapp_business_management,whatsapp_business_messaging",response_type:"code",override_default_response_type:true,extras:{feature:"whatsapp_embedded_signup",version:2}});
      }catch{fail("Não foi possível abrir o login da Meta. Confira o bloqueio de janelas e tente novamente.");}
    };
    if((window as any).FB){executeLogin();return;}
    script=document.createElement("script");script.src="https://connect.facebook.net/pt_BR/sdk.js";script.async=true;script.defer=true;script.crossOrigin="anonymous";
    script.onload=()=>{if(!valid())return;try{(window as any).FB.init({appId:"2294262161340902",autoLogAppEvents:true,xfbml:true,version:"v21.0"});executeLogin();}catch{fail("Não foi possível inicializar o login da Meta. Tente novamente ou use a configuração manual.");}};
    script.onerror=()=>fail("Não foi possível carregar o login da Meta. Confira sua conexão e as extensões do navegador.");
    document.body.appendChild(script);
  };

  const handleClose = useCallback(() => {
    if(isSubmitting)return;
    cancelEmbedded();
    credentialsRevision.current++;
    testRequest.current++;lookupBusy.current=false;setIsTesting(false);
    setStep(1);
    setDisplayName("");
    setPhoneNumber("");
    setAccessToken("");
    setPhoneNumberId("");
    setApiKey("");setSessionName("");setBaseUrl("");setAppSecret("");setWabaAccountId("");setCreatedChannelId(null);setSetupMessage(null);setCreatedChannelName("");
    setTestResult(null);setRegistrationUncertain(false);
    setErrorMsg(null);
    onClose();
  }, [onClose,isSubmitting,cancelEmbedded]);

  const requestClose=()=>{
    if(isSubmitting)return;
    cancelEmbedded();
    discardChanges.requestExit(handleClose);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      title={step === 3 ? "Canal cadastrado" : "Conectar Nova Linha WhatsApp"}
      description={
        step === 1
          ? "Escolha o tipo de integração e identifique a nova linha."
          : step === 2
          ? "Insira as credenciais de autenticação da instância."
          : "Confira a conexão e as permissões antes de iniciar o atendimento."
      }
    >
      {registrationUncertain&&<Alert variant="warning" title="Cadastro sem confirmação">
        <p>O servidor pode ter salvo este canal. Não repita o cadastro antes de conferir a lista. Os campos permanecem nesta janela; encerrar o rascunho os descarta.</p>
        <Button variant="secondary" onClick={()=>{handleClose();onReviewChannels?.();}}>Encerrar rascunho e conferir canais</Button>
      </Alert>}
      {isEmbeddedLoading&&<Button style={mobileActionStyle} variant="secondary" onClick={()=>{cancelEmbedded();setErrorMsg(null);}}>Cancelar login da Meta</Button>}
      {discardChanges.isPending&&<UnsavedChangesNotice onKeep={discardChanges.keepEditing} onDiscard={discardChanges.discard} disabled={isSubmitting}/>}
      <fieldset ref={fieldsRef} disabled={isSubmitting||isEmbeddedLoading||discardChanges.isPending} style={{ border:0,margin:0,minWidth:0,display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
        {errorMsg && (
          <Alert variant="danger" title="Erro no Provisionamento">
            {errorMsg}
          </Alert>
        )}

        {step === 1 && (
          <>
            <div>
              <label style={{ display: "block", fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 500, marginBottom: "6px" }}>
                Provedor WhatsApp
              </label>
              {isMobile?<select aria-label="Provedor WhatsApp" value={provider} onChange={event=>handleProviderChange(event.target.value as typeof provider)} style={{width:"100%",minHeight:44}}><option value="meta_waba">Meta Cloud API</option><option value="waha">WAHA (QR Code)</option><option value="evolution">Evolution API</option></select>:(
              <SegmentedControl aria-label="Provedor WhatsApp"
                value={provider}
                onChange={(val) => handleProviderChange(val as any)}
                options={[
                  { value: "meta_waba", label: "Meta Cloud API" },
                  { value: "waha", label: "WAHA (QR Code)" },
                  { value: "evolution", label: "Evolution API" },
                ]}
              />
              )}
            </div>

            <Input
              label="Nome de Identificação da Linha"
              placeholder="Ex: Comercial Principal, Suporte VIP"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />

            <Input
              label="Número do WhatsApp (Opcional)"
              placeholder="+55 49 99999-8888"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
            {provider === "meta_waba" && (
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "-10px", display: "block" }}>
                💡 Use Testar Conexão na próxima etapa para consultar o número na Meta. Salvar o cadastro não consulta nem ativa a linha automaticamente.
              </span>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px",flexDirection:isMobile?"column":"row" }}>
              <Button style={mobileActionStyle} size="sm" variant="secondary" onClick={requestClose}>
                Cancelar
              </Button>
              <Button
                style={mobileActionStyle}
                size="sm"
                variant="primary"
                disabled={!displayName.trim()}
                onClick={() => setStep(2)}
                prefixIcon={<ArrowRight size={14} />}
              >
                Continuar
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {provider === "meta_waba" ? (
              <>
                {isMobile?<label style={{display:"grid",gap:6,fontSize:"var(--font-size-xs)"}}>Método de conexão Meta<select value={wabaMode} onChange={event=>setWabaMode(event.target.value as typeof wabaMode)} style={{width:"100%",minHeight:44}}><option value="manual">Configuração manual</option><option value="embedded">Login com Facebook</option></select></label>:(
                <SegmentedControl aria-label="Método de conexão Meta"
                  value={wabaMode}
                  onChange={(val) => setWabaMode(val as "manual" | "embedded")}
                  options={[
                    { value: "manual", label: "🔑 Inserir Token & IDs (Manual)" },
                    { value: "embedded", label: "🔵 Login com Facebook" },
                  ]}
                />
                )}

                {wabaMode === "embedded" ? (
                  <div
                    style={{
                      padding: "16px",
                      backgroundColor: "rgba(24, 119, 242, 0.05)",
                      border: "1px solid rgba(24, 119, 242, 0.25)",
                      borderRadius: "var(--radius-lg)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          backgroundColor: "#1877F2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontWeight: "bold",
                          fontSize: "18px",
                          flexShrink: 0,
                        }}
                      >
                        f
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                          Conectar WhatsApp pela Meta
                        </h4>
                        <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                          Uma janela oficial da Meta será aberta para você escolher a empresa e a linha do WhatsApp. Confira a conta e as permissões antes de autorizar. Ao concluir, confira o resultado da assinatura de webhooks. O cadastro permanece inativo até confirmar a conexão.
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "10px 12px",
                        backgroundColor: "var(--bg-surface)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      <div>O aplicativo poderá gerenciar a conta do WhatsApp Business e enviar mensagens pela linha autorizada.</div>
                      <details style={{overflowWrap:"anywhere"}}><summary>Detalhes das permissões</summary><code>whatsapp_business_management</code>, <code>whatsapp_business_messaging</code></details>
                    </div>

                    <div style={{ display: "flex", gap: "8px" }}>
                      <Button
                        size="md"
                        variant="primary"
                        style={{
                          backgroundColor: "#1877F2",
                          borderColor: "#1877F2",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          fontWeight: 600,
                          color: "#fff",
                          flex: 1,
                          ...mobileActionStyle,
                        }}
                        onClick={handleLaunchFacebookLogin}
                        disabled={isEmbeddedLoading || isSubmitting || registrationUncertain}
                      >
                        {isEmbeddedLoading ? "Iniciando Login Meta..." : "Conectar com Facebook"}
                      </Button>

                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "rgba(37, 99, 235, 0.08)",
                        border: "1px solid rgba(37, 99, 235, 0.2)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-secondary)",
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>💡 Credenciais da Meta Cloud API:</strong> Insira o Token de Usuário do Sistema e os IDs do WhatsApp Business. Dica: você pode clicar em <strong>Testar Conexão</strong> para validar a linha e obter o número oficial automaticamente antes de salvar.
                    </div>
                    <Input
                      label="Token de Acesso Permanente (System User Token)"
                      placeholder="EAAB..."
                      type="password"
                  autoComplete="new-password"
                      value={accessToken}
                      onChange={(e) => {credentialsChanged();setAccessToken(e.target.value);}}
                      required
                    />
                    <Input
                      label="Phone Number ID"
                      placeholder="Ex: 1049283749283"
                      value={phoneNumberId}
                      onChange={(e) => {credentialsChanged();setPhoneNumberId(e.target.value);}}
                      required
                    />
                    <Input
                      label="WABA Account ID (necessário para confirmar a conexão)"
                      placeholder="Ex: 1982736452819"
                      value={wabaAccountId}
                      onChange={(e) => {credentialsChanged();setWabaAccountId(e.target.value);}}
                    />
                    <Input
                      label="App Secret (Meta App)"
                      placeholder="Opcional..."
                      type="password"
                  autoComplete="new-password"
                      value={appSecret}
                      onChange={(e) => {credentialsChanged();setAppSecret(e.target.value);}}
                    />
                  </>
                )}
              </>
            ) : provider === "waha" ? (
              <>
                <div
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Conexão WAHA:</strong> Informe o servidor e as credenciais fornecidos pelo responsável técnico. Salvar o cadastro não conecta o aparelho. Depois, consulte ou crie a sessão, leia o QR Code e confirme o número.
                </div>
                <Input
                  label="URL Base da Instância WAHA (Servidor Interno)"
                  placeholder="https://whatsapp.suaempresa.com"
                  type="url"
                  name="waha-provider-base-url"
                  autoComplete="off"
                  value={baseUrl}
                  onChange={(e) => {credentialsChanged();setBaseUrl(e.target.value);}}
                  required
                />
                <Input
                  label="API Key / Chave de Acesso WAHA"
                  placeholder="Chave da sua instância"
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => {credentialsChanged();setApiKey(e.target.value);}}
                />
                {provider === "waha" && <Input label="Nome de uma sessão existente (opcional)" placeholder="Deixe vazio para criar uma sessão exclusiva" value={sessionName} onChange={event=>{credentialsChanged();setSessionName(event.target.value);}} />}
              </>
            ) : (
              <>
                <Alert variant="info">Informe o servidor e o nome exato da instância fornecidos pelo responsável técnico. Consultar o servidor não confirma qual linha está conectada nem autoriza envio.</Alert>
                <Input
                  label="Nome da instância Evolution"
                  placeholder="Nome exato no servidor"
                  name="evolution-instance-name"
                  autoComplete="off"
                  value={instanceName}
                  onChange={event=>{credentialsChanged();setInstanceName(event.target.value);}}
                  required
                />
                <Input
                  label="URL do servidor Evolution"
                  placeholder="http://seu-servidor:8080"
                  type="url"
                  name="evolution-provider-base-url"
                  autoComplete="off"
                  value={baseUrl}
                  onChange={(e) => {credentialsChanged();setBaseUrl(e.target.value);}}
                  required
                />
                <Input
                  label="API Key / Chave Global Evolution"
                  placeholder="Sua chave de acesso..."
                  type="password"
                  autoComplete="new-password"
                  value={apiKey}
                  onChange={(e) => {credentialsChanged();setApiKey(e.target.value);}}
                />
              </>
            )}

            {testResult && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-xs)",
                  backgroundColor: testResult.success ? "var(--color-action-subtle)" : "var(--color-danger-subtle)",
                  color: testResult.success ? "var(--color-action)" : "var(--color-danger)",
                  border: testResult.success ? "1px solid var(--color-action-border)" : "1px solid var(--color-danger-border)",
                }}
              >
                {testResult.message || "O provedor não confirmou a consulta."}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems:isMobile?"stretch":"center", marginTop: "8px",gap:8,flexDirection:isMobile?"column":"row" }}>
              <Button style={mobileActionStyle} size="sm" variant="ghost" prefixIcon={<ArrowLeft size={14} />} onClick={() => setStep(1)}>
                Voltar
              </Button>
              <div style={{ display: "flex", gap: "8px", alignItems:isMobile?"stretch":"center",flexDirection:isMobile?"column":"row" }}>
                {!(provider === "meta_waba" && wabaMode === "embedded") ? (
                  <>
                    <Button style={mobileActionStyle} size="sm" variant="secondary" onClick={handleTestConnection} disabled={isTesting}>
                      {isTesting ? "Testando..." : "Testar Conexão"}
                    </Button>
                    <Button style={mobileActionStyle} size="sm" variant="primary" onClick={handleCreateChannel} disabled={isSubmitting||registrationUncertain}>
                      {isSubmitting ? "Salvando..." : "Salvar Canal"}
                    </Button>
                  </>
                ) : (
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    {isEmbeddedLoading ? "Aguardando janela da Meta..." : "Autorização pelo botão acima"}
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "12px 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-action-subtle)",
                color: "var(--color-action)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={24} />
            </div>
            <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>
              Cadastro do canal concluído
            </div>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", textAlign: "center", margin: 0 }}>
              {setupMessage || (provider === "waha"
                ? "Consulte a sessão, inicie-a se necessário e leia o QR Code quando disponível. Depois confira o número e confirme a conexão. Cadastrar não ativa o atendimento."
                : "Confira o estado da conexão na lista de canais. O cadastro não confirma a entrega de mensagens nem libera a IA automaticamente.")}
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px",width:isMobile?"100%":undefined,flexDirection:isMobile?"column":"row" }}>
              {provider === "waha" && onOpenQr && createdChannelId && (
                <Button
                  style={mobileActionStyle}
                  size="sm"
                  variant="primary"
                  prefixIcon={<QrCode size={16} />}
                  onClick={() => {
                    const chId = createdChannelId;
                    const chName = createdChannelName || displayName;
                    handleClose();
                    onOpenQr(chId, chName);
                  }}
                >
                  Consultar conexão
                </Button>
              )}
              <Button style={mobileActionStyle} size="sm" variant={provider === "waha" ? "secondary" : "primary"} onClick={handleClose}>
                {provider === "waha" ? "Fazer Isso Mais Tarde" : "Concluir"}
              </Button>
            </div>
          </div>
        )}
      </fieldset>
    </Dialog>
  );
};
