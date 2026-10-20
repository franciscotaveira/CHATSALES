import {useDiscardChanges,UnsavedChangesNotice} from "../UnsavedChangesNotice";
import {resolveAiCapabilities} from '@sos-sales/contracts';
import {applyPlaybookDraft,type PlaybookDraft} from './ai-playbook-draft';
import {AiRevisionTests} from './AiRevisionTests';
import {AiConfigReview} from "./AiConfigReview";
import { GuidedAgentSetup } from "./GuidedAgentSetup";
import { userFacingError } from "../../utils/user-facing-error";
import { useState, useEffect, useRef, useId, type FC } from "react";
import { Button, Input, Dialog } from "@sos-sales/ui";
import {
  Bot,
  Sparkles,
  CheckCircle2,
  Zap,
  ShoppingBag,
  QrCode,
  Calendar,
  BarChart3,
  Save,
  ShieldCheck,
  HelpCircle,
  Plus,
  Trash2,
  Clock,
  MapPin,
  CreditCard,
  AlertTriangle,
  Cpu,
  Play,
  Key,
  Terminal,
  Loader2,
  Building2,
  Target,
  MessageSquare,
  Smile,
  UserCheck,
  Check,
  Briefcase,
  ArrowRight,
} from "lucide-react";
import { NICHE_PLAYBOOKS } from "./playbooks";
import {
  apiClient,
  type AiAgentConfig,
  type AiConfigVersionInfo,
  type AiAgentConfigResponse,
  ApiError,
  type AiBusinessRules,
  type AiFaqItem,
  type AiSimulationResult,
  type GroundedObjections,
} from "../../services/api-client";

interface AiAgentSectionProps {
  workspaceId?: string;
  token?: string;
}

export const AiAgentSection: FC<AiAgentSectionProps> = ({ workspaceId, token }) => {
  const fieldId=useId();
  const [version,setVersion]=useState<AiConfigVersionInfo>({draftRevision:0,activeRevision:0,activeEnabled:false,sourceGuidedRevision:null});
  const [activeConfig,setActiveConfig]=useState<AiAgentConfig|null>(null);
  const [savedFormSignature,setSavedFormSignature]=useState("");
  const [preparedNotice,setPreparedNotice]=useState("");
  const [guidedUnsaved,setGuidedUnsaved]=useState(false),[testsUnsaved,setTestsUnsaved]=useState(false);
  const [guidedBusy,setGuidedBusy]=useState(false),[testsBusy,setTestsBusy]=useState(false);
  const fieldsRef=useRef<HTMLFieldSetElement>(null);
  const [editorOpen,setEditorOpen]=useState(false);
  const editorHeading=useRef<HTMLHeadingElement>(null);
  const focusPrepared=useRef(false);
  const [draftConflict,setDraftConflict]=useState(false);
  const [draftComparison,setDraftComparison]=useState<AiAgentConfigResponse|null>(null);
  const [comparingDraft,setComparingDraft]=useState(false);
  const [loading, setLoading] = useState(false);
  const [suspending,setSuspending]=useState(false);
  const [saving, setSaving] = useState(false);
  const outcomeRef=useRef<HTMLParagraphElement>(null);
  const focusOutcome=useRef(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playbookAppliedNotice, setPlaybookAppliedNotice] = useState<string | null>(null);
  const playbookNoticeRef=useRef<HTMLDivElement>(null),focusPlaybookNotice=useRef(false);
  useEffect(()=>{if(focusPlaybookNotice.current&&playbookAppliedNotice){playbookNoticeRef.current?.focus();focusPlaybookNotice.current=false;}},[playbookAppliedNotice]);
  const [playbookPreview,setPlaybookPreview]=useState<string|null>(null);
  const [replacePlaybookFields,setReplacePlaybookFields]=useState(false);
  const [playbookUndo,setPlaybookUndo]=useState<{before:PlaybookDraft;signature:string}|null>(null);
  const scope=useRef("");scope.current=`${workspaceId ?? ""}:${token ?? ""}`;
  const generation=useRef(0);
  const saveRequest=useRef<symbol|null>(null);
  const simulationRequest=useRef<symbol|null>(null);
  const [savedProvider,setSavedProvider]=useState<"nvidia"|"openrouter">("nvidia");
  const [simSnapshot,setSimSnapshot]=useState<{message:string;leadName:string;pixScenario:string;agentName:string;configuration:string;revision:number}|null>(null);
  const [loadedScope,setLoadedScope]=useState<string | null>(null);
  const [loadError,setLoadError]=useState<string | null>(null);
  const [reload,setReload]=useState(0);

  const [enabled, setEnabled] = useState(true);
  const [name, setName] = useState("Assistente Virtual");
  const [personality, setPersonality] = useState<AiAgentConfig["personality"]>("cordial_comercial");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [strictMode, setStrictMode] = useState(true);
  const [temperature, setTemperature] = useState(0.1);

  // Multi-Provider & Model State
  const [provider, setProvider] = useState<"nvidia" | "openrouter">("nvidia");
  const [model, setModel] = useState("nvidia/nemotron-3-super-120b-a12b");
  const [apiKey, setApiKey] = useState("");
  const [hasCustomApiKey, setHasCustomApiKey] = useState(false);

  // Simulation Playground State & Mock Lead
  const [simInput, setSimInput] = useState("");
  const [simLoading, setSimLoading] = useState(false);
  const [simResult, setSimResult] = useState<AiSimulationResult | null>(null);
  const [simError, setSimError] = useState<string | null>(null);
  const [mockLeadName, setMockLeadName] = useState("Francisco");
  const [mockPixScenario, setMockPixScenario] = useState<"none" | "pending" | "paid">("none");

  const [businessRules, setBusinessRules] = useState<AiBusinessRules>({
    checkoutValidityMinutes:15,companyName: "",
    agentRole: "",
    valueProposition: "",
    niche: "",
    openingHours: "",
    address: "",
    cancellationPolicy: "",
    paymentMethods: "",
    generalRules: "",
    objections: {
      priceDiscount: "",
      thinkAboutIt: "",
      guaranteeTrust: "",
      deliveryTimeline: "",
    },
    ctaRule: true,
    emojiDensity: "moderate",
  });

  const [faq, setFaq] = useState<AiFaqItem[]>([]);
  const [faqIssue,setFaqIssue]=useState<{index:number;field:"question"|"answer";message:string}|null>(null);
  const [removedFaq,setRemovedFaq]=useState<{item:AiFaqItem;index:number}|null>(null);

  const [skills, setSkills] = useState<{
    qualify_lead: boolean;
    catalog_offers: boolean;
    pix_charges: boolean;
    appointments: boolean;
    capi_tracking: boolean;
  }>({
    qualify_lead: false,
    catalog_offers: false,
    pix_charges: false,
    appointments: false,
    capi_tracking: false,
  });

  useEffect(() => {
    if (!workspaceId || !token) return;
    let cancelled=false;
    const gen=++generation.current;
    saveRequest.current=null;simulationRequest.current=null;setSaving(false);setSuspending(false);setSimLoading(false);setSimSnapshot(null);setDraftConflict(false);setDraftComparison(null);setComparingDraft(false);
    const requestedScope=scope.current;
    setRemovedFaq(null);setFaqIssue(null);setLoadedScope(null);setLoadError(null);setApiKey("");setSimResult(null);setSimError(null);setSimInput("");setPlaybookAppliedNotice(null);setPlaybookPreview(null);setPlaybookUndo(null);setReplacePlaybookFields(false);focusPlaybookNotice.current=false;
    setLoading(true);
    setErrorMsg(null);
    apiClient
      .getAiAgentConfig(workspaceId, { token })
      .then((res) => {
        if(cancelled||requestedScope!==scope.current)return;
        if(!res.config)throw new Error("Configuração de IA indisponível. Tente novamente.");
        if (res.config) {
          setVersion(res.version??{draftRevision:0,activeRevision:0,activeEnabled:res.config.enabled,sourceGuidedRevision:null});
          setActiveConfig(res.activeConfig??res.config);
          setEnabled(res.config.enabled);
          setName(res.config.name || "Assistente Virtual");
          setPersonality(res.config.personality || "cordial_comercial");
          setSystemPrompt(res.config.systemPrompt || "");
          setStrictMode(res.config.strictMode ?? true);
          setTemperature(res.config.temperature !== undefined ? Number(res.config.temperature) : 0.1);
          setProvider(res.config.provider || "nvidia");setSavedProvider(res.config.provider || "nvidia");
          setModel(
            res.config.model ||
              (res.config.provider === "openrouter"
                ? "anthropic/claude-3.5-sonnet"
                : "nvidia/nemotron-3-super-120b-a12b")
          );
          setHasCustomApiKey(Boolean(res.config.hasCustomApiKey));
          setApiKey("");
          setBusinessRules({
            checkoutValidityMinutes:res.config.businessRules?.checkoutValidityMinutes??15,companyName: res.config.businessRules?.companyName || "",
            agentRole: res.config.businessRules?.agentRole || "",
            valueProposition: res.config.businessRules?.valueProposition || "",
            niche: res.config.businessRules?.niche || "",
            openingHours: res.config.businessRules?.openingHours || "",
            address: res.config.businessRules?.address || "",
            cancellationPolicy: res.config.businessRules?.cancellationPolicy || "",
            paymentMethods: res.config.businessRules?.paymentMethods || "",
            generalRules: res.config.businessRules?.generalRules || "",
            objections: {
              priceDiscount: res.config.businessRules?.objections?.priceDiscount || "",
              thinkAboutIt: res.config.businessRules?.objections?.thinkAboutIt || "",
              guaranteeTrust: res.config.businessRules?.objections?.guaranteeTrust || "",
              deliveryTimeline: res.config.businessRules?.objections?.deliveryTimeline || "",
            },
            ctaRule: res.config.businessRules?.ctaRule !== undefined ? Boolean(res.config.businessRules?.ctaRule) : true,
            emojiDensity: res.config.businessRules?.emojiDensity || "moderate",
          });
          setFaq(Array.isArray(res.config.faq) ? res.config.faq : []);
          setSkills({
            qualify_lead: res.config.skills?.qualify_lead === true,
            catalog_offers: res.config.skills?.catalog_offers === true,
            pix_charges: res.config.skills?.pix_charges === true,
            appointments: res.config.skills?.appointments === true,
            capi_tracking: res.config.skills?.capi_tracking === true,
          });
          setLoadedScope(requestedScope);
        }
      })
      .catch((err: unknown) => {
        if(!cancelled&&requestedScope===scope.current)setLoadError(userFacingError(err,"Falha ao carregar configurações da IA."));
      })
      .finally(() => {if(!cancelled&&requestedScope===scope.current)setLoading(false);});
    return()=>{cancelled=true;if(generation.current===gen)generation.current++;};
  }, [workspaceId, token,reload]);

  useEffect(()=>{setPreparedNotice("");setEditorOpen(false);focusPrepared.current=false;focusOutcome.current=false;},[workspaceId,token]);
  useEffect(()=>{if(focusOutcome.current&&loadedScope===scope.current&&(errorMsg||preparedNotice)){outcomeRef.current?.focus();focusOutcome.current=false;}},[errorMsg,preparedNotice,loadedScope]);

  const handleToggleSkill = (skillKey: keyof typeof skills) => {
    setSkills((prev) => ({
      ...prev,
      [skillKey]: !prev[skillKey],
    }));
  };

  const handleUpdateBusinessRule = (field: keyof AiBusinessRules, value: any) => {
    setBusinessRules((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleUpdateObjection = (key: keyof GroundedObjections, value: string) => {
    setBusinessRules((prev) => ({
      ...prev,
      objections: {
        ...(prev.objections || {}),
        [key]: value,
      },
    }));
  };

  const currentPlaybookDraft:PlaybookDraft={name,personality,systemPrompt,businessRules};
  const selectedPlaybook=playbookPreview?NICHE_PLAYBOOKS[playbookPreview]:undefined;
  const previewDraft=selectedPlaybook?applyPlaybookDraft(currentPlaybookDraft,selectedPlaybook,replacePlaybookFields):null;
  const canUndoPlaybook=playbookUndo?.signature===JSON.stringify(currentPlaybookDraft);
  const setPlaybookDraft=(draft:PlaybookDraft)=>{setName(draft.name);setPersonality(draft.personality);setSystemPrompt(draft.systemPrompt);setBusinessRules(draft.businessRules);};
  const handleApplyPlaybook=()=>{
    if(discard.isPending||!selectedPlaybook||!previewDraft)return;
    setPlaybookUndo({before:currentPlaybookDraft,signature:JSON.stringify(previewDraft)});
    setPlaybookDraft(previewDraft);setPreparedNotice("");setPlaybookAppliedNotice(`Modelo "${selectedPlaybook.title}" aplicado somente ao formulário. Revise e salve o rascunho para testar.`);setPlaybookPreview(null);
  };
  const previewValues=(draft:PlaybookDraft)=>[
    ['Nome do atendente',draft.name],['Tom de comunicação',({cordial_comercial:'Cordial e comercial',direto_objetivo:'Direto e objetivo',especialista_consultivo:'Especialista e consultivo',empatico_acolhedor:'Empático e acolhedor'} as const)[draft.personality]],['Instruções',draft.systemPrompt],['Papel do atendente',draft.businessRules.agentRole],
    ['Preço e desconto',draft.businessRules.objections?.priceDiscount],['Cliente quer pensar',draft.businessRules.objections?.thinkAboutIt],['Garantia e confiança',draft.businessRules.objections?.guaranteeTrust],['Prazos',draft.businessRules.objections?.deliveryTimeline],
    ['Pergunta de continuidade',draft.businessRules.ctaRule?'Selecionada':'Desmarcada'],['Emojis',draft.businessRules.emojiDensity==='sober'?'Sóbrio':draft.businessRules.emojiDensity==='expressive'?'Expressivos':'Moderados'],['Segmento',draft.businessRules.niche]
  ];

  const handleAddFaq = () => {
    setFaq((prev) => [
      ...prev,
      {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        question: "",
        answer: "",
      },
    ]);
  };

  const handleUpdateFaq = (index: number, field: "question" | "answer", value: string) => {
    if(value.trim()&&value.trim().length<=(field==='question'?500:2000))setFaqIssue(current=>current?.index===index&&current.field===field?null:current);
    setFaq((prev) => {
      const copy = [...prev];
      const current = copy[index];
      if (current) {
        copy[index] = {
          ...current,
          [field]: value,
        };
      }
      return copy;
    });
  };

  const handleRemoveFaq = (index: number) => {
    if(faq[index])setRemovedFaq({item:faq[index]!,index});
    setFaqIssue(null);setFaq((prev) => prev.filter((_, i) => i !== index));
  };
  const validateFaq = () => {
    for(const [index,item] of faq.entries()){
      if(!item.question.trim()&&!item.answer.trim())continue;
      const field=!item.question.trim()||item.question.trim().length>500?"question":!item.answer.trim()||item.answer.trim().length>2000?"answer":null;
      if(field){const message=`FAQ ${index+1}: ${field==='question'?'preencha a pergunta com até 500 caracteres.':'preencha a resposta com até 2000 caracteres.'}`;setFaqIssue({index,field,message});document.getElementById(`ai-faq-${field}-${index}`)?.focus();return false;}
    }
    setFaqIssue(null);return true;
  };

  const handleSelectProvider = (newProvider: "nvidia" | "openrouter") => {
    if(newProvider===provider)return;
    setProvider(newProvider);setApiKey("");setSimError(null);
    if (newProvider === "nvidia") {
      setModel("nvidia/nemotron-3-super-120b-a12b");
    } else {
      setModel("anthropic/claude-3.5-sonnet");
    }
  };

  const simulationConfiguration=JSON.stringify({enabled,name,personality,systemPrompt,strictMode,temperature,provider,model,skills,businessRules,faq,apiKey});
  useEffect(()=>{if(loadedScope===scope.current){setSavedFormSignature(simulationConfiguration);}},[loadedScope]);
  const operationalDirty=!!savedFormSignature&&savedFormSignature!==simulationConfiguration;
  const pageUnsaved=loadedScope===scope.current&&(operationalDirty||guidedUnsaved||testsUnsaved||Boolean(simInput.trim()));
  const discard=useDiscardChanges(pageUnsaved,scope.current,()=>Array.from(fieldsRef.current?.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input:not([type="hidden"]),textarea,select')??[]).find(field=>!field.disabled&&!field.closest('details:not([open])'))??editorHeading.current,true);
  const simulationOutdated=!!simSnapshot&&(simSnapshot.revision!==version.draftRevision||simSnapshot.configuration!==simulationConfiguration||simSnapshot.message!==simInput.trim()||simSnapshot.leadName!==mockLeadName||simSnapshot.pixScenario!==mockPixScenario);

  const handleSimulate = async (
    customMessage?: string,
    leadOverride?: { name?: string; pixScenario?: "none" | "pending" | "paid" }
  ) => {
    const textToSimulate = (customMessage !== undefined ? customMessage : simInput).trim();
    if (discard.isPending || !workspaceId || !token || !textToSimulate || simulationRequest.current || saveRequest.current || loadedScope!==scope.current) return;
    if(!validateFaq())return;
    const requestedScope=scope.current,gen=generation.current,id=Symbol();simulationRequest.current=id;
    setSimLoading(true);setSimResult(null);setSimSnapshot(null);
    setSimError(null);

    const effName = leadOverride?.name !== undefined ? leadOverride.name : mockLeadName;
    const effPix = leadOverride?.pixScenario !== undefined ? leadOverride.pixScenario : mockPixScenario;

    let mockLeadPayload: any = undefined;
    if (effName.trim() || effPix !== "none") {
      mockLeadPayload = {
        name: effName.trim() || undefined,
        lastPixStatus: effPix === "pending" ? "PENDING" : effPix === "paid" ? "PAID" : undefined,
        lastPixAmountCents: effPix === "pending" ? 14990 : effPix === "paid" ? 29900 : undefined,
        isReturningCustomer: effPix === "paid",
      };
    }

    try {
      const res = await apiClient.simulateAiAgent(
        workspaceId,
        {
          message: textToSimulate,
          draftRevision:version.draftRevision,
          draftConfig: {
            name: name.trim(),
            personality,
            systemPrompt: systemPrompt.trim(),
            strictMode,
            temperature,
            provider,
            model,
            apiKey: apiKey.trim() || undefined,
            skills,
            businessRules,
            faq: faq.filter((item) => item.question.trim() || item.answer.trim()),
          },
          mockLead: mockLeadPayload,
        },
        { token }
      );
      if(requestedScope!==scope.current||gen!==generation.current)return;
      setSimResult(res);setSimSnapshot({message:textToSimulate,leadName:effName,pixScenario:effPix,agentName:name,configuration:simulationConfiguration,revision:version.draftRevision});
      if (customMessage !== undefined) {
        setSimInput(customMessage);
      }
    } catch (err: unknown) {
      if(requestedScope===scope.current&&gen===generation.current)setSimError(userFacingError(err,"Falha ao simular atendimento."));
    } finally {
      if(simulationRequest.current===id){simulationRequest.current=null;if(requestedScope===scope.current&&gen===generation.current)setSimLoading(false);}
    }
  };

  const handleSave = async () => {
    if (discard.isPending || !workspaceId || !token || saveRequest.current || simulationRequest.current || loadedScope!==scope.current) return;
    if(!validateFaq())return;
    if(!Number.isInteger(businessRules.checkoutValidityMinutes)||businessRules.checkoutValidityMinutes!<5||businessRules.checkoutValidityMinutes!>1440){focusOutcome.current=true;setErrorMsg('Informe uma validade do resumo entre 5 e 1440 minutos.');return;}
    const requestedScope=scope.current,gen=generation.current,id=Symbol();saveRequest.current=id;
    setSaving(true);
    setErrorMsg(null);
    setPreparedNotice("");

    try {
      const saved=await apiClient.updateAiAgentConfig(
        workspaceId,
        {
          expectedRevision:version.draftRevision,
          enabled,
          name: name.trim(),
          personality,
          systemPrompt: systemPrompt.trim(),
          provider,
          model,
          apiKey: apiKey.trim() ? apiKey.trim() : undefined,
          skills,
          businessRules,
          faq: faq.filter((item) => item.question.trim() || item.answer.trim()),
          strictMode,
          temperature,
        },
        { token }
      );
      if(requestedScope!==scope.current||gen!==generation.current)return;
      setVersion(saved.version);setSavedFormSignature(JSON.stringify({...JSON.parse(simulationConfiguration),apiKey:""}));
      setSavedProvider(provider);setHasCustomApiKey(Boolean(saved.config.hasCustomApiKey));
      if (apiKey.trim()) {
        setHasCustomApiKey(true);
        setApiKey("");
      }
      focusOutcome.current=true;setPreparedNotice(`Rascunho revisão ${saved.version.draftRevision} salvo. A configuração em uso foi preservada.`);
    } catch (err: unknown) {
      if(requestedScope===scope.current&&gen===generation.current){focusOutcome.current=true;setErrorMsg(err instanceof ApiError&&err.status===409?"Outra revisão foi salva. Compare antes de decidir; seu formulário continua preservado.":userFacingError(err,"Falha ao salvar o rascunho. Os dados foram preservados."));if(err instanceof ApiError&&err.status===409){setDraftConflict(true);setDraftComparison(null);}}
    } finally {
      if(saveRequest.current===id){saveRequest.current=null;if(requestedScope===scope.current&&gen===generation.current)setSaving(false);}
    }
  };

  async function compareDraft(){
    if(discard.isPending||!workspaceId||!token||comparingDraft)return;
    const gen=generation.current,requestedScope=scope.current;setComparingDraft(true);setErrorMsg(null);
    try{const result=await apiClient.getAiAgentConfig(workspaceId,{token});if(gen===generation.current&&requestedScope===scope.current)setDraftComparison(result);}
    catch(error){if(gen===generation.current&&requestedScope===scope.current)setErrorMsg(userFacingError(error,"Não foi possível consultar a versão atual."));}
    finally{if(gen===generation.current&&requestedScope===scope.current)setComparingDraft(false);}
  }
  function keepLocalDraft(){
    if(discard.isPending||!draftComparison)return;
    setVersion(draftComparison.version);setActiveConfig(draftComparison.activeConfig??null);setDraftConflict(false);setDraftComparison(null);setErrorMsg(null);focusOutcome.current=true;
    setPreparedNotice("Seu formulário foi mantido sobre a revisão consultada. Revise e salve uma nova revisão quando estiver pronto.");
  }

  async function handleSuspend(){
    if(discard.isPending||!workspaceId||!token||!version.activeEnabled||saveRequest.current||simulationRequest.current)return;
    const id=Symbol();saveRequest.current=id;const gen=generation.current,requestedScope=scope.current;setSuspending(true);setErrorMsg(null);setPreparedNotice("");
    try{await apiClient.suspendAiAgent(workspaceId,"Suspensão manual pela configuração da IA",{token});
      if(gen!==generation.current||requestedScope!==scope.current)return;
      focusOutcome.current=true;setVersion(value=>({...value,activeEnabled:false}));setActiveConfig(value=>value?{...value,enabled:false}:value);setPreparedNotice("Atendimento automático suspenso. Rascunhos e histórico foram preservados.");
    }catch(error){if(gen===generation.current&&requestedScope===scope.current){focusOutcome.current=true;setErrorMsg(userFacingError(error,"Não foi possível suspender. Confira a configuração em uso antes de tentar novamente."));}}
    finally{if(saveRequest.current===id){saveRequest.current=null;if(gen===generation.current&&requestedScope===scope.current)setSuspending(false);}}
  }

  if (!workspaceId || !token) return <p>Selecione uma empresa com acesso à configuração da IA.</p>;
  if (loadError && loadedScope!==scope.current) return <div role="alert">{loadError} <Button onClick={()=>setReload(value=>value+1)}>Tentar novamente</Button></div>;
  if (loading || loadedScope!==scope.current) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-secondary)" }}>
        Carregando parâmetros do atendente virtual...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "900px",width:"100%",minWidth:0 }}>
      {discard.isPending&&<div><p>Há trabalho local não salvo na configuração da IA. Sair não altera a versão aprovada em uso.</p><UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={saving||simLoading||suspending||guidedBusy||testsBusy}/></div>}
      <fieldset ref={fieldsRef} disabled={discard.isPending} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:24}}>
      <Dialog isOpen={!!selectedPlaybook} onClose={()=>setPlaybookPreview(null)} title={`Revisar modelo: ${selectedPlaybook?.title??''}`} description="Confira as alterações antes de aplicá-las ao formulário." maxWidth="720px">
      {selectedPlaybook&&previewDraft&&<>
        <p>Por padrão, campos preenchidos são preservados. Empresa, proposta de valor, políticas, FAQ, provedor, credenciais e permissões permanecem como estão.</p>
        <label style={{display:'flex',gap:8,alignItems:'start'}}><input type="checkbox" checked={replacePlaybookFields} onChange={event=>setReplacePlaybookFields(event.target.checked)}/>Substituir também os campos preenchidos mostrados na prévia</label>
        <div style={{overflowWrap:'anywhere',whiteSpace:'pre-wrap'}}>{previewValues(previewDraft).map(([label,value],index)=>{const before=previewValues(currentPlaybookDraft)[index]![1];return <div key={label} style={{borderBottom:'1px solid var(--border-default)',padding:'8px 0'}}><strong>{label} · {before===value?'Preservado':'Será alterado'}</strong><p>Atual: {before||'Não preenchido'}</p>{before!==value&&<p>Após aplicar: {value||'Não preenchido'}</p>}</div>;})}</div>
        <p>O modelo orienta o atendimento. Ele não cadastra condições comerciais, não comprova ações e não ativa a IA.</p>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button variant="secondary" onClick={()=>setPlaybookPreview(null)}>Cancelar</Button><Button disabled={discard.isPending||saving||simLoading||draftConflict} onClick={handleApplyPlaybook}>Aplicar ao formulário</Button></div>
      </>}
      </Dialog>
      {errorMsg&&<p ref={outcomeRef} tabIndex={-1} role="alert">{errorMsg}</p>}
      {draftConflict&&<aside aria-label="Conflito do rascunho operacional" style={{border:"1px solid var(--border-default)",padding:16,borderRadius:12}}><h4>O rascunho mudou</h4><p>Seu formulário está preservado. Consulte a revisão atual antes de decidir o que manter.</p><Button disabled={comparingDraft} onClick={()=>void compareDraft()}>{comparingDraft?"Consultando…":"Comparar com revisão salva"}</Button>
        {draftComparison&&<><h4>Revisão salva {draftComparison.version.draftRevision}</h4><AiConfigReview config={draftComparison.config}/><p>Compare as informações acima com o seu formulário, preservado abaixo. Usar a revisão salva substitui apenas o formulário local.</p><Button onClick={()=>setReload(value=>value+1)}>Usar revisão salva</Button><Button onClick={keepLocalDraft}>Manter meu formulário para revisar</Button></>}
      </aside>}
      {preparedNotice&&<p ref={outcomeRef} tabIndex={-1} role="status">{preparedNotice}</p>}
      {version.activeEnabled&&<aside style={{border:"1px solid var(--border-default)",padding:16,borderRadius:12}}><p>A configuração em uso está habilitada para atendimento automático. A suspensão abaixo tem efeito imediato e preserva os rascunhos.</p><Button variant="secondary" disabled={saving||simLoading||suspending} onClick={()=>void handleSuspend()}>{suspending?"Suspendendo…":"Suspender atendimento automático agora"}</Button></aside>}
      <GuidedAgentSetup key={workspaceId} workspaceId={workspaceId} token={token} operationalRevision={version.draftRevision} operationalDirty={operationalDirty} onUnsavedChange={setGuidedUnsaved} onBusyChange={setGuidedBusy} interactionLocked={discard.isPending} onLoaded={()=>{if(!focusPrepared.current)return;const gen=generation.current,requestedScope=scope.current;requestAnimationFrame(()=>{if(gen===generation.current&&requestedScope===scope.current&&focusPrepared.current){editorHeading.current?.focus();focusPrepared.current=false;}});}} onPrepared={()=>{focusPrepared.current=true;setEditorOpen(true);setPreparedNotice("Plano convertido em rascunho operacional. A configuração em uso foi preservada.");setReload(value=>value+1);}} />
      <AiRevisionTests key={`${workspaceId}:${version.draftRevision}`} workspaceId={workspaceId} token={token} revision={version.draftRevision} dirty={operationalDirty} onUnsavedChange={setTestsUnsaved} onBusyChange={setTestsBusy} interactionLocked={discard.isPending}/>
      <details open={editorOpen} onToggle={event=>setEditorOpen(event.currentTarget.open)}><summary>Rascunho operacional da IA</summary>
      <h4 ref={editorHeading} tabIndex={-1}>Revise o rascunho preparado para teste</h4>
      <p>Salvar cria uma revisão de rascunho. O atendimento em uso permanece preservado até uma liberação separada após os testes.</p>
      <p role="status">{version.draftRevision?`Rascunho: revisão ${version.draftRevision}.`:"Nenhum rascunho salvo; os campos mostram a configuração em uso."} Configuração em uso: automático {version.activeEnabled?"habilitado":"desabilitado"}.{version.sourceGuidedRevision?` Preparado a partir da revisão ${version.sourceGuidedRevision} do plano${version.guidedModified?", com ajustes no rascunho":""}.`:""}</p>
      {activeConfig&&<details><summary>Conferir configuração em uso</summary><AiConfigReview config={activeConfig}/><p>Alterar os campos do rascunho não altera esta configuração.</p></details>}

      <fieldset disabled={saving||simLoading||suspending||draftConflict} onChange={()=>setPreparedNotice("")} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gridTemplateColumns:"minmax(0,1fr)",gap:24}}>
      {/* Header card with toggle */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",flexWrap:"wrap",gap:12,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "14px", alignItems: "center" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "10px",
              backgroundColor: enabled ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-canvas)",
              color: enabled ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bot size={26} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "var(--font-size-base, 1rem)", fontWeight: 600 }}>
              Atendimento Inteligente no WhatsApp
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              {enabled
                ? "Este rascunho propõe atendimento automático. A seleção só terá efeito após testes e liberação."
                : "Este rascunho propõe atendimento sem execução automática. Salvar não altera a configuração em uso."}
            </p>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)" }}>
          <span>{enabled ? "Automático no rascunho" : "Manual no rascunho"}</span>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: "20px", height: "20px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
          />
        </label>
      </div>

      {/* 1-CLICK NICHE PLAYBOOKS BANNER */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.12))",
                color: "var(--color-primary, #10b981)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 700 }}>
                  Modelos de atendimento por segmento
                </h4>
                <span
                  style={{
                    fontSize: "0.65rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    backgroundColor: "rgba(16, 185, 129, 0.15)",
                    color: "var(--color-primary, #10b981)",
                    fontWeight: 700,
                  }}
                >
                  Sugestões para revisar
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Escolha um modelo, confira a prévia e preserve ou substitua os campos do rascunho. As condições reais vêm do cadastro da empresa.
              </p>
            </div>
          </div>
        </div>

        {playbookAppliedNotice && (
          <div ref={playbookNoticeRef} tabIndex={-1}
            role="status"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-success-subtle, rgba(16, 185, 129, 0.12))",
              border: "1px solid var(--color-primary, #10b981)",
              color: "var(--color-primary, #10b981)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "8px",flexWrap:"wrap",
            }}
          >
            <CheckCircle2 size={16} /> {playbookAppliedNotice}
            {playbookUndo&&<><Button variant="secondary" disabled={!canUndoPlaybook} onClick={()=>{if(playbookUndo&&canUndoPlaybook){setPlaybookDraft(playbookUndo.before);setPlaybookUndo(null);focusPlaybookNotice.current=true;setPlaybookAppliedNotice('Aplicação desfeita no formulário. Revise antes de salvar.');}}}>Desfazer aplicação do modelo</Button>{!canUndoPlaybook&&<span>O formulário foi editado depois da aplicação. Desfazer foi desabilitado para preservar essas alterações.</span>}</>}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "12px" }}>
          {Object.values(NICHE_PLAYBOOKS).map((pb) => {
            const isCurrent = businessRules.niche === pb.id;
            return (
              <div
                key={pb.id}
                style={{
                  padding: "14px",
                  borderRadius: "var(--radius-md, 8px)",
                  border: isCurrent
                    ? "2px solid var(--color-primary, #10b981)"
                    : "1px solid var(--border-default)",
                  backgroundColor: isCurrent
                    ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.08))"
                    : "var(--bg-canvas)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "1.25rem" }}>{pb.emoji}</span>
                  <span
                    style={{
                      fontSize: "0.65rem",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      backgroundColor: isCurrent ? "var(--color-primary, #10b981)" : "var(--border-default)",
                      color: isCurrent ? "#ffffff" : "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    {isCurrent ? "No rascunho" : pb.badge}
                  </span>
                </div>
                <div>
                  <strong style={{ fontSize: "var(--font-size-xs, 0.8rem)", color: "var(--text-primary)", display: "block" }}>
                    {pb.title}
                  </strong>
                  <p
                    style={{
                      margin: "4px 0 0 0",
                      fontSize: "0.7rem",
                      color: "var(--text-secondary)",
                      lineHeight: 1.35,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {pb.description}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Revisar modelo ${pb.title}`}
                  onClick={()=>{setReplacePlaybookFields(false);setPlaybookPreview(pb.id);}}
                  style={{
                    marginTop: "auto",
                    padding: "6px 8px",
                    borderRadius: "6px",
                    border: "none",
                    backgroundColor: isCurrent ? "var(--color-primary, #10b981)" : "var(--bg-surface)",
                    color: isCurrent ? "#ffffff" : "var(--text-primary)",
                    fontSize: "0.7rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                  }}
                >
                  {isCurrent ? <Check size={12} /> : <ArrowRight size={12} />}
                  Revisar modelo
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* DNA DA MARCA & PAPEL DO ATENDENTE */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <Building2 size={20} color="var(--color-primary, #10b981)" />
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              DNA da Marca & Papel do Atendente
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Identifique quem atende e quais diferenciais da empresa podem ser afirmados com segurança.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: "16px" }}>
          <div>
            <label htmlFor={`${fieldId}-company`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Building2 size={14} /> Nome da Sua Empresa / Marca
            </label>
            <input id={`${fieldId}-company`}
              type="text"
              value={businessRules.companyName || ""}
              onChange={(e) => handleUpdateBusinessRule("companyName", e.target.value)}
              placeholder="Ex.: Haven Escovaria & SPA, Loja Aurora..."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor={`${fieldId}-role`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Briefcase size={14} /> Papel / Cargo Comercial do Atendente
            </label>
            <input id={`${fieldId}-role`}
              type="text"
              value={businessRules.agentRole || ""}
              onChange={(e) => handleUpdateBusinessRule("agentRole", e.target.value)}
              placeholder="Ex.: Consultora Especialista de Vendas, Concierge de Atendimento..."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${fieldId}-value`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
            <Target size={14} /> Proposta Única de Valor (Promessa Central)
          </label>
          <input id={`${fieldId}-value`}
            type="text"
            value={businessRules.valueProposition || ""}
            onChange={(e) => handleUpdateBusinessRule("valueProposition", e.target.value)}
            placeholder="Ex.: Cabelos impecáveis em 45 minutos sem agendamento prévio com produtos 100% orgânicos."
            style={{
              width: "100%",
              height: "36px",
              padding: "0 10px",
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: "16px" }}>
          <Input
            label="Nome do Atendente no WhatsApp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Camila, Sofia, Lucas..."
            helperText="Nome apresentado aos leads logo no primeiro contato."
          />

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label htmlFor={`${fieldId}-personality`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)" }}>
              Arquétipo de Comunicação
            </label>
            <select id={`${fieldId}-personality`}
              value={personality}
              onChange={(e) => setPersonality(e.target.value as AiAgentConfig["personality"])}
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
              }}
            >
              <option value="cordial_comercial">Cordial & Comercial (Recomendado para Vendas)</option>
              <option value="direto_objetivo">Direto & Objetivo (Rápido e focado em respostas curtas)</option>
              <option value="especialista_consultivo">Especialista & Consultivo (Focado em tirar dúvidas técnicas)</option>
              <option value="empatico_acolhedor">Empático & Acolhedor (Foco em beleza, saúde e bem-estar)</option>
            </select>
          </div>
        </div>

        {/* Prompt */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor={`${fieldId}-prompt`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Instruções Gerais de Contexto Adicionais (System Prompt)
          </label>
          <textarea id={`${fieldId}-prompt`}
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={3}
            placeholder="Ex.: Atenda os clientes com agilidade, apresente as opções disponíveis no catálogo e estimule o fechamento via Pix à vista."
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", textAlign: "right" }}>
            {systemPrompt.length} / 5000 caracteres
          </div>
        </div>
      </div>

      {/* DIRETRIZES DE CONVERSAÇÃO WHATSAPP */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <MessageSquare size={20} color="var(--color-primary, #10b981)" />
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Diretrizes de Conversação WhatsApp (Regras de Ouro)
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Ajuste o estilo da conversa. Clareza, contexto e decisão do cliente vêm primeiro.
            </p>
          </div>
        </div>

        {/* CTA Rule Toggle Card */}
        <div
          style={{
            padding: "14px 16px",
            backgroundColor: "var(--bg-canvas)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md, 8px)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Target size={16} color="var(--color-primary, #10b981)" />
              <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)", color: "var(--text-primary)" }}>
                Sugerir pergunta de continuidade
              </strong>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Orienta a IA a perguntar quando houver um próximo passo útil, sem insistir após recusa, despedida ou encaminhamento à equipe. Confira o resultado nos testes.
            </p>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)" }}>
            <span style={{ fontSize: "0.75rem", color: (businessRules.ctaRule ?? true) ? "var(--color-primary, #10b981)" : "var(--text-secondary)" }}>
              {(businessRules.ctaRule ?? true) ? "Ativo" : "Desativado"}
            </span>
            <input
              type="checkbox"
              aria-label="Sugerir pergunta de continuidade"
              checked={businessRules.ctaRule ?? true}
              onChange={(e) => handleUpdateBusinessRule("ctaRule", e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
            />
          </label>
        </div>

        {/* Emoji Density Segmented Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Smile size={14} /> Densidade e Frequência de Emojis
          </label>
          <div role="group" aria-label="Preferência de emojis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: "10px" }}>
            {[
              {
                id: "sober",
                label: "🧊 Sóbrio & Executivo",
                desc: "Poucos ou nenhum emoji. Tom sério e institucional.",
              },
              {
                id: "moderate",
                label: "🌿 Moderado (Recomendado)",
                desc: "Até 2 emojis pontuais, quando ajudarem. Uso opcional.",
              },
              {
                id: "expressive",
                label: "✨ Expressivo & Dinâmico",
                desc: "Mais presença de emojis, sem excesso e conforme o contexto.",
              },
            ].map((opt) => {
              const isSelected = (businessRules.emojiDensity || "moderate") === opt.id;
              return (
                <label
                  key={opt.id}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: isSelected ? "2px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                    backgroundColor: isSelected ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.08))" : "var(--bg-canvas)",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                    transition: "all 0.15s ease",
                  }}
                >
                  <input type="radio" name="ai-emoji-density" aria-label={opt.label} checked={isSelected} onChange={()=>handleUpdateBusinessRule("emojiDensity",opt.id)} style={{accentColor:"var(--color-primary)",width:16,height:16,margin:0,alignSelf:"flex-start",flexShrink:0}}/>
                  <strong style={{ fontSize: "var(--font-size-xs, 0.8rem)", color: isSelected ? "var(--color-primary, #10b981)" : "var(--text-primary)" }}>
                    {opt.label}
                  </strong>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.3 }}>
                    {opt.desc}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      {/* MATRIZ DE CONTORNO DE OBJEÇÕES (OBJECTION SHIELD) */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <ShieldCheck size={20} color="var(--color-primary, #10b981)" />
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Orientações para dúvidas e objeções
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Defina como esclarecer dúvidas, respeitar a decisão do cliente e usar somente condições aprovadas.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: "16px" }}>
          {/* Objeção 1: Preço Alto / Desconto */}
          <div
            style={{
              padding: "14px",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "1rem" }}>💰</span>
              <label htmlFor={`${fieldId}-objection-priceDiscount`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-primary)",fontWeight:600 }}>
                Preço e pedido de desconto
              </label>
            </div>
            <p id={`${fieldId}-objection-priceDiscount-help`} style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-secondary)" }}>
              Quando o lead diz &quot;tá caro&quot; ou &quot;tem desconto?&quot;. Use somente preços e condições aprovados; não invente um benefício no Pix:
            </p>
            <textarea id={`${fieldId}-objection-priceDiscount`} aria-describedby={`${fieldId}-objection-priceDiscount-help`}
              value={businessRules.objections?.priceDiscount || ""}
              onChange={(e) => handleUpdateObjection("priceDiscount", e.target.value)}
              rows={3}
              placeholder="Informe as condições aprovadas e quem pode autorizar exceções. Sem desconto cadastrado, não ofereça desconto."
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Objeção 2: Vou Pensar / Terceiro */}
          <div
            style={{
              padding: "14px",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "1rem" }}>⏳</span>
              <label htmlFor={`${fieldId}-objection-thinkAboutIt`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-primary)",fontWeight:600 }}>
                Tempo para decidir
              </label>
            </div>
            <p id={`${fieldId}-objection-thinkAboutIt-help`} style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-secondary)" }}>
              Respeite o tempo de decisão e esclareça dúvidas, sem inventar urgência ou reserva:
            </p>
            <textarea id={`${fieldId}-objection-thinkAboutIt`} aria-describedby={`${fieldId}-objection-thinkAboutIt-help`}
              value={businessRules.objections?.thinkAboutIt || ""}
              onChange={(e) => handleUpdateObjection("thinkAboutIt", e.target.value)}
              rows={3}
              placeholder="Oriente como esclarecer dúvidas e respeitar a decisão do cliente, sem inventar urgência ou reserva."
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Objeção 3: Garantia & Confiança */}
          <div
            style={{
              padding: "14px",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "1rem" }}>🛡️</span>
              <label htmlFor={`${fieldId}-objection-guaranteeTrust`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-primary)",fontWeight:600 }}>
                Garantia e confiança
              </label>
            </div>
            <p id={`${fieldId}-objection-guaranteeTrust-help`} style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-secondary)" }}>
              Quando o lead hesita sobre confiança, qualidade ou suporte pós-venda:
            </p>
            <textarea id={`${fieldId}-objection-guaranteeTrust`} aria-describedby={`${fieldId}-objection-guaranteeTrust-help`}
              value={businessRules.objections?.guaranteeTrust || ""}
              onChange={(e) => handleUpdateObjection("guaranteeTrust", e.target.value)}
              rows={3}
              placeholder="Descreva somente garantias e políticas confirmadas. Se faltar informação, encaminhe para confirmação."
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Objeção 4: Prazos, Entrega & Disponibilidade */}
          <div
            style={{
              padding: "14px",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "1rem" }}>🚚</span>
              <label htmlFor={`${fieldId}-objection-deliveryTimeline`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-primary)",fontWeight:600 }}>
                Prazos e disponibilidade
              </label>
            </div>
            <p id={`${fieldId}-objection-deliveryTimeline-help`} style={{ margin: 0, fontSize: "0.7rem", color: "var(--text-secondary)" }}>
              Quando o lead pergunta se chega rápido, quanto tempo dura o serviço ou quando começa:
            </p>
            <textarea id={`${fieldId}-objection-deliveryTimeline`} aria-describedby={`${fieldId}-objection-deliveryTimeline-help`}
              value={businessRules.objections?.deliveryTimeline || ""}
              onChange={(e) => handleUpdateObjection("deliveryTimeline", e.target.value)}
              rows={3}
              placeholder="Informe a fonte aprovada para consultar prazo e disponibilidade. Não prometa uma condição ainda não confirmada."
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      </div>

      {/* AI ENGINE & PROVIDER SELECTION */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "8px",
              backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))",
              color: "var(--color-primary, #10b981)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Cpu size={22} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Motor de Inteligência Artificial & Provedor LLM
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Escolha entre a infraestrutura corporativa de inferência acelerada da <strong>NVIDIA NIM</strong> (padrão soberano) ou o catálogo multi-modelos da <strong>OpenRouter</strong>.
            </p>
          </div>
        </div>

        {/* Provider Selector Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: "12px" }}>
          {/* Option 1: Nvidia NIM */}
          <button type="button" aria-label="Usar NVIDIA NIM" aria-pressed={provider==="nvidia"}
            onClick={() => handleSelectProvider("nvidia")}
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md, 8px)",
              border: provider === "nvidia" ? "2px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              backgroundColor: provider === "nvidia" ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.08))" : "var(--bg-canvas)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Zap size={18} color="var(--color-primary, #10b981)" />
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>NVIDIA NIM</strong>
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.2))",
                  color: "var(--color-primary, #10b981)",
                  fontWeight: 700,
                }}
              >
                {provider==="nvidia"?"Selecionado":"Disponível"}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Use uma chave deste provedor ou a configuração disponível no servidor. Disponibilidade, latência e custo dependem do modelo e da conta.
            </p>
          </button>

          {/* Option 2: OpenRouter */}
          <button type="button" aria-label="Usar OpenRouter" aria-pressed={provider==="openrouter"}
            onClick={() => handleSelectProvider("openrouter")}
            style={{
              padding: "16px",
              borderRadius: "var(--radius-md, 8px)",
              border: provider === "openrouter" ? "2px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              backgroundColor: provider === "openrouter" ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.08))" : "var(--bg-canvas)",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Cpu size={18} color="var(--color-action, #3b82f6)" />
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>OpenRouter</strong>
              </div>
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "2px 8px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-action-subtle, rgba(59, 130, 246, 0.15))",
                  color: "var(--color-action, #3b82f6)",
                  fontWeight: 700,
                }}
              >
                Multi-Modelos
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Amplo catálogo de modelos incluindo Claude 3.5 Sonnet, Gemini 2.5 Flash e DeepSeek. Requer credencial OpenRouter configurada para esta empresa ou no servidor.
            </p>
          </button>
        </div>

        {/* Model Selection */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
          <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-primary)" }}>
            Modelo Neuronal Selecionado ({provider === "nvidia" ? "NVIDIA NIM" : "OpenRouter"}):
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: "8px" }}>
            {(provider === "nvidia"
              ? [
                  { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B", badge: "Padrão & Raciocínio" },
                  { id: "nvidia/nemotron-3.5-lightning-30b-a3b", label: "Nemotron 3.5 Lightning 30B", badge: "Ultrarrápido" },
                  { id: "nvidia/llama-3.1-nemotron-70b-instruct", label: "Nemotron 70B Instruct", badge: "Factual" },
                ]
              : [
                  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", badge: "Alta Precisão" },
                  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", badge: "Ultra Rápido" },
                  { id: "deepseek/deepseek-chat", label: "DeepSeek V3 / R1", badge: "Custo-Benefício" },
                  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", badge: "Open Source" },
                ]
            ).map((m) => (
              <button
                key={m.id}
                type="button" aria-pressed={model===m.id}
                onClick={() => setModel(m.id)}
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  border: model === m.id ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                  backgroundColor: model === m.id ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-canvas)",
                  color: model === m.id ? "var(--color-primary, #10b981)" : "var(--text-primary)",
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  textAlign: "left",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  fontWeight: model === m.id ? 600 : 400,
                }}
              >
                <span>{m.label}</span>
                <span
                  style={{
                    fontSize: "0.65rem",
                    padding: "1px 6px",
                    borderRadius: "4px",
                    backgroundColor: model === m.id ? "var(--color-primary, #10b981)" : "var(--border-default)",
                    color: model === m.id ? "#ffffff" : "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {m.badge}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* API Key Input */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
              <Key size={14} /> Chave de API ({provider === "nvidia" ? "NVIDIA NIM" : "OpenRouter"}):
            </label>
            {hasCustomApiKey && provider===savedProvider && (
              <span style={{ fontSize: "0.7rem", color: "var(--color-primary, #10b981)", fontWeight: 600 }}>
                ✓ Chave própria salva
              </span>
            )}
          </div>
          <Input
            type="password"
            id={`${fieldId}-api-key`} aria-label={`Chave de API (${provider === "nvidia" ? "NVIDIA NIM" : "OpenRouter"})`} value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasCustomApiKey&&provider===savedProvider
                ? "•••••••••••••••• (Substituir chave salva)"
                : provider === "nvidia"
                ? "Opcional: usando chave padrão do servidor (NVIDIA_API_KEY)"
                : "Insira sua chave sk-or-v1-... da OpenRouter"
            }
          />
          <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.7rem)", color: "var(--text-secondary)" }}>
            {provider === "nvidia"
              ? "Deixe em branco para usar o endpoint corporativo nativo do SOS Sales, ou informe sua chave própria para bilhetagem direta."
              : "Obtenha sua chave em openrouter.ai/keys. A chave não é exibida novamente após salvar e pertence à configuração desta empresa."}
          </p>
        </div>
      </div>

      {/* ANTI-HALLUCINATION & ASSURANCE SECTION */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: strictMode ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: strictMode ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-canvas)",
                color: strictMode ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ShieldCheck size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                  Blindagem Anti-Alucinação (Protocolo de Ignorância & Grounding)
                </h4>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    backgroundColor: strictMode ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.15))" : "var(--bg-canvas)",
                    color: strictMode ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
                    fontWeight: 600,
                  }}
                >
                  {strictMode ? "Modo estrito selecionado" : "Modo estrito desmarcado"}
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Orienta a IA a usar o Catálogo e as Regras Oficiais. Valide os cenários antes de liberar o atendimento.
              </p>
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontWeight: 600, fontSize: "var(--font-size-sm, 0.875rem)" }}>
            <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", color: strictMode ? "var(--color-primary, #10b981)" : "var(--text-secondary)" }}>
              {strictMode ? "Modo Estrito Ligado" : "Desativado"}
            </span>
            <input
              type="checkbox"
              checked={strictMode}
              onChange={(e) => setStrictMode(e.target.checked)}
              style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "var(--color-primary, #10b981)" }}
            />
          </label>
        </div>

        <div
          style={{
            padding: "12px 14px",
            backgroundColor: "var(--bg-canvas)",
            borderRadius: "var(--radius-md, 8px)",
            border: "1px solid var(--border-default)",
            fontSize: "var(--font-size-xs, 0.75rem)",
            lineHeight: 1.5,
            color: "var(--text-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", color: "var(--text-primary)" }}>
            <AlertTriangle size={15} style={{ color: "var(--color-action, #f59e0b)", flexShrink: 0, marginTop: "2px" }} />
            <span>
              <strong>Fontes usadas para orientar as respostas:</strong> catálogo, políticas da empresa e FAQ. O modo estrito instrui o modelo a reconhecer informações ausentes e pedir ajuda. Confira o resultado nos cenários: essa instrução não garante que toda resposta esteja correta.
            </span>
          </div>

          <div style={{ display: "flex", flexWrap:"wrap",alignItems: "center", gap: "16px", marginTop: "4px", paddingTop: "8px", borderTop: "1px solid var(--border-default)" }}>
            <label style={{ fontWeight: 600, color: "var(--text-primary)" }}>Temperatura de Amostragem do Modelo:</label>
            <div style={{ display: "flex", flexWrap:"wrap", gap: "8px" }}>
              {[
                { label: "0.1 (Factual & Estrito - Recomendado)", val: 0.1 },
                { label: "0.3 (Equilibrado)", val: 0.3 },
                { label: "0.7 (Criativo)", val: 0.7 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => setTemperature(opt.val)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: "6px",
                    border: temperature === opt.val ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
                    backgroundColor: temperature === opt.val ? "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))" : "var(--bg-surface)",
                    color: temperature === opt.val ? "var(--color-primary, #10b981)" : "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    fontWeight: temperature === opt.val ? 600 : 400,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CATALOG GROUNDING INFO */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",flexWrap:"wrap",gap:12,
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start",flex:"1 1 260px",minWidth:0 }}>
          <div
            style={{
              width: "36px",flexShrink:0,
              height: "36px",
              borderRadius: "8px",
              backgroundColor: "var(--color-action-subtle, rgba(59, 130, 246, 0.1))",
              color: "var(--color-action, #3b82f6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ShoppingBag size={18} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Catálogo de Produtos & Serviços Integrado
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              O contexto inclui produtos ativos quando apresentação de catálogo ou cobrança Pix estiver selecionada. Para cobrança sem apresentação, os itens servem apenas ao pedido de pagamento. Confira os itens incluídos no teste.
            </p>
          </div>
        </div>
        <span style={{flex:"1 1 180px",maxWidth:"100%", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--color-action, #3b82f6)", fontWeight: 600 }}>
          {resolveAiCapabilities(skills).readCatalog?"Consulta selecionada no rascunho":"Sem consulta de catálogo no rascunho"}
        </span>
      </div>

      {/* BUSINESS RULES (FACTUAL KNOWLEDGE) */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Clock size={18} color="var(--color-primary, #10b981)" />
          <div>
            <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
              Regras e Políticas Fatuais do Negócio
            </h4>
            <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
              Cadastre apenas informações confirmadas e atuais. Revise os testes quando mudar uma condição da empresa.
            </p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: "16px" }}>
          <div>
            <label htmlFor={`${fieldId}-hours`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <Clock size={14} /> Horário de Funcionamento
            </label>
            <input id={`${fieldId}-hours`}
              type="text"
              value={businessRules.openingHours || ""}
              onChange={(e) => handleUpdateBusinessRule("openingHours", e.target.value)}
              placeholder="Ex.: Segunda a Sexta das 08h às 19h. Sábado das 08h às 17h."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor={`${fieldId}-address`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <MapPin size={14} /> Endereço e Localização
            </label>
            <input id={`${fieldId}-address`}
              type="text"
              value={businessRules.address || ""}
              onChange={(e) => handleUpdateBusinessRule("address", e.target.value)}
              placeholder="Ex.: Rua das Palmeiras, 150, Centro - Em frente à Praça Coronel."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor={`${fieldId}-payment`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <CreditCard size={14} /> Formas de Pagamento Aceitas
            </label>
            <input id={`${fieldId}-payment`}
              type="text"
              value={businessRules.paymentMethods || ""}
              onChange={(e) => handleUpdateBusinessRule("paymentMethods", e.target.value)}
              placeholder="Ex.: Pix à vista, Cartão de Crédito em até 3x sem juros, Dinheiro."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div>
            <label htmlFor={`${fieldId}-cancellation`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <AlertTriangle size={14} /> Política de Cancelamentos & Atrasos
            </label>
            <input id={`${fieldId}-cancellation`}
              type="text"
              value={businessRules.cancellationPolicy || ""}
              onChange={(e) => handleUpdateBusinessRule("cancellationPolicy", e.target.value)}
              placeholder="Ex.: Tolerância de até 15 min de atraso. Reagendamento com 2h de antecedência."
              style={{
                width: "100%",
                height: "36px",
                padding: "0 10px",
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-primary)",
                backgroundColor: "var(--bg-canvas)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md, 8px)",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label htmlFor={`${fieldId}-rules`} style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Regras Operacionais Extras & Condições Especiais
          </label>
          <textarea id={`${fieldId}-rules`}
            value={businessRules.generalRules || ""}
            onChange={(e) => handleUpdateBusinessRule("generalRules", e.target.value)}
            rows={3}
            placeholder="Ex.: Temos estacionamento conveniado gratuito na esquina. Para procedimentos químicos solicitamos teste de mecha prévio. Não atendemos aos domingos e feriados."
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-primary)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              fontFamily: "inherit",
              resize: "vertical",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      <Input label="Validade do resumo para cobrança (minutos)" type="number" min={5} max={1440} step={1} value={businessRules.checkoutValidityMinutes??15} onChange={event=>handleUpdateBusinessRule('checkoutValidityMinutes',Number(event.target.value))} helperText="Entre 5 e 1440 minutos. O cliente confere item, quantidade e valor antes de confirmar. Resumo vencido exige nova confirmação com dados atualizados. Não reserva estoque."/>

      {/* FAQ & OBJECTIONS (KNOWLEDGE BASE) */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",flexWrap:"wrap",gap:12 }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <HelpCircle size={18} color="var(--color-primary, #10b981)" />
            <div>
              <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                FAQ Oficial & Tratamento de Objeções
              </h4>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Cadastre respostas homologadas para dúvidas recorrentes. Essas respostas orientam a IA; revise o resultado no simulador.
              </p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            prefixIcon={<Plus size={14} />}
            onClick={handleAddFaq}
          >
            Adicionar Pergunta
          </Button>
        </div>

        {faqIssue&&<p id="ai-faq-error" role="alert">{faqIssue.message} O texto foi preservado.</p>}
        {removedFaq&&<div role="status"><span>FAQ removida do formulário; a versão salva permanece até salvar o rascunho.</span><Button variant="secondary" onClick={()=>{const removed=removedFaq;setFaq(prev=>{const next=[...prev];next.splice(Math.min(removed.index,next.length),0,removed.item);return next;});setRemovedFaq(null);setFaqIssue(null);}}>Desfazer última remoção de FAQ</Button></div>}
        {faq.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              backgroundColor: "var(--bg-canvas)",
              border: "1px dashed var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              color: "var(--text-secondary)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <HelpCircle size={24} style={{ opacity: 0.5 }} />
            <div>
              <strong>Nenhuma dúvida ou FAQ personalizado cadastrado ainda.</strong>
              <p style={{ margin: "4px 0 0 0" }}>
                Clique em &quot;Adicionar Pergunta&quot; para cadastrar respostas oficiais (ex.: durabilidade de serviços, cuidados prévios, garantias).
              </p>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {faq.map((item, index) => (
              <div
                key={item.id || index}
                style={{
                  padding: "14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md, 8px)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 600, color: "var(--color-primary, #10b981)" }}>
                    FAQ #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveFaq(index)}
                    title="Excluir pergunta"
                    aria-label={`Remover FAQ ${index+1} do formulário`}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "var(--color-danger, #ef4444)",
                      cursor: "pointer",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <label htmlFor={`ai-faq-question-${index}`}>Pergunta da FAQ {index+1}</label>
                <input
                  id={`ai-faq-question-${index}`} maxLength={500} aria-invalid={faqIssue?.index===index&&faqIssue.field==='question'} aria-describedby={faqIssue?.index===index&&faqIssue.field==='question'?'ai-faq-error':undefined}
                  type="text"
                  value={item.question}
                  onChange={(e) => handleUpdateFaq(index, "question", e.target.value)}
                  placeholder="Ex.: Qual é o horário de atendimento?"
                  style={{
                    width: "100%",
                    height: "34px",
                    padding: "0 10px",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md, 8px)",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                  }}
                />

                <label htmlFor={`ai-faq-answer-${index}`}>Resposta da FAQ {index+1}</label>
                <textarea
                  id={`ai-faq-answer-${index}`} maxLength={2000} aria-invalid={faqIssue?.index===index&&faqIssue.field==='answer'} aria-describedby={faqIssue?.index===index&&faqIssue.field==='answer'?'ai-faq-error':undefined}
                  value={item.answer}
                  onChange={(e) => handleUpdateFaq(index, "answer", e.target.value)}
                  rows={2}
                  placeholder="Informe somente a resposta confirmada pela empresa."
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    color: "var(--text-primary)",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md, 8px)",
                    fontFamily: "inherit",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Commercial Skills toggles */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
          <Zap size={16} color="var(--color-primary, #10b981)" /> Habilidades Comerciais (Skills)
        </h4>
        <p style={{ margin: 0, fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
          Selecione as funções propostas no rascunho. Teste cada fluxo e suas integrações antes da liberação; selecionar uma função não comprova sua execução.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {/* Skill 1: Qualify lead */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: skills.qualify_lead ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.qualify_lead ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "auto",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Zap size={20} color={skills.qualify_lead ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Qualificação de contatos</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Defina critérios e confirme as evidências de qualificação e a etapa resultante nos testes.
                </p>
              </div>
            </div>
            <input type="checkbox" aria-label="Propor qualificação de contatos" checked={skills.qualify_lead} onChange={()=>handleToggleSkill("qualify_lead")} style={{ accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 2: Catalog offers */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: skills.catalog_offers ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.catalog_offers ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "auto",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <ShoppingBag size={20} color={skills.catalog_offers ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Oferta de Itens do Catálogo</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Confira os itens, valores e informações apresentados a partir do catálogo nos testes.
                </p>
              </div>
            </div>
            <input type="checkbox" aria-label="Propor apresentação de catálogo" checked={skills.catalog_offers} onChange={()=>handleToggleSkill("catalog_offers")} style={{ accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 3: Pix charges */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: skills.pix_charges ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.pix_charges ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "auto",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <QrCode size={20} color={skills.pix_charges ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Emissão e Cobrança Pix</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  A IA prepara um resumo. A cobrança depende da confirmação explícita do cliente e da disponibilidade validada.
                </p>
              </div>
            </div>
            <input type="checkbox" aria-label="Propor cobrança Pix" checked={skills.pix_charges} onChange={()=>handleToggleSkill("pix_charges")} style={{ accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 4: Appointments */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: skills.appointments ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.appointments ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "auto",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <Calendar size={20} color={skills.appointments ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Agendamento de Horários</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Valide a integração de agenda e a confirmação da reserva antes de anunciar um horário agendado.
                </p>
              </div>
            </div>
            <input type="checkbox" aria-label="Propor agendamento" checked={skills.appointments} onChange={()=>handleToggleSkill("appointments")} style={{ accentColor: "var(--color-primary, #10b981)" }} />
          </div>

          {/* Skill 5: Meta CAPI */}
          <div
            style={{
              padding: "12px 14px",
              backgroundColor: skills.capi_tracking ? "var(--bg-surface-elevated, #f0fdf4)" : "var(--bg-canvas)",
              border: skills.capi_tracking ? "1.5px solid var(--color-primary, #10b981)" : "1px solid var(--border-default)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              cursor: "auto",
            }}
          >
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <BarChart3 size={20} color={skills.capi_tracking ? "var(--color-primary, #10b981)" : "var(--text-secondary)"} />
              <div>
                <strong style={{ fontSize: "var(--font-size-sm, 0.875rem)" }}>Telemetria Meta Conversions API (CAPI)</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                  Valide o mapeamento e o envio de marcos comerciais comprovados pela integração Meta.
                </p>
              </div>
            </div>
            <input type="checkbox" aria-label="Propor conversões Meta" checked={skills.capi_tracking} onChange={()=>handleToggleSkill("capi_tracking")} style={{ accentColor: "var(--color-primary, #10b981)" }} />
          </div>
        </div>
      </div>

      {/* DRY-RUN SIMULATOR PLAYGROUND */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1.5px solid var(--border-default)",
          borderRadius: "var(--radius-lg, 12px)",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "8px",
                backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.1))",
                color: "var(--color-primary, #10b981)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Terminal size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "var(--font-size-sm, 0.875rem)", fontWeight: 600 }}>
                  Simulador de Atendimento (Playground Dry-Run)
                </h4>
                <span
                  style={{
                    fontSize: "0.65rem",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    backgroundColor: "var(--color-action-subtle, rgba(59, 130, 246, 0.15))",
                    color: "var(--color-action, #3b82f6)",
                    fontWeight: 700,
                  }}
                >
                  Teste em Tempo Real
                </span>
              </div>
              <p style={{ margin: "2px 0 0 0", fontSize: "var(--font-size-xs, 0.75rem)", color: "var(--text-secondary)" }}>
                Teste o rascunho preenchido nesta tela, incluindo alterações ainda não salvas. A chamada usa o provedor configurado e pode consumir créditos. Este teste gera somente texto; não envia mensagens a clientes, cobra nem transfere conversas.
              </p>
            </div>
          </div>
        </div>

        {/* Contexto do Lead Simulado */}
        <div
          style={{
            padding: "12px 14px",
            backgroundColor: "var(--bg-canvas)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md, 8px)",
            display: "flex",
            flexWrap: "wrap",
            gap: "14px",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)" }}>
            <UserCheck size={16} color="var(--color-primary, #10b981)" />
            Contexto do Lead Simulado:
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px",flexWrap:"wrap",maxWidth:"100%",minWidth:0 }}>
            <label htmlFor={`${fieldId}-lead-name`} style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Nome do Lead:</label>
            <input id={`${fieldId}-lead-name`}
              type="text"
              value={mockLeadName}
              onChange={(e) => setMockLeadName(e.target.value)}
              placeholder="Ex.: Francisco"
              style={{
                height: "28px",
                padding: "0 8px",
                fontSize: "0.75rem",
                borderRadius: "4px",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
                width: "120px",
              }}
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px",flexWrap:"wrap",maxWidth:"100%",minWidth:0 }}>
            <label htmlFor={`${fieldId}-lead-pix`} style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>Status Pix / Histórico:</label>
            <select id={`${fieldId}-lead-pix`}
              value={mockPixScenario}
              onChange={(e) => setMockPixScenario(e.target.value as any)}
              style={{
                maxWidth:"100%",
                minWidth:0,
                height: "28px",
                padding: "0 8px",
                fontSize: "0.75rem",
                borderRadius: "4px",
                border: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-primary)",
              }}
            >
              <option value="none">Lead Frio (Sem Pix recente)</option>
              <option value="pending">Pix Pendente (R$ 149,90 gerado)</option>
              <option value="paid">Cliente Fiel (Pix Já Pago)</option>
            </select>
          </div>
        </div>

        {/* Quick Question Chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "var(--font-size-xs, 0.7rem)", color: "var(--text-secondary)", fontWeight: 600 }}>
            Testes Rápidos de Estresse de Objeções & Vendas:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {[
              { label: "💰 'Tá muito caro, tem desconto?'", text: "Achei o valor bem salgado, não tem nenhum desconto pra fechar agora?" },
              { label: "⏳ 'Vou pensar e te aviso'", text: "Achei bacana, mas vou pensar com calma e qualquer coisa te chamo." },
              { label: "🛡️ 'É de confiança? Tenho garantia?'", text: "Como sei que é seguro e de confiança? Tenho alguma garantia se não der certo?" },
              { label: "🚚 'Demora pra entregar / atender?'", text: "Se eu pagar hoje no Pix, quando chega meu pedido ou quando posso ser atendido?" },
              { label: "⚡ 'Me manda a chave Pix'", text: "Perfeito, gostei muito! Me manda o Pix pra eu pagar agora." },
              { label: "🛡️ Ignorância: 'Faz permuta ou fiado?'", text: "Vocês aceitam permuta por um carro ou parcelam no boleto fiado?" },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSimulate(chip.text)}
                disabled={simLoading}
                style={{
                  padding: "4px 10px",
                  borderRadius: "999px",
                  border: "1px solid var(--border-default)",
                  backgroundColor: "var(--bg-canvas)",
                  color: "var(--text-primary)",
                  cursor: simLoading ? "not-allowed" : "pointer",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>{chip.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Input and Trigger */}
        <label htmlFor={`${fieldId}-simulation-message`} style={{fontSize:"var(--font-size-xs)",fontWeight:600}}>Mensagem simulada do cliente</label>
        <p id={`${fieldId}-simulation-help`} style={{margin:0,fontSize:12,color:"var(--text-secondary)"}}>Até 2000 caracteres. Testar usa o provedor configurado e pode consumir créditos; não envia a mensagem ao cliente.</p>
        <div style={{ display: "flex",flexWrap:"wrap", gap: "8px", alignItems: "center" }}>
          <input id={`${fieldId}-simulation-message`} aria-describedby={`${fieldId}-simulation-help`}
            type="text"
            value={simInput}
            onChange={(e) => setSimInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !simLoading && simInput.trim()) {
                e.preventDefault();
                handleSimulate();
              }
            }}
            placeholder="Digite a mensagem simulada do cliente..."
            maxLength={2000}
            style={{
              flex: "1 1 200px",minWidth:0,boxSizing:"border-box",
              padding: "10px 14px",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-canvas)",
              color: "var(--text-primary)",
              fontSize: "var(--font-size-sm, 0.875rem)",
              outline: "none",
            }}
          />
          <Button
            size="md"
            variant="secondary"
            onClick={() => handleSimulate()}
            disabled={simLoading || !simInput.trim()}
            prefixIcon={simLoading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          >
            {simLoading ? "Executando..." : "Testar Resposta"}
          </Button>
        </div>

        {simError && (
          <div
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-danger-subtle, rgba(239, 68, 68, 0.1))",
              color: "var(--color-danger, #ef4444)",
              borderRadius: "var(--radius-md, 8px)",
              fontSize: "var(--font-size-xs, 0.75rem)",
            }}
          >
            {simError}
          </div>
        )}

        {/* Result Preview Box */}
        {simResult&&simulationOutdated&&<p role="status">Este resultado pertence ao teste anterior. Os campos foram alterados; execute outro teste para avaliar a configuração atual.</p>}
        {simResult && simSnapshot && (
          <div
            style={{
              marginTop: "8px",
              padding: "16px",
              borderRadius: "var(--radius-md, 8px)",
              backgroundColor: "var(--bg-canvas)",
              border: "1px solid var(--border-default)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            {/* Telemetry Bar */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                alignItems: "center",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--border-default)",
                fontSize: "var(--font-size-xs, 0.75rem)",
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                  fontWeight: 600,
                }}
              >
                ⚡ Latência: <strong>{simResult.latencyMs}ms</strong>
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                🧠 Motor: <strong>{simResult.provider}</strong> ({simResult.model})
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                📦 Itens incluídos no teste: <strong>{simResult.matchedCatalogCount} itens</strong>{simResult.capabilities&&<span> · Uso: {({none:'sem catálogo',offers:'apresentação',billing:'somente cobrança',offers_and_billing:'apresentação e cobrança'} as const)[simResult.capabilities.catalogAccess]} · Pix {simResult.capabilities.pixCharges?'selecionado':'desligado'}</span>}
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                📋 Regras de Negócio: <strong>{simResult.groundedRulesCount ?? 0} ativas</strong>
              </span>
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                ❓ FAQ: <strong>{simResult.groundedFaqCount ?? 0} respostas</strong>
              </span>
              {simResult.isCustomPromptUsed && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    backgroundColor: "rgba(139, 92, 246, 0.1)",
                    color: "#8b5cf6",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    fontWeight: 600,
                  }}
                >
                  ✨ Prompt Personalizado Ativo
                </span>
              )}
              <span
                style={{
                  marginLeft: "auto",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  backgroundColor: simResult.needsHandoff
                    ? "var(--color-danger-subtle, rgba(239, 68, 68, 0.15))"
                    : "var(--color-success-subtle, rgba(16, 185, 129, 0.15))",
                  color: simResult.needsHandoff ? "var(--color-danger, #ef4444)" : "var(--color-success, #10b981)",
                }}
              >
                {simResult.needsHandoff ? "Encaminhamento sugerido" : "Resposta gerada — revisão necessária"}
              </span>
            </div>

            {/* Chat Simulation Preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {/* User Bubble */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: "12px 12px 2px 12px",
                    backgroundColor: "var(--color-primary-subtle, rgba(16, 185, 129, 0.2))",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-xs, 0.8rem)",
                    lineHeight: 1.4,
                  }}
                >
                  <div style={{ fontSize: "0.65rem", fontWeight: 700, opacity: 0.7, marginBottom: "2px" }}>
                    CLIENTE SIMULADO: {simSnapshot.leadName.trim() ? simSnapshot.leadName.toUpperCase() : "SEM NOME"}{" "}
                    {simSnapshot.pixScenario === "pending"
                      ? "• ⏳ PIX PENDENTE"
                      : simSnapshot.pixScenario === "paid"
                      ? "• 🌟 CLIENTE RECORRENTE"
                      : ""}
                  </div>
                  {simSnapshot.message}
                </div>
              </div>

              {/* AI Bubble */}
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "12px 16px",
                    borderRadius: "12px 12px 12px 2px",
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-xs, 0.8rem)",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <Bot size={14} color="var(--color-primary, #10b981)" />
                    <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--color-primary, #10b981)" }}>
                      {simSnapshot.agentName || "Assistente Virtual"}
                    </span>
                  </div>
                  {simResult.replyText}
                </div>
              </div>
            </div>

            {/* Handoff Notice if triggered */}
            {simResult.offerPixProductId&&<aside aria-label="Resumo de pagamento solicitado no teste" style={{padding:12,border:'1px solid var(--border-default)',borderRadius:8}}>
              <strong>O modelo solicitou um resumo de pagamento</strong>
              <p>Item: {simResult.catalogSnapshot?.find(item=>item.id===simResult.offerPixProductId)?.title??'Não identificado entre os itens consultados'} · Quantidade: {simResult.offerPixQuantity??'inválida'}</p>
              {simResult.capabilities?.pixCharges===false&&<p>A solicitação é incompatível com a configuração: cobrança Pix está desligada.</p>}
              <p>Este simulador não criou resumo, confirmação do cliente ou cobrança.</p>
            </aside>}

            {simResult.needsHandoff && (
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: "6px",
                  backgroundColor: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  color: "var(--text-primary)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontWeight: 700, color: "#d97706" }}>
                  <AlertTriangle size={15} /> O modelo sugeriu encaminhamento humano
                </div>
                <span>
                  O simulador não transferiu a conversa nem comprovou a correção da resposta. Motivo informado pelo modelo:
                </span>
                <code
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    padding: "4px 8px",
                    borderRadius: "4px",
                    fontSize: "0.7rem",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {simResult.handoffReason || "Dúvida não encontrada na base factual de catálogo e regras"}
                </code>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save button bar */}
      <div style={{ display: "flex", justifyContent: "flex-end", flexWrap:"wrap" }}>
        <Button
          size="md"
          variant="primary"
          prefixIcon={<Save size={16} />}
          onClick={handleSave}
          disabled={saving}
          style={{ boxShadow: "var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.1))" }}
        >
          {saving ? "Salvando alterações..." : "Salvar rascunho operacional"}
        </Button>
      </div>
      </fieldset></details>
      </fieldset>
    </div>
  );
};
