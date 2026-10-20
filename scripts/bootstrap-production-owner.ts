/**
 * bootstrap-production-owner.ts
 *
 * Script soberano e idempotente para provisionamento do usuário proprietário,
 * organização mestre, workspace principal e catálogo inicial no SOS Sales V3.
 *
 * Uso:
 *   pnpm tsx scripts/bootstrap-production-owner.ts
 *   pnpm tsx scripts/bootstrap-production-owner.ts --password "MinhaSenhaForte2026!"
 */

import "dotenv/config";
import { Pool } from "pg";
import { hashPassword } from "@sos-sales/auth";

async function main() {
  const connectionString =
    process.env.MIGRATION_DATABASE_URL ||
    process.env.DATABASE_URL ||
    "postgresql://sos_user:sos_sales_master_2026@127.0.0.1:5432/sos_sales_v3?sslmode=disable";

  console.log("\n🚀 [Bootstrap Soberano] Conectando ao PostgreSQL...");
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    const rawPassword =
      process.argv.find((_, i, arr) => arr[i - 1] === "--password") ||
      process.env.BOOTSTRAP_PASSWORD ||
      "MctSoberana2026!";

    const ownerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || "francisco@mct.br").toLowerCase().trim();
    const ownerName = process.env.BOOTSTRAP_OWNER_NAME || "Francisco Rios";

    console.log(`\n1. Provisionando usuário proprietário: ${ownerEmail} (${ownerName})...`);
    const passwordHash = hashPassword(rawPassword);

    const userRes = await client.query<{ id: string }>(
      `INSERT INTO public.users (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
         updated_at = clock_timestamp()
       RETURNING id, email, name;`,
      [ownerEmail, ownerName, passwordHash]
    );

    const userId = userRes.rows[0]!.id;
    console.log(`   ✓ Usuário ID: ${userId}`);

    console.log("\n2. Provisionando Organização Mestre (MCT LTDA)...");
    const orgRes = await client.query<{ id: string }>(
      `INSERT INTO public.organizations (name, slug)
       VALUES ('MCT LTDA', 'mct-soberana')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, slug;`
    );
    const orgId = orgRes.rows[0]!.id;
    console.log(`   ✓ Organização ID: ${orgId}`);

    console.log("\n3. Provisionando Workspaces Canônicos...");
    const workspaces = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "SOS Sales · Sistema Operacional de Vendas",
        slug: "sos-sales-matriz",
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        name: "Haven Escovaria & Esmalteria",
        slug: "haven-escovaria",
      },
      {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Sora Ritual Spa · Headspa Japonês",
        slug: "sora-ritual-spa",
      },
    ];

    for (const ws of workspaces) {
      await client.query(
        `INSERT INTO public.workspaces (id, organization_id, name, slug, timezone, currency, is_active)
         VALUES ($1, $2, $3, $4, 'America/Sao_Paulo', 'BRL', true)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           is_active = true,
           updated_at = clock_timestamp();`,
        [ws.id, orgId, ws.name, ws.slug]
      );

      // Vincular membership como owner
      await client.query(
        `INSERT INTO public.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')
         ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';`,
        [ws.id, userId]
      );
      console.log(`   ✓ Workspace '${ws.name}' (${ws.id}) ativado com proprietário vinculado.`);
    }

    console.log("\n4. Garantindo Produtos Iniciais no Catálogo...");
    const products = [
      {
        workspaceId: "11111111-1111-1111-1111-111111111111",
        title: "Implantação Comercial WhatsApp V3",
        sku: "MCT-SOS-001",
        priceCents: 199700,
        pixDiscountPercent: 10,
        description: "Setup completo do SOS Sales V3 com WABA oficial, WAHA e agentes de IA integrados.",
      },
      {
        workspaceId: "11111111-1111-1111-1111-111111111111",
        title: "Mentoria Vendas Conversacionais Soberanas",
        sku: "MCT-MENT-002",
        priceCents: 99700,
        pixDiscountPercent: 5,
        description: "Mentoria prática de condução e fechamento de vendas de alto ticket no WhatsApp.",
      },
    ];

    for (const p of products) {
      await client.query(
        `INSERT INTO public.products (
           workspace_id, title, sku, price_cents, pix_discount_percent, description, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (workspace_id, sku) DO UPDATE SET
           title = EXCLUDED.title,
           price_cents = EXCLUDED.price_cents,
           pix_discount_percent = EXCLUDED.pix_discount_percent,
           is_active = true,
           updated_at = clock_timestamp();`,
        [p.workspaceId, p.title, p.sku, p.priceCents, p.pixDiscountPercent, p.description]
      );
      console.log(`   ✓ Produto '${p.title}' (${p.sku}) configurado.`);
    }

    console.log("\n🎉 [Bootstrap Concluído com Sucesso!]");
    console.log(`   Acesse: https://chat.automatizaprocessos.tech`);
    console.log(`   Login:  ${ownerEmail}`);
    console.log(`   Papel:  Owner / Proprietário Mestre\n`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ Erro fatal no bootstrap:", err);
  process.exit(1);
});
