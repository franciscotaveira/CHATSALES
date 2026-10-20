import crypto from "node:crypto";
import {withTenantTransaction,decryptPayload,parseKeyringFromEnv,recordSecurityAuditEvent} from "@sos-sales/database";
import {safeFetchWithSsrfGuard,validateWahaBaseUrl} from "@sos-sales/application";
import {hasWorkspacePermission} from "@sos-sales/contracts";
import {historyPhone} from "./channel-history.js";
type Client=Parameters<Parameters<typeof withTenantTransaction>[1]>[0];
const revision="(extract(epoch FROM ch.updated_at)*1000000)::numeric(30,0)::text";
const fields=`ch.id,ch.workspace_id,ch.provider,ch.status,ch.is_active,ch.phone_number_e164,ch.credential_id,${revision} AS revision,pc.encrypted_payload,pc.iv,pc.auth_tag,pc.key_version,pc.status AS credential_status,pc.updated_at::text AS credential_revision`;
export const connectionError=(statusCode:number,message:string)=>Object.assign(new Error(message),{statusCode});
interface Snapshot {id:string;workspace_id:string;provider:string;status:string;is_active:boolean;phone_number_e164:string|null;credential_id:string|null;revision:string;encrypted_payload:string|null;iv:string;auth_tag:string;key_version:string;credential_status:string|null;credential_revision:string|null;}
interface Context extends Snapshot {baseUrl:string;session:string;sessionKey:string;apiKey?:string;webhookToken?:string;webhookSecret?:string;allowLocal:boolean;}
interface Operation {id:string;action:string;state:string;result:Record<string,unknown>|null;expected_revision:string;expired?:boolean;}
async function manager(client:Client,ws:string,actor:string){const member=(await client.query<{role:string}>("SELECT role FROM public.workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR SHARE",[ws,actor])).rows[0];if(!member||!hasWorkspacePermission(member.role,"workspace:manage"))throw connectionError(403,"Seu acesso de gestão mudou. Atualize o perfil.");}
async function snapshot(client:Client,ws:string,id:string,lock=false){return (await client.query<Snapshot>(`SELECT ${fields} FROM public.channel_instances ch LEFT JOIN public.provider_credentials pc ON pc.id=ch.credential_id AND pc.workspace_id=ch.workspace_id WHERE ch.workspace_id=$1 AND ch.id=$2 ${lock?'FOR UPDATE OF ch':''}`,[ws,id])).rows[0];}
async function current(ctx:Context,actor:string,client:Client,requireRevision=true){await manager(client,ctx.workspace_id,actor);const now=await snapshot(client,ctx.workspace_id,ctx.id,true);if(!now||now.status==='revoked'||(requireRevision&&now.revision!==ctx.revision)||now.phone_number_e164!==ctx.phone_number_e164||now.credential_id!==ctx.credential_id||now.credential_status!=='ACTIVE'||now.credential_revision!==ctx.credential_revision)throw connectionError(409,"O canal ou suas credenciais mudaram durante a consulta. Atualize e revise novamente.");return now;}
async function context(ws:string,id:string,actor:string):Promise<Context>{
 const row=await withTenantTransaction(ws,async client=>{await manager(client,ws,actor);return snapshot(client,ws,id);});
 if(!row)throw connectionError(404,"Canal não encontrado nesta empresa.");
 if(row.provider!=='waha')throw connectionError(422,"Este fluxo de QR Code se aplica somente ao WAHA.");
 if(row.status==='revoked')throw connectionError(409,"Canal suspenso ou arquivado. Revise o cadastro antes de reconectar.");
 if(!row.credential_id||row.credential_status!=='ACTIVE'||!row.encrypted_payload)throw connectionError(422,"Configure as credenciais WAHA antes de consultar ou iniciar a sessão.");
 const key=parseKeyringFromEnv()?.keyring||process.env.MCT_CREDENTIALS_MASTER_KEY||process.env.APP_MASTER_KEY||process.env.MASTER_ENCRYPTION_KEY||((process.env.NODE_ENV==='test'||process.env.VITEST)?'0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef':undefined);
 if(!key)throw connectionError(503,"A chave de proteção de credenciais está indisponível.");
 let credentials:Record<string,unknown>;
 try{credentials=JSON.parse(decryptPayload(row.encrypted_payload,row.iv,row.auth_tag,key,{keyVersion:row.key_version}));}catch{throw connectionError(503,"Não foi possível ler as credenciais protegidas do canal.");}
 const allowLocal=process.env.NODE_ENV==='test'||process.env.NODE_ENV==='development'||process.env.MCT_ALLOW_LOCAL_WAHA==='true';
 if(typeof credentials.base_url!=='string')throw connectionError(422,"O endereço WAHA não foi configurado.");
 let baseUrl:string;try{baseUrl=validateWahaBaseUrl(credentials.base_url,allowLocal);}catch{throw connectionError(422,"Endereço WAHA inválido ou não permitido.");}
 const session=typeof credentials.session==='string'?credentials.session.trim():'default';
 if(!session||session.length>150||/[\/\\?#\u0000-\u001f]/.test(session))throw connectionError(422,"Nome da sessão WAHA inválido. Revise o cadastro.");
 const sessionKey=crypto.createHash('sha256').update(`${baseUrl}\0${session}`).digest('hex');
 return {...row,baseUrl,session,sessionKey,allowLocal,apiKey:typeof credentials.api_key==='string'?credentials.api_key:undefined,webhookToken:typeof credentials.webhook_token==='string'?credentials.webhook_token:undefined,webhookSecret:typeof credentials.webhook_secret==='string'?credentials.webhook_secret:undefined};
}
function transport(ctx:Context){const deadline=Date.now()+18000;return async(path:string,method='GET',body?:unknown,accept='application/json')=>{const remaining=deadline-Date.now();if(remaining<=0)throw new Error('provider_timeout');return safeFetchWithSsrfGuard(`${ctx.baseUrl}${path}`,{method,headers:{Accept:accept,...(ctx.apiKey?{'X-Api-Key':ctx.apiKey}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})},{timeoutMs:Math.min(8000,remaining),allowLocalTest:ctx.allowLocal,allowedProtocols:['http:','https:']});};}
async function readBody(response:Response,limit:number){
 const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>limit)throw connectionError(502,"Resposta do provedor acima do limite permitido.");
 if(!response.body)return Buffer.alloc(0);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0,timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{});},8000);
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>limit){void reader.cancel().catch(()=>{});throw connectionError(502,"Resposta do provedor acima do limite permitido.");}chunks.push(chunk.value);}if(timedOut)throw connectionError(502,"O provedor não concluiu a resposta no prazo.");return Buffer.concat(chunks);}
 finally{clearTimeout(timer);reader.releaseLock();}
}
async function readJson(response:Response,limit=65536):Promise<unknown>{const bytes=await readBody(response,limit);try{return JSON.parse(bytes.toString('utf8'));}catch{throw connectionError(502,"O provedor retornou dados inválidos. Nenhuma conexão foi confirmada.");}}
async function probe(ctx:Context,get=transport(ctx)){
 const response=await get(`/api/sessions/${encodeURIComponent(ctx.session)}`);
 if(response.status===404)return {status:'NOT_FOUND',phone:null,me:null};
 if(!response.ok)throw connectionError(502,"O WAHA não confirmou o estado da sessão. Nenhuma ação de conexão foi executada por esta consulta.");
 let data:{name?:unknown;status?:unknown;me?:{id?:unknown;pushName?:unknown};config?:{metadata?:Record<string,unknown>}};try{data=await readJson(response) as typeof data;}catch{throw connectionError(502,"O WAHA retornou um estado inválido.");}
 if(!data||typeof data.status!=='string'||!['WORKING','STARTING','SCAN_QR_CODE','STOPPED','FAILED'].includes(data.status))throw connectionError(502,"O WAHA retornou um estado não reconhecido. Confira o provedor.");
 if(data.name!==undefined&&data.name!==ctx.session)throw connectionError(409,"O provedor retornou outra sessão. Nenhuma sessão alternativa será utilizada.");
 const metadata=data.config?.metadata;if(metadata?.['chatSales.channelId']&&metadata['chatSales.channelId']!==ctx.id)throw connectionError(409,"A sessão está identificada para outro canal. Revise o nome cadastrado.");
 let me=data.me??null,phone=historyPhone(me?.id);
 if(data.status==='WORKING'&&!phone){const identity=await get(`/api/sessions/${encodeURIComponent(ctx.session)}/me`);if(identity.ok){me=await readJson(identity) as typeof me;phone=historyPhone(me?.id);}}
 if(data.status==='WORKING'&&(!phone||(ctx.phone_number_e164&&phone!==ctx.phone_number_e164)))throw connectionError(409,"O número da sessão não corresponde ao canal ou não pôde ser confirmado. Confira a conta no provedor.");
 return {status:data.status,phone,me:phone?{id:`${phone.slice(1)}@c.us`,pushName:typeof me?.pushName==='string'?me.pushName.slice(0,100):undefined}:null};
}
function isSimulation(){return process.env.APP_ENV==='lab'&&process.env.MCT_SIMULATE_WAHA_QR==='true';}
async function binding(client:Client,ctx:Context){
 try{await client.query('INSERT INTO public.channel_session_bindings(workspace_id,channel_id,session_key) VALUES($1,$2,$3) ON CONFLICT(workspace_id,channel_id) DO NOTHING',[ctx.workspace_id,ctx.id,ctx.sessionKey]);}catch(error){if((error as {code?:string}).code==='23505')throw connectionError(409,"A sessão já está vinculada a outro canal. Use uma sessão exclusiva.");throw error;}
 const owned=(await client.query<{session_key:string}>('SELECT session_key FROM public.channel_session_bindings WHERE workspace_id=$1 AND channel_id=$2',[ctx.workspace_id,ctx.id])).rows[0];if(owned?.session_key!==ctx.sessionKey)throw connectionError(409,"O vínculo da sessão mudou. Revise a configuração com o responsável técnico.");
}
function publicOperation(row:Operation|undefined){return row?{id:row.id,action:row.action,state:row.state==='pending'&&row.expired?'uncertain':row.state}:undefined;}
async function openOperation(ctx:Context){return withTenantTransaction(ctx.workspace_id,async client=>(await client.query<Operation>("SELECT id,action,state,result,expected_revision,(lease_until<=clock_timestamp()) AS expired FROM public.channel_connection_operations WHERE workspace_id=$1 AND channel_id=$2 AND state IN ('pending','uncertain') ORDER BY created_at DESC LIMIT 1",[ctx.workspace_id,ctx.id])).rows[0]);}
function webhookBase(){const raw=process.env.WEBHOOK_PUBLIC_BASE_URL||process.env.INTERNAL_API_URL;if(!raw)return null;try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return null;return raw.replace(/\/+$/,'');}catch{return null;}}
function qrImage(mime:unknown,data:unknown){
 if(!['image/png','image/jpeg','image/webp'].includes(String(mime))||typeof data!=='string'||data.length>700000||!/^[A-Za-z0-9+/]+={0,2}$/.test(data))throw connectionError(502,"O provedor retornou uma imagem de QR Code inválida.");
 const bytes=Buffer.from(data,'base64');const valid=(mime==='image/png'&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))||(mime==='image/jpeg'&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||(mime==='image/webp'&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP');
 if(!valid||bytes.length>512*1024)throw connectionError(502,"Não foi possível validar a imagem de QR Code recebida.");return `data:${mime};base64,${data}`;
}
export async function readWahaQr(ws:string,id:string,actor:string){
 const ctx=await context(ws,id,actor);
 if(isSimulation())return {success:true,isSimulated:true,status:'SIMULATED',revision:ctx.revision,sessionName:ctx.session,alreadyConnected:false,message:'SIMULAÇÃO — nenhuma conexão foi criada ou ativada. O exemplo não conecta um aparelho.'};
 const get=transport(ctx),state=await probe(ctx,get),operation=publicOperation(await openOperation(ctx));
 let qrDataUri:string|undefined;
 if(state.status==='SCAN_QR_CODE'){
  const response=await get(`/api/${encodeURIComponent(ctx.session)}/auth/qr?format=image`);
  if(!response.ok)throw connectionError(502,"O estado permite leitura, mas o QR Code não foi retornado. Atualize a consulta; a sessão não foi reiniciada.");
  const mime=response.headers.get('content-type')?.split(';')[0];
  if(mime?.startsWith('image/')){const bytes=await readBody(response,512*1024);qrDataUri=qrImage(mime,bytes.toString('base64'));}
  else{const data=await readJson(response,1024*1024) as {mimetype?:unknown;data?:unknown};qrDataUri=qrImage(data.mimetype,data.data);}
 }
 await withTenantTransaction(ws,client=>current(ctx,actor,client));
 const active=ctx.is_active&&ctx.status==='connected'&&state.status==='WORKING';
 return {success:true,isSimulated:false,status:active?'CONNECTED':state.status==='WORKING'?'READY_FOR_CONFIRMATION':state.status,alreadyConnected:active,requiresConfirmation:state.status==='WORKING'&&!active,me:state.me,verifiedPhoneNumber:state.phone,sessionName:ctx.session,revision:ctx.revision,qrDataUri,operation,canCreate:Boolean(ctx.webhookToken&&ctx.webhookSecret&&webhookBase()),message:active?'Sessão e identidade conferidas. A consulta não altera o canal.':state.status==='WORKING'?'Confira o número e confirme o uso desta sessão no CHAT-SALES.':state.status==='NOT_FOUND'?'A sessão configurada não existe. Crie-a explicitamente antes de iniciar.':state.status==='STOPPED'||state.status==='FAILED'?'A sessão está parada. Inicie ou reinicie somente após revisar a ação.':'Aguardando o provedor. A consulta não inicia nem reinicia sessões.'};
}
export async function activateWaha(ws:string,id:string,actor:string,expectedRevision:string){
 const ctx=await context(ws,id,actor);if(ctx.revision!==expectedRevision)throw connectionError(409,"O canal mudou. Atualize e confirme o número novamente.");
 if(isSimulation())return {success:false,isSimulated:true,status:'SIMULATED',isActive:false,message:'Simulação não pode ativar atendimento real.'};
 const state=await probe(ctx);if(state.status!=='WORKING'||!state.phone)throw connectionError(409,"O provedor ainda não confirmou sessão e identidade prontas.");
 return withTenantTransaction(ws,async client=>{await current(ctx,actor,client);await binding(client,ctx);const pending=await client.query("SELECT id FROM public.channel_connection_operations WHERE workspace_id=$1 AND channel_id=$2 AND state IN ('pending','uncertain')",[ws,id]);if(pending.rowCount)throw connectionError(409,"Revise a operação de conexão pendente antes de ativar o canal.");
  const row=(await client.query<{revision:string}>(`UPDATE public.channel_instances ch SET status='connected',is_active=true,phone_number_e164=COALESCE(phone_number_e164,$3),updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING ${revision}`,[ws,id,state.phone])).rows[0]!;
  await recordSecurityAuditEvent({workspaceId:ws,actorId:actor,action:'channel.connection_approved',resourceType:'channel',resourceId:id,metadata:{provider:'waha',identityVerified:true}},client);
  return {success:true,isSimulated:false,status:'connected',isActive:true,revision:row.revision,message:'Uso da sessão confirmado no CHAT-SALES. O atendimento automático continua sujeito às regras da empresa.'};
 });
}
export async function mutateWaha(ws:string,id:string,actor:string,input:{expectedRevision:string;requestKey:string;action:'create'|'start'|'restart'}){
 const ctx=await context(ws,id,actor);if(isSimulation())throw connectionError(409,"Este ambiente está simulando o QR. Nenhuma sessão real será alterada.");
 const booked=await withTenantTransaction(ws,async client=>{
  await manager(client,ws,actor);await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`connection:${ws}:${id}`]);
  const old=(await client.query<Operation>('SELECT id,action,state,result,expected_revision,(lease_until<=clock_timestamp()) AS expired FROM public.channel_connection_operations WHERE workspace_id=$1 AND channel_id=$2 AND request_key=$3',[ws,id,input.requestKey])).rows[0];
  if(old){if(old.action!==input.action||old.expected_revision!==input.expectedRevision)throw connectionError(409,"A identificação desta tentativa já pertence a outra decisão.");return {cached:old};}
  await current(ctx,actor,client);if(ctx.revision!==input.expectedRevision)throw connectionError(409,"O canal mudou. Atualize antes de iniciar a operação.");
  const open=await client.query("SELECT id FROM public.channel_connection_operations WHERE workspace_id=$1 AND channel_id=$2 AND state IN ('pending','uncertain')",[ws,id]);if(open.rowCount)throw connectionError(409,"Há uma operação pendente ou sem confirmação. Consulte e revise antes de outra tentativa.");
  await binding(client,ctx);
  const operationId=crypto.randomUUID();await client.query("INSERT INTO public.channel_connection_operations(id,workspace_id,channel_id,request_key,actor_id,action,expected_revision,state,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7,'pending',clock_timestamp()+interval '30 seconds')",[operationId,ws,id,input.requestKey,actor,input.action,input.expectedRevision]);
  if(input.action==='restart'&&ctx.is_active){const changed=(await client.query<{revision:string}>(`UPDATE public.channel_instances ch SET status='validating',is_active=false,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING ${revision}`,[ws,id])).rows[0]!;ctx.revision=changed.revision;ctx.is_active=false;ctx.status='validating';}
  await recordSecurityAuditEvent({workspaceId:ws,actorId:actor,action:'channel.connection_requested',resourceType:'channel',resourceId:id,metadata:{operationId,action:input.action}},client);return {operationId};
 });
 if(booked.cached){const old=booked.cached;return old.state==='reviewed'?{success:false,status:'REVIEWED',operation:publicOperation(old),message:'Esta tentativa já foi revisada e não será repetida.'}:old.result||{success:false,status:old.expired?'UNCERTAIN':'OPERATION_PENDING',operation:publicOperation(old),message:'Esta tentativa já foi registrada. Consulte o estado; ela não será repetida automaticamente.'};}
 const operationId=booked.operationId!;let sent=false;let finalState:'completed'|'failed'|'uncertain'='failed',result:Record<string,unknown>;
 try{
  const request=transport(ctx),state=await probe(ctx,request);
  if(input.action==='create'&&state.status!=='NOT_FOUND')throw connectionError(409,"A sessão já existe. Consulte-a; nenhuma criação foi repetida.");
  if(input.action==='start'&&!['STOPPED','FAILED'].includes(state.status))throw connectionError(409,"A sessão não está parada. Atualize o estado antes de iniciar.");
  if(input.action==='restart'&&state.status==='NOT_FOUND')throw connectionError(409,"A sessão não existe. Crie a sessão antes de reiniciar.");
  if(input.action==='create'&&(!ctx.webhookToken||!ctx.webhookSecret||!webhookBase()))throw connectionError(422,"A criação exige o endereço de callback e a configuração protegida do webhook. Revise o cadastro com o responsável técnico.");
  await withTenantTransaction(ws,client=>current(ctx,actor,client));
  const body=input.action==='create'?{name:ctx.session,start:true,config:{metadata:{'chatSales.channelId':id},webhooks:[{url:`${webhookBase()}/v1/webhooks/whatsapp/${ctx.webhookToken}`,events:['message','message.any','message.ack','session.status'],customHeaders:[{name:'x-webhook-secret',value:ctx.webhookSecret}]}]}}:undefined;
  sent=true;const response=await request(input.action==='create'?'/api/sessions':`/api/sessions/${encodeURIComponent(ctx.session)}/${input.action}`,'POST',body);
  if(!response.ok){finalState=[400,401,403,404,409,422].includes(response.status)?'failed':'uncertain';throw new Error('provider_rejected');}
  finalState='completed';result={success:true,status:'ACTION_ACCEPTED',operation:{id:operationId,action:input.action,state:finalState},message:'O provedor aceitou a ação. Consulte o estado e confirme a identidade antes de ativar o uso no CHAT-SALES.'};
 }catch(error){if(sent&&finalState!=='failed')finalState='uncertain';else if(sent&&!(error instanceof Error&&error.message==='provider_rejected'))finalState='uncertain';result={success:false,status:finalState==='uncertain'?'UNCERTAIN':'ACTION_FAILED',operation:{id:operationId,action:input.action,state:finalState},message:sent?'O resultado da ação não foi confirmado. Consulte o estado antes de decidir uma nova tentativa.':'A ação não foi enviada ao provedor. Confira o estado e a configuração antes de tentar novamente.'};}
 try{await withTenantTransaction(ws,async client=>{await current(ctx,actor,client,false);await client.query("UPDATE public.channel_connection_operations SET state=$3,result=$4::jsonb,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state='pending'",[ws,operationId,finalState,JSON.stringify(result)]);});}
 catch{await withTenantTransaction(ws,async client=>{await client.query("UPDATE public.channel_connection_operations SET state='uncertain',result=$3::jsonb,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND state='pending'",[ws,operationId,JSON.stringify({success:false,status:'UNCERTAIN',operation:{id:operationId,action:input.action,state:'uncertain'},message:'O canal mudou durante a ação. Nenhuma ativação local foi aplicada; revise o resultado no provedor.'})]);});throw connectionError(409,"O canal mudou durante a ação. Nenhuma ativação local foi aplicada. Consulte o provedor e revise a pendência.");}
 return result;
}
export async function reviewWahaOperation(ws:string,id:string,actor:string,input:{expectedRevision:string;operationId:string}){
 const ctx=await context(ws,id,actor);if(isSimulation())throw connectionError(409,"Uma simulação não consulta nem altera uma operação real.");if(ctx.revision!==input.expectedRevision)throw connectionError(409,"O canal mudou. Atualize antes de revisar a pendência.");
 const state=await probe(ctx);return withTenantTransaction(ws,async client=>{await current(ctx,actor,client);const operation=(await client.query<Operation>("SELECT id,action,state,result,expected_revision,(lease_until<=clock_timestamp()) AS expired FROM public.channel_connection_operations WHERE workspace_id=$1 AND channel_id=$2 AND id=$3 FOR UPDATE",[ws,id,input.operationId])).rows[0];if(!operation)throw connectionError(404,"Operação não encontrada.");if(operation.state==='pending'&&!operation.expired)throw connectionError(409,"A ação ainda está em andamento. Aguarde e atualize a consulta.");if(!['pending','uncertain','reviewed'].includes(operation.state))throw connectionError(409,"A operação já tem um resultado registrado. Atualize a consulta.");await client.query("UPDATE public.channel_connection_operations SET state='reviewed',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",[ws,operation.id]);await recordSecurityAuditEvent({workspaceId:ws,actorId:actor,action:'channel.connection_uncertainty_reviewed',resourceType:'channel',resourceId:id,metadata:{operationId:operation.id,observedStatus:state.status,remoteOutcomeConfirmed:false}},client);return {success:true,status:'REVIEWED',message:'Estado consultado e pendência revisada. Isto não confirma a execução anterior nem repete a ação. Escolha explicitamente o próximo passo, se necessário.'};});
}
