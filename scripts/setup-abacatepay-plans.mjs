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

const BASE_URL = "https://api.abacatepay.com/v1";

const PLANS = [
  {
    id: "sos-vendas-anual-pix",
    title: "SOS Vendas - Plano Anual (10% OFF no Pix)",
    amountCents: 108000, // R$ 1.080,00
    description: "Acesso total de 12 meses ao SOS Vendas: Cockpit comercial, automações, funis, IA comercial e cobrança Pix nativa.",
    frequency: "ONE_TIME",
    methods: ["PIX"],
    metadata: {
      planId: "anual_pix",
      intervalMonths: "12",
      nominalYearlyPrice: "1200",
      discountApplied: "10%",
      effectiveMonthlyPrice: "90.00"
    }
  },
  {
    id: "sos-vendas-semestral-pix",
    title: "SOS Vendas - Plano Semestral (5% OFF no Pix)",
    amountCents: 57000, // R$ 570,00
    description: "Acesso total de 6 meses ao SOS Vendas: Cockpit comercial, automações, funis, IA comercial e cobrança Pix nativa.",
    frequency: "ONE_TIME",
    methods: ["PIX"],
    metadata: {
      planId: "semestral_pix",
      intervalMonths: "6",
      nominalYearlyPrice: "1200",
      nominalSemesterPrice: "600",
      discountApplied: "5%",
      effectiveMonthlyPrice: "95.00"
    }
  }
];

async function createBilling(plan) {
  console.log(`\n📦 Criando produto/cobrança: ${plan.title}...`);
  
  const payload = {
    frequency: plan.frequency,
    methods: plan.methods,
    products: [
      {
        externalId: plan.id,
        name: plan.title,
        quantity: 1,
        price: plan.amountCents,
        description: plan.description
      }
    ],
    returnUrl: "https://chat.automatizaprocessos.tech",
    completionUrl: "https://chat.automatizaprocessos.tech",
    metadata: plan.metadata
  };

  try {
    const res = await fetch(`${BASE_URL}/billing/create`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "User-Agent": "MCT-SOSVendas/2.0"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`HTTP ${res.status}: ${errBody}`);
    }

    const json = await res.json();
    const data = json.data || json;
    
    console.log(`✅ Sucesso! ID: ${data.id}`);
    console.log(`🔗 Link de Pagamento (Checkout): ${data.url}`);
    
    return {
      planId: plan.id,
      billingId: data.id,
      url: data.url,
      amountCents: plan.amountCents
    };
  } catch (err) {
    console.error(`❌ Falha ao criar plano ${plan.id}:`, err.message);
    return null;
  }
}

async function main() {
  console.log("🚀 Iniciando configuração de planos SOS Vendas no AbacatePay...");
  console.log(`🔑 Chave informada: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

  const results = [];
  for (const plan of PLANS) {
    const res = await createBilling(plan);
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
