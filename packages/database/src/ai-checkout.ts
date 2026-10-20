import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import {aiCapabilitySignature,resolveAiCapabilities,parseAiCheckoutConfirmation} from '@sos-sales/contracts';
import {createPixCharge} from './pix';
export interface AiCheckoutContext {workspaceId:string;channelInstanceId:string;threadId:string;contactId:string;inboundMessageId:string;inboundBody:string;senderPhoneE164:string;}
export interface AiCheckoutResult {checkoutRequestId:string;replyText:string;generatedPixChargeId?:string;containsPixCode?:boolean;}
export class AiCheckoutError extends Error {constructor(public reason:string,message:string){super(message);}}
type CheckoutRow={id:string;product_id:string;product_title:string;retailer_id:string;quantity:number;unit_price_cents:number;total_cents:number;currency:string;confirmation_code:string;status:string;valid_until:Date;summary_message_id:string|null;charge_id:string|null;capability_signature:string;};
const money=(amount:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount/100);
const oneLine=(text:string)=>text.replace(/[\r\n\t*_`~]/g,' ').replace(/ +/g,' ').trim();
export function aiCheckoutSummary(row:CheckoutRow){return `Confira a solicitação de cobrança:\nItem: ${oneLine(row.product_title)}\nCódigo do item: ${row.retailer_id}\nQuantidade: ${row.quantity}\nValor unitário: ${money(row.unit_price_cents)}\nTotal: ${money(row.total_cents)}\nVálido até ${new Date(row.valid_until).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília).\nEste resumo não reserva estoque nem confirma pagamento. A disponibilidade ainda será validada.\nPara confirmar estes dados e solicitar a cobrança, responda exatamente: CONFIRMAR ${row.confirmation_code}\nSe algo estiver diferente, informe a correção em vez de confirmar.`;}
async function checkoutFrame(client:PoolClient,ctx:AiCheckoutContext){
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`ai-config:${ctx.workspaceId}`]);
 const ws=(await client.query('SELECT ai_receptionist_enabled,ai_skills,ai_business_rules FROM workspaces WHERE id=$1',[ctx.workspaceId])).rows[0];
 if(ws?.ai_receptionist_enabled!==true||!resolveAiCapabilities(ws.ai_skills).pixCharges)throw new AiCheckoutError('checkout_permission_denied','Cobrança automática não está liberada.');
 const thread=(await client.query('SELECT status,contact_id,channel_instance_id FROM commercial_threads WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ctx.workspaceId,ctx.threadId])).rows[0];
 if(thread?.status!=='active'||thread.contact_id!==ctx.contactId||thread.channel_instance_id!==ctx.channelInstanceId)throw new AiCheckoutError('checkout_context_changed','A conversa precisa de revisão da equipe.');
 const channel=(await client.query('SELECT is_active FROM channel_instances WHERE workspace_id=$1 AND id=$2',[ctx.workspaceId,ctx.channelInstanceId])).rows[0];
 if(channel?.is_active!==true)throw new AiCheckoutError('checkout_channel_disabled','O canal está indisponível.');
 const inbound=(await client.query<{id:string;created_at:Date}>(`SELECT id,created_at FROM messages WHERE workspace_id=$1 AND channel_instance_id=$2 AND thread_id=$3 AND id=$4 AND direction='inbound' AND body=$5 AND sender_e164=$6`,[ctx.workspaceId,ctx.channelInstanceId,ctx.threadId,ctx.inboundMessageId,ctx.inboundBody,ctx.senderPhoneE164])).rows[0];
 if(!inbound)throw new AiCheckoutError('checkout_inbound_unverified','A mensagem de confirmação não pôde ser validada.');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`ai-checkout:${ctx.workspaceId}:${ctx.threadId}`]);
 return {ws,inbound,signature:aiCapabilitySignature(ws.ai_skills)};
}
export async function prepareAiCheckout(client:PoolClient,ctx:AiCheckoutContext,productId:string,quantity=1):Promise<AiCheckoutResult>{
 const frame=await checkoutFrame(client,ctx);
 const existing=(await client.query<CheckoutRow>('SELECT * FROM ai_checkout_requests WHERE workspace_id=$1 AND source_inbound_id=$2',[ctx.workspaceId,ctx.inboundMessageId])).rows[0];
 if(existing){if(existing.status==='pending')return {checkoutRequestId:existing.id,replyText:aiCheckoutSummary(existing)};throw new AiCheckoutError('checkout_intention_already_processed','Esta solicitação já foi processada.');}
 if(!Number.isInteger(quantity)||quantity<1||quantity>999)throw new AiCheckoutError('checkout_quantity_invalid','Informe uma quantidade válida antes de cobrar.');
 const newer=(await client.query(`SELECT r.id FROM ai_checkout_requests r LEFT JOIN messages m ON m.workspace_id=r.workspace_id AND m.id=r.confirmation_message_id WHERE r.workspace_id=$1 AND r.thread_id=$2 AND GREATEST(r.source_created_at,COALESCE(m.created_at,r.source_created_at))>$3 LIMIT 1`,[ctx.workspaceId,ctx.threadId,frame.inbound.created_at])).rows[0];
 if(newer)throw new AiCheckoutError('checkout_stale_intention','Uma solicitação mais recente já está em andamento.');
 const product=(await client.query('SELECT id,title,retailer_id,price_cents,currency,status FROM public.lock_ai_checkout_product($1,$2)',[ctx.workspaceId,productId])).rows[0];
 if(!product||product.status!=='ACTIVE')throw new AiCheckoutError('checkout_product_unavailable','O item precisa de confirmação da equipe.');
 if(product.currency!=='BRL')throw new AiCheckoutError('checkout_currency_unsupported','Esta moeda requer atendimento da equipe.');
 const total=Number(product.price_cents)*quantity;
 if(!Number.isSafeInteger(total)||total<=0||total>2147483647)throw new AiCheckoutError('checkout_amount_invalid','O valor precisa de revisão.');
 const minutes=frame.ws.ai_business_rules?.checkoutValidityMinutes??15;
 if(!Number.isInteger(minutes)||minutes<5||minutes>1440)throw new AiCheckoutError('checkout_validity_invalid','A validade do resumo precisa de configuração.');
 await client.query("UPDATE ai_checkout_requests SET status='superseded',updated_at=clock_timestamp() WHERE workspace_id=$1 AND thread_id=$2 AND status='pending'",[ctx.workspaceId,ctx.threadId]);
 const row=(await client.query<CheckoutRow>(`INSERT INTO ai_checkout_requests(workspace_id,channel_instance_id,thread_id,contact_id,product_id,source_inbound_id,source_created_at,confirmation_code,product_title,retailer_id,quantity,unit_price_cents,total_cents,currency,capability_signature,valid_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'BRL',$14,clock_timestamp()+$15*interval '1 minute') RETURNING *`,[ctx.workspaceId,ctx.channelInstanceId,ctx.threadId,ctx.contactId,productId,ctx.inboundMessageId,frame.inbound.created_at,crypto.randomBytes(5).toString('hex').toUpperCase(),product.title,product.retailer_id,quantity,Number(product.price_cents),total,frame.signature,minutes])).rows[0]!;
 return {checkoutRequestId:row.id,replyText:aiCheckoutSummary(row)};
}
export async function linkAiCheckoutSummary(client:PoolClient,workspace:string,id:string,messageId:string){
 const linked=await client.query("UPDATE ai_checkout_requests SET summary_message_id=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND status='pending' AND summary_message_id IS NULL RETURNING id",[workspace,id,messageId]);
 if(!linked.rows.length)throw new AiCheckoutError('checkout_summary_link_failed','Não foi possível vincular o resumo ao envio.');
}
export async function confirmAiCheckout(client:PoolClient,ctx:AiCheckoutContext):Promise<AiCheckoutResult>{
 const code=parseAiCheckoutConfirmation(ctx.inboundBody);if(!code)throw new AiCheckoutError('checkout_confirmation_invalid','Confirme usando o texto indicado no resumo.');
 const frame=await checkoutFrame(client,ctx);
 const row=(await client.query<CheckoutRow>('SELECT * FROM ai_checkout_requests WHERE workspace_id=$1 AND channel_instance_id=$2 AND thread_id=$3 AND contact_id=$4 AND confirmation_code=$5 FOR UPDATE',[ctx.workspaceId,ctx.channelInstanceId,ctx.threadId,ctx.contactId,code])).rows[0];
 if(!row)throw new AiCheckoutError('checkout_confirmation_not_found','Não encontrei esse resumo nesta conversa.');
 if(row.status==='consumed')return {checkoutRequestId:row.id,replyText:'Este pedido já possui uma cobrança. Não gerei outra. Consulte a mensagem anterior ou peça ajuda à equipe.',generatedPixChargeId:row.charge_id!};
 if(row.status!=='pending')throw new AiCheckoutError('checkout_confirmation_outdated','Esse resumo foi substituído ou encerrado. Use o mais recente.');
 if(row.capability_signature!==frame.signature)throw new AiCheckoutError('checkout_permissions_changed','As permissões mudaram. A equipe precisa revisar o pedido.');
 const sent=(await client.query(`SELECT m.id FROM messages m JOIN outbound_commands o ON o.workspace_id=m.workspace_id AND o.message_id=m.id WHERE m.workspace_id=$1 AND m.channel_instance_id=$2 AND m.thread_id=$3 AND m.id=$4 AND m.direction='outbound' AND m.delivery_status IN ('sent','delivered','read') AND o.status='sent' AND o.external_message_id IS NOT NULL AND m.created_at<$5 AND o.sent_at IS NOT NULL AND o.sent_at<$5`,[ctx.workspaceId,ctx.channelInstanceId,ctx.threadId,row.summary_message_id,frame.inbound.created_at])).rows[0];
 if(!sent)throw new AiCheckoutError('checkout_summary_not_sent','O envio do resumo ainda não foi confirmado.');
 const expired=(await client.query<{expired:boolean}>('SELECT clock_timestamp()>$1::timestamptz AS expired',[row.valid_until])).rows[0]!.expired;
 if(expired){await client.query("UPDATE ai_checkout_requests SET status='expired',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",[ctx.workspaceId,row.id]);const fresh=await prepareAiCheckout(client,ctx,row.product_id,row.quantity);return {...fresh,replyText:'O resumo anterior expirou. Confira os dados atualizados e confirme novamente.\n\n'+fresh.replyText};}
 const product=(await client.query('SELECT id,title,retailer_id,status,stock_policy FROM public.lock_ai_checkout_product($1,$2)',[ctx.workspaceId,row.product_id])).rows[0];
 if(product?.status!=='ACTIVE')throw new AiCheckoutError('checkout_product_unavailable','O item não está disponível para cobrança automática.');
 if(product.title!==row.product_title||product.retailer_id!==row.retailer_id)throw new AiCheckoutError('checkout_product_identity_changed','O cadastro do item mudou. Solicite um novo resumo.');
 if(product.stock_policy!=='not_required')throw new AiCheckoutError('checkout_availability_unverified','A equipe precisa confirmar a disponibilidade antes de cobrar.');
 await client.query('SAVEPOINT ai_checkout_charge');
 try{
  const charge=await createPixCharge(client,{workspaceId:ctx.workspaceId,threadId:ctx.threadId,contactId:ctx.contactId,productId:row.product_id,title:row.product_title,amountCents:row.total_cents,currency:'BRL',expiresMinutes:30});
  await client.query("UPDATE ai_checkout_requests SET status='consumed',confirmation_message_id=$3,charge_id=$4,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",[ctx.workspaceId,row.id,ctx.inboundMessageId,charge.id]);
  await client.query('RELEASE SAVEPOINT ai_checkout_charge');
  return {checkoutRequestId:row.id,generatedPixChargeId:charge.id,containsPixCode:true,replyText:`Cobrança gerada para o pedido confirmado.\nItem: ${oneLine(row.product_title)}\nQuantidade: ${row.quantity}\nTotal: ${money(row.total_cents)}\nValidade da cobrança: ${new Date(charge.expires_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} (Brasília).\n\nCódigo Pix Copia e Cola:\n${charge.pix_code}\n\nGerar a cobrança não confirma pagamento. O recebimento será verificado separadamente.`};
 }catch(error){await client.query('ROLLBACK TO SAVEPOINT ai_checkout_charge');await client.query('RELEASE SAVEPOINT ai_checkout_charge');throw error;}
}
