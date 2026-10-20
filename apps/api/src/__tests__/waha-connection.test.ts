import {it,expect,beforeAll,beforeEach,afterAll,vi} from 'vitest';
import crypto from 'node:crypto';
import {createTestDatabasePools,encryptPayload} from '@sos-sales/database';import {SignJWT} from '@sos-sales/auth';import {buildApp} from '../index';import {InboxProcessor} from '@sos-sales/worker';import type {FastifyInstance} from 'fastify';
const network=vi.hoisted(()=>({fetch:vi.fn()}));vi.mock('@sos-sales/application',async original=>({...await original<typeof import('@sos-sales/application')>(),safeFetchWithSsrfGuard:(...args:unknown[])=>network.fetch(...args)}));
const {ownerPool,workerPool,appPool}=createTestDatabasePools();const suffix=crypto.randomUUID(),actor=crypto.randomUUID();const key='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
let app:FastifyInstance,ws:string,wsB:string,id:string,credential:string,token:string;const session=`SIM-session-${suffix}`;
const headers=()=>({authorization:`Bearer ${token}`});const url=(tail:string)=>`/v1/workspaces/${ws}/channels/${id}${tail}`;
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const state=(status='STOPPED')=>({name:session,status,me:status==='WORKING'?{id:'551130000000@c.us'}:null});
const read=()=>app.inject({url:url('/qr-code'),headers:headers()});async function revision(){return (await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()})).json().channels.find((channel:{id:string})=>channel.id===id).revision as string;}
const mutate=(input:Record<string,unknown>)=>app.inject({method:'POST',url:url('/connection'),headers:headers(),payload:input});
beforeAll(async()=>{
 vi.stubEnv('INTERNAL_API_URL','http://api.invalid');
 const org=(await ownerPool.query("INSERT INTO organizations(name,slug) VALUES ('SIM WAHA lifecycle',$1) RETURNING id",[suffix])).rows[0].id;
 ws=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'SIM lifecycle',$2) RETURNING id",[org,suffix])).rows[0].id;wsB=(await ownerPool.query("INSERT INTO workspaces(organization_id,name,slug) VALUES ($1,'SIM foreign',$2) RETURNING id",[org,`b-${suffix}`])).rows[0].id;
 await ownerPool.query("INSERT INTO users(id,email,name) VALUES($1,$2,'SIM owner')",[actor,`${suffix}@example.invalid`]);await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",[ws,actor]);
 const encrypted=encryptPayload(JSON.stringify({api_key:'SIM-provider-key',base_url:'http://127.0.0.1:3000',session,webhook_token:`SIM-webhook-token-${suffix}`,webhook_secret:'SIM-private-webhook-secret'}),key);
 credential=(await ownerPool.query("INSERT INTO provider_credentials(workspace_id,provider,account_id,encrypted_payload,iv,auth_tag,key_version) VALUES($1,'waha',$2,$3,$4,$5,'1') RETURNING id",[ws,suffix,encrypted.encryptedBase64,encrypted.ivBase64,encrypted.authTagBase64])).rows[0].id;
 id=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,phone_number_e164,credential_id,endpoint_token_hash,status,is_active) VALUES($1,'waha','SIM WAHA','+551130000000',$2,$3,'validating',false) RETURNING id",[ws,credential,crypto.createHash('sha256').update(`SIM-webhook-token-${suffix}`).digest('hex')])).rows[0].id;
 token=await new SignJWT({sub:actor,email:`${suffix}@example.invalid`,role:'authenticated'}).setProtectedHeader({alg:'HS256'}).setIssuer('sos-sales-test').setAudience('sos-sales-api-test').setExpirationTime('1h').sign(new TextEncoder().encode('synthetic_jwt_secret_for_isolated_audit_2026'));app=await buildApp({masterKeyHex:key});
});
afterAll(async()=>{await app?.close();await ownerPool.end();await workerPool.end();await appPool.end();vi.unstubAllEnvs();});
beforeEach(async()=>{await ownerPool.query('DELETE FROM channel_connection_operations WHERE workspace_id=$1',[ws]);await ownerPool.query('DELETE FROM channel_session_bindings WHERE workspace_id=$1',[ws]);await ownerPool.query("UPDATE channel_instances SET status='validating',is_active=false,updated_at=clock_timestamp() WHERE id=$1",[id]);await ownerPool.query("UPDATE provider_credentials SET status='ACTIVE' WHERE id=$1",[credential]);await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);vi.stubEnv('MCT_SIMULATE_WAHA_QR','false');network.fetch.mockReset().mockImplementation(async()=>json(state()));});
it('GET is read-only for stopped, missing and ready sessions; never searches or starts another session',async()=>{
 const before=await revision();let response=await read();expect(response.statusCode,response.body).toBe(200);expect(response.json().status).toBe('STOPPED');expect(await revision()).toBe(before);expect(network.fetch.mock.calls.every(([url,options])=>url.includes(`/api/sessions/${session}`)&&options.method==='GET')).toBe(true);
 network.fetch.mockResolvedValue(json({message:'not found'},404));expect((await read()).json().status).toBe('NOT_FOUND');expect(await revision()).toBe(before);
 network.fetch.mockResolvedValue(json(state('WORKING')));response=await read();expect(response.json()).toMatchObject({requiresConfirmation:true,alreadyConnected:false,verifiedPhoneNumber:'+551130000000'});expect((await ownerPool.query('SELECT is_active FROM channel_instances WHERE id=$1',[id])).rows[0].is_active).toBe(false);
 expect((await app.inject({url:url('/qr-code?force=true'),headers:headers()})).statusCode).toBe(409);
});
it('requires explicit confirmation and fresh proof to activate; a later suspension cannot be overwritten by a delayed consultation',async()=>{
 network.fetch.mockResolvedValue(json(state('WORKING')));const expectedRevision=await revision();expect((await app.inject({method:'POST',url:url('/verify-session'),headers:headers()})).statusCode).toBe(428);
 let response=await app.inject({method:'POST',url:url('/verify-session'),headers:headers(),payload:{expectedRevision,acknowledgedConnection:true}});expect(response.statusCode,response.body).toBe(200);expect(response.json().isActive).toBe(true);
 network.fetch.mockImplementation(async()=>{await ownerPool.query("UPDATE channel_instances SET status='revoked',is_active=false,updated_at=clock_timestamp() WHERE id=$1",[id]);return json(state('WORKING'));});response=await read();expect(response.statusCode,response.body).toBe(409);expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[id])).rows[0]).toMatchObject({status:'revoked',is_active:false});
});
it('rejects a mismatched identity, another session and HTTP errors containing WORKING without claiming readiness',async()=>{
 for(const value of [{...state('WORKING'),me:{id:'551130000001@c.us'}},{...state('WORKING'),name:'SIM-another-session'}]){network.fetch.mockResolvedValue(json(value));expect((await read()).statusCode).toBe(409);}
 network.fetch.mockResolvedValue(json({message:'WORKING'},500));expect((await read()).statusCode).toBe(502);expect((await ownerPool.query('SELECT is_active FROM channel_instances WHERE id=$1',[id])).rows[0].is_active).toBe(false);
});
it('replays the recorded result for one request key and does not issue overlapping external commands',async()=>{
 let posts=0;network.fetch.mockImplementation(async(_url:string,options:{method:string})=>options.method==='POST'?(posts++,json(state('STARTING'))):json(state()));
 const input={action:'start',requestKey:crypto.randomUUID(),expectedRevision:await revision(),acknowledged:true};const results=await Promise.all([mutate(input),mutate(input)]);expect(results.every(response=>response.statusCode===200)).toBe(true);expect(posts).toBe(1);expect((await mutate(input)).json().status).toBe('ACTION_ACCEPTED');expect(posts).toBe(1);
 expect((await ownerPool.query('SELECT state FROM channel_connection_operations WHERE workspace_id=$1',[ws])).rows).toEqual([{state:'completed'}]);expect((await ownerPool.query('SELECT is_active FROM channel_instances WHERE id=$1',[id])).rows[0].is_active).toBe(false);
});
it('parks uncertain commands and requires an explicit review without blind resends',async()=>{
 let posts=0;network.fetch.mockImplementation(async(_url:string,options:{method:string})=>{if(options.method==='POST'){posts++;throw new Error('SIM timeout after acceptance');}return json(state());});const input={action:'restart',requestKey:crypto.randomUUID(),expectedRevision:await revision(),acknowledged:true};let response=await mutate(input);expect(response.json().status).toBe('UNCERTAIN');const operation=response.json().operation;expect(posts).toBe(1);await mutate(input);expect(posts).toBe(1);expect((await mutate({...input,requestKey:crypto.randomUUID()})).statusCode).toBe(409);
 response=await app.inject({method:'POST',url:url('/connection/review'),headers:headers(),payload:{expectedRevision:await revision(),operationId:operation.id,acknowledged:true}});expect(response.statusCode,response.body).toBe(200);expect(response.json().status).toBe('REVIEWED');expect(posts).toBe(1);
});
it('creates only the configured session with a valid protected callback and never exposes its secrets',async()=>{
 let postBody:Record<string,any>|undefined;network.fetch.mockImplementation(async(_url:string,options:{method:string;body?:string})=>{if(options.method==='POST'){postBody=JSON.parse(options.body!);return json(state('STARTING'));}return json({message:'not found'},404);});const response=await mutate({action:'create',requestKey:crypto.randomUUID(),expectedRevision:await revision(),acknowledged:true});expect(response.statusCode,response.body).toBe(200);expect(postBody?.name).toBe(session);expect(postBody?.config.webhooks[0]).toMatchObject({url:`http://api.invalid/v1/webhooks/whatsapp/SIM-webhook-token-${suffix}`,customHeaders:[{name:'x-webhook-secret',value:'SIM-private-webhook-secret'}]});expect(JSON.stringify(postBody)).not.toContain('SIM-provider-key');expect(response.body).not.toContain('SIM-private-webhook-secret');expect(response.body).not.toContain(`SIM-webhook-token-${suffix}`);
});
it('keeps explicit simulation read-only and never treats NODE_ENV=test as proof of a working account',async()=>{
 vi.stubEnv('MCT_SIMULATE_WAHA_QR','true');const before=await revision(),response=await read();expect(response.json()).toMatchObject({isSimulated:true,status:'SIMULATED',alreadyConnected:false});expect(network.fetch).not.toHaveBeenCalled();expect(await revision()).toBe(before);expect((await app.inject({method:'POST',url:url('/verify-session'),headers:headers(),payload:{expectedRevision:before,acknowledgedConnection:true}})).json().success).toBe(false);
});
it('enforces tenant boundaries and present management permissions before provider access',async()=>{
 expect((await app.inject({url:`/v1/workspaces/${wsB}/channels/${id}/qr-code`,headers:headers()})).statusCode).toBe(403);await ownerPool.query("UPDATE workspace_memberships SET role='operator' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);expect((await read()).statusCode).toBe(403);expect(network.fetch).not.toHaveBeenCalled();
});

it('accepts only bounded raster QR images and never renders raw provider SVG or arbitrary URLs',async()=>{
 const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXwAAAABJRU5ErkJggg==';
 network.fetch.mockImplementation(async(url:string)=>url.includes('/auth/qr')?json({mimetype:'image/png',data:png}):json(state('SCAN_QR_CODE')));let response=await read();expect(response.statusCode,response.body).toBe(200);expect(response.json().qrDataUri).toBe(`data:image/png;base64,${png}`);
 network.fetch.mockImplementation(async(url:string)=>url.includes('/auth/qr')?json({mimetype:'image/svg+xml',data:'PHN2Zz48L3N2Zz4='}):json(state('SCAN_QR_CODE')));response=await read();expect(response.statusCode).toBe(502);expect(response.body).not.toContain('PHN2Zz');
 network.fetch.mockImplementation(async()=>new Response('x',{status:200,headers:{'content-type':'application/json','content-length':'99999999'}}));expect((await read()).statusCode).toBe(502);
});

it('does not activate from provider lifecycle messages or let old failures overwrite a later human decision',async()=>{
 const processor=new InboxProcessor({masterKeyHex:key});
 async function enqueue(status:string){const raw=JSON.stringify({id:`SIM-${crypto.randomUUID()}`,event:'session.status',session,payload:{name:session,status},timestamp:Date.now()});const hash=crypto.createHash('sha256').update(raw).digest('hex'),encrypted=encryptPayload(raw,key,{aad:`${ws}:${id}:${hash}`});return (await ownerPool.query("INSERT INTO channel_webhook_inbox(workspace_id,channel_instance_id,provider_event_key,raw_payload_hash,encrypted_payload,payload_iv,payload_auth_tag,key_version) VALUES($1,$2,$3,$4,$5,$6,$7,1) RETURNING id",[ws,id,crypto.randomUUID(),hash,encrypted.encryptedBase64,encrypted.ivBase64,encrypted.authTagBase64])).rows[0].id;}
 async function process(inboxId:string){const claimed=await processor.claimBatch(workerPool,'SIM-connection-lifecycle',100);const item=claimed.find(item=>item.id===inboxId);expect(item).toBeDefined();const result=await processor.processItem(workerPool,item!,'SIM-connection-lifecycle');expect(result.success).toBe(true);}
 await process(await enqueue('WORKING'));expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[id])).rows[0]).toMatchObject({status:'validating',is_active:false});
 const stale=await enqueue('FAILED');await ownerPool.query("UPDATE channel_instances SET status='connected',is_active=true,updated_at=clock_timestamp() WHERE id=$1",[id]);await process(stale);expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[id])).rows[0]).toMatchObject({status:'connected',is_active:true});
 await process(await enqueue('STOPPED'));expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[id])).rows[0]).toMatchObject({status:'error',is_active:false});
 await ownerPool.query("UPDATE channel_instances SET status='revoked',is_active=false,updated_at=clock_timestamp() WHERE id=$1",[id]);await process(await enqueue('WORKING'));expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[id])).rows[0]).toMatchObject({status:'revoked',is_active:false});
});

it('reserves an exclusive provider session across companies without disclosing another company',async()=>{
 network.fetch.mockImplementation(async(_url:string,options:{method:string})=>json(state(options.method==='POST'?'STARTING':'STOPPED')));
 expect((await mutate({action:'start',requestKey:crypto.randomUUID(),expectedRevision:await revision(),acknowledged:true})).statusCode).toBe(200);
 const encrypted=encryptPayload(JSON.stringify({api_key:'SIM-B-key',base_url:'http://127.0.0.1:3000',session}),key);const credB=(await ownerPool.query("INSERT INTO provider_credentials(workspace_id,provider,account_id,encrypted_payload,iv,auth_tag,key_version) VALUES($1,'waha',$2,$3,$4,$5,'1') RETURNING id",[wsB,crypto.randomUUID(),encrypted.encryptedBase64,encrypted.ivBase64,encrypted.authTagBase64])).rows[0].id;
 await ownerPool.query("INSERT INTO workspace_memberships(workspace_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",[wsB,actor]);const idB=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,credential_id,endpoint_token_hash,status,is_active) VALUES($1,'waha','SIM B',$2,$3,'validating',false) RETURNING id",[wsB,credB,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex')])).rows[0].id;
 const observed=(await app.inject({url:`/v1/workspaces/${wsB}/channels?includeInactive=true`,headers:headers()})).json().channels.find((channel:{id:string})=>channel.id===idB).revision;const count=network.fetch.mock.calls.length;
 const response=await app.inject({method:'POST',url:`/v1/workspaces/${wsB}/channels/${idB}/connection`,headers:headers(),payload:{action:'start',requestKey:crypto.randomUUID(),expectedRevision:observed,acknowledged:true}});expect(response.statusCode,response.body).toBe(409);expect(response.body).not.toContain(ws);expect(network.fetch).toHaveBeenCalledTimes(count);
});
it('keeps a channel revoked if suspension happens after an external action was submitted',async()=>{
 network.fetch.mockImplementation(async(_url:string,options:{method:string})=>{if(options.method==='POST'){await ownerPool.query("UPDATE channel_instances SET status='revoked',is_active=false,updated_at=clock_timestamp() WHERE id=$1",[id]);return json(state('STARTING'));}return json(state());});const response=await mutate({action:'start',requestKey:crypto.randomUUID(),expectedRevision:await revision(),acknowledged:true});expect(response.statusCode,response.body).toBe(409);expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[id])).rows[0]).toMatchObject({status:'revoked',is_active:false});expect((await ownerPool.query('SELECT state FROM channel_connection_operations WHERE workspace_id=$1',[ws])).rows[0].state).toBe('uncertain');
});

it('does not replace another registered channel credential when a new registration uses the same identifier',async()=>{
 const payload={provider:'waha',displayName:`SIM-registration-${suffix}`,credentials:{apiKey:'SIM-original-key',baseUrl:'http://127.0.0.1:3000',session:`SIM-registration-${suffix}`}};
 const first=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels`,headers:headers(),payload});expect(first.statusCode,first.body).toBe(201);const registered=first.json().channel.id;
 const before=(await ownerPool.query('SELECT pc.encrypted_payload FROM provider_credentials pc JOIN channel_instances ch ON ch.credential_id=pc.id WHERE ch.id=$1',[registered])).rows[0].encrypted_payload;
 const second=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels`,headers:headers(),payload:{...payload,credentials:{...payload.credentials,apiKey:'SIM-replacement'}}});expect(second.statusCode,second.body).toBe(409);expect((await ownerPool.query('SELECT pc.encrypted_payload FROM provider_credentials pc JOIN channel_instances ch ON ch.credential_id=pc.id WHERE ch.id=$1',[registered])).rows[0].encrypted_payload).toBe(before);expect((await ownerPool.query('SELECT count(*)::int AS n FROM channel_instances WHERE workspace_id=$1 AND display_name=$2',[ws,payload.displayName])).rows[0].n).toBe(1);
});

it('legacy status edits preserve active, revoked and foreign channels without provider calls',async()=>{
 for(const initial of [{status:'connected',active:true},{status:'revoked',active:false}]){
  await ownerPool.query("UPDATE channel_instances SET status=$1,is_active=$2,meta_billing_configured=$2,updated_at=clock_timestamp() WHERE id=$3",[initial.status,initial.active,id]);
  const before=(await ownerPool.query('SELECT status,is_active,meta_billing_configured,updated_at::text FROM channel_instances WHERE id=$1',[id])).rows[0];
  for(const status of ['unconfigured','validating','error','revoked']){
   const response=await app.inject({method:'PATCH',url:url('/status'),headers:headers(),payload:{status}});expect(response.statusCode,response.body).toBe(410);
   expect((await ownerPool.query('SELECT status,is_active,meta_billing_configured,updated_at::text FROM channel_instances WHERE id=$1',[id])).rows[0]).toEqual(before);
  }
 }
 await ownerPool.query('DELETE FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2',[wsB,actor]);
 expect((await app.inject({method:'PATCH',url:`/v1/workspaces/${wsB}/channels/${id}/status`,headers:headers(),payload:{status:'unconfigured'}})).statusCode).toBe(403);
 await ownerPool.query("UPDATE workspace_memberships SET role='operator' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);
 expect((await app.inject({method:'PATCH',url:url('/status'),headers:headers(),payload:{status:'error'}})).statusCode).toBe(403);expect(network.fetch).not.toHaveBeenCalled();
});

it('reports the actual scope of provider checks without invented quality or connection proof',async()=>{
 for(const provider of ['waha','evolution','meta_waba']){
  network.fetch.mockImplementation(async()=>json(provider==='meta_waba'?{id:'SIM-phone'}:{}));const response=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/test-connection`,headers:headers(),payload:{provider,credentials:{baseUrl:'http://127.0.0.1:3000',apiKey:'SIM-key',phoneNumberId:'SIM-phone',accessToken:'SIM-token'}}});
  expect(response.statusCode,response.body).toBe(200);expect(response.json().success).toBe(true);expect(response.json().checkScope).toBe({waha:'waha_server_reachability',evolution:'evolution_instance_listing',meta_waba:'meta_phone_lookup'}[provider]);expect(response.json().message).toBeTruthy();expect(response.json().qualityRating).toBeUndefined();expect(response.json().verifiedName).toBeUndefined();
 }
 expect((await ownerPool.query('SELECT is_active FROM channel_instances WHERE id=$1',[id])).rows[0].is_active).toBe(false);
});

it('does not treat an unrelated Meta object as a verified phone lookup',async()=>{
 network.fetch.mockImplementation(async()=>json({id:'SIM-other',quality_rating:'GREEN'}));const response=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/test-connection`,headers:headers(),payload:{provider:'meta_waba',credentials:{phoneNumberId:'SIM-phone',accessToken:'SIM-token'}}});expect(response.json().success).toBe(false);expect(response.json().error).toContain('identificador');expect(response.json().qualityRating).toBeUndefined();
});

it('Meta activation checks actual identity, fills only a missing phone and never accepts HTTP alone',async()=>{
 const response=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels`,headers:headers(),payload:{provider:'meta_waba',displayName:'SIM Meta identity',credentials:{phoneNumberId:`SIM-meta-${crypto.randomUUID()}`,accessToken:'SIM-meta-token',wabaAccountId:'987654321'}}});expect(response.statusCode).toBe(201);expect(network.fetch).not.toHaveBeenCalled();
 const metaId=response.json().channel.id;const row=(await ownerPool.query('SELECT pc.encrypted_payload FROM provider_credentials pc JOIN channel_instances ch ON ch.credential_id=pc.id WHERE ch.id=$1',[metaId])).rows[0];expect(row).toBeTruthy();
 const phoneId=(await ownerPool.query('SELECT account_id FROM provider_credentials pc JOIN channel_instances ch ON ch.credential_id=pc.id WHERE ch.id=$1',[metaId])).rows[0].account_id;
 async function approve(){const list=(await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()})).json();return app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/${metaId}/verify-session`,headers:headers(),payload:{expectedRevision:list.channels.find((ch:any)=>ch.id===metaId).revision,acknowledgedConnection:true}});}
 expect((await approve()).statusCode).toBe(409);expect(network.fetch).not.toHaveBeenCalled();
 vi.stubEnv('META_APP_ID','2294262161340902');network.fetch.mockImplementation(async()=>json({data:[{whatsapp_business_api_data:{id:'2294262161340902'}}]}));
 const observed=(await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()})).json().channels.find((ch:any)=>ch.id===metaId).revision;
 expect((await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/${metaId}/meta-subscription/check`,headers:headers(),payload:{expectedRevision:observed}})).json().subscriptionStatus).toBe('confirmed');
 for(const proof of [{},{id:'SIM-wrong',display_phone_number:'551130000000'},{id:phoneId,display_phone_number:'not a phone'}]){network.fetch.mockImplementation(async()=>json(proof));expect((await approve()).json()).toMatchObject({success:false,isActive:false});}
 await ownerPool.query("UPDATE channel_instances SET phone_number_e164='+551130000001' WHERE id=$1",[metaId]);network.fetch.mockImplementation(async(u:string)=>json(u.includes('/phone_numbers')?{data:[{id:phoneId,display_phone_number:'551130000000'}]}:{id:phoneId,display_phone_number:'+55 (11) 3000-0000'}));expect((await approve()).json()).toMatchObject({success:false,isActive:false});
 await ownerPool.query('UPDATE channel_instances SET phone_number_e164=NULL WHERE id=$1',[metaId]);const approved=await approve();expect(approved.json()).toMatchObject({success:true,isActive:true,verifiedPhoneNumber:'+551130000000'});expect((await ownerPool.query('SELECT phone_number_e164 FROM channel_instances WHERE id=$1',[metaId])).rows[0].phone_number_e164).toBe('+551130000000');
 expect((await ownerPool.query("SELECT count(*)::int AS n FROM audit_events WHERE resource_id=$1 AND action='channel.connection_checked'",[metaId])).rows[0].n).toBe(5);
 network.fetch.mockImplementation(async()=>{await ownerPool.query("UPDATE channel_instances SET status='revoked',is_active=false,updated_at=clock_timestamp() WHERE id=$1",[metaId]);return json({id:phoneId,display_phone_number:'551130000000'});});expect((await approve()).statusCode).toBe(409);expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[metaId])).rows[0]).toMatchObject({status:'revoked',is_active:false});
});

it('embedded Meta keeps setup outcomes separate from activation and never overwrites registered credentials',async()=>{
 for(const outcome of ['confirmed','failed','uncertain']){
  const phoneId=`SIM-embedded-${crypto.randomUUID()}`;const payload={displayName:`SIM Embedded ${outcome}`,phoneNumberId:phoneId,wabaAccountId:'987654321',accessToken:'SIM-private-token'};
  network.fetch.mockImplementation(async(url:string)=>url.includes('subscribed_apps')?outcome==='confirmed'?json({success:true}):outcome==='failed'?json({error:'SIM rejected'},403):Promise.reject(new Error('SIM timeout')):url.includes('/phone_numbers')?json({data:[{id:phoneId,display_phone_number:'551130000000'}]}):json({id:phoneId,display_phone_number:'551130000000'}));
  const response=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/meta-embedded-signup`,headers:headers(),payload});expect(response.statusCode,response.body).toBe(201);expect(response.json().channel).toMatchObject({status:'validating',isActive:false});expect(response.json().setup).toMatchObject({subscriptionStatus:outcome,requiresConnectionApproval:true});
  const listing=(await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()})).json().channels.find((ch:any)=>ch.id===response.json().channel.id);expect(listing.metaSubscriptionStatus).toBe(outcome);expect(listing.metaSubscriptionCheckedAt).toBeTruthy();
  if(outcome!=='confirmed'){expect((await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/${listing.id}/verify-session`,headers:headers(),payload:{expectedRevision:listing.revision,acknowledgedConnection:true}})).statusCode).toBe(409);}expect(response.body).not.toContain(payload.accessToken);
  const channelId=response.json().channel.id;const encrypted=(await ownerPool.query('SELECT pc.encrypted_payload FROM provider_credentials pc JOIN channel_instances ch ON ch.credential_id=pc.id WHERE ch.id=$1',[channelId])).rows[0].encrypted_payload;const calls=network.fetch.mock.calls.length;
  expect((await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/meta-embedded-signup`,headers:headers(),payload:{...payload,accessToken:'SIM-replacement'}})).statusCode).toBe(409);expect(network.fetch.mock.calls.length).toBe(calls);expect((await ownerPool.query('SELECT pc.encrypted_payload FROM provider_credentials pc JOIN channel_instances ch ON ch.credential_id=pc.id WHERE ch.id=$1',[channelId])).rows[0].encrypted_payload).toBe(encrypted);
 }
});
it('embedded Meta rejects unproven identity before subscription or persistence',async()=>{
 const payload={displayName:'SIM wrong Meta',phoneNumberId:`SIM-embedded-${crypto.randomUUID()}`,wabaAccountId:'987654321',accessToken:'SIM-private-token'};network.fetch.mockImplementation(async()=>json({id:'SIM-other',display_phone_number:'551130000000'}));const response=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/meta-embedded-signup`,headers:headers(),payload});expect(response.statusCode).toBe(422);expect(network.fetch.mock.calls.every(([,options])=>options.method!=='POST')).toBe(true);expect((await ownerPool.query('SELECT id FROM provider_credentials WHERE workspace_id=$1 AND account_id=$2',[ws,payload.phoneNumberId])).rows).toEqual([]);
});

async function metaSubscriptionFixture(){
 const enc=encryptPayload(JSON.stringify({app_id:'123456789',waba_account_id:'987654321',access_token:'SIM-meta-check-token'}),key);
 const c=(await ownerPool.query("INSERT INTO provider_credentials(workspace_id,provider,account_id,encrypted_payload,iv,auth_tag,key_version) VALUES($1,'meta_waba',$2,$3,$4,$5,'1') RETURNING id",[ws,crypto.randomUUID(),enc.encryptedBase64,enc.ivBase64,enc.authTagBase64])).rows[0].id;
 const ch=(await ownerPool.query("INSERT INTO channel_instances(workspace_id,provider,display_name,credential_id,endpoint_token_hash,status,is_active,meta_subscription_status) VALUES($1,'meta_waba','SIM subscription check',$2,$3,'validating',false,'uncertain') RETURNING id",[ws,c,crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex')])).rows[0].id;
 const observed=async()=>(await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()})).json().channels.find((x:any)=>x.id===ch).revision;
 return {id:ch,credential:c,revision:observed,check:async()=>app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/${ch}/meta-subscription/check`,headers:headers(),payload:{expectedRevision:await observed()}})};
}
it('checks the exact Meta app by GET without subscribing or activating',async()=>{
 const meta=await metaSubscriptionFixture();network.fetch.mockImplementation(async()=>json({data:[{whatsapp_business_api_data:{id:'111111'}},{whatsapp_business_api_data:{id:'123456789'}}]}));
 expect((await meta.check()).json()).toMatchObject({success:true,subscriptionStatus:'confirmed'});expect(network.fetch.mock.calls.every(([u,o])=>o.method==='GET'&&!u.includes('SIM-meta-check-token'))).toBe(true);
 expect((await ownerPool.query('SELECT is_active,meta_subscription_status FROM channel_instances WHERE id=$1',[meta.id])).rows[0]).toEqual({is_active:false,meta_subscription_status:'confirmed'});
});
it('checks bounded pagination on a fixed host and pauses a channel when the app is absent',async()=>{
 const meta=await metaSubscriptionFixture();await ownerPool.query("UPDATE channel_instances SET status='connected',is_active=true WHERE id=$1",[meta.id]);network.fetch.mockImplementation(async(u:string)=>json(u.includes('after=')?{data:[]}:{data:[{whatsapp_business_api_data:{id:'111111'}}],paging:{next:'https://attacker.invalid/?access_token=SIM',cursors:{after:'SIM-cursor'}}}));
 expect((await meta.check()).json().subscriptionStatus).toBe('failed');expect(network.fetch.mock.calls).toHaveLength(2);expect(network.fetch.mock.calls.every(([u])=>u.startsWith('https://graph.facebook.com/'))).toBe(true);
 expect((await ownerPool.query('SELECT status,is_active FROM channel_instances WHERE id=$1',[meta.id])).rows[0]).toEqual({status:'error',is_active:false});
 network.fetch.mockImplementation(async()=>json({data:[],paging:{next:'https://graph.facebook.com/next'}}));expect((await meta.check()).json().subscriptionStatus).toBe('uncertain');
});
it('preserves the previous diagnosis on malformed, oversized and failed Meta responses',async()=>{
 const meta=await metaSubscriptionFixture();const before=await meta.revision();
 for(const response of [()=>json({data:[{}]}),()=>json({},503),()=>json({data:'invalid'}),()=>new Response('x'.repeat(262145))]){network.fetch.mockImplementation(async()=>response());expect((await meta.check()).statusCode).toBe(502);expect(await meta.revision()).toBe(before);}
});
it('rejects stale reviews and late revocation of Meta checks',async()=>{
 const meta=await metaSubscriptionFixture(),old=await meta.revision();await ownerPool.query('UPDATE channel_instances SET updated_at=clock_timestamp() WHERE id=$1',[meta.id]);expect((await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/${meta.id}/meta-subscription/check`,headers:headers(),payload:{expectedRevision:old}})).statusCode).toBe(409);expect(network.fetch).not.toHaveBeenCalled();
 network.fetch.mockImplementation(async()=>{await ownerPool.query("UPDATE channel_instances SET status='revoked',is_active=false,updated_at=clock_timestamp() WHERE id=$1",[meta.id]);return json({data:[{whatsapp_business_api_data:{id:'123456789'}}]});});expect((await meta.check()).statusCode).toBe(409);expect((await ownerPool.query('SELECT status,meta_subscription_status FROM channel_instances WHERE id=$1',[meta.id])).rows[0]).toEqual({status:'revoked',meta_subscription_status:'uncertain'});
});

it('guards Meta subscription checks by current permissions and active credentials',async()=>{
 const meta=await metaSubscriptionFixture();await ownerPool.query("UPDATE workspace_memberships SET role='operator' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);expect((await meta.check()).statusCode).toBe(403);expect(network.fetch).not.toHaveBeenCalled();await ownerPool.query("UPDATE workspace_memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",[ws,actor]);
 network.fetch.mockImplementation(async()=>{await ownerPool.query("UPDATE provider_credentials SET status='REVOKED',updated_at=clock_timestamp() WHERE id=$1",[meta.credential]);return json({data:[{whatsapp_business_api_data:{id:'123456789'}}]});});expect((await meta.check()).statusCode).toBe(409);expect((await ownerPool.query('SELECT meta_subscription_status FROM channel_instances WHERE id=$1',[meta.id])).rows[0].meta_subscription_status).toBe('uncertain');
});

it('embedded signup rejects a phone from another WABA before subscription or storage',async()=>{
 const payload={displayName:'SIM wrong WABA',phoneNumberId:`SIM-line-${crypto.randomUUID()}`,wabaAccountId:'987654321',accessToken:'SIM-token'};
 network.fetch.mockImplementation(async(u:string)=>json(u.includes('/phone_numbers')?{data:[{id:'SIM-other-line',display_phone_number:'551130000000'}]}:{id:payload.phoneNumberId,display_phone_number:'551130000000'}));
 const response=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/meta-embedded-signup`,headers:headers(),payload});expect(response.statusCode,response.body).toBe(422);expect(network.fetch.mock.calls.every(([,options])=>options.method!=='POST')).toBe(true);expect((await ownerPool.query('SELECT id FROM provider_credentials WHERE workspace_id=$1 AND account_id=$2',[ws,payload.phoneNumberId])).rows).toEqual([]);
});


it('checks only the named Evolution instance without activation and rejects unrelated proof',async()=>{
 const name='SIM sales/#2';const endpoint=`/v1/workspaces/${ws}/channels/test-connection`;
 const payload={provider:'evolution',credentials:{baseUrl:'http://127.0.0.1:3000',apiKey:'SIM-key',instanceName:name}};
 for(const state of ['open','close','connecting','qrcode']){
  network.fetch.mockImplementation(async()=>json({instance:{instanceName:name,state}}));
  const response=await app.inject({method:'POST',url:endpoint,headers:headers(),payload});
  expect(response.statusCode,response.body).toBe(200);expect(response.json()).toMatchObject({success:true,checkScope:'evolution_instance_state',instanceState:state});expect(response.json().message).toContain('não ativa o canal');
  expect(network.fetch.mock.lastCall?.[0]).toBe('http://127.0.0.1:3000/instance/connectionState/SIM%20sales%2F%232');
 }
 for(const proof of [{instance:{instanceName:'SIM-other',state:'open'}},{instance:{instanceName:name,state:'unknown'}},{},null]){
  network.fetch.mockImplementation(async()=>json(proof));expect((await app.inject({method:'POST',url:endpoint,headers:headers(),payload})).json().success).toBe(false);
 }
 expect((await ownerPool.query('SELECT is_active FROM channel_instances WHERE id=$1',[id])).rows[0].is_active).toBe(false);
});


it('Evolution activation requires named open instance and matching phone proof',async()=>{
 const instanceName=`SIM-evo-${crypto.randomUUID()}`;
 const created=await app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels`,headers:headers(),payload:{provider:'evolution',displayName:'SIM Evolution identity',credentials:{instanceName,baseUrl:'http://127.0.0.1:3000',apiKey:'SIM-key'}}});expect(created.statusCode,created.body).toBe(201);
 const evoId=created.json().channel.id;
 async function approve(){const ch=(await app.inject({url:`/v1/workspaces/${ws}/channels?includeInactive=true`,headers:headers()})).json().channels.find((ch:any)=>ch.id===evoId);return app.inject({method:'POST',url:`/v1/workspaces/${ws}/channels/${evoId}/verify-session`,headers:headers(),payload:{expectedRevision:ch.revision,acknowledgedConnection:true}});}
 for(const record of [null,{name:instanceName,connectionStatus:'open'},{name:'SIM-other',connectionStatus:'open',ownerJid:'551130000000@s.whatsapp.net'},{name:instanceName,connectionStatus:'close',ownerJid:'551130000000@s.whatsapp.net'},{name:instanceName,connectionStatus:'open',ownerJid:'not-a-phone'}]){
  network.fetch.mockImplementation(async(url:string)=>json(url.includes('connectionState')?{instance:{instanceName,state:'open'}}:[record]));
  expect((await approve()).json()).toMatchObject({success:false,isActive:false});
 }
 const valid={name:instanceName,connectionStatus:'open',ownerJid:'551130000000@s.whatsapp.net'};
 network.fetch.mockImplementation(async(url:string)=>json(url.includes('connectionState')?{instance:{instanceName:'SIM-other',state:'open'}}:[valid]));expect((await approve()).json().success).toBe(false);
 await ownerPool.query("UPDATE channel_instances SET phone_number_e164='+551130000001' WHERE id=$1",[evoId]);
 network.fetch.mockImplementation(async(url:string)=>json(url.includes('connectionState')?{instance:{instanceName,state:'open'}}:[valid]));expect((await approve()).json()).toMatchObject({success:false,isActive:false});
 await ownerPool.query('UPDATE channel_instances SET phone_number_e164=NULL WHERE id=$1',[evoId]);expect((await approve()).json()).toMatchObject({success:true,isActive:true,verifiedPhoneNumber:'+551130000000'});
 expect((await ownerPool.query('SELECT phone_number_e164 FROM channel_instances WHERE id=$1',[evoId])).rows[0].phone_number_e164).toBe('+551130000000');
});
