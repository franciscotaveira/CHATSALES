# Contrato de conexão WAHA — UX-70

Base: /v1/workspaces/:workspaceId/channels/:channelId. Exige gestão da empresa, canal WAHA não revogado e credencial ativa. Campos adicionais são recusados pelos corpos estritos.

- GET /qr-code: consulta sem efeitos; Cache-Control no-store. force legado é recusado. Retorna revisão, estado, identidade comprovada quando disponível, imagem raster validada quando disponível e operação pendente. WORKING não ativa canal automaticamente.
- POST /connection: action=create|start|restart, expectedRevision, requestKey UUID, acknowledged=true. Revisão deve vir da consulta observada pelo responsável. Mesma chave reproduz resultado registrado, não repete POST externo. Nova chave não contorna operação pendente/incerta.
- POST /connection/review: expectedRevision, operationId UUID, acknowledged=true. Consulta o provedor e permite reconhecer incerteza após expiração da execução; não confirma retrospectivamente o efeito externo nem o repete.
- POST /verify-session: expectedRevision, acknowledgedConnection=true. Consulta identidade novamente e ativa localmente somente com prova compatível e contexto ainda autorizado. Revisão ausente retorna 428; conflito retorna 409.

Criar exige estado ausente no provedor; iniciar exige sessão parada/falha; reiniciar exige sessão existente. Resposta aceita não equivale a conexão ou envio homologado. Resultado incerto deve ser revisado, nunca repetido automaticamente. Fechar o diálogo não cancela efeito externo já iniciado.

Credenciais privadas incluem sessão, token de rota e segredo de webhook independentes. Callback usa token privado e header x-webhook-secret; não expõe chave de API ao navegador. Canais novos recebem sessão exclusiva se o técnico não informar uma existente. Credencial duplicada não é sobrescrita no registro de canal. Legado sem callback protegido exige configuração técnica própria.

Migrações 061 e 062 devem preceder execução deste código. A primeira mantém operações e vínculos exclusivos por URL normalizada/sessão, com RLS; a segunda limita gravações do worker a observações autenticadas por lease, sem conceder UPDATE geral em canais e sem permitir ativação por evento.

Limites: exclusividade não resolve aliases físicos do provedor; vínculo não é liberado automaticamente. PATCH/status e fluxo de recuperação/edição de credencial continuam pendentes de revisão. Meta/Evolution não herdam uma homologação WAHA. Testes locais usam provedor sintético; nenhuma homologação real ou publicação em produção foi feita neste recorte.

## Edição direta de status retirada — UX-71

PATCH /status não grava mais estados. Estados manuais unconfigured, validating, error e revoked retornam 410 com orientação para as ações específicas; connected e pairing continuam recusados com 400. Corpo inválido retorna 400. Autenticação e permissão de gestão continuam obrigatórias. Não há consulta ou efeito externo. A resposta de retirada não consulta existência do canal nem revela dados de outro tenant. Clientes externos devem migrar para POST /connection, POST /verify-session, POST /revoke ou DELETE de arquivamento, cumprindo revisão e reconhecimentos próprios. GET /qr-code permanece somente leitura. A interface atual não usa PATCH /status.
