import type {WindowInfo} from "../hooks/useConversation";
/** Mirrors the existing service-window policy; provider validation remains authoritative. */
export function freeformSendBlockReason(window:WindowInfo,now=Date.now()):string|undefined{
 if(window.sendBlockedReason)return window.sendBlockedReason;
 if(window.isLoading)return "Aguarde a consulta da janela de atendimento antes de enviar.";
 if(!window.isOpen||(window.expiresAt!==undefined&&(!Number.isFinite(window.expiresAt)||window.expiresAt<=now)))return "A janela de atendimento não permite esta mensagem. Revise um modelo Meta aprovado para retomar o contato e aguarde a resposta do cliente.";
 return undefined;
}
