import {useDiscardChanges,UnsavedChangesNotice} from "../UnsavedChangesNotice";
import {assembleTemplate,inspectTemplateLayout,isRecipientNameVariable} from "@sos-sales/contracts";
import { useState, useEffect, useMemo, useRef, type FC, type FormEvent, type CSSProperties } from "react";
import {
  Dialog,
  Button,
  Input,
  Badge,
  Alert,
  SegmentedControl,
  LoadingState,
  useBreakpoint,
} from "@sos-sales/ui";
import {
  Send,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  FileSpreadsheet,
  UploadCloud,
  Trash2,
  Filter,
} from "lucide-react";
import {
  apiClient,ApiError,
  type MessageTemplateSummary,
  type ChannelSummary,
} from "../../services/api-client";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";
import { CreateTemplateDialog } from "./CreateTemplateDialog";
import { userFacingError } from "../../utils/user-facing-error";

import { loadSpreadsheetLibrary, parseCsvText, suggestImportColumns, mapImportRows, type ImportRow, type ImportPhoneFormat } from "./import-audience";
export { sanitizeBrazilianPhoneE164, parseCsvText } from "./import-audience";

export {isRecipientNameVariable} from "@sos-sales/contracts";

// Format template name for commercial/human readability and cost awareness
export function formatTemplateDisplayTitle(
  tpl: MessageTemplateSummary | { name: string; category?: string; metaTemplateId?: string | null }
): string {
  let clean = tpl.name
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\bv(\d+)\b/gi, "(v$1)")
    .trim();

  clean = clean
    .split(" ")
    .map((word) => {
      const lower = word.toLowerCase();
      if (["de", "do", "da", "dos", "das", "e", "para", "em", "com"].includes(lower)) return lower;
      if (lower === "nps") return "NPS";
      if (lower === "pix") return "Pix";
      if (lower === "ctwa") return "CTWA";
      if (lower === "vip") return "VIP";
      if (lower === "ia") return "IA";
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");

  const isUtility = tpl.category === "UTILITY";
  const costBadge = isUtility ? "Utilidade — consulte tarifa no provedor" : "Marketing — consulte tarifa no provedor";
  const approvalBadge = tpl.metaTemplateId ? "Identificado na Meta — confira a aprovação" : "Local";
  return `${clean} [${costBadge} • ${approvalBadge}]`;
}

// Variable metadata with human labels, placeholders, and quick suggestions
export function getVariableMetadata(key: string): {
  label: string;
  placeholder: string;
  isName: boolean;
  suggestions: string[];
} {
  const isName = isRecipientNameVariable(key);
  if (isName) {
    return {
      label: "Nome do Contato",
      placeholder: "[👤 Nome do Contato (Automático)]",
      isName: true,
      suggestions: [],
    };
  }

  const clean = key.trim().toLowerCase();
  if (
    clean === "2" ||
    clean.includes("procedimento") ||
    clean.includes("servico") ||
    clean.includes("produto") ||
    clean.includes("tratamento")
  ) {
    return {
      label: clean === "2" ? "Procedimento ou Oferta ({{2}})" : `Procedimento / Serviço ({{${key}}})`,
      placeholder: "ex: Limpeza Facial, Consulta Avaliativa, Botox",
      isName: false,
      suggestions: ["Limpeza de Pele", "Consulta Avaliativa", "Avaliação Gratuita", "Sessão Especial"],
    };
  }
  if (
    clean === "3" ||
    clean.includes("desconto") ||
    clean.includes("cupom") ||
    clean.includes("oferta") ||
    clean.includes("promocao") ||
    clean.includes("bonus")
  ) {
    return {
      label: clean === "3" ? "Oferta / Desconto ({{3}})" : `Desconto / Cupom ({{${key}}})`,
      placeholder: "ex: 15% OFF, FRETEGRATIS, Bônus R$ 50",
      isName: false,
      suggestions: ["15% OFF", "20% OFF", "Cupom VIP", "Bônus Especial"],
    };
  }
  if (clean.includes("data") || clean.includes("horario") || clean.includes("dia")) {
    return {
      label: `Data ou Horário ({{${key}}})`,
      placeholder: "ex: amanhã às 14h / nesta sexta-feira",
      isName: false,
      suggestions: ["hoje às 15h", "amanhã", "nesta sexta-feira"],
    };
  }
  if (clean.includes("link") || clean.includes("url") || clean.includes("site")) {
    return {
      label: `Link de Ação ({{${key}}})`,
      placeholder: "ex: https://...",
      isName: false,
      suggestions: [],
    };
  }

  return {
    label: `Variável {{${key}}}`,
    placeholder: `Conteúdo para {{${key}}}`,
    isName: false,
    suggestions: [],
  };
}

interface BroadcastTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  initialTemplate?: MessageTemplateSummary | null;
  onBroadcastSuccess?: () => void;
}

const validatePreflight=(value:Awaited<ReturnType<typeof apiClient.getBroadcastPreflight>>)=>{
 if(!value||value.success!==true||!Array.isArray(value.channels)||!Array.isArray(value.templates)||!Number.isSafeInteger(value.totalActiveContacts)||value.totalActiveContacts<0)throw new Error("A consulta não confirmou canais, modelos e público válidos. Atualize o preparo antes de continuar.");
 return value;
};

export const BroadcastTemplateDialog: FC<BroadcastTemplateDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  initialTemplate,
  onBroadcastSuccess,
}) => {
  const variableMetadata=(key:string)=>key.includes(":")?{label:key==="header:media"?"URL da mídia do cabeçalho":key==="header:filename"?"Nome do documento (opcional)":key.startsWith("header:")?`Cabeçalho {{${key.slice(7)}}}`:key.endsWith(":payload")?`Identificador da resposta do botão ${Number(key.split(":")[1])+1} (opcional)`:`Complemento do link do botão ${Number(key.split(":")[1])+1}`,placeholder:key==="header:media"?"https://...":"Confira este campo na prévia",isName:false,suggestions:[] as string[]}:/^\d+$/.test(key)&&key!=="1" ? {label:`Valor para {{${key}}}`,placeholder:"Confira este campo na prévia da mensagem",isName:false,suggestions:[] as string[]} : getVariableMetadata(key);
  const { isMobile } = useBreakpoint();
  const mobileActionStyle:CSSProperties|undefined=isMobile?{width:"100%",minHeight:44,height:"auto",whiteSpace:"normal",overflowWrap:"anywhere",lineHeight:1.35}:undefined;
  const submissionRef = useRef<{ fingerprint: string; key: string;payload:Parameters<typeof apiClient.createBroadcast>[1] } | null>(null);
  const operation=useRef<symbol|null>(null);
  const initialChoice=useRef<{scope:string;channel:string;modelA:string;modelB:string}|null>(null);
  const nameRef=useRef<HTMLInputElement>(null);
  const [confirmationUncertain,setConfirmationUncertain]=useState(false);
  const availableFor=(channel:ChannelSummary|undefined,items:MessageTemplateSummary[])=>channel?.provider==="meta_waba"?items.filter(template=>template.status==="APPROVED"&&Boolean(template.metaTemplateId)&&template.metaVerifiedChannelId===channel.id&&new Date(template.metaVerifiedAt||"").getTime()>Date.now()-86400000):items;
  useEffect(() => { if (isOpen) submissionRef.current = null; }, [isOpen]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${isOpen}`;
  const fileRevision=useRef(0);
  const dialogGeneration=useRef(0);
  const [preflightError,setPreflightError]=useState<string | null>(null);
  const [preflightReload,setPreflightReload]=useState(0);
  const [countError,setCountError]=useState<string | null>(null);
  const [countReload,setCountReload]=useState(0);
  const [readyScope,setReadyScope]=useState<string | null>(null);
  const [review,setReview]=useState<{scope:string;generation:number;prepared:Awaited<ReturnType<typeof apiClient.prepareBroadcast>>;payload:Parameters<typeof apiClient.createBroadcast>[1];channel:string;modelA:string;modelB:string;bodyA:string;bodyB:string;audience:string} | null>(null);
  const [testPhone,setTestPhone]=useState("");
  const [testResults,setTestResults]=useState<Awaited<ReturnType<typeof apiClient.getBroadcastTests>>["tests"]>([]);
  const [approvedTestIds,setApprovedTestIds]=useState<string[]>([]);
  const [testBusy,setTestBusy]=useState(false);
  const [testError,setTestError]=useState("");
  const testRequest=useRef(0);
  const testInFlight=useRef(false);
  useEffect(()=>{testRequest.current++;testInFlight.current=false;setTestBusy(false);setTestPhone("");setTestResults([]);setApprovedTestIds([]);setTestError("");},[review?.prepared.preparedAudienceId,workspaceId,token,isOpen]);
  const testsApproved=Boolean(review&&["A",...(review.payload.isAbTest?["B"]:[])].every(variant=>testResults.some(test=>test.variant===variant&&test.status==="sent"&&approvedTestIds.includes(test.id))));
  async function updateMessageTests(variant?:"A"|"B"){
    if(!isOpen||!review||testInFlight.current||operation.current||discard.isPending||confirmationUncertain||review.scope!==scope.current||review.generation!==dialogGeneration.current)return;
    const requestedScope=scope.current,generation=review.generation,request=++testRequest.current;
    const current=()=>requestedScope===scope.current&&generation===dialogGeneration.current&&request===testRequest.current;
    if(variant&&!/^\+[1-9][0-9]{8,14}$/.test(testPhone.trim())){setTestError("Informe o número de teste com + e código do país, sem espaços. Exemplo: +5511999999999.");return;}
    testInFlight.current=true;setTestBusy(true);setTestError("");
    try{
      if(variant)await apiClient.sendBroadcastTest(workspaceId,{...review.payload,testPhone:testPhone.trim(),testVariant:variant},{token});
      if(!current())return;
      const result=await apiClient.getBroadcastTests(workspaceId,review.prepared.preparedAudienceId,{token});
      if(current()){setTestResults(result.tests);setApprovedTestIds(ids=>ids.filter(id=>result.tests.some(test=>test.id===id&&test.status==="sent")));}
    }catch(error){if(current())setTestError(userFacingError(error,"Não foi possível consultar ou preparar o teste. Atualize o resultado antes de tentar novamente."));}
    finally{if(current()){testInFlight.current=false;setTestBusy(false);}}
  }

  const [reviewAccepted,setReviewAccepted]=useState(false);

  const [isLoadingPreflight, setIsLoadingPreflight] = useState(true);
  const [channels, setChannels] = useState<Array<ChannelSummary & { isBlockedForBroadcast: boolean }>>([]);
  const [templates, setTemplates] = useState<MessageTemplateSummary[]>([]);
  const [totalActiveContacts, setTotalActiveContacts] = useState(0);

  // Campaign Configuration
  const [campaignName, setCampaignName] = useState("");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [isAbTest, setIsAbTest] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedTemplateBId, setSelectedTemplateBId] = useState("");
  const [audienceType, setAudienceType] = useState<"ALL_CONTACTS" | "SMART_FILTER" | "IMPORT_LIST" | "BY_STAGE" | "MANUAL">("ALL_CONTACTS");
  const [stage, setStage] = useState("LEAD");
  const [smartFilter, setSmartFilter] = useState<"NON_BUYERS" | "PIX_ABANDONED" | "INACTIVE_30_DAYS" | "CTWA_RESCUE">("NON_BUYERS");
  const [smartCount, setSmartCount] = useState<number | null>(null);
  const [isLoadingSmartCount, setIsLoadingSmartCount] = useState(false);

  // Planilha Import State
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [importRows,setImportRows]=useState<ImportRow[]>([]);
  const phoneColumnRef=useRef<HTMLSelectElement|null>(null);
  const focusImportMapping=useRef(false);
  useEffect(()=>{if(!isParsingFile&&importRows.length&&focusImportMapping.current){focusImportMapping.current=false;phoneColumnRef.current?.focus();}},[isParsingFile,importRows]);
  const [phoneColumn,setPhoneColumn]=useState("");
  const [nameColumn,setNameColumn]=useState("");
  const [phoneFormat,setPhoneFormat]=useState<ImportPhoneFormat>("BR");
  const importColumns=useMemo(()=>suggestImportColumns(importRows).columns,[importRows]);
  const mappedImport=useMemo(()=>mapImportRows(importRows,phoneColumn,nameColumn,phoneFormat),[importRows,phoneColumn,nameColumn,phoneFormat]);
  const importedContacts=mappedImport.contacts;
  const importStats=importRows.length&&phoneColumn?mappedImport.stats:null;
  const [importError, setImportError] = useState<string | null>(null);

  const [manualPhones, setManualPhones] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [variablesB, setVariablesB] = useState<Record<string, string>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    batchId: string;
    enqueuedCount: number;
    totalTargeted: number;
    templateName: string;
    isAbTest: boolean;
  } | null>(null);
  const [isCreateAiModalOpen, setIsCreateAiModalOpen] = useState(false);

  const base=initialChoice.current;
  const hasDraft=isOpen&&!successInfo&&readyScope===scope.current&&base?.scope===scope.current&&Boolean(review||campaignName||isAbTest||selectedChannelId!==base.channel||selectedTemplateId!==base.modelA||selectedTemplateBId!==base.modelB||audienceType!=="ALL_CONTACTS"||stage!=="LEAD"||smartFilter!=="NON_BUYERS"||manualPhones||importedFile||Object.values(variables).some(Boolean)||Object.values(variablesB).some(Boolean));
  const discard=useDiscardChanges(Boolean(hasDraft),`${scope.current}:${initialTemplate?.id??""}:${preflightReload}`,()=>nameRef.current,isOpen);
  const requestClose=()=>{if(!operation.current&&!testInFlight.current)discard.requestExit(onClose);};

  const handleTemplateCreated = async () => {
    const requestedScope=scope.current,generation=dialogGeneration.current;
    try {
      const res = await apiClient.getBroadcastPreflight(workspaceId, { token });
      if(requestedScope!==scope.current||generation!==dialogGeneration.current)return;
      validatePreflight(res);
      setTemplates(res.templates);
      const eligible=availableFor(selectedChannel,res.templates);
      setSelectedTemplateId(current=>eligible.some(item=>item.id===current)?current:eligible[0]?.id||"");
    } catch (e) {
      if(requestedScope===scope.current&&generation===dialogGeneration.current)throw e;
    }
  };

  // Load preflight data on open
  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;

    let isMounted = true;
    dialogGeneration.current++;operation.current=null;initialChoice.current=null;setIsSubmitting(false);setConfirmationUncertain(false);submissionRef.current=null;
    setIsLoadingPreflight(true);
    setErrorMessage(null);
    setSuccessInfo(null);
    setReview(null);setReviewAccepted(false);setReadyScope(null);
    setPreflightError(null);setChannels([]);setTemplates([]);setSelectedChannelId("");setSelectedTemplateId("");setSelectedTemplateBId("");setTotalActiveContacts(0);
    setCampaignName("");setIsAbTest(false);setAudienceType("ALL_CONTACTS");setManualPhones("");setVariables({});setVariablesB({});
    setImportedFile(null);setImportRows([]);setPhoneColumn("");setNameColumn("");setPhoneFormat("BR");setImportError(null);setIsParsingFile(false);fileRevision.current++;
    setSmartCount(null);setCountError(null);setIsCreateAiModalOpen(false);

    apiClient
      .getBroadcastPreflight(workspaceId, { token })
      .then((res) => {
        if (!isMounted) return;
        validatePreflight(res);
        setChannels(res.channels);
        setTemplates(res.templates);
        setTotalActiveContacts(res.totalActiveContacts);
        setReadyScope(scope.current);

        // Pre-select channel: prioritize ready meta_waba or connected channel
        const readyChannel =
          res.channels.find((ch) => ch.provider === "meta_waba" && ch.metaBillingConfigured && ch.status === "connected") ||
          res.channels.find((ch) => ch.status === "connected") ||
          res.channels[0];

        if (readyChannel) {
          setSelectedChannelId(readyChannel.id);
        }

        const eligible=availableFor(readyChannel,res.templates);
        const modelA=initialTemplate&&eligible.some(item=>item.id===initialTemplate.id)?initialTemplate.id:eligible[0]?.id||"";
        const modelB=eligible[1]?.id||eligible[0]?.id||"";
        initialChoice.current={scope:scope.current,channel:readyChannel?.id||"",modelA,modelB};
        setSelectedTemplateId(modelA);setSelectedTemplateBId(modelB);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        setPreflightError(userFacingError(err,"Falha ao carregar canais e modelos para disparo."));
      })
      .finally(() => {
        if (isMounted) setIsLoadingPreflight(false);
      });

    return () => {
      isMounted = false;dialogGeneration.current++;operation.current=null;
    };
  }, [isOpen, workspaceId, token, initialTemplate?.id,preflightReload]);

  // Selected Channel Object
  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId),
    [channels, selectedChannelId]
  );
  const availableTemplates=useMemo(()=>availableFor(selectedChannel,templates),[templates,selectedChannel]);
  useEffect(()=>{
    setSelectedTemplateId(current=>availableTemplates.some(template=>template.id===current)?current:availableTemplates[0]?.id||"");
    setSelectedTemplateBId(current=>availableTemplates.some(template=>template.id===current)?current:availableTemplates[1]?.id||availableTemplates[0]?.id||"");
  },[availableTemplates]);

  // Selected Template A Object
  const selectedTemplate = useMemo(
    () => availableTemplates.find((t) => t.id === selectedTemplateId),
    [availableTemplates, selectedTemplateId]
  );

  // Selected Template B Object
  const selectedTemplateB = useMemo(
    () => availableTemplates.find((t) => t.id === selectedTemplateBId),
    [availableTemplates, selectedTemplateBId]
  );

  const templateVarKeys=useMemo(()=>selectedTemplate?inspectTemplateLayout(selectedTemplate).fields.filter(field=>selectedChannel?.provider==="meta_waba"||field.kind!=="payload").map(field=>field.key):[],[selectedTemplate,selectedChannel?.provider]);
  const templateVarKeysB=useMemo(()=>selectedTemplateB?inspectTemplateLayout(selectedTemplateB).fields.filter(field=>selectedChannel?.provider==="meta_waba"||field.kind!=="payload").map(field=>field.key):[],[selectedTemplateB,selectedChannel?.provider]);
  const previewLayout=(template:MessageTemplateSummary|undefined,values:Record<string,string>)=>{
    if(!template)return null;const resolved={...values};
    for(const field of inspectTemplateLayout(template).fields)if(isRecipientNameVariable(field.key))resolved[field.key]="[Nome do contato]";
    return assembleTemplate(template,resolved);
  };
  const layoutPreviewA=previewLayout(selectedTemplate,variables),layoutPreviewB=previewLayout(selectedTemplateB,variablesB);
  // Preview body A with Realistic WYSIWYG
  const previewBody = useMemo(() => {
    if (!selectedTemplate) return "";
    let body = selectedTemplate.bodyText || (selectedTemplate as any)?.body_text || "";
    if (!body) return "";
    for (const key of templateVarKeys) {
      const isName = isRecipientNameVariable(key);
      const userVal = variables[key];
      let val = userVal;
      if (!val || val === "[Nome do Contato]" || (isName && (!val.trim() || val.includes("[Nome")))) {
        val = isName ? "[Nome do contato]" : `[${variableMetadata(key).label.split(" (")[0]}]`;
      }
      body = body.split(`{{${key}}}`).join(val);
    }
    return body;
  }, [selectedTemplate, templateVarKeys, variables]);

  // Preview body B with Realistic WYSIWYG
  const previewBodyB = useMemo(() => {
    if (!selectedTemplateB) return "";
    let body = selectedTemplateB.bodyText || (selectedTemplateB as any)?.body_text || "";
    if (!body) return "";
    for (const key of templateVarKeysB) {
      const isName = isRecipientNameVariable(key);
      const userVal = variablesB[key];
      let val = userVal;
      if (!val || val === "[Nome do Contato]" || (isName && (!val.trim() || val.includes("[Nome")))) {
        val = isName ? "[Nome do contato]" : `[${variableMetadata(key).label.split(" (")[0]}]`;
      }
      body = body.split(`{{${key}}}`).join(val);
    }
    return body;
  }, [selectedTemplateB, templateVarKeysB, variablesB]);

  // Fetch live count for Smart Filters or Stages
  useEffect(() => {
    if (!isOpen || !workspaceId || !token) return;
    let cancelled=false;
    setSmartCount(null);setCountError(null);setIsLoadingSmartCount(false);
    if(audienceType!=="SMART_FILTER"&&audienceType!=="BY_STAGE")return;
    setIsLoadingSmartCount(true);
    apiClient.getAudienceCount(workspaceId,audienceType==="SMART_FILTER"?{type:"SMART_FILTER",smartFilter}:{type:"BY_STAGE",stage},{token})
      .then(res=>{if(!cancelled)setSmartCount(res.count);})
      .catch(error=>{if(!cancelled)setCountError(userFacingError(error,"Não foi possível consultar o público."));})
      .finally(()=>{if(!cancelled)setIsLoadingSmartCount(false);});
    return()=>{cancelled=true;};
  }, [isOpen, workspaceId, token, audienceType, smartFilter, stage,countReload]);

  const processFile = async (file: File) => {
    if(operation.current||testInFlight.current||discard.isPending||successInfo)return;
    const revision=++fileRevision.current,requestedScope=scope.current;
    const valid=()=>revision===fileRevision.current&&requestedScope===scope.current;
    setIsParsingFile(true);
    setImportError(null);
    setImportedFile(file);
    setImportRows([]);setPhoneColumn("");setNameColumn("");

    try {
      if(file.size>10*1024*1024)throw new Error("A planilha deve ter até 10 MB. Divida o arquivo e tente novamente.");
      let rows: ImportRow[] = [];
      const isCsv = file.name.toLowerCase().endsWith(".csv");
      const isExcel =
        file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

      if (isCsv) {
        const text = await file.text();
        rows = await parseCsvText(text);
      } else if (isExcel) {
        const buffer = await file.arrayBuffer();
        const XLSX = await loadSpreadsheetLibrary();
        if(!valid())return;
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheetName = wb.SheetNames[0];
        if (!firstSheetName) {
          throw new Error("A planilha não possui abas visíveis.");
        }
        const ws = wb.Sheets[firstSheetName];
        if (!ws) {
          throw new Error("Aba da planilha vazia.");
        }
        rows = XLSX.utils.sheet_to_json<ImportRow>(ws,{defval:"",raw:true});
      } else {
        throw new Error("Formato não suportado. Por favor, envie um arquivo .csv ou .xlsx.");
      }

      if (rows.length === 0) {
        throw new Error("Nenhum dado encontrado no arquivo.");
      }

      if(!valid())return;
      focusImportMapping.current=true;
      const mapping=suggestImportColumns(rows);
      setImportRows(rows);setPhoneColumn(mapping.phoneColumn);setNameColumn(mapping.nameColumn);
    } catch (err: unknown) {
      if(!valid())return;
      setImportError(err instanceof Error ? err.message : "Erro ao processar planilha.");
      setImportRows([]);setPhoneColumn("");setNameColumn("");
    } finally {
      if(valid())setIsParsingFile(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processFile(file);
    }
    e.target.value="";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const removeImportedFile = () => {
    fileRevision.current++;setIsParsingFile(false);
    setImportedFile(null);
    setImportRows([]);setPhoneColumn("");setNameColumn("");
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Mandatory Billing Gate Check
  const isMetaWaba = selectedChannel?.provider === "meta_waba";
  const isMetaBillingConfigured = Boolean(selectedChannel?.metaBillingConfigured);
  const isBillingBlocked = isMetaWaba && !isMetaBillingConfigured;
  const isChannelConnected = selectedChannel?.status === "connected" && selectedChannel?.isActive!==false;

  const canSubmit =
    !isLoadingPreflight &&
    readyScope===scope.current &&
    !isSubmitting &&
    !discard.isPending &&
    !isParsingFile &&
    !preflightError &&
    Boolean(selectedChannelId) &&
    isChannelConnected &&
    !isBillingBlocked &&
    Boolean(selectedTemplate) &&
    (!isAbTest || Boolean(selectedTemplateB)) &&
    (audienceType !== "IMPORT_LIST" || (importedContacts.length > 0 && !mappedImport.error && !importError)) &&
    (audienceType !== "MANUAL" || manualPhones.trim().length > 0) &&
    (!["SMART_FILTER","BY_STAGE"].includes(audienceType)||(!isLoadingSmartCount&&smartCount!==null&&smartCount>0)) &&
    (audienceType!=="ALL_CONTACTS"||totalActiveContacts>0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOpen||operation.current||testInFlight.current||!canSubmit || !selectedChannel || !selectedTemplate) return;
    const requestedScope=scope.current;
    const generation=dialogGeneration.current,id=Symbol();operation.current=id;

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      let customPhoneNumbers: string[] | undefined;
      if (audienceType === "MANUAL") {
        const cleaned = manualPhones
          .split(/[\n,;]+/)
          .map((p) => p.trim())
          .filter(Boolean);

        if (cleaned.length === 0) {
          throw new Error("Informe pelo menos um número de telefone com DDI (ex: +554999999999).");
        }

        const validE164 = /^\+[1-9][0-9]{8,14}$/;
        for (const phone of cleaned) {
          if (!validE164.test(phone)) {
            throw new Error(`Número inválido: "${phone}". Use o formato internacional com + (ex: +554999999999).`);
          }
        }
        customPhoneNumbers = Array.from(new Set(cleaned));
      }

      if (audienceType === "IMPORT_LIST" && importedContacts.length === 0) {
        throw new Error("Faça o upload de uma planilha válida com pelo menos um contato.");
      }
      for(const rendered of [layoutPreviewA,...(isAbTest?[layoutPreviewB]:[])]){
        if(!rendered)throw new Error("Selecione o modelo para revisar.");
        const problems=[...rendered.unsupported,...rendered.errors,...rendered.missing.map(label=>`Preencha ${label}.`)];
        if(problems.length)throw new Error(problems.join(" "));
      }
      // Prepare sanitized variables: Ensure auto-mapped name variables default to [Nome do Contato] if empty
      const sanitizedVariables: Record<string, string> = { ...variables };
      for (const k of templateVarKeys) {
        if (isRecipientNameVariable(k) && !sanitizedVariables[k]) {
          sanitizedVariables[k] = "[Nome do Contato]";
        }
      }

      const sanitizedVariablesB: Record<string, string> = { ...variablesB };
      for (const k of templateVarKeysB) {
        if (isRecipientNameVariable(k) && !sanitizedVariablesB[k]) {
          sanitizedVariablesB[k] = "[Nome do Contato]";
        }
      }

      const payload = {
          name: campaignName.trim() || undefined,
          channelInstanceId: selectedChannel.id,
          templateId: selectedTemplate.id,
          isAbTest,
          variantBTemplateId: isAbTest && selectedTemplateB ? selectedTemplateB.id : undefined,
          audience: {
            type: audienceType,
            stage: audienceType === "BY_STAGE" ? stage : undefined,
            customPhoneNumbers,
            importedContacts: audienceType === "IMPORT_LIST" ? importedContacts : undefined,
            smartFilter: audienceType === "SMART_FILTER" ? smartFilter : undefined,
          },
          variables: sanitizedVariables,
          variantBVariables: isAbTest ? sanitizedVariablesB : undefined,
        };
      const label=audienceType==="ALL_CONTACTS"?"Contatos sem bloqueio comercial":audienceType==="SMART_FILTER"?`Filtro ${smartFilter}`:audienceType==="BY_STAGE"?`Etapa ${stage}`:audienceType==="IMPORT_LIST"?"Planilha importada":"Lista manual";
      const prepared=await apiClient.prepareBroadcast(workspaceId,payload,{token});
      if(requestedScope!==scope.current||generation!==dialogGeneration.current)return;
      setReview({scope:requestedScope,generation,prepared,payload:{...payload,preparedAudienceId:prepared.preparedAudienceId},channel:selectedChannel.displayName,modelA:selectedTemplate.name,modelB:selectedTemplateB?.name||"",bodyA:[layoutPreviewA?.mediaUrl?`Mídia do cabeçalho: ${layoutPreviewA.mediaUrl}`:"",layoutPreviewA?.renderedText].filter(Boolean).join("\n\n"),bodyB:[layoutPreviewB?.mediaUrl?`Mídia do cabeçalho: ${layoutPreviewB.mediaUrl}`:"",layoutPreviewB?.renderedText].filter(Boolean).join("\n\n"),audience:`${label} · ${prepared.included.length} contato(s) incluído(s)`});
      setReviewAccepted(false);
    } catch (err: unknown) {
      if(requestedScope===scope.current&&generation===dialogGeneration.current)setErrorMessage(userFacingError(err,"Não foi possível preparar a revisão."));
    } finally {if(operation.current===id){operation.current=null;if(requestedScope===scope.current&&generation===dialogGeneration.current)setIsSubmitting(false);}}
  };

  const confirmBroadcast = async () => {
    if(!isOpen||operation.current||testInFlight.current||discard.isPending||!review||!testsApproved||!reviewAccepted||review.scope!==scope.current||review.generation!==dialogGeneration.current||isSubmitting||!review.prepared.included.length)return;
    if(!confirmationUncertain&&new Date(review.prepared.expiresAt).getTime()<=Date.now()){setErrorMessage("A revisão venceu. Volte e prepare o público novamente antes de confirmar.");return;}
    const requestedScope=scope.current,generation=review.generation,id=Symbol();operation.current=id;
    const payload=confirmationUncertain&&submissionRef.current?submissionRef.current.payload:{...review.payload,approvedTestIds:[...approvedTestIds]};
    const current=()=>requestedScope===scope.current&&generation===dialogGeneration.current&&operation.current===id;
    setErrorMessage(null);setIsSubmitting(true);
    try {
      const fingerprint = JSON.stringify(payload);
      if (submissionRef.current?.fingerprint !== fingerprint) submissionRef.current = { fingerprint, key: crypto.randomUUID(),payload };
      const res = await apiClient.createBroadcast(workspaceId, { ...payload, requestKey: submissionRef.current.key }, { token });
      if(!current())return;
      if (!res.success) throw new Error("Nenhuma mensagem foi preparada; confira as falhas da campanha antes de tentar novamente.");

      setConfirmationUncertain(false);
      setSuccessInfo({
        batchId: res.batchId,
        enqueuedCount: res.enqueuedCount,
        totalTargeted: res.totalTargeted,
        templateName: res.template.name,
        isAbTest:Boolean(payload.isAbTest),
      });

      void Promise.resolve().then(()=>{if(requestedScope===scope.current&&generation===dialogGeneration.current)return onBroadcastSuccess?.();}).catch(error=>{if(requestedScope===scope.current&&generation===dialogGeneration.current)setErrorMessage(userFacingError(error,"A campanha foi confirmada, mas não foi possível atualizar a lista. Consulte as campanhas; não inicie outro disparo para corrigir esta atualização."));});
    } catch (err: unknown) {
      if(!current())return;
      if(!(err instanceof ApiError&&err.status>=400&&err.status<500&&err.status!==408))setConfirmationUncertain(true);
      setErrorMessage(
        userFacingError(err,"Falha ao preparar disparo em massa. Os dados foram preservados.")
      );
    } finally {
      if(operation.current===id){operation.current=null;if(requestedScope===scope.current&&generation===dialogGeneration.current)setIsSubmitting(false);}
    }
  };

  return (
    <>
      <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      title={isAbTest ? "Disparo com Teste A/B (Divisão 50/50)" : "Disparo em Massa de Modelo WABA"}
      maxWidth="840px"
      description="Revise canal, público e mensagem antes de iniciar. Os resultados disponíveis dependem do canal e das confirmações recebidas do provedor."
    >
      {discard.isPending&&<div style={{display:"grid",gap:8}}><UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={isSubmitting||testBusy}/>{review&&<p>Sair descarta apenas esta revisão local. Não cancela testes já enviados nem um disparo confirmado pelo servidor; confira a campanha antes de criar outro.</p>}</div>}
      <fieldset disabled={discard.isPending||isSubmitting||testBusy} style={{border:0,padding:0,margin:0,minWidth:0}}>
      {isLoadingPreflight ? (
        <div style={{ padding: "32px 0" }}>
          <LoadingState variant="spinner" text="Verificando canais, trava de faturamento e base..." />
        </div>
      ) : preflightError ? <Alert variant="danger" title="Não foi possível carregar o disparo">{preflightError}<Button size="sm" onClick={()=>setPreflightReload(value=>value+1)}>Tentar novamente</Button></Alert> : review && !successInfo ? (
        <div style={{display:"grid",gap:16}}>
          <h3 style={{margin:0}}>Revise antes de iniciar</h3>
          {errorMessage&&<Alert variant="danger" title="Não foi possível confirmar o resultado">{errorMessage}</Alert>}
          {confirmationUncertain&&<Alert variant="warning" title="Resultado incerto">A campanha pode já ter sido iniciada. Público, mensagem e aprovação ficam preservados; confira novamente a mesma solicitação ou consulte Campanhas. Não prepare outro disparo para resolver esta dúvida.</Alert>}
          <dl style={{display:"grid",gap:8,margin:0}}>
            <div><dt>Canal</dt><dd style={{margin:0,fontWeight:600}}>{review.channel}</dd></div>
            <div><dt>Público</dt><dd style={{margin:0}}>{review.audience}</dd></div>
            <div><dt>Modelo A</dt><dd style={{margin:0}}>{review.modelA}</dd></div>
            {review.payload.isAbTest&&<div><dt>Modelo B</dt><dd style={{margin:0}}>{review.modelB}</dd></div>}
          </dl>
          <p style={{margin:0,fontSize:13}}>Esta lista foi preparada no servidor. Novos contatos não serão adicionados; quem deixar de ser elegível será excluído. Revisão válida até {new Date(review.prepared.expiresAt).toLocaleTimeString("pt-BR")}.</p>
          <p style={{margin:0,fontSize:12}}>Este lote considera até {review.prepared.limit} registros. Custos e condições dependem do provedor do canal.</p>
          <details><summary>Incluídos ({review.prepared.included.length})</summary><div style={{maxHeight:240,overflowY:"auto",overflowWrap:"anywhere"}}><ul>{review.prepared.included.map(target=><li key={target.phoneE164}>{target.name||"Sem nome"} · {target.phoneE164}</li>)}</ul></div></details>
          <details><summary>Excluídos ({review.prepared.excluded.length})</summary><div style={{maxHeight:240,overflowY:"auto",overflowWrap:"anywhere"}}><ul>{review.prepared.excluded.map(target=><li key={target.phoneE164}>{target.name||"Sem nome"} · {target.phoneE164} · {target.reason}</li>)}</ul></div></details>
          {!review.prepared.included.length&&<Alert variant="warning" title="Nenhum destinatário elegível">Revise os excluídos ou volte e ajuste o público.</Alert>}
          <div style={{padding:14,border:"1px solid var(--border-default)",borderRadius:8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}><strong>Mensagem A</strong><div>{renderWhatsappMarkdown(review.bodyA)}</div></div>
          {review.payload.isAbTest&&<div style={{padding:14,border:"1px solid var(--border-default)",borderRadius:8,whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}><strong>Mensagem B</strong><div>{renderWhatsappMarkdown(review.bodyB)}</div></div>}
          <p style={{margin:0,fontSize:12}}>A prévia utiliza dados de exemplo. Variáveis automáticas serão preenchidas para cada destinatário.</p>
          <section aria-label="Teste da mensagem" style={{display:"grid",gap:12,padding:14,border:"1px solid var(--border-default)",borderRadius:8}}>
            <h4 style={{margin:0}}>Teste antes de liberar</h4>
            <p style={{margin:0,fontSize:13}}>Use um número já cadastrado em Contatos & Leads que você possa conferir. O teste envia uma mensagem real pelo canal escolhido e pode gerar custo no provedor. O teste usa o nome do contato cadastrado. Não inicia a campanha.</p>
            <label style={{display:"grid",gap:6}}>Número para teste (com + e código do país)<input type="tel" value={testPhone} disabled={confirmationUncertain||testBusy||testResults.length>0} onChange={event=>setTestPhone(event.target.value)} placeholder="+5511999999999" style={{minWidth:0,width:"100%",boxSizing:"border-box",minHeight:40,padding:8}}/></label>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {(["A",...(review.payload.isAbTest?["B"]:[])] as Array<"A"|"B">).map(variant=><Button key={variant} size="sm" style={mobileActionStyle} disabled={confirmationUncertain||testBusy||isSubmitting||testResults.some(test=>test.variant===variant)} onClick={()=>void updateMessageTests(variant)}>Enviar teste {variant}</Button>)}
              <Button size="sm" style={mobileActionStyle} variant="secondary" disabled={confirmationUncertain||testBusy||isSubmitting} onClick={()=>void updateMessageTests()}>Atualizar resultado do teste</Button>
            </div>
            {testBusy&&<p role="status" style={{margin:0}}>Consultando teste...</p>}
            {testError&&<p role="alert" style={{margin:0}}>{testError}</p>}
            {testResults.map(test=><div key={test.id} style={{display:"grid",gap:6,overflowWrap:"anywhere"}}>
              <strong>Teste {test.variant} · {test.phoneE164}</strong>
              <span>{test.status==="sent"?"Envio confirmado pelo provedor — confira a mensagem no destino.":["dead_letter","failed"].includes(test.status)?"Teste falhou. Volte e prepare nova revisão após corrigir a causa.":["reconciliation_required","reconciling"].includes(test.status)?"Resultado incerto. Aguarde conferência; não repita o envio.":"Aguardando envio. Atualize o resultado para conferir."}</span>
              <details><summary>Mensagem usada no teste {test.variant}</summary><p style={{whiteSpace:"pre-wrap"}}>{test.body}</p></details>
              {test.status==="sent"&&<label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input type="checkbox" disabled={confirmationUncertain||isSubmitting||testBusy} checked={approvedTestIds.includes(test.id)} onChange={event=>{setReviewAccepted(false);setApprovedTestIds(ids=>event.target.checked?[...ids,test.id]:ids.filter(id=>id!==test.id));}}/>Recebi e conferi a mensagem do teste {test.variant}.</label>}
            </div>)}
            {!testsApproved&&<p style={{margin:0,fontSize:12}}>A liberação exige envio confirmado e conferência de cada variante.</p>}
          </section>
          <label style={{display:"flex",gap:8,alignItems:"flex-start",fontSize:13}}><input type="checkbox" checked={reviewAccepted} disabled={confirmationUncertain||isSubmitting||!testsApproved||testBusy} onChange={event=>setReviewAccepted(event.target.checked)}/>Revisei canal, público e mensagem e autorizo iniciar este disparo agora.</label>
          <div style={{display:"flex",gap:8,justifyContent:"space-between",flexWrap:"wrap",flexDirection:isMobile?"column":"row"}}>
            <Button type="button" size="sm" style={mobileActionStyle} disabled={confirmationUncertain||isSubmitting||testBusy} onClick={()=>{if(operation.current||confirmationUncertain||discard.isPending)return;setReview(null);setReviewAccepted(false);setErrorMessage(null);}}>Voltar e editar</Button>
            <Button type="button" size="sm" style={mobileActionStyle} variant="primary" disabled={!reviewAccepted||!testsApproved||testBusy||isSubmitting||!review.prepared.included.length} loading={isSubmitting} onClick={()=>void confirmBroadcast()}>{confirmationUncertain?"Conferir novamente o mesmo disparo":"Confirmar e iniciar disparo"}</Button>
          </div>
        </div>
      ) : successInfo ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "12px 0" }}>
          {errorMessage&&<Alert variant="warning" title="Campanha confirmada; atualização local pendente">{errorMessage}</Alert>}
          {successInfo.enqueuedCount<successInfo.totalTargeted&&<Alert variant="warning" title="Preparação parcial">Foram preparadas {successInfo.enqueuedCount} de {successInfo.totalTargeted} mensagens. Consulte a campanha para revisar o que não foi preparado.</Alert>}
          <div
            style={{
              padding: "20px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              border: "1px solid #10b981",
              borderRadius: "var(--radius-lg)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              textAlign: "center",
            }}
          >
            <CheckCircle2 size={48} color="#10b981" />
            <div>
              <h3 style={{ margin: "0 0 4px 0", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                Solicitação da campanha confirmada
              </h3>
              <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--text-secondary)" }}>
                {successInfo.enqueuedCount} mensagens foram preparadas para envio pelo canal{" "}
                <strong>{selectedChannel?.displayName}</strong>.
                {successInfo.isAbTest && (
                  <span style={{ display: "block", marginTop: "4px", color: "var(--color-operational)", fontWeight: 600 }}>
                    Teste A/B: os destinatários foram distribuídos entre as variantes A e B.
                  </span>
                )}
              </p>
            </div>
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                fontFamily: "var(--font-mono)",
                backgroundColor: "var(--bg-surface)",
                padding: "6px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
              }}
            >
              Batch ID: {successInfo.batchId}
            </div>
          </div>

          <div
            style={{
              fontSize: "var(--font-size-xs)",
              color: "var(--text-secondary)",
              backgroundColor: "var(--bg-canvas)",
              padding: "12px",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-default)",
            }}
          >
            A preparação da campanha não confirma entrega. Consulte o relatório para acompanhar o resultado e confira custos e condições no provedor do canal.
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
            <Button variant="primary" size="sm" onClick={requestClose}>
              Ver Métricas da Campanha
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {errorMessage && (
            <Alert variant="danger" title="Atenção">
              {errorMessage}
            </Alert>
          )}

          {/* 1. Nome da Campanha & Modo A/B */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "12px", alignItems: "end" }}>
            <Input
              ref={nameRef}
              label="Nome da Campanha (Opcional)"
              placeholder="Ex: Oferta Relâmpago - Leads Qualificados"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0 }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                Tipo de Disparo
              </label>
              {isMobile?<select aria-label="Tipo de disparo" value={isAbTest?"AB_TEST":"SINGLE"} onChange={event=>setIsAbTest(event.target.value==="AB_TEST")} style={{width:"100%",minHeight:44}}><option value="SINGLE">Disparo único</option><option value="AB_TEST">Teste A/B</option></select>:(
              <SegmentedControl aria-label="Tipo de disparo"
                value={isAbTest ? "AB_TEST" : "SINGLE"}
                onChange={(val) => setIsAbTest(val === "AB_TEST")}
                options={[
                  { value: "SINGLE", label: "Disparo Único" },
                  { value: "AB_TEST", label: "Teste A/B (50/50)" },
                ]}
              />
              )}
            </div>
          </div>

          {/* 2. Seleção de Canal & Trava de Faturamento Meta */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Canal de Envio (Linha WhatsApp)
            </label>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: "10px" }}>
              {channels.map((ch) => {
                const isSelected = ch.id === selectedChannelId;
                const isBlocked = ch.provider === "meta_waba" && !ch.metaBillingConfigured;

                return (
                  <button
                    type="button"
                    disabled={discard.isPending || isSubmitting || testBusy}
                    aria-label={`Canal ${ch.displayName}`}
                    aria-pressed={isSelected}
                    key={ch.id}
                    onClick={() => { if (!operation.current && !testInFlight.current && !discard.isPending) setSelectedChannelId(ch.id); }}
                    style={{
                      textAlign: "left",
                      font: "inherit",
                      border: isSelected
                        ? (isBlocked ? "2px solid #ef4444" : "2px solid var(--color-action)")
                        : (isBlocked ? "1px dashed rgba(239, 68, 68, 0.4)" : "1px solid var(--border-default)"),
                      borderRadius: "var(--radius-lg)",
                      padding: "12px",
                      cursor: "pointer",
                      backgroundColor: isSelected ? "var(--bg-surface)" : "var(--bg-canvas)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      transition: "all 0.15s ease",
                      opacity: isBlocked ? 0.9 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)" }}>
                        {ch.displayName}
                      </span>
                      <Badge variant={ch.status === "connected" ? "action" : "danger"}>
                        {ch.status === "connected" ? "Conectado" : "Desconectado"}
                      </Badge>
                    </div>

                    <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      {ch.provider.toUpperCase()} {ch.phoneNumberE164 ? `· ${ch.phoneNumberE164}` : ""}
                    </div>

                    {ch.provider === "meta_waba" && (
                      <div style={{ marginTop: "4px" }}>
                        {ch.metaBillingConfigured ? (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(16, 185, 129, 0.15)",
                              color: "#10b981",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <ShieldCheck size={12} /> Faturamento declarado pelo responsável
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "rgba(239, 68, 68, 0.15)",
                              color: "#ef4444",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <ShieldAlert size={12} /> Faturamento Meta não declarado
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* TRAVA OBRIGATÓRIA DE CARTÃO META */}
            {selectedChannel && isBillingBlocked && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "14px 16px",
                  backgroundColor: "rgba(239, 68, 68, 0.08)",
                  border: "1px solid #ef4444",
                  borderRadius: "var(--radius-lg)",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <ShieldAlert size={24} color="#ef4444" style={{ flexShrink: 0, marginTop: "2px" }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--font-size-sm)", color: "#b91c1c" }}>
                    Disparo Ativo Bloqueado — Faturamento Meta não declarado
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    O <strong>SOS Vendas não cobra nem intermedeia tarifas</strong> de mensagens da Meta.
                    Confira diretamente no <strong>Gerenciador de Negócios da Meta</strong> as condições de faturamento vinculadas a este número.
                  </span>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    Confira o faturamento diretamente na Meta e vá em <strong>Configurações &gt; Canais WhatsApp</strong> para registrar sua declaração. O SOS Vendas não verifica nem cadastra cartão.
                  </span>
                </div>
              </div>
            )}

            {selectedChannel && isMetaWaba && isMetaBillingConfigured && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "10px 14px",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid #10b981",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <ShieldCheck size={18} color="#10b981" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  <strong>Faturamento Direto Meta Ativo:</strong> Tarifas cobradas diretamente no seu cartão cadastrado no Business Manager. O SOS Vendas não cobra intermediários.
                </span>
              </div>
            )}

            {selectedChannel && !isMetaWaba && (
              <div
                style={{
                  marginTop: "6px",
                  padding: "10px 14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <AlertTriangle size={16} color="var(--color-warning)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  Canal via QR Code (WAHA). Confira os custos do serviço contratado e as condições de uso do WhatsApp antes de enviar.
                </span>
              </div>
            )}
          </div>

          {/* 3. Seleção de Público-Alvo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Público-Alvo do Disparo
            </label>
            {isMobile ? <select aria-label="Público-alvo do disparo" value={audienceType} onChange={event=>setAudienceType(event.target.value as typeof audienceType)} style={{width:"100%",minHeight:42,padding:"8px 12px",border:"1px solid var(--border-default)",borderRadius:8,background:"var(--bg-surface)",color:"var(--text-primary)",font:"inherit"}}>
              <option value="ALL_CONTACTS">Sem bloqueio ({totalActiveContacts})</option>
              <option value="SMART_FILTER">Filtro inteligente</option>
              <option value="IMPORT_LIST">Planilha (CSV / Excel)</option>
              <option value="BY_STAGE">Por etapa do funil</option>
              <option value="MANUAL">Lista manual</option>
            </select> : <SegmentedControl aria-label="Público-alvo do disparo"
              value={audienceType}
              onChange={(v) => setAudienceType(v as typeof audienceType)}
              options={[
                { value: "ALL_CONTACTS", label: `Sem bloqueio (${totalActiveContacts})` },
                { value: "SMART_FILTER", label: "Filtro Inteligente" },
                { value: "IMPORT_LIST", label: "Planilha (CSV / Excel)" },
                { value: "BY_STAGE", label: "Por Estágio" },
                { value: "MANUAL", label: "Manual" },
              ]}
            />}

            {audienceType==="ALL_CONTACTS"&&<p style={{fontSize:12,color:"var(--text-secondary)",margin:0}}>Contatos com telefone cadastrado e sem bloqueio comercial. Isso não indica atividade recente nem confirma que todos podem receber: confira as exclusões na prévia e as condições do canal antes de liberar.</p>}

            {/* A. Filtro Inteligente Soberano */}
          {countError&&<Alert variant="danger" title="Público indisponível">{countError}<Button type="button" size="sm" onClick={()=>setCountReload(value=>value+1)}>Consultar público novamente</Button></Alert>}
            {audienceType === "SMART_FILTER" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <Filter size={13} color="var(--color-operational)" /> Critério do público:
                  </span>
                  <Badge variant={smartCount && smartCount > 0 ? "action" : "neutral"}>
                    {isLoadingSmartCount ? "Calculando..." : smartCount===null ? "Consulta indisponível" : smartCount===1 ? "1 contato elegível" : `${smartCount} contatos elegíveis`}
                  </Badge>
                </div>

                <select
                  aria-label="Critério do filtro de público"
                  value={smartFilter}
                  onChange={(e) => setSmartFilter(e.target.value as typeof smartFilter)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="NON_BUYERS">🎯 Não Compradores (Sem venda/WON ou Pix pago)</option>
                  <option value="PIX_ABANDONED">⚡ Recuperação Pix (Cobrança expirada ou não paga)</option>
                  <option value="INACTIVE_30_DAYS">⏳ Inativos (Sem interação há mais de 30 dias)</option>
                  <option value="CTWA_RESCUE">📣 Resgate CTWA (Leads de anúncios Meta em Lead/Qualificado)</option>
                </select>

                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  {smartFilter === "NON_BUYERS" &&
                    "Filtra contatos que conversaram com a equipe ou IA mas não possuem fechamento comercial (WON) ou Pix pago registrado. Ideal para campanhas de oferta relâmpago e reativação."}
                  {smartFilter === "PIX_ABANDONED" &&
                    "Isola clientes com cobrança Pix gerada que expirou ou não foi concluída, sem histórico de pagamento aprovado. Ideal para recuperação imediata de faturamento perdido com cupons ou novas ofertas."}
                  {smartFilter === "INACTIVE_30_DAYS" &&
                    "Isola contatos sem qualquer mensagem trocada nos últimos 30 dias para campanhas de resgate de base fria."}
                  {smartFilter === "CTWA_RESCUE" &&
                    "Filtra leads que vieram de anúncios Click-to-WhatsApp Ads do Facebook/Instagram e ainda estão no início do funil de vendas."}
                </span>
              </div>
            )}

            {/* B. Importador de Planilhas (CSV / Excel) */}
            {audienceType === "IMPORT_LIST" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  padding: "14px",
                  backgroundColor: "var(--bg-canvas)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-lg)",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls, text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />

                {!importedFile ? (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label="Selecionar planilha de contatos"
                    onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();fileInputRef.current?.click();}}}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="sos-dropzone"
                    style={{
                      border: "2px dashed var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      padding: "24px 16px",
                      textAlign: "center",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      backgroundColor: "var(--bg-surface)",
                      transition: "border-color 0.2s ease",
                    }}
                  >
                    <UploadCloud size={32} color="var(--color-operational)" />
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, color: "var(--text-primary)" }}>
                      {isParsingFile ? "Processando e validando planilha..." : "Clique ou arraste uma planilha (.csv, .xlsx, .xls) aqui"}
                    </span>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                      Até 10 MB. Confira as colunas de <strong>Nome</strong> e <strong>Telefone</strong> antes de revisar o público.
                    </span>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap:"wrap",
                        gap:10,
                        alignItems: "center",
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px 14px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px",minWidth:0 }}>
                        <FileSpreadsheet size={22} color="var(--color-operational)" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", color: "var(--text-primary)",overflowWrap:"anywhere" }}>
                            {importedFile.name}
                          </div>
                          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                            {(importedFile.size / 1024).toFixed(1)} KB · {isParsingFile?"Lendo arquivo...":`${importRows.length} linhas lidas`}
                          </div>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={()=>fileInputRef.current?.click()}
                        prefixIcon={<UploadCloud size={14} />}
                      >
                        Trocar Planilha
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={removeImportedFile} prefixIcon={<Trash2 size={14}/>}>Remover</Button>
                    </div>

                    {isParsingFile&&<p role="status">Processando a planilha...</p>}
                    {importRows.length>0&&<div style={{display:"grid",gap:12}}>
                      <p style={{margin:0,fontSize:13}}>Confira o mapeamento. Quando houver mais de uma coluna de telefone, escolha a que deve receber a campanha.</p>
                      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12}}>
                        <label style={{display:"grid",gap:6,fontSize:13}}>Coluna de telefone
                          <select ref={phoneColumnRef} value={phoneColumn} onChange={event=>{setPhoneColumn(event.target.value);if(nameColumn===event.target.value)setNameColumn("");}} style={{minWidth:0,width:"100%",minHeight:40,font:"inherit",background:"var(--bg-surface)",color:"var(--text-primary)",border:"1px solid var(--border-default)",borderRadius:6,padding:8}}>
                            <option value="">Selecione a coluna</option>{importColumns.map(column=><option key={column} value={column}>{column}</option>)}
                          </select>
                        </label>
                        <label style={{display:"grid",gap:6,fontSize:13}}>Coluna de nome (opcional)
                          <select value={nameColumn} onChange={event=>setNameColumn(event.target.value)} style={{minWidth:0,width:"100%",minHeight:40,font:"inherit",background:"var(--bg-surface)",color:"var(--text-primary)",border:"1px solid var(--border-default)",borderRadius:6,padding:8}}>
                            <option value="">Não importar nome</option>{importColumns.map(column=><option key={column} value={column} disabled={column===phoneColumn}>{column}</option>)}
                          </select>
                        </label>
                      </div>
                      <label style={{display:"grid",gap:6,fontSize:13}}>Formato dos telefones
                        <select value={phoneFormat} onChange={event=>setPhoneFormat(event.target.value as ImportPhoneFormat)} style={{minWidth:0,width:"100%",minHeight:40,font:"inherit",background:"var(--bg-surface)",color:"var(--text-primary)",border:"1px solid var(--border-default)",borderRadius:6,padding:8}}>
                          <option value="BR">Brasil — celular com DDD</option><option value="E164">Com + e código do país — formato E.164</option>
                        </select>
                      </label>
                      <details><summary>Ver amostra das colunas lidas</summary><div style={{maxHeight:180,overflow:"auto"}}><table style={{borderCollapse:"collapse",fontSize:12,textAlign:"left"}}><caption style={{textAlign:"left",padding:6}}>Primeiras {Math.min(3,importRows.length)} linhas de dados</caption><thead><tr>{importColumns.map(column=><th key={column} scope="col" style={{padding:8,minWidth:130,borderBottom:"1px solid var(--border-default)"}}>{column}</th>)}</tr></thead><tbody>{importRows.slice(0,3).map((row,index)=><tr key={index}>{importColumns.map(column=><td key={column} style={{padding:8,borderBottom:"1px solid var(--border-subtle)",overflowWrap:"anywhere"}}>{String(row[column]??"").slice(0,80)}{String(row[column]??"").length>80?"…":""}</td>)}</tr>)}</tbody></table></div></details>
                    </div>}
                    {(importError||mappedImport.error) && (
                      <Alert variant="danger" title="Aviso de Importação">
                        {importError||mappedImport.error}
                      </Alert>
                    )}

                    {importStats && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                          <span
                            style={{
                              fontSize: "var(--font-size-xs)",
                              padding: "4px 8px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "var(--color-action-subtle)",
                              color: "var(--color-action)",
                              fontWeight: 600,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                            }}
                          >
                            <CheckCircle2 size={12} /> {importStats.validCount} {importStats.validCount===1?"telefone com formato válido":"telefones com formato válido"}
                          </span>
                          {importStats.duplicateCount > 0 && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                padding: "4px 8px",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "var(--color-warning-subtle)",
                                color: "var(--color-warning)",
                                fontWeight: 600,
                              }}
                            >
                              {importStats.duplicateCount} {importStats.duplicateCount===1?"repetido ignorado":"repetidos ignorados"}
                            </span>
                          )}
                          {importStats.invalidCount > 0 && (
                            <span
                              style={{
                                fontSize: "var(--font-size-xs)",
                                padding: "4px 8px",
                                borderRadius: "var(--radius-sm)",
                                backgroundColor: "var(--color-danger-subtle)",
                                color: "var(--color-danger)",
                                fontWeight: 600,
                              }}
                            >
                              {importStats.invalidCount} Linhas inválidas
                            </span>
                          )}
                        </div>
                        <p style={{margin:0,fontSize:12}}>Formato conferido na planilha. Bloqueios comerciais e elegibilidade serão verificados na revisão do público.</p>
                        {mappedImport.issues.length>0&&<details><summary>Ver linhas descartadas ou repetidas ({mappedImport.issues.length})</summary><div style={{maxHeight:180,overflowY:"auto"}}><ul>{mappedImport.issues.map(issue=><li key={issue.row}>Linha {issue.row}: {issue.reason}</li>)}</ul></div></details>}

                        {importedContacts.length > 0 && (
                          <div
                            style={{
                              maxHeight: "140px",
                              overflowY: "auto",
                              borderRadius: "var(--radius-md)",
                              border: "1px solid var(--border-subtle)",
                              backgroundColor: "var(--bg-surface)",
                              fontSize: "var(--font-size-xs)",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 1fr)",
                                padding: "6px 10px",
                                fontWeight: 600,
                                backgroundColor: "var(--bg-canvas)",
                                borderBottom: "1px solid var(--border-subtle)",
                                color: "var(--text-secondary)",
                              }}
                            >
                              <span>Nome</span>
                              <span>Telefone formatado</span>
                              <span style={{ textAlign: "right" }}>Status</span>
                            </div>
                            {importedContacts.slice(0, 10).map((c, idx) => (
                              <div
                                key={idx}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1.5fr) minmax(0, 1fr)",
                                  padding: "5px 10px",
                                  borderBottom: "1px solid var(--border-subtle)",
                                  alignItems: "center",
                                }}
                              >
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.name || "—"}
                                </span>
                                <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
                                  {c.phoneE164}
                                </span>
                                <span style={{ textAlign: "right", color: "var(--color-action)", fontWeight: 600 }}>
                                  Formato válido
                                </span>
                              </div>
                            ))}
                            {importedContacts.length > 10 && (
                              <div
                                style={{
                                  padding: "6px 10px",
                                  textAlign: "center",
                                  color: "var(--text-muted)",
                                  fontSize: "0.75rem",
                                }}
                              >
                                + {importedContacts.length - 10} outros contatos com formato válido
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* C. Por Estágio do Funil */}
            {audienceType === "BY_STAGE" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                    Selecione a etapa dos contatos no funil comercial:
                  </span>
                  <Badge variant={smartCount && smartCount > 0 ? "action" : "neutral"}>
                    {isLoadingSmartCount ? "Calculando..." : smartCount===null ? "Consulta indisponível" : `${smartCount} contatos nesta etapa`}
                  </Badge>
                </div>
                <select
                  value={stage}
                  aria-label="Etapa do público no funil"
                  onChange={(e) => setStage(e.target.value)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-surface)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="LEAD">Leads em Prospecção (LEAD)</option>
                  <option value="QUALIFIED">Qualificados (QUALIFIED)</option>
                  <option value="PROPOSAL">Com Proposta Enviada (PROPOSAL)</option>
                  <option value="NEGOTIATION">Em Negociação (NEGOTIATION)</option>
                  <option value="WON">Clientes Fechados (WON)</option>
                  <option value="LOST">Oportunidades Perdidas (LOST)</option>
                </select>
              </div>
            )}

            {/* D. Manual */}
            {audienceType === "MANUAL" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                  Cole os números de telefone em formato internacional (separados por vírgula ou linha):
                </span>
                <textarea
                  aria-label="Telefones dos destinatários"
                  rows={3}
                  value={manualPhones}
                  onChange={(e) => setManualPhones(e.target.value)}
                  placeholder="+554999999999, +5511988887777"
                  style={{
                    padding: "8px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--font-size-xs)",
                    resize: "vertical",
                  }}
                />
              </div>
            )}
          </div>

          {/* 4. Modelos e Variáveis: Modo Simples vs Modo Teste A/B */}
          {!isAbTest ? (
            /* Modo Disparo Simples */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                    Modelo de Mensagem (WhatsApp)
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCreateAiModalOpen(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      background: "rgba(99, 102, 241, 0.1)",
                      border: "1px solid rgba(99, 102, 241, 0.25)",
                      color: "var(--color-ai, #6366f1)",
                      fontSize: "var(--font-size-xs)",
                      fontWeight: 600,
                      cursor: "pointer",
                      padding: "3px 10px",
                      borderRadius: "var(--radius-md)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <Sparkles size={13} />
                    <span>Criar Modelo com IA</span>
                  </button>
                </div>
                <select
                  value={selectedTemplateId}
                  aria-label="Modelo de mensagem do disparo"
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={availableTemplates.length === 0}
                  style={{
                    padding: "9px 12px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-canvas)",
                    fontSize: "var(--font-size-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  {availableTemplates.length === 0 ? (
                    <option value="">Nenhum modelo cadastrado</option>
                  ) : (
                    availableTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {formatTemplateDisplayTitle(tpl)}
                      </option>
                    ))
                  )}
                </select>
                {selectedTemplate && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                    <Badge variant={selectedTemplate.category === "UTILITY" ? "operational" : "neutral"}>
                      {selectedTemplate.category === "UTILITY"
                        ? "Utilidade — aprovação e tarifas dependem do provedor"
                        : "⭐ Marketing (~R$ 0,40 • Custo Padrão)"}
                    </Badge>
                  </div>
                )}
              </div>

              {templateVarKeys.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    padding: "14px",
                    backgroundColor: "var(--bg-canvas)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: "var(--text-primary)" }}>
                      Personalização da Mensagem ({templateVarKeys.length} {templateVarKeys.length === 1 ? "campo" : "campos"}):
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Campos dinâmicos do modelo
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {templateVarKeys.map((k) => {
                      const meta = variableMetadata(k);
                      if (meta.isName) {
                        return (
                          <div
                            key={k}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 14px",
                              backgroundColor: "rgba(16, 185, 129, 0.08)",
                              border: "1px solid rgba(16, 185, 129, 0.25)",
                              borderRadius: "var(--radius-md)",
                              gap: "10px",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "50%",
                                  backgroundColor: "rgba(16, 185, 129, 0.2)",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#10b981",
                                  flexShrink: 0,
                                }}
                              >
                                <CheckCircle2 size={18} />
                              </div>
                              <div style={{ display: "flex", flexDirection: "column" }}>
                                <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 700, color: "var(--text-primary)" }}>
                                  👤 {meta.label} (Automático)
                                </span>
                                <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                                  Substituído automaticamente pelo primeiro nome de cada contato cadastrado.
                                </span>
                              </div>
                            </div>
                            <Badge variant="operational">Auto 100%</Badge>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={k}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "6px",
                            padding: "10px 12px",
                            backgroundColor: "var(--bg-surface)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <Input
                            label={meta.label}
                            placeholder={meta.placeholder}
                            maxLength={k==="header:media"?2048:k==="header:filename"?128:k.endsWith(":payload")?256:k.startsWith("header:")?60:200}
                            value={variables[k] || ""}
                            onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                          />
                          {meta.suggestions.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center", marginTop: "2px" }}>
                              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Sugestões rápidas:</span>
                              {meta.suggestions.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={() => setVariables({ ...variables, [k]: sug })}
                                  style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "12px",
                                    border: "1px solid var(--border-default)",
                                    backgroundColor: "var(--bg-canvas)",
                                    color: "var(--text-secondary)",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                >
                                  {sug}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedTemplate && (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
                      Prévia da mensagem
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      Simulação; o nome será preenchido para cada contato.
                    </span>
                  </div>
                  <div
                    style={{
                      backgroundColor: "var(--bg-canvas)",
                      padding: "16px",
                      borderRadius: "var(--radius-lg)",
                      border: "1px solid var(--border-default)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      background: "repeating-linear-gradient(45deg, var(--bg-canvas), var(--bg-canvas) 10px, rgba(0,0,0,0.015) 10px, rgba(0,0,0,0.015) 20px)",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "92%",
                        backgroundColor: "var(--bg-surface)",
                        padding: "12px 16px",
                        borderRadius: "8px 8px 8px 0px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                        position: "relative",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      {selectedTemplate.headerText && (
                        <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "var(--text-primary)" }}>
                          {layoutPreviewA?.renderedHeader}
                        </div>
                      )}
                      <div
                        style={{
                          fontSize: "var(--font-size-sm)",
                          color: "var(--text-primary)",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {layoutPreviewA?.mediaUrl&&<p style={{fontSize:12,overflowWrap:"anywhere"}}>Mídia do cabeçalho: {layoutPreviewA.mediaUrl}</p>}
                        {renderWhatsappMarkdown(previewBody)}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          alignItems: "center",
                          gap: "4px",
                          marginTop: "2px",
                        }}
                      >
                        {selectedTemplate.footerText && (
                          <span style={{ fontSize: "10px", color: "var(--text-muted)", marginRight: "auto" }}>
                            {selectedTemplate.footerText}
                          </span>
                        )}
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Prévia — não enviado</span>

                      </div>
                    </div>

                    {layoutPreviewA && layoutPreviewA.renderedButtons.length > 0 && (
                      <div
                        style={{
                          marginTop: "4px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          width: "92%",
                        }}
                      >
                        {layoutPreviewA.renderedButtons.map((btn, idx) => (
                          <div
                            key={idx}
                            style={{
                              backgroundColor: "var(--bg-surface)",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              border: "1px solid var(--border-subtle)",
                              textAlign: "center",
                              fontSize: "var(--font-size-xs)",
                              fontWeight: 600,
                              color: "var(--color-brand-primary, #10b981)",
                              boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
                            }}
                          >
                            {btn.text}
                            {btn.url&&<div style={{fontWeight:400,overflowWrap:"anywhere"}}>{btn.url}</div>}
                            {btn.phone_number&&<div style={{fontWeight:400}}>{btn.phone_number}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Modo Teste A/B 50/50 */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  padding: "10px 14px",
                  backgroundColor: "var(--color-ai-subtle)",
                  border: "1px solid var(--color-ai-border)",
                  borderRadius: "var(--radius-md)",
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <Sparkles size={18} color="var(--color-ai)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
                  <strong>Divisão 50/50 Automatizada:</strong> O sistema dividirá seu público igualmente. Você poderá comparar lado a lado a taxa de abertura, respostas e cliques no painel da campanha.
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 1fr)", gap: "16px" }}>
                {/* Coluna Variante A */}
                <div
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--bg-canvas)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge variant="action">Variante A (50%)</Badge>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Contatos ímpares</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                    <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Modelo A</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        backgroundColor: "var(--bg-canvas)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {availableTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {formatTemplateDisplayTitle(tpl)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateVarKeys.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Variáveis A:</span>
                      {templateVarKeys.map((k) => {
                        const meta = variableMetadata(k);
                        if (meta.isName) {
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "6px 10px",
                                backgroundColor: "rgba(16, 185, 129, 0.08)",
                                border: "1px solid rgba(16, 185, 129, 0.2)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "11px",
                                color: "#10b981",
                                fontWeight: 600,
                              }}
                            >
                              👤 {meta.label} (Automático)
                            </div>
                          );
                        }
                        return (
                          <Input
                            key={k}
                            label={meta.label}
                            placeholder={meta.placeholder}
                            maxLength={k==="header:media"?2048:k==="header:filename"?128:k.endsWith(":payload")?256:k.startsWith("header:")?60:200}
                            value={variables[k] || ""}
                            onChange={(e) => setVariables({ ...variables, [k]: e.target.value })}
                          />
                        );
                      })}
                    </div>
                  )}

                  {selectedTemplate && (
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "180px",
                        overflowY: "auto",
                      }}
                    >
                      {layoutPreviewA?.mediaUrl&&<p style={{fontSize:12,overflowWrap:"anywhere"}}>Mídia do cabeçalho: {layoutPreviewA.mediaUrl}</p>}
                        {renderWhatsappMarkdown(previewBody)}
                    </div>
                  )}
                </div>

                {/* Coluna Variante B */}
                <div
                  style={{
                    padding: "14px",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-lg)",
                    backgroundColor: "var(--bg-canvas)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    minWidth: 0,
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Badge variant="warning">Variante B (50%)</Badge>
                    <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>Contatos pares</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                    <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Modelo B</label>
                    <select
                      value={selectedTemplateBId}
                      onChange={(e) => setSelectedTemplateBId(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-default)",
                        backgroundColor: "var(--bg-canvas)",
                        fontSize: "var(--font-size-sm)",
                        color: "var(--text-primary)",
                        width: "100%",
                        maxWidth: "100%",
                        boxSizing: "border-box",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {availableTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {formatTemplateDisplayTitle(tpl)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {templateVarKeysB.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>Variáveis B:</span>
                      {templateVarKeysB.map((k) => {
                        const meta = variableMetadata(k);
                        if (meta.isName) {
                          return (
                            <div
                              key={k}
                              style={{
                                padding: "6px 10px",
                                backgroundColor: "rgba(16, 185, 129, 0.08)",
                                border: "1px solid rgba(16, 185, 129, 0.2)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "11px",
                                color: "#10b981",
                                fontWeight: 600,
                              }}
                            >
                              👤 {meta.label} (Automático)
                            </div>
                          );
                        }
                        return (
                          <Input
                            key={k}
                            label={meta.label}
                            placeholder={meta.placeholder}
                            maxLength={k==="header:media"?2048:k==="header:filename"?128:k.endsWith(":payload")?256:k.startsWith("header:")?60:200}
                            value={variablesB[k] || ""}
                            onChange={(e) => setVariablesB({ ...variablesB, [k]: e.target.value })}
                          />
                        );
                      })}
                    </div>
                  )}

                  {selectedTemplateB && (
                    <div
                      style={{
                        backgroundColor: "var(--bg-surface)",
                        padding: "10px",
                        borderRadius: "var(--radius-md)",
                        border: "1px solid var(--border-subtle)",
                        fontSize: "var(--font-size-xs)",
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        maxHeight: "180px",
                        overflowY: "auto",
                      }}
                    >
                      {layoutPreviewB?.mediaUrl&&<p style={{fontSize:12,overflowWrap:"anywhere"}}>Mídia do cabeçalho: {layoutPreviewB.mediaUrl}</p>}
                      {renderWhatsappMarkdown(previewBodyB)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Ações do Rodapé */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: isMobile?"stretch":"center",
              flexDirection:isMobile?"column":"row",
              gap:8,
              marginTop: "8px",
              borderTop: "1px solid var(--border-subtle)",
              paddingTop: "14px",
            }}
          >
            <Button type="button" variant="secondary" size="sm" style={mobileActionStyle} onClick={requestClose} disabled={isSubmitting}>
              Cancelar
            </Button>

            <Button
              type="submit"
              style={mobileActionStyle}
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={!canSubmit}
              prefixIcon={isAbTest ? <Layers size={14} /> : <Send size={14} />}
              title={
                isBillingBlocked
                  ? "Disparo bloqueado: confira o faturamento na Meta e registre a declaração nas configurações de canais"
                  : !isChannelConnected
                    ? "Canal selecionado está desconectado"
                    : isAbTest
                      ? "Revisar Teste A/B 50/50"
                      : "Revisar disparo antes de iniciar"
              }
            >
              {isBillingBlocked
                ? "Disparo bloqueado (faturamento não declarado)"
                : isAbTest
                  ? "Revisar Teste A/B (50/50)"
                  : "Revisar disparo"}
            </Button>
          </div>
        </form>
      )}
      </fieldset>
    </Dialog>

      {/* Modal Integrado de Criação de Modelo com IA & Redução de Custo */}
      {isOpen && isCreateAiModalOpen && (
        <CreateTemplateDialog
          isOpen={isCreateAiModalOpen}
          onClose={() => setIsCreateAiModalOpen(false)}
          workspaceId={workspaceId}
          token={token}
          onCreated={handleTemplateCreated}
        />
      )}
    </>
  );
};
