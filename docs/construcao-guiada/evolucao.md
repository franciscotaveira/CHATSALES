# Evolução guiada — CHAT-SALES

## Direção aceita
Em 16/10/2026, o usuário aprovou preservar a simplicidade do CHAT-SALES e evoluí-lo para uma operação comercial guiada, com configuração por conversa, contexto e próxima ação em cada oportunidade, Radar útil, testes do atendimento e resultados rastreáveis. Em seguida pediu iniciar a execução. Isso autoriza trabalho local por etapas; não publicação em produção nem envio externo.

Checkout: /Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES, branch codex/iteration-2.7, HEAD observado 893569415f533ad9cbaf39e25122d6eb4988573a. Alterações preexistentes preservadas. Ambiente de execução: laboratório isolado, API 24400 e interface 23400.

## Sequência
1. Confiabilidade: completar persistência e transições quebradas; corrigir contratos, autorização, limites de execução e estados demonstrativos.
2. Operação: jornada integrada de chegada do lead ao resultado comercial, com responsável, próxima ação e histórico.
3. Configuração guiada do atendimento com objetivo, fontes, ações permitidas e transferência.
4. Cenários reutilizáveis, versão de configuração e ativação acompanhada.
5. Resultado comercial rastreável e comparação de esforço/resultado com alternativas.

## Etapa 1A — notas e propostas
Estado: **implementado e verificado no laboratório**, em 16/10/2026. Não representa encerramento da fase de confiabilidade.

### Critérios de aceite definidos antes da verificação
- Nota salva no cockpit reaparece após recarregar a página e reabrir a conversa.
- Nota usa o mesmo registro da ficha do contato; demais campos não são sobrescritos.
- Falha de salvamento mantém o texto e oferece nova tentativa com erro visível.
- Marcar Enviada transmite a versão da proposta exibida; conflito não é tratado como sucesso nem repetido automaticamente.
- Ligação de notas atende tanto painel desktop quanto drawer mobile.

### Implementação
- Cockpit conecta notas ao PATCH de contato, enviando somente metadata.notes. A API existente mescla metadata no banco; empresa, tags e demais atributos são preservados.
- Resultado do PATCH atualiza o contato na tela. Carregamentos antigos de contatos são ignorados após troca da seleção; edição fica indisponível sem contato correspondente à conversa.
- Notes aguarda conclusão assíncrona, bloqueia edição/reenvio enquanto salva e mantém rascunho/erro ao falhar. Limite de 2000 caracteres coincide com o contrato existente.
- Tipo CommercialProposalSummary inclui stateVersion já devolvido pela API. patchProposalStatus exige expectedVersion; cockpit envia a versão da proposta carregada, preservando o controle de concorrência do backend.

### Evidências
- pnpm --filter @sos-sales/web typecheck: passou.
- pnpm --filter @sos-sales/web test: 5 arquivos, 41 testes passaram. Quatro testes novos em cockpit-persistence.test.tsx cobrem notas desktop/mobile, erro com rascunho preservado e proposta com versão/conflito 409.
- Build lab passou; log evidencias/etapa-1-build.log. Bundle grande continua como limitação preexistente.
- git diff --check: passou.
- UI real do laboratório: carregou a anotação antiga do dossiê, salvou texto adicional no cockpit e avançou proposta fictícia de draft para sent. Após reload completo e reabertura, anotação e status Enviada permaneceram. Snapshot evidencias/etapa-1-apos-recarregar.txt; screenshot etapa-1-corrigida.png.
- “Marcar Enviada” modifica o status local da proposta; não é prova de envio ao WhatsApp. Não foi enviada mensagem, emitida cobrança ou alterada produção.

### Pendências
Os 13 erros anteriormente encontrados no typecheck da API permanecem fora deste incremento (nenhum código API foi modificado). Autorização da configuração IA, imposição das capacidades no executor, webhook Cakto, estados de seed/aprovação e onboarding ainda exigem correção/validação. A verificação visual atual é no layout estreito; o caminho desktop teve teste de componente, não inspeção visual em todos os tamanhos.

### Próximo passo exato
Restaurar o contrato criptográfico/typecheck da API e tratar autorização e limites determinísticos das ações da IA antes de construir a nova experiência guiada. Decisões técnicas de correção não precisam de nova autorização. Quando entrarmos na jornada comercial, definir com o usuário o público e o resultado inicial que servirão de referência.


## REA incorporado explicitamente

Após confirmação do usuário, foi executada análise estática REA de cinco fontes e consultas de fluxo de ai_skills, com identidade/limites preservados. Ver [rea-investigacao.md](rea-investigacao.md). A etapa 1A continua validada por seus próprios testes e execução local; o REA não foi retroativamente apresentado como prova dessas correções.


## Etapa 1B concluída no laboratório

Contrato criptográfico corrigido, guardas de persistência adicionadas, segredo padrão removido da troca OAuth e edição da IA restrita a workspace:manage. Monorepo: 18/18 tarefas de typecheck passaram; 13 testes de contrato passaram; autorização conferida também por HTTP real no laboratório. REA aplicado antes e depois com limites registrados. Ver [etapa-1b-api.md](etapa-1b-api.md). A capacidade Pix foi tratada no incremento seguinte; demais limites de IA e bloqueios produtivos continuam abertos.

## Etapa 1C concluída no laboratório

Executor passou a impor pix_charges, reler configuração e estado da conversa após inferência e priorizar encaminhamento humano. API e executor compartilham trava transacional da configuração. Migração 037 corrige INSERT da fila para o worker, mantendo RLS. Validação: 31 testes, 18/18 tarefas de typecheck, build API, HTTP e cinco cenários com banco real. REA aplicado antes/depois. Ver [etapa-1c-pix.md](etapa-1c-pix.md). Próximo trecho: idempotência de cobrança e comandos; produção permanece pendente de homologação.


## MVP 0.1 — configuração guiada para teste assistido

Em 17/10/2026 o usuário autorizou seguir as recomendações sem perguntar a cada decisão e concluir versão para teste/comentários. Implementada jornada em cinco etapas, rascunho persistido por empresa com revisão, cenários comuns/por função/próprios, avaliação registrada e aprovação explícita do plano para teste assistido. Ensaio multi-turno opcional usa simulador existente quando há provedor configurado. Configuração operacional ativa é independente e não foi alterada.

Validação: 88 testes, 18/18 tarefas de typecheck, builds API/web lab, HTTP/DB com RLS e conflito, REA estático e percurso real de editar/salvar/revisar/aprovar/recarregar. Modelo real não conectado; não confundir aprovação do plano com homologação operacional. Escopo, limites e evolução: [mvp-0.1.md](mvp-0.1.md).


## Atualização — revisão funcional de 17/10/2026

Ver [revisao-funcional-completa.md](revisao-funcional-completa.md) para o estado mais recente dos 27 grupos, correções, testes e limites. Os achados anteriores permanecem como histórico; não usar seus estados como diagnóstico atual. A nova conferência visual ficou bloqueada pela webview do navegador; testes locais não certificam provedores reais nem liberação em produção.
