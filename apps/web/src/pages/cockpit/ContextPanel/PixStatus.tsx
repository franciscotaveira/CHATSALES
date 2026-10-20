import {hasVerifiedPixReceipt,readConversationPixCharges} from '../utils/pix-receipt';
import {useCallback,useEffect,useRef,useState,type FC} from 'react';
import {Button} from '@sos-sales/ui';
import {apiClient,type PixChargeSummary} from '../../../services/api-client';
import {userFacingError} from '../../../utils/user-facing-error';
interface Props{workspaceId?:string;threadId?:string;token?:string;refreshKey?:number;onGeneratePix?:()=>void;}
export function summarizePixCharges(charges:PixChargeSummary[],checkedAt:number){
 const result={pending:0,received:0,expired:0,cancelled:0,review:0};
 for(const charge of charges){
  if(charge.status==='PENDING'){const expiry=Date.parse(charge.expiresAt);if(!Number.isFinite(expiry))result.review++;else if(expiry<=checkedAt)result.expired++;else result.pending++;}
  else if(charge.status==='PAID'){if(hasVerifiedPixReceipt(charge))result.received++;else result.review++;}
  else if(charge.status==='EXPIRED')result.expired++;
  else if(charge.status==='CANCELLED')result.cancelled++;
  else result.review++;
 }
 return result;
}
export const PixStatus:FC<Props>=props=><StatusCard key={JSON.stringify([props.workspaceId,props.threadId,props.token])} {...props}/>;
const StatusCard:FC<Props>=({workspaceId,threadId,token,refreshKey=0,onGeneratePix})=>{
 const [data,setData]=useState<{charges:PixChargeSummary[];checkedAt:number}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null);
 const sequence=useRef(0);
 const load=useCallback(async()=>{
  if(!workspaceId||!threadId||!token){setLoading(false);setError('Selecione uma conversa e aguarde a confirmação do acesso para consultar as cobranças.');return;}
  const request=++sequence.current;setLoading(true);setError(null);
  try{const result=await apiClient.getPixChargesByThread(workspaceId,threadId,{token});if(request!==sequence.current)return;
   const charges=readConversationPixCharges(result.charges,workspaceId,threadId);
   setData({charges,checkedAt:Date.now()});
  }catch(e){if(request===sequence.current)setError(userFacingError(e,'Não foi possível consultar as cobranças Pix. Tente novamente.'));}
  finally{if(request===sequence.current)setLoading(false);}
 },[workspaceId,threadId,token]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load,refreshKey]);
 const summary=data?summarizePixCharges(data.charges,data.checkedAt):null;
 return <div style={{display:'grid',gap:8,overflowWrap:'anywhere'}}>
  {loading&&<p role="status">Consultando cobranças Pix…</p>}
  {error&&<p role="alert">{error} O estado financeiro não foi atualizado nesta consulta.</p>}
  {!loading&&!error&&data&&summary&&<>
   {data.charges.length===0?<p>Nenhuma cobrança Pix registrada nesta conversa.</p>:<>
    <p>{data.charges.length} cobrança(s) consultada(s).</p>
    {summary.pending>0&&<p>Pendentes válidas na consulta: {summary.pending}.</p>}
    {summary.received>0&&<p>Recebimentos com confirmação registrada: {summary.received}.</p>}
    {summary.expired>0&&<p>Expiradas: {summary.expired}.</p>}
    {summary.cancelled>0&&<p>Canceladas: {summary.cancelled}.</p>}
    {summary.review>0&&<p role="status">Cobranças com dados de estado ou confirmação para revisar: {summary.review}.</p>}
   </>}
   <small>Consulta às {new Date(data.checkedAt).toLocaleTimeString('pt-BR')}. Abra as cobranças para conferir valores, datas e origem da confirmação.</small>
  </>}
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><Button size="xs" variant="secondary" disabled={loading} onClick={()=>void load()}>Atualizar cobranças</Button>{onGeneratePix&&<Button size="xs" variant="secondary" onClick={onGeneratePix}>Abrir cobranças Pix</Button>}</div>
 </div>;
};
