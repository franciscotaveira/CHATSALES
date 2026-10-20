# Etapa 1C — capacidade Pix no executor

Estado: implementado e verificado no laboratório isolado em 16/10/2026. Produção não alterada.

## Resultado e critérios de aceite

- OFFER_PIX somente gera cobrança quando a configuração atual mantém IA ligada e pix_charges é booleano true. Ausência, null, false e string não autorizam.
- Pedido simultâneo de atendimento humano tem prioridade sobre cobrança. Produto inexistente, valor inválido ou falha de criação encaminham para atendimento humano com texto fixo, substituindo a resposta do modelo.
- Configuração é relida após a inferência. Desativação global e conversa que deixou de estar active interrompem a ação sem cobrança nem mensagem automática.
- PUT da configuração e execução Pix compartilham advisory lock transacional por workspace. A conversa é relida com FOR UPDATE antes da ação. A garantia começa na aquisição dessas travas; alterações posteriores aguardam a transação.
- Operador continua sem permissão de editar IA. Worker continua sem UPDATE em workspaces.

## Evidências

31 testes passaram em três arquivos: ai-pix-capability.test.ts, ai-receptionist.processor.test.ts e ai-config-and-embedded-contract.test.ts. Monorepo: 18/18 tarefas de typecheck passaram; build da API passou; git diff --check passou.

O ensaio run-pix-lab.mjs executou o processador com PostgreSQL real e SET ROLE sos_worker_user, usando LLM e empresa sintéticos. Com habilidade desligada: zero cobranças, encaminhamento humano e um comando de resposta segura. Ligada: uma cobrança local de 25000 centavos e código Pix na mensagem. Desativação durante inferência: nenhuma cobrança adicional. Transferência humana durante inferência: nenhuma cobrança ou mensagem adicional. INSERT da fila para outro tenant foi recusado. Resultado: evidencias/etapa-1c-lab.json.

A API foi recompilada e reiniciada apenas no laboratório. Rechecagem HTTP: operador com claim owner continuou recebendo 403; owner salvou enabled=false com 200, confirmado em leitura posterior. A identidade temporária foi removida. Resultado: evidencias/etapa-1b-http.json, reexecutado nesta etapa.

REA foi executado diretamente antes e depois. Evidências e manifestos SHA-256 estão em evidencias/rea-pix-{before,after}*.json. A análise posterior examinou dois arquivos JavaScript/TypeScript, sem falhas de parse; a migração SQL não é validada por esse analisador. Evidência principal posterior: ev_61c386e9c7d5def9ceb3d6a0f53ef739d6bf89640d4e3ceabaa1121bb8e1e6a8. Relações estáticas têm cobertura semântica parcial/unknown e não comprovam execução; os testes de banco fornecem a evidência de runtime.

## Migração necessária

O ensaio revelou que sos_worker_user não podia inserir em outbound_commands, embora o processador dependa disso. A migração 037_grant_worker_enqueue_outbound_commands.sql concede somente INSERT nessa tabela; FORCE RLS e política por workspace permanecem. Aplicada somente no laboratório. Qualquer implantação futura precisa incluir a migração e sua validação.

## Limites e próximo incremento

Não houve chamada a provedor LLM real, envio WhatsApp, pagamento ou worker/dispatcher contínuo. Código Pix local não comprova liquidação ou entrega. Erro SQL que aborta a transação exige rollback; o catch não recupera uma transação PostgreSQL abortada.

Esta etapa não cobre texto de pagamento inventado sem OFFER_PIX, demais habilidades da IA, alteração de preço/estoque durante inferência ou idempotência em reexecuções. O catálogo ainda é carregado antes da inferência. Próximo incremento recomendado: investigar idempotência do evento recebido e da cobrança/fila antes de liberar automação financeira. Qualificação automática e demais bloqueios do diagnóstico permanecem abertos.
