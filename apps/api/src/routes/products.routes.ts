import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listProducts,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listProductsQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

const createProductBodySchema = z.object({
  stockPolicy:z.enum(["review_required","not_required"]).optional(),
  createOnly:z.boolean().optional(),
  expectedProductId:z.string().uuid().optional(),
  expectedUpdatedAt:z.string().datetime().optional(),
  catalogId: z.string().min(1).default("meta_catalog_default"),
  retailerId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/, "O código do produto (SKU) deve ser alfanumérico com hífens ou underscores"),
  title: z.string().min(1).max(120),
  subtitle: z.string().max(255).nullable().optional(),
  description: z.string().min(1).max(1024),
  priceCents: z.number().int().min(0).max(2147483647),
  currency: z.string().length(3).default("BRL"),
  category: z.string().min(1).default("Geral"),
  imageUrl: z.string().url(),
  badge: z.string().max(40).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "OUT_OF_STOCK"]).default("ACTIVE"),
  isFeatured: z.boolean().default(false),
});

export const productsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List only products explicitly registered for this workspace.
  app.get(
    "/v1/workspaces/:workspaceId/products",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedQuery = listProductsQuerySchema.safeParse(request.query);
      if (!parsedQuery.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid query parameters",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { category, search } = parsedQuery.data;

      const products = await withTenantTransaction(workspaceId, async (client) => {
        return listProducts(client, workspaceId, { category, search });
      });

      return reply.status(200).send({
        products: products.map((p) => {
          const priceFormatted = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: p.currency,
          }).format(p.price_cents / 100);

          return {
            id: p.id,
            workspaceId: p.workspace_id,
            catalogId: p.catalog_id,
            retailerId: p.retailer_id,
            title: p.title,
            subtitle: p.subtitle,
            description: p.description,
            priceCents: p.price_cents,
            priceFormatted,
            currency: p.currency,
            category: p.category,
            imageUrl: p.image_url,
            badge: p.badge,
            status: p.status,
            isFeatured: p.is_featured,stockPolicy:p.stock_policy??"review_required",
            createdAt: p.created_at.toISOString(),
            updatedAt: p.updated_at.toISOString(),
          };
        }),
        total: products.length,
      });
    }
  );

  // 2. Register new product in catalog
  app.post(
    "/v1/workspaces/:workspaceId/products",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const parsedParams = workspaceParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Invalid workspaceId parameter",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parsedBody = createProductBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues[0]?.message || "Invalid product payload",
          errors: parsedBody.error.issues,
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const body = parsedBody.data;
      if(body.stockPolicy!==undefined){await app.requirePermission("workspace:manage")(request,reply);if(reply.sent)return;}
      if(body.createOnly&&body.expectedProductId)return reply.status(400).send({detail:"Não é possível criar e editar o produto na mesma solicitação."});

      const created = await withTenantTransaction(workspaceId, async (client) => {
        const previous=(await client.query("SELECT id,title,description,category,stock_policy,updated_at FROM products WHERE workspace_id=$1 AND retailer_id=$2 FOR UPDATE",[workspaceId,body.retailerId])).rows[0];
        if(previous&&body.stockPolicy!==undefined&&!body.createOnly){if(!body.expectedUpdatedAt||!body.expectedProductId)throw Object.assign(new Error('Carregue o produto atual antes de alterar a validação de disponibilidade.'),{statusCode:428});if(body.expectedProductId!==previous.id||body.expectedUpdatedAt!==previous.updated_at.toISOString())return null;}
        if(body.expectedProductId){
          const current=await client.query("SELECT id,retailer_id,updated_at FROM public.products WHERE workspace_id=$1 AND id=$2 FOR UPDATE",[workspaceId,body.expectedProductId]);
          if(!current.rows[0]||current.rows[0].retailer_id!==body.retailerId||(body.expectedUpdatedAt&&current.rows[0].updated_at.toISOString()!==body.expectedUpdatedAt))return null;
        }
        const result = await client.query(
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
            is_featured,stock_policy
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,COALESCE($15::text,'review_required'))
          ON CONFLICT (workspace_id, retailer_id) DO UPDATE SET
            title = EXCLUDED.title,
            subtitle = EXCLUDED.subtitle,
            description = EXCLUDED.description,
            price_cents = EXCLUDED.price_cents,
            currency = EXCLUDED.currency,
            category = EXCLUDED.category,
            image_url = EXCLUDED.image_url,
            badge = EXCLUDED.badge,
            status = EXCLUDED.status,
            is_featured = EXCLUDED.is_featured,
            stock_policy=CASE WHEN $15::text IS NOT NULL THEN $15::text WHEN products.title IS DISTINCT FROM EXCLUDED.title OR products.description IS DISTINCT FROM EXCLUDED.description OR products.category IS DISTINCT FROM EXCLUDED.category THEN 'review_required' ELSE products.stock_policy END,
            updated_at = GREATEST(clock_timestamp(),products.updated_at+interval '1 millisecond')
          WHERE NOT $14::boolean
          RETURNING *
        `,
          [
            workspaceId,
            body.catalogId,
            body.retailerId,
            body.title,
            body.subtitle ?? null,
            body.description,
            body.priceCents,
            body.currency,
            body.category,
            body.imageUrl,
            body.badge ?? null,
            body.status,
            body.isFeatured,
            body.createOnly??false,
            body.stockPolicy??null,
          ]
        );
        const saved=result.rows[0];
        if(saved&&(body.stockPolicy!==undefined||previous?.stock_policy!==saved.stock_policy))await client.query(`INSERT INTO audit_events(workspace_id,actor_id,actor_type,action,resource_type,resource_id,metadata) VALUES($1,$2,'human','product.availability_policy_updated','product',$3,$4::jsonb)`,[workspaceId,request.user!.id,saved.id,JSON.stringify({previous:previous?.stock_policy??null,stockPolicy:saved.stock_policy,reason:body.stockPolicy!==undefined?'explicit_configuration':'product_identity_changed'})]);
        return saved;
      });

      if(!created)return reply.status(409).send({type:"https://sos-sales.mct.br/errors/conflict",title:"Conflict",status:409,detail:body.createOnly?"Este SKU já está cadastrado. Abra o produto existente para editar.":"O produto foi alterado ou removido. Atualize o catálogo e confira os dados antes de salvar.",instance:request.url,correlationId:request.id});
      const priceFormatted = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: created.currency,
      }).format(Number(created.price_cents) / 100);

      return reply.status(201).send({
        product: {
          id: created.id,
          workspaceId: created.workspace_id,
          catalogId: created.catalog_id,
          retailerId: created.retailer_id,
          title: created.title,
          subtitle: created.subtitle,
          description: created.description,
          priceCents: Number(created.price_cents),
          priceFormatted,
          currency: created.currency,
          category: created.category,
          imageUrl: created.image_url,
          badge: created.badge,
          status: created.status,
          isFeatured: created.is_featured,stockPolicy:created.stock_policy??"review_required",
          createdAt: created.created_at.toISOString(),
          updatedAt: created.updated_at.toISOString(),
        },
      });
    }
  );
};
