import {META_GRAPH_API_VERSION} from '@sos-sales/contracts';
import {safeFetchWithSsrfGuard} from '@sos-sales/application';
import {readMetaJson} from './meta-subscription.js';
const fail=(statusCode:number,message:string)=>Object.assign(new Error(message),{statusCode});
/** Read-only proof; an accessible phone object alone does not establish WABA membership. */
export async function assertMetaPhoneMembership(waba:unknown,phoneId:unknown,token:unknown,expectedPhone:string){
 if(typeof waba!=='string'||!/^\d{5,32}$/.test(waba)||typeof phoneId!=='string'||!phoneId||typeof token!=='string'||!token)throw fail(422,'Configure a conta WhatsApp Business, o identificador da linha e o token antes de confirmar a conexão.');
 let after:string|undefined;const seen=new Set<string>(),deadline=Date.now()+20000;
 for(let page=0;page<5;page++){
  if(Date.now()>=deadline)break;
  let response:Response;try{response=await safeFetchWithSsrfGuard(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(waba)}/phone_numbers?fields=id,display_phone_number&limit=100${after?`&after=${encodeURIComponent(after)}`:''}`,{method:'GET',headers:{Authorization:`Bearer ${token}`}},{timeoutMs:Math.min(8000,deadline-Date.now()),allowedProtocols:['https:']});}catch{throw fail(502,'Não foi possível conferir o vínculo da linha à conta Meta. Nenhuma assinatura ou ativação foi autorizada.');}
  if(!response.ok)throw fail(502,'A Meta não confirmou a consulta de linhas da conta.');
  const body=await readMetaJson(response) as {data?:unknown;paging?:{next?:unknown;cursors?:{after?:unknown}}};
  if(!body||!Array.isArray(body.data)||body.data.length>100)throw fail(502,'A Meta retornou uma lista de linhas inválida.');
  for(const item of body.data){
   if(!item||typeof item.id!=='string')throw fail(502,'A lista da Meta contém uma linha sem identificação válida.');
   if(item.id!==phoneId)continue;
   const phone=typeof item.display_phone_number==='string'&&/^[+0-9 ()-]+$/.test(item.display_phone_number)?`+${item.display_phone_number.replace(/\D/g,'')}`:null;
   if(!phone||phone!==expectedPhone)throw fail(422,'O telefone da linha na conta Meta diverge do número consultado. Revise a configuração.');
   return;
  }
  if(!body.paging?.next)throw fail(422,'A linha selecionada não foi encontrada na conta WhatsApp Business informada. Revise os identificadores.');
  const cursor=body.paging?.cursors?.after;if(typeof cursor!=='string'||!cursor||cursor.length>1500||/[\u0000-\u001f]/.test(cursor)||seen.has(cursor))break;seen.add(cursor);after=cursor;
 }
 throw fail(502,'A lista de linhas ficou incompleta. O vínculo com a conta Meta não foi confirmado.');
}
