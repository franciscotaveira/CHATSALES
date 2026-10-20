import {withTenantTransaction,decryptPayload,parseKeyringFromEnv,recordSecurityAuditEvent} from '@sos-sales/database';
import {hasWorkspacePermission,META_GRAPH_API_VERSION} from '@sos-sales/contracts';
import {safeFetchWithSsrfGuard} from '@sos-sales/application';
type Client=Parameters<Parameters<typeof withTenantTransaction>[1]>[0];
const fail=(statusCode:number,message:string)=>Object.assign(new Error(message),{statusCode});
const fields="ch.id,ch.provider,ch.status,ch.is_active,ch.credential_id,(extract(epoch FROM ch.updated_at)*1000000)::numeric(30,0)::text AS revision,pc.encrypted_payload,pc.iv,pc.auth_tag,pc.key_version,pc.updated_at::text AS credential_revision,pc.status AS credential_status";
interface Snapshot{id:string;provider:string;status:string;is_active:boolean;credential_id:string|null;revision:string;encrypted_payload:string;iv:string;auth_tag:string;key_version:string;credential_revision:string;credential_status:string;}
async function manager(client:Client,ws:string,actor:string){const m=(await client.query<{role:string}>('SELECT role FROM public.workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE',[ws,actor])).rows[0];if(!m||!hasWorkspacePermission(m.role,'workspace:manage'))throw fail(403,'Seu acesso de gestão mudou. Atualize o perfil.');}
async function snapshot(client:Client,ws:string,id:string,lock=false){return (await client.query<Snapshot>(`SELECT ${fields} FROM public.channel_instances ch LEFT JOIN public.provider_credentials pc ON pc.id=ch.credential_id AND pc.workspace_id=ch.workspace_id WHERE ch.workspace_id=$1 AND ch.id=$2 ${lock?'FOR UPDATE OF ch':''}`,[ws,id])).rows[0];}
export async function readMetaJson(response:Response){
 if(Number(response.headers.get('content-length'))>262144)throw fail(502,'Resposta da Meta acima do limite. O diagnóstico anterior foi preservado.');
 if(!response.body)throw fail(502,'Resposta vazia da Meta.');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0,expired=false;const timer=setTimeout(()=>{expired=true;void reader.cancel().catch(()=>{});},8000);
 try{for(;;){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>262144){void reader.cancel().catch(()=>{});throw fail(502,'Resposta da Meta acima do limite.');}parts.push(c.value);}if(expired)throw fail(502,'A Meta não concluiu a resposta no prazo.');try{return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;}catch{throw fail(502,'A Meta retornou um formato inválido. O diagnóstico anterior foi preservado.');}}
 finally{clearTimeout(timer);reader.releaseLock();}
}
export async function checkMetaSubscription(ws:string,id:string,actor:string,expectedRevision:string){
 const before=await withTenantTransaction(ws,async c=>{await manager(c,ws,actor);return snapshot(c,ws,id);});
 if(!before)throw fail(404,'Canal não encontrado nesta empresa.');
 if(before.provider!=='meta_waba'||before.status==='revoked')throw fail(409,'Selecione um canal Meta não suspenso para consultar a assinatura.');
 if(before.revision!==expectedRevision)throw fail(409,'O canal mudou. Atualize e revise novamente.');
 if(!before.credential_id||before.credential_status!=='ACTIVE')throw fail(422,'Este canal não tem credenciais Meta ativas. Configure a integração com o responsável técnico.');
 const key=parseKeyringFromEnv()?.keyring||process.env.MCT_CREDENTIALS_MASTER_KEY||process.env.APP_MASTER_KEY||process.env.MASTER_ENCRYPTION_KEY||((process.env.NODE_ENV==='test'||process.env.VITEST)?'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef':undefined);
 if(!key)throw fail(503,'Chave de proteção de credenciais indisponível.');
 let credentials:Record<string,unknown>;try{credentials=JSON.parse(decryptPayload(before.encrypted_payload,before.iv,before.auth_tag,key,{keyVersion:before.key_version}));}catch{throw fail(503,'Não foi possível ler as credenciais protegidas.');}
 const appId=credentials.app_id||process.env.META_APP_ID,waba=credentials.waba_account_id,token=credentials.access_token;
 if(typeof appId!=='string'||!/^\d{5,32}$/.test(appId)||typeof waba!=='string'||!/^\d{5,32}$/.test(waba)||typeof token!=='string'||!token.trim())throw fail(422,'Configure o App ID, a conta WhatsApp Business e o token antes de consultar a assinatura.');
 let result:'confirmed'|'failed'|'uncertain'='uncertain',after:string|undefined;const seen=new Set<string>(),deadline=Date.now()+20000;
 for(let page=0;page<5;page++){
  if(Date.now()>=deadline)break;
  let response:Response;try{response=await safeFetchWithSsrfGuard(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(waba)}/subscribed_apps?limit=100${after?`&after=${encodeURIComponent(after)}`:''}`,{method:'GET',headers:{Authorization:`Bearer ${token}`}},{timeoutMs:Math.min(8000,deadline-Date.now()),allowedProtocols:['https:']});}catch{throw fail(502,'Não foi possível consultar a Meta. O diagnóstico anterior foi preservado; nenhuma assinatura foi repetida.');}
  if(!response.ok)throw fail(502,'A Meta não confirmou a consulta. Revise o acesso; o diagnóstico anterior foi preservado.');
  const data=await readMetaJson(response) as {data?:unknown;paging?:{next?:unknown;cursors?:{after?:unknown}}};
  if(!data||!Array.isArray(data.data)||data.data.length>100)throw fail(502,'A Meta retornou uma lista inválida. O diagnóstico anterior foi preservado.');
  const ids:string[]=[];for(const item of data.data){const value=item?.whatsapp_business_api_data?.id;if(typeof value!=='string'||!/^\d{5,32}$/.test(value))throw fail(502,'A lista da Meta não permite confirmar os aplicativos. O diagnóstico anterior foi preservado.');ids.push(value);}
  if(ids.includes(appId)){result='confirmed';break;}
  if(!data.paging?.next){result='failed';break;}
  const cursor=data.paging?.cursors?.after;if(typeof cursor!=='string'||!cursor||cursor.length>1500||/[\u0000-\u001f]/.test(cursor)||seen.has(cursor))break;seen.add(cursor);after=cursor;
 }
 await withTenantTransaction(ws,async c=>{
  await manager(c,ws,actor);const current=await snapshot(c,ws,id,true);
  if(!current||current.status==='revoked'||current.revision!==before.revision||current.credential_id!==before.credential_id||current.credential_status!=='ACTIVE'||current.credential_revision!==before.credential_revision)throw fail(409,'O canal ou as credenciais mudaram durante a consulta. Nenhum resultado foi aplicado.');
  const credential=(await c.query<{revision:string;status:string}>("SELECT updated_at::text AS revision,status FROM public.provider_credentials WHERE workspace_id=$1 AND id=$2 FOR SHARE",[ws,before.credential_id])).rows[0];
  if(!credential||credential.status!=='ACTIVE'||credential.revision!==before.credential_revision)throw fail(409,'As credenciais mudaram durante a consulta.');
  await c.query("UPDATE public.channel_instances SET meta_subscription_status=$1,meta_subscription_checked_at=clock_timestamp(),is_active=CASE WHEN $1='confirmed' THEN is_active ELSE false END,status=CASE WHEN $1<>'confirmed' AND is_active THEN 'error' ELSE status END,updated_at=clock_timestamp() WHERE workspace_id=$2 AND id=$3",[result,ws,id]);
  await recordSecurityAuditEvent({workspaceId:ws,actorId:actor,actorType:'user',action:'channel.meta_subscription_checked',resourceType:'channel',resourceId:id,metadata:{subscriptionStatus:result,locallyActivated:false}},c);
 });
 return {success:true,subscriptionStatus:result,message:result==='confirmed'?'Aplicativo encontrado na assinatura da conta. O canal não foi ativado; recebimento e envio ainda precisam de teste.':result==='failed'?'O aplicativo não foi encontrado na lista completa. O canal permanece inativo; revise a configuração na Meta.':'A consulta foi parcial. O resultado continua incerto e o canal permanece inativo. Nenhuma assinatura foi repetida.'};
}
