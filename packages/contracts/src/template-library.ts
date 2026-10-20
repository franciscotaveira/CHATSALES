export type TemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type TemplateSegment =
  | "retail"
  | "ecommerce"
  | "health"
  | "dental"
  | "beauty"
  | "realestate"
  | "education"
  | "restaurants"
  | "auto"
  | "fitness"
  | "travel"
  | "services"
  | "general";

export interface TemplateLibraryButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone_number?: string;
}

export interface TemplateLibraryItem {
  id: string;
  name: string;
  title: string;
  category: TemplateCategory;
  segment: TemplateSegment;
  segmentLabel: string;
  occasion?: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  buttons: TemplateLibraryButton[];
  variables: string[];
  tacticalTip: string;
}

export const TEMPLATE_SEGMENTS: Array<{ key: TemplateSegment; label: string }> = [
  { key: "ecommerce", label: "Loja Online & E-commerce" },
  { key: "retail", label: "Lojas Físicas & Varejo" },
  { key: "services", label: "Serviços & B2B" },
  { key: "health", label: "Saúde & Clínicas" },
  { key: "dental", label: "Odontologia & Dentistas" },
  { key: "beauty", label: "Beleza & Estética" },
  { key: "realestate", label: "Imobiliárias & Corretores" },
  { key: "education", label: "Cursos & Escolas" },
  { key: "auto", label: "Automóveis & Oficinas" },
  { key: "restaurants", label: "Restaurantes & Gastronomia" },
  { key: "fitness", label: "Academias & Esportes" },
  { key: "travel", label: "Viagens & Hotelaria" },
  { key: "general", label: "Geral & Qualquer Negócio" },
];

export const CANONICAL_TEMPLATE_LIBRARY: TemplateLibraryItem[] = [
  // ==========================================
  // 1. E-COMMERCE & LOJA ONLINE
  // ==========================================
  {
    id: "ecom_pix_pendente",
    name: "pix_pendente_pedido_v1",
    title: "Pix pendente: pedido aguardando pagamento",
    category: "UTILITY",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    headerText: "Pagamento Pendente ⏳",
    bodyText: "Olá {{1}}! Seu pedido {{2}} no valor de R$ {{3}} está aguardando a confirmação do pagamento via Pix.\n\nCopie a chave Pix abaixo e cole no aplicativo do seu banco para garantir o envio rápido:\n\n{{4}}\n\nEste código expira em 30 minutos.",
    footerText: "Confirmação Automática",
    buttons: [
      { type: "QUICK_REPLY", text: "Já fiz o Pix" },
      { type: "QUICK_REPLY", text: "Preciso de Ajuda" },
    ],
    variables: ["nome_cliente", "numero_pedido", "valor", "codigo_pix_copia_cola"],
    tacticalTip: "Utilidade pura: notifica sobre transação iniciada. Alta taxa de conversão inserindo o Pix Copia e Cola no corpo.",
  },
  {
    id: "ecom_confirmacao_pedido",
    name: "confirmacao_pedido_recebido_v1",
    title: "Confirmação de pedido e nota",
    category: "UTILITY",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    headerText: "Pedido Confirmado! 🎉",
    bodyText: "Olá {{1}}, confirmamos o recebimento do seu pedido {{2}} no valor de R$ {{3}}.\n\nNossa equipe já iniciou a separação dos itens. Assim que o pacote for postado, enviaremos seu código de rastreamento por aqui.",
    footerText: "Obrigado pela preferência",
    buttons: [
      { type: "QUICK_REPLY", text: "Ver Resumo do Pedido" },
      { type: "QUICK_REPLY", text: "Falar com Atendente" },
    ],
    variables: ["nome_cliente", "numero_pedido", "valor_total"],
    tacticalTip: "Excelente para criar confiança pós-venda. Reduz ansiedade e chamados de suporte.",
  },
  {
    id: "ecom_pedido_despachado",
    name: "pedido_despachado_rastreio_v1",
    title: "Pedido despachado com código de rastreio",
    category: "UTILITY",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    headerText: "Seu Pedido Está a Caminho 🚚",
    bodyText: "Olá {{1}}! Seu pedido {{2}} foi despachado via {{3}}.\n\nCódigo de rastreio: {{4}}\nPrazo estimado de entrega: {{5}}.\n\nAcompanhe a entrega pelo botão abaixo.",
    footerText: "Atualização de Envio",
    buttons: [
      { type: "URL", text: "Rastrear Encomenda", url: "https://rastreamento.correios.com.br/app/index.php?codigo={{1}}" },
      { type: "QUICK_REPLY", text: "Dúvidas no Envio" },
    ],
    variables: ["nome_cliente", "numero_pedido", "transportadora", "codigo_rastreio", "prazo_estimado"],
    tacticalTip: "Utilidade aprovada sem atrito. Botão dinâmico com URL de rastreio direto.",
  },
  {
    id: "ecom_pedido_entregue",
    name: "pedido_entregue_satisfacao_v1",
    title: "Pedido entregue e pesquisa rápida",
    category: "UTILITY",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    headerText: "Entrega Confirmada 📦",
    bodyText: "Olá {{1}}! A transportadora informou que seu pedido {{2}} foi entregue hoje no seu endereço.\n\nDeu tudo certo com o seu pacote? Se tiver qualquer apontamento, nossa equipe está pronta para te atender.",
    footerText: "Suporte Pós-Entrega",
    buttons: [
      { type: "QUICK_REPLY", text: "Chegou Tudo Perfeito" },
      { type: "QUICK_REPLY", text: "Tive um Problema" },
    ],
    variables: ["nome_cliente", "numero_pedido"],
    tacticalTip: "Garante índice de satisfação e previne chargebacks identificando problemas antes do cliente reclamar.",
  },
  {
    id: "ecom_carrinho_abandonado_1",
    name: "carrinho_abandonado_lembrete_v1",
    title: "Carrinho abandonado: primeiro toque inteligente",
    category: "MARKETING",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    headerText: "Você Esqueceu Algo Especial 🛍️",
    bodyText: "Oi, {{1}}! Vimos que você estava escolhendo {{2}}, mas não concluiu o pedido.\n\nGuardamos seus itens no carrinho para você não perder seu estoque reservado. Deseja finalizar agora com pagamento facilitado no Pix?",
    footerText: "Estoque Reservado",
    buttons: [
      { type: "QUICK_REPLY", text: "Concluir Meu Pedido" },
      { type: "QUICK_REPLY", text: "Tenho Dúvidas" },
    ],
    variables: ["nome_cliente", "nome_produto"],
    tacticalTip: "Envie entre 30 a 60 minutos após o abandono. Recupera em média 25% a 35% das vendas perdidas.",
  },
  {
    id: "ecom_carrinho_frete_gratis",
    name: "carrinho_frete_gratis_resgate_v1",
    title: "Carrinho abandonado: resgate com frete grátis",
    category: "MARKETING",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    headerText: "Presente Exclusivo Liberado 🎁",
    bodyText: "Oi, {{1}}! Para te ajudar a garantir {{2}}, liberamos frete cortesia para o seu pedido hoje até as 23h59.\n\nUse o cupom {{3}} no checkout ou clique abaixo para aplicar diretamente.",
    footerText: "Válido Apenas Hoje",
    buttons: [
      { type: "QUICK_REPLY", text: "Aproveitar Frete Grátis" },
      { type: "QUICK_REPLY", text: "Falar com Vendedor" },
    ],
    variables: ["nome_cliente", "produto_ou_carrinho", "cupom"],
    tacticalTip: "Disparo de segundo toque (24h após o abandono). Converte clientes sensíveis ao valor de frete.",
  },
  {
    id: "ecom_black_friday_vip",
    name: "black_friday_lista_vip_v1",
    title: "Black Friday: lista VIP com acesso antecipado",
    category: "MARKETING",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    occasion: "black-friday",
    headerText: "Acesso VIP Black Friday 🔥",
    bodyText: "Olá {{1}}! Como você é cliente prioritário, liberamos seu acesso antecipado às melhores ofertas de Black Friday com até {{2}}% de desconto.\n\nOs estoques mais procurados abrem para você antes do público geral. Toque abaixo para conferir o catálogo restrito.",
    footerText: "Vagas e Estoques Limitados",
    buttons: [
      { type: "QUICK_REPLY", text: "Acessar Ofertas VIP" },
      { type: "QUICK_REPLY", text: "Ver Mais Detalhes" },
    ],
    variables: ["nome_cliente", "desconto_maximo"],
    tacticalTip: "Acesso antecipado cria sentimento de exclusividade e antecipa receita de novembro.",
  },
  {
    id: "ecom_natal_prazo_entrega",
    name: "natal_prazo_garantido_v1",
    title: "Natal: último dia com entrega garantida",
    category: "MARKETING",
    segment: "ecommerce",
    segmentLabel: "Loja Online & E-commerce",
    occasion: "natal",
    headerText: "Seus Presentes a Tempo do Natal 🎄",
    bodyText: "Oi, {{1}}! Para seus presentes de Natal chegarem antes da ceia, os pedidos da sua região precisam ser confirmados até {{2}}.\n\nJá separamos as opções mais pedidas para entrega imediata. Deseja conferir os destaques?",
    footerText: "Envio Expresso de Natal",
    buttons: [
      { type: "QUICK_REPLY", text: "Ver Sugestões Rápidas" },
      { type: "QUICK_REPLY", text: "Falar com Vendedor" },
    ],
    variables: ["nome_cliente", "data_limite"],
    tacticalTip: "Gatilho de urgência genuína baseado na malha logística de fim de ano.",
  },

  // ==========================================
  // 2. SERVIÇOS & COBRANÇA B2B (PIX & ABACATEPAY)
  // ==========================================
  {
    id: "serv_link_pix_abacatepay",
    name: "cobranca_pix_instantaneo_abacatepay_v1",
    title: "Cobrança Pix instantânea com baixa automática",
    category: "UTILITY",
    segment: "services",
    segmentLabel: "Serviços & B2B",
    headerText: "Ordem de Pagamento Pix 💰",
    bodyText: "Olá {{1}}! Segue a cobrança referente a {{2}} no valor de R$ {{3}}.\n\nVocê pode pagar via Pix Copia e Cola diretamente no seu banco:\n\n{{4}}\n\nA confirmação e emissão de recibo são instantâneas.",
    footerText: "Cobrança Segura Pix",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar Pagamento" },
      { type: "QUICK_REPLY", text: "Solicitar 2ª Via" },
    ],
    variables: ["nome_cliente", "descricao_servico", "valor", "chave_copia_cola"],
    tacticalTip: "O carro-chefe de conciliação. Quando o cliente paga pelo AbacatePay, o webhook dispara a confirmação na mesma hora.",
  },
  {
    id: "serv_lembrete_vencimento_fatura",
    name: "lembrete_vencimento_fatura_v1",
    title: "Lembrete de vencimento de fatura / mensalidade",
    category: "UTILITY",
    segment: "services",
    segmentLabel: "Serviços & B2B",
    headerText: "Aviso de Vencimento 📅",
    bodyText: "Olá {{1}}, informamos que a sua fatura de {{2}}, no valor de R$ {{3}}, vence em {{4}}.\n\nPara facilitar seu pagamento e evitar encargos, disponibilizamos o Pix Copia e Cola abaixo:\n\n{{5}}",
    footerText: "Departamento Financeiro",
    buttons: [
      { type: "QUICK_REPLY", text: "Já Efetuei o Pagamento" },
      { type: "QUICK_REPLY", text: "Falar com Financeiro" },
    ],
    variables: ["nome_cliente", "referencia_mes", "valor", "data_vencimento", "codigo_pix"],
    tacticalTip: "Enviado 2 a 3 dias antes do vencimento. Reduz a inadimplência em até 40%.",
  },
  {
    id: "serv_confirmacao_pagamento_recibo",
    name: "confirmacao_pagamento_recibo_v1",
    title: "Confirmação de pagamento e recibo",
    category: "UTILITY",
    segment: "services",
    segmentLabel: "Serviços & B2B",
    headerText: "Pagamento Confirmado! ✅",
    bodyText: "Olá {{1}}! Confirmamos com sucesso o recebimento de R$ {{2}} referente a {{3}}.\n\nSeu comprovante foi registrado em nosso sistema sob o código {{4}}. Agradecemos a pontualidade e parceria!",
    footerText: "Comprovante Digital",
    buttons: [
      { type: "QUICK_REPLY", text: "Baixar Recibo / NF" },
      { type: "QUICK_REPLY", text: "Falar com Suporte" },
    ],
    variables: ["nome_cliente", "valor_pago", "descricao_servico", "codigo_autenticacao"],
    tacticalTip: "Disparado automaticamente pelo webhook AbacatePay assim que a transação for liquidada.",
  },
  {
    id: "serv_followup_orcamento",
    name: "followup_orcamento_enviado_v1",
    title: "Follow-up de orçamento enviado",
    category: "UTILITY",
    segment: "services",
    segmentLabel: "Serviços & B2B",
    headerText: "Acompanhamento da Proposta 📋",
    bodyText: "Olá {{1}}, tudo bem? Entramos em contato para verificar se você conseguiu analisar a proposta {{2}} enviada para o serviço de {{3}}.\n\nFicou alguma dúvida sobre o escopo, prazos ou condições de pagamento?",
    footerText: "Equipe Comercial",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero Aprovar Proposta" },
      { type: "QUICK_REPLY", text: "Ajustar Condições" },
    ],
    variables: ["nome_cliente", "numero_proposta", "tipo_servico"],
    tacticalTip: "Excelente para fechar negócios parados. Mensagem respeitosa e consultiva.",
  },
  {
    id: "serv_nota_fiscal_emitida",
    name: "envio_nota_fiscal_emitida_v1",
    title: "Nota fiscal emitida disponível",
    category: "UTILITY",
    segment: "services",
    segmentLabel: "Serviços & B2B",
    headerText: "Nota Fiscal Disponível 📄",
    bodyText: "Olá {{1}}, informamos que a nota fiscal {{2}} referente aos serviços prestados foi emitida com sucesso no valor de R$ {{3}}.\n\nVocê pode consultar os dados da emissão pelo botão abaixo ou solicitar o PDF diretamente.",
    footerText: "Setor Fiscal",
    buttons: [
      { type: "QUICK_REPLY", text: "Receber PDF por Aqui" },
      { type: "QUICK_REPLY", text: "Falar com Atendimento" },
    ],
    variables: ["nome_cliente_ou_empresa", "numero_nfe", "valor_total"],
    tacticalTip: "Utilidade contábil. Mantém a relação comercial altamente organizada e transparente.",
  },

  // ==========================================
  // 3. SAÚDE, CLÍNICAS & CONSULTÓRIOS
  // ==========================================
  {
    id: "health_confirmacao_consulta",
    name: "confirmacao_consulta_medica_v1",
    title: "Confirmação de consulta médica agendada",
    category: "UTILITY",
    segment: "health",
    segmentLabel: "Saúde & Clínicas",
    headerText: "Agendamento de Consulta 🩺",
    bodyText: "Olá {{1}}! Sua consulta com {{2}} está agendada para {{3}} às {{4}} na unidade {{5}}.\n\nPor gentileza, confirme sua presença clicando em um dos botões abaixo para que possamos reservar sua sala.",
    footerText: "Central de Agendamento",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar Presença" },
      { type: "QUICK_REPLY", text: "Reagendar Consulta" },
    ],
    variables: ["nome_paciente", "nome_profissional", "data", "horario", "local_ou_sala"],
    tacticalTip: "Reduz 'no-shows' de clínicas de 28% para menos de 6%. Botões de resposta rápida facilitam o aceite.",
  },
  {
    id: "health_lembrete_24h",
    name: "lembrete_consulta_24h_v1",
    title: "Lembrete de consulta 24 horas antes com orientações",
    category: "UTILITY",
    segment: "health",
    segmentLabel: "Saúde & Clínicas",
    headerText: "Lembrete: Sua Consulta é Amanhã ⏰",
    bodyText: "Olá {{1}}, lembramos que sua consulta com {{2}} acontece amanhã às {{3}}.\n\nOrientações importantes:\n• Chegue com 15 minutos de antecedência\n• Traga documento com foto e exames recentes\n• Local: {{4}}.\n\nTe aguardamos!",
    footerText: "Clínica Médica",
    buttons: [
      { type: "QUICK_REPLY", text: "Presença Confirmada" },
      { type: "QUICK_REPLY", text: "Como Chegar (GPS)" },
    ],
    variables: ["nome_paciente", "nome_medico", "horario", "endereco_completo"],
    tacticalTip: "Instruções claras de pré-atendimento evitam atrasos na agenda do médico.",
  },
  {
    id: "health_resultado_exames",
    name: "resultado_exame_liberado_v1",
    title: "Resultado de exame disponível",
    category: "UTILITY",
    segment: "health",
    segmentLabel: "Saúde & Clínicas",
    headerText: "Resultado de Exame Liberado 🔬",
    bodyText: "Olá {{1}}! O laudo do seu exame protocolo {{2}} já foi emitido e está pronto para consulta.\n\nPara sua privacidade e segurança em conformidade com a LGPD, você pode acessar seu laudo diretamente pelo botão abaixo ou retirar na clínica.",
    footerText: "Laboratório de Análises",
    buttons: [
      { type: "URL", text: "Acessar Laudo Seguro", url: "https://minhaclinica.com.br/laudos?id={{1}}" },
      { type: "QUICK_REPLY", text: "Falar com Recepção" },
    ],
    variables: ["nome_paciente", "protocolo_exame"],
    tacticalTip: "Conformidade LGPD estrita: nunca envie diagnósticos em texto aberto; use link seguro ou chave.",
  },
  {
    id: "health_checkup_anual",
    name: "campanha_checkup_anual_saude_v1",
    title: "Clínica: convite para check-up anual preventivo",
    category: "MARKETING",
    segment: "health",
    segmentLabel: "Saúde & Clínicas",
    headerText: "Sua Saúde em Primeiro Lugar 💙",
    bodyText: "Olá {{1}}! Já faz um ano desde a sua última bateria de exames preventivos em nossa clínica.\n\nManter o check-up em dia é a forma mais eficaz de cuidar da sua longevidade e bem-estar. Neste mês, temos horários dedicados para baterias completas. Deseja conhecer os pacotes disponíveis?",
    footerText: "Medicina Preventiva",
    buttons: [
      { type: "QUICK_REPLY", text: "Ver Opções de Check-up" },
      { type: "QUICK_REPLY", text: "Agendar por Aqui" },
    ],
    variables: ["nome_paciente"],
    tacticalTip: "Excelente reativação anual de base médica de pacientes.",
  },

  // ==========================================
  // 4. ODONTOLOGIA & DENTISTAS
  // ==========================================
  {
    id: "dental_retorno_semestral",
    name: "dentista_retorno_semestral_v1",
    title: "Dentista: está na hora da sua profilaxia semestral",
    category: "MARKETING",
    segment: "dental",
    segmentLabel: "Odontologia & Dentistas",
    headerText: "Cuidado com o Seu Sorriso ✨",
    bodyText: "Olá {{1}}! Já se passaram 6 meses desde a sua última profilaxia e limpeza com {{2}}.\n\nPara manter seus dentes protegidos contra placas e tártaro, o ideal é realizar a revisão periódica. Separamos horários especiais para você esta semana. Vamos agendar seu horário?",
    footerText: "Odontologia Preventiva",
    buttons: [
      { type: "QUICK_REPLY", text: "Agendar Limpeza" },
      { type: "QUICK_REPLY", text: "Ver Horários da Semana" },
    ],
    variables: ["nome_paciente", "nome_dentista"],
    tacticalTip: "O modelo de maior faturamento recorrente para consultórios e clínicas odontológicas.",
  },
  {
    id: "dental_lembrete_consulta",
    name: "dentista_lembrete_horario_v1",
    title: "Dentista: lembrete de consulta e manutenção",
    category: "UTILITY",
    segment: "dental",
    segmentLabel: "Odontologia & Dentistas",
    headerText: "Lembrete de Horário 🦷",
    bodyText: "Olá {{1}}! Lembramos do seu horário de {{2}} com {{3}} marcado para {{4}} às {{5}}.\n\nPedimos a gentileza de confirmar para que possamos esterilizar os instrumentais dedicados ao seu procedimento.",
    footerText: "Consultório Odontológico",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmado, Irei" },
      { type: "QUICK_REPLY", text: "Preciso Remarcar" },
    ],
    variables: ["nome_paciente", "tipo_procedimento", "nome_dentista", "data", "horario"],
    tacticalTip: "Alta taxa de resposta ao mencionar a preparação individual dos instrumentais.",
  },

  // ==========================================
  // 5. BELEZA, ESTÉTICA & SALÕES
  // ==========================================
  {
    id: "beauty_agendamento_confirmado",
    name: "salao_agendamento_confirmado_v1",
    title: "Salão / Clínica de estética: agendamento confirmado",
    category: "UTILITY",
    segment: "beauty",
    segmentLabel: "Beleza & Estética",
    headerText: "Seu Horário Está Reservado! 💅",
    bodyText: "Olá {{1}}! Seu procedimento de {{2}} com a profissional {{3}} está confirmado para {{4}} às {{5}}.\n\nEstamos ansiosas para te receber em nosso espaço na unidade {{6}}!",
    footerText: "Espaço de Beleza & Bem-Estar",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar Presença" },
      { type: "QUICK_REPLY", text: "Avisar se Atrasar" },
    ],
    variables: ["nome_cliente", "servico", "profissional", "data", "horario", "unidade"],
    tacticalTip: "Humanizado e acolhedor. Reduz faltas de última hora.",
  },
  {
    id: "beauty_aniversario_mimo",
    name: "aniversario_cliente_mimo_salao_v1",
    title: "Aniversário: presente exclusivo no salão/estética",
    category: "MARKETING",
    segment: "beauty",
    segmentLabel: "Beleza & Estética",
    headerText: "Feliz Aniversário! 🎂🎉",
    bodyText: "Parabéns, {{1}}! No mês do seu aniversário, você é nossa convidada de honra.\n\nPreparamos para você {{2}} de presente ao realizar qualquer serviço em nosso espaço durante este mês. Deseja agendar seu dia de cuidado especial?",
    footerText: "Presente Exclusivo",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero Agendar Meu Mimo" },
      { type: "QUICK_REPLY", text: "Ver Serviços Disponíveis" },
    ],
    variables: ["nome_cliente", "mimo_ou_cortesia"],
    tacticalTip: "Gera fidelização imediata. Clientes adoram ser lembrados no mês de aniversário.",
  },

  // ==========================================
  // 6. IMOBILIÁRIAS & CORRETORES
  // ==========================================
  {
    id: "realestate_followup_lead_anuncio",
    name: "imobiliaria_followup_lead_anuncio_v1",
    title: "Follow-up de lead de anúncio (imobiliária)",
    category: "MARKETING",
    segment: "realestate",
    segmentLabel: "Imobiliárias & Corretores",
    headerText: "Imóvel do Seu Interesse 🏡",
    bodyText: "Olá {{1}}! Sou o {{2}} da Imobiliária {{3}}. Você solicitou informações sobre o imóvel {{4}} pelo nosso anúncio.\n\nSeparei a planta completa, fotos em alta resolução e a tabela de condições especiais. Posso te enviar por aqui agora?",
    footerText: "Atendimento Personalizado",
    buttons: [
      { type: "QUICK_REPLY", text: "Pode Enviar Agora" },
      { type: "QUICK_REPLY", text: "Prefiro uma Ligação" },
    ],
    variables: ["nome_cliente", "nome_corretor", "nome_imobiliaria", "nome_ou_bairro_imovel"],
    tacticalTip: "Excelente para a janela gratuita de 7 dias de anúncios Click-to-WhatsApp (CTWA). Converte o lead antes de esfriar.",
  },
  {
    id: "realestate_confirmacao_visita",
    name: "imobiliaria_visita_confirmada_v1",
    title: "Visita ao imóvel confirmada",
    category: "UTILITY",
    segment: "realestate",
    segmentLabel: "Imobiliárias & Corretores",
    headerText: "Visita Confirmada 🔑",
    bodyText: "Olá {{1}}! Sua visita ao imóvel {{2}} está confirmada para {{3}} às {{4}}.\n\nO corretor {{5}} estará te esperando na portaria no endereço: {{6}}.\n\nQualquer imprevisto, basta responder por aqui.",
    footerText: "Imobiliária Oficial",
    buttons: [
      { type: "QUICK_REPLY", text: "Estou a Caminho" },
      { type: "QUICK_REPLY", text: "Reagendar Visita" },
    ],
    variables: ["nome_cliente", "referencia_imovel", "data", "horario", "nome_corretor", "endereco"],
    tacticalTip: "Passa segurança ao comprador e garante o comparecimento do corretor e cliente no local.",
  },
  {
    id: "realestate_aluguel_vencimento",
    name: "imobiliaria_lembrete_aluguel_v1",
    title: "Lembrete de pagamento de aluguel",
    category: "UTILITY",
    segment: "realestate",
    segmentLabel: "Imobiliárias & Corretores",
    headerText: "Aviso de Aluguel 🏠",
    bodyText: "Olá {{1}}! Lembramos que o aluguel do imóvel {{2}} referente ao mês atual vence em {{3}}, no valor de R$ {{4}}.\n\nPague via Pix Copia e Cola para baixa automática:\n\n{{5}}",
    footerText: "Gestão de Locação",
    buttons: [
      { type: "QUICK_REPLY", text: "Já Efetuei o Pix" },
      { type: "QUICK_REPLY", text: "Falar com Locação" },
    ],
    variables: ["nome_locatario", "endereco_imovel", "data_vencimento", "valor_aluguel", "pix_copia_cola"],
    tacticalTip: "Substitui envio de boletos físicos ou emails ignorados. Baixa instantânea.",
  },

  // ==========================================
  // 7. EDUCAÇÃO, CURSOS & ESCOLAS
  // ==========================================
  {
    id: "edu_followup_lead_curso",
    name: "curso_followup_lead_matricula_v1",
    title: "Follow-up de lead interessado em curso/formação",
    category: "MARKETING",
    segment: "education",
    segmentLabel: "Cursos & Escolas",
    headerText: "Sua Carreira em Destaque 🎓",
    bodyText: "Olá {{1}}! Você solicitou detalhes sobre a formação em {{2}}.\n\nAs turmas para o próximo período iniciam em {{3}} e as vagas com bolsa de incentivo de {{4}}% estão nas últimas posições. Deseja conferir a grade curricular completa?",
    footerText: "Processo Seletivo",
    buttons: [
      { type: "QUICK_REPLY", text: "Ver Grade Curricular" },
      { type: "QUICK_REPLY", text: "Falar com Orientador" },
    ],
    variables: ["nome_interessado", "nome_curso", "data_inicio", "desconto_bolsa"],
    tacticalTip: "Ideal para tráfego pago educacional. Converte curiosos em alunos matriculados.",
  },
  {
    id: "edu_lembrete_aula",
    name: "lembrete_aula_ao_vivo_v1",
    title: "Lembrete de aula ou mentoria ao vivo",
    category: "UTILITY",
    segment: "education",
    segmentLabel: "Cursos & Escolas",
    headerText: "Sua Aula Começa em Breve ⏰",
    bodyText: "Olá {{1}}! Lembrando que sua aula do módulo {{2}} acontece hoje às {{3}}.\n\nPara acessar a sala virtual ao vivo, utilize o link seguro abaixo.",
    footerText: "Ambiente do Aluno",
    buttons: [
      { type: "URL", text: "Entrar na Aula", url: "https://plataforma.com.br/aula?token={{1}}" },
      { type: "QUICK_REPLY", text: "Não Poderei Assistir" },
    ],
    variables: ["nome_aluno", "nome_modulo", "horario"],
    tacticalTip: "Maximiza presença nas aulas e mentorias ao vivo.",
  },

  // ==========================================
  // 8. RESTAURANTES & GASTRONOMIA
  // ==========================================
  {
    id: "rest_reserva_confirmada",
    name: "restaurante_reserva_confirmada_v1",
    title: "Restaurante: confirmação de reserva de mesa",
    category: "UTILITY",
    segment: "restaurants",
    segmentLabel: "Restaurantes & Gastronomia",
    headerText: "Reserva Confirmada! 🍷🍽️",
    bodyText: "Olá {{1}}! Sua reserva para {{2}} pessoas no restaurante {{3}} está confirmada para {{4}} às {{5}}.\n\nSua mesa será mantida por até 15 minutos de tolerância. Caso precise alterar, nos avise por aqui.",
    footerText: "Experiência Gastronômica",
    buttons: [
      { type: "QUICK_REPLY", text: "Confirmar Mesa" },
      { type: "QUICK_REPLY", text: "Cancelar Reserva" },
    ],
    variables: ["nome_cliente", "numero_pessoas", "nome_restaurante", "data", "horario"],
    tacticalTip: "Evita prejuízos de mesas reservadas vazias em sextas e fins de semana.",
  },
  {
    id: "rest_delivery_saiu",
    name: "delivery_pedido_saiu_entrega_v1",
    title: "Delivery: pedido saiu para entrega com entregador",
    category: "UTILITY",
    segment: "restaurants",
    segmentLabel: "Restaurantes & Gastronomia",
    headerText: "Seu Pedido Saiu para Entrega! 🛵💨",
    bodyText: "Olá {{1}}! Seu pedido {{2}} já foi preparado com todo carinho e acabou de sair para entrega com o entregador {{3}}.\n\nPrevisão estimada: {{4}} minutos. Bom apetite!",
    footerText: "Acompanhe seu Delivery",
    buttons: [
      { type: "QUICK_REPLY", text: "Acompanhar Entregador" },
      { type: "QUICK_REPLY", text: "Problemas na Entrega" },
    ],
    variables: ["nome_cliente", "numero_pedido", "nome_entregador", "tempo_estimado"],
    tacticalTip: "Gera satisfação instantânea para clientes com fome.",
  },

  // ==========================================
  // 9. AUTOMÓVEIS & OFICINAS
  // ==========================================
  {
    id: "auto_veiculo_pronto",
    name: "oficina_veiculo_pronto_retirada_v1",
    title: "Oficina: veículo pronto para retirada",
    category: "UTILITY",
    segment: "auto",
    segmentLabel: "Automóveis & Oficinas",
    headerText: "Seu Carro Está Pronto! 🚗✨",
    bodyText: "Olá {{1}}! Os serviços no seu veículo {{2}} (Placa {{3}}) foram finalizados com sucesso e o carro já está pronto para retirada.\n\nValor final aprovado: R$ {{4}}.\nNosso horário de atendimento vai até as {{5}}.",
    footerText: "Oficina Mecânica & Centro Automotivo",
    buttons: [
      { type: "QUICK_REPLY", text: "Pagar via Pix Agora" },
      { type: "QUICK_REPLY", text: "Vou Retirar Hoje" },
    ],
    variables: ["nome_cliente", "modelo_veiculo", "placa", "valor_total", "horario_fechamento"],
    tacticalTip: "Oferecer pagamento Pix antecipado agiliza a liberação na recepção da oficina.",
  },
  {
    id: "auto_orcamento_aprovacao",
    name: "oficina_orcamento_aprovacao_v1",
    title: "Oficina: orçamento para aprovação do cliente",
    category: "UTILITY",
    segment: "auto",
    segmentLabel: "Automóveis & Oficinas",
    headerText: "Diagnóstico e Orçamento 🔧",
    bodyText: "Olá {{1}}! Finalizamos a checagem no seu veículo {{2}}.\n\nO orçamento para os reparos necessários ficou em R$ {{3}} (peças e mão de obra inclusas).\n\nPara iniciarmos o serviço imediatamente, por favor confirme a aprovação abaixo.",
    footerText: "Garantia e Peças Originais",
    buttons: [
      { type: "QUICK_REPLY", text: "Aprovar Orçamento" },
      { type: "QUICK_REPLY", text: "Falar com o Mecânico" },
    ],
    variables: ["nome_cliente", "modelo_veiculo", "valor_orcamento"],
    tacticalTip: "Acelera a liberação de reparos sem precisar ligar ou esperar o cliente atender.",
  },

  // ==========================================
  // 10. ACADEMIAS & FITNESS
  // ==========================================
  {
    id: "fit_plano_vencendo",
    name: "academia_renovacao_plano_v1",
    title: "Academia: plano perto do vencimento com desconto",
    category: "UTILITY",
    segment: "fitness",
    segmentLabel: "Academias & Esportes",
    headerText: "Renovação do Seu Plano Fitness 🏋️",
    bodyText: "Olá {{1}}! Seu plano {{2}} vence no dia {{3}}. Para não perder seu ritmo de treino e evitar bloqueio na catraca, você pode renovar agora com a mesma condição promocional.\n\nValor para renovação: R$ {{4}}.",
    footerText: "Equipe Fitness",
    buttons: [
      { type: "QUICK_REPLY", text: "Renovar via Pix" },
      { type: "QUICK_REPLY", text: "Falar com Recepção" },
    ],
    variables: ["nome_aluno", "tipo_plano", "data_vencimento", "valor_renovacao"],
    tacticalTip: "Reduz a evasão mensal mantendo a catraca liberada sem atrito.",
  },
  {
    id: "fit_aula_experimental",
    name: "academia_aula_experimental_v1",
    title: "Academia: convite para aula experimental cortesia",
    category: "MARKETING",
    segment: "fitness",
    segmentLabel: "Academias & Esportes",
    headerText: "Treino Cortesia Liberado 🥇",
    bodyText: "Oi, {{1}}! Que tal experimentar um treino completo conosco? Liberamos uma aula cortesia de {{2}} com acompanhamento de instrutor para você conhecer nossa estrutura.\n\nPodemos agendar seu treino para esta semana?",
    footerText: "Venha Treinar Conosco",
    buttons: [
      { type: "QUICK_REPLY", text: "Agendar Minha Aula" },
      { type: "QUICK_REPLY", text: "Ver Modalidades" },
    ],
    variables: ["nome_lead", "modalidade"],
    tacticalTip: "Excelente para campanhas locais de atração de novos membros.",
  },

  // ==========================================
  // 11. VIAGENS & HOTELARIA
  // ==========================================
  {
    id: "travel_reserva_confirmada",
    name: "hotel_reserva_confirmada_v1",
    title: "Hotel / Pousada: reserva confirmada com voucher",
    category: "UTILITY",
    segment: "travel",
    segmentLabel: "Viagens & Hotelaria",
    headerText: "Reserva Confirmada! 🏖️🛎️",
    bodyText: "Olá {{1}}! Sua reserva na {{2}} está confirmada.\n\nCheck-in: {{3}} (a partir das 14h)\nCheck-out: {{4}} (até as 12h)\nAcomodação: {{5}}\nCódigo da reserva: {{6}}.\n\nEstamos preparando tudo para uma estadia inesquecível!",
    footerText: "Voucher de Hospedagem",
    buttons: [
      { type: "QUICK_REPLY", text: "Como Chegar (Mapa)" },
      { type: "QUICK_REPLY", text: "Cardápio e Serviços" },
    ],
    variables: ["nome_hospede", "nome_hotel", "data_checkin", "data_checkout", "tipo_quarto", "codigo_reserva"],
    tacticalTip: "Entrega completa do voucher digital no WhatsApp do hóspede.",
  },

  // ==========================================
  // 12. GERAL & AUTENTICAÇÃO (MCT SOVEREIGN EXCLUSIVES)
  // ==========================================
  {
    id: "mct_ctwa_janela_7dias",
    name: "meta_ctwa_janela_7dias_boas_vindas_v1",
    title: "⚡ Abertura Janela Gratuita 7 Dias (Meta CTWA / WAME)",
    category: "MARKETING",
    segment: "general",
    segmentLabel: "Geral & Qualquer Negócio",
    headerText: "Atendimento Prioritário 🚀",
    bodyText: "Olá {{1}}! Vimos que você veio através do nosso anúncio sobre {{2}}.\n\nNosso especialista comercial já separou a apresentação e as condições sob medida para o seu caso. O que você gostaria de priorizar primeiro:\n\n1. Preços e planos\n2. Demonstração prática\n3. Tirar dúvidas específicas",
    footerText: "Resposta Rápida",
    buttons: [
      { type: "QUICK_REPLY", text: "Preços e Planos" },
      { type: "QUICK_REPLY", text: "Demonstração Rápida" },
    ],
    variables: ["nome_lead", "tema_anuncio"],
    tacticalTip: "ESTRATÉGIA DE OURO: Aproveita a nova janela de 7 dias gratuitos da Meta para anúncios Click-to-WhatsApp (FEP/WAME). Custo zero de conversa na Meta.",
  },
  {
    id: "mct_reativacao_inativos_60d",
    name: "reativacao_clientes_inativos_60d_v1",
    title: "Reativação de clientes inativos (60+ dias)",
    category: "MARKETING",
    segment: "general",
    segmentLabel: "Geral & Qualquer Negócio",
    headerText: "Sentimos Sua Falta! 💙",
    bodyText: "Olá {{1}}, tudo bem? Notamos que faz um tempinho que você não faz pedidos conosco.\n\nDesde a sua última compra, lançamos novidades exclusivas em {{2}}. Para comemorar seu retorno, preparamos uma condição de {{3}} válida nesta semana. Deseja conferir?",
    footerText: "Cliente Especial",
    buttons: [
      { type: "QUICK_REPLY", text: "Quero Aproveitar" },
      { type: "QUICK_REPLY", text: "Ver Novidades" },
    ],
    variables: ["nome_cliente", "categoria_novidades", "beneficio_retorno"],
    tacticalTip: "Gera caixa rápido ativando clientes que já conhecem e confiam na sua marca.",
  },
  {
    id: "auth_codigo_verificacao",
    name: "codigo_verificacao_seguranca_v1",
    title: "Código de verificação / autenticação (OTP)",
    category: "AUTHENTICATION",
    segment: "general",
    segmentLabel: "Geral & Qualquer Negócio",
    headerText: null,
    bodyText: "{{1}} é o seu código de segurança para confirmação de acesso. Não compartilhe este código com ninguém. Válido por 10 minutos.",
    footerText: "Segurança Digital",
    buttons: [
      { type: "QUICK_REPLY", text: "Copiar Código" },
    ],
    variables: ["codigo_numerico"],
    tacticalTip: "Categoria Autenticação na Meta. Taxa de aprovação automática e prioridade de entrega máxima.",
  },
  {
    id: "gen_pesquisa_nps",
    name: "pesquisa_satisfacao_nps_v1",
    title: "Pesquisa rápida de satisfação e qualidade",
    category: "MARKETING",
    segment: "general",
    segmentLabel: "Geral & Qualquer Negócio",
    headerText: "Sua Opinião Faz a Diferença ⭐",
    bodyText: "Olá {{1}}! Como foi a sua experiência recente de atendimento com a equipe {{2}}?\n\nSua avaliação sincera nos ajuda a aprimorar nossos processos a cada dia. Leva menos de 30 segundos:",
    footerText: "Avaliação de Atendimento",
    buttons: [
      { type: "QUICK_REPLY", text: "⭐⭐⭐⭐⭐ Excelente" },
      { type: "QUICK_REPLY", text: "⭐⭐⭐ Regular" },
    ],
    variables: ["nome_cliente", "nome_empresa"],
    tacticalTip: "Aumenta o engajamento e identifica promotores para pedir avaliações no Google.",
  },
];

export function filterTemplateLibrary(options: {
  category?: TemplateCategory | "ALL";
  segment?: TemplateSegment | "ALL";
  search?: string;
}): TemplateLibraryItem[] {
  return CANONICAL_TEMPLATE_LIBRARY.filter((item) => {
    if (options.category && options.category !== "ALL" && item.category !== options.category) {
      return false;
    }
    if (options.segment && options.segment !== "ALL" && item.segment !== options.segment) {
      return false;
    }
    if (options.search && options.search.trim()) {
      const term = options.search.trim().toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(term);
      const matchBody = item.bodyText.toLowerCase().includes(term);
      const matchSegment = item.segmentLabel.toLowerCase().includes(term);
      const matchName = item.name.toLowerCase().includes(term);
      if (!matchTitle && !matchBody && !matchSegment && !matchName) return false;
    }
    return true;
  });
}
