import {useEffect,useState,useRef,useCallback} from "react";
import {Button} from "@sos-sales/ui";
import {apiClient,ApiError,type CommercialActionSummary,type CommercialActionHistorySummary} from "../../../services/api-client";
import {userFacingError} from "../../../utils/user-facing-error";
const taskLabel=(labels:Record<string,string>,value:string,fallback:string)=>Object.prototype.hasOwnProperty.call(labels,value)?labels[value]:fallback;
const taskTimestamp=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString("pt-BR"):"Data não reconhecida";
export function taskDateIso(value:string):string|null{
 const parts=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);if(!parts)return null;
 const date=new Date(value),[,year,month,day,hour,minute,second]=parts;
 if(!Number.isFinite(date.getTime())||date.getFullYear()!==Number(year)||date.getMonth()+1!==Number(month)||date.getDate()!==Number(day)||date.getHours()!==Number(hour)||date.getMinutes()!==Number(minute)||date.getSeconds()!==Number(second||0))return null;
 return date.toISOString();
}
export function CommercialTasks({workspaceId,threadId,token}:{workspaceId:string;threadId:string;token:string}){
 const [actions,setActions]=useState<CommercialActionSummary[]>([]),[title,setTitle]=useState(""),[due,setDue]=useState(""),[reason,setReason]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[loadError,setLoadError]=useState(""),[notice,setNotice]=useState("");
 const [assignees,setAssignees]=useState<Array<{userId:string;name:string}>>([]),[assigneeError,setAssigneeError]=useState(""),[assigneeLoading,setAssigneeLoading]=useState(true),[assigneeReload,setAssigneeReload]=useState(0),[assigneeChoice,setAssigneeChoice]=useState<string|undefined>(undefined);
 useEffect(()=>{let cancelled=false;setAssignees([]);setAssigneeError("");setAssigneeLoading(true);setAssigneeChoice(undefined);apiClient.getActionAssignees(workspaceId,{token}).then(result=>{if(!cancelled)setAssignees(result.assignees);}).catch(error=>{if(!cancelled)setAssigneeError(userFacingError(error,"Não foi possível consultar responsáveis."));}).finally(()=>{if(!cancelled)setAssigneeLoading(false);});return()=>{cancelled=true;};},[workspaceId,token,threadId,assigneeReload]);
 const historyRef=useRef<HTMLDivElement>(null),historyTrigger=useRef<HTMLButtonElement|null>(null);
 const [needsReview,setNeedsReview]=useState(false);
 const [history,setHistory]=useState<{title:string;items:CommercialActionHistorySummary[]}|null>(null);
 useEffect(()=>{if(history)historyRef.current?.focus();},[history]);
 const closeHistory=()=>{setHistory(null);if(historyTrigger.current?.isConnected&&!historyTrigger.current.disabled)historyTrigger.current.focus();};
 const scope=useRef("");scope.current=`${workspaceId}:${threadId}:${token}`;
 const generation=useRef(0),sequence=useRef(0),locked=useRef(false);
 const statusLabel={open:"Aberta",completed:"Concluída",cancelled:"Cancelada"};
 const actionLabel={created:"Criada",assigned:"Responsável alterado",rescheduled:"Reagendada",completed:"Concluída",cancelled:"Cancelada"};
 const load=useCallback(async()=>{
  const requestedScope=scope.current,request=++sequence.current;const valid=()=>requestedScope===scope.current&&request===sequence.current;
  setLoading(true);setLoadError("");try{const result=await apiClient.getThreadActions(workspaceId,threadId,{token});if(valid()){setActions(result.actions);setNeedsReview(false);}}
  catch(error){if(valid())setLoadError(userFacingError(error,"Não foi possível consultar as tarefas."));}
  finally{if(valid())setLoading(false);}
 },[workspaceId,threadId,token]);
 useEffect(()=>{generation.current++;sequence.current++;locked.current=false;setBusy(false);setActions([]);setNeedsReview(false);setHistory(null);historyTrigger.current=null;setAssigneeChoice(undefined);setTitle("");setDue("");setReason("");setError("");setNotice("");void load();return()=>{generation.current++;sequence.current++;};},[load]);
 async function run<T,>(operation:()=>Promise<T>,message:string,onResult?:(result:T)=>void,refresh=true,failureMessage="Não foi possível registrar a alteração. Atualize antes de tentar novamente."){
  if(locked.current||loading||loadError||(refresh&&needsReview))return;
  const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
  locked.current=true;setBusy(true);setError("");setNotice("");
  try{const result=await operation();if(!valid())return;onResult?.(result);setNotice(message);if(refresh)await load();}
  catch(error){if(valid()){if(refresh&&!(error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408))setNeedsReview(true);setError(userFacingError(error,failureMessage));}}
  finally{if(valid()){locked.current=false;setBusy(false);}}
 }
 const open=actions.find(action=>action.status==="open"),chosenAssignee=assigneeChoice??open?.assigneeUserId??"",date=taskDateIso(due),disabled=busy||loading||Boolean(loadError)||needsReview;
 return <section style={{padding:14,border:"1px solid var(--border-default)",borderRadius:10,display:"grid",gap:10,overflowWrap:"anywhere"}}>
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}><h3 style={{fontSize:14,margin:0}}>Tarefas desta conversa</h3><Button size="xs" variant="ghost" disabled={busy||loading} onClick={()=>void load()}>Atualizar tarefas</Button></div>
  {needsReview&&<p role="alert">O resultado da última alteração não foi confirmado. Atualize as tarefas e confira o estado atual antes de repetir. Atualizar não repete a ação.</p>}
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {loadError?<div role="alert"><p>{loadError}</p><Button size="sm" disabled={busy} onClick={()=>void load()}>Tentar novamente</Button></div>:loading?<p role="status">Consultando tarefas...</p>:<>
   {actions.map(action=><div key={action.id} style={{display:"grid",gap:8}}><strong>{action.title}</strong><span>{taskLabel(statusLabel,action.status,"Status não reconhecido")} · Prazo: {taskTimestamp(action.dueAt)}</span>
    <small>{action.assigneeUserId?`Responsável: ${assignees.find(member=>member.userId===action.assigneeUserId)?.name||"Atribuição registrada; nome indisponível nesta consulta"}`:"Sem responsável atribuído."}</small>
    {action.status==="open"&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
     <Button size="xs" disabled={disabled||!reason.trim()} onClick={()=>void run(()=>apiClient.patchCommercialAction(workspaceId,action.id,{action:"complete",reason:reason.trim()},{token}),"Conclusão registrada.",()=>setReason(""))}>Concluir tarefa</Button>
     <Button size="xs" disabled={disabled||!reason.trim()} onClick={()=>void run(()=>apiClient.patchCommercialAction(workspaceId,action.id,{action:"cancel",reason:reason.trim()},{token}),"Cancelamento registrado.",()=>setReason(""))}>Cancelar com motivo</Button>
     <Button size="xs" disabled={disabled||!date||!reason.trim()} onClick={()=>void run(()=>apiClient.patchCommercialAction(workspaceId,action.id,{action:"reschedule",newDueAt:date!,reason:reason.trim()},{token}),"Reagendamento registrado.",()=>{setDue("");setReason("");})}>Reagendar</Button>
    </div>}
    <Button size="xs" variant="ghost" aria-label={`Ver histórico de ${action.title}`} disabled={disabled} onClick={event=>{if(locked.current||loading||loadError)return;historyTrigger.current=event.currentTarget;void run(()=>{setHistory(null);return apiClient.getActionHistory(workspaceId,action.id,{token});},"",result=>setHistory({title:action.title,items:result.history}),false,"Não foi possível consultar o histórico. Tente abrir o histórico da tarefa novamente.");}}>Ver histórico da tarefa</Button>
   </div>)}
   {!actions.length&&<p>Nenhuma tarefa registrada.</p>}
  </>}
  <div style={{display:"grid",gap:8}}>
    {assigneeError&&<p role="alert">{assigneeError}</p>}
    <label style={{display:"grid",gap:6}}>Responsável pela tarefa
      <select value={chosenAssignee} disabled={disabled||assigneeLoading||Boolean(assigneeError)} onChange={event=>setAssigneeChoice(event.target.value)} style={{width:"100%",minWidth:0,minHeight:40}}>
        <option value="">Sem responsável atribuído</option>
        {chosenAssignee&&!assignees.some(member=>member.userId===chosenAssignee)&&<option value={chosenAssignee} disabled>Responsável fora da lista consultada</option>}
        {assignees.map(member=><option key={member.userId} value={member.userId}>{member.name||"Integrante"}{assignees.filter(known=>known.name===member.name).length>1?` · ${member.userId.slice(-6)}`:""}</option>)}
      </select>
    </label>
    {assigneeLoading?<small>Consultando responsáveis…</small>:assigneeError?<Button size="xs" disabled={busy} onClick={()=>setAssigneeReload(value=>value+1)}>Consultar responsáveis novamente</Button>:!assignees.length?<small>Nenhum integrante com acesso operacional disponível nesta consulta.</small>:null}
    {open&&<Button size="xs" disabled={disabled||assigneeLoading||Boolean(assigneeError)||chosenAssignee===(open.assigneeUserId??"")||Boolean(chosenAssignee&&!assignees.some(member=>member.userId===chosenAssignee))} onClick={()=>void run(()=>apiClient.patchCommercialAction(workspaceId,open.id,{action:"assign",assigneeUserId:chosenAssignee||null},{token}),"Responsável atualizado.",()=>setAssigneeChoice(undefined))}>Salvar responsável</Button>}
    {!open&&<small>A tarefa pode ser criada sem responsável e atribuída depois.</small>}
  </div>
  <fieldset disabled={disabled} style={{border:0,margin:0,padding:0,minWidth:0,display:"grid",gap:10}}>
   <label style={{display:"grid",gap:6}}>Prazo da tarefa<input type="datetime-local" value={due} onChange={event=>setDue(event.target.value)} style={{minWidth:0,width:"100%",boxSizing:"border-box",minHeight:40}}/></label>
   <small>Prazo no horário deste dispositivo. Para reagendar, preencha o novo prazo e o motivo.</small>
   {due&&!date&&<p role="alert">Informe uma data e hora válidas.</p>}
   {open?<label style={{display:"grid",gap:6}}>Resultado da conclusão ou motivo para cancelar/reagendar<input value={reason} onChange={event=>setReason(event.target.value)} maxLength={1000}/></label>:<>
    <label style={{display:"grid",gap:6}}>Título da próxima tarefa<input value={title} onChange={event=>setTitle(event.target.value)} maxLength={200}/></label>
    <Button size="sm" disabled={disabled||!title.trim()||!date} onClick={()=>void run(async()=>{const result=await apiClient.createThreadAction(workspaceId,threadId,{title:title.trim(),dueAt:date!,assigneeUserId:assigneeError||assigneeLoading?null:chosenAssignee||null,origin:"manual"},{token});if(!result.created)throw new Error("Já existe uma tarefa aberta. Atualize as tarefas para conferir.");return result;},"Tarefa registrada.",()=>{setTitle("");setDue("");setAssigneeChoice(undefined);})}>Criar tarefa</Button>
   </>}
  </fieldset>
  {history&&<div ref={historyRef} tabIndex={-1} role="region" aria-label="Histórico da tarefa"><strong>{history.title}</strong><Button size="xs" variant="ghost" onClick={closeHistory}>Fechar histórico</Button>{history.items.length?history.items.map(item=><p key={item.id}>{taskTimestamp(item.createdAt)} · {taskLabel(actionLabel,item.actionType,"Evento não reconhecido")}{item.reason?` · ${item.reason}`:""}{item.actionType==="rescheduled"&&<><br/>Prazo anterior: {item.previousDueAt?taskTimestamp(item.previousDueAt):"Não registrado"}<br/>Novo prazo: {item.newDueAt?taskTimestamp(item.newDueAt):"Não registrado"}</>}</p>):<p>Nenhum evento disponível nesta consulta.</p>}</div>}
 </section>;
}
