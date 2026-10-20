import {readAiTestList,readAiTestRun} from './ai-test-results';
import {useEffect,useRef,useState} from 'react';
import type {AiRevisionTestList,AiRevisionTestRun} from '@sos-sales/contracts';
import {Button} from '@sos-sales/ui';
import {apiClient} from '../../services/api-client';
import {userFacingError} from '../../utils/user-facing-error';
export function AiRevisionTests({workspaceId,token,revision,dirty,onUnsavedChange,onBusyChange,interactionLocked=false}:{workspaceId:string;token:string;revision:number;dirty:boolean;onUnsavedChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void;interactionLocked?:boolean}){
 const [data,setData]=useState<AiRevisionTestList|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[reload,setReload]=useState(0),[loaded,setLoaded]=useState('');
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [queryConfirmed,setQueryConfirmed]=useState(false);
 const errorRef=useRef<HTMLParagraphElement>(null);
 useEffect(()=>{if(error)errorRef.current?.focus();},[error]);
 const focusResult=useRef<string|null>(null),resultElements=useRef<Record<string,HTMLDivElement|null>>({});
 useEffect(()=>{const id=focusResult.current;if(id&&resultElements.current[id]){resultElements.current[id]?.focus();focusResult.current=null;}},[data]);
 const scope=useRef('');scope.current=`${workspaceId}:${token}:${revision}`;
 const request=useRef<symbol|null>(null),keys=useRef<Record<string,string>>({}),keyScope=useRef('');
 useEffect(()=>{let live=true;const current=scope.current;if(keyScope.current!==current)setData(null);setQueryConfirmed(false);setLoaded('');setError('');setBusy('');if(keyScope.current!==current){focusResult.current=null;setNotes({});keys.current={};keyScope.current=current;}request.current=null;
 if(!revision){setLoaded(current);return;}
 void apiClient.getAiRevisionTests(workspaceId,revision,{token}).then(value=>{if(live&&scope.current===current){setData(readAiTestList(value,revision));setQueryConfirmed(true);setLoaded(current);}}).catch(err=>{if(live&&scope.current===current){setError(userFacingError(err,'Não foi possível carregar os testes.'));setLoaded(current);}});
 return()=>{live=false;};},[workspaceId,token,revision,reload]);
 const localUnsaved=Object.entries(notes).some(([id,note])=>note.trim()!==(data?.runs.find(run=>run.id===id)?.qualityReview?.note??'').trim());
 useEffect(()=>{onUnsavedChange?.(localUnsaved);},[localUnsaved,onUnsavedChange]);
 useEffect(()=>{onBusyChange?.(Boolean(busy));},[busy,onBusyChange]);
 useEffect(()=>()=>{onUnsavedChange?.(false);onBusyChange?.(false);},[onUnsavedChange,onBusyChange]);
 function merge(run:AiRevisionTestRun){setData(prev=>prev?{...prev,runs:[run,...prev.runs.filter(item=>item.id!==run.id)]}:prev);}
 const hasUnsavedReview=(run:AiRevisionTestRun|undefined)=>Boolean(run&&notes[run.id]!==undefined&&notes[run.id]!.trim()!==(run.qualityReview?.note??"" ).trim());
 async function act(scenarioId:string,run?:AiRevisionTestRun,verdict?:'adequate'|'needs_changes'){
 if(interactionLocked||request.current||dirty||!queryConfirmed||data?.currentRevision!==revision||(!run&&hasUnsavedReview(data?.runs.find(item=>item.scenarioId===scenarioId))))return;
 const current=scope.current,id=Symbol();request.current=id;setBusy(scenarioId);setError('');
 try{
 let result:AiRevisionTestRun;
 if(run&&verdict)result=await apiClient.reviewAiRevisionTest(workspaceId,run.id,{expectedRevision:revision,expectedReviewRevision:run.reviewRevision,verdict,note:notes[run.id]?.trim()??''},{token});
 else {const requestKey=keys.current[scenarioId]??crypto.randomUUID();keys.current[scenarioId]=requestKey;result=await apiClient.runAiRevisionTest(workspaceId,{expectedRevision:revision,scenarioId,requestKey},{token});}
 if(scope.current!==current||request.current!==id)return;
 readAiTestRun(result,revision,scenarioId,run?.id);focusResult.current=result.id;merge(result);if(!run&&result.status!=='running')delete keys.current[scenarioId];
 }catch(err){if(scope.current===current&&request.current===id)setError(userFacingError(err,'Não foi possível concluir. Atualize os resultados antes de tentar novamente.'));}
 finally{if(scope.current===current&&request.current===id){request.current=null;setBusy('');}}
 }
 const unavailable=interactionLocked||dirty||!queryConfirmed||!!busy||loaded!==scope.current||data?.currentRevision!==revision;
 const retained=keyScope.current===scope.current?data:null;
 return <section aria-label="Testes da revisão salva" style={{border:'1px solid var(--border-default)',borderRadius:12,padding:16,minWidth:0,overflowWrap:'anywhere'}}>
 <h3>Testes da revisão salva{revision?` · ${revision}`:''}</h3>
 <p>Execute um cenário por vez com o provedor configurado. Pode consumir créditos. O teste registra a resposta e as intenções da IA; ações como transferência, cobrança e agendamento precisam de verificação operacional separada.</p>
 {!revision&&<p>Salve um rascunho operacional para iniciar.</p>}
 {dirty&&<p role="status">Há alterações no formulário. Salve a revisão antes de executar ou avaliar estes testes.</p>}
 {error&&<p ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
 {busy&&<p role="status">Processando o cenário selecionado…</p>}
 {revision>0&&<Button disabled={interactionLocked||!!busy||localUnsaved||loaded!==scope.current} onClick={()=>{if(localUnsaved||interactionLocked||request.current)return;setReload(value=>value+1);}}>Atualizar resultados</Button>}
 {loaded!==scope.current&&<p role="status">Carregando testes…</p>}
 {retained&&!queryConfirmed&&<p role="status">Os resultados exibidos são da última consulta concluída. Aguarde uma consulta válida antes de executar ou avaliar cenários.</p>}
 {retained&&retained.currentRevision!==revision&&<p role="alert">Existe uma revisão mais recente. Seu formulário está preservado; consulte a revisão salva antes de continuar.</p>}
 {retained?.scenarios.map(scenario=>{
 const run=retained.runs.find(item=>item.scenarioId===scenario.id),note=run?(notes[run.id]??''):'';
 return <article key={scenario.id} aria-label={scenario.title} style={{borderTop:'1px solid var(--border-default)',paddingTop:12,marginTop:16}}>
 <h4>{scenario.title}</h4><p><strong>Pergunta:</strong> {scenario.question}</p><p><strong>Esperado:</strong> {scenario.expected}</p>
 <Button disabled={unavailable||run?.status==='running'||hasUnsavedReview(run)} onClick={()=>void act(scenario.id)}>{busy===scenario.id?'Processando…':run?.status==='running'?'Em andamento':run?'Executar novamente':'Executar cenário'}</Button>
 {hasUnsavedReview(run)&&<div role="status"><p>Há um comentário de avaliação não registrado para esta resposta. Registre a avaliação ou descarte o comentário antes de executar o cenário novamente ou atualizar os resultados.</p><Button disabled={unavailable} onClick={()=>{if(!run||unavailable)return;setNotes(previous=>{const next={...previous};delete next[run.id];return next;});resultElements.current[run.id]?.querySelector("textarea")?.focus();}}>Descartar comentário não registrado</Button></div>}
 {run&&<div tabIndex={-1} aria-label={`Resultado · ${scenario.title}`} ref={node=>{resultElements.current[run.id]=node;}}><p>Execução: {run.status==='completed'?'resposta recebida':run.status==='running'?'em andamento':'não concluída'} · Revisão {run.revision} · {new Date(run.createdAt).toLocaleString('pt-BR')}</p>
 {run.isSynthetic&&<strong>SIMULADO — resultado de demonstração, sem homologação de provedor.</strong>}
 {run.failureMessage&&<p role="status">{run.failureMessage}</p>}
 {run.replyText&&<p style={{whiteSpace:'pre-wrap'}}>{run.replyText}</p>}
 {run.provider&&<p>Provedor: {run.provider} · Modelo: {run.model}</p>}
 {run.checks.map(check=><p key={check.id}><strong>{check.label}:</strong> {check.status==='passed'?'verificado':check.status==='failed'?'falhou':'não verificado'}{check.detail?` — ${check.detail}`:''}</p>)}
 {run.status==='completed'&&<><p>A avaliação abaixo registra somente a qualidade da resposta. Não aprova ações nem libera atendimento automático.</p>
 {run.qualityReview&&<p>Avaliação registrada: {run.qualityReview.verdict==='adequate'?'resposta adequada':'precisa de ajustes'} — {run.qualityReview.note}</p>}
 <label htmlFor={`review-${run.id}`}>Observação sobre a resposta · {scenario.title}</label><textarea id={`review-${run.id}`} disabled={unavailable} aria-describedby={`review-help-${run.id}`} rows={3} maxLength={2000} value={note} onChange={event=>setNotes(prev=>({...prev,[run.id]:event.target.value}))} style={{display:'block',width:'100%',boxSizing:'border-box',margin:'8px 0'}}/>
 <p id={`review-help-${run.id}`} style={{fontSize:12}}>Explique sua avaliação com pelo menos 10 caracteres. {note.length}/2000 caracteres.</p>
 <div style={{display:'flex',flexWrap:'wrap',gap:8}}><Button disabled={unavailable||note.trim().length<10} onClick={()=>void act(scenario.id,run,'adequate')}>Resposta adequada</Button><Button disabled={unavailable||note.trim().length<10} onClick={()=>void act(scenario.id,run,'needs_changes')}>Precisa de ajustes</Button></div></>}
 </div>}
 </article>;
 })}
 </section>;
}
