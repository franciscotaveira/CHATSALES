import {Button,Dialog,useBreakpoint} from "@sos-sales/ui";
import {apiClient,type ChannelSummary} from "../../services/api-client";
export type HistoryImportResult=Awaited<ReturnType<typeof apiClient.syncChannelChats>>;
const count=(value:unknown)=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?String(value):"Não informado";
export function HistoryImportDialog({channel,pending,acknowledged,result,error,refreshError,refreshTarget="canais",onAcknowledge,onConfirm,onClose}:{channel:ChannelSummary|null;pending:boolean;acknowledged:boolean;result:HistoryImportResult|null;error:string|null;refreshError:boolean;refreshTarget?:"canais"|"atendimento";onAcknowledge:(value:boolean)=>void;onConfirm:()=>void;onClose:()=>void}){
 const {isMobile}=useBreakpoint();
 return <Dialog isOpen={Boolean(channel)} onClose={onClose} title="Importar histórico recente" description="Revise a linha e o alcance da importação antes de iniciar.">
  {channel&&<div style={{display:"grid",gap:12,overflowWrap:"anywhere"}}>
   <strong>{channel.displayName}</strong><p>{channel.phoneNumberE164||"Número não informado"} · {channel.provider.toUpperCase()}</p>
   <p>Consulta um lote de até 35 conversas e 15 mensagens por conversa. Pode cadastrar contatos e conversas e acrescentar mensagens ainda não registradas. Não representa o histórico completo, não cria oportunidades e não envia mensagens ou respostas da IA.</p>
   {!result&&!error&&<label style={{display:"flex",gap:8,alignItems:"flex-start"}}><input type="checkbox" checked={acknowledged} disabled={pending} onChange={event=>onAcknowledge(event.target.checked)}/>Conferi o canal e quero importar este lote recente.</label>}
   {pending&&<p role="status">Aguardando a importação e a atualização da lista. Sair da página não cancela trabalho já iniciado no servidor.</p>}
   {result&&<section aria-label="Resultado da importação"><h3>{!result.success?"Importação sem confirmação":result.partial?"Importação parcial":"Lote de importação concluído"}</h3><dl><dt>Conversas processadas</dt><dd>{count(result.syncedChatsCount)}</dd><dt>Novas mensagens registradas</dt><dd>{count(result.syncedMessagesCount)}</dd><dt>Conversas com falha</dt><dd>{count(result.failedChatsCount)}</dd><dt>Mensagens descartadas por formato inválido</dt><dd>{count(result.skippedMessagesCount)}</dd></dl><p>{result.message}</p><p>Os contadores abrangem somente esta execução. Atualize o atendimento para consultar os registros; não repita a importação apenas para atualizar a lista.</p></section>}
   {error&&<p role="alert">{error} A importação pode ter registrado parte do lote. Confira o atendimento antes de iniciar outra tentativa.</p>}
   {refreshError&&<p role="alert">O resultado da importação foi preservado, mas {refreshTarget==="atendimento"?"a caixa de entrada":"a lista de canais"} não foi atualizada. Feche e atualize {refreshTarget==="atendimento"?"a caixa de entrada":"os canais"} sem repetir a importação.</p>}
   <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexDirection:isMobile?"column":"row"}}><Button variant="secondary" disabled={pending} onClick={onClose}>{result||error?"Fechar":"Cancelar"}</Button>{!result&&!error&&<Button disabled={pending||!acknowledged} loading={pending} onClick={onConfirm}>Confirmar importação</Button>}</div>
  </div>}
 </Dialog>;
}
