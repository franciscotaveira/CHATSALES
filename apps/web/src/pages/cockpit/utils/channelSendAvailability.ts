import type {ChannelSummary,CommercialThreadSummary} from "../../../services/api-client";
export function channelSendBlockReason(thread:CommercialThreadSummary|null,channels:ChannelSummary[],checking:boolean,error:string|null,accessUnavailable=false):string|null{
 if(!thread)return null;
 if(accessUnavailable)return "Confirme seu acesso à empresa antes de enviar.";
 if(checking)return "Consultando a disponibilidade do canal. Você pode preparar o rascunho enquanto aguarda.";
 if(error)return "Não foi possível confirmar a disponibilidade do canal. Atualize a consulta antes de enviar.";
 const channel=channels.find(item=>item.id===thread.channelInstanceId);
 if(!channel)return "O canal desta conversa não está disponível na consulta atual. Revise a conexão em Configurações antes de enviar.";
 if(!channel.isActive||channel.status!=="connected")return "O canal desta conversa não está ativo e conectado. Revise a conexão em Configurações antes de enviar.";
 return null;
}
