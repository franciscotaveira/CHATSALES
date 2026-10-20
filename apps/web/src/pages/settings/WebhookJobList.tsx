import {Badge} from '@sos-sales/ui';
export interface WebhookJob {id:string;event_type:string;status:string;attempts:number;error_message:string|null}
export const validateWebhookJobs=(value:unknown)=>{
 if(!Array.isArray(value))throw new Error('A consulta não confirmou uma lista válida de eventos da integração. Consulte a fila novamente.');
 const ids=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.id!=='string'||!row.id.trim()||ids.has(row.id)
   ||typeof row.event_type!=='string'||typeof row.status!=='string'||row.error_message!=null&&typeof row.error_message!=='string')throw new Error('A consulta retornou um evento de integração incompatível. Os registros anteriores foram preservados; consulte a fila novamente.');
  ids.add(row.id);
 }
};
const states:Record<string,{label:string;description:string}>={
 pending:{label:'Aguardando envio',description:'A execução depende do worker de webhooks habilitado.'},
 processing:{label:'Em processamento',description:'A tentativa foi iniciada. Aguarde a confirmação antes de decidir repetir.'},
 delivered:{label:'Destino confirmou recebimento',description:'O destino respondeu com sucesso. Isso não comprova que a automação externa concluiu todas as etapas.'},
 failed:{label:'Aguardando nova tentativa',description:'Houve uma falha temporária; a fila pode repetir com limite e o mesmo identificador de evento.'},
 uncertain:{label:'Resultado não confirmado',description:'O destino pode ter processado o evento. Confira o resultado externo antes de decidir repetir.'},
 suspended:{label:'Execução suspensa',description:'A integração foi alterada ou desativada. Reativá-la não libera esta pendência automaticamente.'},
 dead_letter:{label:'Revisão necessária',description:'O envio não será repetido automaticamente. A equipe precisa verificar a causa e o resultado no destino.'},
};
const events:Record<string,string>={'lead.created':'Novo contato','message.received':'Mensagem recebida','proposal.created':'Proposta criada','payment.settled':'Pagamento confirmado','stage.changed':'Etapa alterada'};
export function WebhookJobList({jobs,hasMore=false}:{jobs:WebhookJob[];hasMore?:boolean}){
 return <section aria-label="Eventos consultados da integração" style={{fontSize:12,overflowWrap:'anywhere'}}>
  <p>{jobs.length} evento(s) carregado(s), do mais recente ao mais antigo. {hasMore?"Há eventos anteriores ainda não carregados.":"Fim das páginas desta consulta."} Cada página traz até 50 registros. Pendências suspensas ou sem resultado confirmado exigem revisão.</p>
  {jobs.length===0?<p role="status">{hasMore?"Nenhum evento nas páginas carregadas. Ainda há páginas anteriores para consultar.":"Nenhum evento encontrado nesta consulta."}</p>:<ul style={{listStyle:'none',padding:0,display:'grid',gap:12}}>{jobs.map(job=>{
   const state=(Object.prototype.hasOwnProperty.call(states,job.status)?states[job.status]:undefined)??{label:'Estado não reconhecido',description:'Atualize a consulta e peça ao responsável técnico para conferir o estado. Não presuma conclusão.'};
   return <li key={job.id} style={{border:'1px solid var(--border-default)',borderRadius:8,padding:12}}>
    <strong>{Object.prototype.hasOwnProperty.call(events,job.event_type)?events[job.event_type]:"Evento não reconhecido"}</strong><div style={{marginTop:6}}><Badge variant={job.status==='delivered'?'operational':'neutral'}>{state.label}</Badge></div>
    <p>{state.description}</p><p>{Number.isSafeInteger(job.attempts)&&job.attempts>=0?`${job.attempts} tentativa(s) registradas`:'Quantidade de tentativas indisponível'}</p>
    <details><summary>Detalhes para conferência</summary><p>Evento: {job.id}</p><p>Tipo: {job.event_type} · Estado: {job.status}</p>{job.error_message&&<p>{job.error_message}</p>}</details>
   </li>;
  })}</ul>}
 </section>;
}
