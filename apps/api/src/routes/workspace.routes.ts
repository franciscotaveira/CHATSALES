import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { withTenantTransaction, getDatabasePool } from "@sos-sales/database";
import { hashPassword } from "@sos-sales/auth";
import { z } from "zod";

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const createWorkspaceSchema = z.object({
  name: z.string().min(2, "O nome da empresa deve ter pelo menos 2 caracteres").max(100),
  ownerName: z.string().min(2, "O nome do proprietário deve ter pelo menos 2 caracteres").max(100),
  ownerEmail: z.string().email("E-mail inválido"),
  initialPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres").max(100).optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  defaultPixKey: z.string().min(3).max(100).optional().nullable(),
  defaultPixKeyType: z.enum(["cpf", "cnpj", "email", "phone", "random"]).optional().nullable(),
  defaultPixMerchantName: z
    .string()
    .transform((val) => (val ? val.trim().slice(0, 25) : val))
    .pipe(z.string().min(2).max(25))
    .optional()
    .nullable(),
  defaultPixMerchantCity: z
    .string()
    .transform((val) => (val ? val.trim().slice(0, 15) : val))
    .pipe(z.string().min(2).max(15))
    .optional()
    .nullable(),
});

const addMemberSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "manager", "operator"]),
  password: z.string().min(6).max(100).optional(),
});

const updateMemberSchema = z.object({
  role: z.enum(["admin", "manager", "operator"]).optional(),
  password: z.string().min(6).max(100).optional(),
});

export const workspaceRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/workspaces/:workspaceId — view workspace details (requires workspace:view)
  app.get(
    "/v1/workspaces/:workspaceId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:view"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;

      const workspace = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          name: string;
          slug: string;
          timezone: string;
          currency: string;
          is_active: boolean;
          default_pix_key: string | null;
          default_pix_key_type: string | null;
          default_pix_merchant_name: string | null;
          default_pix_merchant_city: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `SELECT id, name, slug, timezone, currency, is_active,
                  default_pix_key, default_pix_key_type, default_pix_merchant_name, default_pix_merchant_city,
                  created_at, updated_at
           FROM workspaces
           WHERE id = $1`,
          [workspaceId]
        );
        return res.rows[0];
      });

      if (!workspace) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Workspace not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const activeRole = request.activeRole || "owner";
      const permissions =
        activeRole === "owner" || activeRole === "admin"
          ? [
              "workspace:view",
              "workspace:manage",
              "workspace:invite",
              "cockpit:access",
              "cockpit:send_message",
              "cockpit:handoff",
              "journey:view",
              "journey:transition_stage",
              "outcome:register",
              "integration:view",
              "integration:manage",
              "capi:dispatch",
              "audit:view",
            ]
          : activeRole === "manager"
          ? [
              "workspace:view",
              "workspace:invite",
              "cockpit:access",
              "cockpit:send_message",
              "cockpit:handoff",
              "journey:view",
              "journey:transition_stage",
              "outcome:register",
              "integration:view",
              "audit:view",
            ]
          : activeRole === "operator"
          ? [
              "cockpit:access",
              "cockpit:send_message",
              "cockpit:handoff",
              "journey:view",
              "journey:transition_stage",
              "outcome:register",
            ]
          : ["workspace:view", "journey:view", "integration:view", "audit:view"];

      return reply.status(200).send({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          timezone: workspace.timezone,
          currency: workspace.currency,
          isActive: workspace.is_active,
          status: workspace.is_active ? "active" : "inactive",
          defaultPixKey: workspace.default_pix_key,
          defaultPixKeyType: workspace.default_pix_key_type,
          defaultPixMerchantName: workspace.default_pix_merchant_name,
          defaultPixMerchantCity: workspace.default_pix_merchant_city,
          createdAt: workspace.created_at,
          updatedAt: workspace.updated_at,
        },
        membership: {
          role: activeRole,
        },
        userRole: activeRole,
        permissions,
      });
    }
  );

  // PATCH /v1/workspaces/:workspaceId — update workspace (requires workspace:manage)
  app.patch(
    "/v1/workspaces/:workspaceId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const parseResult = updateWorkspaceSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { name, defaultPixKey, defaultPixKeyType, defaultPixMerchantName, defaultPixMerchantCity } = parseResult.data;
      if (
        name === undefined &&
        defaultPixKey === undefined &&
        defaultPixKeyType === undefined &&
        defaultPixMerchantName === undefined &&
        defaultPixMerchantCity === undefined
      ) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "No fields provided to update",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        const updates: string[] = [];
        const values: unknown[] = [];
        let paramIdx = 1;

        if (name !== undefined) {
          updates.push(`name = $${paramIdx++}`);
          values.push(name);
        }
        if (defaultPixKey !== undefined) {
          updates.push(`default_pix_key = $${paramIdx++}`);
          values.push(defaultPixKey);
        }
        if (defaultPixKeyType !== undefined) {
          updates.push(`default_pix_key_type = $${paramIdx++}`);
          values.push(defaultPixKeyType);
        }
        if (defaultPixMerchantName !== undefined) {
          updates.push(`default_pix_merchant_name = $${paramIdx++}`);
          values.push(defaultPixMerchantName);
        }
        if (defaultPixMerchantCity !== undefined) {
          updates.push(`default_pix_merchant_city = $${paramIdx++}`);
          values.push(defaultPixMerchantCity);
        }

        updates.push("updated_at = NOW()");
        values.push(workspaceId);

        const res = await client.query<{
          id: string;
          name: string;
          slug: string;
          timezone: string;
          currency: string;
          is_active: boolean;
          default_pix_key: string | null;
          default_pix_key_type: string | null;
          default_pix_merchant_name: string | null;
          default_pix_merchant_city: string | null;
          created_at: string;
          updated_at: string;
        }>(
          `UPDATE workspaces
           SET ${updates.join(", ")}
           WHERE id = $${paramIdx}
           RETURNING id, name, slug, timezone, currency, is_active,
                     default_pix_key, default_pix_key_type, default_pix_merchant_name, default_pix_merchant_city,
                     created_at, updated_at`,
          values
        );
        return res.rows[0];
      });

      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Workspace not found",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        workspace: {
          id: updated.id,
          name: updated.name,
          slug: updated.slug,
          timezone: updated.timezone,
          currency: updated.currency,
          isActive: updated.is_active,
          status: updated.is_active ? "active" : "inactive",
          defaultPixKey: updated.default_pix_key,
          defaultPixKeyType: updated.default_pix_key_type,
          defaultPixMerchantName: updated.default_pix_merchant_name,
          defaultPixMerchantCity: updated.default_pix_merchant_city,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at,
        },
      });
    }
  );

  // GET /v1/workspaces/:workspaceId/members — list all team members in active workspace
  app.get(
    "/v1/workspaces/:workspaceId/members",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:view"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;

      const members = await withTenantTransaction(workspaceId, async (client) => {
        const res = await client.query<{
          id: string;
          user_id: string;
          email: string;
          name: string;
          role: string;
          created_at: string;
        }>(
          `SELECT 
             m.id,
             u.id as user_id,
             u.email,
             u.name,
             m.role,
             m.created_at
           FROM workspace_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = $1
           ORDER BY 
             CASE m.role 
               WHEN 'owner' THEN 1 
               WHEN 'admin' THEN 2 
               WHEN 'manager' THEN 3 
               WHEN 'operator' THEN 4 
               ELSE 5 
             END ASC,
             u.name ASC`,
          [workspaceId]
        );
        return res.rows;
      });

      return reply.status(200).send({
        members: members.map((m) => ({
          id: m.id,
          userId: m.user_id,
          name: m.name,
          email: m.email,
          role: m.role,
          joinedAt: m.created_at,
        })),
      });
    }
  );

  // POST /v1/workspaces/:workspaceId/members — invite or add member to workspace
  app.post(
    "/v1/workspaces/:workspaceId/members",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:invite"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const parseResult = addMemberSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { name, email, role, password } = parseResult.data;
      const normalizedEmail = email.trim().toLowerCase();

      try {
        const result = await withTenantTransaction(workspaceId, async (client) => {
          // 1. Check if user already exists in global users table
          const existingUserRes = await client.query<{
            id: string;
            email: string;
            name: string;
            password_hash: string | null;
          }>(
            `SELECT id, email, name, password_hash FROM users WHERE LOWER(email) = $1 LIMIT 1`,
            [normalizedEmail]
          );

          let userId: string;
          let userName = name.trim();
          let createdPassword = password ? password.trim() : "";

          const existingUser = existingUserRes.rows[0];
          if (existingUser) {
            userId = existingUser.id;
            userName = existingUser.name || userName;

            // Check if already member of THIS workspace
            const existingMemberRes = await client.query<{ id: string }>(
              `SELECT id FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2 LIMIT 1`,
              [workspaceId, userId]
            );

            if (existingMemberRes.rows.length > 0) {
              const err = new Error("ALREADY_MEMBER");
              throw err;
            }

            // If a new password is provided, update it
            if (password) {
              const hashed = hashPassword(password.trim());
              await client.query(
                `UPDATE users SET password_hash = $1 WHERE id = $2`,
                [hashed, userId]
              );
            }
          } else {
            // New user registration
            if (!createdPassword) {
              createdPassword = crypto.randomBytes(6).toString("base64url");
            }
            const hashed = hashPassword(createdPassword);

            const newUserRes = await client.query<{ id: string; email: string; name: string }>(
              `INSERT INTO users (email, name, password_hash)
               VALUES ($1, $2, $3)
               RETURNING id, email, name`,
              [normalizedEmail, userName, hashed]
            );
            const newUser = newUserRes.rows[0];
            if (!newUser) {
              throw new Error("FAILED_TO_CREATE_USER");
            }
            userId = newUser.id;
          }

          // 2. Insert workspace membership
          const insMemberRes = await client.query<{ id: string; created_at: string }>(
            `INSERT INTO workspace_memberships (workspace_id, user_id, role)
             VALUES ($1, $2, $3)
             RETURNING id, created_at`,
            [workspaceId, userId, role]
          );

          const membership = insMemberRes.rows[0];
          if (!membership) {
            throw new Error("FAILED_TO_CREATE_MEMBERSHIP");
          }

          return {
            member: {
              id: membership.id,
              userId,
              name: userName,
              email: normalizedEmail,
              role,
              joinedAt: membership.created_at,
            },
            initialPassword: createdPassword || undefined,
          };
        });

        return reply.status(201).send(result);
      } catch (err: unknown) {
        if ((err as Error).message === "ALREADY_MEMBER") {
          return reply.status(409).send({
            type: "https://sos-sales.mct.br/errors/conflict",
            title: "Conflict",
            status: 409,
            detail: "Este e-mail já pertence à equipe desta empresa",
            instance: request.url,
            correlationId: request.id,
          });
        }
        throw err;
      }
    }
  );

  // PATCH /v1/workspaces/:workspaceId/members/:memberId — update member role or password
  app.patch(
    "/v1/workspaces/:workspaceId/members/:memberId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const { memberId } = request.params as { memberId: string };
      const parseResult = updateMemberSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { role, password } = parseResult.data;
      if (!role && !password) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: "Informe ao menos a nova role ou nova senha",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        // Find membership by membership ID or user ID
        const targetRes = await client.query<{
          id: string;
          user_id: string;
          role: string;
        }>(
          `SELECT id, user_id, role 
           FROM workspace_memberships 
           WHERE workspace_id = $1 AND (id = $2::uuid OR user_id = $2::uuid)
           LIMIT 1`,
          [workspaceId, memberId]
        );

        const target = targetRes.rows[0];
        if (!target) {
          return null;
        }

        // Owner protection: cannot demote owner unless caller is owner
        if (target.role === "owner" && role) {
          const callerRole = request.activeRole || "owner";
          if (callerRole !== "owner") {
            const err = new Error("CANNOT_MODIFY_OWNER");
            throw err;
          }
        }

        if (role) {
          await client.query(
            `UPDATE workspace_memberships SET role = $1 WHERE id = $2`,
            [role, target.id]
          );
        }

        if (password) {
          const hashed = hashPassword(password.trim());
          await client.query(
            `UPDATE users SET password_hash = $1 WHERE id = $2`,
            [hashed, target.user_id]
          );
        }

        const refreshed = await client.query<{
          id: string;
          user_id: string;
          name: string;
          email: string;
          role: string;
          created_at: string;
        }>(
          `SELECT m.id, u.id as user_id, u.name, u.email, m.role, m.created_at
           FROM workspace_memberships m
           JOIN users u ON u.id = m.user_id
           WHERE m.id = $1`,
          [target.id]
        );

        return refreshed.rows[0] || null;
      });

      if (!updated) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Membro não encontrado nesta empresa",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        member: {
          id: updated.id,
          userId: updated.user_id,
          name: updated.name,
          email: updated.email,
          role: updated.role,
          joinedAt: updated.created_at,
        },
      });
    }
  );

  // DELETE /v1/workspaces/:workspaceId/members/:memberId — remove member from workspace
  app.delete(
    "/v1/workspaces/:workspaceId/members/:memberId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("workspace:manage"),
      ],
    },
    async (request, reply) => {
      const workspaceId = request.workspaceId!;
      const { memberId } = request.params as { memberId: string };

      const removed = await withTenantTransaction(workspaceId, async (client) => {
        const targetRes = await client.query<{
          id: string;
          user_id: string;
          role: string;
        }>(
          `SELECT id, user_id, role 
           FROM workspace_memberships 
           WHERE workspace_id = $1 AND (id = $2::uuid OR user_id = $2::uuid)
           LIMIT 1`,
          [workspaceId, memberId]
        );

        const target = targetRes.rows[0];
        if (!target) {
          return null;
        }

        if (target.role === "owner") {
          const err = new Error("CANNOT_REMOVE_OWNER");
          throw err;
        }

        if (target.user_id === request.user.id) {
          const err = new Error("CANNOT_REMOVE_SELF");
          throw err;
        }

        await client.query(`DELETE FROM workspace_memberships WHERE id = $1`, [target.id]);
        return true;
      });

      if (!removed) {
        return reply.status(404).send({
          type: "https://sos-sales.mct.br/errors/not-found",
          title: "Not Found",
          status: 404,
          detail: "Membro não encontrado nesta empresa",
          instance: request.url,
          correlationId: request.id,
        });
      }

      return reply.status(200).send({
        success: true,
        message: "Membro removido da empresa com sucesso",
      });
    }
  );

  // POST /v1/workspaces — create new workspace/company (requires owner privileges)
  app.post(
    "/v1/workspaces",
    {
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      // Security check: Only authenticated users with 'owner' role in at least one workspace can provision new companies
      const isOwner =
        (request.memberships || []).some((m) => m.role === "owner") ||
        request.activeRole === "owner" ||
        request.user?.role === "owner";

      if (!isOwner) {
        return reply.status(403).send({
          type: "https://sos-sales.mct.br/errors/forbidden",
          title: "Forbidden",
          status: 403,
          detail: "Apenas proprietários (owners) têm permissão para criar novas empresas.",
          instance: request.url,
          correlationId: request.id,
        });
      }

      const parseResult = createWorkspaceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parseResult.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { name, ownerName, ownerEmail, initialPassword } = parseResult.data;
      const cleanEmail = ownerEmail.trim().toLowerCase();
      const cleanName = name.trim();
      const cleanOwnerName = ownerName.trim();
      const tempPassword = initialPassword?.trim() || "MctSoberana2026!";

      const baseSlug = slugify(cleanName);
      let targetSlug = baseSlug || `empresa-${Date.now().toString(36)}`;

      const pool = getDatabasePool();
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        // 1. Resolve unique slug
        const slugCheck = await client.query("SELECT id FROM workspaces WHERE slug = $1", [targetSlug]);
        if (slugCheck.rows.length > 0) {
          targetSlug = `${targetSlug}-${Date.now().toString(36).slice(-4)}`;
        }

        // 2. Organization
        const orgSlug = `${targetSlug}-org`;
        const orgRes = await client.query<{ id: string; name: string }>(
          `INSERT INTO organizations (id, name, slug, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, clock_timestamp(), clock_timestamp())
           RETURNING id, name`,
          [cleanName, orgSlug]
        );
        const orgId = orgRes.rows[0]!.id;

        // 3. Workspace
        const wsRes = await client.query<{ id: string; name: string; slug: string }>(
          `INSERT INTO workspaces (
             id, organization_id, name, slug, timezone, currency, is_active, radar_enabled, created_at, updated_at
           )
           VALUES (
             gen_random_uuid(), $1, $2, $3, 'America/Sao_Paulo', 'BRL', TRUE, TRUE, clock_timestamp(), clock_timestamp()
           )
           RETURNING id, name, slug`,
          [orgId, cleanName, targetSlug]
        );
        const newWs = wsRes.rows[0]!;

        // 4. Provision or Update Target Owner User
        const passwordHash = hashPassword(tempPassword);
        const userRes = await client.query<{ id: string; name: string; email: string }>(
          `INSERT INTO users (id, email, name, password_hash, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, clock_timestamp(), clock_timestamp())
           ON CONFLICT (email) DO UPDATE SET
             name = COALESCE(users.name, EXCLUDED.name),
             password_hash = COALESCE(users.password_hash, EXCLUDED.password_hash),
             updated_at = clock_timestamp()
           RETURNING id, name, email`,
          [cleanEmail, cleanOwnerName, passwordHash]
        );
        const ownerUser = userRes.rows[0]!;

        // 5. Link Target User as Owner
        await client.query(
          `INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at)
           VALUES ($1, $2, 'owner', clock_timestamp())
           ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'`,
          [newWs.id, ownerUser.id]
        );

        // 6. ALSO Link current authenticated creator (Francisco) as Owner
        if (request.user.id !== ownerUser.id) {
          await client.query(
            `INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at)
             VALUES ($1, $2, 'owner', clock_timestamp())
             ON CONFLICT (workspace_id, user_id) DO NOTHING`,
            [newWs.id, request.user.id]
          );
        }

        await client.query("COMMIT");

        const welcomeMessage = `🚀 Olá, ${cleanOwnerName}! Seu acesso ao Chat Sales V3 (${cleanName}) está liberado.\n\n🔗 Painel: https://crm.iaparavendas.tech\n👤 E-mail: ${cleanEmail}\n🔑 Senha: ${tempPassword}\n\nFaça login para conectar seu WhatsApp e cadastrar seus produtos!`;

        return reply.status(201).send({
          success: true,
          workspace: {
            id: newWs.id,
            name: newWs.name,
            slug: newWs.slug,
          },
          owner: {
            id: ownerUser.id,
            name: ownerUser.name,
            email: ownerUser.email,
            tempPassword,
          },
          welcomeMessage,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        request.log.error({ err }, "Erro ao criar novo workspace");
        throw err;
      } finally {
        client.release();
      }
    }
  );
};
