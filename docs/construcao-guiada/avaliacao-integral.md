# CHAT-SALES — avaliação integral por funções

Data da coleta: 2026-10-16. Checkout: `codex/iteration-2.7`, commit `893569415f533ad9cbaf39e25122d6eb4988573a`.

## Escopo e limites
O usuário ampliou o pedido: percorrer todas as funções antes de definir a reconstrução e os diferenciais. Este documento é o diagnóstico estático inicial e o roteiro de cobertura. NÃO representa homologação completa das funções. Cada linha exige passagem pela interface e/ou execução controlada conforme sua natureza.

Documentação local foi tratada como descrição a conferir, não evidência de funcionamento. Alterações preexistentes foram preservadas. Nenhuma configuração produtiva foi alterada.

## Leitura do produto
Há uma base de operação comercial: WhatsApp, contatos, funil, ofertas, cobrança e telemetria. A principal lacuna encontrada é a distância entre rótulos/configurações e capacidade demonstrada. Reconstruir tudo do zero não se justifica pela evidência atual: primeiro completar contratos e conexões, depois simplificar a experiência.

## Matriz de cobertura
Todos os estados abaixo são de inspeção de código; execução visual/integrada está pendente salvo registro posterior no laboratório. Caminhos abreviados de rotas referem-se a apps/api/src/routes; páginas a apps/web/src/pages.

| ID | Função | O que existe | Fonte | Lacuna ou verificação necessária |
|---|---|---|---|---|
| 01 | Login e sessão | Login por senha, JWT, alternância de empresa e logout | auth.routes.ts; hooks/useSession.ts | Testar expiração e usuários com diferentes papéis; sessão nativa guarda token no navegador. |
| 02 | Empresas e onboarding | Provisionamento, vínculos e seleção de workspace | workspace.routes.ts; CreateWorkspaceModal | Verificar permissões, isolamento entre duas empresas e cadastro vazio; onboarding ainda não demonstra prontidão por jornada. |
| 03 | Equipe e acessos | Cadastro, edição, remoção e papéis | workspace.routes.ts; settings/TeamSection | A configuração de IA não declara requirePermission, ao contrário da gestão de workspace; testar operador versus administrador. |
| 04 | Canais e conexão | WAHA, WABA, teste, QR, revogação e sincronização | channels.routes.ts; settings/ChannelWizardDialog | Typecheck falha no embedded signup, linha 791: contrato criptográfico incompatível; verificar pareamento em etapa separada. |
| 05 | Inbox e conversas | Lista, filtro, leitura, envio e alteração de status | threads.routes.ts; cockpit/hooks | Polling a cada 3,5 segundos no inbox. Verificar paginação, concorrência e troca de empresa com mensagens reais simuladas. |
| 06 | Mídias e áudio | Upload/proxy e serviço de transcrição | media-upload.routes.ts; worker/services/whisper-transcriber.ts | Dependem de armazenamento e provedor de transcrição; indisponibilidade deve aparecer ao operador. |
| 07 | Contatos e dossiê | Criar, editar, tags, observações, opt-out | contacts.routes.ts; ContactsPage; DossierDrawer | Dossiê possui persistência. Confirmar busca, atualização e isolamento no laboratório. |
| 08 | Anotações do cockpit | Textarea e botão Salvar Anotação | cockpit/ContextPanel/Notes.tsx; CockpitPage.tsx:366 | ContextPanel é montado sem notes/onSaveNotes; botão limpa estado local sem persistência nesse caminho. |
| 09 | Funil e oportunidades | Etapas, negociação, ganhos e perdas | commercial.routes.ts; opportunities | Personalização salva apenas rótulos em localStorage por workspace; não é funil compartilhado entre usuários. |
| 10 | Tarefas comerciais | API de criação, edição e histórico; listagem no dossiê | commercial-actions.routes.ts; DossierDrawer | Não foi localizado consumidor visual para createThreadAction; verificar cobertura operacional de tarefas e responsáveis. |
| 11 | Propostas | Criação, estados e vínculo com Pix | commercial-proposals.routes.ts; ProposalDrawer | Verificar transições, repetição de comandos e integridade entre proposta, cobrança e resultado. |
| 12 | Catálogo | Cadastro/edição por SKU e envio pelo cockpit | products.routes.ts; database/products.ts | GET faz seed de quatro ofertas próprias quando vazio; pode inserir produtos alheios ao negócio e alimentar a IA. |
| 13 | IA de atendimento | Identidade, prompt, regras, FAQ, objeções e contexto | ai-agent.routes.ts; ai-receptionist.processor.ts | ai_skills é selecionado mas não consultado no processador; Pix é tratado sem testar pix_charges. Catálogo do prompt não mostra IDs exigidos por OFFER_PIX. |
| 14 | Simulador de IA | Mensagem, rascunho e lead fictício | settings/AiAgentSection.tsx:297; ai-agent.routes.ts:522 | Interface não envia history; API aceita. Simulação devolve intenção de ação, sem provar efeito operacional. |
| 15 | Transferência humana | Tag gera waiting_human e motivo; IA respeita status | ai-receptionist.processor.ts | Testar retomada, disputa humano/IA e resposta que inclua simultaneamente handoff e Pix. |
| 16 | Agendamento e Flows | Etapa scheduled, switch appointments e catálogo de formulários | flows.routes.ts; database/flows.ts; CockpitDrawers.tsx:94 | Não localizado motor de agenda/disponibilidade; FlowDrawer não recebe onSendFlow. Seeds PUBLISHED usam meta_flow_* demonstrativos. |
| 17 | Templates | Biblioteca local, formulário e geração por IA | templates.routes.ts; database/templates.ts | Seeds marcados APPROVED sem metaTemplateId; cadastrar localmente não prova aprovação Meta. Alegações de economia e classificação automática exigem revisão oficial antes do uso. |
| 18 | Disparos e importação | Preflight, públicos, planilha, variantes A/B e fila | broadcasts.routes.ts; BroadcastTemplateDialog | Verificar deduplicação, opt-out, limites, cancelamento e rastreamento no provedor sintético. |
| 19 | Relatório de campanhas | Entrega, leitura, resposta, Pix e vencedor A/B | broadcasts.routes.ts:402; CampaignsList | Atribui Pix por contato e paid_at >= sent_at, sem exclusividade entre campanhas ou janela final. A mesma venda pode aparecer em campanhas diferentes. |
| 20 | Pix e caixa | Cobrança, QR, confirmação manual e webhook | pix.routes.ts; pix-webhook.routes.ts; PixDrawer | Webhook falha fechado sem segredo; replay em memória. Testar falha transacional seguida de retry e duplicação. Pagamento real não testado. |
| 21 | Cakto | Webhook de compra aprovada e abandono | cakto-webhook.routes.ts:110 | Sem segredo ou com segredo curto, bloco de verificação é pulado e processamento continua. Refund/chargeback descritos na documentação não aparecem nos handlers examinados. |
| 22 | Conversões Meta | Eventos comerciais, fila, dispatcher e recibos | commercial.routes.ts; capi-dispatcher.ts; campaigns/CampaignsPage | Revalidar evento versus pagamento comprovado; estado ACCEPTED não comprova atribuição publicitária. UI suprime erro de consulta. |
| 23 | Radar | Sugestão, versão e aplicação de rascunho | integration.routes.ts; RadarDrawer | Base útil de supervisão humana; testar elegibilidade, configuração habilitada e versão desatualizada. |
| 24 | Integrações/webhooks de saída | Cadastro, assinatura, ping e histórico | outbound-webhooks.routes.ts; settings/IntegrationsSection | Chamadas de recordWebhookDelivery localizadas apenas no teste manual; não localizado dispatcher de eventos comerciais nesse código. |
| 25 | Billing SaaS | Componente estático Plano Pro / Ativo | settings/BillingSection.tsx | Componente não aparece nas abas atuais de Settings; não comprova cobrança recorrente, saldo ou renovação. |
| 26 | Navegação e experiência | Busca global, layouts responsivos e páginas legais | App.tsx; PublicLegalPage; UI CommandPalette | Build lab passa; bundle JS ~1,72 MB (~393 KB gzip). Verificar mobile, estados de falha, acessibilidade e busca em dados incompletos. |
| 27 | Infraestrutura e entrega | RLS, filas, logs, health/ready e migrações | database/migrations; api/index.ts; worker/index.ts | API pública sem resposta nesta coleta; infraestrutura descrita em migração. Laboratório isolado ativo; ver atualização de execução abaixo. |

## Prioridades propostas

### P0 — integridade antes de ampliar uso
- Corrigir contrato criptográfico do embedded signup e restaurar typecheck (13 diagnósticos).
- Fazer webhook Cakto rejeitar configuração ausente e validar identidade/evento antes de registrar venda; não houve teste ofensivo no serviço público.
- Impor capacidades da IA no executor, especialmente geração Pix; revisar autorização da edição da IA.
- Eliminar produtos demonstrativos e estados APPROVED/PUBLISHED automáticos em jornadas comerciais.

### P1 — completar o que a interface oferece
- Persistir notas do cockpit; ligar envio de Flow a um registro publicado verdadeiro.
- Compartilhar configuração de funil por workspace.
- Diferenciar intenção de agendamento, reserva e pagamento; definir agenda ou integração real.
- Entregar eventos reais nos webhooks de saída com histórico/retry, além do ping.
- Definir regra de atribuição que não some uma venda várias vezes como receita exclusiva.

### P2 — diferencial a validar com o usuário
Proposta: cada empresa configura seu atendimento por conversa, vê cenários, valida ações e publica uma versão rastreável. O cockpit mostra onde a jornada parou e qual ação resolve. Cada capacidade tem estado configurada/testada/operacional, com a evidência correspondente. Isso aproveita IA, Radar, CRM e pagamentos existentes.

Critérios para testar o diferencial: tempo até primeiro atendimento correto; quantidade de correções; taxa de ação concluída; transferências com contexto suficiente; confirmações falsas; tempo para encontrar e resolver falhas. São métricas propostas, ainda sem linha de base.

## Evidências executadas
- 39 testes passaram em seis arquivos: domínio, composição de prompt, hash de senha e sanitização de planilha/telefone. Log em evidencias/testes-locais.log. Não é a suíte completa nem E2E.
- Typecheck: 17 tarefas bem-sucedidas de 18; falha na API com 13 erros em channels.routes.ts. Log em evidencias/typecheck.log. O comando também construiu dependências pelo grafo Turbo.
- Build de distribuição lab do frontend passou. Log em evidencias/web-build.log.
- Transpilação da API passou; isso não invalida os erros de tipos.
- localhost:4400/health e /ready recusaram conexão; domínio público /health e /ready atingiram timeout de 8 segundos por consulta. Isso descreve a observação desta máquina, não prova indisponibilidade universal.

## Laboratório e próxima fase
Usuário autorizou preparar laboratório local isolado. Compose próprio, rede Docker interna, volume novo, portas loopback, sem credenciais externas nem worker de envio. Registro operacional em laboratorio/README.md quando a inicialização for validada.

Percurso visual: login/empresa → canais → contatos → inbox/dossiê/notas → oportunidades/tarefas/propostas → catálogo → IA/simulador/handoff → Flows → templates/disparos → Pix → conversões/Radar → integrações → equipe/configurações. Registre sucesso, falha e não testado por etapa. Integrações externas exigem etapa própria; laboratório não certifica Meta, WhatsApp, banco, Cakto ou modelos reais.


## Atualização — laboratório e percurso visual em 2026-10-16

[KNOWN] Laboratório disponível em http://127.0.0.1:23400, API em http://127.0.0.1:24400. Login, leitura da conversa fictícia e prontidão PostgreSQL/Redis confirmados. Instruções em laboratorio/README.md.

### Cobertura desta passagem
| Grupos da matriz | Evidência local obtida | Limite que permanece |
|---|---|---|
| 01, 02, 03 | Login; workspace; listagem do proprietário; API sem login 401 e workspace não autorizado 403 | Expiração, criação de empresa, segundo tenant existente e permissões por papel ainda pendentes |
| 04 | Aba canais; API consulta canais e preflight | Canal fictício inativo; QR, conexão e sincronização externas não executados |
| 05, 07 | Inbox mostra contato e mensagem; filtro Todas; ficha de contato | CRUD completo, paginação e concorrência pendentes |
| 08 | Nota digitada → Salvar Anotação → fechar → reabrir: campo vazio | Falha de persistência reproduzida; não corrigida |
| 09 | Página oportunidades e diálogo de personalização abertos; API journeys 200 | Criação/transições e compartilhamento entre operadores pendentes |
| 10, 11 | Histórico e propostas aparecem no contexto; APIs de ações e propostas 200 vazias | Ciclo de criação/edição pendente |
| 12 | Catálogo exibiu quatro produtos ativos sem cadastro manual | CRUD/envio pendentes; seed automático confirmado |
| 13, 14 | Toda a configuração de IA, habilidades e simulador inspecionados visualmente | Nenhum LLM conectado; respostas e efeitos não homologados |
| 15 | Inspeção estática do executor | Transferência e retomada integradas pendentes |
| 16 | API flows 200 com três itens; botão Flow acionado, sem painel visível nessa tentativa | Reproduzir abertura e envio; agenda real ausente na inspeção estática |
| 17, 18, 19 | Modelos WABA e Campanhas A/B abertos; quatro modelos locais; preflight/audiência/campanhas consultados | Nenhum disparo feito; aprovação Meta e atribuição real não testadas |
| 20 | Configuração Pix e contexto da conversa abertos; API cobranças 200 vazia | Emissão, confirmação e pagamento não executados |
| 21 | Inspeção estática de Cakto | Webhook e eventos reais não executados |
| 22 | Tela Conversões aberta; consulta 200 vazia | Despacho/aceite/atribuição externos pendentes |
| 23, 24 | APIs candidatos/sugestões 200; configuração API/webhooks inspecionada | Aplicar sugestão, entrega automática e retries pendentes |
| 25 | Componente billing identificado estaticamente, ausente nas abas atuais | Sem jornada operacional para homologar |
| 06, 26, 27 | Navegação responsiva, menus, health/ready e isolamento Docker | Mídia/áudio não testados; desktop e acessibilidade completos pendentes |

### Achados observados na interface
- [KNOWN] Notas comerciais desaparecem ao reabrir após salvar. Evidência: evidencias/notas-apos-salvar-reabrir.txt e laboratorio-contexto.png. Confirma a falta de callback identificada no código.
- [KNOWN] Catálogo recém-inicializado exibe quatro ofertas próprias como ativas (catalogo-seed.png).
- [KNOWN] Tela de modelos diz “Templates oficiais pré-aprovados” e “Modelos Homologados”; cartões aparecem como “Local”. Essa linguagem mistura cadastro local com estado externo não demonstrado.
- [KNOWN] Tela da IA afirma “Impede que a IA invente”, “nunca inventa” e “fidelidade total”. São promessas da interface, não resultados de avaliação. O executor e os testes disponíveis não sustentam garantia absoluta. Snapshot em evidencias/ia-interface.txt.
- [KNOWN] Integrações mostra URL base da interface (porta 23400), enquanto a API deste laboratório usa 24400. A orientação precisa respeitar a configuração da API quando as origens diferem.
- [KNOWN] Configuração Pix inicia com nome MCT SOS SALES e cidade CHAPECO; precisam ser tratados como exemplos ou substituídos antes de uso por outra empresa.

### Resultado do smoke
27 consultas GET retornaram 200; dois controles negativos retornaram 401 sem login e 403 para workspace não autorizado. O primeiro pedido audience-count sem parâmetro retornou 400 corretamente; após informar type=ALL_CONTACTS, retornou 200. Evidência final: evidencias/api-smoke.json. Isso prova alcance e leitura desses caminhos, não homologação de todos os 88 endpoints.

### Próxima etapa guiada
O laboratório está pronto. Prosseguir com cenários completos por módulo, começando pela entrada da empresa e configuração do atendimento: resultado desejado, dados oficiais, ações permitidas, limites e transferência humana. Antes de alterar módulos, definir o comportamento esperado e o critério verificável. Preservar a matriz de 27 grupos e manter pendências explícitas; esta passagem não encerra a auditoria integral.


## Continuação — percurso detalhado das telas

O pedido de percorrer as telas foi executado com testes de cadastro/edição no laboratório. Ver [percurso-telas.md](percurso-telas.md) para cobertura por superfície, sucessos observados, novas falhas e limites. Proposta foi criada, mas Marcar Enviada falhou por expectedVersion ausente. Contatos, dossiê, oportunidade, produto, modelo local e FAQ tiveram salvamentos observados. O painel Flow abriu e confirmou ausência da ação de envio; a tentativa anterior sem abertura foi inconclusiva. Não há recomendação de liberação geral do conjunto neste checkout, nem justificativa demonstrada para reescrita total.


## Atualização de execução — etapa 1A

As falhas de persistência das notas do cockpit e de transição da proposta foram corrigidas no checkout e verificadas no laboratório. Os registros acima descrevem a auditoria anterior à correção. Ver [evolucao.md](evolucao.md) para critérios, evidências e limitações atuais. Demais pendências não estão encerradas.


## Atualização — etapa 1B

O contrato criptográfico e o typecheck foram corrigidos; PUT de configuração IA agora exige workspace:manage. Ver [etapa-1b-api.md](etapa-1b-api.md) para evidências atuais e limitações. As observações anteriores deste documento representam o estado anterior à correção; limites de execução das skills permanecem pendentes.


## Atualização — revisão funcional de 17/10/2026

Ver [revisao-funcional-completa.md](revisao-funcional-completa.md) para o estado mais recente dos 27 grupos, correções, testes e limites. Os achados anteriores permanecem como histórico; não usar seus estados como diagnóstico atual. A nova conferência visual ficou bloqueada pela webview do navegador; testes locais não certificam provedores reais nem liberação em produção.
