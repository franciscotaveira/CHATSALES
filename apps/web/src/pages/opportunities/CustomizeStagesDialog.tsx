import {apiClient,ApiError} from "../../services/api-client";
import {useState,useEffect,useRef,type FC,type CSSProperties} from "react";
import {Dialog,Button,Input,useBreakpoint} from "@sos-sales/ui";
import {STAGES,getStageLabel,type CustomStagesMap} from "./stages";
import {UnsavedChangesNotice,useDiscardChanges} from "../UnsavedChangesNotice";
import {userFacingError} from "../../utils/user-facing-error";
interface Props{isOpen:boolean;onClose:()=>void;workspaceId:string;token?:string;onSaved:(labels:CustomStagesMap)=>void|Promise<void>;}
type Snapshot={labels:CustomStagesMap;version:number};
const readSnapshot=(value:unknown):Snapshot=>{
 const invalid=()=>new Error("A resposta não confirmou nomes e versão válidos das etapas. Consulte novamente antes de continuar.");
 if(!value||typeof value!=="object"||Array.isArray(value))throw invalid();
 const record=value as Record<string,unknown>;
 if(typeof record.version!=="number"||!Number.isSafeInteger(record.version)||record.version<0||!record.labels||typeof record.labels!=="object"||Array.isArray(record.labels))throw invalid();
 const labels:CustomStagesMap={};
 for(const [key,text] of Object.entries(record.labels)){
  const stage=STAGES.find(item=>item.id===key);
  if(!stage||typeof text!=="string"||text.length>60)throw invalid();
  labels[stage.id]=text;
 }
 return {labels,version:record.version};
};
const clean=(labels:CustomStagesMap):CustomStagesMap=>Object.fromEntries(STAGES.flatMap(stage=>{const text=labels[stage.id]?.trim();return text?[[stage.id,text]]:[];}));
export const CustomizeStagesDialog:FC<Props>=({isOpen,onClose,workspaceId,token,onSaved})=>{
 const {isMobile}=useBreakpoint();
 const actionStyle:CSSProperties|undefined=isMobile?{width:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.35}:undefined;
 const [labels,setLabels]=useState<CustomStagesMap>({});
 const [baseline,setBaseline]=useState<Snapshot|null>(null);
 const [remote,setRemote]=useState<Snapshot|null>(null);
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[needsReview,setNeedsReview]=useState(false);
 const errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 const generation=useRef(0),busy=useRef(false),read=useRef(0),scope=useRef("");
 const scopeKey=`${isOpen}:${workspaceId}:${token}`;scope.current=scopeKey;
 const load=async(compare=false)=>{
  if(!isOpen||!workspaceId||!token||busy.current)return;
  const requestedScope=scope.current,request=++read.current,currentGeneration=generation.current;
  const valid=()=>request===read.current&&requestedScope===scope.current&&currentGeneration===generation.current;
  setLoading(true);setError("");
  try{const result=await apiClient.getStageLabels(workspaceId,{token});if(!valid())return;const snapshot=readSnapshot(result);if(compare)setRemote(snapshot);else{setLabels(snapshot.labels);setBaseline(snapshot);setNeedsReview(false);setRemote(null);}}
  catch(e){if(valid())setError(userFacingError(e,"Não foi possível carregar as etapas. Tente novamente."));}
  finally{if(valid())setLoading(false);}
 };
 useEffect(()=>{
  generation.current++;read.current++;busy.current=false;setLoading(false);setSaving(false);setLabels({});setBaseline(null);setRemote(null);setError("");setNotice("");setNeedsReview(false);
  if(isOpen){if(token&&workspaceId)void load();else setError("Selecione uma empresa e confira sua sessão antes de personalizar as etapas.");}
  return()=>{generation.current++;read.current++;};
 },[scopeKey]);
 const dirty=baseline!==null&&JSON.stringify(clean(labels))!==JSON.stringify(clean(baseline.labels));
 const firstField=useRef<HTMLInputElement>(null);
 const discard=useDiscardChanges(dirty,scopeKey,()=>firstField.current,isOpen);
 const requestClose=()=>{if(!busy.current)discard.requestExit(onClose);};
 const locked=loading||saving||!baseline||discard.isPending;
 const save=async()=>{
  if(busy.current||locked||!dirty||needsReview||!token||!baseline)return;
  const request=generation.current,requestedScope=scope.current;const valid=()=>request===generation.current&&requestedScope===scope.current;
  busy.current=true;setSaving(true);setError("");setNotice("");let committed=false;
  try{
   const result=await apiClient.saveStageLabels(workspaceId,clean(labels),baseline.version,{token});
   if(!valid())return;const snapshot=readSnapshot(result);committed=true;setBaseline(snapshot);setLabels(snapshot.labels);setNotice("Nomes das etapas salvos.");
   await onSaved(snapshot.labels);
  }catch(e){if(valid()){if(e instanceof ApiError&&e.status===409)setNeedsReview(true);setError(committed?"Os nomes foram salvos, mas a tela anterior não foi atualizada. Feche e atualize as oportunidades; não é necessário salvar novamente.":userFacingError(e,"Não foi possível confirmar o salvamento. Seu rascunho foi preservado."));}}
  finally{if(valid()){busy.current=false;setSaving(false);}}
 };
 return <Dialog isOpen={isOpen} onClose={requestClose} title="Personalizar nomes das etapas" description="Mude os nomes exibidos no funil e no atendimento. As regras de cada etapa permanecem as mesmas." maxWidth="600px">
  <div style={{display:"flex",flexDirection:"column",gap:16}}>
   {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard}/>}
   {error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
   {loading&&<p role="status">Carregando etapas...</p>}
   {!baseline&&!loading&&<Button style={actionStyle} disabled={!token||!workspaceId} onClick={()=>void load()}>Tentar novamente</Button>}
   {STAGES.map(stage=><Input ref={stage.id==="lead"?firstField:undefined} key={stage.id} label={`Nome da etapa: ${stage.label}`} placeholder={stage.label} disabled={locked} maxLength={60} value={labels[stage.id]??""} onChange={e=>{setLabels(prev=>({...prev,[stage.id]:e.target.value}));setNotice("");}}/>)}
   {needsReview&&!remote&&<div><p>Seu rascunho foi mantido. Compare com os nomes salvos pela outra ação antes de continuar.</p><Button style={actionStyle} disabled={locked} onClick={()=>void load(true)}>Conferir versão atual</Button></div>}
   {remote&&<section aria-label="Comparação das etapas"><h3>Comparar nomes</h3><div style={{display:"grid",gap:12,marginTop:12}}>{STAGES.map(stage=><div key={stage.id} style={{borderBottom:"1px solid var(--border-default)",paddingBottom:8,overflowWrap:"anywhere"}}><strong>{stage.label}</strong><p>Atual: {getStageLabel(stage.id,remote.labels)}</p><p>Seu rascunho: {getStageLabel(stage.id,clean(labels))}</p></div>)}</div><div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:12,flexDirection:isMobile?"column":undefined}}><Button style={actionStyle} disabled={locked} variant="secondary" onClick={()=>{setLabels(remote.labels);setBaseline(remote);setRemote(null);setNeedsReview(false);setError("");setNotice("Versão atual carregada.");}}>Usar versão atual</Button><Button style={actionStyle} disabled={locked} onClick={()=>{setBaseline(remote);setRemote(null);setNeedsReview(false);setError("");setNotice("Rascunho mantido. Confira os campos e salve para aplicar.");}}>Manter meu rascunho para revisão</Button></div></section>}
   <p style={{fontSize:12,color:"var(--text-secondary)"}}>Campos vazios usam o nome padrão. Restaurar padrões altera o rascunho; só será aplicado ao salvar.</p>
   <div style={{display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",flexDirection:isMobile?"column":undefined}}><Button style={actionStyle} variant="ghost" disabled={locked} onClick={()=>{setLabels({});setNotice("");}}>Restaurar padrões</Button><div style={{display:"flex",gap:8,flexWrap:"wrap",flexDirection:isMobile?"column":undefined}}><Button style={actionStyle} variant="secondary" disabled={saving||discard.isPending} onClick={requestClose}>Fechar</Button><Button style={actionStyle} disabled={locked||!dirty||needsReview||!token} onClick={()=>void save()}>{saving?"Salvando...":"Salvar alterações"}</Button></div></div>
  </div>
 </Dialog>;
};
