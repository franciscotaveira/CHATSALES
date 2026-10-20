# Percurso das telas — CHAT-SALES

Data: 16/10/2026 (America/Sao_Paulo). Ambiente: laboratório local http://127.0.0.1:23400. Checkout /Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES, branch codex/iteration-2.7, HEAD 893569415f533ad9cbaf39e25122d6eb4988573a.

## Parecer de liberação

**Não recomendar liberação geral em produção do conjunto anunciado neste checkout.** Há uma base funcional aproveitável e falhas concretas de integração entre tela e API. Não há evidência para classificar tudo como ruim nem para recomendar reconstrução total. O próximo trabalho deve fechar os contratos quebrados e validar uma jornada comercial controlada, antes de ampliar capacidades.

Critérios: uma ação deve persistir; estados exibidos devem corresponder ao provedor; capacidades da IA devem ser impostas pelo executor; fechamento/pagamento devem ser rastreáveis. O laboratório comprova somente caminhos locais. Não certifica o serviço publicado nem a operação real de WhatsApp, Meta, Cakto, Pix ou modelos.

## O que foi percorrido

O mapa parte das rotas efetivamente montadas por App.tsx, páginas importadas e seus diálogos/painéis. Arquivos de reexportação não foram contados como telas independentes. Caminhos alternativos como /contatos e /contacts não representam dois módulos. A visualização do navegador nesta coleta acionou layout responsivo estreito; não é cobertura completa de desktop, todos os dispositivos, acessibilidade, todos os erros ou papéis.

Legenda: **Uso local** = ação e resultado observados com dados fictícios; **Visual** = tela/formulário aberto e inspecionado; **Falha** = ação reproduzida com resultado incorreto; **Externo pendente** = depende de provedor ou efeitos fora deste laboratório.

| Área | Telas e painéis abertos | Avaliação nesta passagem |
|---|---|---|
| Sessão | Login, erro de credenciais, menu do usuário e saída | Uso local: logout retornou ao login, senha incorreta rejeitada e login válido restaurado. Expiração e recuperação ainda não testadas. |
| Empresas | Seletor e cadastro de nova empresa | Visual. Formulário usa senha provisória fixa, exibida em claro; precisa de tratamento seguro antes do onboarding comercial. Não foi criado novo acesso. |
| Navegação | Menu lateral/mobile e busca global | Visual e ação local. “Nova Campanha de Transmissão” abre Conversões, sem abrir assistente. “Cadastrar Novo Produto” apenas navega para a listagem no código. |
| Inbox | Fila, filtros e conversa com mensagem | Uso local de leitura. A primeira renderização mostrou vazio antes da chegada dos dados; revisar estado de carregamento. Envio, sincronização e concorrência não homologados. |
| Contexto | Dados do lead, etapas, propostas, Pix e histórico de ações expandido | Visual. Histórico vazio. Não foi localizado criador de tarefas na UI examinada. |
| Ficha do cliente | Leitura e edição de dados/recorrência/observações | Uso local: empresa e observação salvas e exibidas na ficha; empresa também reapareceu na listagem de contatos. |
| Notas do cockpit | Campo e Salvar Anotação | Falha já reproduzida: salva aparente, mas texto desaparece ao reabrir. Distinto das observações do dossiê, que persistem. |
| Propostas | Criação e cartão da proposta no contexto | Uso local: rascunho criado e persistido. Falha em Marcar Enviada: 400 por ausência de expectedVersion. Bloqueia essa progressão pela interface. |
| Catálogo no cockpit | Busca, seleção individual e controles de carrossel | Visual. Envio externo pendente. Produtos demonstrativos aparecem como ofertas ativas. |
| Modelo no cockpit | Categorias, seleção, prévia, variáveis e disparo | Visual. Modelos locais oferecidos no painel denominado oficial. Disparo externo pendente. |
| Flows | Lista de três formulários | Visual. O painel abre corretamente nesta nova passagem: a tentativa anterior sem painel foi inconclusiva. Todos aparecem PUBLISHED; não há botão de envio. Sem callback onSendFlow no componente montado. |
| Pix no cockpit | Nova cobrança e lista vazia do caixa | Visual. Nenhuma cobrança/pagamento emitido. Os controles de confirmação dependem de uma cobrança e não foram homologados. |
| Radar | Lista vazia e Analisar agora | Uso local de análise sem sugestões. Conversa recente não constitui cenário de reativação; rascunho/aplicação com sugestão ainda pendentes. |
| Contatos | Lista/filtros, novo contato, ficha, edição e opt-out | Uso local: novo contato salvo, etiquetas/observação editadas e automações desativadas; removido do filtro Ativos. |
| Oportunidades | Kanban, criação, detalhes, filtros e personalização das etapas | Uso local: oportunidade criada com R$ 250 e movida a Qualificado; persistiu após navegação. Personalização inspecionada; somente localStorage conforme código. Ganho/perda e CAPI reais não homologados. |
| Produtos | Listagem, novo, edição e filtro Inativos | Uso local: produto criado com SKU LAB-TESTE-01/R$ 123,45; desativado e encontrado no filtro correto. Upload de arquivo não executado. |
| Modelos WABA | Listagem, editor manual/IA e detalhe | Uso local: modelo lab_confirmacao_ficticia salvo. Detalhe esclarece Local — não submetido à Meta; listagem o inclui em Modelos Homologados. Geração com modelo real e aprovação externas pendentes. |
| Campanhas | Relatório vazio e assistente de disparo | Visual. Assistente percorrido em disparo único, A/B, público inteligente, planilha, estágio e manual. Canal desconectado bloqueia envio. Não houve campanha ou importação de arquivo real. |
| Conversões | Indicadores, listagem vazia e Atualizar | Visual/consulta local. Ação global de nova campanha chega aqui incorretamente. Recibos populados e aceite Meta pendentes. |
| Canais | Listagem e assistente inicial | Visual. Canal sintético inativo, sem credenciais associadas. Nenhum provedor conectado. |
| Canais Meta | Token/IDs manual e opção Embedded Signup | Visual, sem autorizar Facebook ou preencher segredos. Erros de tipos do embedded permanecem no diagnóstico. |
| Canais WAHA/Evolution | Credenciais e teste/conexão | Visual. WAHA oferece URL e chave predefinidas no frontend; validade da chave não verificada. Ao voltar e trocar para Evolution, campos mantêm valores de WAHA. Segredos omitidos das evidências. |
| QR Code | Modal de pareamento do canal fictício | Visual, erro esperado: canal WAHA não tem credenciais. Não foi iniciado pareamento. |
| Equipe | Lista, novo membro e editar/senha | Visual. Proprietário protegido contra alteração de papel, mas seletor desabilitado mostra Administrador. Não foram criados usuários nem alteradas senhas. |
| Atendimento IA | Identidade, regras, objeções, fontes, habilidades, FAQ, NVIDIA e OpenRouter | Uso local: FAQ salvo; banco confirmou ai_receptionist_enabled=false. Provedor alternativo apenas inspecionado no rascunho e descartado ao navegar. Executor das skills ainda exige correção. |
| Simulador | Contexto de lead e teste rápido de informação ausente | Erro explícito 422 API Key Missing, esperado neste laboratório. Não houve avaliação de resposta nem efeito de IA real. |
| Configuração Pix | Tipo/chave, beneficiário/cidade e salvar | Visual nesta auditoria. Valores iniciais de outra empresa aparecem como padrão. Não foi cadastrada chave real. |
| API e webhooks | Instruções, endpoints e formulário novo webhook | Visual. URL base aponta origem da interface, inadequada neste laboratório com API em outra porta. Cartões com entrega/histórico dependem de destino cadastrado; envio automático não localizado estaticamente. |
| Zona de perigo | Desconectar sessão do dispositivo | Visual. Saída da conta testada pelo menu de usuário equivalente. Não houve exclusão de dados. |
| Páginas públicas | Privacidade e termos | Renderizam. Texto descreve serviços e compromissos a conferir com operação; inspeção visual não certifica conformidade jurídica. |
| Ferramentas lab | Toolbar Dev, catálogo de primitives, diálogo e drawer demonstrativos | Visual. São superfícies de laboratório, não módulos comerciais. JWT foi omitido dos registros. Não confundir exemplos de sucesso com verificações do produto. |

## Falhas confirmadas e prioridade

1. **P1 — proposta não avança pela UI.** CockpitPage.tsx:144 envia somente status; API comercial exige expectedVersion (commercial-proposals.routes.ts:50). Evidência: proposta-transicao-falha.txt.
2. **P1 — notas do cockpit não persistem.** Evidência anterior confirmada em notas-apos-salvar-reabrir.txt; dossie-salvo.txt prova que o outro caminho funciona.
3. **P1 — Flows sem operação de envio.** flows-sem-envio.txt. O rótulo PUBLISHED dos seeds não comprova publicação no WhatsApp.
4. **P1 — estados de aprovação contraditórios.** Modelo criado localmente aparece em Homologados, mas detalhe declara não submetido. modelo-local-detalhes.txt.
5. **P1 — criação de empresa com senha fixa.** Formulário e código CreateWorkspaceModal.tsx:20; senha omitida do relatório. Não foi testada sua utilização nem criada conta com ela.
6. **P2 — ações globais não abrem o destino prometido.** busca-nova-campanha-rota-errada.txt. Corrigir ação de nova campanha e distinguir navegação de criação.
7. **P2 — padrões e instruções de infraestrutura no frontend.** Campos WAHA pré-preenchidos, troca de provedor preserva valores; URL da API e beneficiário Pix precisam refletir configuração real. Não foi validada autenticidade ou vigência de qualquer credencial predefinida.

Além disso, permanecem os achados estáticos de maior risco em avaliacao-integral.md: webhook Cakto sem verificação obrigatória quando segredo ausente/curto; capacidades da IA não impostas no executor; edição de IA sem a permissão administrativa explícita; dados seed ativos; 13 erros no typecheck. Esses itens não foram convertidos em teste de ataque contra serviço público.

## Evidências de funcionamento local

- dossie-salvo.txt: empresa e observação persistidas.
- contato-editado-optout.txt: cadastro, edição e estado inativo para automações.
- oportunidade-qualificada.txt e percurso-final.png: criação e avanço no funil, com reabertura posterior.
- produto-inativo.txt: criação/edição e filtro por estado.
- modelo-local-detalhes.txt: modelo gravado e identificado como local no detalhe.
- ia-faq-simulador-sem-chave.txt: FAQ gravado, IA inativa e erro explícito por falta de chave.
- login-senha-incorreta.txt: rejeição de credenciais incorretas; sessão posteriormente restaurada.
- api-smoke.json: 27 leituras locais 200 e controles negativos 401/403 da passagem anterior. Não equivale a 27 funções completamente homologadas.

## O que ainda impede um parecer operacional completo

Não conectar produção para resolver essas pendências durante o diagnóstico. Precisamos de cenário controlado com canal de teste e destinatário autorizado para mensagem recebida/enviada, mídias/áudio, webhook, execução da IA, handoff, reativação e repetição de eventos. Pagamento deve ter origem/settlement verificáveis. Falhas/concorrência e permissões precisam ser exercitadas com perfis distintos e dois workspaces existentes. Build comercial, recursos servidos e release real precisam de gate próprio.

As páginas principais e os formulários/painéis listados acima foram percorridos; estados condicionados a dados externos (pagamento, recibos, campanhas enviadas, credenciais e sugestões) permanecem explicitamente pendentes. Não chamar este documento de homologação completa nem declarar ausência de defeitos fora dos cenários testados.

## Ordem recomendada de recuperação

1. Corrigir riscos de autorização/execução e restaurar typecheck. Corrigir proposta, notas e estados demonstrativos. Remover padrões inseguros do onboarding e da conexão.
2. Validar uma jornada curta com dados de teste: entrar → configurar empresa → conectar canal de teste → receber lead → salvar contato → responder → proposta → fechamento comprovado → histórico. Só habilitar capacidades que passarem por essa jornada.
3. Depois, aplicar Construção Guiada por Evidências na configuração do atendimento: objetivo, fontes oficiais, ações permitidas, limites, teste de cenários e versão publicada. Diferencial proposto, ainda sem validação de resultado comercial.

Nenhum código de aplicação foi alterado nesta passagem; apenas dados sintéticos e documentação do laboratório. Produção não foi modificada.


## Atualização de execução — etapa 1A

As falhas de persistência das notas do cockpit e de transição da proposta foram corrigidas no checkout e verificadas no laboratório. Os registros acima descrevem a auditoria anterior à correção. Ver [evolucao.md](evolucao.md) para critérios, evidências e limitações atuais. Demais pendências não estão encerradas.


## Atualização — etapa 1B

O contrato criptográfico e o typecheck foram corrigidos; PUT de configuração IA agora exige workspace:manage. Ver [etapa-1b-api.md](etapa-1b-api.md) para evidências atuais e limitações. As observações anteriores deste documento representam o estado anterior à correção; limites de execução das skills permanecem pendentes.


## Atualização — revisão funcional de 17/10/2026

Ver [revisao-funcional-completa.md](revisao-funcional-completa.md) para o estado mais recente dos 27 grupos, correções, testes e limites. Os achados anteriores permanecem como histórico; não usar seus estados como diagnóstico atual. A nova conferência visual ficou bloqueada pela webview do navegador; testes locais não certificam provedores reais nem liberação em produção.
