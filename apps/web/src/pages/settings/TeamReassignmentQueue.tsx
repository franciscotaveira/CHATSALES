import {useEffect,useRef,useState} from 'react';
import {Button} from '@sos-sales/ui';
import {apiClient,type TeamPendingWork,type WorkspaceMember} from '../../services/api-client';
import {userFacingError} from '../../utils/user-facing-error';
function validatePendingPage(value:unknown):{items:TeamPendingWork[];nextCursor:string|null}{
 const page=value as {items?:unknown;nextCursor?:unknown}|null;
 if(!page||!Array.isArray(page.items)||(page.nextCursor!==null&&(typeof page.nextCursor!=='string'||!page.nextCursor.trim()))||(page.nextCursor!==null&&!page.items.length))throw new Error('A consulta não confirmou os dados e a continuação da fila. Atualize as pendências para conferir.');
 const seen=new Set<string>();
 for(const value of page.items){
  const item=value as TeamPendingWork|null;
  if(!item||typeof item!=='object'||typeof item.id!=='string'||!item.id.trim()||!['task','opportunity'].includes(item.kind)||typeof item.title!=='string'||(item.contactName!==null&&typeof item.contactName!=='string')||(item.threadId!==null&&(typeof item.threadId!=='string'||!item.threadId.trim()))||typeof item.changedAt!=='string'||!Number.isFinite(Date.parse(item.changedAt)))throw new Error('A consulta trouxe uma pendência incompleta. Atualize a fila antes de atribuir responsáveis.');
  const identity=`${item.kind}:${item.id}`;if(seen.has(identity))throw new Error('A consulta trouxe pendências repetidas na mesma página. Atualize a fila para conferir.');seen.add(identity);
 }
 return page as {items:TeamPendingWork[];nextCursor:string|null};
}
export function TeamReassignmentQueue({workspaceId,token,members,reloadKey,membersReady=true}:{workspaceId:string;token:string;members:WorkspaceMember[];reloadKey:number;membersReady?:boolean}){
 const [items,setItems]=useState<TeamPendingWork[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[choices,setChoices]=useState<Record<string,string>>({}),[queryReady,setQueryReady]=useState(false),[paginationBlocked,setPaginationBlocked]=useState(false);
 const scope=useRef('');scope.current=`${workspaceId}:${token}`;const generation=useRef(0),locked=useRef(false),seenCursors=useRef(new Set<string>()),loadedPages=useRef(1);
 const refreshControl=useRef<HTMLButtonElement>(null),refreshFocus=useRef<{scope:string;generation:number}|null>(null);
 useEffect(()=>{if(loading||!refreshFocus.current)return;const intent=refreshFocus.current;refreshFocus.current=null;if(intent.scope===scope.current&&intent.generation===generation.current&&(document.activeElement===document.body||document.activeElement===refreshControl.current))refreshControl.current?.focus();},[loading]);
 const key=(item:TeamPendingWork)=>`${item.kind}:${item.id}`;
 const eligible=members.filter(member=>['owner','admin','manager','operator'].includes(member.role));
 async function load(before?:string){
  if(locked.current||(before&&paginationBlocked))return;locked.current=true;setQueryReady(false);setLoading(true);setError('');const requested=scope.current,gen=generation.current;
  try{
   let response=await apiClient.getTeamPendingWork(workspaceId,before,{token});if(requested!==scope.current||gen!==generation.current)return;
   let data=validatePendingPage(response);
   const seen=before?new Set(seenCursors.current):new Set<string>();
   const check=(used?:string)=>{if(data.nextCursor&&(data.nextCursor===used||seen.has(data.nextCursor))){setPaginationBlocked(true);throw new Error('A consulta não confirmou uma continuação válida. Atualize as pendências antes de continuar.');}};
   check(before);
   let records=data.items,pages=1;
   if(before)seen.add(before);
   while(!before&&pages<loadedPages.current&&data.nextCursor){
    const next=data.nextCursor;seen.add(next);
    response=await apiClient.getTeamPendingWork(workspaceId,next,{token});if(requested!==scope.current||gen!==generation.current)return;
    data=validatePendingPage(response);
    check(next);records=Array.from(new Map([...records,...data.items].map(item=>[key(item),item])).values());pages++;
   }
   seenCursors.current=seen;loadedPages.current=before?loadedPages.current+1:pages;
   setQueryReady(true);setPaginationBlocked(false);setItems(prev=>Array.from(new Map([...(before?prev:[]),...records].map(item=>[key(item),item])).values()));setCursor(data.nextCursor);
  }
  catch(err){if(requested===scope.current&&gen===generation.current)setError(userFacingError(err,'Não foi possível consultar pendências sem responsável.'));}
  finally{if(requested===scope.current&&gen===generation.current){locked.current=false;setLoading(false);}}
 }
 useEffect(()=>{generation.current++;locked.current=false;setItems([]);setCursor(null);setQueryReady(false);setPaginationBlocked(false);seenCursors.current.clear();loadedPages.current=1;setChoices({});setNotice('');setError('');setBusy(false);void load();return()=>{generation.current++;};},[workspaceId,token,reloadKey]);
 async function assign(item:TeamPendingWork){
  const assignee=choices[key(item)];if(locked.current||!queryReady||!membersReady||!eligible.some(member=>member.userId===assignee))return;locked.current=true;setBusy(true);setError('');setNotice('');const requested=scope.current,gen=generation.current;
  try{const result=await apiClient.assignTeamPendingWork(workspaceId,{id:item.id,kind:item.kind,assigneeUserId:assignee!},{token});if(requested!==scope.current||gen!==generation.current)return;if(result?.success!==true)throw new Error('A atribuição não foi confirmada pelo servidor. Atualize as pendências para conferir antes de repetir.');setItems(prev=>prev.filter(known=>key(known)!==key(item)));setNotice(`Responsável atribuído a ${item.title}. Nenhuma mensagem foi enviada ao cliente.`);}
  catch(err){if(requested===scope.current&&gen===generation.current){setQueryReady(false);setError(userFacingError(err,'Não foi possível atribuir o responsável. Atualize para conferir.'));}}
  finally{if(requested===scope.current&&gen===generation.current){locked.current=false;setBusy(false);}}
 }
 return <section aria-label="Pendências sem responsável" style={{padding:20,border:'1px solid var(--border-default)',borderRadius:12,minWidth:0,display:'grid',gap:12}}>
  <h3 style={{margin:0}}>Pendências sem responsável</h3><p style={{margin:0}}>Tarefas e oportunidades abertas, incluindo as liberadas após remoção de acesso. Mais recentemente alteradas primeiro. Atribua a uma pessoa da equipe para continuar o trabalho.</p>
  <Button ref={refreshControl} disabled={loading||busy} onClick={()=>{if(document.activeElement===refreshControl.current)refreshFocus.current={scope:scope.current,generation:generation.current};void load();}}>Atualizar pendências</Button>
  {loading&&<p role="status">Consultando pendências…</p>}{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {items.length>0&&!queryReady&&!loading&&<p role="status">As pendências exibidas são da última consulta concluída. Atualize a lista antes de atribuir responsáveis.</p>}
  {!membersReady&&<p role="status">A lista da equipe ainda não foi confirmada. Use Atualizar equipe antes de atribuir responsáveis.</p>}
  {membersReady&&!eligible.length&&<p role="status">Nenhum integrante com acesso operacional está disponível nesta lista. Revise a equipe antes de atribuir.</p>}
  {!loading&&!error&&!items.length&&<p>{cursor?'Nenhuma pendência nas páginas já consultadas. Ainda há páginas anteriores para carregar.':'Nenhuma pendência sem responsável nesta consulta.'}</p>}
  {items.length>0&&<p role="status">{items.length} pendência(s) carregada(s){cursor?' · Há páginas anteriores.':''}</p>}
  {items.map(item=><article key={key(item)} aria-label={`${item.kind==='task'?'Tarefa':'Oportunidade'} ${item.title} · ${item.contactName??'Contato sem nome'}`} style={{display:'grid',gap:8,borderTop:'1px solid var(--border-default)',paddingTop:12,overflowWrap:'anywhere',minWidth:0}}>
    <strong>{item.kind==='task'?'Tarefa':'Oportunidade'} · {item.title}</strong><span>{item.contactName??'Contato sem nome'} · Aberta</span>
    <label style={{display:'grid',gap:6}}>Novo responsável · {item.title}<select aria-label={`Novo responsável de ${item.title}`} value={choices[key(item)]??''} disabled={loading||busy||!queryReady||!membersReady} onChange={event=>setChoices(prev=>({...prev,[key(item)]:event.target.value}))} style={{width:'100%',minWidth:0,minHeight:40}}><option value="">Escolha uma pessoa</option>{eligible.map(member=><option key={member.userId} value={member.userId}>{member.name} ({member.email})</option>)}</select></label>
    <Button disabled={loading||busy||!queryReady||!membersReady||!eligible.some(member=>member.userId===choices[key(item)])} onClick={()=>void assign(item)}>Atribuir responsável</Button>
  </article>)}
  {cursor&&<Button disabled={loading||busy||paginationBlocked} onClick={()=>void load(cursor)}>Carregar pendências anteriores</Button>}
 </section>;
}
