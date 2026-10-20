# Estado da revisão UI/UX — CHAT-SALES

Atualizado em 18/10/2026, após UX432; regressão web concluída. Objetivo geral ativo e parcial. Este índice organiza evidências; não substitui o inventário dos 27 grupos nem declara aprovação para produção.

Fontes: [inventário histórico dos 27 grupos](revisao-funcional-completa.md), [decisões do atendimento](atendimento-ia.md), [registro incremental e evidências](ui-ux.md). O MVP de configuração descrito em mvp-0.1.md tem alcance próprio; sua aprovação não aprova o executor inteiro.

| Área | Evidência recente | Falta comprovar ou construir |
|---|---|---|
| Atendimento e fila | UX393–405: mensagens sem texto preservadas na API e na prévia; estados da fila recolhida; validação de registros; indicadores sem confirmação financeira presumida; teclado e foco móvel conferidos | Mídia real do provedor, todos os estados de erro e leitores de tela físicos não homologados; teste de componente não comprova transferência ou liquidação |
| Equipe | UX425–431: integridade da equipe e fila, confirmação de cadastro/perfil/remoção/atribuição, foco de atualização conferido no laboratório; regressão UX432 | Permissões ajustáveis por equipe e ciclo completo de concessão/revogação de acesso ainda precisam de conferência própria |
| Integrações e fila | UX415–423: registros e paginação validados; confirmação de cadastro/alteração; declaração de duplicidade; resultado de Ping; foco das consultas. Fixtures inativas e consulta vazia conferidas com API do laboratório | Falhas simuladas nos componentes; nenhum Ping, ativação, recebimento n8n/ERP ou entrega externa foi homologado nesta rodada |
| Funil | UX335–339: resposta de personalização, nomes, bloqueio de estado desconhecido, limite de valor na UI e API; testes de componentes e banco isolado | Múltiplos funis e distribuição avançada são evolução; correções de dados corrompidos não foram exercitadas na UI real |
| Campanhas e relatório A/B | UX407–409: variantes e paginação protegidas contra dados incompatíveis; comparação sem contadores confirmados não destaca vencedora/empate; layout conferido em 320px | Envio/entrega reais, atribuição externa e coerência estatística completa ainda não homologados |
| Conversões | UX410–414: linhas e paginação validadas, foco após atualização/última página e detalhes conferidos em 823/1024px; 51 eventos simulados consultados | Aceite e atribuição reais na Meta não comprovados; detalhes e retornos adversos continuam com cobertura parcial |
| Propostas e resumos de cobrança | UX340: nomes acessíveis contextuais; regras anteriores preservadas e testes focados | Não comprova liquidação, entrega, estoque ou aceite real; leitor de tela real ainda pendente |
| Configuração Pix e rascunhos | UX433–436: confirmação dos campos salvos, foco de atualização e revisão antes de atualizar acesso; aviso/retorno à edição conferidos no laboratório | Respostas adversas exercitadas em mocks; nenhuma chave real salva nem liquidação comprovada |
| Configuração e testes de IA | UX324–327: integridade do plano e resultados, preservação na atualização | Modelo/provedor real e todas as decisões operacionais não são comprovados por simulação nem plano aprovado |
| Layout e teclado | UX369–389: correções e conferências em 320/474/1024/1440px; UX403–405: histórico por Tab/Page Up e foco ao abrir/voltar no atendimento móvel | Percurso integral de cada tela/estado, aparelhos físicos e tecnologias assistivas reais ainda sem homologação completa |
| Conexão de contas, mídia e mensagens | UX437–446: integridade da lista, foco de atualização, confirmações das ações e das revisões Meta/Evolution, cadastro manual e integrado; demais fluxos conforme inventário e percurso | QR/Embedded Signup, entrada/saída, arquivos e callbacks reais exigem jornada autorizada e recibos de provedor; validação da lista não comprova conexão |
| Capacidades de evolução | Decisões D01–D108 e inventário histórico | Estoque/agenda externos, identidade entre canais, billing, busca completa do CRM e demais capacidades ausentes precisam de implementação e aceite próprios |

## Ordem de continuidade

1. Conferir visualmente as telas alteradas desde a última passagem, mantendo cenários sintéticos e sem envio externo.
2. Completar revisão dos controles dinâmicos e dos formulários com cobertura rastreável por fonte; inventário estático de botões não é aprovação de acessibilidade.
3. Revisar integridade restante dos dados do relatório A/B e demais listas, sem inventar zeros ou resultados.
4. Executar jornadas externas somente com contas/destinatários de teste e autorização específica quando a ação exigir. Ausência dessa evidência impede homologação daquele fluxo, mas não impede trabalho local.
5. Retomar capacidades faltantes contra a especificação, sem tratar correções defensivas como entrega delas.

Os testes de regressão verificam os casos codificados. Builds e REA estático não substituem execução de ponta a ponta. Publicação em produção não foi realizada nesta rodada.

Regressão web UX344: 1.014 testes/83 arquivos aprovados, processo exit0. Manifesto de244fontes com hashes conferidos ao fim. A primeira execução falhou somente na expectativa antiga da mensagem de valor; log preservado. Esta execução não homologa serviços externos.

Percurso visual UX345: Modelos(8rascunhos),Campanhas(1cancelada,0destinatários),Funil(2registros),personalização de etapas e detalhe consultados em823×804 sem edição. Relatório A/B não presente na fixture; seus cenários inválidos continuam apenas em testes.

UX346 acrescentou fixture A/B cancelada sem destinatários: UI real confirmou variantes e Sem base para zero entregas. Continua sem homologação de envio ou resultado A/B real.

UX347–348: Radar ganhou consulta separada da análise;21testes focados e build,botão/rodapé conferidos em823×804 e consulta vazia atualizada sem Analisar agora.

Regressão UX355:1.041 testes/83arquivos aprovados após completar fixture antiga do Radar. UX349–354 reforçaram preservação de leitura,confirmação de decisão,integridade de consulta,retorno de análise e resultado de salvar ficha; validação principalmente em mocks/happy-dom,com limites no registro incremental.

UX356–357: leitura da identidade da ficha validada;51testes focados/build. UI atual percorreu consulta,entrada em edição/cancelamento intacto e histórico de tarefa sintética concluída em823×804,sem gravação.

## Rodada de consultas UX358–364

| Área | Comportamento corrigido | Evidência focada |
|---|---|---|
| Catálogo do atendimento | Lista incompatível não vira vazio; conferência pré-envio preserva revisão | catalog-query-integrity-tests.log |
| Contatos e Produtos | Consulta só publica lista após conferir array | main-list-envelope-tests.log |
| Equipe e Integrações | Resposta incompleta não confirma configuração nem libera gestão dependente | settings-list-envelope-tests.log |
| Modelos e seletor do atendimento | Resposta incompleta não aparece como ausência de modelos | template-list-envelope-tests.log |
| Campanhas e Conversões | Indicadores não são confirmados por resposta incompleta; paginação preserva registros | report-list-envelope-tests.log |
| Canais e preparo de disparos | Conjunto de canais/modelos/contagem é conferido antes de publicar preparo | preflight-list-integrity-tests.log |
| Propostas no cockpit | Falha preserva cartões e exige consulta válida antes de decisões | proposal-list-envelope-tests.log |

A busca literal pelos 16 casos identificados de `res/result/response.campo || []` ficou sem ocorrências no recorte de fontes web. Isso encerra esse levantamento específico: não cobre aliases, `?? []`, respostas indiretas, linhas malformadas ou todas as operações da ferramenta. A conferência visual das mudanças desta rodada e as jornadas reais de provedor permanecem parciais.

Regressão UX365:1.066 testes/83arquivos aprovados em54.22s,exit0;manifesto244fontes conferido ao final. Houve mudanças posteriores, registradas abaixo; essa execução não certifica a árvore atual inteira. Não equivale a homologação visual integral ou de serviços externos.

UX366: preparo de disparo conferido com resposta válida da API do laboratório,4canais/8modelos;canal desconectado manteve revisão bloqueada,saída sem edição restaurou foco. Sem disparo.

UX367–368: retorno de foco na atualização manual do Radar corrigido(53testes/build) e confirmado porReturnno navegador;fechar também devolveu foco ao acionador. Sem análise real.

## Revisão móvel UX369–374

Prévia de laboratório adicionada em /dev/ui. Documento interno medido em 320 e 390px; não é dispositivo físico. Corrigidos nome comprimido por status em Contatos, filtro excedente em Oportunidades, botão Novo Modelo cortado, menu do usuário fora da tela e controles largos do rascunho da IA. Builds das fontes afetadas aprovados; REA e capturas em evidencias/; detalhes no registro incremental.

Em 320px: formulário Nova Oportunidade, preparo de disparo e início de conexão de canal abertos/fechados sem criar dados. Meta/WAHA/Evolution selecionados no formulário inicial. Revisões de canais Meta e Evolution fictícios consultadas, sem confirmação ou consulta ao provedor. Formulário Pix consultado, sem edição. Cabeçalhos de Produtos/Conversões e detalhe de evento simulado inspecionados. Isso não comprova todos os formulários, estados de erro, dados longos, dispositivos ou jornadas externas. Demais partes do inventário continuam abertas conforme seu nível de evidência.


UX375–376: histórico do lead ajustado e conferido320px;formulário Produto consultado sem edição. UX377–378: objetos necessários e contadores obrigatórios das campanhas validados antes de publicar;percentuais regulares inválidos sinalizados. Relatório A/B válido conferidoUX377;novo comportamento de dados inválidos comprovado em testes. RegressãoUX379:1078testes/83arquivos aprovados,363.15s,exit0;246fontes com hashes verificados. Logs de conexão recusada4400/SDKbloqueado são limites do ambiente simulado,sem falha final. Jornadas externas e demais requisitos do inventário continuam pendentes.


UX380–384:destinatários validam envelope/contadores/linhas e recuperam foco apósconsulta(20testes focados/build/confirmação nativa). Busca de campanhas mantém foco ao buscar/limpar(34testes/build/UI). Editor de modelos não atribui exemplo pronto àIA e valida estrutura de geração antes da prévia(28testes/build/REA;retornos inválidos simulados). São mudanças posteriores àregressão completaUX379;essa suíte não certifica automaticamente a árvore nova. Referência visual do Belasis registrada sem copiar dados pessoais,com execução inferida separada do observado.


UX385–391:busca global descreve funções atuais e foi conferida1440px;catálogo/contatos/funil validam identidade/estrutura de registros antes de publicar(51/59/53testes focados,respectivamente). Funil móvel usa uma coluna;desktop mantém seis etapas com rolagem interna e teclado,conferido320/474/1024/1440px. Confirmação de etapa e desfecho no detalhe e arraste exige retorno compatível;movimento aplica apenas campos da ação(50testes em5arquivos na última rodada). Builds/REA/evidências no registro incremental. Essas execuções não são soma de testes únicos nem prova de operações externas. Regressão completaUX379precede essas mudanças e não certifica a árvore atual inteira.


UX392: Regressão completa web concluída: 1118 testes em 83 arquivos aprovados, 110.77s, exit 0. Manifesto de 247 fontes conferido após a execução, sem alterações. Evidências: ui-review-regression-392-full.log e ui-review-regression-392-sources.json. Logs do SDK Meta bloqueado no ambiente de testes não produziram falha final. Essa execução cobre testes automatizados da web; não comprova conexão real de contas, entrega de disparos, pagamento, agenda externa ou comportamento de IA em produção. Escopo geral permanece parcial e a revisão por função continua necessária.


UX393: O cabeçalho afirmava falta de informação no catálogo/FAQ quando handoffReason estava ausente. Agora apresenta Motivo não informado, inclusive para texto vazio ou apenas espaços, e mantém a razão registrada quando presente. Cinco casos novos verificam ausência/preservação; 13 testes do componente aprovados, build lab exit 0. REA estático do componente: 1483 nós AST, 24 observações, 0 erros de parsing. Evidências handoff-reason-tests.log, handoff-reason-build.log e handoff-reason-rea.json. Sem alterar atendimentos ou transferências reais. A nova cópia foi verificada por testes de componente, não por uma transferência integrada no navegador. Revisão geral permanece parcial.


UX394: No trilho recolhido, mensagem inbound era descrita como aguardando atendimento sem pedido humano registrado. Agora o nome acessível/title distingue Última mensagem recebida do cliente de Aguardando atendimento humano. Botões recebem aria-label e aria-pressed para identificar a seleção; nome em branco usa telefone. Teste cobre três estados e seleção do contato; 11 testes em 2 arquivos aprovados e build lab exit 0. REA: 1673 nós AST, 28 observações, 0 erros de parsing. Navegador 1440×900 confirmou nomes distintos e seleção de conversa fictícia (estado acessível 0→1), consulta de mensagens/contexto concluída, sem envio. Dimensões restauradas. Captura inbox-rail-states-desktop.png; demais evidências inbox-rail-states-*. Jornadas externas continuam não verificadas; revisão geral parcial.


UX395: A versão recolhida retornava antes dos avisos da fila, escondendo falhas/atualização e a existência de páginas adicionais. Agora mantém aviso de revisão que expande a lista, status acessível de atualização, aria-busy e controle para expandir quando há mais conversas. Não executa retry/carregamento implicitamente. 9 testes aprovados, incluindo falha+carregamento+cobertura parcial e abertura por controles; build lab exit 0. REA 1801 nós AST,29 observações,0 erros de parsing. Navegador1440×900 confirmou o indicador de mais conversas e sua abertura para fila50+;captura inbox-rail-feedback-expanded.png. Falhas simuladas nos testes,sem interromper API para criar erro no navegador. Dimensões restauradas474×710. Evidências inbox-rail-feedback-*. Objetivo geral parcial.


UX396: A prévia tratava lastMessage existente sem body preenchido como Sem mensagens. Agora diferencia Mensagem sem texto de conversa sem última mensagem, preservando conteúdo textual e indicador de direção; não presume mídia/tipo que o contrato da fila não informa. Três casos novos verificam corpo vazio, espaços e ausência de mensagem. 15 testes em2arquivos aprovados;build lab exit0. REA603nósAST/16observações/0parse. Evidências inbox-message-preview-*. Conferência de dados vazios por testes de componente;sem alterar mensagens ou fixtures na base para reproduzir o caso. Revisão geral parcial.


UX397: Leitura de cada página agora confere lista, idnão vazio/único na página, telefone textual,nome nullable/textual,estado conhecido e corpo/direção da última mensagem quando presente. Metadados de paginação presentes exigem hasMoreboolean e cursor textual/data válida;continuação exige cursor. Falha preserva conversas consultadas e usa recuperação existente. Metadados ausentes continuam compatíveis com contrato opcional legado;isso não comprova completude de resposta sem paginação. Não é validação de todo schema/campos opcionais. 22testes/2arquivos focados e44testes/4arquivos relacionados aprovados;7casos novos. Primeira rodada relacionada3falhas por fixture{id};completada com identidade/telefone/estado/mensagem compatíveis sem relaxar isolamento/ordem/retry. Logs iniciais preservados. Buildlabexit0;REA2317nósAST/18observações/0parse. Evidências inbox-response-integrity-*. Falhas por mocks;sem alterar dados ou derrubar API. Revisão geral parcial.


UX398: Validação da fila estendida a handoffReason textual e nextAction com identidade/título/status textuais não vazios e dueAt nullable ou data textual válida. Evita motivoobjeto no cabeçalho, títuloobjeto na lista e data inválida em tarefa. Falha mantém consulta anterior e recuperação existente. Três novos casos de corrupção;40testes/3arquivos aprovados,buildlabexit0,REA2431nósAST/18observações/0parse. Evidências inbox-context-integrity-*. Cenários inválidos simulados em testes,sem modificar dados reais. Não valida todos os campos opcionais. Próxima pendência identificada em threads.routes.ts:formatThread usa truthiness de last_message_body para montar lastMessage;conferir representação de mídia sem texto e relação com consulta SQL antes de corrigir. Objetivo geral parcial.


UX399: Inspeção SQL listCommercialThreads confirmou LEFT JOIN LATERAL de messages,created_at não nulo quando há mensagem. formatThread usava truthiness do corpo e ocultava mensagens existentes sem texto. Agora usa last_message_created_at como presença e normaliza corpo null para string vazia,conservando direção/data/status. Mesmo formatador atende lista e detalhe. Quatro testes unitários de projeção aprovados:corpo null/vazio,texto e nenhuma mensagem. BuildAPIexit0;REA1898nósAST/17observações/0parse. Evidências thread-preview-projection-*. Sem migração nem alteração de mensagens. API do laboratório não reconstruída/reiniciada nesta etapa;resultado integrado de mídia real ainda não comprovado. A correção complementaUX396,mas não adiciona tipo de mídia àprévia. Objetivo geral parcial.


UX400: API isolada chat-sales-guided-lab-api-1 reiniciada para carregar dist recém-compilado (montagem local readonly),sem tocar VPS/produção/outros serviços. Health respondeu live após breve502 durante partida. Criada fixture SIM_UI_MIDIA_SEM_TEXTO — sem envio:1contato/1thread/1mensagem inbound image sem corpo,sem arquivo real;canalWAHAinativo. SQL confirmou1inbound/0outbound/1bodyNULL. Tela inicialmente carregada com bundle antigo ainda mostrava Sem mensagens;apósreloaddawebatual,prévia Mensagem sem texto e indicador de recebida confirmados;conversa vazia mantém Sem mensagens. Captura thread-preview-integrated-lab.png em474×710. Isso confirma projeçãoDB→API→fila com fixture local,sem comprovar recebimento de mídia pelo provedor ou render de arquivo real. IDs sintéticos e399 registram correção de fonte;nenhuma alteração de código nesta etapa. Objetivo geral parcial.


UX401: Inspeção de MessageBubble mostrou selo Recibo Pix Confirmado dirigido apenas por metadata.source, inclusive inbound. Agora mensagem recebida não ganha decoração de confirmação/cobrança;outbound com sourcepix_confirmation é rotulada Mensagem de confirmação Pix,sem selo afirmar liquidação. Cobrança requer idtextual não vazio. agentName objeto não entra no JSX nem comprova autoria;fallbackIAAtendente quando source conhecido. Três casos novos,31testes aprovados,buildlabexit0;REA2652nósAST/27observações/0parse. Evidências message-provenance-labels-*. Testes de componente com metadados simulados,sem registrar pagamento ou enviar mensagem. Não transforma metadados em prova financeira nem modifica mecanismo de confirmação de pagamento. Aviso de mídia sem arquivo já existia e foi preservado. Objetivo geral parcial.


UX402: needsHandoff usava Boolean e aceitava stringfalse/objeto/número como solicitação. Agora exige===true. Selo Transbordo substituído por Encaminhamento solicitado,comtitleexplicando que é registro da mensagem e estado atual deve ser consultado no cabeçalho. Inspeção ai-reply-writer confirmou metadata boolean de intenção registrada,não depende de interpretar texto da conversa. Sete cenários novos (6ambíguos+true),38testes aprovados,buildlabexit0;REA2655nósAST/27observações/0parse. Evidências message-handoff-intent-*. Verificação por testes de componente;sem transferir conversa,gerar mensagem ou afirmar atendimento humano executado. Objetivo geral parcial.


UX403: Região log de MessageList tinha tabIndex=-1,excluindo histórico da navegação sequencial porTab. Agora tabIndex0 permite alcançá-la para rolagem nativa por teclado,sem alterar acompanhamento automático ou botão Ver novas mensagens. Buildlabexit0;REA776nósAST/15observações/0parse. Testes de estados de consulta executados em message-history-keyboard-tests.log;conferir sumário. Verificação nativa de rolagem ainda pendente:durante navegação,lab exibiuOffline/timeout e preservou50conversas com aviso;ready não respondeu em10s. Dockerstats mostrouAPI136.09%CPU/54.55MiB eDB26.17%CPU;isso é observação,não diagnóstico da causa. Não reiniciados serviços por timeout nem alteradas conexões. Próximo passo:conferir disponibilidade/causa da lentidão e validarTab+rolagem na conversaSIM_PAGINACAO_003,além da volta àfila no celular ainda pendente. Evidências message-history-keyboard-*. Objetivo geral parcial.


ComplementoUX403:health voltou alive sem reinício;webrecarregada eSIM_PAGINACAO_003buscada/aberta. TabapósExibircontextodoleadfocouregiãologMensagensdaconversa;PageUpmantevefocoeroluouscrollTop5886.5→5697. Capturamessage-history-keyboard-lab.png. 7testesdeconsultasaprovados. Verificaçãonativaderolagemconcluída. VoltarparaafilaporEnterretornouBODY;resta corrigir recuperação de foco da navegação móvel. Semenvio/ediçãodemensagens.


UX404: Voltarparaafilano celular desmontavaaconversaedeixavafocoBODY. Cockpitagoraregistraidpara retorno,limpa-o ao selecionaroutra conversa/trocarempresa,epassaàfila. InboxListrecuperafoconalinhaconsultadaouinputdebusca seausente,apenasquandoactiveElementéBODY;outrocontroleativoépreservado. Wrapperporlinhaidentificaalvo sem interpolação de seletor. Primeira rodada46/47:ListItemédivrolebutton,e seletor buscavaapenasbutton;corrigidoparaambos. Rodadafinal47testes/3arquivosaprovados,incluindo3cenáriosdefoco. Buildfinalexit0;REA2fontes6276AST/102observações/0parse. No navegador474×710,abrirfixtureSIM_UI_MIDIA_SEM_TEXTOeVoltarporEnterrestauroufocoaorolebuttoncomdata-thread-ide9999400-0000-4000-8000-000000000002. Capturainbox-return-focus-lab.png. Evidênciasinbox-return-focus-*. Semenvio/mudançadeconversa. Objetivogeralparcial.


UX405: Ao abrir conversa na vista de painel único,foco ficavaBODYapósdesmontarlinha. Nomecontatoagorah2 comtabIndex-1,recebefoco preventScroll emmobile/novaidentidade somente seactiveElementBODY. Outrocontroleativoépreservado. Nome completo mantém semântica de título comestiloprévio. Dois testes novos;15testes aprovados,buildlabexit0;REA1540AST/25observações/0parse. Navegador474×710confirmouactiveElementH2textoSIM_UI_MIDIA_SEM_TEXTO — sem envioapósabrirfixture. Capturaconversation-opening-focus-lab.png. Semenvio/edição. Evidênciasconversation-opening-focus-*. Objetivogeralparcial.


UX406: Regressão web completa apósUX393–405:1153testes/83arquivos aprovados,88.61s,exit0. Manifesto de247fontes conferido ao final sem alteração. Logs do SDKMetaemhappy-dom são limitações do ambiente simulado,sem falha final. Evidências ui-review-regression-406-full.log e ui-review-regression-406-sources.json. Índice de cobertura atualizado com atendimento e teclado móvel;inventário histórico dos27grupos continua referência de escopo. Essa suíte não comprova recebimento/envio em canal real,liquidação,ERP/n8n,agenda ou provedor real de IA. Próximo recorte local:integridade restante de variantes e paginação no relatório de campanhas;sem ativar disparo. Objetivo geral ativo/parcial.


UX407: VariantesA/Btinhamcontadores/rótulosdiretamenteemJSX. Agora contagens ausentes,negativas,fracionárias ou não numéricas mostram Não informado;quantidadedevendasinválidanãovira nullvendas. templateName/category/salesFormattedpresentes incompatíveis rejeitamconsultaantesdapublicação,preservandodadosanteriores. Comparação comcontadores sent/delivered/read/replied não confirmados não destaca vencedor/empate. TaxascontinuamcomobservedRateexistente. Seiscasosnovos;rodadainicial38testespassou,refinamentodacomparaçãoadicionou2casos. Rodadafinal40testesaprovados,buildfinalexit0;REA7454AST/39observações/0parse. Evidências campaign-variant-integrity-*,incluindologsintermediários. Retornoscorrompidossimuladosporcomponentes,semalterarcampanhas/base/provedor. Não verifica coerência estatística inteira nem causalidade/atribuição. Paginação restante é próximo recorte. Objetivo geral parcial.


UX408: Paginação de campanhas usava truthiness de hasMoree cursor sem validar estrutura/data. readCampaignCursor agora exige boolean quando metadados presentes,cursor com idnão vazio/data válida,e não aceita página vazia afirmando continuação. Aplicado àatualização e carregar mais;falhas seguem preservação/retry existentes. Paginação ausente mantémcompatibilidade com contrato legado opcional,não comprova completude sem metadados. Cinco casos novos:hasMoretextual,cursordata/id/ausente e página vazia. Primeira execução92/95,3falhas porfixtureSIM-date;fixturesdecontinuacaopositivasemcampaign-sales-basis e broadcast-uxcompletadas comISOválido,sem alterarcenáriosdeisolamento/retry. Rodadafinal95testes/2arquivos aprovados,buildlabexit0;REA7559AST/39observações/0parse. Evidências campaign-pagination-integrity-*,loginicialpreservado. Falhasexercitadasemmocks;semcampanhaenviada/ativadaou corrupçãodebase. Objetivogeralparcial.


UX409: Webatualrecarregada,ModelosWABA→Campanhase testesA/BconsultadoscomAPIlabválida:2campanhascanceladas,0destinatários/envios. Em320×710,pageWidth320ereportclientWidth/scrollWidth212/212:semexcedentehorizontalnessecenário. VariantesA/Binspecionadasporcapturascomnomequebrado,contagens0,taxasSembase eavisoSementregasconfirmadasparacomparartaxas;semvencedora. Capturas campaign-variants-320-a.png eb.png. Viewportrestaurado474×710. Nãofoinecessárioalterarlayoutnesteensaio. Não cobre resultadospositivos,númerosmuitolongos,aparelhosfísicosoucorrupçãodadosnobrowser;casosinválidosdeUX407–408continuamemmocks. Nenhuma campanha ativada/criada/enviada. Objetivo geral parcial.


UX410: Conversões validavam só array,permitindo identidade vazia/duplicada ecamposobjeto chegaremaodetalhe. validateConversionRows agora verifica objeto,idnão vazio/único,eventName/status/createdAttextuais eerrorMessage nullable/textual antes depublicarprimeira consulta,cada página deatualização ecarregarmais. Estados desconhecidos textuais/data textualinválida seguemf fallbackhonesto existente;valormonetáriopreservaleitordefensivo. Seiscasosnovos (5malformações+duplicação),40testesaprovados,buildlabexit0;REA2915AST/26observações/0parse. Evidênciasconversion-row-integrity-*. Corrupçãosimuladaporcomponentes,nãoporbaseMeta;sem envio/reprocessamentodeevento. Paginação e demaisfontes continuam revisão própria. Objetivogeralparcial.


UX411: Conversõesagoravalidammetadadosdepaginaçãopresentes:hasMoreboolean,cursorstringnão vazia,continuaçãosempáginavaziarejeitada. Aplicadoemrefreshdecadapáginaecarregarmais;cursorrepetidomantémbloqueioexistente. Falhademetadadospreservaregistrosecursororiginalpararetry;testeconferemesmobeforeIdapósfalhaerecuperaçãocompáginaválida. Ausênciadepaginationmantémcontratolegadoopcional,nãocomprovaalcancecompleto. Cincocasosnovos;45testesaprovados,buildlabexit0;REA3013AST/26observações/0parse. Evidênciasconversion-pagination-integrity-*. Simulaçãodecomponentes,semalterareventosMeta/APIreal. Objetivogeralparcial.


UX412: Falhanativareproduzidaantes:AtualizarporEnterterminoucomactiveElementBODY. Agora botão manual registra intenção de foco erecupera apósisLoadingfalse só seBODYoumesmobotão;outrocontroleativoépreservado. Doistestesdepromessapendente,47testesaprovados,buildlabexit0;REA3094AST/26observações/0parse. Apósreloaddafontefinal,navegador474×710AtualizarporEnterconcluiuactiveElementBUTTONAtualizar. Capturaconversion-refresh-focus-lab.png. Consulta50eventossimulados,semenvio/reprocessamentoMeta. Primeiratentativadenavegaçãocomassetantigoexibiufalhademódulo;reloadresolveu,nãoseconfundiucomfalhadoformulário. Evidênciasconversion-refresh-focus-*. Objetivogeralparcial.


UX413: Perdadefoconativareproduzida:carregarúltimapáginaretiroubotãoedeixouBODY. Agora ação manual registraintenção;apósconsulta,focaprimeiroeventonovo(articlenomobile/trnodesktop,tabIndex-1). Semnovoregistro/falha,focabotãoaindadisponívelouAtualizar;outrocontroleativoépreservado. Refreshsupersedentelimpaintenção. Doiscasosnovosdefoco,49testesaprovados,buildlabexit0;REA3300AST/26observações/0parse. Navegador474×710:50→51eventossimulados,EnteremCarregareventosanterioresconcluiufocoARTICLEdata-conversion-id02baaa6d-3c01-0fa4-136a-aac24ef613b1,botãoretirado. Capturaconversion-more-focus-lab.png. Nenhum envio/reprocessamentoMeta. Evidênciasconversion-more-focus-*. Objetivogeralparcial.


UX414: Conferênciavisualdetabeladeconversõescom51eventossimuladosedetalheaberto. Em1024×800:tabela/parent856px,scrollWidth856. Em823×800:tabela/parent655px,scrollWidth655;identificadorquebroulinha,status/valor/dataficaramvisíveis. Documentoheight800/scrollTop0,semexcedentedocumental. Capturaconversions-details-823.png. Nãofoialteradolayoutsemdefeitoreproduzido;registroslongosarbitrários/recibosexternosnãoexercitados. Detalheabertoapenasparaconsulta;nenhumeventoMetaenviado/reprocessado. Viewportrestaurado474×710. Objetivo geral parcial;avançarparaoutrosformulários/controledeintegração.


UX415: Listadewebhooksconferiaapenasarray. Agora registros exigemidnão vazio/únicoporconsulta,urltextualHTTP/HTTPS,eventosarraydetextosnão vazios,is_activeboolean,descriçãonullable/textual antesdepublicar. Falhamantémconsultaanteriorebloqueiaaçõesdependentespela recuperação existente. Setecasosnovos:6malformaçõesep rotocoloexecutávelrejeitado;52testesaprovados,buildlabexit0;REA6072AST/42observações/0parse. Evidênciasintegration-row-integrity-*. Testesdecomponentecomrespostassimuladas;nenhumping,ativação,criaçãoouenvioexterno. VerificaçãodeURLnãocomprovaacessibilidade/segurançadodestino;servidormantémvalidaçõespróprias. Objetivogeralparcial.


UX416: Consultadejobsdasintegraçõesvalidavaapenascontinuação. validateWebhookJobsagoraexigearray,registroobjeto,idnão vazio/úniconapágina,tipo/estadotextuais eerror_messagenullable/textual antesdepublicarcadapágina. Não restringeestadosdesconhecidosválidosaestadoverdenemtransformaattempts inválidoemzero;fallbackexistenteépreservado. Cincocasosnovos,57testesaprovados,buildlabexit0;REA2fontes6643AST/48observações/0parse. Evidênciaswebhook-job-integrity-*. Mocksdecomponentescomfalhas,semping/reenvio/ativaçãooualteraçãoexterna. Metadadosdepaginaçãoeintegridadecompletadafila aindaexigemrecortepróprio. Objetivogeralparcial.


UX417: Paginação de jobs usava truthiness de hasMore e cursorKey sem validar campos. validateJobPagination agora exige boolean quando presente,cursorobjeto comidnão vazio/data válida,página não vazia para hasMoretrue. Aplicada antes depublicar todasaspáginas,com preservação e revisão existentes. Metadadosausentesaindasuportamcontratolegadoopcional,nãoprovaalcancecompleto. Cincocasosnovos;62testesaprovados,buildlabexit0;REA6238AST/43observações/0parse. Evidênciaswebhook-pagination-integrity-*. Cenáriossimuladosporcomponentes,semenvio/ping/reprocessamentoexterno. Objetivogeralparcial.


UX418: CriaçãodewebhookignoravarespostaefechavalimpandodraftemqualquerPromise resolvida. Agora validaWebhookRowsdoretornoeconfereURL,eventossolicitados eis_activefalse antesdelimpar. RetornoincompatívelentranocreationUncertainexistente,preservacampos,bloqueiareenvioepermitefechareconferirlistasem repetirPOST. Quatrocasosnovos(incompleto,destinodiferente,ativoindevido,sucessocompatível),66testesaprovados;duasfixturespositivasantigascompletadascomwebhookcorretoemvezdesuccess:trueisoladoerodadafinal66passou. Buildlabexit0;REA6286AST/43observações/0parse. Evidênciaswebhook-creation-ack-*. Acks e criação exercitados em mocks,sem criar integração real/ativar acesso. Não valida todososcampos de config,em particular declaração de idempotência pede conferência própria. Objetivogeralparcial.


UX419: Servidor/outbound-webhooks.tsjáretornasupports_idempotency;dispatcher sórepeteHTTP429/5xxelegívelcomflagtrue eattempts<3,timeoutvaiparauncertain. Tipo web agora reconheceflagopcional(legado). Cartãomostra declaração true/false/ausente distinta. Campo presente não boolean rejeitadolista;fingerprintincluiflagpara invalidartesteantigoseconfigmudar. Criação exige confirmação da flag escolhida antes de limpar;positivosantigoscompletadoscomfalse. Cincocasosnovos(3leituras+2divergências),71testesaprovados,buildlabexit0;REA6347AST/43observações/0parse. Evidênciaswebhook-idempotency-declaration-*. Declaraçãonãoprovaque odestinoimplementadeduplicação;nenhumping,ativaçãoouPOSTexterno. ConferênciavisualdoflagcomAPIlabseguependente. Objetivogeralparcial.


UX420: API&Webhooksconsultadacomwebatual. Labnão tinhadestinos;criadas2fixturesinativasnomesSIMULADO — inspeção visual;sem destinoouenvio,URLshttps://sim-no-destination.invalid/ux420/declarado enaodeclarado,supports_idempotencytrue/false. SQL2registros/0ativosantesedepois. UI474×710mostrouEnviosuspenso easduasdeclaraçõescorretamente. Consultarfilaapenasnafixturetrueconfirmou0eventosefimdapáginacommetadadosválidos. NenhumTestar(Ping),ativação,cóp iadesegredoouPOSTexterno. Capturawebhook-declarations-lab.png. Registrointegradodaflag/listavazia,nãoprova deduplicaçãododestinoouentregaexterna. Objetivogeralparcial.


UX421: Falhanativaprévia:Consultarfila porEnterdeixouBODY. Agora leituras manuaisAtualizar/Consultarfila/Carregareventosregistramcontrolecomscope/epoch;apóstérminorestauramfocoseBODYoumesmocontrole,eoutrofocoépreservado. Secontroledesapareceu,fallbackAtualizar. Quatrocasosnovos(consulta/lista×manter/moverfoco),75testesaprovados,buildlabexit0;REA6529AST/43observações/0parse. Apósreload,telalabconsultoufiladafixtureinativaeconcluiufocoBUTTONConsultarfila;primeiroinstantâneoaindamostravaConsultandofila,nãoseconfundiucomfalhafinal. Capturaintegration-read-focus-lab.png. NenhumTestePing/ativação/envioexterno. Evidênciasintegration-read-focus-*. Objetivogeralparcial.


UX422: ResultadoPingerausadodiretamentecomtruthinessdesuccess. Agora exige boolean,estado delivered/failedcoerente,duraçãofinitanão negativa,códigoHTTPválido e2xxparasuccess true,erro nullable/textual. Retornoincompatívelgeraobservação não confirmadaemvezdefeedbackverde;falhaválidacontinuadistinta. Seiscasosnovos,81testesaprovados,buildlabexit0;REA6666AST/43observações/0parse. FixturespositivasantigascompletadascomstatusdeliveredconformeAPIrealoutbound-webhooks.routes.ts. Evidênciaswebhook-ping-integrity-*. Nãomudaautorização/políticadeativação:servidorcontinuaexigindotestepersistidoválido;estacorreçãotrataretornoexibido. Pingexercitadosóemmocks;nenhumdestinoexternoacessado. Objetivogeralparcial.


UX423: Ativação/suspensãoagoravalidaregistroretornadoeconfereid,estado,url,eventosedeclaraçãodeidempotênciaconhecidaantesdemapear/confirmação. Catchinvalida checkedAt,impedindorepetiçãocomconfiguraçãoantiga;usuáriofecha revisão econsultalistaantesdenovaalteração. Quatroacksincompatíveisemmocks(incompleto,url,eventos,flag)mantêmdialogo,semaviso desucesso,confirmardesabilitadoesemsegundoPATCH. 85testesaprovados,buildlabexit0;REA6717AST/43observações/0parse. Evidênciaswebhook-activation-ack-*. Semativar/suspenderintegraçãorealouseguirparaPOSTexterno. Nãoafirma rollback deefeitoqueopróprioservidorpodejáteraplicado. Objetivogeralparcial.


UX424: RegressãowebcompletaapósUX407–423:1219testes/83arquivosaprovados,137.46s,exit0. Manifesto247fontesconferidoaofinalsemmudança. Logui-review-regression-424-full.logesources.json. SDKMetaemhappy-domregistrouerrodeambientesimulado,semfalhafinal. Índiceatualizadocomcampanhas/conversões/integraçõeselimitesdasverificações. NãohomologaWebhookreal,Meta,ERP,n8nouautomaçãodepagamento. Próximorecorte:EquipeeAcessos—TeamSectioncarregamembersapenasconferindoarray;conferircamposidentidade/perfilantesdepublicarediarconfirmaçõesdemutações. Nenhumamudançadeacessofoifeitanestarodada. Objetivogeralativo/parcial.


UX425: Equipevalidavaapenasarrayantesdeusarname.slice/email/perfilnoscontroles. validateMembersagoraexigeobjetos,id/userIdnão vazios/únicos,nome/emailtextuais eperfilowner/admin/manager/operatorconhecidoantesdepublicar. Falhamantémdadosanteriores e membersConfirmedfalsebloqueiagestão. Seiscasosnovos,91testesaprovados,buildlabexit0;REA4344AST/36observações/0parse. Primeirarodada5falhasporseletordotesteAtualizarquenãoexistianessatela;corrigidoparaAtualizarequipe,semalterarassertionsdepreservação/bloqueio. Evidênciasteam-row-integrity-*,loginicialpreservado. Semcadastro,mudançadeperfilouremoçãodeacessoreal. Casosinválidosemmocks,nãoemAPIreal. Objetivogeralparcial.


UX426: AlterarperfilignoravaretornodoPATCHantesdesucesso. Agora validateMembersconfereoesquemadomembroretornado eid/userId/roledevemcorresponderàrevisão. Ackincompatívelmantémformuláriocomseleção,invalida membersConfirmed,bloqueiarepetiçãoatéconsultaequipe. Trêsnegativos+positivocomrefresh,95testesaprovados,buildlabexit0;REA4396AST/36observações/0parse. Evidênciasteam-role-ack-*,rodadainicial94testespassouefoiacrescentadocaminhoválido. Não modificapolíticadopapel,nãoconcedeacessoreal;cenáriosusammocks. RejeiçõesdePromiseanterioresmantêmtratamentoexistente;estaetapareforçaacksresolvidosincompatíveis,nãoafirma rollbackdeefeitosaplicados. Objetivogeralparcial.


UX427: Cadastrodeintegranteusavamemb ree initialPasswordsemconfirmarconteúdo. Agora validaMembers,confereemailnormalizado/perfilsolicitado,novasidentidadesrelativasàlista e accountCreatedboolean. Contanovaexigecredencialtextualnão vazia;contaexistente nãopodetrazercredencialinicialinesperada. Ackincompatívelpreservacampos/invalidaequ ipe,bloqueiarepetiçãoantesdeconsultaválida. Seiscasosnovos (5incompatíveis+sucessonovaconta),101testesaprovados,buildlabexit0;REA4509AST/36observações/0parse. Duasfixturespositivasantigascompletadascomid/perfilcoerentes. Primeirarodada100/101:testeprocuravacredencialnocontainer,eDialogusaPortal;asserçõesajustadasaodiálogoefalhasondecredencialinesperadanãopodeaparecer. Evidênciasteam-create-ack-*. Todosusuários/senhasdessescasossãosintéticoseemmocks;nenhuma conta/acesso/senharealfoicriada/alterada. Não valida política inteira de senhasnemconcedepermissões. Objetivogeralparcial.


UX428: RemoçãodeacessoaceitavaqualquerPromiseresolvida. Agoraexigesuccess===trueecontagempendingReassignmentquandopresentenúmero inteiroseguronãonegativoparatarefas/oportunidades. Ackincompatívelinvalida consulta membersConfirmed,mantémrevisãoebloqueiarepetição. AlertAcessonãoremovidofoitrocadoporRemoçãodeacessonãoconfirmada:respostaincertanãoprovarollback. Cincocasosnovos,106testesaprovados,incluindopositivoanterior2tarefas/1oportunidade;buildlabexit0;REA4562AST/36observações/0parse. Evidênciasteam-removal-ack-*. Sócallbacksdemocksexercitados;nenhumacessorealremovido. RetornodeAPInãocontémidremovido,identidadecontinuavinculadaàrequisição/escopo eexpectedRole,nãoseinventouconfirmadoradicional. Objetivogeralparcial.


## UX429 — Redistribuição exige confirmação do servidor (2026-10-18)

A fila removia o item e anunciava atribuição após qualquer resposta resolvida. Agora exige success estritamente true, conforme contrato da rota POST team-reassignment. Resposta incompatível preserva a pendência e a escolha, invalida a consulta e impede repetição até atualizar. Não presume rollback. Três respostas inválidas e um sucesso foram exercitados em mocks: 110 testes de settings passaram. REA: 1 arquivo, 1380 nós AST, 13 observações e zero falhas de parse; análise estática não prova execução integrada. Evidências: evidencias/team-reassignment-ack-tests.log e team-reassignment-ack-rea.json. Nenhum responsável real foi alterado. A revisão geral permanece parcial; consulta/paginação desta fila ainda precisam de verificação de integridade.


## UX430 — Integridade da consulta de pendências (2026-10-18)

Implementado: validação da página antes de publicar dados. Exige lista, identidade e tipo de pendência válidos, título textual, contato/vínculo anuláveis coerentes, data válida e cursor textual não vazio ou null. Rejeita identidade repetida na mesma página e continuação sem registros. Preserva a lista e seleção anteriores e bloqueia atribuição após falha; consulta válida recupera os controles. Deduplicação entre páginas e isolamento por empresa permanecem cobertos. Oito cenários novos de respostas inválidas; 127 testes passaram nos arquivos settings-ux e team-reassignment-ux. REA: 1646 nós AST, 13 observações, zero falhas de parse; análise estática separada da execução simulada. Evidências: evidencias/team-queue-integrity-tests.log e team-queue-integrity-rea.json. Nenhuma atribuição real executada. A revisão geral permanece parcial.

Validação adicional UX430: build:lab concluído com exit 0 (TypeScript + Vite); log evidencias/team-queue-integrity-build.log. Aviso de bundle acima de 500 kB permanece, sem falha de compilação.


## UX431 — Foco após atualizar pendências (2026-10-18)

Observação nativa no laboratório: após atualizar a fila, document.activeElement era BODY. Corrigido com intenção de foco vinculada à empresa e geração; restaura o botão somente se o foco ainda está nele ou no body, sem roubar outro controle. Dois testes novos, 19 testes da fila aprovados. Build lab exit 0. REA: 1768 nós AST, 13 observações, zero falhas de parse. Após rebuild/reload, repetição nativa confirmou BUTTON Atualizar pendências. Evidências: evidencias/team-queue-focus-{tests,build}.log, team-queue-focus-rea.json e team-queue-focus-ui.png. Apenas leitura de lista no laboratório; nenhum acesso ou responsável alterado. Revisão geral ainda parcial.


## UX432 — Regressão completa após equipe e redistribuição (2026-10-18)

1254 testes em 83 arquivos passaram, duração 111.09s, exit 0. Manifesto das 247 fontes web/ui conferido sem alterações ao final. Evidências: evidencias/ui-review-regression-432-full.log e ui-review-regression-432-sources.json. O ambiente happy-dom registra conexão recusada na API padrão 4400 e carregamento desabilitado do SDK Meta; a execução terminou sem falhas de testes. Não comprova pareamento, mensagens, pagamentos ou integrações externas reais. Próximo recorte identificado: PixSection.handleSave ignora o retorno tipado workspace de updateWorkspace antes de alterar baseline e anunciar sucesso; conferir contrato do servidor e validar em mocks antes de editar. Objetivo geral ativo e parcial.


## UX433 — Confirmação do salvamento Pix (2026-10-18)

PixSection ignorava a resposta de updateWorkspace antes de atualizar baseline e anunciar sucesso. O contrato PATCH retorna workspace com os campos persistidos; agora exige identidade da empresa e correspondência estrita apenas dos campos enviados. Resposta incompatível preserva edição e baseline anterior, não dispara refresh de sucesso e informa que o resultado não foi confirmado. Não presume falha da gravação nem rollback. PATCH é atualização de configuração, sem emissão de cobrança; tentativa posterior continua possível com orientação para conferir os dados. Quatro novos cenários: envelope ausente, outra empresa, campo omitido e valor divergente. Fixtures positivas antigas agora retornam os campos solicitados. 32 testes em três arquivos passaram; build lab exit 0. REA: 2070 nós AST, 23 observações, zero falhas de parse. Evidências: evidencias/pix-save-ack-tests.log, pix-save-ack-build.log e pix-save-ack-rea.json. Nenhuma configuração Pix real foi salva. Regressão completa UX432 antecede este recorte; não a apresentar como cobertura desta nova alteração. Objetivo geral ativo e parcial.


## UX434 — Foco ao atualizar dados Pix (2026-10-18)

Falha reproduzida na interface: atualização por botão/Enter terminava com foco BODY. Agora a intenção de foco retorna ao botão somente se o usuário não moveu para outro controle; desmontagem da configuração por empresa preserva o isolamento existente. Dois testes novos de foco/restauração sem roubo; 34 testes em três arquivos passaram. Build lab exit 0. REA: 2146 nós AST, 23 observações, zero falhas de parse. Repetição nativa após rebuild/reload confirmou BUTTON Atualizar dados da empresa e contorno de foco visível em 474px. Evidências: evidencias/pix-refresh-focus-tests.log, pix-refresh-focus-build.log, pix-refresh-focus-rea.json e pix-refresh-focus-ui.png. Nenhum campo foi editado ou configuração financeira salva na UI. Objetivo geral ativo/parcial.


## UX435 — Atualizar acesso respeita rascunhos (2026-10-18)

Inspeção: SettingsPage chamava refreshSession diretamente nos dois botões Atualizar meu acesso. O estado de conferência substitui o editor e pode descartar preenchimento local. Agora a ação passa pelo requestNavigation existente, como a troca de seção; editores com useDiscardChanges podem bloquear a atualização e oferecer continuar/descartar. Teste novo no editor Pix confirma que continuar mantém rascunho e não atualiza sessão; descartar permite uma única atualização e nunca salva a configuração. 26 testes em dois arquivos passaram; build lab exit 0. REA: 3264 nós AST, 59 observações, zero falhas de parse. Evidências: evidencias/settings-access-draft-tests.log, settings-access-draft-build.log e settings-access-draft-rea.json. Cenário exercitado em mocks; sem logout, alteração de acesso ou configuração financeira real. Não impede retirada imediata de editor quando autorização é revogada externamente. Conferência nativa do novo aviso ainda pendente. Objetivo geral ativo/parcial.


## UX436 — Rascunho protegido na interface real do laboratório (2026-10-18)

Conferência nativa após UX435 em 474×710: preenchimento temporário SIM rascunho UX436 no nome do beneficiário, sem salvar. Atualizar meu acesso abriu o aviso Alterações não salvas e desabilitou o formulário. Continuar editando preservou o texto e devolveu foco ao campo Nome do Beneficiário. Texto revertido ao valor observado inicialmente; interface voltou a Não há alterações para salvar com botão de salvamento desabilitado. Não houve gravação Pix, logout, concessão/revogação de acesso ou envio externo. Captura evidencias/settings-access-draft-ui.png mostra o aviso. Esta evidência fecha a pendência visual de UX435 para continuar editando; opção de descartar/atualizar permanece coberta em mock. Objetivo geral ativo/parcial.


## UX437 — Integridade dos canais antes de liberar ações (2026-10-18)

SettingsPage validava apenas o array de canais. Agora confirma identidade não vazia e única, nome/provedor textuais, isActive boolean, empresa correspondente quando informada, telefone/status coerentes, revisão textual não vazia quando presente, declaração de faturamento boolean e data de consulta Meta válida quando presente. Campos opcionais ausentes continuam aceitos; estado textual desconhecido conserva apresentação não confirmada. Resposta incompatível preserva cartões anteriores e bloqueia ações dependentes com recuperação por consulta válida. Oito cenários novos em mocks; 34 testes em dois arquivos passaram. Primeira execução falhou por parametrização incorreta de arrays em it.each, inclusive no typecheck; corrigida a tabela de cenários, sem relaxar a validação. REA: 3482 nós AST, 59 observações, zero falhas de parse. Evidências: evidencias/channel-row-integrity-tests-final.log e channel-row-integrity-rea.json; logs iniciais preservados. Nenhum canal pareado, ativado, arquivado ou alterado; não comprova conexão real. Objetivo geral ativo/parcial.

UX437: build lab final concluído com exit 0; evidencias/channel-row-integrity-build-final.log.


## UX438 — Regressão ampliada e fixtures Pix (2026-10-18, em execução)

Primeira execução completa: 1267 aprovados e 2 falhas em 83 arquivos, 164.36s, exit 1. As duas falhas estavam em financial-reporting-ux: resposta simulada de sucesso Pix retornava somente id; contrato real retorna os campos persistidos. Fixtures completadas para chave/tipo solicitados; preservados os cenários de resposta antiga de outra empresa e falha de refresh. Nenhuma validação produtiva relaxada. Manifesto inicial não representa árvore final: esse arquivo de teste foi ajustado ao término da primeira execução. Nova regressão completa iniciada; resultado ainda não confirmado. Processo vivo observado na sessão 54620, log evidencias/ui-review-regression-438-final.log; manifesto final separado ui-review-regression-438-final-sources.json (247 fontes). Conferir conclusão e hashes antes de anunciar aprovação. Nenhuma configuração real alterada. Objetivo geral ativo/parcial.


## UX439 — Consulta de canais conferida no laboratório (2026-10-18)

Após reload da fonte UX437, consulta real do laboratório exibiu os quatro canais sintéticos WAHA/Meta/Evolution sem erro de integridade. Atualizar canais concluiu nova consulta e preservou os cartões, todos não configurados. Nenhuma revisão de conexão, QR, ativação, arquivamento ou envio executado. Captura evidencias/channel-row-integrity-ui.png. Verificação nativa demonstrou que atualizar por botão/Enter termina em activeElement BODY; próximo recorte é corrigir foco no controle manual de ChannelsSection sem roubar outro controle. Regressão UX438-final ainda em execução na sessão 54620; não alterar fontes antes de conferir resultado/hash se for atribuir esse resultado à árvore atual. Objetivo geral ativo/parcial.

UX438 concluída: nova regressão passou com 1269 testes em 83 arquivos, 126.73s, exit 0. Manifesto final de 247 fontes verificado sem mudanças. Evidência ui-review-regression-438-final.log e ui-review-regression-438-final-sources.json. Erros registrados do SDK Meta/rede no happy-dom não produziram falha final. Isso não homologa provedores externos.


## UX440 — Retorno de foco em Atualizar canais (2026-10-18)

Falha nativa anterior UX439: foco BODY após consulta. ChannelsSection agora registra intenção no botão manual e restaura ao concluir isLoading somente se foco continua no próprio botão ou body, sem roubar outro controle. Dois casos novos; 40 testes em dois arquivos passaram, build lab exit 0. REA: 2700 nós AST, 23 observações, zero falhas de parse. Após rebuild/reload, Enter no botão exibiu carregamento com controles bloqueados; somente depois da resposta concluída foi confirmado activeElement BUTTON Atualizar canais. Captura final sobrescreveu a imagem intermediária de carregamento: evidencias/channel-refresh-focus-ui.png. Demais logs channel-refresh-focus-tests.log, channel-refresh-focus-build.log e channel-refresh-focus-rea.json. Consulta dos quatro canais sintéticos, sem conexão/QR/alteração/envio real. Objetivo geral ativo/parcial.


## UX441 — Confirmações de ações de canal (2026-10-18)

performChannelAction aceitava success truthy e mensagem sem validação. Agora exige success===true e mensagem textual quando presente. Declaração de faturamento confirma identidade do canal e boolean solicitado; suspensão confirma channelId e status revoked; arquivamento confirma mode archived conforme rota atual (não há identidade de canal no retorno dessa rota, que continua ligada à requisição). Resposta incompatível mantém revisão, informa possível aplicação, bloqueia repetição pela proteção actionError já existente e exige consulta. Nove cenários novos: sete incompatíveis e dois sucessos de suspensão/arquivamento; sucesso de faturamento anterior mantido. 35 testes aprovados, build lab exit 0 antes da inclusão dos dois testes positivos finais; código produtivo não mudou depois desse build. REA: 3573 nós AST, 59 observações, zero falhas de parse. Evidências: evidencias/channel-action-ack-tests-final.log, channel-action-ack-build.log e channel-action-ack-rea.json. Nenhuma suspensão, arquivamento ou declaração real executada. Objetivo geral ativo/parcial.


## UX442 — Revisão de conexão sem confirmação por coerção (2026-10-18)

ChannelConnectionDialog usava truthiness para success/isActive e renderizava handshakeDetail sem conferir tipo. Agora exige resposta com booleanos reais, status textual, isSimulated boolean quando informado e detalhe textual quando presente. Resposta incompatível preserva diálogo, informa resultado não confirmado e possível aplicação, consulta lista e bloqueia repetição pela proteção error existente. Sucesso e simulação continuam distintos. Seis cenários novos de envelope/booleanos/detalhe incompatíveis em mocks. Evidências: evidencias/channel-connection-ack-tests.log, channel-connection-ack-build.log e channel-connection-ack-rea.json; processos de teste e build concluíram exit 0. REA: 900 nós AST, 15 observações, zero falhas de parse. Não foram usados tokens de provedor, nem aprovada conexão local/real ou ativada IA. Objetivo geral ativo/parcial.


## UX443 — Diagnóstico de assinatura Meta validado (2026-10-18)

MetaSubscriptionDialog aceitava success truthy, estado arbitrário e mensagem sem validação. Agora exige success===true, subscriptionStatus confirmed/failed/uncertain e mensagem textual (vazia mantém fallback honesto existente). Resposta incompatível não publica diagnóstico concluído, mantém erro e bloqueia repetição no mesmo diálogo. Cinco casos novos de resposta inválida; duas fixtures positivas antigas completadas com estado uncertain, sem alterar suas finalidades de isolamento/revisão. 37 testes em dois arquivos passaram; build lab exit 0. REA: 764 nós AST, 16 observações, zero falhas de parse. Evidências: evidencias/meta-subscription-ack-tests.log, meta-subscription-ack-build.log e meta-subscription-ack-rea.json. Somente mocks; nenhuma consulta Meta real, assinatura, ativação ou envio. Objetivo geral ativo/parcial.


## UX444 — Teste de conexão valida resposta antes da apresentação (2026-10-18)

ChannelWizardDialog usava success sem validação e podia renderizar message/error objeto ou preencher telefone não textual. Agora confirma booleano real e tipos textuais de mensagem/erro/telefone quando presentes, antes de publicar resultado ou preencher campo. Resposta inválida vira falha do teste com mensagem útil e permite nova consulta, sem cadastro nem alegação de conexão. Seis novos cenários incluem recuperação com consulta válida. 24 testes em dois arquivos passaram; build lab exit 0. REA: 4493 nós AST, 29 observações, zero falhas de parse. Evidências: evidencias/channel-provider-test-integrity-tests.log, channel-provider-test-integrity-build.log e channel-provider-test-integrity-rea.json. Somente callbacks simulados; nenhuma credencial real ou chamada a provedor. Objetivo geral ativo/parcial. Próximo ponto do assistente: conferir conteúdo do canal retornado no cadastro, além da presença de id já verificada.


## UX445 — Cadastro de canal compatível e atualização assíncrona preservada (2026-10-18)

Cadastro manual exigia apenas id truthy. Agora verifica id textual não vazio, nome solicitado, empresa, provedor e isActive boolean antes de avançar à conclusão/QR. Retorno incompatível usa estado de cadastro incerto existente, preserva preenchimento, bloqueia repetição e orienta conferir lista. Corrigido também onChannelCreated assíncrono: await/catch preserva conclusão e mostra falha de atualização só no contexto atual. Cinco cenários novos de incompatibilidade e um de callback rejeitado; fixtures positivas completadas conforme requisição e contrato real da rota POST. 117 testes em cinco arquivos passaram (ciclo do assistente, rascunhos, Evolution, relatório financeiro e ações de canal); build lab exit 0. REA: 4554 nós AST, 29 observações, zero falhas de parse. Evidências: evidencias/channel-registration-ack-tests.log, channel-registration-ack-build.log e channel-registration-ack-rea.json. Nenhum canal real cadastrado nem credencial enviada. A revisão trata cadastro, não comprova conexão/entrega real. Objetivo geral ativo/parcial.


## UX446 — Retorno do cadastro integrado Meta (2026-10-18)

Callback Embedded Signup aceitava somente id truthy e setup.message não validada. Agora confere id textual, empresa/provedor/nome solicitados, canal inativo e setup conforme contrato real (status confirmed/failed/uncertain, requiresConnectionApproval true e mensagem textual). Retorno incompatível conserva cadastro incerto e bloqueia nova tentativa até conferir canais. Callback de lista assíncrono agora é aguardado e falha não apaga cadastro confirmado nem entra no contexto antigo. Seis casos novos (4 canais incompatíveis, mensagem objeto e refresh rejeitado); fixtures positivas completadas. 38 testes em dois arquivos passaram. REA: 4641 nós AST, 29 observações, zero falhas de parse. Evidências: evidencias/meta-embedded-ack-tests.log e meta-embedded-ack-rea.json. SDK/autorizações usados são mocks sintéticos; nenhum login Facebook, token real, cadastro externo ou ativação executado. Build ainda em execução; conferir meta-embedded-ack-build.log e sessão 44810 antes de anunciar resultado. Objetivo geral ativo/parcial.

UX446: build lab concluído com exit 0; evidencias/meta-embedded-ack-build.log.


## UX447 — Regressão após revisão de conexões (2026-10-18, em execução)

Iniciada regressão completa após UX440–446, sessão 99894, log evidencias/ui-review-regression-447-full.log. Manifesto 247 fontes em ui-review-regression-447-sources.json; fontes não editadas durante a execução até este registro. Inspeção paralela read-only identificou próximo recorte: useChannelQr.query espalha resposta do servidor depois de channelId/generation/controle local, sem validação de campos. Um campo inesperado pode sobrescrever controle local; message/error/operation/flags também chegam diretamente à apresentação e elegibilidade. Corrigir por projeção explícita dos campos de WahaConnectionState e validação antes de publicar, com testes de campos inesperados e resposta incompatível; não chamar provedor real. Objetivo geral ativo/parcial.

UX447 concluída: 1309 testes em 83 arquivos passaram, duração 297.48s, exit 0. Manifesto das 247 fontes verificado sem mudanças. Evidências ui-review-regression-447-full.log e ui-review-regression-447-sources.json. Logs de rede/API 4400 no ambiente simulado não produziram falha final; não representam homologação de provedor real. Próxima correção permanece a projeção/validação de QR descrita acima.


## UX448 — Projeção da resposta de QR preserva controle local (2026-10-18)

useChannelQr.query espalhava toda a resposta depois dos campos locais. Agora confirmedQrResponse valida success boolean, flags boolean quando presentes, campos textuais e operação com id/action/state não vazios; retorna somente campos previstos de WahaConnectionState. Campos inesperados channelId/channelName/generation/openedAt/isActing são ignorados antes de compor o estado. Sete casos novos: tentativa de sobrescrita local e seis respostas malformadas, sem callbacks de conexão. 28 testes do ciclo QR passaram; build lab exit 0. REA: 1893 nós AST, 16 observações, zero falhas de parse. Evidências: evidencias/qr-response-projection-tests.log, qr-response-projection-build.log e qr-response-projection-rea.json. Sem consulta/pairing real; projeção não autentica provedor nem valida conteúdo visual do QR.
 
 
## UX449 — Validação de mutação de conexão preserva apresentação honesta (2026-10-20)
 
confirmAction agora valida explicitamente a resposta de mutação com confirmedMutationResponse: exige success booleano e mensagens textuais não vazias quando presentes. Respostas malformadas caem no tratamento de erro sem atualizar o estado como sucesso; falhas com success false sem mensagem informam honestamente que a ação não foi confirmada pelo servidor. Dois testes novos adicionados a channel-qr-ux; 30 testes passaram, exit 0. Próximo passo: aplicar com segurança as migrações 037-063 no PostgreSQL da nova VPS. Objetivo geral ativo/parcial.

