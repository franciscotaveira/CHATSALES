# Preparar, revisar e confirmar um disparo

Implementação local na branch `codex/iteration-2.7`. Migrações necessárias: `048_broadcast_prepared_audiences.sql` e `049_broadcast_message_tests.sql`. Sem publicação em VPS ou ativação de provedores.

## Fluxo e contrato da API

1. `POST /v1/workspaces/:workspaceId/broadcasts/prepare`: enviar a configuração da campanha, canal, modelos, variáveis e critério de público. Exige pessoa autenticada com `cockpit:send_message` na empresa.
2. O servidor devolve `preparedAudienceId`, `expiresAt`, `limit`, `included` e `excluded`. Cada incluído contém nome/telefone; cada excluído também contém o motivo. O lote considera até 1.000 registros, ordenados por telefone. A revisão vale por 30 minutos e pertence à pessoa e empresa que a prepararam.
3. A interface mostra a lista exata, as mensagens A/B e exige autorização explícita. O preparo não cria campanha, mensagens de saída nem contatos importados.
4. `POST /v1/workspaces/:workspaceId/broadcasts`: reenviar a mesma configuração com `preparedAudienceId` e `approvedTestIds` das variantes conferidas. Sem revisão, o endpoint responde `422 BROADCAST_REVIEW_REQUIRED`. Chamadores antigos precisam implementar o preparo antes da confirmação.
5. A confirmação usa exclusivamente a lista preparada. Revalida critérios, consentimento, identidade do contato, canal, aprovação do provedor e conteúdo dos modelos. Pode retirar destinatários; não acrescenta novos. Alterar configuração/conteúdo ou deixar a revisão vencer exige novo preparo. Revisão de outra pessoa/empresa não é aceita.
6. A identidade idempotente da campanha é o `preparedAudienceId`. Repetir a confirmação com a mesma revisão não cria outra campanha, mesmo que o chamador envie outro `requestKey`. Campanhas canceladas não são retomadas por retry.
7. O worker revalida a elegibilidade antes da chamada externa. Bloqueio comercial, mudança de etapa/critério, remoção do contato, cancelamento ou ausência de aprovação Meta impedem o despacho. Preparação/enfileiramento não comprovam entrega.

## Modelos por provedor

O preflight fornece os modelos cadastrados com seus metadados reais. WAHA/Evolution podem usar modelos locais; isso não é aprovação Meta. Para Meta, a interface e o servidor exigem aprovação recente para o canal escolhido. O texto efetivo do modelo define os placeholders; campos obrigatórios ausentes impedem o preparo.

## Evidências e limites

- Testes API com PostgreSQL/Redis descartáveis nas portas 55440/56389 e provedores substituídos: isolamento por empresa/pessoa, expiração, alteração de conteúdo, opt-out, contatos novos após aprovação, importação sem efeitos antecipados, retry e mudança de etapa antes do despacho.
- Navegador do laboratório: revisão preparada pelo servidor com um incluído e um excluído, sem marcar a autorização nem confirmar. Captura `evidencias/ui-ux-prepared-audience.png` e árvore acessível correspondente.
- Fixture explícita `SIMULADO`, sem credenciais e sem worker. Canal desativado após a verificação; zero campanhas e zero comandos para ele, conforme `evidencias/prepared-audience-lab-result.json`.
- Não comprova envio/entrega real, custos do provedor, aprovação de conta Meta ou homologação de envio do teste em conta real. O teste obrigatório está implementado e verificado com provedores sintéticos; a homologação externa permanece na matriz geral.
- Preparações são imutáveis para o papel da aplicação; sua expiração impede nova confirmação. A exclusão física/retensão desses registros ainda exige uma política operacional própria.

## Teste obrigatório da mensagem

Antes do passo 4, `POST /v1/workspaces/:workspaceId/broadcasts/test` recebe a mesma configuração, `preparedAudienceId`, `testPhone` em E.164 e `testVariant` A/B. O telefone deve ser de um contato existente, sem bloqueio comercial e diferente do canal. Não inicia a campanha. Um teste por variante/revisão, chave idempotente derivada dessa identidade; repetição retorna o teste existente, sem novo comando.

Consultar `GET /v1/workspaces/:workspaceId/broadcasts/preparations/:preparationId/tests`. A resposta identifica variante, telefone, corpo renderizado e estado. `sent` representa confirmação do provedor, sem afirmar entrega/leitura. A pessoa confere o resultado no destino e marca cada teste. A liberação envia os IDs em `approvedTestIds`; o servidor rejeita testes pendentes, falhos, incertos ou pertencentes a outra revisão/pessoa. Nova configuração ou revisão exige novo teste.

Evidência atual: 1.112 testes em 97 arquivos na regressão completa, provedores sintéticos; UI integrada criou apenas teste pendente no lab e manteve o botão de liberação bloqueado. Fixture desativada e comando pendente encerrado por limpeza local. As contagens da seção anterior são históricas da preparação; consulte `message-test-lab-result.json` para o estado desta rodada.
