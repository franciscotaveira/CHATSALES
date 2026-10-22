// Auditoria isolada: HTTP e banco inteiramente simulados; nenhum pagamento é criado.
import {createAbacatePayBilling,reconcileAbacatePaySettlement,verifyAbacatePayWebhookSignature} from '../../../apps/api/src/services/abacatepay.service';

async function main(){
  globalThis.fetch=async()=>{throw new Error('AUDIT_NETWORK_DISABLED');};
  const urls:string[]=[];
  const billing=await createAbacatePayBilling({apiKey:'abc_dev_SIMULADO_SEM_USO',amountCents:10000,title:'SIMULADO — auditoria',fetchFn:async(url)=>{
    urls.push(String(url));
    return urls.length===1?new Response('version mismatch',{status:400}):new Response(JSON.stringify({data:{id:'SIM-charge',amount:10000,status:'PENDING',brCode:'SIM-pix',receiptUrl:'https://example.invalid/SIM'}}),{status:200});
  }});
  let charge:any={id:'11111111-1111-4111-8111-111111111111',workspace_id:'22222222-2222-4222-8222-222222222222',contact_id:'33333333-3333-4333-8333-333333333333',thread_id:null,proposal_id:null,title:'SIMULADO',amount_cents:10000,currency:'BRL',status:'PENDING'};
  let writes=0,receipts=0,audits=0;
  const client:any={query:async(sql:string)=>{
    if(sql.includes('INSERT INTO public.integration_event_receipts'))receipts++;
    if(sql.includes('INSERT INTO public.audit_events'))audits++;
    if(sql.includes('SELECT * FROM public.pix_charges'))return {rows:[{...charge}]};
    if(sql.includes('UPDATE public.pix_charges')){writes++;charge={...charge,status:'PAID'};return {rows:[{...charge}]};}
    return {rows:[]};
  }};
  const first=await reconcileAbacatePaySettlement(client,{workspaceId:charge.workspace_id,eventId:'SIM-event-1',billingId:'SIM-charge',paidAmountCents:1});
  const second=await reconcileAbacatePaySettlement(client,{workspaceId:charge.workspace_id,eventId:'SIM-event-2',billingId:'SIM-charge',paidAmountCents:1});
  console.log(JSON.stringify({origin:'SIMULADO',network:'disabled; fetchFn local stub only',v2:{urls,id:billing.id,directV2:urls.length===1&&urls[0].includes('/v2/transparents/create')},amount:{expectedCents:10000,reportedPaidCents:1,observedStatus:first.charge.status},replay:{secondAlreadySettled:second.alreadySettled,chargeUpdates:writes,receiptInsertAttempts:receipts,auditInserts:audits},authentication:{querySecretWithoutHmacAccepted:verifyAbacatePayWebhookSignature({secret:'SIM-SECRET-12345',querySecret:'SIM-SECRET-12345'})}},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
