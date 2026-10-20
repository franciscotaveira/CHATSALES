import {useEffect,useRef,useState} from 'react';
import type {AiCheckoutSummary} from '@sos-sales/contracts';
import {Button} from '@sos-sales/ui';
import {apiClient} from '../../../services/api-client';
import {userFacingError} from '../../../utils/user-facing-error';
const labels={pending:'Aguardando confirmação do cliente',consumed:'Cobrança gerada',expired:'Resumo expirado',superseded:'Resumo substituído',cancelled:'Resumo cancelado'};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
export function CheckoutRequestsPanel({workspaceId,threadId,token,onViewCharge,isOpeningCharge=false}:{workspaceId:string;threadId:string;token:string;onViewCharge?:(chargeId:string)=>void;isOpeningCharge?:boolean}){
 const [open,setOpen]=useState(false),[items,setItems]=useState<AiCheckoutSummary[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  if(!open)return;
  const update=()=>setNow(Date.now());
  window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);
  const future=items.filter(item=>item.status==='pending').map(item=>Date.parse(item.validUntil)).filter(time=>Number.isFinite(time)&&time>now);
  const timer=future.length?setTimeout(update,Math.min(60000,Math.max(1,Math.min(...future)-Date.now()+1))):undefined;
  return()=>{clearTimeout(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};
 },[open,items,now]);
 const scope=useRef('');scope.current=`${workspaceId}:${threadId}:${token}`;
 const request=useRef<symbol|null>(null),rangeInvalid=useRef(false),seenCursors=useRef(new Set<string>());
 const itemsRef=useRef(items),cursorRef=useRef(cursor);itemsRef.current=items;cursorRef.current=cursor;
 const [requiresRefresh,setRequiresRefresh]=useState(false),[hasLoaded,setHasLoaded]=useState(false);
 async function load(before?:string){
  if(!open||request.current||(before&&(rangeInvalid.current||before!==cursorRef.current)))return;
  const id=Symbol(),current=scope.current;request.current=id;setLoading(true);setError('');
  const valid=()=>current===scope.current&&request.current===id;let paginationInvalid=false;
  try{
   if(before){
    const data=await apiClient.getAiCheckoutRequests(workspaceId,threadId,before,{token});if(!valid())return;
    if(data.nextCursor&&(data.nextCursor===before||seenCursors.current.has(data.nextCursor))){paginationInvalid=true;throw new Error('A paginação dos resumos não avançou. Atualize a consulta antes de continuar.');}
    setNow(Date.now());setHasLoaded(true);seenCursors.current.add(before);setItems(previous=>[...previous,...data.items.filter(item=>!previous.some(known=>known.id===item.id))]);setCursor(data.nextCursor);
   }else{
    // Refresh the loaded range atomically; a failed intermediate page must not replace retained history.
    const target=Math.max(1,itemsRef.current.length),maxPages=Math.ceil(target/20)+1;
    let collected:AiCheckoutSummary[]=[],next:string|null=null,pages=0;
    const visited=new Set<string>();
    do{
     const data=await apiClient.getAiCheckoutRequests(workspaceId,threadId,next??undefined,{token});if(!valid())return;
     collected=[...collected,...data.items.filter(item=>!collected.some(known=>known.id===item.id))];next=data.nextCursor;pages++;
     if(next&&visited.has(next))throw new Error('A paginação dos resumos não avançou. Atualize a consulta antes de continuar.');
     if(next&&collected.length<target){if(pages>=maxPages)throw new Error('Não foi possível atualizar todo o intervalo exibido. Os resumos anteriores foram preservados.');visited.add(next);}
     else break;
    }while(next);
    setNow(Date.now());setHasLoaded(true);setItems(collected);setCursor(next);seenCursors.current=visited;rangeInvalid.current=false;setRequiresRefresh(false);
   }
  }catch(err){if(valid()){if(!before||paginationInvalid){rangeInvalid.current=true;setRequiresRefresh(true);}setError(userFacingError(err,'Não foi possível consultar os resumos.'));}}
  finally{if(valid()){request.current=null;setLoading(false);}}
 }
 useEffect(()=>{request.current=null;rangeInvalid.current=false;seenCursors.current=new Set();setRequiresRefresh(false);setHasLoaded(false);setItems([]);setCursor(null);setError('');setLoading(false);if(open)void load();return()=>{request.current=null;};},[workspaceId,threadId,token,open]);
 return <details open={open} onToggle={event=>setOpen(event.currentTarget.open)} style={{border:'1px solid var(--border-default)',padding:12,borderRadius:10,marginBottom:16,minWidth:0,overflowWrap:'anywhere'}}>
 <summary>Resumos de cobrança da IA</summary><p>Confira os dados enviados e a confirmação registrada. Resumo não reserva disponibilidade; cobrança gerada não significa pagamento recebido.</p>
 <Button disabled={loading} onClick={()=>void load()}>Atualizar resumos</Button>
 {loading&&<p role="status">Consultando resumos…</p>}{error&&<p role="alert">{error}</p>}{error&&items.length>0&&<p>Os resumos exibidos são da última consulta concluída.</p>}{requiresRefresh&&<p role="status">Atualize os resumos com sucesso antes de carregar páginas anteriores.</p>}
 {!loading&&!error&&hasLoaded&&!items.length&&<p>Nenhum resumo de cobrança registrado nesta conversa.</p>}
 {items.map(item=>{const deadline=Date.parse(item.validUntil),confirmed=Date.parse(item.confirmedAt??""),pastDeadline=item.status==='pending'&&Number.isFinite(deadline)&&deadline<=now;return <article key={item.id} aria-label={`Resumo de ${item.productTitle}`} style={{borderTop:'1px solid var(--border-default)',marginTop:12,paddingTop:12}}>
 <h4>{item.productTitle}</h4><p><strong>{Object.prototype.hasOwnProperty.call(labels,item.status)?labels[item.status]:"Estado não reconhecido"}</strong></p><p>Código do item: {item.retailerId} · Quantidade: {item.quantity}</p><p>Unitário: {money(item.unitPriceCents)} · Total: {money(item.totalCents)}</p>
 <p>Validade do resumo: {Number.isFinite(deadline)?new Date(deadline).toLocaleString('pt-BR'):'Data indisponível; atualize a consulta.'}</p>{pastDeadline&&<p role="status">O prazo informado já passou. Atualize os resumos para conferir o estado atual; este aviso usa o relógio do dispositivo.</p>}{!Number.isFinite(deadline)&&<p role="status">Não foi possível conferir a validade deste resumo.</p>}<p>{item.summarySent?'Envio aceito pelo canal.':'Sem confirmação de envio pelo canal.'}</p>
 <p>{item.confirmedAt?(Number.isFinite(confirmed)?`Confirmação do cliente registrada em ${new Date(confirmed).toLocaleString('pt-BR')}.`:'Há um registro de confirmação com data indisponível; atualize a consulta.'):'Sem mensagem de confirmação do cliente registrada.'}</p>
 <p>{item.stockPolicy==='not_required'?'Item configurado sem dependência de estoque ou vaga.':'Disponibilidade deve ser conferida pela equipe.'}</p>
 {item.status==='consumed'&&item.chargeId&&onViewCharge&&<><p>A confirmação do cliente autorizou gerar a cobrança; o recebimento deve ser conferido separadamente.</p><Button aria-label={`${isOpeningCharge?"Consultando cobrança vinculada ao resumo de":"Ver cobrança vinculada ao resumo de"} ${item.productTitle}`} disabled={loading||isOpeningCharge} onClick={()=>onViewCharge(item.chargeId!)}>{isOpeningCharge?"Consultando cobrança...":"Ver cobrança vinculada"}</Button></>}
 </article>;})}
 {cursor&&<Button disabled={loading||requiresRefresh} onClick={()=>void load(cursor)}>Carregar resumos anteriores</Button>}
 </details>;
}
