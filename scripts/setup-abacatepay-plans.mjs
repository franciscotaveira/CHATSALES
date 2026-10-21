/**
 * Script Soberano para Criação e Gestão de Planos SOS Vendas no AbacatePay
 * MCT OS v2.0 - Truth in Data
 * 
 * Uso:
 *   node scripts/setup-abacatepay-plans.mjs <ABACATEPAY_API_KEY>
 * ou:
 *   ABACATEPAY_API_KEY=aba_xxx node scripts/setup-abacatepay-plans.mjs
 */

import fs from "node:fs";
import path from "node:path";

const apiKey = process.argv[2] || process.env.ABACATEPAY_API_KEY;

if (!apiKey) {
  console.error("❌ ERRO: Chave da API do AbacatePay não fornecida.");
  console.error("Uso: node scripts/setup-abacatepay-plans.mjs <ABACATEPAY_API_KEY>");
  process.exit(1);
}

const BASE_URL = "https://api.abacatepay.com/v2";

const PLANS = [
  {
    id: "chatsales-anual-pix-1080",
    title: "Chat Sales - Plano Anual (Pix)",
    amountCents: 108000, // R$ 1.080,00
    description: "Licença anual Chat Sales com 10% de desconto via Pix (R$ 1.080,00)",
    methods: ["PIX"]
  },
  {
    id: "chatsales-anual-cartao-1200",
    title: "Chat Sales - Plano Anual (Cartão)",
    amountCents: 120000, // R$ 1.200,00
    description: "Licença anual Chat Sales em até 12x no cartão de crédito (R$ 1.200,00)",
    methods: ["CARD", "PIX"],
    card: { maxInstallments: 12 }
  },
  {
    id: "chatsales-semestral-pix-570",
    title: "Chat Sales - Plano Semestral (Pix)",
    amountCents: 57000, // R$ 570,00
    description: "Licença semestral Chat Sales com 5% de desconto via Pix (R$ 570,00)",
    methods: ["PIX"]
  },
  {
    id: "chatsales-semestral-cartao-600",
    title: "Chat Sales - Plano Semestral (Cartão)",
    amountCents: 60000, // R$ 600,00
    description: "Licença semestral Chat Sales em até 6x no cartão de crédito (R$ 600,00)",
    methods: ["CARD", "PIX"],
    card: { maxInstallments: 6 }
  }
];

async function ensureProductAndCheckout(plan) {
  console.log(`\n📦 Verificando/Criando produto: ${plan.title}...`);
  
  // 1. Criar Produto na v2 se não existir
  let productId = null;
  const prodRes = await fetch(`${BASE_URL}/products/create`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      externalId: plan.id,
      name: plan.title,
      price: plan.amountCents,
      currency: "BRL",
      description: plan.description
    })
  });

  if (prodRes.ok) {
    const prodJson = await prodRes.json();
    productId = prodJson.data?.id;
    console.log(`✅ Produto criado com sucesso: ${productId}`);
  } else {
    // Se já existia, busca na listagem
    const listRes = await fetch(`${BASE_URL}/products/list`, {
      headers: { "Authorization": `Bearer ${apiKey.trim()}` }
    });
    if (listRes.ok) {
      const listJson = await listRes.json();
      const existing = (listJson.data || []).find(p => p.externalId === plan.id);
      if (existing) {
        productId = existing.id;
        console.log(`ℹ️ Produto já existente reaproveitado: ${productId}`);
      }
    }
  }

  if (!productId) {
    console.error(`❌ Não foi possível obter o ID do produto para ${plan.id}`);
    return null;
  }

  // 2. Criar Checkout na v2
  console.log(`🛒 Gerando link de checkout para ${plan.title}...`);
  const checkoutPayload = {
    items: [{ id: productId, quantity: 1 }],
    methods: plan.methods,
    externalId: `checkout-${plan.id}`,
    returnUrl: "https://automatizaprocessos.tech",
    completionUrl: "https://chat.automatizaprocessos.tech",
    ...(plan.card ? { card: plan.card } : {})
  };

  const checkRes = await fetch(`${BASE_URL}/checkouts/create`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(checkoutPayload)
  });

  if (!checkRes.ok) {
    const errText = await checkRes.text();
    console.error(`❌ Falha ao criar checkout: ${errText}`);
    return null;
  }

  const checkJson = await checkRes.json();
  const data = checkJson.data;
  console.log(`✅ Checkout criado: ${data.id}`);
  console.log(`🔗 Link de pagamento: ${data.url}`);

  return {
    planId: plan.id,
    title: plan.title,
    productId,
    billingId: data.id,
    url: data.url,
    amountCents: plan.amountCents
  };
}

async function main() {
  console.log("🚀 Iniciando configuração de planos SOS Vendas no AbacatePay...");
  console.log(`🔑 Chave informada: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

  const results = [];
  for (const plan of PLANS) {
    const res = await ensureProductAndCheckout(plan);
    if (res) results.push(res);
  }

  if (results.length === 0) {
    console.error("\n❌ Nenhum plano pôde ser criado. Verifique a chave de API.");
    process.exit(1);
  }

  console.log("\n📋 RESUMO DOS LINKS GERADOS:");
  console.table(results.map(r => ({
    Plano: r.planId,
    Valor: (r.amountCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    Link: r.url
  })));

  // Grava arquivo de manifesto com os links para fácil injeção
  const outPath = path.resolve("landing/abacatepay-links.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf8");
  console.log(`\n💾 Salvo manifesto de links em: ${outPath}`);
}

main();
