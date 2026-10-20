import type { FastifyPluginAsync } from "fastify";
import crypto from "node:crypto";
import { withTenantTransaction, getDatabasePool, type PoolClient, assignCommercialAction } from "@sos-sales/database";
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
  initialPassword: z.string().min(6, "A senha deve ter pelo menos 6 caracteres").max(100).refine(value=>value.trim().length>0,"A senha não pode conter apenas espaços").optional(),
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
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  role: z.enum(["admin", "manager", "operator"]),
  password: z.string().min(6).max(100).refine(value=>value.trim().length>0,"A senha não pode conter apenas espaços").optional(),
});

const memberExpectedRole=z.enum(["owner","admin","manager","operator","analyst","support_auditor","integration_service"]);
const updateMemberSchema = z.object({
  expectedRole: memberExpectedRole.optional(),
  role: z.enum(["admin", "manager", "operator"]).optional(),
  password: z.string().min(6).max(100).refine(value=>value.trim().length>0,"A senha não pode conter apenas espaços").optional(),
});

const teamError=(statusCode:number,message:string)=>Object.assign(new Error(message),{statusCode});
async function lockTeamActor(client:PoolClient,workspace:string,actor:string){
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`team:${workspace}`]);
  const row=(await client.query<{role:string}>('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR UPDATE',[workspace,actor])).rows[0];
  if(!row||!['owner','admin'].includes(row.role))throw teamError(403,'Somente proprietário e administrador podem gerenciar acessos.');
  return row.role;
}
async function teamAudit(client:PoolClient,workspace:string,actor:string,target:string,action:string,detail:Record<string,unknown>){
  await client.query("INSERT INTO audit_events(workspace_id,actor_type,actor_id,action,resource_type,resource_id,metadata) VALUES($1,'human',$2,$3,'workspace_member',$4,$5::jsonb)",[workspace,actor,action,target,JSON.stringify(detail)]);
}

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
          await lockTeamActor(client,workspaceId,request.user.id);
          // Password belongs to the account, not to this workspace.
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
          let createdPassword = password ?? "";

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

            if(password!==undefined)throw teamError(409,'Esta conta já existe. Adicione sem senha inicial; a senha atual será preservada.');
            createdPassword="";
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

          await teamAudit(client,workspaceId,request.user.id,userId,'member.added',{role,accountCreated:!existingUser});
          return {
            accountCreated: !existingUser,
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
      if(!z.string().uuid().safeParse(memberId).success)return reply.code(400).send({detail:'Integrante inválido.'});
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

      const { role, password, expectedRole } = parseResult.data;
      if(password!==undefined)return reply.code(403).send({detail:'A senha pertence à conta e não pode ser redefinida pela equipe da empresa.'});
      if(!role)return reply.code(400).send({detail:'Escolha o perfil de acesso.'});
      if(!expectedRole)return reply.code(428).send({detail:'Atualize a equipe antes de alterar o perfil.'});

      const updated = await withTenantTransaction(workspaceId, async (client) => {
        await lockTeamActor(client,workspaceId,request.user.id);
        // Find membership by membership ID or user ID
        const targetRes = await client.query<{
          id: string;
          user_id: string;
          role: string;
        }>(
          `SELECT id, user_id, role 
           FROM workspace_memberships 
           WHERE workspace_id = $1 AND (id = $2::uuid OR user_id = $2::uuid)
           LIMIT 1 FOR UPDATE`,
          [workspaceId, memberId]
        );

        const target = targetRes.rows[0];
        if (!target) {
          return null;
        }

        if(target.role!==expectedRole)throw teamError(409,'O perfil deste integrante mudou. Atualize a equipe antes de decidir.');
        if(target.role==='owner')throw teamError(403,'O acesso do proprietário é protegido.');
        if(target.user_id===request.user.id)throw teamError(403,'Você não pode alterar o próprio nível de acesso pela equipe.');
        await client.query('UPDATE workspace_memberships SET role=$1 WHERE id=$2',[role,target.id]);
        await teamAudit(client,workspaceId,request.user.id,target.user_id,'member.role_changed',{previousRole:target.role,role});

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

      if(!z.string().uuid().safeParse(memberId).success)return reply.code(400).send({detail:'Integrante inválido.'});
      const expected=z.object({expectedRole:memberExpectedRole}).safeParse(request.body);
      if(!expected.success)return reply.code(428).send({detail:'Atualize a equipe antes de remover o acesso.'});
      const removed = await withTenantTransaction(workspaceId, async (client) => {
        await lockTeamActor(client,workspaceId,request.user.id);
        const targetRes = await client.query<{
          id: string;
          user_id: string;
          role: string;
        }>(
          `SELECT id, user_id, role 
           FROM workspace_memberships 
           WHERE workspace_id = $1 AND (id = $2::uuid OR user_id = $2::uuid)
           LIMIT 1 FOR UPDATE`,
          [workspaceId, memberId]
        );

        const target = targetRes.rows[0];
        if (!target) {
          return null;
        }

        if(target.role!==expected.data.expectedRole)throw teamError(409,'O perfil deste integrante mudou. Atualize a equipe antes de decidir.');
        if(target.role==='owner')throw teamError(403,'O acesso do proprietário é protegido.');
        if(target.user_id===request.user.id)throw teamError(403,'Você não pode remover o próprio acesso pela equipe.');
        const actions=(await client.query<{id:string}>("UPDATE commercial_actions SET assignee_user_id=NULL,updated_at=clock_timestamp() WHERE workspace_id=$1 AND assignee_user_id=$2 AND status='open' RETURNING id",[workspaceId,target.user_id])).rows;
        if(actions.length)await client.query("INSERT INTO commercial_action_history(workspace_id,action_id,action_type,previous_assignee_id,new_assignee_id,created_by_user_id,created_at) SELECT $1,id,'assigned',$2,NULL,$3,clock_timestamp() FROM unnest($4::uuid[]) AS id",[workspaceId,target.user_id,request.user.id,actions.map(item=>item.id)]);
        const journeys=(await client.query<{id:string}>("UPDATE commercial_journeys SET assigned_user_id=NULL,updated_at=clock_timestamp() WHERE workspace_id=$1 AND assigned_user_id=$2 AND status='open' RETURNING id",[workspaceId,target.user_id])).rows;
        await client.query('DELETE FROM workspace_memberships WHERE id=$1',[target.id]);
        await teamAudit(client,workspaceId,request.user.id,target.user_id,'member.removed',{previousRole:target.role,actionIds:actions.map(item=>item.id),journeyIds:journeys.map(item=>item.id),reason:'access_removed_pending_reassignment'});
        return {tasks:actions.length,opportunities:journeys.length};
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
        message: "Acesso removido. Pendências abertas ficaram sem responsável para revisão; histórico preservado.",
        pendingReassignment: removed,
      });
    }
  );


  app.get('/v1/workspaces/:workspaceId/team-reassignment',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('workspace:manage')]},async(request,reply)=>{
    const query=z.object({before:z.string().max(150).optional()}).strict().safeParse(request.query);
    if(!query.success)return reply.code(400).send({detail:'Página inválida.'});
    let time:string|null=null,id:string|null=null,kind:string|null=null;
    if(query.data.before){const p=query.data.before.split('~');if(p.length!==3||!z.string().datetime().safeParse(p[0]).success||!z.string().uuid().safeParse(p[1]).success||!['task','opportunity'].includes(p[2]!))return reply.code(400).send({detail:'Página inválida.'});[time,id,kind]=p as [string,string,string];}
    return withTenantTransaction(request.workspaceId!,async client=>{
      const rows=(await client.query(`WITH pending AS (
        SELECT a.id,'task'::text AS kind,a.title,a.thread_id,a.updated_at AS changed_at,c.name AS contact_name FROM commercial_actions a JOIN commercial_threads t ON t.workspace_id=a.workspace_id AND t.id=a.thread_id LEFT JOIN contacts c ON c.workspace_id=t.workspace_id AND c.id=t.contact_id WHERE a.workspace_id=$1 AND a.status='open' AND a.assignee_user_id IS NULL
        UNION ALL
        SELECT j.id,'opportunity',j.title,j.thread_id,j.updated_at,c.name FROM commercial_journeys j LEFT JOIN contacts c ON c.workspace_id=j.workspace_id AND c.id=j.contact_id WHERE j.workspace_id=$1 AND j.status='open' AND j.assigned_user_id IS NULL
      ) SELECT *,to_char(changed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time FROM pending WHERE ($2::timestamptz IS NULL OR (changed_at,id,kind)<($2::timestamptz,$3::uuid,$4::text)) ORDER BY changed_at DESC,id DESC,kind DESC LIMIT 21`,[request.workspaceId,time,id,kind])).rows;
      const items=rows.slice(0,20),last=items.at(-1);
      return {items:items.map(row=>({id:row.id,kind:row.kind,title:row.title,threadId:row.thread_id,contactName:row.contact_name,changedAt:row.changed_at.toISOString()})),nextCursor:rows.length>20?`${last.cursor_time}~${last.id}~${last.kind}`:null};
    });
  });
  app.post('/v1/workspaces/:workspaceId/team-reassignment',{preHandler:[app.authenticate,app.requireWorkspaceContext,app.requirePermission('workspace:manage')]},async(request,reply)=>{
    const input=z.object({id:z.string().uuid(),kind:z.enum(['task','opportunity']),assigneeUserId:z.string().uuid()}).strict().safeParse(request.body);
    if(!input.success)return reply.code(400).send({detail:'Escolha uma pendência e um responsável válido.'});
    const workspace=request.workspaceId!,actor=request.user.id,{id,kind,assigneeUserId}=input.data;
    return withTenantTransaction(workspace,async client=>{
      await lockTeamActor(client,workspace,actor);
      const member=(await client.query<{role:string}>('SELECT role FROM workspace_memberships WHERE workspace_id=$1 AND user_id=$2 FOR KEY SHARE',[workspace,assigneeUserId])).rows[0];
      if(!member||!['owner','admin','manager','operator'].includes(member.role))throw teamError(409,'O responsável não possui acesso operacional nesta empresa. Atualize a equipe.');
      if(kind==='task'){
        const task=(await client.query("SELECT id FROM commercial_actions WHERE workspace_id=$1 AND id=$2 AND status='open' AND assignee_user_id IS NULL FOR UPDATE",[workspace,id])).rows[0];
        if(!task)throw teamError(409,'A tarefa já foi atribuída ou encerrada. Atualize as pendências.');
        await assignCommercialAction(client,workspace,id,{assigneeUserId,userId:actor});
      }else{
        const changed=await client.query("UPDATE commercial_journeys SET assigned_user_id=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 AND status='open' AND assigned_user_id IS NULL RETURNING id",[workspace,id,assigneeUserId]);
        if(!changed.rows.length)throw teamError(409,'A oportunidade já foi atribuída ou encerrada. Atualize as pendências.');
      }
      await teamAudit(client,workspace,actor,assigneeUserId,'member.pending_work_assigned',{kind,id,previousAssignee:null});return {success:true};
    });
  });

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
      const tempPassword = initialPassword ?? crypto.randomBytes(24).toString("base64url");

      const baseSlug = slugify(cleanName);
      let targetSlug = baseSlug || `empresa-${Date.now().toString(36)}`;

      const pool = getDatabasePool();
      const client = await pool.connect();

      try {
        await client.query("BEGIN");
        const newWorkspaceId=crypto.randomUUID();
        await client.query("SELECT set_config('app.current_workspace_id', $1, true)",[newWorkspaceId]);

        // 1. Resolve unique slug
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`workspace-slug:${targetSlug}`]);
        const slugCheck = await client.query("SELECT id FROM organizations WHERE slug = $1", [`${targetSlug}-org`]);
        if (slugCheck.rows.length > 0) {
          targetSlug = `${targetSlug}-${crypto.randomUUID()}`;
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
             $4, $1, $2, $3, 'America/Sao_Paulo', 'BRL', TRUE, TRUE, clock_timestamp(), clock_timestamp()
           )
           RETURNING id, name, slug`,
          [orgId, cleanName, targetSlug,newWorkspaceId]
        );
        const newWs = wsRes.rows[0]!;

        // 4. Provision or Update Target Owner User
        const existingCheck = await client.query<{ id: string; name: string }>(
          "SELECT id, name FROM users WHERE email = $1",
          [cleanEmail]
        );
        const isExistingUser = existingCheck.rows.length > 0;

        const passwordHash = hashPassword(tempPassword);
        const userRes = await client.query<{ id: string; name: string; email: string }>(
          `INSERT INTO users (id, email, name, password_hash, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, clock_timestamp())
           ON CONFLICT (email) DO UPDATE SET
             name = COALESCE(users.name, EXCLUDED.name)
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

        const passwordLine = isExistingUser
          ? "🔑 Senha: [Sua senha de acesso atual]"
          : `🔑 Senha: ${tempPassword}`;

        const welcomeMessage = isExistingUser
          ? `🚀 Olá, ${cleanOwnerName}! Seu acesso à nova empresa ${cleanName} no SOS Vendas foi vinculado à sua conta existente.\n\n🔗 Painel: https://chat.automatizaprocessos.tech\n👤 E-mail: ${cleanEmail}\n${passwordLine}\n\nFaça login para alternar para a nova empresa e conectar o WhatsApp!`
          : `🚀 Olá, ${cleanOwnerName}! Seu acesso ao SOS Vendas (${cleanName}) está liberado.\n\n🔗 Painel: https://chat.automatizaprocessos.tech\n👤 E-mail: ${cleanEmail}\n${passwordLine}\n\nFaça login para conectar seu WhatsApp e cadastrar seus produtos!`;

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
            isExistingUser,
            tempPassword: isExistingUser ? null : tempPassword,
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
