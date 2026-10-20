# REA aplicado — contratos e limites da IA

Data: 16/10/2026. Após confirmação direta do usuário, as ferramentas do REA passaram a participar explicitamente da investigação do CHAT-SALES. As correções anteriores de notas/propostas permanecem; elas foram implementadas e verificadas antes desta análise REA.

## Recorte e identidade

Ferramenta executada: mcp__rea__analyze_javascript_application, seguida de mcp__rea__trace_javascript_semantics.

Snapshot de cinco fontes, preservando caminhos relativos, em diretório temporário próprio. Manifesto SHA-256 de cada arquivo em evidencias/rea-limites-manifesto.json. Checkout codex/iteration-2.7, HEAD 893569415f533ad9cbaf39e25122d6eb4988573a, com alterações locais da etapa 1A no frontend. Não confundir HEAD com identidade completa de uma árvore suja.

Fontes: rotas ai-agent e channels; processadores ai-receptionist e inbox; contrato crypto-payload. Este recorte não inclui o sistema inteiro nem dependências transitivas.

REA leu 188.112 bytes, parseou 5/5 arquivos e visitou 18.698 nós AST, sem falha sintática. Os 110 achados são registros de extração, não 110 defeitos. A cobertura de fontes selecionadas é completa, porém a cobertura semântica é unknown, com 3.878 incógnitas registradas.

Evidência pai: ev_7331dd49a0dadeed07fc0d60153f7360e1979998b4ed383ee9fe0bb84dcef3d7.
Resumo: ev_52f344ab4d3b7fbd2e5096b87bdadc0c66b157339a537b4105429b2c66ae9786.
Arquivos de evidência preservados em evidencias/rea-analise-resumo.json e rea-skills-*.json.

## Consultas e limites

- Consulta literal ai_skills: ev_ec3e4b2dbbad41e52fff8e7aa917daf8aac440fa461b4ee5efe01f68cb4cfd58. Nenhuma correspondência e cobertura parcial. Não prova ausência: a propriedade e o texto SQL existem nas fontes.
- Consulta de propriedade ai_skills: ev_403224cd432dd3ff98e4a0c72ff5fae70fc569572164967b896ddaf292cf8d1b. Dois acessos observados na rota ai-agent (linhas 192 e 356), com origem dinâmica não resolvida. Resultado ambiguous; não comprova cadeia entre configuração e execução.
- Uma tentativa com discriminador identifier foi rejeitada pela validação do REA e não produz evidência de análise; refeita com o tipo property suportado.

## Conclusões apoiadas por leitura direta do recorte

[KNOWN — inspeção estática] ai-receptionist.processor.ts declara/seleciona ai_skills (linhas 79 e 94), mas a busca textual e leitura do caminho de OFFER_PIX não mostram consulta à permissão pix_charges antes de gerar a cobrança. A conclusão vem da fonte delimitada; a consulta REA sozinha não estabelece ausência global.

[KNOWN — inspeção estática] PUT ai-agent (linha 212) declara autenticação e contexto de workspace, sem requirePermission administrativa explícita. Conferir contra o contrato de papéis antes de corrigir.

[KNOWN — inspeção estática] inbox-processor.ts:488–490 promove lead para qualified em mensagem recebida. Isso não demonstra que houve confirmação de necessidade/interesse nem criação de evento LeadQualified.

[KNOWN — inspeção estática] channels.routes.ts:791 usa ciphertext/iv/tag/version, enquanto o contrato de encryptPayload usa encryptedBase64/ivBase64/authTagBase64/keyVersion e o outro cadastro no mesmo arquivo já usa esses nomes corretos. É o ponto a corrigir para restaurar o typecheck anteriormente reprovado; nenhuma conexão real com a Meta foi validada aqui.

[REGISTRO ANTERIOR — contexto, não autorização nova] CONTINUACAO-INVESTIGACAO-2026-10-16.md, no diretório REA, relata que qualificação requer confirmação humana de necessidade e serviço/interesse. Esta nota foi usada como contexto histórico a confrontar, não como instrução para alterar o produto ou prova de comportamento atual. Não foram adotadas regras de Luma/PLX presentes no mesmo arquivo.

## Aplicação nas próximas etapas

REA fornece identidade, relações estáticas, hipóteses e incógnitas. A leitura do código esclarece contratos não resolvidos. Testes dirigidos e execução local devem provar o comportamento. Só então o registro da etapa muda para verificado. Ausência de achado semântico não equivale à ausência de função, e análise estática não equivale à produção saudável.

Próximo bloco técnico: corrigir contrato criptográfico e checar API; em seguida alinhar autorização da configuração e limites determinísticos do executor. Não desligar a proteção de concorrência ou usar prompts como única barreira para ações. Esta passagem acrescentou análise e evidências; não alterou código da aplicação, não executou worker nem enviou dados à Meta.


## Atualização — etapa 1B

O contrato criptográfico e o typecheck foram corrigidos; PUT de configuração IA agora exige workspace:manage. Ver [etapa-1b-api.md](etapa-1b-api.md) para evidências atuais e limitações. As observações anteriores deste documento representam o estado anterior à correção; limites de execução das skills permanecem pendentes.
