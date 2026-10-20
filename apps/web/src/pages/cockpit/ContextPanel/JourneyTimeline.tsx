import {useCallback,useEffect,useRef,useState,type FC} from 'react';
import {Badge,Button} from '@sos-sales/ui';
import {apiClient,type ThreadCommercialHistory} from '../../../services/api-client';
import {userFacingError} from '../../../utils/user-facing-error';
import {STAGES,getStageLabel,type CustomStagesMap} from '../../opportunities/stages';
interface Props{workspaceId?:string;threadId?:string;token?:string;refreshKey?:string|number;customStages?:CustomStagesMap;}
export const JourneyTimeline:FC<Props>=props=><HistoryPanel key={JSON.stringify([props.workspaceId,props.threadId,props.token])} {...props}/>;
const HistoryPanel:FC<Props>=({workspaceId,threadId,token,refreshKey,customStages={}})=>{
 const [data,setData]=useState<(ThreadCommercialHistory&{checkedAt:number})|null>(null),[loading,setLoading]=useState(true),[moreLoading,setMoreLoading]=useState(false),[error,setError]=useState<string|null>(null),[pageError,setPageError]=useState<string|null>(null),[expanded,setExpanded]=useState(false),[paginationBlocked,setPaginationBlocked]=useState(false);
 const sequence=useRef(0),moreBusy=useRef(false),seenCursors=useRef(new Set<string>()),loadedPages=useRef(1);
 const cursorKey=(cursor:ThreadCommercialHistory["pagination"]["nextCursor"])=>cursor?JSON.stringify([cursor.occurredAt,cursor.eventId]):"";
 const assertCursor=(result:ThreadCommercialHistory,used?:string,seen=seenCursors.current)=>{const next=cursorKey(result.pagination.nextCursor);if(result.pagination.hasMore&&(!next||next===used||seen.has(next)))throw new Error("A consulta não confirmou uma continuação válida. Atualize a negociação e os registros antes de continuar.");};
 const load=useCallback(async()=>{
  const request=++sequence.current;moreBusy.current=false;setMoreLoading(false);setPageError(null);setError(null);
  if(!workspaceId||!threadId||!token){setLoading(false);setError('Selecione uma conversa e aguarde a confirmação do acesso para consultar os registros.');return;}
  setLoading(true);
  try{
   const refreshedCursors=new Set<string>();
   let result=await apiClient.getThreadCommercialHistory(workspaceId,threadId,{limit:50},{token});
   if(request!==sequence.current)return;
   assertCursor(result,undefined,refreshedCursors);
   let items=result.items,pages=1;
   const targetPages=loadedPages.current;
   while(pages<targetPages&&result.pagination.hasMore){
    const cursor=result.pagination.nextCursor!;
    const used=cursorKey(cursor);
    const next=await apiClient.getThreadCommercialHistory(workspaceId,threadId,{limit:50,beforeOccurredAt:cursor.occurredAt,beforeEventId:cursor.eventId},{token});
    if(request!==sequence.current)return;
    assertCursor(next,used,refreshedCursors);refreshedCursors.add(used);
    items=Array.from(new Map([...items,...next.items].map(item=>[item.id,item])).values());result=next;pages++;
   }
   seenCursors.current=refreshedCursors;loadedPages.current=pages;
   setPaginationBlocked(false);setData({...result,items,checkedAt:Date.now()});
  }
  catch(e){if(request===sequence.current){setPaginationBlocked(true);setError(userFacingError(e,'Não foi possível consultar a negociação e seus registros. Tente novamente.'));}}
  finally{if(request===sequence.current)setLoading(false);}
 },[workspaceId,threadId,token]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load,refreshKey]);
 const loadMore=async()=>{
  if(!workspaceId||!threadId||!token||loading||error||paginationBlocked||moreBusy.current||!data?.pagination.nextCursor)return;
  const request=sequence.current,cursor=data.pagination.nextCursor;moreBusy.current=true;setMoreLoading(true);setPageError(null);
  try{const result=await apiClient.getThreadCommercialHistory(workspaceId,threadId,{limit:50,beforeOccurredAt:cursor.occurredAt,beforeEventId:cursor.eventId},{token});if(request!==sequence.current)return;try{assertCursor(result,cursorKey(cursor));}catch(e){setPaginationBlocked(true);throw e;}seenCursors.current.add(cursorKey(cursor));loadedPages.current++;setData(previous=>({...result,items:Array.from(new Map([...(previous?.items??[]),...result.items].map(item=>[item.id,item])).values()),checkedAt:Date.now()}));}
  catch(e){if(request===sequence.current)setPageError(userFacingError(e,'Não foi possível carregar registros anteriores. Os registros consultados foram preservados.'));}
  finally{if(request===sequence.current){moreBusy.current=false;setMoreLoading(false);}}
 };
 const stage=data?.journey?.stage,knownStage=STAGES.some(item=>item.id===stage);
 return <div style={{display:'grid',gap:10,overflowWrap:'anywhere'}}>
  {loading&&<p role="status">Consultando negociação e registros…</p>}
  {error&&<p role="alert">{error}{data?' Os registros da última consulta foram preservados.':''}</p>}
  {data&&<>
   <div>{data.journey?<><span>Etapa na última consulta: </span><Badge variant="action">{knownStage?getStageLabel(stage!,customStages):'Etapa não reconhecida'}</Badge></>:<p>Nenhuma negociação vinculada nesta consulta.</p>}</div>
   <small>Consulta às {new Date(data.checkedAt).toLocaleTimeString('pt-BR')}. Os registros disponíveis não permitem presumir todas as etapas percorridas.</small>
   <Button size="xs" variant="ghost" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>Registros consultados: {data.items.length}{data.pagination.hasMore?' ou mais':''}</Button>
   {expanded&&<div style={{display:'grid',gap:8}}>
    {data.items.length===0&&!loading&&!error&&<p>Nenhum evento disponível nesta consulta.</p>}
    {data.items.map(item=><div key={item.id} style={{padding:8,border:'1px solid var(--border-default)',borderRadius:6}}><strong style={{display:'block',fontSize:12}}>{item.label}</strong><time dateTime={item.occurredAt} style={{fontSize:11,color:'var(--text-secondary)'}}>{new Date(item.occurredAt).toLocaleString('pt-BR')}</time><details><summary>Identificação do registro</summary><span style={{fontSize:11}}>{item.resourceId}</span></details></div>)}
    {pageError&&<p role="alert">{pageError}</p>}
    {data.pagination.hasMore&&<Button size="xs" disabled={loading||moreLoading||!!error||paginationBlocked} onClick={()=>void loadMore()}>{moreLoading?'Carregando registros anteriores…':'Carregar registros anteriores'}</Button>}
   </div>}
  </>}
  <Button size="xs" variant="secondary" disabled={loading||moreLoading} onClick={()=>void load()}>Atualizar negociação e registros</Button>
 </div>;
};
