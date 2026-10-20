# Contrato de gestão de canais — laboratório (2026-10-17)

Implementado no checkout codex/iteration-2.7; não publicado em produção. Requer autenticação e workspace:manage na empresa. Não é autorização para habilitar conta, cadastrar cartão, conectar aparelho ou disparar mensagens reais.

GET /v1/workspaces/:workspaceId/channels?includeInactive=true retorna revision por canal. É uma string opaca derivada da última alteração, com precisão de microssegundos; preserve-a integralmente, sem converter em número/data. Ela não é credencial. Não calcule a partir de updatedAt, que pode perder precisão na serialização.

POST /v1/workspaces/:workspaceId/channels/:channelId/revoke e DELETE /v1/workspaces/:workspaceId/channels/:channelId exigem corpo JSON {"expectedRevision":"revision recebida no GET"}. Sem revisão válida, retornam 428. Revisão desatualizada retorna 409; nenhum efeito é aplicado. GET novo, revisão das consequências e nova decisão devem anteceder outra tentativa. Não renovar revisão e repetir a mutação automaticamente.

Revoke suspende o uso local; DELETE arquiva preservando registros. Ambos deixam status revoked/isActive false e apagam a declaração local de faturamento. Credencial sem outro canal ativo associado é revogada localmente. Não fazem logout/revogação remota da sessão no provedor. Não apagam histórico nem mensagens, e não podem cancelar uma chamada externa já iniciada.

PATCH /v1/workspaces/:workspaceId/channels/:channelId/billing exige expectedRevision e metaBillingConfigured booleano. Habilitar exige acknowledgedDeclaration=true, provedor meta_waba e canal ativo/conectado. Confirmação é declaração do responsável, não consulta/validação de cartão na Meta. metaBillingAccountId é opcional; omitir preserva o valor atual, null remove. Desabilitar limpa o identificador. Corpo inválido retorna 400, declaração não reconhecida/provedor incompatível retorna 422, revisão/estado incompatível retorna 409. Canal ausente no escopo retorna 404 após validar o contrato. Papel atual é revalidado dentro da transação; acesso insuficiente retorna 403.

As três mutações gravam auditoria na mesma transação. O cliente web envia a revisão observada. Consumidores externos antigos que chamem esses endpoints precisam adotar este contrato; não há fallback de alteração sem revisão.

Disparos e testes de campanha voltam a conferir declaração Meta antes da chamada ao provedor, além de canal ativo/conectado e critérios existentes. Perda de condição encerra o comando como dead_letter e bloqueia o destinatário, sem fingir envio. A campanha reflete falhas no progresso. Restabelecer a declaração não reenvia esses comandos automaticamente. Toda chamada ao provedor já iniciada pode concluir.

Timeout na UI significa resultado não confirmado: a gravação no servidor pode ter concluído. Atualize a lista e confira o estado antes de decidir repetir. A interface bloqueia cliques concorrentes, aguarda confirmação e não transforma success=false em êxito.

Fora deste contrato: GET/qr-code, POST/verify-session e PATCH/status ainda exigem revisão própria do ciclo de conexão e concorrência. Integrações externas e provedor real não foram homologados nesta etapa.
