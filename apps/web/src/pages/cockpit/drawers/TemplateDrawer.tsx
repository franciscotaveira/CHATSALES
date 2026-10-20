import {UnsavedChangesNotice,useDiscardChanges} from "../../UnsavedChangesNotice";
import {assembleTemplate} from "@sos-sales/contracts";
import {type FC,useState,useEffect,useRef} from "react";
import {Drawer,Button,Badge,Input,SegmentedControl} from "@sos-sales/ui";
import {apiClient,type MessageTemplateSummary,type CommercialThreadSummary} from "../../../services/api-client";
import {userFacingError} from "../../../utils/user-facing-error";
interface TemplateDrawerProps {isOpen:boolean;onClose:()=>void;thread:CommercialThreadSummary|null;workspaceId?:string;token?:string;onTemplateSent?:()=>void|Promise<void>;sendBlockedReason?:string;onRefreshChannel?:()=>void;isCheckingChannel?:boolean}
export const TemplateDrawer:FC<TemplateDrawerProps>=({isOpen,onClose,thread,workspaceId,token,onTemplateSent,sendBlockedReason,onRefreshChannel,isCheckingChannel})=>{
 const [templates,setTemplates]=useState<MessageTemplateSummary[]>([]),[selected,setSelected]=useState<MessageTemplateSummary|null>(null);
 const [variables,setVariables]=useState<Record<string,string>>({}),[category,setCategory]=useState("all");
 const [queued,setQueued]=useState(false);
 const [loading,setLoading]=useState(false),[sending,setSending]=useState(false),[error,setError]=useState(""),[loadError,setLoadError]=useState(""),[reload,setReload]=useState(0);
 const generation=useRef(0),inFlight=useRef(false),keys=useRef(new Map<string,string>());
 const scope=useRef("");scope.current=`${workspaceId}:${token}:${thread?.id}:${isOpen}`;
 useEffect(()=>{
  let cancelled=false;generation.current++;inFlight.current=false;setSending(false);setQueued(false);setTemplates([]);setSelected(null);setVariables({});setCategory("all");setError("");setLoadError("");setLoading(false);
  if(!isOpen||!workspaceId||!token)return;
  setLoading(true);apiClient.getTemplates(workspaceId,{},{token}).then(res=>{if(!cancelled){if(!Array.isArray(res?.templates))throw new Error("A consulta não confirmou uma lista válida de modelos. Tente consultar novamente.");setTemplates(res.templates);}}).catch(error=>{if(!cancelled)setLoadError(userFacingError(error,"Não foi possível carregar os modelos."));}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;generation.current++;};
 },[isOpen,workspaceId,token,thread?.id,reload]);
 const firstField=useRef<HTMLInputElement>(null);
 const draftChanged=Object.values(variables).some(value=>value!=="");
 const discard=useDiscardChanges(isOpen&&!queued&&draftChanged,scope.current,()=>firstField.current,isOpen);
 const requestClose=()=>{if(!inFlight.current)discard.requestExit(onClose);};
 const selectTemplate=(template:MessageTemplateSummary)=>{if(inFlight.current||queued||selected?.id===template.id)return;discard.requestExit(()=>{setSelected(template);setVariables({});setError("");});};
 const isMeta=thread?.channelProvider==="meta_waba";
 const eligible=(template:MessageTemplateSummary)=>!isMeta||Boolean(template.metaTemplateId&&template.status==="APPROVED"&&template.metaVerifiedChannelId===thread?.channelInstanceId&&template.metaVerifiedAt&&Date.parse(template.metaVerifiedAt)>Date.now()-86400000);
 const rendered=selected?assembleTemplate(selected,variables):null;
 const fields=rendered?.fields.filter(field=>isMeta||field.kind!=="payload")??[];
 const missing=Boolean(rendered?.missing.length);
 const canSend=Boolean(thread&&workspaceId&&token&&selected&&eligible(selected)&&rendered&&!missing&&!rendered.errors.length&&!rendered.unsupported.length&&!loading&&!loadError&&!sending&&!queued&&!discard.isPending&&!sendBlockedReason);
 async function send(){
  if(!canSend||inFlight.current||!selected||!thread||!workspaceId||!token||!rendered)return;
  const requestedScope=scope.current,request=generation.current;
  const valid=()=>requestedScope===scope.current&&request===generation.current;
  const fingerprint=JSON.stringify([requestedScope,selected,variables]);const key=keys.current.get(fingerprint)||crypto.randomUUID();keys.current.set(fingerprint,key);
  inFlight.current=true;setSending(true);setError("");
  try{
   await apiClient.sendOutboundMessage(workspaceId,thread.channelInstanceId,{recipientPhoneE164:thread.contactPhone,contentType:isMeta?"template":rendered.mediaType,body:rendered.renderedText,mediaUrl:isMeta?undefined:rendered.mediaUrl,template:isMeta?{name:selected.name,language:selected.language||"pt_BR",components:rendered.components}:undefined,idempotencyKey:key},{token});
   keys.current.delete(fingerprint);if(valid()){discard.keepEditing();setQueued(true);try{await onTemplateSent?.();if(valid())onClose();}catch{if(valid())setError("Modelo colocado na fila, mas a conversa não pôde ser atualizada. Atualize as mensagens; não repita o envio por esse motivo.");}}
  }catch(error){if(valid())setError(userFacingError(error,"Não foi possível preparar o envio. Confira a conversa antes de tentar novamente."));}
  finally{if(valid()){inFlight.current=false;setSending(false);}}
 }
 return <Drawer isOpen={isOpen} onClose={requestClose} title="Enviar modelo de mensagem" description="Escolha o modelo, preencha os campos e confira a prévia antes de enviar nesta conversa." footer={<div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"space-between",width:"100%"}}><a href="/modelos" aria-disabled={sending||discard.isPending} onClick={event=>{if(inFlight.current||discard.isPending)event.preventDefault();}} style={{fontSize:13}}>Gerenciar modelos</a><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button size="sm" variant="secondary" disabled={sending||discard.isPending} onClick={requestClose}>{queued?"Fechar":"Cancelar"}</Button><Button size="sm" disabled={!canSend} onClick={()=>void send()}>{sending?"Preparando envio...":"Enviar modelo"}</Button></div></div>}>
  {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={sending}/>}
  <fieldset disabled={sending||queued||discard.isPending} style={{border:0,margin:0,padding:0,minWidth:0,display:"grid",gap:16}}>
   {sendBlockedReason&&<div role="status"><p>{sendBlockedReason}</p>{onRefreshChannel&&<Button size="sm" variant="secondary" disabled={sending||isCheckingChannel} onClick={onRefreshChannel}>Atualizar disponibilidade</Button>}</div>}
   {queued&&<p role="status">Modelo colocado na fila. Envio e entrega dependem das confirmações do provedor.</p>}
   {error&&<p role="alert">{error}</p>}
   {!thread&&<p>Selecione uma conversa para enviar um modelo.</p>}
   {isMeta&&<p style={{fontSize:13,margin:0}}>Modelos Meta precisam de aprovação recente para o canal desta conversa. Enviar um modelo não comprova abertura da janela de atendimento; aguarde a resposta do cliente.</p>}
   {loadError?<div role="alert"><p>{loadError}</p><Button size="sm" onClick={()=>setReload(value=>value+1)}>Tentar novamente</Button></div>:loading?<p role="status">Carregando modelos...</p>:<>
    <SegmentedControl aria-label="Categoria dos modelos para envio" value={category} onChange={value=>{if(inFlight.current||queued||category===value)return;discard.requestExit(()=>{setCategory(value);setSelected(null);setVariables({});setError("");});}} options={[{value:"all",label:"Todos"},{value:"utility",label:"Utilidade"},{value:"marketing",label:"Marketing"}]}/>
    {!templates.length?<p>Nenhum modelo cadastrado nesta empresa.</p>:<div role="group" aria-label="Modelos disponíveis" style={{display:"grid",gap:8}}>
     {templates.filter(template=>category==="all"||template.category.toLowerCase()===category).map(template=><button key={template.id} type="button" aria-pressed={selected?.id===template.id} disabled={sending||!eligible(template)} onClick={()=>selectTemplate(template)} style={{padding:12,textAlign:"left",border:selected?.id===template.id?"2px solid var(--color-action)":"1px solid var(--border-default)",borderRadius:8,background:"var(--bg-surface)",color:"var(--text-primary)",display:"grid",gap:6,overflowWrap:"anywhere"}}><strong>{template.name}</strong><span>{template.category} · {template.language}</span><Badge variant={isMeta&&eligible(template)?"action":"neutral"}>{isMeta?(eligible(template)?"Aprovação confirmada para este canal":"Sincronize a aprovação deste canal"):"Modelo local"}</Badge></button>)}
     {!templates.some(template=>category==="all"||template.category.toLowerCase()===category)&&<p>Nenhum modelo nesta categoria.</p>}
    </div>}
   </>}
   {selected&&rendered&&<section aria-label="Prévia do modelo" style={{display:"grid",gap:12,padding:12,border:"1px solid var(--border-default)",borderRadius:8,overflowWrap:"anywhere"}}>
    <strong>Prévia da mensagem</strong>
    {rendered.headerFormat!=="NONE"&&rendered.headerFormat!=="TEXT"&&<p style={{margin:0}}>Cabeçalho: {rendered.headerFormat==="IMAGE"?"imagem":rendered.headerFormat==="VIDEO"?"vídeo":rendered.headerFormat==="DOCUMENT"?"documento":rendered.headerFormat}. {rendered.mediaUrl||"Informe o arquivo pela URL abaixo."}</p>}
    {rendered.renderedHeader&&<p style={{margin:0}}>{rendered.renderedHeader}</p>}
    <p style={{whiteSpace:"pre-wrap",margin:0}}>{rendered.renderedBody}</p>
    {rendered.renderedFooter&&<p style={{margin:0}}>{rendered.renderedFooter}</p>}
    {rendered.renderedButtons.map((button,index)=><p key={index} style={{margin:0}}>{button.text}{button.url?` — ${button.url}`:button.phone_number?` — ${button.phone_number}`:""}</p>)}
    {!isMeta&&<p style={{fontSize:12,margin:0}}>Neste canal, o modelo é convertido em texto e mídia. Links e opções aparecem no texto; não são botões nativos.</p>}
    {fields.map((field,index)=><Input ref={index===0?firstField:undefined} key={field.key} label={field.label} maxLength={field.maxLength} value={variables[field.key]||""} disabled={sending} onChange={event=>setVariables(current=>({...current,[field.key]:event.target.value}))} required={field.required} helperText={field.kind==="media"?"URL HTTP(S) do arquivo. A disponibilidade no destino será verificada no envio.":undefined}/>)}
    {missing&&<p style={{fontSize:13,margin:0}}>Preencha os campos obrigatórios para completar a prévia. O envio também depende da disponibilidade do canal.</p>}
    {[...rendered.unsupported,...rendered.errors].map((message,index)=><p role="alert" key={index}>{message}</p>)}
   </section>}

  </fieldset>
 </Drawer>;
};
