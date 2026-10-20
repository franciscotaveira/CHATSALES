import type { PoolClient } from "pg";

export type ProductStatus = "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";

export interface ProductRecord {
  id: string;
  workspace_id: string;
  catalog_id: string;
  retailer_id: string;
  title: string;
  subtitle: string | null;
  description: string;
  price_cents: number;
  currency: string;
  category: string;
  image_url: string;
  badge: string | null;
  status: ProductStatus;
  stock_policy?:"review_required"|"not_required";
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CanonicalMasterProduct {
  catalog_id: string;
  retailer_id: string;
  title: string;
  subtitle: string;
  description: string;
  price_cents: number;
  currency: string;
  category: string;
  image_url: string;
  badge: string;
  status: ProductStatus;
  is_featured: boolean;
}

export const CANONICAL_MASTER_PRODUCTS: CanonicalMasterProduct[] = [
  {
    catalog_id: "meta_catalog_default",
    retailer_id: "SOS-PRO-ANUAL",
    title: "Plano Anual — Aceleração Comercial",
    subtitle: "A esteira completa para escalar suas vendas no WhatsApp",
    description: "Acesso total à plataforma SOS Sales V3 com gestão de funil, formulários nativos no WhatsApp e esteira de fechamento automatizada.",
    price_cents: 149700, // R$ 1.497,00
    currency: "BRL",
    category: "Planos & Assinaturas",
    image_url: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&auto=format&fit=crop&q=80",
    badge: "Mais Vendido 🏆",
    status: "ACTIVE",
    is_featured: true,
  },
  {
    catalog_id: "meta_catalog_default",
    retailer_id: "SOS-MENTORIA-VIP",
    title: "Mentoria Executiva VIP em Vendas",
    subtitle: "Acompanhamento individual para estruturar sua máquina de vendas",
    description: "4 sessões individuais de 1h30 com especialista sênior para desenhar scripts de alta conversão, funis no WhatsApp e processos comerciais.",
    price_cents: 350000, // R$ 3.500,00
    currency: "BRL",
    category: "Serviços & Consultoria",
    image_url: "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&auto=format&fit=crop&q=80",
    badge: "Vagas Limitadas ⭐",
    status: "ACTIVE",
    is_featured: true,
  },
  {
    catalog_id: "meta_catalog_default",
    retailer_id: "SOS-SETUP-WABA",
    title: "Setup Oficial WhatsApp Business API",
    subtitle: "Configuração completa da API oficial da Meta sem risco de bloqueio",
    description: "Homologação do seu número de telefone corporativo, verificação da empresa no Meta Business Manager, templates comerciais aprovados e integração outbox.",
    price_cents: 89000, // R$ 890,00
    currency: "BRL",
    category: "Serviços & Consultoria",
    image_url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&auto=format&fit=crop&q=80",
    badge: "Essencial ⚡",
    status: "ACTIVE",
    is_featured: true,
  },
  {
    catalog_id: "meta_catalog_default",
    retailer_id: "SOS-ACADEMY-FECHAMENTO",
    title: "Treinamento Fechamento Ágil & Objeções",
    subtitle: "Capacitação prática para o seu time comercial fechar mais rápido",
    description: "Mais de 30 aulas práticas com simulações reais de contorno de objeções de preço, tempo e autoridade pelo WhatsApp.",
    price_cents: 49700, // R$ 497,00
    currency: "BRL",
    category: "Capacitação & Cursos",
    image_url: "https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&auto=format&fit=crop&q=80",
    badge: "Certificado Incluso 🎓",
    status: "ACTIVE",
    is_featured: false,
  },
];

export async function listProducts(
  client: PoolClient,
  workspaceId: string,
  options?: { category?: string; search?: string }
): Promise<ProductRecord[]> {
  let query = `
    SELECT 
      id,
      workspace_id,
      catalog_id,
      retailer_id,
      title,
      subtitle,
      description,
      price_cents,
      currency,
      category,
      image_url,
      badge,
      status,
      is_featured,
      created_at,
      updated_at
    FROM public.products
    WHERE workspace_id = $1
  `;
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;

  if (options?.category && options.category !== "ALL") {
    query += ` AND category = $${paramIdx}`;
    params.push(options.category);
    paramIdx++;
  }

  if (options?.search && options.search.trim().length > 0) {
    query += ` AND (title ILIKE $${paramIdx} OR description ILIKE $${paramIdx} OR retailer_id ILIKE $${paramIdx})`;
    params.push(`%${options.search.trim()}%`);
    paramIdx++;
  }

  query += ` ORDER BY is_featured DESC, title ASC`;

  const result = await client.query(query, params);
  return result.rows.map((row) => ({
    ...row,
    price_cents: Number(row.price_cents),
  }));
}

export async function getProductByRetailerId(
  client: PoolClient,
  workspaceId: string,
  retailerId: string
): Promise<ProductRecord | null> {
  const result = await client.query(
    `
    SELECT 
      id,
      workspace_id,
      catalog_id,
      retailer_id,
      title,
      subtitle,
      description,
      price_cents,
      currency,
      category,
      image_url,
      badge,
      status,
      is_featured,
      created_at,
      updated_at
    FROM public.products
    WHERE workspace_id = $1 AND retailer_id = $2
    LIMIT 1
  `,
    [workspaceId, retailerId]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    ...row,
    price_cents: Number(row.price_cents),
  };
}

export async function seedCanonicalProductsIfEmpty(
  client: PoolClient,
  workspaceId: string
): Promise<ProductRecord[]> {
  const existing = await listProducts(client, workspaceId);
  if (existing.length > 0) {
    return existing;
  }

  for (const prod of CANONICAL_MASTER_PRODUCTS) {
    await client.query(
      `
      INSERT INTO public.products (
        workspace_id,
        catalog_id,
        retailer_id,
        title,
        subtitle,
        description,
        price_cents,
        currency,
        category,
        image_url,
        badge,
        status,
        is_featured
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (workspace_id, retailer_id) DO NOTHING
    `,
      [
        workspaceId,
        prod.catalog_id,
        prod.retailer_id,
        prod.title,
        prod.subtitle,
        prod.description,
        prod.price_cents,
        prod.currency,
        prod.category,
        prod.image_url,
        prod.badge,
        prod.status,
        prod.is_featured,
      ]
    );
  }

  return listProducts(client, workspaceId);
}
