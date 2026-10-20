import { ApiReadTimeoutError } from "../services/read-deadline";
import { ApiError, NetworkError } from "../services/api-client";

/** Keep the recovery instruction visible without exposing transport details or internal identifiers. */
export function userFacingError(error: unknown, fallback: string): string {
  if(error instanceof ApiReadTimeoutError)return "A consulta demorou mais que o esperado. Tente consultar novamente.";
  if (error instanceof ApiError) {
    if (/CHANNEL_INSTANCE_INACTIVE|CHANNEL_INSTANCE_NOT_FOUND|CREDENTIALS.*(?:MISSING|NOT_FOUND)/i.test(error.detail)) {
      return "O canal está desconectado ou inativo. Revise a conexão em Configurações antes de enviar.";
    }
    if (error.status === 401) return "Sua sessão expirou. Entre novamente para continuar.";
    if (error.status === 403) return "Seu acesso não permite esta ação. Consulte o responsável pela empresa.";
    if (error.status === 404) return "Este registro não está mais disponível. Atualize a tela para continuar.";
    if (error.status === 409) return "Os dados desta operação mudaram. Atualize a tela e confira o resultado antes de tentar novamente.";
    if (error.status === 429) return "Há muitas solicitações em andamento. Aguarde um momento e tente novamente.";
    if (error.status >= 500) return "O serviço está indisponível no momento. Tente novamente mais tarde.";
    return fallback;
  }
  if (error instanceof NetworkError || (error instanceof Error && /timeout|network|failed to fetch/i.test(error.message))) {
    return "Não foi possível confirmar a resposta do servidor. Verifique sua conexão e tente novamente.";
  }
  if (error instanceof Error && !/\[\d{3}\]|\b(?:SELECT|INSERT|UPDATE|DELETE)\b|[a-f0-9]{8}-[a-f0-9-]{20,}|Exception|SSRF|ECONN|Fastify/i.test(error.message)) return error.message;
  return fallback;
}
