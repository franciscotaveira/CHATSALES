import {useEffect,useRef,useState,useId} from 'react';
import {Dialog,Button,LoadingState} from '@sos-sales/ui';
import {apiClient,type BroadcastRecipientPage,type BroadcastRecipientSummary} from '../../services/api-client';
import {userFacingError} from '../../utils/user-facing-error';

interface Props {workspaceId:string;token:string;campaignId:string;campaignName:string;onClose:()=>void;}
const labels:Record<string,string>={queued:'Na fila',sent:'Enviada',delivered:'Entregue',read:'Lida',replied:'Resposta registrada',clicked:'Clique registrado',failed:'Falha',blocked:'Bloqueada',uncertain:'Resultado não confirmado'};
const date=(value:string)=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('pt-BR'):'Horário inválido no registro';
type RecipientGroup='ALL'|'ATTENTION'|'PENDING'|'CONFIRMED';
type Filters={search:string;group:RecipientGroup};
const groupLabels:Record<RecipientGroup,string>={ALL:'Todos os estados',ATTENTION:'Precisam de atenção',PENDING:'Na fila',CONFIRMED:'Com envio confirmado'};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
function readRecipientPage(value:unknown):BroadcastRecipientPage{
 const invalid=()=>new Error('A consulta não confirmou os registros e contadores dos destinatários. Tente consultar novamente; os registros anteriores foram preservados.');
 if(!record(value)||!record(value.campaign)||!Array.isArray(value.recipients)||!record(value.pagination))throw invalid();
 const campaign=value.campaign,pagination=value.pagination;
 if(typeof campaign.id!=='string'||!campaign.id.trim()||typeof campaign.name!=='string'||['totalTargeted','totalRecorded','totalMatching'].some(key=>typeof campaign[key]!=='number'||!Number.isSafeInteger(campaign[key])||(campaign[key] as number)<0))throw invalid();
 if(typeof pagination.hasMore!=='boolean'||(pagination.nextCursor!=null&&(typeof pagination.nextCursor!=='string'||!pagination.nextCursor.trim()))||(pagination.hasMore&&!pagination.nextCursor))throw invalid();
 for(const row of value.recipients){
  if(!record(row)||['id','phoneE164','status','variant'].some(key=>typeof row[key]!=='string'||!(row[key] as string).trim())||['name','reason','sentAt','deliveredAt','readAt','repliedAt','clickedAt'].some(key=>row[key]!=null&&typeof row[key]!=='string'))throw invalid();
 }
 return value as unknown as BroadcastRecipientPage;
}
export function CampaignRecipientsDialog(props:Props){return <RecipientReview key={JSON.stringify([props.workspaceId,props.token,props.campaignId])} {...props}/>;}
function RecipientReview(props:Props){
 const [search,setSearch]=useState(''),[group,setGroup]=useState<RecipientGroup>('ALL'),[applied,setApplied]=useState<Filters>({search:'',group:'ALL'});
 const searchId=useId(),groupId=useId(),searchInput=useRef<HTMLInputElement>(null);
 return <Dialog isOpen onClose={props.onClose} title="Destinatários da campanha" description="Consulte os registros de processamento e as confirmações disponíveis, sem reenviar mensagens.">
  <div style={{display:'grid',gap:12,overflowWrap:'anywhere'}}>
   <form onSubmit={event=>{event.preventDefault();setApplied({search:search.trim(),group});}} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
    <label htmlFor={searchId} style={{display:'grid',gap:4,flex:'1 1 200px'}}>Nome ou telefone<input ref={searchInput} id={searchId} type="search" maxLength={120} value={search} onChange={e=>setSearch(e.target.value)} style={{width:'100%',boxSizing:'border-box',minHeight:40}}/></label>
    <label htmlFor={groupId} style={{display:'grid',gap:4,flex:'1 1 180px'}}>Situação<select id={groupId} value={group} onChange={e=>setGroup(e.target.value as RecipientGroup)} style={{width:'100%',minHeight:40}}>{Object.entries(groupLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <Button type="submit">Buscar destinatários</Button>
    {(search||group!=='ALL'||applied.search||applied.group!=='ALL')&&<Button type="button" variant="secondary" onClick={()=>{setSearch('');setGroup('ALL');setApplied({search:'',group:'ALL'});searchInput.current?.focus();}}>Limpar filtros</Button>}
   </form>
   <p>Filtros aplicados: {groupLabels[applied.group]}{applied.search?` · ${applied.search}`:''}. A busca consulta todos os registros da campanha, inclusive os ainda não carregados.</p>
   <RecipientEvidence key={JSON.stringify([applied.search,applied.group])} {...props} filters={applied}/>
   <Button variant="secondary" onClick={props.onClose}>Fechar</Button>
  </div>
 </Dialog>;
}
function RecipientEvidence({workspaceId,token,campaignId,campaignName,filters}:Props&{filters:Filters}){
 const [rows,setRows]=useState<BroadcastRecipientSummary[]>([]),[campaign,setCampaign]=useState<BroadcastRecipientPage['campaign']|null>(null),[cursor,setCursor]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[checkedAt,setCheckedAt]=useState<Date|null>(null);
 const live=useRef(true),lock=useRef(false),range=useRef(0),seen=useRef(new Set<string>());
 const refreshButton=useRef<HTMLButtonElement>(null),restoreRefreshFocus=useRef(false);
 useEffect(()=>{
  if(busy||!restoreRefreshFocus.current)return;
  restoreRefreshFocus.current=false;
  if(document.activeElement===document.body||document.activeElement===refreshButton.current)refreshButton.current?.focus();
 });
 const load=async(more=false)=>{
  if(!live.current||lock.current||(more&&(!cursor||error)))return;lock.current=true;setBusy(true);setError('');
  try{
   const target=more?1:Math.max(1,range.current),collected=new Map<string,BroadcastRecipientSummary>(),used=more?new Set(seen.current):new Set<string>();
   let next=more?cursor:null,page:BroadcastRecipientPage|undefined,complete=false;
   for(let index=0;index<Math.ceil(target/50)+1;index++){
    if(next)used.add(next);
    const response=await apiClient.getBroadcastRecipients(workspaceId,campaignId,{token},next??undefined,filters.search||filters.group!=='ALL'?{search:filters.search||undefined,group:filters.group}:undefined);if(!live.current)return;
    page=readRecipientPage(response);
    if(page.campaign.id!==campaignId)throw new Error('A consulta retornou outra campanha. Feche e consulte novamente.');
    for(const row of page.recipients)collected.set(row.id,row);
    next=page.pagination.hasMore?page.pagination.nextCursor:null;
    if(page.pagination.hasMore&&(!next||used.has(next)))throw new Error('A paginação não avançou. Atualize a consulta; os registros anteriores foram preservados.');
    if(collected.size>=target||!next){complete=true;break;}
   }
   if(!complete||!page)throw new Error('Não foi possível atualizar todos os registros carregados. Tente novamente.');
   setRows(previous=>{const merged=more?new Map(previous.map(row=>[row.id,row])):new Map<string,BroadcastRecipientSummary>();for(const row of collected.values())merged.set(row.id,row);range.current=merged.size;return [...merged.values()];});
   seen.current=used;setCampaign(page.campaign);setCursor(next);setCheckedAt(new Date());
  }catch(e){if(live.current)setError(userFacingError(e,'Não foi possível consultar os destinatários. Os registros anteriores foram preservados.'));}
  finally{if(live.current){lock.current=false;setBusy(false);}}
 };
 useEffect(()=>{live.current=true;void load();return()=>{live.current=false;};},[]);
 return <div style={{display:'grid',gap:12,overflowWrap:'anywhere'}}>
   <strong>{campaign?.name||campaignName}</strong>
   <p>Esta lista mostra destinatários registrados no processamento. Um contato apenas incluído no público pode ainda não ter registro aqui. Ausência de confirmação não comprova entrega nem falha.</p>
   {campaign&&<p>Público da campanha: {campaign.totalTargeted}. Registros disponíveis nesta consulta: {campaign.totalRecorded}. Correspondem aos filtros: {campaign.totalMatching}. Carregados: {rows.length}.</p>}
   {checkedAt&&<p role="status">{busy?'Atualizando; os registros exibidos pertencem à consulta anterior.':error?'Os registros exibidos podem estar desatualizados.':`Consulta concluída às ${checkedAt.toLocaleTimeString('pt-BR')}.`}</p>}
   {error&&<p role="alert">{error}</p>}
   <Button ref={refreshButton} variant="secondary" disabled={busy} onClick={()=>{if(lock.current||!live.current)return;restoreRefreshFocus.current=document.activeElement===refreshButton.current;void load();}}>{error?'Tentar consultar novamente':'Atualizar destinatários'}</Button>
   {busy&&!checkedAt?<LoadingState variant="spinner" text="Consultando destinatários…"/>:checkedAt&&rows.length===0&&!error?<p>{filters.search||filters.group!=='ALL'?'Nenhum destinatário corresponde aos filtros aplicados nesta consulta.':'Nenhum destinatário foi registrado nesta campanha até esta consulta.'}</p>:null}
   {rows.map(row=><article key={row.id} aria-label={`Destinatário ${row.phoneE164}`} style={{border:'1px solid var(--border-default)',borderRadius:8,padding:12,display:'grid',gap:6}}>
    <strong>{row.name||'Nome não informado'} · {row.phoneE164}</strong><span>Variante {row.variant} · {Object.prototype.hasOwnProperty.call(labels,row.status)?labels[row.status]:'Estado não reconhecido'}</span>
    {row.reason&&<p>{row.reason}</p>}
    {([['Envio confirmado',row.sentAt],['Entrega confirmada',row.deliveredAt],['Leitura confirmada',row.readAt],['Resposta registrada',row.repliedAt],['Clique registrado',row.clickedAt]] as const).map(([label,value])=>value?<span key={label}>{label}: {date(value)}</span>:null)}
    {!row.sentAt&&!row.deliveredAt&&!row.readAt&&<span>Sem confirmação de envio, entrega ou leitura neste registro.</span>}
    {['failed','uncertain','blocked'].includes(row.status)&&<p>Revise a pendência antes de decidir outra ação. Esta consulta não repete o envio.</p>}
   </article>)}
   {cursor&&<Button variant="secondary" disabled={busy||Boolean(error)} onClick={()=>void load(true)}>Carregar mais destinatários</Button>}
  </div>;
}
