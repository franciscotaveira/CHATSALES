import {useState,useEffect,useRef,type CSSProperties} from 'react';
import {Dialog,Button,useBreakpoint} from '@sos-sales/ui';
import {apiClient,type ChannelSummary} from '../../services/api-client';
import {userFacingError} from '../../utils/user-facing-error';
interface ConnectionDialogProps {channel:ChannelSummary;workspaceId:string;token:string;onClose:()=>void;onUpdated:()=>void|Promise<void>}
export function ChannelConnectionDialog(props:ConnectionDialogProps){
 const {channel,workspaceId,token}=props;
 const context=JSON.stringify([workspaceId,token,channel.id,channel.revision,channel.provider,channel.status,channel.isActive,channel.metaSubscriptionStatus,channel.phoneNumberE164]);
 return <ConnectionReview key={context} {...props}/>;
}
function ConnectionReview({channel,workspaceId,token,onClose,onUpdated}:ConnectionDialogProps){
 const {isMobile}=useBreakpoint();
 const actionStyle:CSSProperties|undefined=isMobile?{width:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.35}:undefined;
 const [refreshError,setRefreshError]=useState(false);
 const [ack,setAck]=useState(false),[pending,setPending]=useState(false),[done,setDone]=useState(false),[error,setError]=useState<string|null>(null);const live=useRef(true),busy=useRef(false),request=useRef<AbortController|null>(null);
 useEffect(()=>{live.current=true;return()=>{live.current=false;request.current?.abort();};},[]);
 const isEvolution=channel.provider==='evolution';
 const supported=isEvolution||channel.provider==='meta_waba';
 const eligible=supported&&(isEvolution||channel.metaSubscriptionStatus==='confirmed')&&channel.status!=='revoked'&&!channel.isActive&&Boolean(channel.revision);
 const refreshList=async()=>{try{await onUpdated();}catch{if(live.current)setRefreshError(true);}};
 const approve=async()=>{
  if(!eligible||!ack||busy.current||done||error)return;busy.current=true;setPending(true);request.current=new AbortController();
  try{const result=await apiClient.approveProviderConnection(workspaceId,channel.id,channel.revision!,{token,signal:AbortSignal.any([AbortSignal.timeout(45000),request.current.signal])});if(!live.current)return;
   if(!result||typeof result.success!=='boolean'||typeof result.isActive!=='boolean'||typeof result.status!=='string'||(result.isSimulated!=null&&typeof result.isSimulated!=='boolean')||(result.handshakeDetail!=null&&typeof result.handshakeDetail!=='string')){setError('O servidor não confirmou um resultado válido para esta conexão. Atualize os canais antes de revisar novamente; o resultado pode ter sido aplicado.');await refreshList();return;}
   if(result.isSimulated===true||result.success!==true||result.isActive!==true||result.status!=='connected'){setError(result.isSimulated===true?'SIMULAÇÃO — nenhuma conexão real foi liberada.':result.handshakeDetail||'A identidade da linha não foi confirmada. Atualize os canais e revise a configuração.');await refreshList();return;}
   setDone(true);await refreshList();
  }catch(e){if(live.current)setError(userFacingError(e,'Não foi possível confirmar o resultado. Atualize os canais antes de revisar novamente.'));}
  finally{if(live.current){busy.current=false;setPending(false);}}
 };
 return <Dialog isOpen onClose={()=>{if(!busy.current)onClose();}} title={`Revisar conexão ${isEvolution ? "Evolution" : "Meta"}`} description="Confirme a linha e as condições antes de liberar seu uso local.">
  <div style={{display:'grid',gap:12,overflowWrap:'anywhere'}}>
   <strong>{channel.displayName}</strong>{channel.phoneNumberE164&&<div>{channel.phoneNumberE164}</div>}
   <p>{isEvolution ? "A confirmação consulta a instância Evolution e o telefone informado pelo provedor. O número deve coincidir com o cadastro; se estiver ausente, será preenchido com o número conferido." : "A confirmação consulta novamente o número e seu vínculo com a conta WhatsApp Business."} Se forem compatíveis, libera o uso local deste canal. Não envia mensagem de teste nem ativa a IA.</p>
   <p>Recebimento, entrega e faturamento precisam de verificações próprias. Alterações no canal ou nas credenciais exigem nova revisão.</p>
   {!eligible&&<div role="alert">{!supported?"Este provedor não oferece confirmação por esta revisão.":channel.status==='revoked'?"Canal suspenso ou arquivado. Revise o cadastro antes de reconectar.":channel.isActive?"O canal já está ativo. Atualize a lista antes de continuar.":!channel.revision?"Atualize os canais antes de revisar a conexão.":"Confirme primeiro a assinatura de webhooks usando Consultar assinatura na lista de canais. Esta revisão não resolve uma assinatura ausente ou incerta."}</div>}
   {!done&&eligible&&<label style={{display:'flex',alignItems:'flex-start',gap:8}}><input type="checkbox" checked={ack} disabled={pending||Boolean(error)} onChange={e=>setAck(e.target.checked)}/>Autorizo o uso local desta linha após a conferência {isEvolution ? "da instância e do número" : "do número e da conta"}.</label>}
   {error&&<div role="alert">{error}</div>}{done&&<div role="status">Conexão local confirmada. Testes de envio e recebimento continuam separados; a IA não foi ativada.</div>}
   {refreshError&&<p role="alert">O resultado acima foi preservado, mas a lista não foi atualizada. Feche e atualize os canais; não repita a confirmação para corrigir a lista.</p>}
   <div style={{display:'flex',gap:8,justifyContent:'flex-end',flexWrap:'wrap',flexDirection:isMobile?'column':undefined}}><Button style={actionStyle} variant="secondary" disabled={pending} onClick={onClose}>Fechar</Button><Button style={actionStyle} disabled={!eligible||!ack||pending||done||Boolean(error)} loading={pending} onClick={()=>void approve()}>Confirmar conexão</Button></div>
  </div>
 </Dialog>;
}
