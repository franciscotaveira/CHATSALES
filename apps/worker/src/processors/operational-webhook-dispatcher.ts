import crypto from "node:crypto";
import type { Pool } from "pg";
import { withWorkerTransaction } from "@sos-sales/database";
import { safeFetchWithSsrfGuard, getInternalAllowedHosts } from "@sos-sales/application";

export interface WebhookJobClaim {id:string;workspace_id:string;lease_token:string}
/** Durable notifications with tenant isolation and conservative handling of ambiguous sends. */
export class OperationalWebhookDispatcher {
  async claimBatch(pool:Pool,workerId:string,limit=20):Promise<WebhookJobClaim[]> {
    return (await pool.query<WebhookJobClaim>("SELECT * FROM public.claim_operational_webhook_jobs($1,$2)",[workerId,limit])).rows;
  }
  async dispatchItem(pool:Pool,claim:WebhookJobClaim):Promise<string> {
    const job=await withWorkerTransaction(claim.workspace_id,async client=>(await client.query<{
      id:string;subscription_id:string;event_type:string;payload:Record<string,unknown>;attempts:number;
      url:string;secret:string;is_active:boolean;supports_idempotency:boolean;
    }>(`SELECT j.id,j.subscription_id,j.event_type,j.payload,j.attempts,s.url,s.secret,s.is_active,s.supports_idempotency
       FROM public.outbound_webhook_jobs j JOIN public.outbound_webhook_subscriptions s ON s.id=j.subscription_id AND s.workspace_id=j.workspace_id
       WHERE j.id=$1 AND j.workspace_id=$2 AND j.lease_token=$3 AND j.status='processing' AND j.lease_until>now()`,[claim.id,claim.workspace_id,claim.lease_token])).rows[0],pool);
    if(!job) return "stale";
    const started=Date.now();let status=job.is_active?"uncertain":"suspended";
    let error:string|null=job.is_active?"Delivery result unknown; review required":"Integration disabled; review required";
    let statusCode:number|null=null;
    if(job.is_active){
      const body=JSON.stringify(job.payload);
      try {
        const response=await safeFetchWithSsrfGuard(job.url,{
          method:"POST",redirect:"error",headers:{"Content-Type":"application/json","User-Agent":"ChatSales-Outbound-Webhook/3.0",
          "X-ChatSales-Event":job.event_type,"X-ChatSales-Delivery":String(job.payload.id),
          "Idempotency-Key":String(job.payload.id),"X-ChatSales-Signature-256":`sha256=${crypto.createHmac("sha256",job.secret).update(body).digest("hex")}`},body,
        },{timeoutMs:10000,allowLocalTest:process.env.NODE_ENV==="test",allowedProtocols:["http:","https:"],allowedInternalHosts:getInternalAllowedHosts()});
        statusCode=response.status;
        if(response.ok){status="delivered";error=null;}
        else if(job.supports_idempotency && (response.status===429||response.status>=500) && job.attempts<3){status="failed";error=`Temporary HTTP ${response.status}; retry uses the same event ID`;}
        else {status="dead_letter";error=`HTTP ${response.status}; review required`;}
        await response.body?.cancel();
      } catch {
        // Timeouts may occur after the recipient acted. Never blindly replay them.
        status="uncertain";
      }
    }
    return withWorkerTransaction(claim.workspace_id,async client=>{
      const updated=await client.query(`UPDATE public.outbound_webhook_jobs SET status=$4,error_message=$5,next_attempt_at=now()+interval '60 seconds',lease_until=NULL,updated_at=now()
        WHERE workspace_id=$1 AND id=$2 AND lease_token=$3 AND status='processing' AND lease_until>now() RETURNING id`,[claim.workspace_id,claim.id,claim.lease_token,status,error]);
      if(!updated.rowCount) return "stale";
      if(job.is_active) await client.query(`INSERT INTO public.outbound_webhook_deliveries(subscription_id,workspace_id,event_type,payload,status,status_code,error_message,duration_ms)
        VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,[job.subscription_id,claim.workspace_id,job.event_type,JSON.stringify(job.payload),status==="delivered"?"delivered":"failed",statusCode,error,Date.now()-started]);
      return status;
    },pool);
  }
}
