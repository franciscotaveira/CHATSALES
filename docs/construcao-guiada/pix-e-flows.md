# Pix e formulários no atendimento

Escopo: revisão UI/UX em codex/iteration-2.7, laboratório local isolado. Não autoriza envio externo, cobrança real ou registro financeiro produtivo.

## Critérios e implementação

- Consulta falhou: mostrar erro/retry, sem apresentar histórico vazio como resultado válido.
- Criar cobrança: exigir valor brasileiro válido, descrição e validade inteira 5–1440; iniciar valor vazio. Não preencher silenciosamente com R$ 100.
- Repetir criação incerta: mesmo requestKey e mesmos termos retornam a mesma cobrança; mudança de termos na mesma chave responde 409. Solicitações concorrentes serializadas dentro da transação. Registro tenant-scoped em pix_creation_requests (migração 050). Chamadores antigos sem requestKey continuam compatíveis; a UI atual sempre fornece a chave.
- Cobrança criada, mensagem falhou: preservar cobrança e repetir somente envio com chave derivada do ID da cobrança. Não enviar cobrança recuperada já paga ou vencida.
- Confirmar caixa: mostrar cobrança e valor, exigir ação explícita após conferência; usar estado retornado pelo servidor e não afirmar entrega da notificação. Permissão continua exigida pela API.
- Trocar conversa/empresa: limpar contexto e ignorar respostas antigas. Se a criação terminar depois da troca, não iniciar envio ao cliente.
- Clipboard: mostrar sucesso somente depois de writeText resolver; falha permite cópia manual.
- Flow: consulta recuperável; envio apenas por canal Meta Cloud API e formulário publicado com ID válido; guardar chave para retry, bloquear clique duplicado e ignorar retorno de contexto anterior. Enfileirar formulário não confirma agendamento.

## Evidência e limites

Testes direcionados API: 17 cenários aprovados com PostgreSQL/Redis dedicados e provedores sintéticos, incluindo concorrência e conflito de termos. UI: oito cenários aprovados inicialmente, adicionado depois cenário de cobrança recuperada já paga; regressão completa final aprovada: 1.139 testes em 100 arquivos (flow-pix-full-suite.log), incluindo os nove cenários de UI deste recorte. Typecheck 18/18 e builds API/web aprovados.

REA: três fontes em snapshot; ev_3ef2774d3ab66f526ca7f836e7b75dae4614b51eb91c1c6740b5981de3befe6b; manifesto flow-pix-rea-manifest.json e projeção flow-pix-rea-summary.json. Snapshot anterior à verificação final de cobrança paga/vencida e ao limite máximo de centavos. Análise estática não comprova execução externa.

A execução completa anterior foi interrompida junto com os contêineres; processos ausentes e contêineres Exited confirmados antes de restaurar somente os serviços isolados do CHAT-SALES. Dados de laboratório preservados; somente banco descartável de testes recriado pelo runner. Migração 050 aplicada ao lab e ao banco dedicado, sem produção.

Conferência visual pendente: a automação recusou observar a aba que permaneceu na tela de erro do navegador. Nenhum contorno por outro navegador ou método foi tentado. /ready confirma PostgreSQL/Redis saudáveis, mas não prova layout. Nenhuma cobrança gerada nem recebimento registrado pela interface nesta rodada.
