import {useState,useRef,useEffect,type CSSProperties} from 'react';
import {Dialog,Button,useBreakpoint} from '@sos-sales/ui';
import {apiClient,ApiError,type ChannelSummary} from '../../services/api-client';
import {userFacingError} from '../../utils/user-facing-error';
interface SubscriptionDialogProps {channel:ChannelSummary;workspaceId:string;token:string;onClose:()=>void;onUpdated:()=>void|Promise<void>}
export function MetaSubscriptionDialog(props:SubscriptionDialogProps){
 const {channel,workspaceId,token}=props;
 const context=JSON.stringify([workspaceId,token,channel.id,channel.revision,channel.provider,channel.status,channel.isActive,channel.metaSubscriptionStatus]);
 return <SubscriptionReview key={context} {...props}/>;
}
function SubscriptionReview({channel,workspaceId,token,onClose,onUpdated}:SubscriptionDialogProps){
 const {isMobile}=useBreakpoint();
 const actionStyle:CSSProperties|undefined=isMobile?{width:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.35}:undefined;
 const [done,setDone]=useState(false),[refreshError,setRefreshError]=useState(false),[subscriptionStatus,setSubscriptionStatus]=useState<"confirmed"|"failed"|"uncertain"|null>(null);
 const eligible=channel.provider==='meta_waba'&&channel.status!=='revoked'&&Boolean(channel.revision);
 const [pending,setPending]=useState(false),[message,setMessage]=useState<string|null>(null),[error,setError]=useState<string|null>(null);const live=useRef(true),busy=useRef(false),request=useRef<AbortController|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;request.current?.abort();};},[]);
 const check=async()=>{
  if(busy.current||!eligible||!channel.revision||done||error)return;busy.current=true;setPending(true);setError(null);request.current=new AbortController();
  try{const result=await apiClient.checkMetaSubscription(workspaceId,channel.id,channel.revision,{token,signal:AbortSignal.any([AbortSignal.timeout(30000),request.current.signal])});if(!live.current)return;if(result?.success!==true||!['confirmed','failed','uncertain'].includes(result.subscriptionStatus)||typeof result.message!=='string')throw new Error('A consulta não confirmou um diagnóstico válido. Atualize os canais antes de revisar novamente.');setDone(true);setSubscriptionStatus(result.subscriptionStatus);setMessage(result.message||'A consulta retornou. Confira o diagnóstico antes de liberar o canal.');try{await onUpdated();}catch{if(live.current)setRefreshError(true);}}
  catch(e){if(live.current)setError(e instanceof ApiError&&e.status===422?'Faltam credenciais Meta ativas ou identificadores da integração. Peça ao responsável técnico para conferir a configuração.':userFacingError(e,'Não foi possível confirmar a consulta. Atualize a lista antes de tentar novamente.'));}
  finally{if(live.current){busy.current=false;setPending(false);}}
 };
 return <Dialog isOpen onClose={()=>{if(!busy.current)onClose();}} title="Consultar assinatura Meta" description="Confira o canal e o alcance desta consulta.">
  <div style={{display:'grid',gap:12,overflowWrap:'anywhere'}}>
   <strong>{channel.displayName}</strong>
   <p>Consulta os aplicativos inscritos na conta WhatsApp Business. Não assina, não autoriza e não ativa o canal. Uma consulta concluída sem confirmar a assinatura pausará o uso local. Falhas de consulta preservam o diagnóstico anterior.</p>
   <p>Encontrar o aplicativo não comprova recebimento ou envio de mensagens. Uma alteração no canal durante a consulta exige nova revisão.</p>
   {!eligible&&<p role="alert">{channel.provider!=='meta_waba'?'Esta consulta está disponível somente para canais Meta.':channel.status==='revoked'?'Canal suspenso ou arquivado. Revise o cadastro antes de consultar a assinatura.':'Atualize os canais antes de consultar a assinatura.'}</p>}
   {done&&<p role="status">{subscriptionStatus==='confirmed'?'Consulta concluída: assinatura confirmada.':subscriptionStatus==='failed'?'Consulta concluída: assinatura não confirmada.':'Consulta concluída: resultado da assinatura não confirmado.'}</p>}
   {message&&<div role="status">{message}</div>}{error&&<div role="alert">{error}</div>}
   {refreshError&&<p role="alert">O resultado da consulta foi preservado, mas a lista não foi atualizada. Feche e atualize os canais, sem repetir a consulta para corrigir a lista.</p>}
   <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap',flexDirection:isMobile?'column':undefined}}><Button style={actionStyle} variant="secondary" disabled={pending} onClick={onClose}>Fechar</Button><Button style={actionStyle} disabled={pending||done||Boolean(error)||!eligible} loading={pending} onClick={()=>void check()}>Consultar na Meta</Button></div>
  </div>
 </Dialog>;
}
