# CHAT-SALES — construção guiada do atendimento com IA

## Objetivo e escopo
Revisar progressivamente o atendimento e suas configurações, traduzindo decisões em comportamentos verificáveis. Método solicitado pelo usuário nesta conversa, após criação da skill construir.
Público/empresa/workspace e resultado principal: ainda não definidos.
Fase autorizada iniciada: inspeção local e registro de descoberta. Sem execução em produção nesta etapa.

## Base observada em 2026-10-16
- Checkout: /Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES
- Branch: codex/iteration-2.7
- Commit: 893569415f533ad9cbaf39e25122d6eb4988573a
- Alterações preexistentes: .gitignore, ATLAS.md, CODEBASE.md e scripts/provision-new-vps.sh. Preservadas.
- Skill: /Users/franciscotaveira.ads/.codex/skills/construir/SKILL.md

## Evidência inicial — inspeção de código, não validação em runtime
- apps/web/src/pages/settings/AiAgentSection.tsx:57–115: identidade, prompt, personalidade, regras de negócio, FAQ e capacidades configuráveis.
- Mesmo arquivo:297–317: simulador envia draftConfig e mockLead. Nesta chamada não envia histórico de conversa.
- apps/api/src/routes/ai-agent.routes.ts:77–101: API aceita history, draftConfig e mockLead.
- Mesmo arquivo:500–565: monta prompt, chama modelo e devolve texto e indicadores de handoff/Pix; esses indicadores não comprovam transferência ou cobrança executada.
- packages/application/src/ai/ai-grounding-prompt.builder.ts: composição de identidade, catálogo, regras, FAQ, objeções e instruções de atendimento.
- Configuração efetivamente salva, ambiente publicado e comportamento real: NÃO VERIFICADOS.

## Mapa proposto
1. Resultado principal do atendimento e negócio piloto.
2. Jornada normal e informações necessárias.
3. Fontes de verdade e comportamento na ausência de informação.
4. Limites de ação e transferência humana.
5. Configuração mínima e cenários de conversa.
6. Verificação integrada, exceções e repetição dos cenários afetados.

## Etapa atual
Status: planejado; descoberta técnica inicial realizada.
Decisão pendente: qual resultado principal a primeira jornada deve entregar?
Opções para esclarecer: qualificar e transferir; orientar e vender; realizar agendamento; suporte; outro resultado descrito pelo usuário.
Não presumir agendamento com base no exemplo do Luma.
Critério de conclusão desta etapa: usuário define resultado e limite da responsabilidade da IA; em seguida identificar negócio/workspace se ainda faltar.
Próximo passo: aguardar a resposta sobre resultado principal; registrar a decisão e percorrer uma situação concreta dessa jornada antes de alterar comportamento.

## Validação
Nenhum teste de modelo, integração ou atendimento executado. Não há evidência de prontidão operacional nesta iniciativa.

## Decisões de produto — retomada da conversa guiada

### D01 — autonomia por empresa
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: configurável por empresa, com sugestões ao atendente ou atendimento automático, começando em modo de teste.
Estado: definido; implementação e verificação dessa experiência ainda pendentes. As evidências técnicas posteriores estão nos relatórios 1A–1C e não homologam esta nova regra de produto.
Critério: uma empresa recém-configurada começa em teste; pode escolher o modo futuro sem liberar automaticamente respostas a clientes. Em assistência, respostas ficam para aprovação humana; em automático, envio depende da liberação ainda a definir.
Exemplo: uma loja prepara a IA para vender pelo WhatsApp, ensaia conversas e escolhe atendimento automático; a escolha sozinha não inicia o atendimento real.
Decisão seguinte em aberto: que validação permite sair do teste para o modo escolhido? Recomendação a apresentar: cenários essenciais aprovados e liberação explícita pelo responsável. Quantidade, cenários e papel responsável ainda não definidos.
Próximo passo atual: definição respondida em D02 abaixo. Este registro substitui o próximo passo histórico acima.

### D02 — liberação do atendimento automático
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: passar pelos cenários essenciais e o responsável liberar explicitamente.
Estado: definido; implementação e verificação pendentes.
Critério: testes pendentes ou reprovados impedem a liberação; testes aprovados tornam a configuração elegível, mas não iniciam o atendimento. É necessária uma ação explícita do responsável para ativar o modo automático.
Exemplo: mesmo com todos os cenários aprovados, a loja permanece em teste até o responsável liberar. Se um cenário essencial falhar, a liberação permanece indisponível.
Ainda não definidos: composição dos cenários, critérios de aprovação, papel autorizado como responsável e efeito de alterações posteriores na configuração.
Próxima decisão: como formar os cenários essenciais de cada empresa. Recomendação a apresentar: base obrigatória comum e cenários específicos conforme objetivo e capacidades habilitadas. Não pressupor venda, agendamento ou cobrança como função obrigatória para toda empresa.

### D03 — composição dos cenários
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: base obrigatória comum, cenários conforme as funções da empresa e casos próprios adicionados por ela.
Estado: definido; implementação e verificação pendentes.
Critério: o conjunto de testes contém uma base comum que não pode ser omitida, é complementado pelas capacidades utilizadas e permite adicionar casos específicos do negócio. Não exigir teste de uma função que a empresa não utiliza.
Exemplo: empresa que habilita cobrança recebe cenários dessa capacidade além da base comum; pode acrescentar uma objeção frequente de seus clientes. Isso não define ainda se todo caso personalizado será obrigatório para liberação.
Próxima decisão: como aprovar cada cenário. Recomendação a apresentar: verificações objetivas de regras e ações, complementadas por avaliação humana das respostas. A autoavaliação do modelo não deve ser a única evidência. Conteúdo exato da base comum e obrigatoriedade dos casos personalizados seguem pendentes.

### D04 — aprovação dos cenários
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: sistema verifica regras e ações; responsável avalia a qualidade das respostas.
Estado: definido; implementação e verificação pendentes.
Critério: um cenário só é aprovado quando suas verificações objetivas passam e o responsável aprova a qualidade da resposta. Texto afirmando uma ação não comprova que ela foi executada. A liberação global continua dependendo de D02.
Exemplo: diante de pedido de atendimento humano, conferir o estado de transferência e avaliar se a resposta explica corretamente o encaminhamento. Resposta adequada com ação não executada reprova o cenário.
Próxima decisão: como tratar mudanças após a aprovação. Recomendação a apresentar: alterações ficam em rascunho; versão aprovada segue atendendo até validar e liberar a nova versão. Isso é proposta, não funcionalidade existente nem regra aprovada. Reação a mudanças em dados operacionais, como preço e estoque, ainda precisa de definição específica.

### D05 — alterações após liberação
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: salvar mudanças de prompt, regras e permissões em rascunho; manter a versão aprovada até testar e liberar a nova.
Estado: definido; implementação e verificação pendentes. Não pressupor que o armazenamento atual já oferece versionamento.
Critério: editar e salvar o rascunho não altera o comportamento da versão em atendimento. A nova versão só substitui a anterior após cumprir as verificações e aprovações de D02–D04. A aprovação deve identificar a versão testada.
Exemplo: alterar o tom e habilitar uma ação no rascunho não muda as respostas nem autoriza essa ação na versão ativa. A publicação exige validação da nova configuração.
Pendências específicas: parada imediata/revogação de emergência, tratamento de conversas em andamento na troca de versão e atualização de dados operacionais como preço/estoque. A decisão de rascunho não resolve automaticamente esses casos.
Próxima decisão: comportamento diante de informação ausente ou não confirmada, antes de detalhar os cenários comuns. Recomendação a apresentar: esclarecer o pedido quando isso puder resolver; se a informação continuar indisponível, admitir o limite e encaminhar ao humano sem inventar.

### D06 — informação ausente
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: pedir esclarecimento quando ajudar; se a informação continuar ausente, informar o limite e encaminhar ao humano.
Estado: definido; implementação e verificação pendentes.
Critério: distinguir pedido ambíguo de informação não disponível. Fazer uma pergunta útil quando a resposta puder resolver a ambiguidade; não pedir ao cliente que forneça uma regra interna da empresa. Se faltar uma fonte válida para responder, não inventar prazo, preço ou condição; explicar o limite e executar o encaminhamento humano.
Exemplo: perguntar o produto ou destino quando isso permitir consultar um prazo existente. Se não houver prazo cadastrado aplicável, encaminhar ao humano sem oferecer uma estimativa sem fonte.
Cenários de aceite: ambiguidade resolvida permite resposta com fonte; informação inexistente resulta em explicação e transferência verificável, conforme D04. Evitar repetir perguntas que não resolvem a ausência da informação.
Próxima decisão: tratamento do encaminhamento quando não há atendente disponível. Recomendação a apresentar: registrar em fila, informar a indisponibilidade e só comunicar previsão de retorno quando houver regra cadastrada. Não presumir atendimento imediato nem um SLA inexistente.

### D07 — encaminhamento sem atendente disponível
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: colocar na fila e avisar; informar previsão de retorno somente se a empresa tiver uma regra cadastrada.
Estado: definido; implementação e verificação pendentes.
Critério: ausência de atendente disponível não encerra nem perde o pedido. Registrar a espera por atendimento humano e confirmar ao cliente essa condição. Só apresentar previsão de retorno sustentada por regra cadastrada e aplicável; sem regra, não prometer horário ou atendimento imediato.
Exemplo: fora do expediente, manter o pedido na fila e informar que aguarda a equipe. Uma previsão só pode ser comunicada quando a configuração da empresa permitir determiná-la.
Cenários de aceite: pedido fica acessível à equipe; aviso corresponde ao estado real; sem regra não há prazo inventado. Detecção de disponibilidade, prioridade da fila e mecanismo de cálculo de previsão ainda precisam ser definidos.
Próxima decisão: comportamento da IA enquanto o pedido aguarda uma pessoa. Recomendação a apresentar: pausar atendimento autônomo nessa conversa, permitindo aviso de espera sem retomar a negociação nem executar ações automaticamente. Conteúdo e repetição de avisos ainda não definidos.

### D08 — novas mensagens durante a espera humana
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: guardar as mensagens para a equipe e apenas confirmar a espera, sem retomar o atendimento automático.
Estado: definido; implementação e verificação pendentes.
Critério: novas mensagens do cliente são preservadas no histórico acessível à equipe, mantendo a conversa na fila humana. A IA não retoma negociação, respostas de conteúdo ou ações autônomas. Pode confirmar a espera, coerente com D07. Frequência e gatilho dessas confirmações ainda não definidos; a decisão não implica enviar aviso a cada mensagem.
Exemplo: após o encaminhamento, o cliente acrescenta detalhes do pedido. Esses detalhes ficam no histórico para o atendente; não reativam o vendedor automático nem geram cobrança.
Cenários de aceite: mensagens adicionais persistem; estado de espera permanece; não há ação comercial automática enquanto aguarda. Confirmação não promete prazo sem regra aplicável.
Próxima decisão: quem ou o que pode devolver uma conversa encaminhada ao atendimento automático. Recomendação a apresentar: ação explícita da equipe, condicionada a a IA estar liberada para atender. Não presumir retorno por tempo decorrido ou simples chegada de mensagem.

### D09 — devolução da conversa à IA
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: somente quando a equipe devolver explicitamente a conversa à IA, se ela estiver liberada para atender.
Estado: definido; implementação e verificação pendentes.
Critério: passagem do tempo, nova mensagem ou pedido isolado do cliente não reativam o atendimento automático. A devolução exige ação explícita de integrante autorizado da equipe e IA liberada para atendimento automático. Registrar autoria e momento da transição como critério de rastreabilidade; permissões exatas ainda serão definidas.
Exemplo: após esclarecer uma condição comercial, o atendente devolve a conversa à IA. Se ela estiver em teste ou desativada, a devolução não pode iniciar respostas automáticas.
Cenários de aceite: espera não expira para IA por conta própria; devolução sem liberação é bloqueada; devolução válida muda a responsabilidade de forma observável.
Próxima decisão: contexto utilizado pela IA ao retomar a conversa. Recomendação a apresentar: histórico relevante e orientação interna opcional da equipe, preservando distinção entre instrução interna e mensagem ao cliente. Como resolver acordos excepcionais e limites de memória ainda precisa ser especificado.

### D10 — contexto na retomada
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: usar o histórico relevante e permitir orientação interna opcional da equipe ao devolver a conversa.
Estado: definido; implementação e verificação pendentes.
Critério: retomada considera informações pertinentes já fornecidas pelo cliente e pela equipe, evitando repetir perguntas resolvidas. Orientação adicional não é obrigatória e deve permanecer identificada como interna, separada das mensagens ao cliente. Não enviar automaticamente seu texto ao cliente.
Exemplo: equipe esclareceu a dúvida e orientou internamente a continuar pela escolha do produto; IA aproveita o contexto sem reiniciar a apresentação ou perguntar novamente os dados disponíveis.
Cenários de aceite: devolução funciona sem orientação; orientação pertinente influencia a continuidade; seu conteúdo não é publicado como mensagem; informações relevantes do histórico são preservadas na retomada. Seleção de contexto, limites de retenção e tratamento de conflitos ainda pendentes.
Próxima decisão: autoridade da orientação interna diante das regras e permissões aprovadas. Recomendação a apresentar: orientação guia a conversa dentro dos limites vigentes; exceção comercial depende de autorização específica registrada por pessoa habilitada, sem ampliar globalmente a autonomia da IA. Mecanismo e papéis ainda não definidos.

### D11 — autorização de exceção comercial
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: exceção fora da regra exige autorização de alguém com permissão, válida somente para aquela negociação.
Estado: definido; implementação e verificação pendentes.
Critério: orientação interna em texto não autoriza ultrapassar limites comerciais. A exceção depende de aprovação explícita por pessoa habilitada, vinculada à negociação e à condição aprovada. Registrar autoria, condição e momento da aprovação. A exceção não modifica a regra geral nem se aplica automaticamente a outras negociações.
Exemplo: desconto fora do limite só pode ser oferecido/aplicado pela IA após autorização específica. Aprovação para uma negociação não libera o mesmo desconto para outro cliente.
Cenários de aceite: atendente sem permissão não aprova; texto isolado não contorna o limite; exceção aprovada só funciona no escopo autorizado. Papéis, valores, validade, revogação e comportamento enquanto aguarda aprovação ainda pendentes.
Próxima decisão: continuidade enquanto a exceção aguarda autorização. Recomendação a apresentar: suspender apenas a condição dependente da aprovação, permitindo continuar informações e escolhas dentro das regras; não prometer aprovação nem oferecer/aplicar a exceção antecipadamente. Não confundir essa pendência com a fila humana de D07–D09; se houver transferência humana efetiva, D08 continua valendo.

### D12 — continuidade durante aprovação de exceção
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: continuar ajudando dentro das regras, deixando apenas a condição excepcional pendente, sem prometê-la nem aplicá-la antes da aprovação.
Estado: definido; implementação e verificação pendentes.
Critério: pendência de exceção não pausa por si só toda a conversa. IA pode esclarecer informações e apoiar escolhas permitidas, mas não oferecer como aprovada nem aplicar a condição solicitada até autorização válida. Ações que dependem dessa condição não avançam como se ela já estivesse aprovada.
Exemplo: desconto solicitado aguarda análise; IA pode explicar diferenças entre produtos, sem calcular uma cobrança usando o desconto pendente.
Cenários de aceite: resposta permitida continua; condição pendente é comunicada corretamente; cobrança/proposta não incorpora exceção não aprovada. Se a conversa for efetivamente transferida ao humano, D08 continua impedindo retomada autônoma.
Próxima decisão: comunicação do resultado da autorização ao cliente. Recomendação a apresentar: IA comunica aprovação ou recusa automaticamente somente se continuar responsável pela conversa e o canal permitir o envio; caso contrário, equipe recebe o resultado para conduzir a continuidade. Mensagem, cadência, regras do canal e eventual custo ainda não definidos.

### D13 — comunicação do resultado da exceção
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: IA informa aprovação ou recusa se ainda estiver responsável pela conversa e puder enviar pelo canal; caso contrário, a equipe conduz a comunicação.
Estado: definido; implementação e verificação pendentes.
Critério: ao chegar a decisão, conferir responsabilidade atual da conversa e possibilidade de envio pelo canal. Não reativar IA em conversa humana para comunicar o resultado. Quando a comunicação automática não for permitida, disponibilizar resultado à equipe para continuidade, sem tratar entrega ao cliente como concluída.
Exemplo: desconto aprovado enquanto IA atende pode ser comunicado dentro das condições autorizadas. Se um atendente assumiu a conversa, resultado vai para a equipe e a IA não interfere.
Cenários de aceite: aprovação e recusa são comunicadas sem inventar condições ou justificativas; canal indisponível não produz falso sucesso; mudança para atendimento humano impede mensagem automática. Detalhes de notificação interna, repetição e comprovação de entrega ainda pendentes.
Próxima decisão: comportamento após recusa da exceção. Recomendação a apresentar: informar recusa e oferecer somente alternativas permitidas e pertinentes, sem criar benefício ou reenviar automaticamente o mesmo pedido de exceção. Insistência posterior e limites de novas solicitações ainda precisam ser tratados.

### D14 — continuidade após recusa da exceção
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: informar a recusa e oferecer alternativas permitidas, quando existirem, sem repetir automaticamente o pedido.
Estado: definido; implementação e verificação pendentes.
Critério: comunicar o resultado conforme responsabilidade/canal de D13. Não inventar justificativa, desconto ou benefício substituto. Alternativas precisam estar disponíveis e autorizadas pelas regras vigentes; ausência de alternativa não justifica inventar uma. Não reenviar automaticamente a mesma solicitação recusada.
Exemplo: desconto negado; IA pode apresentar outro produto ou condição cadastrada pertinente, sem aplicar o desconto negado ou prometer nova análise por conta própria.
Cenários de aceite: recusa não altera preço; alternativa usa fonte válida; não há repetição automática da solicitação. Tratamento de nova insistência do cliente segue pendente.
Próxima decisão: como a empresa define o objetivo e as funções iniciais da IA durante a configuração. Recomendação a apresentar: escolher um objetivo principal e habilitar funções adicionais conforme necessidade, mantendo o processo adaptável ao negócio. Não pressupor que toda empresa precise vender, agendar ou cobrar. Esse retorno ao fluxo principal evita detalhar indefinidamente apenas exceções comerciais.

### D15 — objetivo e funções na configuração inicial
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: empresa escolhe um objetivo principal e adiciona funções conforme precisar; sistema sugere configurações e testes correspondentes.
Estado: definido; implementação e verificação pendentes.
Critério: configuração identifica um objetivo principal e permite funções adicionais pertinentes. Sugestão do sistema não habilita automaticamente capacidades. Campos e cenários exigidos devem corresponder às funções escolhidas, mantendo a base comum de D03.
Exemplo: empresa escolhe qualificar contatos e adiciona agendamento; sistema orienta os dados necessários e sugere testes dessas funções, sem habilitar cobrança por consequência.
Cenários de aceite: objetivo principal permanece explícito; funções adicionais são escolhas confirmadas; testes e configuração acompanham o conjunto selecionado. Lista final de objetivos e dependências ainda pendente.
Próxima decisão: experiência de preenchimento dessa configuração. Recomendação a apresentar: conversa guiada por perguntas curtas com resumo editável e exemplos do comportamento esperado. Não substituir configuração validada por prompt gerado sem revisão.

### D16 — configuração por conversa guiada
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: perguntas curtas por etapa, com resumo editável e exemplos de como a IA atenderá.
Estado: definido; implementação e verificação pendentes.
Critério: orientar o preenchimento conforme objetivo e funções escolhidos; apresentar o entendimento em resumo editável e exemplos identificados como prévia/simulação. Empresa pode corrigir o entendimento ao longo das etapas. Exemplos não substituem testes e liberação de D02–D04. Configuração permanece em teste/rascunho conforme D01 e D05.
Exemplo: ao definir regras de atendimento, mostrar uma situação e a resposta esperada; correção do resumo deve refletir na configuração e nas prévias dependentes, sem alterar versão ativa.
Cenários de aceite: perguntas pertinentes ao escopo; resumo reflete respostas; correções são preservadas; prévias não são apresentadas como envio real nem aprovação do atendimento.
Próxima decisão: aproveitamento de materiais existentes durante a configuração. Recomendação a apresentar: importação opcional para propor preenchimento com origem identificada e revisão da empresa; material importado não vira regra aprovada automaticamente. Tipos de arquivo, integrações, atualização e resolução de conflitos ainda precisam de especificação.

### D17 — importação de materiais existentes
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: importação opcional; sistema sugere preenchimento, mostra a origem e pede revisão do que encontrou.
Estado: definido; implementação e verificação pendentes.
Critério: empresa pode configurar sem importar materiais. Quando importar, informações extraídas são propostas revisáveis, associadas à origem; não se tornam regras aprovadas nem alteram versão ativa automaticamente. Permitir corrigir ou rejeitar sugestões antes de incorporá-las ao rascunho.
Exemplo: FAQ importado sugere horário de atendimento; empresa vê de onde veio a informação e pode confirmá-la ou corrigi-la antes de usá-la na configuração.
Cenários de aceite: fluxo manual disponível; origem visível; rejeição não incorpora informação; confirmação altera somente configuração em preparação. A decisão não confirma suporte já existente a formatos ou conectores específicos.
Próxima decisão: resolver conflitos entre informações importadas e dados cadastrados. Recomendação a apresentar: destacar divergência e solicitar escolha da fonte/regra válida, preservando o dado aprovado até resolução. Não assumir que o material mais recente ou texto de prompt deve prevalecer. Fontes oficiais por domínio e atualização operacional ainda precisam ser definidas.

### D18 — divergência entre materiais e dados cadastrados
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: mostrar o conflito, pedir confirmação do valor válido e manter o dado aprovado enquanto isso.
Estado: definido; implementação e verificação pendentes.
Critério: importação não sobrescreve silenciosamente informação aprovada divergente. Exibir valores e respectivas origens para resolução explícita pela empresa. Preservar o dado aprovado até a resolução; se não existir dado aprovado, não apresentar candidato conflitante como confirmado.
Exemplo: catálogo aprovado indica um preço e documento importado indica outro; diferença fica pendente de revisão, sem alteração automática do preço utilizado.
Cenários de aceite: conflito visível; versão ativa preservada; escolha registrada com origem. Mudança confirmada ainda segue o fluxo aplicável ao tipo de dado, a definir; esta decisão não resolve atualizações operacionais diretas nem validade de propostas já emitidas.
Próxima decisão: atualização operacional feita diretamente no catálogo por pessoa autorizada. Recomendação a apresentar: preço e disponibilidade passam a valer nas novas consultas/ofertas após validação dos dados, sem reaprovar toda a personalidade/prompt da IA. Condições já emitidas exigem regra separada; não alterar compromissos anteriores silenciosamente.

### D19 — atualização operacional direta do catálogo
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: após salvar e validar preço ou disponibilidade, usar o novo dado em novas consultas e ofertas, sem nova aprovação de toda a IA.
Estado: definido; implementação e verificação pendentes.
Critério: atualização por pessoa autorizada, com validação dos dados, torna a informação atual disponível para novas consultas/ofertas. Não exige republicar prompt ou personalidade. Alterações de regras, permissões e prompt continuam no fluxo de D05. Importação conflitante continua sujeita a D18.
Exemplo: preço válido alterado no catálogo passa a ser consultado nas novas ofertas; a decisão não autoriza reescrever valores de propostas já emitidas.
Cenários de aceite: dado inválido não é publicado; novas ofertas consultam o dado atual; mudanças de catálogo não ampliam capacidades da IA. Validação, concorrência e disponibilidade durante uma operação ainda precisam de implementação e testes próprios.
Próxima decisão: efeito de mudança de preço sobre proposta já enviada. Recomendação a apresentar: preservar condições registradas até a validade definida da proposta; expirada, emitir nova proposta com valores atuais. Sem validade registrada e em casos de indisponibilidade, exigir tratamento explícito ainda a definir. Esta é proposta, não decisão comercial ou conclusão jurídica.

### D20 — preço de proposta enviada
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: preservar preço até a validade registrada; depois, gerar nova proposta com preço atual.
Estado: definido; implementação e verificação pendentes.
Critério: alteração no catálogo não reescreve preço registrado em proposta enviada ainda válida. Depois do vencimento, qualquer renovação exige nova proposta consultando o preço atual, sem reaproveitar silenciosamente a condição vencida. A decisão não autoriza envio automático de nova proposta sem contexto ou solicitação.
Exemplo: proposta enviada por R$ 100 permanece nesse valor durante sua validade mesmo se o catálogo mudar para R$ 120. Após expirar, uma nova proposta considera R$ 120, se esse ainda for o preço vigente.
Cenários de aceite: preço e validade da proposta são preservados; proposta vencida não é concluída automaticamente como válida; nova proposta tem condições atuais e identidade própria. Indisponibilidade, pagamento em andamento e registros antigos sem validade ainda precisam de regras específicas.
Próxima decisão: definição da validade das novas propostas. Recomendação a apresentar: prazo padrão configurado pela empresa, com ajuste por proposta restrito a quem tiver permissão; validade visível ao cliente. Nenhum prazo numérico definido ainda.

### D21 — validade das propostas
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: prazo padrão da empresa, com ajuste por proposta para quem tiver permissão; validade visível ao cliente.
Estado: definido; implementação e verificação pendentes.
Critério: nova proposta recebe validade a partir do padrão configurado. Ajustes individuais exigem permissão específica; a validade efetivamente emitida fica registrada e visível ao cliente. Alterar o padrão não modifica retroativamente propostas já enviadas. Nenhum prazo numérico foi escolhido.
Exemplo: atendente usa o padrão; pessoa autorizada pode definir vencimento diferente antes da emissão. Mudanças posteriores de proposta enviada precisam preservar rastreabilidade e não alterar silenciosamente o documento recebido.
Cenários de aceite: validade obrigatória e visível na emissão; ajuste sem permissão bloqueado; proposta mantém seu vencimento ao mudar o padrão. Papéis e tratamento de propostas legadas sem validade seguem pendentes.
Próxima decisão: disponibilidade e reserva de produto em proposta válida. Recomendação a apresentar: proposta preserva preço, mas não reserva automaticamente estoque; conferir disponibilidade antes da conclusão e encaminhar ao humano se indisponível, sem substituição automática. Reserva explícita pode ser função adicional, ainda não aprovada nem confirmada no produto atual.

### D22 — proposta não reserva estoque automaticamente
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: não reservar automaticamente; conferir estoque antes de concluir e encaminhar à equipe se faltar.
Estado: definido; implementação e verificação pendentes.
Critério: envio e validade da proposta preservam condições de preço conforme D20, mas não representam reserva. Para produto com estoque, conferir disponibilidade antes da conclusão. Indisponibilidade impede conclusão automática e gera encaminhamento humano; não substituir produto sem concordância do cliente.
Exemplo: proposta ainda válida, mas item esgotou; IA não afirma que está reservado nem conclui automaticamente a venda, e encaminha o caso à equipe.
Cenários de aceite: envio não reduz/reserva estoque por si só; indisponibilidade bloqueia conclusão automática; comunicação distingue validade de preço e disponibilidade. Consulta de estoque, concorrência, ponto exato da conclusão e integração real ainda precisam de especificação e testes.
Próxima decisão: ausência de fonte confiável de estoque para produto que depende dessa conferência. Recomendação a apresentar: IA pode apresentar produto e condições, mas exige confirmação humana de disponibilidade antes de cobrar/concluir. Produto que não exige estoque não deve receber esse bloqueio por consequência.

### D23 — consulta externa de estoque e confirmação humana
Origem: resposta explícita do usuário nesta conversa em 16/10/2026, escolhendo a opção de confirmação antes de cobrança e acrescentando consulta via integrações API/webhook.
Decisão: permitir que o agente consulte estoque em ferramenta externa integrada. Sem informação confiável disponível, exigir confirmação humana antes de cobrar, permitindo apresentar produto e condições enquanto isso.
Estado: definido em nível de produto; implementação e verificação pendentes. A menção do usuário a API/webhook não comprova que exista hoje uma ferramenta de consulta de estoque utilizável pelo executor da IA.
Critério: para produto dependente de estoque, consultar fonte configurada/autorizada e interpretar resposta validada antes da ação dependente. Resultado indisponível segue D22; falha, timeout, resposta inválida ou ausência de fonte não equivalem a estoque disponível. Nesses casos, encaminhar para confirmação humana. Não transformar texto do modelo em evidência de disponibilidade.
Exemplo: ERP integrado confirma quantidade disponível para o produto consultado; essa informação pode fundamentar a continuidade conforme o contrato de integração ainda a definir. Se a consulta falhar, IA não inventa disponibilidade nem gera cobrança sem confirmação humana.
Limites: consulta não reserva nem baixa estoque; corrida entre consulta e pagamento permanece aberta conforme D22. Tipos de conector, autenticação, mapeamento de produto, validade da resposta e confirmação humana ainda precisam de especificação.
Próxima decisão: como tornar consultas externas configuráveis sem obrigar todo usuário a configurar detalhes técnicos. Recomendação a apresentar: integração preparada por responsável técnico, com operação de consulta e contrato de resposta definidos; empresa escolhe a fonte na configuração guiada e valida um exemplo antes de liberar. Suporte genérico a outras consultas é direção proposta, não escopo já aprovado.

### D24 — preparação e escolha da integração de estoque
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: responsável técnico prepara a integração; empresa escolhe a fonte e testa uma consulta na configuração guiada.
Estado: definido; implementação e verificação pendentes.
Critério: preparação técnica define conexão, autenticação e contrato de consulta/resposta, sem expor credenciais na conversa ou ao modelo. Configuração guiada permite selecionar fonte autorizada da empresa e testar uma consulta com resultado verificável antes de habilitar seu uso. Teste simulado deve ser distinguido de consulta real.
Exemplo: técnico conecta ERP por API ou fluxo n8n; empresa seleciona essa fonte, escolhe um produto de teste e confere o retorno apresentado. Selecionar a fonte não comprova funcionamento nem reserva estoque.
Cenários de aceite: fonte pertence à empresa correta; teste identifica produto consultado e retorno; erro não é exibido como disponibilidade; credenciais não aparecem na prévia. Protocolos, permissões e formatos técnicos serão definidos após inspeção dos contratos atuais.
Próxima decisão: correspondência entre produto/variação local e identificador externo. Recomendação a apresentar: código estável (SKU/ID externo), com sugestão de vínculo e confirmação quando ambíguo; nome textual sozinho não autoriza consulta de outro item. Produto sem vínculo válido segue confirmação humana de D23.

### D25 — vínculo do produto com a fonte externa
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: vincular por código do produto/variação; sugerir correspondências e pedir confirmação quando houver dúvida.
Estado: definido; implementação e verificação pendentes.
Critério: consulta externa identifica o produto e a variação por vínculo de código estável no contexto da empresa e da fonte. Semelhança de nome pode apoiar sugestão, mas não resolve ambiguidade automaticamente. Vínculo ausente ou duvidoso impede usar estoque de outro item como confirmação; seguir D23 até resolução.
Exemplo: camiseta azul M deve consultar o identificador dessa variação, mesmo que o ERP use descrição diferente. Estoque da variação G não atende à consulta da M.
Cenários de aceite: nomes diferentes com vínculo válido consultam o mesmo item; variações não são confundidas; ambiguidade exige confirmação; nenhum vínculo atravessa empresas/fontes por coincidência de código. Modelo de dados e validação de integridade ainda pendentes.
Próxima decisão: momento da nova consulta antes da cobrança. Recomendação a apresentar: consultar novamente ao gerar cobrança e quando produto, variação ou quantidade mudarem, em vez de confiar apenas na consulta anterior da conversa. Isso não equivale a reserva nem elimina concorrência após a consulta.

### D26 — reconsulta de estoque antes da cobrança
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: consultar novamente antes de gerar a cobrança; consultar também quando produto, variação ou quantidade mudarem.
Estado: definido; implementação e verificação pendentes.
Critério: para produto dependente de estoque, consulta anterior da conversa não substitui verificação no momento de gerar cobrança. Mudança de produto, variação ou quantidade invalida a confirmação anterior para a nova composição. Consulta usa vínculo válido de D25 e quantidade solicitada; falha ou resultado inconclusivo segue confirmação humana de D23.
Exemplo: cliente muda de uma para três unidades; disponibilidade de uma unidade não autoriza cobrança das três sem nova consulta correspondente.
Cenários de aceite: nova consulta antecede geração da cobrança; alteração da composição exige reconsulta; indisponibilidade impede geração automática. Política de latência, repetição e invalidação de cobrança já emitida por alteração do pedido ainda precisam ser definidas.
Limite: consulta não cria reserva; estoque pode mudar entre a emissão da cobrança e o pagamento. Não afirmar garantia de disponibilidade por esta regra.
Próxima decisão: pagamento recebido com indisponibilidade posterior do item. Recomendação a apresentar: registrar pagamento sem marcar pedido como pronto/concluído, encaminhar à equipe e informar que a disponibilidade precisa de resolução; não substituir produto ou estornar automaticamente sem regra/autorização específica.

### D27 — pagamento confirmado com item indisponível
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: registrar o pagamento e encaminhar à equipe para resolver; sem prometer entrega, substituir ou estornar automaticamente.
Estado: definido; implementação e verificação pendentes.
Critério: preservar o fato financeiro confirmado, distinguindo-o do atendimento/entrega do pedido. Indisponibilidade deixa o pedido pendente de resolução humana, sem marcar como entregue ou concluído por consequência do pagamento. Transferência efetiva segue D07–D09. Não substituir item nem executar estorno automático com base apenas nessa situação.
Exemplo: cliente paga cobrança emitida quando havia estoque; item esgota antes da confirmação. Sistema registra o pagamento confirmado e sinaliza o problema para a equipe, sem garantir entrega.
Cenários de aceite: pagamento não é apagado ou negado por falta de estoque; pendência fica visível à equipe; não há substituição, promessa de entrega ou estorno automático. Responsabilidade, comunicação ao cliente e prazo de resolução precisam de detalhamento.
Próxima decisão: fontes aceitas para confirmar pagamento. Recomendação a apresentar: confirmação por provedor integrado validado ou conferência manual por pessoa autorizada; mensagem/comprovante do cliente apenas inicia verificação, sem marcar pago automaticamente. Protocolos e integração atual ainda exigem inspeção e testes.

### D28 — confirmação de pagamento
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: confirmação validada do provedor integrado ou conferência manual por pessoa autorizada; comprovante apenas inicia verificação.
Estado: definido; implementação e verificação pendentes.
Critério: mensagem do cliente, imagem, OCR ou interpretação da IA não bastam para marcar pago. Confirmação integrada precisa ser validada e vinculada à cobrança correta; confirmação manual exige pessoa autorizada e registro da conferência. Preservar origem, autoria quando aplicável e momento da confirmação. Não confundir cobrança gerada com valor recebido.
Exemplo: cliente envia comprovante; sistema registra a solicitação de verificação, mantendo pagamento pendente até confirmação válida. Evento validado do provedor ou conferência autorizada pode confirmar o recebimento.
Cenários de aceite: comprovante isolado não muda para pago; confirmação sem permissão é bloqueada; confirmação válida corresponde à cobrança e à empresa. Autenticidade, duplicidade, valor divergente, pagamento parcial e estorno ainda precisam de contratos e testes específicos.
Próxima decisão: continuidade após pagamento confirmado sem outra pendência. Recomendação a apresentar: próximo passo configurado por empresa/função, como entrega digital, pedido para equipe ou agendamento; só confirmar ao cliente resultados efetivamente executados. A confirmação financeira não encerra automaticamente a jornada.

### D29 — continuidade após pagamento confirmado
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: executar o próximo passo configurado para aquela operação, como entrega digital, agendamento ou encaminhamento à equipe.
Estado: definido; implementação e verificação pendentes. Exemplos não confirmam integrações existentes nem habilitam ações automaticamente.
Critério: após confirmação válida e ausência de pendências impeditivas, executar somente o próximo passo previamente configurado e autorizado. Confirmar ao cliente o resultado efetivamente observado; pagamento confirmado não comprova entrega, agendamento ou conclusão. Pendência de estoque continua sujeita a D27.
Exemplo: operação configurada para agendar deve obter confirmação do agendamento antes de dizer que foi realizado. Operação de encaminhamento deve criar a pendência para a equipe sem afirmar que o serviço foi entregue.
Cenários de aceite: operação sem ação configurada não inventa continuidade; ação respeita empresa/pedido/permissões; sucesso é sustentado por resultado verificável. Falhas, repetição, tempo limite e acompanhamento seguem pendentes.
Próxima decisão: tratamento de falha no passo posterior ao pagamento. Recomendação a apresentar: manter pagamento confirmado, registrar entrega/ação pendente e tentar novamente apenas quando houver garantia contra duplicidade, com limite; encaminhar à equipe quando não houver repetição segura ou as tentativas se esgotarem. Resultado incerto exige consulta/reconciliação antes de repetir, não pressupor falha.

### D30 — falha na ação posterior ao pagamento
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: manter ação pendente; tentar novamente com limite quando não houver risco de duplicar e encaminhar à equipe se não resolver.
Estado: definido; implementação e verificação pendentes.
Critério: falha na entrega/ação não desfaz a confirmação financeira nem representa conclusão do pedido. Repetição automática exige proteção contra duplicidade e limite definido. Resultado incerto requer conferir o estado externo antes de repetir. Se repetição não for segura ou não resolver dentro do limite, criar encaminhamento humano verificável.
Exemplo: integração de agendamento não responde; sistema verifica se o agendamento foi criado antes de tentar novamente. Não criar dois agendamentos nem anunciar sucesso sem confirmação.
Cenários de aceite: pagamento preservado; ação pendente visível; nenhuma repetição insegura; limite respeitado; equipe recebe caso não resolvido. Quantidade/intervalo de tentativas, responsabilidade e detalhes de reconciliação ainda pendentes.
Próxima decisão: comunicação ao cliente durante pendência pós-pagamento. Recomendação a apresentar: confirmar recebimento, explicar pendência em linguagem simples e avisar quando houver conclusão ou necessidade de ação; comunicar prazo somente com regra aplicável. Não enviar erro técnico nem notificações a cada tentativa interna. Regras de canal e responsabilidade da conversa permanecem aplicáveis.

### D31 — comunicação de pendência pós-pagamento
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: confirmar pagamento, explicar pendência e atualizar na conclusão ou quando houver ação necessária; prazo somente com regra válida.
Estado: definido; implementação e verificação pendentes.
Critério: comunicação distingue recebimento confirmado de entrega/agendamento pendente. Não afirmar conclusão sem evidência nem inventar prazo. Atualizações ao cliente correspondem a mudança relevante ou ação necessária, sem notificar cada tentativa interna. Respeitar canal e responsabilidade atual da conversa; se a equipe assumiu, a IA não retoma autonomamente.
Exemplo: pagamento confirmado, integração de agendamento pendente; cliente é informado dessa situação em linguagem simples e recebe a confirmação do agendamento somente quando ele for efetivamente confirmado.
Cenários de aceite: status financeiro correto; pendência clara; conclusão só após evidência; previsão sem regra não é enviada; não há mensagens repetidas por cada tentativa interna.

## Marco da descoberta — transição de função
Decisões D01–D31 são especificações aprovadas na conversa, não funcionalidades implementadas ou homologadas. Cobrem configuração guiada, testes/liberação, transferência humana, exceções comerciais, fontes de informação, catálogo/estoque e continuidade pós-pagamento. Detalhes pendentes estão registrados nas respectivas decisões; não é necessário esgotar toda exceção antes de mapear as outras funções.
Próxima função: qualificação de contatos. Próxima decisão proposta: critérios explícitos por empresa para distinguir contato recebido de contato qualificado. Campos, evidências e participação humana serão definidos em seguida. Não presumir que mensagem recebida, intenção inferida ou pagamento sejam critérios universais de qualificação.

### D32 — critérios de qualificação por empresa
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: critérios configuráveis por empresa, com sugestões conforme o objetivo e confirmação do responsável.
Estado: definido; implementação e verificação pendentes.
Critério: sistema sugere critérios pertinentes ao objetivo, mas a empresa confirma o conjunto válido antes de usá-lo. Recebimento de mensagem por si só não implica qualificação. Critérios e alterações devem ser identificáveis para explicar a classificação de um contato; regras de mudança e efeito sobre contatos existentes ainda pendentes.
Exemplo: região atendida, interesse em serviço oferecido e necessidade identificada podem compor critérios de uma empresa; não se tornam requisitos universais para todas.
Cenários de aceite: sugestões não ativam regras silenciosamente; critérios pertencem à empresa correta; classificação pode indicar quais requisitos foram atendidos ou permanecem desconhecidos. Campos, evidências, obrigatoriedade, desqualificação e participação humana ainda precisam de definição.
Próxima decisão: quem confirma a qualificação quando os critérios parecem atendidos. Recomendação a apresentar: configurável por empresa entre sugestão com confirmação humana e classificação automática baseada em evidências dos critérios; começar com confirmação humana no modo de teste. Esta proposta ainda não autoriza qualificação automática nem eventos externos de conversão.

### D33 — confirmação da qualificação
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: configurável por empresa entre confirmação humana e automática com evidências; começar com revisão humana no teste.
Estado: definido; implementação e verificação pendentes.
Critério: no teste, IA apresenta sugestão e evidências para revisão humana, sem confirmar autonomamente. Após validação/liberação aplicável, empresa pode escolher confirmação humana ou automática sustentada pelos critérios obrigatórios e suas evidências. Informação desconhecida não conta como requisito atendido. Configurar modo automático não dispensa D01–D05.
Exemplo: IA identifica necessidade e região na conversa e mostra as mensagens de apoio. Em modo de revisão, equipe confirma; no automático validado, classificação depende do cumprimento comprovado dos critérios configurados.
Cenários de aceite: modo humano não confirma sozinho; automático não qualifica por simples recebimento de mensagem; justificativa identifica evidências e critérios; decisão humana fica distinguida da automática. Eventos externos, reclassificação e edição das evidências ainda pendentes.
Próxima decisão: coleta de informações faltantes. Recomendação a apresentar: perguntas progressivas dentro da conversa, aproveitando dados já conhecidos e explicando a necessidade quando útil; não impedir resposta a dúvida simples para exigir todo o cadastro. Ordem, obrigatoriedade e tratamento de recusa ainda precisam de definição.

### D34 — coleta progressiva para qualificação
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: responder o que já puder e perguntar aos poucos o que faltar, sem repetir dados já informados.
Estado: definido; implementação e verificação pendentes.
Critério: aproveitar informações pertinentes disponíveis na conversa e nos registros autorizados; responder às solicitações quando houver informação suficiente, sem exigir conclusão de todo o roteiro de qualificação. Perguntar progressivamente apenas o que falta. Não responder com suposição quando o dado ausente for necessário para a resposta ou ação específica.
Exemplo: pode apresentar preço conhecido enquanto pergunta a região para verificar atendimento; não confirmar frete ou cobertura sem os dados necessários. Informação já fornecida não deve ser solicitada novamente sem motivo de confirmação explícito.
Cenários de aceite: dúvida simples não é bloqueada por cadastro completo; perguntas relevantes são graduais; ausência de evidência mantém critério pendente; atendimento não inventa dados para completar qualificação.
Próxima decisão: recusa do cliente em fornecer informação necessária à qualificação. Recomendação a apresentar: respeitar a recusa, manter qualificação incompleta e continuar o atendimento possível; bloquear somente ação que realmente dependa do dado. Não confundir ausência de informação com evidência de desqualificação.

### D35 — recusa em informar dado de qualificação
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: respeitar a recusa, manter qualificação incompleta e continuar ajudando no que não depender do dado.
Estado: definido; implementação e verificação pendentes.
Critério: não inventar informação nem considerar requisito atendido diante de recusa. Não classificar como desqualificado somente pela ausência da resposta. Continuar atendimento permitido; manter pendente apenas a ação que efetivamente exija o dado. Não insistir repetidamente na mesma pergunta recusada durante a conversa.
Exemplo: cliente prefere não informar orçamento; IA pode explicar opções e manter esse critério pendente. Se um endereço for necessário para calcular entrega, não prometer o valor de frete sem ele.
Cenários de aceite: recusa preservada sem pressão repetitiva; qualificação incompleta distinguida de incompatibilidade comprovada; ajuda independente do dado continua; ações dependentes não avançam por suposição.
Próxima decisão: tratamento de critério obrigatório comprovadamente não atendido. Recomendação a apresentar: registrar incompatibilidade e motivo, explicar limite relevante ao cliente e oferecer alternativas autorizadas quando houver, sem encerrar o contato automaticamente. Classificação segue modo de confirmação definido em D33; não supor que autorização de qualificação automática já abrange descarte automático.

### D36 — incompatibilidade confirmada na qualificação
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: explicar o limite, registrar o motivo e oferecer alternativas autorizadas quando houver, sem encerrar o contato automaticamente.
Estado: definido; implementação e verificação pendentes.
Critério: registrar critério não atendido e evidência correspondente, distinguindo incompatibilidade de informação ausente. Explicar ao cliente o limite pertinente sem expor avaliação interna desnecessária. Alternativas dependem de regras e disponibilidade reais; não inventar cobertura ou exceção. Não encerrar, excluir ou descartar automaticamente o contato.
Exemplo: endereço fora da região atendida; informar a limitação e, se permitido, apresentar opção de retirada. Sem alternativa válida, explicar o limite sem fabricar solução.
Cenários de aceite: motivo rastreável; dados ausentes não tratados como incompatibilidade; contato e histórico preservados; alternativa respeita regras vigentes. Autoridade para mudar status de desqualificação e reavaliação posterior continuam pendentes; D33 não autoriza descarte automático por inferência.
Próxima decisão: ação após confirmação de qualificação. Recomendação a apresentar: próximo passo configurado por objetivo/empresa, como criar/atualizar oportunidade, atribuir responsável ou continuar atendimento pela IA. Evitar impor transferência humana em todos os modelos de operação. Eventos externos de conversão precisam de decisão própria e não são habilitados por esta transição.

### D37 — continuidade após qualificação
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: seguir regra configurada pela empresa — criar/atualizar oportunidade, encaminhar a responsável ou continuar com a IA.
Estado: definido; implementação e verificação pendentes.
Critério: confirmação válida conforme D33 dispara apenas a continuidade configurada e autorizada para o objetivo da empresa. Não presumir transferência humana universal. Resultado deve ser observável, distinguindo classificação confirmada de ação subsequente concluída; falha de ação não apaga o fato da qualificação.
Exemplo: operação de vendas assistidas encaminha ao responsável e cria/atualiza oportunidade conforme a regra; operação automatizada pode continuar com IA liberada. Nenhuma opção autoriza evento externo de conversão por consequência implícita.
Cenários de aceite: empresa correta e regra aplicável; continuidade não inventada se não configurada; repetição do mesmo evento não gera novas oportunidades/encaminhamentos indevidos. Configuração de múltiplas ações, ordenação e tratamento de falha ainda pendentes.
Próxima função: gestão de oportunidades. Próxima decisão: distinguir continuidade da mesma negociação de nova demanda do mesmo contato. Recomendação a apresentar: atualizar oportunidade da mesma negociação, permitir oportunidade separada para demanda independente e pedir confirmação quando ambíguo. Não deduplicar apenas pelo contato nem criar nova oportunidade a cada mensagem.

### D38 — continuidade e nova oportunidade
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: atualizar oportunidade da mesma negociação; criar outra para demanda independente e pedir confirmação se houver dúvida.
Estado: definido; implementação e verificação pendentes.
Critério: contato não é a única chave da negociação. Aproveitar oportunidade correspondente quando houver continuidade identificável; admitir oportunidades distintas para demandas independentes do mesmo contato. Ambiguidade não autoriza criar, mesclar ou sobrescrever oportunidades silenciosamente; exigir confirmação antes da decisão estrutural. Atendimento que não dependa dessa escolha pode continuar.
Exemplo: cliente retoma compra em andamento: atualizar oportunidade correspondente. Cliente solicita outro serviço independente: criar oportunidade separada conforme regra autorizada. Duas negociações plausíveis: solicitar confirmação de vínculo.
Cenários de aceite: nova mensagem não cria duplicata por si só; demandas independentes não se sobrescrevem; confirmação resolve ambiguidade; histórico da negociação permanece rastreável. Destinatário da confirmação, oportunidades encerradas, identidade multicanal e critérios de correspondência seguem pendentes.
Próxima decisão: avanço entre etapas do funil. Recomendação a apresentar: regras por etapa, automação apenas para fatos verificáveis e revisão humana nas etapas que exijam julgamento. Não presumir equivalência entre pagamento confirmado, venda ganha e entrega concluída.

### D39 — avanço das oportunidades no funil
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: regra por etapa; automatizar fatos verificáveis e exigir confirmação humana quando houver julgamento.
Estado: definido; implementação e verificação pendentes.
Critério: cada etapa define condição de entrada e modo de confirmação. Avanço automático depende de evidência do evento efetivamente ocorrido, não apenas texto ou intenção inferida pelo modelo. Quando depender de julgamento, apresentar sugestão para confirmação humana. Registrar motivo/origem da mudança e preservar regras de empresa e negociação.
Exemplo: envio confirmado da proposta pode sustentar etapa correspondente; impressão de interesse não avança silenciosamente etapa que exige avaliação. Pagamento confirmado, venda ganha e entrega concluída não são equivalentes por padrão.
Cenários de aceite: fato sem comprovação não move automaticamente; sugestão subjetiva aguarda confirmação; mudança é rastreável; evento repetido não gera transições indevidas. Regressão, concorrência com edição manual e efeito de mudanças de regra seguem pendentes.
Próxima decisão: configuração inicial do funil. Recomendação a apresentar: modelo sugerido pelo objetivo, com etapas e critérios editáveis antes de ativar. Modelo é ponto de partida, não regra comercial universal; quantidade de funis e migração de oportunidades existentes ainda precisam de definição.

### D40 — configuração inicial do funil
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: começar com modelo sugerido pelo objetivo e ajustar etapas e critérios antes de ativar.
Estado: definido; implementação e verificação pendentes.
Critério: apresentar modelo como ponto de partida editável; permitir revisar etapas, critérios e modos de confirmação conforme D39 antes da ativação. Sugestão não modifica automaticamente funil ativo nem movimenta oportunidades existentes. Modelo não equivale a processo validado para toda empresa.
Exemplo: empresa parte de um modelo de venda consultiva e adapta as etapas e fatos necessários ao seu processo antes de usá-lo.
Cenários de aceite: alterações do modelo são preservadas; critérios ficam explícitos; ativação é distinguida da edição; oportunidades existentes não migram silenciosamente. Catálogo de modelos, permissões e testes de ativação ainda pendentes.
Próxima decisão: um ou vários funis por empresa. Recomendação a apresentar: começar com um funil principal e permitir adicionais quando processos forem realmente distintos, evitando exigir múltiplos funis no início. Critérios de escolha do funil para cada oportunidade e limites ainda não definidos.

### D41 — múltiplos funis por empresa
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: começar com um funil principal e permitir outros quando processos precisarem de etapas diferentes.
Estado: definido; implementação e verificação pendentes.
Critério: configuração inicial não obriga criar vários funis. Empresa pode adicionar processos com etapas e critérios próprios quando necessário, mantendo oportunidades vinculadas ao processo correspondente e isolamento por empresa. Não duplicar negociações por criar novo funil.
Exemplo: venda de produto usa funil principal; contratação de serviço com avaliação e proposta próprias pode receber outro funil. Categorias comerciais sem diferença de processo não exigem novo funil.
Cenários de aceite: operação com um funil é completa; funis adicionais mantêm regras próprias; criação de funil não migra nem duplica oportunidades existentes silenciosamente. Permissões, limites e migração seguem pendentes.
Próxima decisão: escolha do funil para nova oportunidade. Recomendação a apresentar: regras explícitas por produto/serviço ou operação, configuradas pela empresa; se não houver correspondência inequívoca, sugerir e pedir confirmação, sem mover ou duplicar oportunidade por inferência. Funil principal como destino automático em caso ambíguo ainda não aprovado.

### D42 — direcionamento da oportunidade ao funil
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: usar regras por produto, serviço ou operação; pedir confirmação quando não houver correspondência clara.
Estado: definido; implementação e verificação pendentes.
Critério: direcionamento usa regra explícita configurada pela empresa e dados pertinentes da negociação. Ausência de regra ou múltiplas correspondências conflitantes exigem confirmação; não escolher por suposição nem criar duplicatas em vários funis. Escolha do funil não redefine por si só a identidade da negociação de D38.
Exemplo: serviço com processo próprio direciona para seu funil; pedido misto sem regra clara fica com escolha pendente para confirmação, preservando conversa e informações.
Cenários de aceite: regra inequívoca direciona corretamente; ambiguidade não gera movimentação silenciosa; decisão fica rastreável; funis de outra empresa são inacessíveis. Responsável pela confirmação e tratamento visual da pendência seguem pendentes.
Próxima decisão: atribuição de responsável comercial da oportunidade. Recomendação a apresentar: regra por empresa/equipe, preservando vínculo válido existente e permitindo distribuição de novos casos; sem destino válido, manter fila visível, sem atribuição fictícia. Papel de responsável pela oportunidade não deve ser confundido com quem está conduzindo a conversa neste instante.

### D43 — responsável comercial da oportunidade
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: regra da empresa preserva responsável existente e distribui novos casos por equipe; sem destino válido, manter fila visível.
Estado: definido; implementação e verificação pendentes.
Critério: preservar atribuição existente válida; novos casos seguem regra configurada da empresa/equipe. Não atribuir pessoa inexistente, sem acesso ou inelegível. Se não houver destino válido, oportunidade permanece acessível em fila de pendências, sem simular atribuição concluída. Responsável comercial e condutor atual da conversa são conceitos distintos.
Exemplo: IA continua atendendo, mas oportunidade mantém vendedor responsável. Nova oportunidade sem pessoa elegível entra na fila para tratamento, sem ser perdida.
Cenários de aceite: vínculo válido preservado; distribuição respeita equipe/empresa; falha de atribuição é visível; troca de condutor da conversa não altera responsável comercial por consequência implícita. Ausência temporária do responsável e permissões de redistribuição seguem pendentes.
Próxima decisão: mecanismo de distribuição dos novos casos entre integrantes elegíveis. Recomendação a apresentar: escolha por equipe entre rodízio, capacidade disponível ou seleção manual, com padrão simples de rodízio. Capacidade exige limites e estados confiáveis ainda a definir; não presumir que menos casos significa disponibilidade real.

### D44 — método de distribuição por equipe
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: configurável por equipe; rodízio como padrão, com opção de capacidade disponível ou escolha manual.
Estado: definido; implementação e verificação pendentes.
Critério: novos casos sujeitos a distribuição seguem o método escolhido pela equipe, respeitando elegibilidade e D43. Rodízio é padrão; capacidade depende de critérios/limites explícitos ainda a definir. Modo manual mantém pendência visível até atribuição real. Método não modifica silenciosamente vínculos existentes válidos.
Exemplo: equipe começa com rodízio e posteriormente pode adotar capacidade após configurar seus limites. Sem integrante elegível, caso permanece na fila, sem atribuição fictícia.
Cenários de aceite: método é configurável por equipe; rodízio não atribui fora do conjunto elegível; modo manual não simula distribuição; capacidade não presume disponibilidade apenas por contagem bruta de casos. Concorrência, justiça do rodízio e métricas de capacidade ainda pendentes.
Próxima decisão: ausência temporária do responsável comercial. Recomendação a apresentar: preservar vínculo da oportunidade e permitir cobertura do atendimento pela equipe conforme regras de disponibilidade; transferência definitiva exige ação/regra específica. Ausência de acesso ou desligamento não é equivalente a ausência temporária e deve ser tratada separadamente.

### D45 — cobertura de ausência temporária
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: preservar responsável comercial e permitir que outra pessoa da equipe cubra o atendimento.
Estado: definido; implementação e verificação pendentes.
Critério: cobertura por pessoa autorizada e com acesso não transfere automaticamente a responsabilidade comercial. Identificar quem efetivamente conduz a conversa e registrar atuação no histórico. Enquanto pessoa atende, IA respeita o controle humano definido em D08–D09.
Exemplo: vendedor ausente permanece responsável pela oportunidade; colega elegível assume a conversa para ajudar o cliente, sem se tornar dono da negociação por consequência implícita.
Cenários de aceite: cliente pode receber cobertura; responsável comercial permanece; autor das mensagens/ações fica identificável; acesso de outra equipe/empresa não é concedido por cobertura. Disponibilidade, prioridade da cobertura e transferência definitiva ainda precisam de regras próprias.
Próxima decisão: acompanhamento de oportunidade parada. Recomendação a apresentar: prazos configuráveis por etapa geram tarefa/alerta para responsável e fila de supervisão quando aplicável; contato automático ao cliente depende de configuração própria, não do alerta interno. Não declarar perda ou disparar mensagens apenas por inatividade.

### D46 — oportunidade parada e acompanhamento interno
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: criar tarefa ou alerta interno para acompanhamento; mensagens ao cliente dependem de regra própria.
Estado: definido; implementação e verificação pendentes.
Critério: ao ultrapassar prazo configurado para a etapa sem avanço/próximo passo pertinente, gerar pendência interna identificável para acompanhamento. Inatividade não significa perda e não autoriza envio automático ao cliente. Não gerar repetidamente pendências equivalentes para o mesmo episódio sem mudança relevante.
Exemplo: proposta sem retorno ultrapassa prazo da etapa; responsável vê tarefa/alerta de acompanhamento. Cliente não recebe mensagem apenas pela criação desse alerta.
Cenários de aceite: prazo aplicável e motivo visíveis; responsável/equipe conseguem localizar a pendência; alerta não muda oportunidade para perdida; mensagem externa requer regra independente. Definição de inatividade, calendário, prazos, escalonamento e formato tarefa/alerta ainda pendentes.
Próxima função: acompanhamento automático do cliente. Próxima decisão: como habilitar sequências de acompanhamento. Recomendação a apresentar: sequência opcional por etapa/objetivo, com prévia de conteúdo, intervalos, limite e condições de parada aprovados antes de ativar. Configurar sequência não autoriza mensagens fora das permissões do canal nem retomar IA em conversa humana.

### D47 — sequências opcionais de acompanhamento
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: sequência opcional por etapa ou objetivo, revisando mensagens, intervalos, limite de tentativas e condições de parada antes de ativar.
Estado: definido; implementação e verificação pendentes.
Critério: acompanhamento externo exige configuração e ativação próprias, distintas do alerta interno de D46. Empresa revisa conteúdo, intervalos, limite e condições de parada. Não habilitar sequência silenciosamente por usar modelo de funil. Envios continuam condicionados ao canal, estado da negociação e responsabilidade da conversa; não reativar IA sobre atendimento humano.
Exemplo: empresa prepara lembretes de proposta sem resposta, confere as mensagens e limites e ativa a sequência aplicável. Sem ativação, oportunidade parada gera apenas a pendência interna configurada.
Cenários de aceite: sequência desativada não envia; prévia permite revisar seus elementos; limites são respeitados; condições impeditivas são conferidas antes do envio. Horários, consentimento/preferências, contagem de tentativas e tratamento de falhas ainda pendentes.
Próxima decisão: resposta do cliente durante sequência ativa. Recomendação a apresentar: interromper os próximos lembretes e devolver ao fluxo de conversa vigente; eventual nova sequência depende de nova condição/configuração, sem continuar mensagens antigas fora de contexto. Interrupção por resposta não autoriza IA a assumir conversa humana.

### D48 — resposta durante acompanhamento automático
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: interromper a sequência e retomar a conversa com quem já é responsável por atendê-la.
Estado: definido; implementação e verificação pendentes.
Critério: resposta do cliente interrompe os lembretes restantes da sequência em curso. Não retomar automaticamente essa sequência apenas por novo silêncio. Continuidade respeita condutor atual e fila humana conforme D08–D09; interrupção não transfere responsabilidade comercial. Conferir estado antes do envio para evitar lembrete obsoleto já agendado.
Exemplo: cliente responde ao primeiro lembrete de proposta; os próximos não são enviados. Se conversa estava com equipe, IA não assume pelo recebimento da resposta.
Cenários de aceite: próximos envios são cancelados/bloqueados; responsabilidade preservada; resposta não reinicia a mesma sequência; corrida entre resposta e envio precisa de teste específico. Tipos de evento que contam como resposta e escopo entre negociações simultâneas ainda pendentes.
Próxima decisão: sequência esgotada sem resposta. Recomendação a apresentar: encerrar somente a sequência, manter oportunidade sem decisão automática de perda e criar pendência interna para avaliação. Não iniciar outra sequência automaticamente como forma de contornar limite.

### D49 — sequência esgotada sem retorno
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: encerrar sequência e criar pendência interna para avaliação, sem marcar oportunidade perdida automaticamente.
Estado: definido; implementação e verificação pendentes.
Critério: ao esgotar tentativas previstas sem resposta, não continuar envios nem iniciar outra sequência automaticamente para contornar o limite. Encerrar apenas a sequência e disponibilizar avaliação interna; silêncio não confirma perda. Preservar estado e histórico da oportunidade até decisão autorizada.
Exemplo: último lembrete não recebe resposta; responsável recebe pendência para avaliar próximo passo. Nenhuma perda nem nova cadência é aplicada por consequência implícita.
Cenários de aceite: limite encerra envios; pendência visível sem duplicação por reprocessamento; oportunidade não muda para perdida automaticamente; novo acompanhamento requer condição/configuração própria.
Próxima decisão: critérios de encerramento como ganha ou perdida. Recomendação a apresentar: critérios por empresa/processo, ganho baseado em marco verificável e perda com motivo e decisão autorizada; julgamento exige confirmação humana conforme D39. Pagamento, entrega e ganho não são equivalentes universais.

### D50 — encerramento como ganha ou perdida
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: critérios por empresa e processo; ganho com marco comprovado e perda com motivo, exigindo confirmação humana quando houver julgamento.
Estado: definido; implementação e verificação pendentes.
Critério: cada processo define o marco de ganho e evidência correspondente. Perda exige motivo registrado; quando depende de julgamento, aguarda confirmação humana conforme D39. Não equiparar universalmente pagamento, ganho e entrega. Preservar origem, momento e autoria da transição quando aplicável.
Exemplo: contrato assinado pode comprovar ganho de um serviço; outra operação usa pagamento confirmado. Silêncio após sequência não basta para marcar perda, conforme D49.
Cenários de aceite: ganho sem evidência não é confirmado automaticamente; perda subjetiva requer confirmação e motivo; histórico permanece auditável; conclusão comercial não fabrica conclusão financeira ou de entrega. Revisões, cancelamento pós-ganho e efeitos em relatórios/eventos externos ainda pendentes.
Próxima decisão: contato que retorna para retomar negociação encerrada como perdida. Recomendação a apresentar: identificar possível retomada e pedir confirmação para reabrir, preservando perda e motivo no histórico; demanda independente cria nova oportunidade conforme D38. Não apagar encerramento anterior nem inflar novas oportunidades por simples retorno.

### D51 — retomada de negociação perdida
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: sugerir reabrir a mesma oportunidade, com confirmação da equipe e preservação do histórico; nova demanda gera outra oportunidade.
Estado: definido; implementação e verificação pendentes.
Critério: retorno do cliente não reabre automaticamente oportunidade perdida. Identificar possível continuidade, apresentar sugestão e aguardar confirmação da equipe. Reabertura preserva evento de perda, motivo e nova transição; não apaga encerramento anterior. Demanda independente segue D38.
Exemplo: cliente retoma orçamento recusado anteriormente; equipe confirma reabertura da negociação correspondente. Pedido de outro serviço é tratado como oportunidade distinta, sem sobrescrever o negócio anterior.
Cenários de aceite: sugestão sem alteração silenciosa; confirmação e histórico rastreáveis; retomada não cria duplicata por padrão. Revalidação de preços, condições e propostas vencidas continua sujeita a D19–D21, sem restaurar benefício expirado automaticamente.
Próxima função: contatos e identidade entre canais. Próxima decisão: quando unificar registros que podem representar a mesma pessoa. Recomendação a apresentar: vínculo por identificador verificado; sem prova suficiente, sugerir e exigir confirmação, sem mesclar por nome ou similaridade. Identidade do contato não implica unir negociações independentes.

### D52 — identidade do contato entre canais
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: vincular quando houver identificador verificado em comum; nos demais casos, sugerir e pedir confirmação, sem unir só pelo nome.
Estado: definido; implementação e verificação pendentes.
Critério: vínculo exige evidência de identidade compatível e verificável no contexto da empresa; nome ou similaridade isolados não autorizam união. Evidência insuficiente gera sugestão para confirmação, sem expor histórico de outro contato ao cliente. Identificadores específicos de canais distintos não são considerados equivalentes por aparência. Vínculo de identidade não mescla oportunidades independentes.
Exemplo: perfis Instagram e WhatsApp com mesmo nome não são unidos automaticamente; confirmação válida pode estabelecer vínculo, preservando origem de cada canal.
Cenários de aceite: homônimos permanecem separados sem prova; vínculo sustentado é rastreável; dados de empresas diferentes não se misturam; oportunidades conservam identidade. Processo de verificação, autoridade para confirmar e desfazer vínculo indevido ainda pendentes.
Próxima decisão: divergência nos dados de contatos vinculados. Recomendação a apresentar: preservar valores e origens, usar dado confirmado aplicável e pedir revisão em conflito relevante, sem sobrescrever silenciosamente. Mudança confirmada pelo cliente deve ser distinguida de informação inferida pela IA.

### D53 — divergência de dados em contatos vinculados
Origem: resposta explícita do usuário nesta conversa em 16/10/2026.
Decisão: preservar valores e origens; usar o dado confirmado e pedir revisão quando houver conflito relevante.
Estado: definido; implementação e verificação pendentes.
Critério: vínculo de identidade não sobrescreve silenciosamente campos divergentes. Manter procedência e confirmação de cada valor; usar informação confirmada e aplicável à situação. Conflito que afete uma resposta ou ação exige resolução antes dessa ação, sem bloquear ajuda independente. Se nenhum dado estiver confirmado, não apresentar uma escolha inferida como certa.
Exemplo: dois e-mails diferentes aparecem nos canais vinculados; não substituir automaticamente o endereço de entrega digital pelo mais recente sem confirmação pertinente.
Cenários de aceite: valores anteriores preservados; origem visível à equipe; conflito relevante sinalizado; ação dependente não usa dado escolhido arbitrariamente. Critérios de relevância, verificação e permissão de edição ainda pendentes.
Próxima decisão: desfazer vínculo de identidade incorreto. Recomendação a apresentar: pessoa autorizada separa os contatos preservando origem e histórico de auditoria; registros com associação inequívoca voltam ao contato correspondente e casos ambíguos exigem revisão. Não apagar ou duplicar silenciosamente mensagens, pagamentos ou oportunidades.

### D54 — correção de vínculo indevido entre contatos
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: pessoa autorizada separa os contatos, preservando histórico e origem; informações com destino duvidoso ficam para revisão.
Estado: definido; implementação e verificação pendentes.
Critério: separação exige permissão e registra autoria/momento. Preservar procedência dos registros; reassociar somente quando o destino estiver sustentado por evidência. Registros ambíguos ficam pendentes de revisão, sem atribuição arbitrária, exclusão ou duplicação silenciosa. Não disponibilizar dados de identidade duvidosa à IA para personalizar respostas de outro contato.
Exemplo: mensagens com origem de canal inequívoca retornam ao contato correspondente; uma anotação conjunta sem identificação suficiente exige revisão antes de reassociação.
Cenários de aceite: correção rastreável; histórico preservado; mensagens, oportunidades e pagamentos não duplicados; ambiguidade visível e sem exposição ao contato errado. Papéis, procedimento de revisão e efeitos em ações pendentes ainda precisam de especificação.
Próxima função: preferências de contato e interrupção de mensagens automáticas. Próxima decisão: alcance do pedido para parar mensagens. Recomendação a apresentar: interromper campanhas e acompanhamentos proativos, preservando respostas a novas solicitações e avisos necessários de operações em andamento, sem conteúdo promocional; pedido mais amplo exige tratamento explícito. Regra de produto proposta, sem conclusão jurídica ou confirmação de implementação atual.

### D55 — pedido para parar mensagens automáticas
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: interromper campanhas e lembretes comerciais; manter respostas a novas solicitações e avisos necessários de pedidos em andamento, sem promoção.
Estado: definido; implementação e verificação pendentes.
Critério: registrar preferência e impedir campanhas/acompanhamentos comerciais proativos, incluindo envios pendentes antes da expedição. Nova mensagem do cliente pode receber resposta pertinente sem reativar campanhas. Avisos operacionais necessários devem corresponder a pedido real em andamento, sem conteúdo promocional e respeitando permissões do canal. Pedido explícito mais abrangente não deve ser reduzido silenciosamente a esta preferência comercial.
Exemplo: cliente pede para parar lembretes de compra; sequência comercial é interrompida. Pode continuar recebendo resposta a uma dúvida que enviar e atualização necessária de pedido já pago, sem oferta adicional.
Cenários de aceite: campanhas e lembretes bloqueados; resposta solicitada não reativa marketing; aviso operacional não inclui promoção. Alcance entre canais, reversão da preferência e classificação de aviso necessário ainda pendentes. Regra de produto aprovada, sem homologação jurídica ou confirmação de implementação.
Próxima decisão: alcance da preferência nos canais vinculados. Recomendação a apresentar: pedido genérico vale para campanhas/lembretes em todos os canais com identidade confirmada da mesma empresa; pedido explicitamente limitado a canal respeita esse escopo. Não propagar entre empresas ou identidades não confirmadas.

### D56 — alcance do bloqueio comercial entre canais
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: pedido genérico vale em todos os canais de identidade confirmada da mesma empresa; limitar a um canal somente se o cliente pedir explicitamente.
Estado: definido; implementação e verificação pendentes.
Critério: preferência comercial acompanha a identidade confirmada dentro da empresa, impedindo contorno por outro canal vinculado. Escopo explicitamente restrito pelo cliente é preservado. Não propagar automaticamente a outras empresas ou contatos cuja identidade não foi confirmada. Reavaliar permissão antes do envio, inclusive para mensagens já agendadas.
Exemplo: pedido genérico no WhatsApp também bloqueia ofertas no Instagram vinculado e confirmado. Pedido expresso para parar somente no WhatsApp mantém esse escopo sem significar autorização nova para outros canais.
Cenários de aceite: canal alternativo não contorna bloqueio geral; restrição específica respeitada; preferências não atravessam empresas; novas associações de identidade precisam reconciliar preferências sem liberar campanhas silenciosamente. Tratamento de conflitos entre preferências e desvinculação ainda pendente.
Próxima decisão: reativação de campanhas/lembretes após bloqueio. Recomendação a apresentar: manifestação explícita do cliente para voltar a receber, com registro de origem, momento e escopo; nova conversa ou compra não reativa por si só. Não presumir que funcionário pode remover preferência apenas para incluir em campanha.

### D57 — reativação de mensagens comerciais
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: pedido ou aceite explícito do cliente para voltar, registrando origem, momento e canais abrangidos.
Estado: definido; implementação e verificação pendentes.
Critério: nova conversa, compra ou alteração manual sem evidência não remove bloqueio comercial. Reativação exige manifestação explícita verificável do cliente, com origem, momento e escopo preservados. Autorizar um canal não libera outros por consequência; tampouco autoriza comunicação fora das regras do canal.
Exemplo: cliente pede novamente ofertas pelo WhatsApp; registrar essa manifestação e permitir apenas o escopo confirmado, sem liberar Instagram automaticamente.
Cenários de aceite: histórico de bloqueio/reativação preservado; ausência de aceite mantém bloqueio; escopo respeitado; preferência verificada antes do envio. Forma de coleta, autenticação da manifestação e permissões de registro ainda pendentes.
Próxima função: criação de campanhas e seleção de público. Próxima decisão: como montar audiência. Recomendação a apresentar: filtros por dados confirmados, critérios e etapas, com IA sugerindo segmentos e prévia de incluídos/excluídos; preferências de contato e permissões do canal são verificadas independentemente. Selecionar audiência não autoriza envio.

### D58 — seleção de público de campanhas
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: filtros por dados, interesses confirmados e etapas; IA sugere segmentos e mostra prévia de incluídos e excluídos.
Estado: definido; implementação e verificação pendentes.
Critério: audiência deriva de critérios explícitos e informações disponíveis confirmadas, não de interesses inventados. Sugestão da IA é revisável. Prévia mostra contagens, contatos acessíveis e motivos de exclusão pertinentes. Preferências D55–D57 e elegibilidade de canal continuam sendo verificadas antes do envio; seleção não autoriza disparo.
Exemplo: filtrar contatos com interesse confirmado em serviço e etapa pertinente; excluir bloqueados comercialmente, explicando a exclusão. Dado ausente não é tratado como interesse confirmado.
Cenários de aceite: filtros reproduzíveis; sugestões não disparam mensagens; incluídos/excluídos conferíveis; bloqueados não recebem por constarem de lista antiga; isolamento por empresa respeitado. Audiência dinâmica versus fixa, frequência entre campanhas e deduplicação multicanal ainda pendentes.
Próxima decisão: revisão e liberação de campanha. Recomendação a apresentar: prévia de mensagem, público elegível, canal, horário e custo quando disponível; teste para destinatário autorizado e liberação explícita de pessoa com permissão antes de enviar/agendar. Teste não deve disparar para a audiência inteira nem contornar preferências. Não afirmar estimativa de custo onde não houver fonte confiável.

### D59 — revisão, teste e liberação de campanha
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: revisar mensagem, público, canal, horário e custo quando disponível; enviar teste e exigir liberação explícita de pessoa autorizada.
Estado: definido; implementação e verificação pendentes.
Critério: envio/agendamento depende de revisão desses elementos, teste para destinatário autorizado e liberação explícita de pessoa habilitada. Estimativa de custo só é apresentada com fonte disponível e limites claros. Resultado do teste deve ser observado e distinguido de simples solicitação aceita; envio de teste não comprova entrega para toda a audiência. Aprovação identifica a versão da campanha revisada.
Exemplo: responsável revisa prévia e público elegível, verifica teste e libera agendamento. Selecionar filtros ou gerar texto com IA não dispara a campanha.
Cenários de aceite: sem teste/liberação não há disparo; teste não envia à audiência inteira; falta de permissão bloqueia liberação; mudança posterior não usa aprovação de conteúdo diferente silenciosamente. Mudanças que exigem novo teste, comprovação do teste e política para custo indisponível ainda precisam de detalhamento.
Próxima decisão: público de campanha pontual agendada. Recomendação a apresentar: fixar audiência revisada na liberação, sem adicionar novos contatos automaticamente; revalidar elegibilidade e preferências antes do envio, removendo quem deixou de poder receber. Campanhas recorrentes/dinâmicas são função separada, ainda não definida.

### D60 — público fixo da campanha pontual agendada
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: não incluir novos contatos após aprovação; manter público aprovado e excluir antes do envio quem deixar de ser elegível ou bloquear mensagens.
Estado: definido; implementação e verificação pendentes.
Critério: aprovação fixa audiência máxima da campanha pontual. Alteração posterior dos filtros/dados não acrescenta destinatários silenciosamente. Antes de cada envio, revalidar preferências e elegibilidade, removendo quem não puder receber. Remoção não autoriza substituição por outro contato para manter contagem.
Exemplo: campanha aprovada para um grupo; contato novo atende aos filtros depois, mas não entra nesse disparo. Contato do grupo pede bloqueio antes do envio e é excluído.
Cenários de aceite: sem crescimento automático da audiência; bloqueio recente impede envio; exclusões são rastreáveis; reprocessamento não recompõe público removido por preferência. Adição explícita com nova aprovação e campanhas dinâmicas/recorrentes seguem pendentes.
Próxima decisão: mesmo contato confirmado em múltiplos canais dentro da campanha. Recomendação a apresentar: uma comunicação por pessoa na campanha, em canal escolhido e elegível, sem duplicação automática; sem canal válido, excluir com motivo. Contato de identidade não confirmada não pode ser deduplicado apenas por nome. Substituição de canal após falha requer regra própria e não é autorizada implicitamente.

### D61 — deduplicação da campanha entre canais
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: uma comunicação por pessoa na campanha, usando o canal escolhido e elegível; sem duplicar em outro canal automaticamente.
Estado: definido; implementação e verificação pendentes.
Critério: identidade confirmada conforme D52 permite tratar múltiplos canais como a mesma pessoa para a campanha. Escolher canal elegível dentro do escopo revisado; não usar outro canal automaticamente para repetir ou contornar falha/bloqueio. Sem identidade comprovada, não mesclar por nome. Reprocessamento da campanha não deve gerar nova comunicação indevida.
Exemplo: pessoa vinculada em WhatsApp e Instagram recebe pelo canal escolhido, sem cópia automática no outro. Ausência de canal elegível gera exclusão com motivo, não substituição silenciosa.
Cenários de aceite: identidade confirmada não recebe duplicatas multicanal; preferência e audiência aprovada respeitadas; falha não provoca troca automática de canal. Escolha de canal, idempotência e interpretação dos estados de envio exigem implementação/testes específicos.
Próxima decisão: falha no envio de campanha. Recomendação a apresentar: repetir com limite apenas falha temporária confirmada e repetição protegida contra duplicidade; resultado incerto é reconciliado antes de repetir; erro definitivo fica registrado para revisão. Não trocar canal automaticamente.

### D62 — falhas de envio em campanha
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: tentar novamente com limite em falhas temporárias, conferindo resultados incertos antes de repetir; falha definitiva vai para revisão.
Estado: definido; implementação e verificação pendentes.
Critério: distinguir falha temporária confirmada, resultado incerto e erro definitivo. Repetição depende de proteção contra duplicidade e limite; resultado incerto exige conferência/reconciliação antes de novo envio. Erro definitivo gera registro de revisão, sem repetir indefinidamente ou trocar automaticamente de canal. Antes de cada tentativa, revalidar elegibilidade/preferências e estado da campanha.
Exemplo: timeout depois de enviar não equivale a falha comprovada; consultar estado quando possível. Número inválido gera falha definitiva para revisão, sem disparar pelo Instagram como alternativa implícita.
Cenários de aceite: limite respeitado; resultados incertos não repetidos cegamente; falhas definitivas visíveis; bloqueio novo impede tentativa; reprocessamento não duplica comunicação. Códigos de erro, intervalos, mecanismos de consulta e tratamento de resultado impossível de reconciliar ainda pendentes.
Próxima função: relatórios de campanha. Próxima decisão: apresentação do resultado. Recomendação a apresentar: separar alcance operacional (enviado/entregue/lido quando disponível), resposta e resultados comerciais comprovados; indicar ausência de dado e regra de atribuição. Não tratar mensagem, leitura ou resposta como venda.

### D63 — resultados no relatório de campanha
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: separar envio/entrega/leitura disponíveis, respostas, qualificação e vendas comprovadas, mostrando quando faltar dado.
Estado: definido; implementação e verificação pendentes.
Critério: métricas distinguem etapas operacionais e comerciais, cada uma com fonte e significado próprios. Ausência de leitura/entrega ou evidência comercial não equivale a zero nem sucesso. Resposta não conta como qualificação; qualificação não conta como venda. Ganho e pagamento seguem critérios aprovados e não são intercambiáveis automaticamente.
Exemplo: campanha com mensagens enviadas e respostas, mas sem vínculo comprovado a venda, apresenta esses resultados e informa ausência de atribuição comercial confirmada.
Cenários de aceite: métricas separadas; fonte e falta de dado compreensíveis; reprocessamento não infla contagens; venda depende de evidência e regra de atribuição ainda a definir. Custo, receita, receita recebida e retorno não devem ser calculados como fatos sem dados necessários.
Próxima decisão: vínculo de venda à campanha. Recomendação a apresentar: interação rastreável vinculada à negociação e janela/regra de atribuição explícita, exibindo limites; envio ou coincidência temporal isolados não bastam. Modelo multitoque, janela e fonte de atribuição ainda não definidos.

### D64 — atribuição de venda à campanha
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: interação rastreável ligada à negociação, conforme regra e prazo explícitos; recebimento da mensagem isolado não basta.
Estado: definido; implementação e verificação pendentes.
Critério: atribuição exige venda comprovada conforme processo, vínculo verificável de interação à negociação e aplicação de regra/janela identificáveis. Envio, entrega, leitura ou coincidência temporal não bastam isoladamente. Evidência ausente resulta em atribuição não confirmada, sem inventar crédito comercial. Atribuição descreve regra de contabilização, não prova causalidade.
Exemplo: resposta à campanha vinculada à negociação pode compor evidência, desde que cumpra regra e prazo definidos. Compra posterior sem vínculo rastreável não vira venda atribuída por ter havido disparo.
Cenários de aceite: vínculo e regra consultáveis; janela aplicada; falta de evidência sinalizada; oportunidade/receita não duplicadas na consolidação. Janela numérica, eventos elegíveis, correções e modelo com múltiplas campanhas seguem pendentes.
Próxima decisão: múltiplas campanhas vinculadas à mesma negociação. Recomendação a apresentar: uma atribuição principal segundo regra explícita, demais interações como assistências; total consolidado não soma a mesma venda várias vezes. Escolha exata da campanha principal e prazos ainda pendentes.

### D65 — múltiplas campanhas na mesma venda
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: uma campanha principal conforme regra definida; demais como assistências, sem duplicar venda no total.
Estado: definido; implementação e verificação pendentes.
Critério: regra explícita seleciona atribuição principal entre interações elegíveis de D64. Demais participações válidas aparecem como assistências, separadas de vendas principais. Consolidação conta a venda e sua receita uma única vez; assistência não adiciona receita ao total. Evidência insuficiente não força atribuição principal.
Exemplo: negociação tem interações válidas com duas campanhas; uma recebe crédito principal pela regra, outra aparece como assistência. Consolidado mantém uma venda, sem somar duas vezes o valor.
Cenários de aceite: distinção principal/assistência visível; regra rastreável; totais sem duplicidade; ausência de evidência preservada. Regra de escolha da principal, janela e tratamento de cancelamento seguem pendentes.
Próxima função: integração Meta e envio de eventos comerciais. Próxima decisão: habilitação de eventos de conversão. Recomendação a apresentar: mapeamento configurável entre marcos comprovados e eventos, com teste e ativação explícita; sugestão não dispara eventos. Contratos oficiais e capacidades atuais exigem verificação antes de implementar; não presumir que nome de etapa basta como evidência.

### D66 — habilitação de eventos comerciais para a Meta
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: escolher marcos comprovados a enviar, testar mapeamento e ativar explicitamente por integração.
Estado: definido; implementação e verificação pendentes.
Critério: conexão da conta não habilita envio de conversões automaticamente. Responsável escolhe mapeamento entre marco comprovado e evento suportado, valida teste e ativa a integração para esse fim. Sugestão da IA ou nome de etapa não constitui confirmação do marco. Identificar destino, empresa, modo de teste/real e resultado observado.
Exemplo: qualificação confirmada só pode produzir evento configurado após validação e ativação correspondente. Compra depende de evidência definida, não de mensagem indicando intenção de pagar.
Cenários de aceite: integração não ativada não envia; teste não é apresentado como conversão real; marco sem comprovação não dispara; destino correto e origem rastreáveis. Eventos suportados, parâmetros, permissões, deduplicação e contratos oficiais exigem inspeção/verificação antes de implementar.
Próxima decisão: alcance temporal da ativação. Recomendação a apresentar: enviar apenas novos marcos após ativação; carga histórica é ação separada, com prévia, confirmação e validação dos limites do destino. Não presumir suporte a qualquer período histórico nem alterar data original do fato para contornar limites.

### D67 — alcance temporal do envio de conversões
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: somente novos marcos; envio histórico é ação separada com prévia e confirmação, quando o destino permitir.
Estado: definido; implementação e verificação pendentes.
Critério: ativação não dispara carga retroativa automaticamente. Marcos anteriores só entram em ação histórica explícita, com evidência preservada, prévia de elegibilidade e confirmação autorizada. Respeitar limites e datas originais dos fatos; não alterar data para tornar evento aceito artificialmente.
Exemplo: conectar e ativar hoje não envia vendas antigas por consequência implícita. Empresa pode revisar carga histórica elegível em fluxo separado, se o destino suportar.
Cenários de aceite: sem retroatividade silenciosa; novos marcos seguem D66; histórico não duplica evento já enviado; exclusões e limites visíveis. Definição exata do instante de corte, reativação e migração entre destinos ainda pendentes.
Próxima decisão: falha ou incerteza no envio de eventos. Recomendação a apresentar: fila visível com estados distintos, repetição limitada de falha temporária protegida contra duplicidade, resultado incerto tratado segundo contrato do destino e erro definitivo para revisão. Não confundir aceitação técnica com atribuição ou resultado em anúncios.

### D68 — acompanhamento e falha de eventos de conversão
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: fila visível com estados e motivos; repetir falhas temporárias com limite e proteção contra duplicidade, deixando erros definitivos para revisão.
Estado: definido; implementação e verificação pendentes.
Critério: exibir estado e motivo por evento, distinguindo pendente, resultado incerto, falha e aceitação técnica. Repetição temporária exige limite e identidade estável para deduplicação conforme contrato do destino. Resultado incerto não é declarado sucesso nem repetido cegamente; encaminhar à revisão quando não houver caminho seguro de resolução. Erro definitivo não entra em repetição infinita.
Exemplo: evento sem confirmação permanece identificado como incerto; falha temporária permite repetição segura configurada. Aceitação técnica não comprova atribuição pela Meta nem resultado em anúncios.
Cenários de aceite: estados rastreáveis; duplicatas não criam novas conversões por reprocessamento; falha definitiva acessível à equipe; segredo não aparece nos motivos exibidos. Estados suportados, códigos, intervalos e confirmação externa ainda precisam de implementação/validação.
Próxima função: integrações externas/API/webhooks. Próxima decisão: permissões por integração. Recomendação a apresentar: acessos específicos por empresa, recurso e operação, distinguindo consulta de alteração; ativação mediante teste e liberação. Conectar n8n/ERP não concede autorização irrestrita para alterar contatos, negociar ou confirmar pagamentos.

### D69 — permissões de integrações externas
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: permissões por integração e operação, separando consulta de alteração, com teste e liberação antes de ativar.
Estado: definido; implementação e verificação pendentes.
Critério: integração acessa somente empresa, recursos e operações explicitamente autorizados. Consulta não implica permissão de escrita; conexão técnica não ativa ações automaticamente. Teste deve verificar resultado e limites de acesso antes da liberação. Segredos permanecem protegidos, sem exposição ao modelo ou nas prévias.
Exemplo: integração de consulta de estoque não pode alterar contatos ou marcar pagamento por consequência. Qualquer operação adicional exige permissão correspondente e validação antes da ativação.
Cenários de aceite: chamada fora do escopo é negada; separação entre empresas preservada; teste não habilita produção implicitamente; mudança de permissões não amplia acesso silenciosamente. Autenticação, credenciais, rotação, revogação, papéis e cobertura dos contratos atuais ainda pendentes.
Próxima decisão: recebimento repetido de evento/webhook externo. Recomendação a apresentar: reconhecer mesma identidade de evento por integração/empresa e não executar de novo efeitos já concluídos; permitir repetição segura de etapa pendente, com histórico. Evento sem identidade confiável ou conteúdo conflitante exige tratamento explícito, sem deduplicar por nome/horário apenas.

### D70 — repetição de evento/webhook externo
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: reconhecer evento já recebido, não repetir efeitos concluídos e retomar somente o que ficou pendente, com registro.
Estado: definido; implementação e verificação pendentes.
Critério: identidade confiável do evento é contextualizada por empresa e integração. Reentrega não cria novamente efeito concluído; retomada opera apenas etapas pendentes e seguras. Resultado incerto exige reconciliação antes de repetir ação externa. Registrar recebimentos, etapas e resultados sem expor segredos. Não considerar eventos distintos iguais apenas por coincidência de valor ou horário.
Exemplo: pagamento foi registrado, mas encaminhamento falhou; reentrega não registra outro pagamento e pode retomar encaminhamento protegido contra duplicidade.
Cenários de aceite: evento repetido não duplica cobrança/pedido/mensagem; execução parcial pode ser retomada com segurança; concorrência não produz dois efeitos; mesmo identificador com conteúdo conflitante não sobrescreve silenciosamente fato anterior. Contrato de identidade, retenção, conflitos e transação precisam de implementação/testes.
Próxima decisão: desativação de integração com ações na fila. Recomendação a apresentar: impedir novas execuções, preservar fila/histórico para revisão e não executar pendências automaticamente na reativação sem revisão/liberação. Ações já iniciadas podem ter efeito externo e devem ser reconciliadas; desativação não promete cancelamento retroativo.

### D71 — desativação de integração e fila pendente
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: suspender novas execuções e preservar pendências para revisão; reativar conexão não libera fila antiga automaticamente.
Estado: definido; implementação e verificação pendentes.
Critério: conferir ativação/permissões antes de iniciar execução. Desativação suspende novas ações e tentativas, preservando histórico e pendências. Reativação da conexão não basta para liberar ações suspensas: revisão deve considerar validade, autorização atual e risco de duplicidade. Ação já iniciada pode ter produzido efeito externo; conferir resultado antes de repetir ou declarar cancelamento.
Exemplo: integração desativada com pedidos pendentes preserva fila suspensa. Após reconectar, equipe revisa os pedidos antes da liberação, sem disparar ações antigas automaticamente.
Cenários de aceite: fila preservada e visível; nenhuma nova execução após bloqueio efetivo; reativação não dispara pendências antigas; ações em curso mantêm estado honesto até reconciliação. Autoridade, revisão em lote e comportamento de novas solicitações durante suspensão ainda pendentes.
Próxima função: acesso e permissões da equipe. Próxima decisão: configuração dos papéis. Recomendação a apresentar: perfis prontos para uso simples, com permissões adicionais específicas por função/operação e escopo de equipe quando necessário; ninguém obtém privilégios críticos só por assumir conversa. Não definir cargos como equivalentes a permissões sem validação.

### D72 — perfis e permissões da equipe
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: perfis prontos, com ajustes de permissões específicas quando necessário e limites por equipe.
Estado: definido; implementação e verificação pendentes.
Critério: oferecer perfis compreensíveis como ponto de partida e permitir configurar operações específicas dentro de escopos de equipe/empresa. Atender conversa não concede implicitamente poderes para configurar IA, aprovar exceção, liberar campanha ou confirmar pagamento. Aplicar autorização efetiva no servidor, não apenas ocultar controles na interface.
Exemplo: integrante pode responder clientes da sua equipe sem poder liberar campanhas ou registrar confirmação manual de pagamento; ajustes específicos podem ser concedidos por pessoa habilitada.
Cenários de aceite: perfil e ajustes são compreensíveis; operações sem permissão são recusadas; limites de equipe e isolamento por empresa respeitados. Nomes de perfis, matriz final, conflitos entre permissões e autoridade para conceder acesso ainda pendentes.
Próxima decisão: administração e delegação de permissões. Recomendação a apresentar: proprietário e administradores explicitamente autorizados gerenciam acesso, com delegação limitada ao escopo que podem administrar, sem autoelevação. Controles especiais para último proprietário e recuperação de acesso seguem separados.

### D73 — administração de permissões
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: proprietário e administradores autorizados podem conceder/ampliar permissões dentro do escopo permitido, sem elevar o próprio acesso.
Estado: definido; implementação e verificação pendentes.
Critério: gestão de acesso exige autoridade específica e respeita limites delegáveis de empresa/equipe/operação. Ninguém concede privilégios fora do seu poder de administração nem altera o próprio acesso para elevá-lo. Registrar autor, destinatário e mudanças; verificar autorização no servidor.
Exemplo: administrador autorizado ajusta acesso de integrante no escopo permitido, mas não concede a si mesmo confirmação de pagamento ou poderes de proprietário por editar seu perfil.
Cenários de aceite: autoelevação bloqueada; concessão fora do escopo recusada; alterações rastreáveis; acesso de outra empresa não administrável por consequência. Transferência de propriedade, último proprietário, recuperação e prevenção de elevação indireta ainda exigem especificação.
Próxima decisão: retirada de acesso de integrante com trabalho em andamento. Recomendação a apresentar: revogar acesso imediatamente e preservar histórico/autoria; conversas, oportunidades e tarefas vão para revisão/redistribuição visível sem depender dessa conclusão para bloquear acesso. Desativação não é exclusão de fatos históricos.

### D74 — retirada de acesso e responsabilidades pendentes
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: bloquear acesso imediatamente, preservar autoria/histórico e colocar pendências em revisão ou redistribuição visível.
Estado: definido; implementação e verificação pendentes.
Critério: revogação não espera conclusão da redistribuição. Sessões e autorizações vigentes deixam de permitir acesso à empresa conforme mecanismo a implementar; dados históricos mantêm autoria. Conversas, oportunidades e tarefas em aberto são identificadas para revisão/redistribuição, sem atribuição fictícia ou perda silenciosa. Não interpretar revogação como exclusão de mensagens ou fatos financeiros.
Exemplo: integrante desligado perde acesso; atendimentos sob sua condução ficam visíveis à equipe autorizada para continuidade, mantendo identificação das ações anteriores.
Cenários de aceite: credencial/sessão revogada não opera; histórico preservado; pendências localizáveis; redistribuição respeita escopo e D43–D45. Último proprietário, recursos pessoais e ações externas em curso exigem tratamento específico.
Próxima função: tela inicial e prioridades operacionais. Próxima decisão: conteúdo inicial por papel. Recomendação a apresentar: visão por responsabilidade, com trabalho pendente e bloqueios acionáveis, detalhes e indicadores conforme permissão; não exigir que atendente navegue por todos os módulos para descobrir o próximo passo.

### D75 — tela inicial orientada ao papel
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: mostrar o que exige ação conforme o papel — atendimentos/tarefas para equipe; pendências, aprovações e indicadores para gestores.
Estado: definido; implementação e verificação pendentes.
Critério: visão inicial prioriza trabalho acionável dentro das permissões e responsabilidades reais. Pessoa com múltiplas funções pode acessar as visões pertinentes sem receber privilégios adicionais por visualizar um painel. Pendência deve levar ao contexto e à ação correspondente, distinguindo problema, responsável e estado real.
Exemplo: atendente encontra conversas aguardando sua equipe e tarefas; gestor encontra aprovações e bloqueios operacionais, com acesso aos detalhes permitidos.
Cenários de aceite: pendências relevantes acessíveis sem percorrer todos os módulos; itens fora do escopo não expostos; indicadores sem dados não simulam sucesso; ação abre contexto correto. Layout, composição e preferência individual ainda pendentes.
Próxima decisão: prioridade das pendências. Recomendação a apresentar: regras explícitas por prazo, tempo de espera e tipo de bloqueio, com motivo visível; IA pode sugerir sem reordenar arbitrariamente por urgência inferida. Pesos e regras concretas ainda não definidos.

### D76 — prioridade das pendências na tela inicial
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: ordenar por regras claras de prazo, espera e tipo de bloqueio, exibindo motivo da prioridade; IA pode sugerir ajustes.
Estado: definido; implementação e verificação pendentes.
Critério: ordenação tem fundamento verificável e compreensível; prioridade mostra os fatores aplicados. Sugestão da IA não modifica silenciosamente regra vigente nem transforma urgência inferida em fato. Escopo de acesso continua conforme D72–D75.
Exemplo: pedido pago com entrega bloqueada aparece com esse motivo; atendimento com espera prolongada mostra tempo e regra aplicável. Pesos e precedência entre esses casos ainda não foram definidos.
Cenários de aceite: prioridade explicável; mesma regra produz tratamento consistente; informações ausentes não geram urgência fictícia; sugestões são distinguíveis das regras ativas. Critérios concretos, horários úteis e ajustes manuais ainda pendentes.
Próxima decisão: notificações internas. Recomendação a apresentar: central única de pendências com alertas por responsabilidade e urgência, agrupando repetições; canais adicionais configuráveis para casos importantes. Não notificar toda equipe a cada evento nem expor dados a pessoas sem acesso.

### D77 — central e notificações de pendências
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: central no CHAT-SALES, alertas por responsabilidade e urgência, agrupando repetições; canais adicionais configuráveis para casos importantes.
Estado: definido; implementação e verificação pendentes.
Critério: central mantém pendências consultáveis e leva ao contexto/ação. Alertas respeitam responsabilidade e acesso; repetição do mesmo problema não cria tempestade de notificações. Canais adicionais exigem configuração e destinatários autorizados, sem expor detalhes sensíveis indevidamente. Ler ou receber alerta não resolve a pendência por si só.
Exemplo: gestor recebe aprovação sob sua responsabilidade; repetidas tentativas da mesma integração aparecem agrupadas no problema correspondente, sem avisar toda a empresa a cada tentativa.
Cenários de aceite: notificações alcançam destinatários corretos; agrupamento preserva evidências; leitura distingue-se de resolução; canais extras não são ativados implicitamente. Canais suportados, preferências, horários, urgências e garantias de entrega ainda pendentes.
Próxima decisão: pendência não tratada no prazo. Recomendação a apresentar: escalonamento configurado por tipo de pendência/equipe, avisando próximo responsável ou gestor e preservando histórico; escalonar não transfere automaticamente propriedade nem resolve o caso. Prazos e destinatários concretos ainda não definidos.

### D78 — escalonamento de pendência fora do prazo
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: avisar próximo responsável ou gestor conforme regra da equipe e do tipo de pendência, mantendo histórico.
Estado: definido; implementação e verificação pendentes.
Critério: pendência elegível ultrapassando prazo aciona escalonamento configurado, com destinatário autorizado e registro. Aviso não transfere automaticamente responsabilidade, não conclui ação e não resolve pendência. Evitar repetições desnecessárias conforme D77. Sem destinatário válido, manter falha de escalonamento visível para administração autorizada.
Exemplo: aprovação comercial vencida gera aviso ao gestor definido, preservando quem recebeu originalmente e quando o prazo foi ultrapassado.
Cenários de aceite: regra/prazo rastreáveis; destinatário com acesso correto; histórico preservado; alerta não simula resolução. Níveis, intervalos, calendário e mecanismo de substituição de destinatário ainda pendentes.
Próxima decisão: critérios de resolução das pendências. Recomendação a apresentar: fechamento automático para resultado comprovado e fechamento humano com registro nas tarefas de avaliação; leitura de alerta não resolve. Ação crítica não pode ser substituída por botão genérico de concluir.

### D79 — resolução de pendências
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: regra por tipo; resultado comprovado nas ações e conclusão humana com registro nas tarefas de avaliação.
Estado: definido; implementação e verificação pendentes.
Critério: ação operacional/financeira só resolve pendência quando o resultado exigido for comprovado. Tarefa de avaliação exige decisão registrada por pessoa autorizada. Leitura do alerta ou clique genérico não substitui resultado externo nem confirma pagamento/entrega. Registrar origem e momento da resolução e autoria quando humana.
Exemplo: entrega bloqueada permanece pendente até evidência de resolução; avaliação de oportunidade termina com decisão registrada, que não equivale a uma venda ou entrega.
Cenários de aceite: evidência necessária não pode ser ignorada por conclusão genérica; tarefa humana exige registro; histórico preservado; evento repetido não resolve outro caso. Cancelamento de ação, descarte de falso alerta e reabertura de problema precisam de regras próprias.
Próxima função: visão gerencial consolidada. Próxima decisão: indicadores principais. Recomendação a apresentar: resultados comerciais comprovados e gargalos acionáveis, com acesso ao detalhe e ausência de dado sinalizada; atividade operacional como contexto, não substituto de resultado. Receita recebida, venda ganha e entrega concluída permanecem separadas.

### D80 — prioridade do painel gerencial
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: resultados comprovados e gargalos — qualificados, ganhos, valores recebidos, conversões por etapa e pendências; atividade como contexto.
Estado: definido; implementação e verificação pendentes.
Critério: painel distingue resultado comercial, fato financeiro, entrega e atividade operacional. Cada indicador usa definição e fonte compatíveis com decisões anteriores; dado ausente é identificado, sem ser convertido em zero ou sucesso. Gargalos devem permitir localizar os casos que exigem ação, respeitando acesso.
Exemplo: oportunidades ganhas e valores efetivamente recebidos aparecem separados. Volume de mensagens não é apresentado como vendas nem como prova isolada de eficiência da IA.
Cenários de aceite: métricas distintas e compreensíveis; definições consistentes com processos; ausência de dado sinalizada; consolidação não duplica vendas de campanhas/assistências. Períodos, denominadores de conversão, moedas e comparabilidade entre funis ainda pendentes.
Próxima decisão: rastreabilidade dos indicadores. Recomendação a apresentar: clicar abre registros considerados, filtros/período e definição do cálculo; detalhamento limitado às permissões. Informação agregada não autoriza expor conversa ou dados financeiros fora do escopo.

### D81 — rastreabilidade dos indicadores
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: ao clicar, mostrar registros que compõem o número, período, filtros e definição do cálculo, respeitando permissões.
Estado: definido; implementação e verificação pendentes.
Critério: indicador permite inspecionar composição e regra de cálculo; detalhe deve corresponder ao mesmo recorte e estado dos dados apresentado, indicando atualização quando houver diferença temporal. Acesso agregado não concede acesso a registros individuais fora do escopo. Ausência de permissão deve ser explicitada sem expor dados restritos.
Exemplo: total recebido abre recebimentos considerados e seu período; vendas ganhas abrem oportunidades com critério de ganho correspondente, sem misturar propostas ou comprovantes não confirmados.
Cenários de aceite: composição reproduzível no recorte; filtros/definição visíveis; atualização dos dados identificável; valores e registros sensíveis protegidos. Exportação, consistência temporal e permissões de métricas agregadas ainda pendentes.
Próxima decisão: interpretação gerencial por IA. Recomendação a apresentar: apontar fatos, hipóteses e sugestões com vínculo às evidências; ações derivadas exigem confirmação/autorização aplicável. Não converter correlação em causa nem alterar campanha/preço/regra automaticamente por análise do painel.

### D82 — interpretação gerencial pela IA
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: explicar fatos, separar hipóteses e sugerir ações com evidências; mudanças dependem das aprovações aplicáveis.
Estado: definido; implementação e verificação pendentes.
Critério: análise identifica recorte e evidências de D80–D81, distingue observação de hipótese e informa limites relevantes dos dados. Sugestão não altera regras, preços, campanhas ou permissões automaticamente. Ações propostas seguem autorização e validação da função correspondente; aprovação de análise não concede permissão para executar outras operações.
Exemplo: aumento de pedidos bloqueados é fato sustentado pelo painel; causa provável é hipótese a investigar. IA pode propor revisar integração, sem afirmar causalidade sem evidência nem reativar fila por conta própria.
Cenários de aceite: evidência consultável; dado ausente não vira conclusão; hipóteses identificadas; nenhuma alteração por mera geração de recomendação; escopo de dados autorizado respeitado.
Próxima função: histórico de ações e alterações. Próxima decisão: apresentação da auditoria. Recomendação a apresentar: linha do tempo contextual por conversa/oportunidade/configuração, com autor humano, IA ou integração, alteração e motivo/evidência quando aplicável; visão central para pessoas autorizadas. Não expor segredos nem conteúdo restrito no histórico.

### D83 — histórico contextual e auditoria central
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: linha do tempo no próprio contexto, com autor, mudança e motivo disponível; visão central para pessoas autorizadas.
Estado: definido; implementação e verificação pendentes.
Critério: ações relevantes em conversa, oportunidade e configuração mantêm histórico contextual acessível no escopo permitido. Distinguir autoria humana, execução por IA e integração, incluindo origem e momento; motivo/evidência quando disponível e exigido pela operação. Visão central respeita permissões e não expõe segredos ou registros de outra empresa.
Exemplo: mudança de etapa mostra transição e origem; ação da IA identifica que foi automática e qual regra/evidência a sustentou quando aplicável, sem expor credenciais.
Cenários de aceite: histórico local e central consistentes; autor identificado corretamente; ausência de motivo não é preenchida com justificativa inventada; registros restritos protegidos. Eventos abrangidos, retenção, imutabilidade e exportação ainda pendentes.
Próxima decisão: correção de alteração indevida. Recomendação a apresentar: reversão autorizada quando tecnicamente possível e sem efeito externo irreversível, registrada como nova ação; demais casos orientam correção específica, sem apagar evento anterior ou anunciar desfazimento inexistente. Não confundir reversão de status com cancelamento de pagamento/envio/entrega.

### D84 — reversão e correção de alterações
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: oferecer reversão autorizada quando possível, registrando nova ação; efeitos externos exigem correção específica, sem apagar histórico.
Estado: definido; implementação e verificação pendentes.
Critério: reversão verifica permissão, estado atual e dependências antes de executar. Não restaurar cegamente estado antigo sobre alterações posteriores. Correção cria novo registro vinculado ao evento original, preservando autoria e motivo. Efeitos externos não são declarados desfeitos por alteração local de status; usar fluxo específico com resultado verificável.
Exemplo: mudança indevida de etapa pode admitir reversão validada; envio de mensagem ou pagamento não é apagado nem cancelado apenas por restaurar estado anterior.
Cenários de aceite: acesso indevido bloqueado; histórico anterior preservado; dependências/conflitos impedem reversão insegura; resultado da correção corresponde ao ocorrido. Catálogo de ações reversíveis, validações e compensações ainda pendentes.
Próxima função: busca e localização de registros. Próxima decisão: acesso global versus busca por módulo. Recomendação a apresentar: busca única com resultados agrupados por contato, conversa, oportunidade e outros tipos pertinentes, filtros e acesso ao contexto; respeitar escopo de autorização antes de retornar resultados e trechos.

### D85 — busca única da operação
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: busca única, resultados agrupados por tipo, filtros e acesso direto ao contexto, respeitando permissões.
Estado: definido; implementação e verificação pendentes.
Critério: permitir localizar registros pertinentes em ponto único, distinguindo tipos e oferecendo filtros. Aplicar escopo de autorização antes de retornar registros, contagens e trechos sensíveis. Abrir resultado no contexto correto; homônimos e negociações distintas permanecem distinguíveis. Busca não altera registros por si só.
Exemplo: procurar cliente retorna contatos, conversas e oportunidades acessíveis em grupos identificados, sem expor conversas restritas de outra equipe ou empresa.
Cenários de aceite: filtros e agrupamentos compreensíveis; acesso direto correto; nenhuma informação restrita em prévia; ausência de resultado não é preenchida com conteúdo inventado. Indexação, atualização, campos pesquisáveis e limites de desempenho ainda pendentes.
Próxima decisão: busca em linguagem natural. Recomendação a apresentar: opcional no mesmo ponto de busca, convertendo pedido em filtros visíveis e resultados verificáveis; manter pesquisa direta disponível. Interpretação ambígua exige esclarecimento antes de restringir incorretamente ou concluir ausência de resultados. Busca não autoriza execução de ações.

### D86 — busca opcional em linguagem natural
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: aceitar opcionalmente linguagem natural, mostrando filtros interpretados para conferir/ajustar; manter busca direta disponível.
Estado: definido; implementação e verificação pendentes.
Critério: interpretação produz consulta com filtros visíveis e editáveis, respeitando D85 e permissões. Ambiguidade relevante exige esclarecimento; termos como equipe e semana precisam de escopo/período explícitos no resultado. Não inventar registros ou executar mudanças ao interpretar pedido de busca. Pesquisa direta funciona sem depender da interpretação por IA.
Exemplo: pedido de propostas vencidas da equipe nesta semana mostra equipe, intervalo e critério de vencimento aplicados; usuário pode corrigir o recorte antes de usar resultados.
Cenários de aceite: filtros conferíveis; resultados correspondem ao recorte; limites de acesso preservados; falha da IA permite pesquisa direta. Semântica temporal, escopo dos campos e suporte a consultas complexas ainda pendentes.
Próxima função: campos personalizados de contatos e negociações. Próxima decisão: adaptação dos dados ao negócio. Recomendação a apresentar: campos padrão simples e campos adicionais tipados por empresa, com obrigatoriedade somente na etapa/ação pertinente; evitar exigir cadastro completo para responder. Permissões e uso de dados sensíveis precisam de especificação própria.

### D87 — campos personalizados do negócio
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: campos padrão simples mais campos personalizados por empresa, exigidos apenas na etapa/ação que precisar deles.
Estado: definido; implementação e verificação pendentes.
Critério: manter base simples e permitir dados adicionais tipados e vinculados ao contexto adequado, contato ou negociação. Obrigatoriedade tem escopo explícito de etapa/ação; não bloquear todo atendimento por cadastro incompleto. Validar tipo/formato sem inventar valor para preencher requisito. Dados de uma negociação não devem sobrescrever outra por pertencerem ao mesmo contato.
Exemplo: data de evento pode ser necessária para proposta de evento, sem impedir resposta inicial sobre serviços nem substituir data de outra negociação.
Cenários de aceite: campos isolados por empresa; requisito contextual; tipo validado; ação dependente aguarda dado válido; ajuda independente continua. Catálogo de tipos, edição de estrutura, permissões e tratamento de dados sensíveis ainda pendentes.
Próxima decisão: preenchimento pela IA a partir da conversa. Recomendação a apresentar: informação explícita e inequívoca pode preencher campos habilitados com origem rastreável; ambiguidades viram sugestão para confirmação; dados já confirmados não são sobrescritos silenciosamente. Política específica de campos críticos permanece necessária.

### D88 — preenchimento de campos pela conversa
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: preencher campos habilitados quando informação for explícita e sem dúvida, mostrando origem; ambiguidades e conflitos exigem confirmação.
Estado: definido; implementação e verificação pendentes.
Critério: campo precisa estar habilitado para preenchimento pela IA no contexto adequado. Salvar somente informação explícita, inequívoca e válida para seu tipo, com vínculo à fonte; não converter inferência em fato confirmado. Ambiguidade ou conflito com dado existente exige confirmação antes de substituir. Informação sem ano, unidade ou escopo necessário não é completada por suposição.
Exemplo: data de evento é preenchida se dia, mês, ano e negociação estiverem claros no contexto; caso contrário, pedir confirmação pertinente. Correção explícita do cliente pode ser proposta sem apagar origem anterior.
Cenários de aceite: origem consultável; campos não habilitados não alterados; formatos válidos; conflitos não sobrescritos silenciosamente; negociações distintas preservadas. Campos críticos/sensíveis, correções e confirmação ainda precisam de política específica.
Próxima função: resumos internos e anotações. Próxima decisão: papel do resumo automático. Recomendação a apresentar: resumo identificado como gerado por IA, com fatos, pendências e próximo passo apoiados no histórico; equipe pode corrigir sem apagar notas manuais. Resumo não substitui evidência nem concede permissão para executar ação.

### D89 — resumo interno da conversa
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: resumo interno identificado como gerado por IA, com fatos, pendências e próximo passo, ligado ao histórico e separado das notas manuais.
Estado: definido; implementação e verificação pendentes.
Critério: resumo indica autoria automatizada e informações de origem no histórico permitido. Distinguir fato de pendência ou sugestão; próximo passo sugerido não executa ação nem substitui regra aprovada. Manter notas manuais independentes e preservadas. Resumo não é prova de pagamento, transferência ou entrega.
Exemplo: resumo apresenta necessidade confirmada, informação ainda ausente e próximo passo proposto; equipe pode conferir mensagens correspondentes sem confundir sugestão com compromisso assumido.
Cenários de aceite: identificação de IA visível; fatos apoiados no histórico; notas manuais preservadas; acesso restrito ao contexto autorizado. Correção, atualização, indicação de desatualização e custos ainda pendentes.
Próxima decisão: momentos de atualização do resumo. Recomendação a apresentar: marcos relevantes, como transferência ou decisão comercial, e atualização sob demanda; mostrar até quando foi considerado o histórico. Evitar regenerar após cada mensagem automaticamente. Marcos concretos e orçamento ainda não definidos.

### D90 — atualização do resumo interno
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: atualizar em momentos importantes, como transferência e decisão comercial, e quando solicitado; mostrar até onde o histórico foi considerado.
Estado: definido; implementação e verificação pendentes.
Critério: atualização por marcos definidos ou solicitação autorizada, sem regeneração obrigatória após cada mensagem. Registrar limite do histórico considerado e sinalizar quando houver conteúdo posterior. Falha de atualização não apresenta resumo antigo como atual nem apaga notas manuais.
Exemplo: transferência gera atualização com corte identificável; mensagem posterior aparece como conteúdo ainda não incluído até próxima atualização. Solicitação manual permite renovar o resumo no contexto permitido.
Cenários de aceite: marco dispara atualização conforme regra; corte visível; mensagens posteriores identificáveis; falha preserva estado honesto; notas manuais mantidas. Lista final de marcos, limite de frequência e tratamento de edições do histórico ainda pendentes.
Próxima função: assistência ao atendente com sugestões de resposta. Próxima decisão: modo de apresentar sugestões no atendimento humano. Recomendação a apresentar: rascunho contextual revisável, gerado sob demanda ou sugerido sem envio, com fontes/pendências quando relevantes; envio requer ação humana. Geração de texto não executa ações comerciais por consequência.

### D91 — rascunho de resposta para atendimento humano
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: preparar rascunho contextual que o atendente pode editar e enviar; nunca enviar por ele sem ação explícita.
Estado: definido; implementação e verificação pendentes.
Critério: sugestão permanece identificada como rascunho e depende de revisão/envio humano. Atendente pode editar ou descartar. Texto não executa ações comerciais, não confirma fatos sem evidência nem transfere controle da conversa à IA. Acesso ao contexto respeita permissões.
Exemplo: IA sugere explicação com preço válido; atendente ajusta linguagem e decide enviar. Menção a desconto ou agendamento no texto não autoriza ação correspondente.
Cenários de aceite: nenhum envio automático; edição preservada; descarte não altera histórico como se mensagem tivesse sido enviada; regras/fontes atuais respeitadas. Geração automática ou sob demanda, atualização diante de novas mensagens e controles de edição ainda pendentes.
Próxima decisão: nova mensagem recebida durante revisão do rascunho. Recomendação a apresentar: preservar edição e sinalizar contexto novo, oferecendo atualização sem substituir o texto silenciosamente. Condições objetivas críticas devem ser revalidadas no envio conforme ação; alerta não comprova revisão humana.

### D92 — contexto novo durante edição de rascunho
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: preservar texto editado, avisar que há contexto novo e oferecer atualização sem substituição silenciosa.
Estado: definido; implementação e verificação pendentes.
Critério: mensagem recebida após o contexto usado para gerar sugestão sinaliza desatualização, mantendo edição humana. Atualização é opcional e não sobrescreve silenciosamente o rascunho. Aviso não significa que o atendente já revisou contexto novo; envio permanece ação humana de D91.
Exemplo: cliente muda quantidade enquanto atendente edita resposta; texto permanece disponível e aviso aponta nova mensagem, permitindo revisar antes de enviar. Preço/estoque e ações dependentes continuam sujeitos às regras correspondentes.
Cenários de aceite: edição preservada; novo contexto sinalizado; atualização sem alteração silenciosa; nenhuma mensagem enviada por causa da atualização. Tratamento de comparação entre versões e edição simultânea ainda pendente.
Próxima decisão: apresentar nova sugestão ao solicitar atualização. Recomendação a apresentar: mostrar alternativa junto ao rascunho atual, permitindo substituir ou aproveitar trechos e manter caminho de retorno; não fundir texto automaticamente como se preservação de sentido estivesse garantida.

### D93 — atualização da sugestão sem perda de edição
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: mostrar nova sugestão junto do rascunho atual; atendente escolhe substituir ou aproveitar trechos, preservando versão anterior.
Estado: definido; implementação e verificação pendentes.
Critério: solicitação de atualização não substitui edição humana automaticamente. Apresentar alternativas identificáveis, permitir escolha/aproveitamento explícito e conservar caminho para recuperar rascunho anterior durante a edição. Nenhuma escolha de rascunho equivale a envio ou execução de ação comercial.
Exemplo: cliente acrescenta informação; nova sugestão incorpora o contexto, enquanto texto editado continua disponível para comparação e aproveitamento.
Cenários de aceite: versão anterior recuperável; escolha explícita; trechos não mesclados silenciosamente; envio depende de D91. Retenção dos rascunhos e edição simultânea ainda precisam de detalhamento.
Próxima função: mensagens de áudio no atendimento. Próxima decisão: como usar transcrição para atender. Recomendação a apresentar: transcrever, identificar origem e manter áudio acessível à equipe; IA pode responder dentro do modo/permissões vigentes quando entender, pedindo esclarecimento em trechos relevantes incertos. Transcrição não comprova pagamento nem autoriza ação fora dos limites já definidos. Suporte atual e integração de transcrição ainda não verificados nesta etapa.

### D94 — áudio recebido no atendimento
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: transcrever e manter áudio acessível; IA pode responder no modo autorizado, pedindo esclarecimento quando houver dúvida relevante.
Estado: definido; implementação e verificação pendentes.
Critério: transcrição identificada como derivada do áudio, com acesso ao original no contexto permitido. Resposta respeita modo de teste, assistência ou automático e controle humano da conversa; receber áudio não reativa IA em fila humana. Incerteza que afete entendimento ou ação exige esclarecimento, sem inventar trechos. Falha de transcrição não é apresentada como mensagem vazia ou conteúdo compreendido.
Exemplo: áudio com variação de produto pouco clara não autoriza cobrar item inferido; confirmar o detalhe necessário. No modo assistência, resposta permanece rascunho de D91.
Cenários de aceite: original acessível; transcrição distinguida da fonte; limites de atuação mantidos; erro/trecho incerto tem tratamento observável; pagamento não confirmado por interpretação do áudio. Formatos, tamanho, idioma, retenção e custo ainda pendentes.
Próxima função: imagens e documentos recebidos. Próxima decisão: extração de informações para apoiar atendimento. Recomendação a apresentar: analisar formatos suportados quando pertinente, preservar origem e pedir confirmação de dado crítico/ambíguo; arquivo não vira instrução de sistema nem confirmação de pagamento. Capacidades atuais e formatos ainda exigem inspeção.

### D95 — imagens e documentos recebidos
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: analisar arquivos suportados para ajudar no pedido, mostrando origem e confirmando dados críticos ou duvidosos.
Estado: definido; implementação e verificação pendentes.
Critério: análise é vinculada ao arquivo e contexto autorizado, distinguindo extração de informação de fato verificado. Dados críticos ou ambíguos exigem confirmação apropriada antes da ação dependente. Conteúdo do arquivo é material do cliente, não instrução para alterar regras/permissões da IA. Análise não confirma pagamento, identidade ou disponibilidade sem evidência exigida nas respectivas regras.
Exemplo: foto pode sugerir produto para confirmação, sem cobrar variação presumida; orçamento em PDF pode apoiar esclarecimento sem substituir automaticamente preço aprovado do catálogo. Comprovante segue D28.
Cenários de aceite: origem acessível; dado duvidoso não inventado; arquivo não contorna limites; ações seguem modo autorizado e controle humano da conversa. Formatos, limites, retenção, segurança de arquivos e custos ainda pendentes.
Próxima decisão: arquivo ilegível, não suportado ou análise falha. Recomendação a apresentar: explicar limite e solicitar alternativa útil quando possível; se indispensável e continuar sem leitura, encaminhar à equipe, preservando arquivo recebido. Não alegar que documento foi compreendido nem bloquear ajuda independente dele.

### D96 — falha de leitura de imagem/documento
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: explicar limite e pedir alternativa útil, como foto melhor ou texto; se continuar indispensável, encaminhar à equipe.
Estado: definido; implementação e verificação pendentes.
Critério: não afirmar compreensão de arquivo ilegível/não suportado. Solicitar alternativa que possa resolver a dificuldade, sem repetição inútil. Preservar arquivo original para equipe autorizada; continuar ajuda independente do conteúdo não compreendido. Se informação necessária permanecer indisponível, executar encaminhamento conforme D06–D09.
Exemplo: imagem desfocada impede identificar produto; solicitar foto melhor ou código em texto. Se identificação seguir incerta, não gerar cobrança de item presumido e encaminhar.
Cenários de aceite: limite comunicado; alternativa pertinente; nenhuma informação inventada; arquivo preservado; transferência verificável quando necessária. Limites de tentativas e exposição de arquivos ao suporte ainda pendentes.
Próxima função: manutenção da base de conhecimento. Próxima decisão: atualização de materiais externos já importados. Recomendação a apresentar: detectar alterações e propor revisão das diferenças antes de publicar; manter conhecimento aprovado até resolução, sinalizando informação vencida quando houver validade explícita. Não substituir automaticamente regras por conteúdo novo de site/documento; catálogo operacional continua conforme D19.

### D97 — atualização das fontes da base de conhecimento
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: identificar diferenças e propor revisão antes de publicar; manter versão aprovada, sinalizando informações com validade vencida.
Estado: definido; implementação e verificação pendentes.
Critério: mudança detectada em fonte configurada gera proposta de atualização com diferenças e origem, sem alterar conhecimento ativo silenciosamente. Informação aprovada preserva histórico; validade explícita vencida é sinalizada, sem sugerir que aprovação antiga comprova atualidade. Publicação segue revisão/testes aplicáveis de D02–D05 e conflitos seguem D18. Dados operacionais de catálogo continuam em D19.
Exemplo: política de atendimento mudou no documento; responsável vê diferenças e revisa antes de publicar. Condição promocional com validade encerrada aparece como vencida, mesmo enquanto atualização aguarda revisão.
Cenários de aceite: diferenças conferíveis; mudança externa não publica sozinha; validade vencida visível; rastreabilidade de versões mantida. Fontes monitoráveis, frequência, custos e política de resposta com informação vencida ainda pendentes.
Próxima decisão: resposta dependente de informação com validade vencida. Recomendação a apresentar: não oferecer como vigente; buscar outra fonte aprovada e válida ou encaminhar para confirmação humana quando necessário, mantendo ajuda independente. Não confundir informação histórica com condição atual.

### D98 — resposta dependente de condição vencida
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: não oferecer condição vencida como vigente; consultar outra fonte aprovada e válida ou encaminhar para confirmação humana.
Estado: definido; implementação e verificação pendentes.
Critério: validade explícita encerrada impede uso como condição atual, mesmo em versão anteriormente aprovada. Outra fonte só resolve se aprovada, válida e aplicável; informação conflitante não é escolhida por conveniência. Sem fonte suficiente, seguir D06–D09, preservando ajuda independente. Preservação de proposta válida segue D20 e não é anulada por vencimento de conteúdo promocional genérico.
Exemplo: promoção expirada não é reapresentada como oferta disponível. IA consulta condição atual confirmada ou encaminha, sem prometer renovação da promoção.
Cenários de aceite: condição expirada não aplicada; fonte alternativa legítima rastreável; falta de fonte resulta em encaminhamento; atendimento inteiro não é pausado sem necessidade.
Próxima função: avaliação contínua e correção de respostas da IA. Próxima decisão: como equipe reporta erro observado. Recomendação a apresentar: sinalizar no próprio atendimento, com categoria/motivo e trecho relevante; gerar caso de revisão e sugerir cenário de teste, sem alterar regras ativas automaticamente. Ação imediata de contenção depende da gravidade e permissão, a definir.

### D99 — sinalização e revisão de resposta problemática
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: sinalizar na própria conversa, indicar problema e abrir revisão com sugestão de teste para evitar repetição; sem mudar regras ativas automaticamente.
Estado: definido; implementação e verificação pendentes.
Critério: registrar contexto, trecho pertinente e motivo/categoria informados, respeitando acesso. Caso de revisão mantém vínculo ao atendimento e pode propor teste com comportamento esperado ainda a validar. Correção humana de resposta ou avaliação negativa não gera aprendizado/publicação automática. Ajuste de configuração segue D05 e validação aplicável.
Exemplo: equipe sinaliza prazo incorreto, abre revisão da fonte/regra e sugere teste que exija prazo confirmado. Versão ativa não é alterada apenas pelo reporte.
Cenários de aceite: reporte rastreável; revisão acessível a responsáveis; sugestão não se apresenta como teste aprovado; dados sensíveis protegidos; nenhuma mudança automática de regras. Classificação de gravidade, triagem, prazo e contenção imediata ainda pendentes.
Próxima decisão: contenção de erro relevante enquanto correção aguarda publicação. Recomendação a apresentar: pessoa autorizada pode suspender imediatamente capacidade afetada ou atendimento automático conforme alcance, sem esperar nova versão; preservar histórico e pendências para equipe. Retomada exige validação/liberação e não reativa fila antiga automaticamente. Contenção difere de edição normal de D05.

### D100 — contenção imediata de problema da IA
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: pessoa autorizada pode suspender imediatamente função afetada ou todo atendimento automático, conforme alcance, encaminhando pendências à equipe.
Estado: definido; implementação e verificação pendentes.
Critério: contenção autorizada tem efeito sobre novas execuções da capacidade/atendimento suspenso, sem aguardar publicação do rascunho. Preservar motivo, autor, momento, histórico e pendências; encaminhar à equipe o trabalho impedido. Funções independentes podem continuar se não estiverem abrangidas. Efeitos já iniciados exigem conferência e não são declarados desfeitos por suspensão.
Exemplo: erro em condição comercial leva a suspender a capacidade relacionada; problema de alcance geral permite interromper atendimento automático e encaminhar à equipe. Edição normal continua em D05; esta é contenção imediata, não ampliação de permissão.
Cenários de aceite: pessoa sem permissão não altera suspensão; novas ações abrangidas bloqueadas; pendências visíveis; histórico preservado; atendimento humano pode continuar conforme acesso. Limites por capacidade, propagação do bloqueio e corrida com execução em andamento exigem implementação/testes.
Próxima decisão: retomada após contenção. Recomendação a apresentar: corrigir causa, passar pelo cenário que reproduziu o erro e testes essenciais afetados, obter liberação explícita; pendências antigas exigem revisão antes da retomada, sem mensagens/ações atrasadas automáticas.

### D101 — retomada após contenção de erro
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: corrigir causa, aprovar teste do erro e cenários essenciais afetados e obter liberação explícita; revisar pendências antigas separadamente.
Estado: definido; implementação e verificação pendentes.
Critério: conter problema não equivale a corrigi-lo. Retomada exige evidência da correção no cenário que reproduziu o erro e nos cenários essenciais afetados, vinculada à versão/configuração efetivamente liberada. Pessoa autorizada libera explicitamente. Reativação não executa fila antiga automaticamente; pendências exigem revisão de validade, contexto e risco de duplicidade.
Exemplo: capacidade de cobrança suspensa por regra indevida só retorna após correção e validação aplicável. Cobranças ou mensagens antigas pendentes não são disparadas simplesmente pela liberação.
Cenários de aceite: teste reprovado impede retomada; aprovação de outra versão não libera alteração não testada; liberação rastreável; pendências preservadas para revisão. Definição de testes afetados, autoridade e revisão em lote ainda pendentes.
Próxima função: acompanhamento e controle de consumo da IA. Próxima decisão: visibilidade e limites. Recomendação a apresentar: consumo por empresa e função, alertas e limite configurável com comportamento explícito ao atingir; separar custo medido de estimativa e não prometer custo financeiro sem fonte. Política de bloqueio e continuidade humana será definida em seguida.

### D102 — visibilidade e controle de consumo da IA
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: mostrar consumo por função, separar custo medido de estimativa e permitir alertas e limite configurável.
Estado: definido; implementação e verificação pendentes.
Critério: atribuir uso às funções pertinentes e ao contexto da empresa, identificando fonte e período. Distinguir uso medido, custo comprovado e estimativa; dado indisponível não vira zero. Responsáveis autorizados podem configurar alertas e limite. Exibir escopo e unidade do limite sem prometer teto financeiro exato quando a medição/cobrança externa não o permitir.
Exemplo: atendimento, transcrição e resumos aparecem separadamente; estimativa de custo de uma função não se apresenta como valor efetivamente faturado pelo provedor.
Cenários de aceite: composição consultável; funções não contadas em duplicidade; alertas não repetitivos; alteração de limite exige permissão; custo sem fonte identificado. Provedores, moedas, janela de apuração, concorrência, atraso de medição e comportamento no limite ainda pendentes.
Próxima decisão: atingir limite configurado. Recomendação a apresentar: suspender novas operações de IA abrangidas, avisar responsáveis e encaminhar atendimentos para equipe, preservando mensagens e acesso manual; aumento autorizado pode permitir retomada, sem liberar fila antiga automaticamente. Não trocar provedor, reduzir qualidade ou exceder orçamento por decisão implícita.

### D103 — limite de consumo atingido
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: suspender novas operações de IA abrangidas, avisar responsáveis e encaminhar atendimentos à equipe, mantendo mensagens e trabalho manual.
Estado: definido; implementação e verificação pendentes.
Critério: limite bloqueia início de novas operações dentro de seu escopo, sem apagar mensagens, histórico ou acesso manual. Responsáveis recebem aviso e atendimentos impedidos tornam-se pendências humanas conforme regras anteriores. Operações já iniciadas mantêm resultado/custo registrado; não prometer cancelamento retroativo ou teto exato além das garantias de medição de D102.
Exemplo: consumo de atendimento chega ao limite; novas respostas automáticas não são geradas e equipe encontra conversas para continuar. Sistema não muda de provedor nem excede orçamento automaticamente.
Cenários de aceite: bloqueio efetivo no escopo; entrada de mensagens preservada; continuidade manual disponível; aviso e encaminhamento observáveis. Renovação de período, aumento autorizado e retomada das pendências ainda exigem regra explícita; não presumir disparo automático de fila antiga.
Próxima decisão: escolha de provedor/modelo de IA. Recomendação a apresentar: opção simples recomendada por função e ajustes avançados para pessoa autorizada, com estimativa quando disponível e teste antes de publicar mudança. Não presumir equivalência de qualidade/contrato entre modelos nem seleção atual comprovada.

### D104 — escolha de provedor e modelo de IA
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: opção recomendada por função, com ajustes avançados para pessoas autorizadas; mudanças passam por teste antes de publicar.
Estado: definido; implementação e verificação pendentes.
Critério: configuração simples apresenta recomendação compreensível para a função, sem exigir conhecimento técnico inicial. Ajustes avançados respeitam permissão, capacidades necessárias e limites de consumo. Alterar provedor/modelo segue rascunho e validação antes da liberação; não presumir equivalência de comportamento entre opções. Credenciais não são expostas nas prévias ou ao modelo.
Exemplo: responsável autorizado testa outro modelo para atendimento; versão atual segue até validar e publicar mudança. Escolha não libera capacidades adicionais por consequência.
Cenários de aceite: recomendação não oculta configuração ativa; alteração sem permissão bloqueada; requisitos da função conferidos; mudança não publicada sem testes. Critérios técnicos/comerciais da recomendação, catálogo e compatibilidade ainda pendentes.
Próxima decisão: indisponibilidade do provedor ativo. Recomendação a apresentar: alternativa automática somente se previamente configurada, testada e autorizada para a função, com limites e regras preservados; caso contrário encaminhar à equipe. Resultado incerto de ação anterior exige conferência antes de nova execução, sem duplicação por troca de modelo.

### D105 — indisponibilidade do provedor de IA
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: usar alternativa somente se já configurada, testada e autorizada para a função; caso contrário, encaminhar à equipe.
Estado: definido; implementação e verificação pendentes.
Critério: alternativa precisa atender requisitos da função, preservar regras/permissões e limites de consumo. Indisponibilidade não autoriza selecionar provedor improvisado nem ampliar acesso a dados. Ausência de alternativa válida gera continuidade humana com mensagens preservadas. Resultado incerto de ação anterior exige reconciliação antes de repetir; troca de modelo não justifica duplicação de ação externa.
Exemplo: atendimento pode usar opção de contingência previamente validada; sem opção elegível, conversa vai à equipe. Retorno do provedor não reativa automaticamente conversa já encaminhada ao humano, conforme D09.
Cenários de aceite: alternativa não autorizada bloqueada; escopo e orçamento preservados; encaminhamento observável; retorno do provedor respeita responsabilidade atual; operações anteriores não duplicadas. Detecção de indisponibilidade, número de tentativas e retorno à opção principal ainda pendentes.
Próxima função: agendamento. Próxima decisão: papel do CHAT-SALES como agenda própria ou interface com sistema externo. Recomendação a apresentar: consultar/criar agendamentos na agenda integrada escolhida como fonte oficial; sem integração, registrar solicitação para confirmação humana, sem prometer horário reservado. Suporte atual ainda não verificado nesta etapa; não importar requisitos completos do Luma por analogia.

### D106 — fonte oficial de agendamento
Origem: resposta explícita do usuário nesta conversa em 17/10/2026.
Decisão: consultar e agendar na ferramenta integrada escolhida pela empresa; sem integração, encaminhar solicitação para confirmação humana.
Estado: definido; implementação e verificação pendentes.
Critério: disponibilidade e confirmação de agendamento têm como fonte oficial a ferramenta integrada configurada/autorizada. Consultar horário não equivale a reservá-lo. Sem integração válida, registrar solicitação e encaminhar à equipe, sem prometer horário confirmado. Integração respeita D24, D69–D71 e limites de ações da IA.
Exemplo: IA apresenta opções retornadas pela agenda, solicita dados pertinentes e só anuncia agendamento após confirmação verificável. Sem conexão, equipe recebe preferência de horário do cliente para conferir.
Cenários de aceite: fonte identificável; consulta não produz confirmação fictícia; indisponibilidade de integração não inventa vagas; agendamento confirmado tem referência verificável. Serviços, profissionais, recursos e regras são governados pela fonte integrada, sem importar automaticamente requisitos do Luma.
Próxima decisão: confirmação do cliente antes de criar reserva/agendamento. Recomendação a apresentar: resumir serviço/reunião, data, hora/fuso pertinente, local/modalidade e condições aplicáveis, pedindo confirmação explícita antes de criar. Campos necessários dependem da operação; pagamento obrigatório e alterações serão definidos separadamente.

### D107 — confirmação antes do agendamento
Origem: autorização explícita do usuário em 17/10/2026 para seguir as recomendações e concluir versão MVP para teste, sem novas perguntas a cada decisão.
Decisão: apresentar resumo de serviço, data, horário/fuso e condições aplicáveis; criar somente após confirmação explícita do cliente. Confirmar sucesso apenas com resultado verificável da agenda integrada.
Estado: especificado; integração de agendamento não implementada neste MVP.

## D108 — execução autônoma e recorte da primeira versão
Origem: usuário pediu seguir recomendações até concluir MVP para teste e comentários.
Decisão operacional: recomendações restantes podem ser adotadas como padrões de especificação sem nova rodada de perguntas. Não confundir autorização com aprovação automática de testes, modelo, produção ou efeitos externos.
MVP 0.1: configuração guiada, rascunho persistido por empresa, cenários comuns/por função/próprios, revisão versionada e aprovação explícita do plano para teste assistido. Ensaio textual multi-turno reutiliza simulador quando houver provedor configurado; não executa ações e não comprova integração.
Padrões de recorte: assistência humana inicial, funções não escolhidas não habilitadas, sem execução externa, sem ativação de IA por aprovação do plano. Novas edições invalidam revisão/aprovação do plano. Recursos operacionais D01–D107 não incluídos no MVP permanecem especificados para evolução.
Critério de entrega: fluxo navegável no laboratório, persistência e versão verificadas por HTTP/banco, autorização/isolamento negativos, teste de interface e builds/tipos aprovados. Aprovação técnica do recorte não equivale a homologação de atendimento automático.
Fonte de escopo, evidências e limites: [mvp-0.1.md](mvp-0.1.md).

## Ampliação de escopo pelo usuário
O usuário solicitou avaliar todas as funções antes da reconstrução. A antiga pergunta sobre resultado principal está adiada até o diagnóstico integral. Fonte de continuidade: [avaliação integral](avaliacao-integral.md). Laboratório local isolado explicitamente autorizado. Próximo passo: concluir inicialização e percorrer a interface, registrando limitações por função.
