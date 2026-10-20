import crypto from 'node:crypto';
import {withTenantTransaction} from '@sos-sales/database';
import {aiRevisionScenarios,aiTextVerifierVersion,type AiTestCheck,type AiRevisionTestRun,type GuidedRecord} from '@sos-sales/contracts';
import {AiDraftError,getAiSimulationBase} from './ai-config-drafts';
import type {AiDraftConfig} from './ai-config-schema';
import {simulateAiText} from './ai-agent-simulation';
type Client=Parameters<Parameters<typeof withTenantTransaction>[1]>[0];
type Row=Record<string,any>;
const hash=(value:unknown)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function lock(client:Client,workspace:string){await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`ai-tests:${workspace}`]);}
async function version(client:Client,workspace:string,revision:number){
 const head=(await client.query('SELECT draft_revision FROM ai_agent_version_heads WHERE workspace_id=$1',[workspace])).rows[0];
 const saved=(await client.query<{config:AiDraftConfig;guided_snapshot:GuidedRecord|null}>('SELECT config,guided_snapshot FROM ai_agent_versions WHERE workspace_id=$1 AND revision=$2',[workspace,revision])).rows[0];
 if(!saved)throw new AiDraftError(404,'Salve um rascunho operacional antes de testar.');
 return {...saved,currentRevision:head?.draft_revision??0};
}
async function getRun(client:Client,workspace:string,id:string){
 return (await client.query<Row>(`SELECT r.*, (SELECT row_to_json(q) FROM (SELECT review_revision AS revision,verdict,note,reviewed_at AS "reviewedAt" FROM ai_revision_test_reviews WHERE workspace_id=r.workspace_id AND run_id=r.id ORDER BY review_revision DESC LIMIT 1) q) quality_review FROM ai_revision_test_runs r WHERE r.workspace_id=$1 AND r.id=$2`,[workspace,id])).rows[0];
}
function dto(row:Row):AiRevisionTestRun{
 const expired=row.status==='running'&&new Date(row.lease_expires_at).getTime()<=Date.now();
 return {id:row.id,revision:row.revision,scenarioId:row.scenario_id,title:row.title,question:row.question,expected:row.expected,status:expired?'failed':row.status,replyText:row.reply_text,checks:row.checks,
 needsHandoff:row.intent?.needsHandoff===true,offerPixProductId:row.intent?.offerPixProductId??null,provider:row.provider,model:row.model,createdAt:new Date(row.created_at).toISOString(),completedAt:row.completed_at?new Date(row.completed_at).toISOString():null,
 failureMessage:expired?'Teste interrompido. Inicie uma nova execução.':row.failure_message,isSynthetic:row.is_synthetic,reviewRevision:row.review_revision,qualityReview:row.quality_review??null,catalogSnapshot:row.catalog_snapshot};
}
export async function listAiRevisionTests(workspace:string,revision:number){
 return withTenantTransaction(workspace,async client=>{
 const saved=await version(client,workspace,revision);
 const ids=(await client.query<{id:string}>('SELECT id FROM ai_revision_test_runs WHERE workspace_id=$1 AND revision=$2 ORDER BY created_at DESC,id DESC LIMIT 100',[workspace,revision])).rows;
 const runs:AiRevisionTestRun[]=[];for(const item of ids)runs.push(dto((await getRun(client,workspace,item.id))!));
 return {revision,currentRevision:saved.currentRevision,verifierVersion:aiTextVerifierVersion,scenarios:aiRevisionScenarios(saved.config,saved.guided_snapshot),runs};
 });
}
export async function runAiRevisionTest(workspace:string,actor:string,input:{expectedRevision:number;scenarioId:string;requestKey:string}){
 const claim=await withTenantTransaction(workspace,async client=>{
 await lock(client,workspace);
 await client.query(`UPDATE ai_revision_test_runs SET status='failed',failure_code='interrupted',failure_message='Teste interrompido. Inicie uma nova execução.',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND status='running' AND lease_expires_at<=clock_timestamp()`,[workspace]);
 const existing=(await client.query<{id:string}>('SELECT id FROM ai_revision_test_runs WHERE workspace_id=$1 AND request_key=$2',[workspace,input.requestKey])).rows[0];
 if(existing){const run=(await getRun(client,workspace,existing.id))!;if(run.revision!==input.expectedRevision||run.scenario_id!==input.scenarioId)throw new AiDraftError(409,'Este identificador já pertence a outro teste.');return {existing:dto(run)};}
 const saved=await version(client,workspace,input.expectedRevision);
 if(saved.currentRevision!==input.expectedRevision)throw new AiDraftError(409,'O rascunho mudou. Carregue a revisão atual antes de testar.');
 const scenario=aiRevisionScenarios(saved.config,saved.guided_snapshot).find(item=>item.id===input.scenarioId);
 if(!scenario)throw new AiDraftError(400,'Cenário não pertence à revisão selecionada.');
 if((await client.query("SELECT id FROM ai_revision_test_runs WHERE workspace_id=$1 AND status='running'",[workspace])).rows.length)throw new AiDraftError(409,'Há um teste em andamento nesta empresa. Atualize os resultados antes de iniciar outro.');
 const id=crypto.randomUUID(),lease=crypto.randomUUID();
 await client.query(`INSERT INTO ai_revision_test_runs(id,workspace_id,revision,scenario_id,title,question,expected,verifier_version,configuration_hash,request_key,actor_id,status,lease_token,lease_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'running',$12,clock_timestamp()+interval '2 minutes')`,[id,workspace,input.expectedRevision,scenario.id,scenario.title,scenario.question,scenario.expected,aiTextVerifierVersion,hash(saved.config),input.requestKey,actor,lease]);
 return {id,lease,scenario};
 });
 if(claim.existing)return claim.existing;
 let result:Awaited<ReturnType<typeof simulateAiText>>|undefined;let failure:string|undefined;
 try{const base=await getAiSimulationBase(workspace,input.expectedRevision);result=await simulateAiText(workspace,base,{message:claim.scenario!.question});}
 catch(error){failure=error instanceof AiDraftError&&error.status===422?'Chave do provedor não configurada.':error instanceof AiDraftError&&error.status===409?'A revisão mudou antes da execução.':'Não foi possível concluir o teste. Verifique a configuração e tente novamente.';}
 const checks:AiTestCheck[]=result?[
 {id:'response',label:'Resposta textual recebida',status:result.replyText.trim()?'passed':'failed'},
 {id:'content',label:'Exatidão e adequação da resposta',status:'not_verified',detail:'Exige avaliação humana das informações e do comportamento esperado.'},
 {id:'pix-permission',label:'Intenção de cobrança respeita a permissão',status:!result.offerPixProductId||result.capabilities.pixCharges?'passed':'failed',detail:'Verifica a intenção textual, sem gerar cobrança.'},
 {id:'pix-quantity',label:'Quantidade do resumo válida',status:!result.offerPixProductId||(Number.isInteger(result.offerPixQuantity)&&result.offerPixQuantity!>=1&&result.offerPixQuantity!<=999)?'passed':'failed'},
 {id:'pix-source',label:'Produto da intenção pertence ao contexto consultado',status:!result.offerPixProductId||result.catalogSnapshot.some(item=>item.id===result.offerPixProductId)?'passed':'failed'},
 {id:'actions',label:'Execução de ações operacionais',status:'not_verified',detail:'Este teste gera texto e intenções; não transfere, cobra, agenda ou registra conversões.'},
 ...(claim.scenario!.id==='human'?[{id:'handoff-intent',label:'Solicita encaminhamento humano',status:result.needsHandoff?'passed' as const:'failed' as const,detail:'Verifica a intenção no retorno do modelo, sem comprovar a transferência.'}]:[]),
 ...(['receipt','payments'].includes(claim.scenario!.id)?[{id:'no-charge-intent',label:'Não solicita cobrança neste cenário',status:result.offerPixProductId?'failed' as const:'passed' as const}]:[]),
 ]:[];
 return withTenantTransaction(workspace,async client=>{
 await lock(client,workspace);
 await client.query(`UPDATE ai_revision_test_runs SET status=$4,reply_text=$5,checks=$6::jsonb,intent=$7::jsonb,provider=$8,model=$9,catalog_snapshot=$10::jsonb,sources_hash=$11,failure_code=$12,failure_message=$13,completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND lease_token=$3 AND status='running' AND lease_expires_at>clock_timestamp()`,[workspace,claim.id,claim.lease,result?'completed':'failed',result?.replyText??null,JSON.stringify(checks),JSON.stringify({needsHandoff:result?.needsHandoff??false,offerPixProductId:result?.offerPixProductId??null,offerPixQuantity:result?.offerPixQuantity??null}),result?.provider??null,result?.model??null,JSON.stringify(result?.catalogSnapshot??[]),result?hash(result.catalogSnapshot):null,failure?'execution_failed':null,failure??null]);
 return dto((await getRun(client,workspace,claim.id!))!);
 });
}
export async function reviewAiRevisionTest(workspace:string,actor:string,id:string,input:{expectedRevision:number;expectedReviewRevision:number;verdict:'adequate'|'needs_changes';note:string}){
 return withTenantTransaction(workspace,async client=>{
 await lock(client,workspace);const run=await getRun(client,workspace,id);if(!run)throw new AiDraftError(404,'Teste não encontrado.');
 const saved=await version(client,workspace,input.expectedRevision);
 if(run.revision!==input.expectedRevision||saved.currentRevision!==input.expectedRevision)throw new AiDraftError(409,'A revisão mudou. Avalie um teste da configuração atual.');
 if(run.status!=='completed')throw new AiDraftError(409,'Somente uma resposta concluída pode receber avaliação de qualidade.');
 if(run.review_revision!==input.expectedReviewRevision)throw new AiDraftError(409,'Outra avaliação foi salva. Atualize os resultados antes de revisar.');
 const latest=(await client.query<{id:string}>('SELECT id FROM ai_revision_test_runs WHERE workspace_id=$1 AND revision=$2 AND scenario_id=$3 ORDER BY created_at DESC,id DESC LIMIT 1',[workspace,run.revision,run.scenario_id])).rows[0];
 if(latest?.id!==id)throw new AiDraftError(409,'Existe uma execução mais recente deste cenário. Avalie o resultado atual.');
 const next=run.review_revision+1;
 await client.query('INSERT INTO ai_revision_test_reviews(workspace_id,run_id,review_revision,verdict,note,reviewed_by) VALUES($1,$2,$3,$4,$5,$6)',[workspace,id,next,input.verdict,input.note,actor]);
 await client.query('UPDATE ai_revision_test_runs SET review_revision=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2',[workspace,id,next]);
 return dto((await getRun(client,workspace,id))!);
 });
}
