import { describe, it, expect } from "vitest";
import {
  buildGroundedSystemPrompt,
  parseAiResponse,
  formatBrlPrice,
  type GroundedAiConfig,
  type GroundedProduct,
} from "../ai/ai-grounding-prompt.builder";

describe("AI Grounding Prompt Builder & Handoff Parser", () => {
  it("formats BRL currency correctly from price_cents", () => {
    expect(formatBrlPrice(149700)).toContain("1.497,00");
    expect(formatBrlPrice(11000)).toContain("110,00");
  });

  it("builds grounded prompt with products, business rules and ignorance protocol", () => {
    const config: GroundedAiConfig = {
      name: "Sofia",
      personality: "cordial_comercial",
      skills:{catalog_offers:true},
      systemPrompt: "Seja muito gentil e convide para agendar.",
      strictMode: true,
      businessRules: {
        openingHours: "Seg-Sex 08h-19h",
        address: "Rua das Flores 123",
        cancellationPolicy: "Tolerância de 15 min",
        paymentMethods: "Pix e Cartão",
      },
      faq: [
        {
          question: "Quanto tempo dura a escova?",
          answer: "Dura em média 3 meses.",
        },
      ],
    };

    const products: GroundedProduct[] = [
      {
        id: "prod-1",
        title: "Escova Lisa",
        priceCents: 11000,
        category: "Escovas",
        description: "Lavagem e escova modelada",
      },
    ];

    const prompt = buildGroundedSystemPrompt(config, products);

    expect(prompt).toContain("Você é Sofia, atendente comercial oficial de WhatsApp da empresa.");
    expect(prompt).toContain("<catalog_truth>");
    expect(prompt).toContain("Escova Lisa | ID: prod-1 | Preço:");
    expect(prompt).toContain("<business_rules>");
    expect(prompt).toContain("Horário de Funcionamento: Seg-Sex 08h-19h");
    expect(prompt).toContain("<faq_truth>");
    expect(prompt).toContain("Quanto tempo dura a escova?");
    expect(prompt).toContain("PROTOCOLO DE IGNORÂNCIA");
    expect(prompt).toContain("[HUMAN_HANDOFF: resumo da dúvida]");
  });

  it("parses clean response when no handoff is needed", () => {
    const raw = "Olá! O valor da Escova Lisa é R$ 110,00. Gostaria de agendar para hoje?";
    const parsed = parseAiResponse(raw);
    expect(parsed.needsHandoff).toBe(false);
    expect(parsed.cleanReplyText).toBe(raw);
    expect(parsed.handoffReason).toBeUndefined();
  });

  it("detects and extracts human handoff tag and cleans customer message", () => {
    const raw =
      "Vou confirmar essa condição especial com a nossa gerência e já te retorno! [HUMAN_HANDOFF: Cliente pediu desconto de 50% no pacote]";
    const parsed = parseAiResponse(raw);
    expect(parsed.needsHandoff).toBe(true);
    expect(parsed.handoffReason).toBe("Cliente pediu desconto de 50% no pacote");
    expect(parsed.cleanReplyText).toBe(
      "Vou confirmar essa condição especial com a nossa gerência e já te retorno!"
    );
  });

  it("injects CTWA ad hook layer when lead originates from Meta Ads", () => {
    const config: GroundedAiConfig = {
      name: "Sofia",
      personality: "cordial_comercial",
      strictMode: true,
      adHook: {
        headline: "50% OFF na Primeira Sessão de Laser",
        body: "Garanta seu voucher exclusivo de boas-vindas clicando aqui.",
      },
    };

    const prompt = buildGroundedSystemPrompt(config, []);

    expect(prompt).toContain("<origem_do_lead_anuncio_meta>");
    expect(prompt).toContain("50% OFF na Primeira Sessão de Laser");
    expect(prompt).toContain("Garanta seu voucher exclusivo de boas-vindas");
    expect(prompt).toContain("INSTRUÇÃO DE GANCHO: Na sua saudação ou resposta inicial");
  });

  it("injects Pix instant closing instructions into grounded prompt", () => {
    const config: GroundedAiConfig = {
      name: "Sofia",
      personality: "cordial_comercial",
      strictMode: true,skills:{pix_charges:true},
    };
    const prompt = buildGroundedSystemPrompt(config, []);
    expect(prompt).toContain("<fechamento_comercial_pix>");
    expect(prompt).toContain("[OFFER_PIX: id_do_produto; QTY=quantidade]");
    expect(prompt).toContain("Não gera cobrança");
  });

  it("parses [OFFER_PIX: <productId>] and cleans customer-facing reply text", () => {
    const raw =
      "Perfeito! Vou gerar o Pix agora para garantir sua vaga na promoção. [OFFER_PIX: 550e8400-e29b-41d4-a716-446655440000]";
    const parsed = parseAiResponse(raw);
    expect(parsed.needsHandoff).toBe(false);
    expect(parsed.offerPixProductId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(parsed.cleanReplyText).toBe(
      "Perfeito! Vou gerar o Pix agora para garantir sua vaga na promoção."
    );
  });

  it("parses [GERAR_PIX: <productId>] alias correctly", () => {
    const raw = "Show de bola! Segue o Pix. [GERAR_PIX: prod-escova-lisa]";
    const parsed = parseAiResponse(raw);
    expect(parsed.offerPixProductId).toBe("prod-escova-lisa");
    expect(parsed.cleanReplyText).toBe("Show de bola! Segue o Pix.");
  });

  it("parses both [HUMAN_HANDOFF] and [OFFER_PIX] when present simultaneously", () => {
    const raw =
      "Vou avisar o financeiro para acompanhar seu pagamento! [OFFER_PIX: prod-1] [HUMAN_HANDOFF: Cliente solicitou nota fiscal]";
    const parsed = parseAiResponse(raw);
    expect(parsed.needsHandoff).toBe(true);
    expect(parsed.handoffReason).toBe("Cliente solicitou nota fiscal");
    expect(parsed.offerPixProductId).toBe("prod-1");
    expect(parsed.cleanReplyText).toBe(
      "Vou avisar o financeiro para acompanhar seu pagamento!"
    );
  });

  it("injects company identity, agent role and value proposition into prompt", () => {
    const config: GroundedAiConfig = {
      name: "Camila",
      personality: "empatico_acolhedor",
      strictMode: true,
      businessRules: {
        companyName: "Clínica DermaLuxe",
        agentRole: "Especialista em Avaliação Facial",
        valueProposition: "Transformação estética segura e natural",
      },
    };

    const prompt = buildGroundedSystemPrompt(config, []);

    expect(prompt).toContain("Você é Camila, Especialista em Avaliação Facial, atendente comercial oficial de WhatsApp da empresa Clínica DermaLuxe.");
    expect(prompt).toContain("<identidade_empresa>");
    expect(prompt).toContain("- Empresa / Marca: Clínica DermaLuxe");
    expect(prompt).toContain("- Cargo / Atuação: Especialista em Avaliação Facial");
    expect(prompt).toContain('Proposta de Valor: "Transformação estética segura e natural"');
  });

  it("injects real-time lead context with contact name and abandoned Pix recovery warning", () => {
    const config: GroundedAiConfig = {
      name: "Bia",
      personality: "cordial_comercial",
      strictMode: true,
      leadContext: {
        contactName: "Mariana Silva",
        contactPhone: "+5511999998888",
        lastPixStatus: "EXPIRED",
        lastPixAmountCents: 29700,
        isReturningCustomer: false,
      },
    };

    const prompt = buildGroundedSystemPrompt(config, []);

    expect(prompt).toContain("<contexto_do_lead>");
    expect(prompt).toContain("Nome do Cliente: Mariana Silva");
    expect(prompt).toContain("DIRETRIZ DE TRATAMENTO: Chame o cliente pelo primeiro nome");
    expect(prompt).toContain("ATENÇÃO DE VENDA: Este cliente possui uma cobrança Pix recente em aberto/expirada no valor de");
    expect(prompt).toContain("297,00");
  });

  it("injects objection shield matrix with price, hesitation, guarantee and timeline scripts", () => {
    const config: GroundedAiConfig = {
      name: "Lucas",
      personality: "especialista_consultivo",
      strictMode: true,
      businessRules: {
        objections: {
          priceDiscount: "Oferecemos 5% de desconto exclusivo para pagamento no Pix à vista.",
          thinkAboutIt: "As vagas com bônus expiram hoje às 23h59.",
          guaranteeTrust: "Garantia incondicional de 7 dias com devolução total.",
          deliveryTimeline: "Acesso liberado no mesmo minuto da confirmação do Pix.",
        },
      },
    };

    const prompt = buildGroundedSystemPrompt(config, []);

    expect(prompt).toContain("<matriz_de_objecoes>");
    expect(prompt).toContain("[Se o cliente disser que está caro ou pedir desconto]:");
    expect(prompt).toContain("Oferecemos 5% de desconto exclusivo para pagamento no Pix à vista.");
    expect(prompt).toContain("[Se o cliente disser que vai pensar ou falar com outra pessoa]:");
    expect(prompt).toContain("As vagas com bônus expiram hoje às 23h59.");
    expect(prompt).toContain("[Se o cliente tiver dúvidas de garantia, segurança ou procedência]:");
    expect(prompt).toContain("[Se o cliente perguntar sobre prazos de entrega ou execução]:");
  });

  it("suggests contextual continuity and respects refusal instead of requiring a question in every answer", () => {
    const config: GroundedAiConfig = {
      name: "Rodrigo",
      personality: "direto_objetivo",
      strictMode: true,
      businessRules: {
        ctaRule: true,
        emojiDensity: "expressive",
      },
    };

    const prompt = buildGroundedSystemPrompt(config, []);

    expect(prompt).toContain("<regras_de_ouro_whatsapp>");
    expect(prompt).toContain("Não repita perguntas já respondidas, não pressione quem quer pensar");
    expect(prompt).toContain("sem excesso ou repetição");
  });
  it('withholds catalog content and Pix protocol without explicit permissions',()=>{
    const config:GroundedAiConfig={name:'SIM',personality:'cordial_comercial',strictMode:true};
    const prompt=buildGroundedSystemPrompt(config,[{id:'SIM_PRIVATE_ID',title:'SIM_PRIVATE_TITLE',priceCents:12345}]);
    expect(prompt).not.toContain('SIM_PRIVATE_ID');expect(prompt).not.toContain('SIM_PRIVATE_TITLE');expect(prompt).not.toContain('<fechamento_comercial_pix>');expect(prompt).toContain('Catálogo não disponibilizado');
  });
  it('allows billing context without authorizing catalog offers or pretending to execute other functions',()=>{
    const prompt=buildGroundedSystemPrompt({name:'SIM',personality:'cordial_comercial',strictMode:true,skills:{pix_charges:true,appointments:true,qualify_lead:true,capi_tracking:true}},[{id:'SIM_PRODUCT',title:'SIM_ITEM',priceCents:10000}]);
    expect(prompt).toContain('SIM_ITEM');expect(prompt).toContain('destinam-se somente à cobrança');expect(prompt).toContain('esta chamada não executa essas ações');expect(prompt).toContain('não permitido; não ofereça produtos');
  });

  it('extracts a quantity for the confirmation summary while keeping legacy markers at one unit',()=>{
    expect(parseAiResponse('SIM [OFFER_PIX: prod-1; QTY=3]')).toMatchObject({offerPixProductId:'prod-1',offerPixQuantity:3,cleanReplyText:'SIM'});
    expect(parseAiResponse('[OFFER_PIX: prod-1]').offerPixQuantity).toBe(1);
    expect(Number.isNaN(parseAiResponse('[OFFER_PIX: prod-1; QTY=abc]').offerPixQuantity)).toBe(true);
  });

  it('matches optional moderate emoji guidance and permits a natural closing when continuity is off',()=>{
    const prompt=buildGroundedSystemPrompt({name:'SIM',personality:'direto_objetivo',strictMode:true,businessRules:{ctaRule:false,emojiDensity:'moderate'}},[]);
    expect(prompt).toContain('zero a 2 emojis');expect(prompt).toContain('Não acrescente uma pergunta de continuidade por padrão');expect(prompt).not.toContain('TODA mensagem');expect(prompt).toContain('não autorizam inventar condições');
  });

});

