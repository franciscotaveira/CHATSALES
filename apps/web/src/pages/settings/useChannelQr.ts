import {useState,useRef,useEffect,useCallback} from "react";
import {apiClient,ApiError,type WahaConnectionState} from "../../services/api-client";
import {canReviewQrAction,type QrReviewAction} from "./channel-qr-actions";
import {userFacingError} from "../../utils/user-facing-error";
export type {QrReviewAction} from "./channel-qr-actions";
interface QrState extends WahaConnectionState {channelId:string;channelName:string;generation:number;openedAt:number;isLoading:boolean;isStarting?:boolean;isRefreshing?:boolean;isActing?:boolean;actionNotice?:string;pollingPaused?:boolean;}
interface Review {action:QrReviewAction;revision:string;operationId?:string;requestKey:string;}
function confirmedQrResponse(value:unknown):WahaConnectionState{
 const row=value as WahaConnectionState|null;
 const invalid=()=>new Error('A consulta não confirmou dados válidos da sessão. Atualize antes de revisar qualquer ação.');
 if(!row||typeof row!=='object'||typeof row.success!=='boolean')throw invalid();
 for(const key of ['isSimulated','alreadyConnected','requiresConfirmation','canCreate'] as const)if(row[key]!=null&&typeof row[key]!=='boolean')throw invalid();
 for(const key of ['status','verifiedPhoneNumber','sessionName','revision','qrDataUri','message','error'] as const)if(row[key]!=null&&typeof row[key]!=='string')throw invalid();
 if(row.operation!=null&&(!row.operation||typeof row.operation!=='object'||['id','action','state'].some(key=>typeof row.operation![key as keyof typeof row.operation]!=='string'||!row.operation![key as keyof typeof row.operation].trim())))throw invalid();
 return {success:row.success,status:row.status,isSimulated:row.isSimulated,alreadyConnected:row.alreadyConnected,requiresConfirmation:row.requiresConfirmation,canCreate:row.canCreate,verifiedPhoneNumber:row.verifiedPhoneNumber,sessionName:row.sessionName,revision:row.revision,qrDataUri:row.qrDataUri,message:row.message,error:row.error,operation:row.operation?{id:row.operation.id,action:row.operation.action,state:row.operation.state}:undefined};
}
function confirmedMutationResponse(value:unknown):{success:boolean;message?:string;error?:string}{
 const row=value as WahaConnectionState|{success?:unknown;message?:unknown;error?:unknown}|null;
 const invalid=()=>new Error('A resposta da ação não retornou confirmação válida do servidor.');
 if(!row||typeof row!=='object'||typeof row.success!=='boolean')throw invalid();
 if(row.message!=null&&typeof row.message!=='string')throw invalid();
 if(row.error!=null&&typeof row.error!=='string')throw invalid();
 return {
  success:row.success,
  message:typeof row.message==='string'&&row.message.trim()?row.message:undefined,
  error:typeof row.error==='string'&&row.error.trim()?row.error:undefined
 };
}
function connectionFeedback(error:unknown,fallback:string){
 if(error instanceof ApiError){
  if(error.status===422&&/credenciais WAHA/.test(error.detail))return "Este canal ainda não tem credenciais WAHA ativas. Conclua a configuração com o responsável técnico antes de consultar o QR Code.";
  if(error.status===422)return "Revise o endereço WAHA, o nome da sessão e as credenciais cadastradas antes de continuar.";
  if(error.status===409&&/vinculada a outro canal/.test(error.detail))return "Esta sessão já está vinculada a outro canal. Escolha uma sessão exclusiva para esta linha.";
  if(error.status===409&&/operação pendente|operação de conexão pendente/.test(error.detail))return "Há uma ação de conexão pendente. Consulte o estado e revise o resultado antes de tentar outra ação.";
  if(error.status===502)return "O provedor WAHA não confirmou uma resposta válida. Confira o provedor e atualize a consulta; nenhuma sessão foi reiniciada por esta consulta.";
 }
 return userFacingError(error,fallback);
}
/** Read polling and explicit mutation are separate; every response belongs to one dialog generation. */
export function useChannelQr(workspaceId:string|undefined,token:string|null|undefined,onConnected:()=>void){
 const [modal,setModal]=useState<QrState|null>(null),[checking,setChecking]=useState(false),[review,setReview]=useState<Review|null>(null);
 const scope=useRef('');scope.current=`${workspaceId??''}:${token??''}`;
 const reviewing=useRef(false);
 const current=useRef(modal);current.current=modal;
 const generation=useRef(0),inFlight=useRef(new Set<number>()),actions=useRef(new Set<number>()),failures=useRef(0);
 const connected=useRef(onConnected);connected.current=onConnected;
 const close=useCallback(()=>{reviewing.current=false;generation.current++;current.current=null;setModal(null);setReview(null);setChecking(false);},[]);
 useEffect(()=>{close();return()=>{generation.current++;};},[workspaceId,token,close]);
 const query=useCallback(async(state:QrState,manual=false)=>{
  if(!workspaceId||!token||reviewing.current||inFlight.current.has(state.generation)||actions.current.has(state.generation))return;
  const requestedScope=scope.current,valid=()=>scope.current===requestedScope&&generation.current===state.generation&&current.current?.generation===state.generation;
  if(!valid())return;inFlight.current.add(state.generation);setChecking(true);
  if(manual){failures.current=0;setReview(null);const next={...state,openedAt:Date.now(),pollingPaused:false,isRefreshing:true};current.current=next;setModal(next);}
  try{
   const response=await apiClient.getChannelQrCode(workspaceId,state.channelId,{token,signal:AbortSignal.timeout(20_000)});if(!valid())return;
   const result=confirmedQrResponse(response);
   const previous=current.current!;const paused=Date.now()-previous.openedAt>=120000;
   failures.current=0;
   const next:QrState={channelId:previous.channelId,channelName:previous.channelName,generation:previous.generation,openedAt:previous.openedAt,actionNotice:previous.actionNotice,...result,alreadyConnected:result.success===true&&!result.isSimulated&&result.alreadyConnected===true,requiresConfirmation:result.success===true&&!result.isSimulated&&result.requiresConfirmation===true,isLoading:false,isRefreshing:false,isStarting:result.status==='STARTING',pollingPaused:paused,qrDataUri:paused?undefined:result.qrDataUri,error:!result.success?(result.error||result.message||'Não foi possível consultar a sessão. Atualize a consulta.'):result.status===undefined&&!result.qrDataUri&&!result.alreadyConnected?'O provedor não retornou um QR Code nem confirmou a conexão. Atualize para consultar novamente.':undefined};
   current.current=next;setModal(next);if(next.alreadyConnected)connected.current();
  }catch(error){if(valid()){failures.current++;const next={...current.current!,isLoading:false,isStarting:false,isRefreshing:false,qrDataUri:undefined,error:connectionFeedback(error,'Não foi possível consultar a sessão. A consulta não reiniciou o canal.'),pollingPaused:(error instanceof ApiError&&[401,403,404,409,422].includes(error.status))||failures.current>=3||Date.now()-current.current!.openedAt>=120000};current.current=next;setModal(next);}}
  finally{inFlight.current.delete(state.generation);if(valid())setChecking(false);}
 },[workspaceId,token]);
 useEffect(()=>{
  if(reviewing.current||!modal||modal.alreadyConnected||modal.isSimulated||modal.requiresConfirmation||modal.pollingPaused||['STOPPED','FAILED','NOT_FOUND'].includes(modal.status||'')||modal.operation?.state==='uncertain')return;
  let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
  const tick=async()=>{const state=current.current;if(cancelled||!state||state.alreadyConnected||state.pollingPaused)return;await query(state);if(!cancelled&&current.current&&!current.current.alreadyConnected)timer=setTimeout(tick,3500);};
  if(modal.isLoading)void tick();else timer=setTimeout(tick,3500);return()=>{cancelled=true;clearTimeout(timer);};
 },[review?.requestKey,modal?.generation,modal?.alreadyConnected,modal?.isSimulated,modal?.requiresConfirmation,modal?.pollingPaused,modal?.status,modal?.operation?.state,query]);
 const open=(channelId:string,channelName:string)=>{if(!workspaceId||!token)return;reviewing.current=false;failures.current=0;setReview(null);const next={success:false,channelId,channelName,generation:++generation.current,openedAt:Date.now(),isLoading:true};current.current=next;setModal(next);};
 const refresh=()=>{if(current.current)void query(current.current,true);};
 const requestAction=(action:QrReviewAction)=>{const state=current.current;if(!state||reviewing.current||!canReviewQrAction(state,action)||inFlight.current.has(state.generation)||actions.current.has(state.generation))return;reviewing.current=true;setReview({action,revision:state.revision!,operationId:state.operation?.id,requestKey:crypto.randomUUID()});};
 const confirmAction=async()=>{
  const state=current.current;if(!review||!state||!workspaceId||!token||!canReviewQrAction(state,review.action)||actions.current.has(state.generation)||inFlight.current.has(state.generation))return;
  if(state.revision!==review.revision||state.operation?.id!==review.operationId){reviewing.current=false;setReview(null);const updated={...state,actionNotice:'Os dados da sessão mudaram. Atualize a consulta e revise a ação novamente.'};current.current=updated;setModal(updated);return;}
  const requestedScope=scope.current,valid=()=>scope.current===requestedScope&&generation.current===state.generation&&current.current?.generation===state.generation;
  actions.current.add(state.generation);const next={...state,isActing:true,actionNotice:undefined,error:undefined,qrDataUri:undefined};current.current=next;setModal(next);
  try{
   const options={token,signal:AbortSignal.timeout(22_000)};
   const rawResult=review.action==='activate'?await apiClient.approveChannelConnection(workspaceId,state.channelId,{expectedRevision:review.revision,acknowledgedConnection:true},options):review.action==='review'?await apiClient.reviewWahaConnection(workspaceId,state.channelId,{expectedRevision:review.revision,operationId:review.operationId!,acknowledged:true},options):await apiClient.changeWahaConnection(workspaceId,state.channelId,{action:review.action,expectedRevision:review.revision,requestKey:review.requestKey,acknowledged:true},options);
   const result=confirmedMutationResponse(rawResult);
   if(valid()){const notice=result.error||result.message||(result.success?'Resultado recebido. Atualize a consulta para conferir o estado.':'A ação não foi confirmada pelo servidor.');const updated={...current.current!,actionNotice:notice};current.current=updated;setModal(updated);if(review.action==='activate'&&result.success)connected.current();}
  }catch(error){if(valid()){const updated={...current.current!,actionNotice:error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)?'A ação terminou sem confirmação. Consulte o estado; não repita automaticamente.':connectionFeedback(error,'Não foi possível confirmar a ação. Consulte o estado antes de tentar novamente.')};current.current=updated;setModal(updated);}}
  finally{actions.current.delete(state.generation);if(valid()){reviewing.current=false;setReview(null);const updated={...current.current!,isActing:false};current.current=updated;setModal(updated);void query(updated,true);}}
 };
 return {modal,checking,open,close,refresh,review,requestAction,cancelReview:()=>{reviewing.current=false;setReview(null);},confirmAction};
}
