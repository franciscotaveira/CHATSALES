import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  createOrGetContact,
  updateContact,
  deleteContact,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listContactsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  beforeUpdatedAt:z.string().datetime({offset:true}).optional(),
  beforeId:z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive", "all"]).default("all"),
}).refine(q=>Boolean(q.beforeUpdatedAt)===Boolean(q.beforeId)&&!(q.beforeId&&q.offset>0));

const createContactBodySchema = z.object({
  phoneE164: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number"),
  name: z.string().trim().min(1).max(150).optional(),
});

const contactParamsSchema = z.object({
  workspaceId: z.string().uuid(),
  contactId: z.string().uuid(),
});

const updateContactBodySchema = z
  .object({
    phoneE164: z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/, "Must be a valid E.164 phone number")
      .optional(),
    name: z.string().trim().min(1).max(150).nullable().optional(),
    optOut: z.boolean().optional(),
    expectedNotes: z.unknown().optional(),
    consentEvidence:z.string().trim().min(5).max(500).optional(),
    metadata: z.object({
      email: z.string().email().max(254).or(z.literal("")).optional(),
      company: z.string().trim().max(150).optional(),
      notes: z.string().trim().max(2000).optional(),
      tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
      isRecurring: z.boolean().optional(),
      totalOrders: z.number().int().min(0).optional(),
      totalSpentCents: z.number().int().min(0).optional(),
      lastOrderAt: z.string().optional(),
      customerSince: z.string().optional(),
    }).strict().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field is required",
  });

const pgErrorCode = (err: unknown): string | undefined =>
  typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;

const sendProblem = (
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  slug: string,
  title: string,
  detail: string
) =>
  reply.status(status).send({
    type: `https://sos-sales.mct.br/errors/${slug}`,
    title,
    status,
    detail,
    instance: request.url,
    correlationId: request.id,
  });

export const contactsRoutes: FastifyPluginAsync = async (app) => {
  // 1. List contacts for workspace
  app.get(
    "/v1/workspaces/:workspaceId/contacts",
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

      const parsedQuery = listContactsQuerySchema.safeParse(request.query);
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
      const { search, limit, offset, status,beforeUpdatedAt,beforeId } = parsedQuery.data;
      const rows=await withTenantTransaction(workspaceId,async client=>(await client.query<import('@sos-sales/database').ContactRecord&{cursor_updated_at:string}>(`SELECT id,workspace_id,phone_e164,name,opt_out,metadata,created_at,updated_at,to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_updated_at
       FROM public.contacts WHERE workspace_id=$1
       AND ($2::text='all' OR ($2='active' AND opt_out=false) OR ($2='inactive' AND opt_out=true))
       AND ($3::text IS NULL OR strpos(lower(COALESCE(name,'')),lower($3))>0 OR strpos(phone_e164,$3)>0)
       AND ($4::timestamptz IS NULL OR (updated_at,id)<($4::timestamptz,$5::uuid))
       ORDER BY updated_at DESC,id DESC LIMIT $6 OFFSET $7`,[workspaceId,status,search||null,beforeUpdatedAt??null,beforeId??null,limit+1,offset])).rows);
      const contacts=rows.slice(0,limit),last=contacts.at(-1),hasMore=rows.length>limit;

      return reply.status(200).send({
        contacts: contacts.map((c) => ({
          id: c.id,
          workspaceId: c.workspace_id,
          phoneE164: c.phone_e164,
          name: c.name,
          optOut: c.opt_out,
          metadata: c.metadata,
          createdAt: c.created_at.toISOString(),
          updatedAt: c.updated_at.toISOString(),
        })),
        total: contacts.length,
        pagination:{hasMore,nextCursor:hasMore&&last?{updatedAt:last.cursor_updated_at,id:last.id}:null},
      });
    }
  );

  // 2. Create or update contact
  app.post(
    "/v1/workspaces/:workspaceId/contacts",
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

      const parsedBody = createContactBodySchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({
          type: "https://sos-sales.mct.br/errors/bad-request",
          title: "Bad Request",
          status: 400,
          detail: parsedBody.error.issues.map((i) => i.message).join(", "),
          instance: request.url,
          correlationId: request.id,
        });
      }

      const { workspaceId } = parsedParams.data;
      const { phoneE164, name } = parsedBody.data;

      const contact = await withTenantTransaction(workspaceId, async (client) => {
        return createOrGetContact(client, {
          workspaceId,
          phoneE164,
          name,
        });
      });

      return reply.status(201).send({
        contact: {
          id: contact.id,
          workspaceId: contact.workspace_id,
          phoneE164: contact.phone_e164,
          name: contact.name,
          optOut: contact.opt_out,
          metadata: contact.metadata,
          createdAt: contact.created_at.toISOString(),
          updatedAt: contact.updated_at.toISOString(),
        },
      });
    }
  );

  // 3. Update contact (name / phone)
  app.patch(
    "/v1/workspaces/:workspaceId/contacts/:contactId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const problem = sendProblem.bind(null, request, reply);

      const parsedParams = contactParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return problem(400, "bad-request", "Bad Request", "Invalid workspaceId or contactId parameter");
      }

      const parsedBody = updateContactBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return problem(400, "bad-request", "Bad Request", parsedBody.error.issues.map((i) => i.message).join(", "));
      }

      const { workspaceId, contactId } = parsedParams.data;
      if(parsedBody.data.optOut===false&&!parsedBody.data.consentEvidence)return problem(400,"bad-request","Bad Request","Registre a origem e o momento do aceite explícito do cliente antes de retomar mensagens comerciais.");
      if(parsedBody.data.consentEvidence&&parsedBody.data.optOut!==false)return problem(400,"bad-request","Bad Request","A evidência de aceite deve acompanhar a retomada comercial.");
      if (Object.prototype.hasOwnProperty.call(parsedBody.data, "expectedNotes") && parsedBody.data.metadata?.notes === undefined) {
        return problem(400, "bad-request", "Bad Request", "A conferência da nota deve acompanhar uma alteração de notas.");
      }
      try {
        const contact = await withTenantTransaction(workspaceId, async (client) => {
          const {consentEvidence,expectedNotes,...changes}=parsedBody.data;
          if (Object.prototype.hasOwnProperty.call(parsedBody.data, "expectedNotes")) {
            const locked = await client.query<{matches:boolean}>(`SELECT COALESCE(metadata->'notes', 'null'::jsonb) = $3::jsonb AS matches FROM public.contacts WHERE workspace_id=$1 AND id=$2 FOR UPDATE`, [workspaceId, contactId, JSON.stringify(expectedNotes ?? null)]);
            if (!locked.rows.length) return null;
            if (!locked.rows[0]?.matches) throw Object.assign(new Error("A nota foi alterada por outra pessoa. Seu texto não foi salvo. Consulte a nota atual antes de tentar novamente."), {code:"CONTACT_NOTES_CONFLICT"});
          }
          const result=await updateContact(client, { workspaceId, contactId, ...changes });
          if(result&&changes.optOut!==undefined){
            await client.query(`INSERT INTO public.audit_events(workspace_id,actor_id,actor_type,action,resource_type,resource_id,metadata) VALUES ($1,$2,'human',$3,'contact',$4,$5)`,[workspaceId,request.user.id,changes.optOut?"contact.commercial_blocked":"contact.commercial_resumed",contactId,JSON.stringify({optOut:changes.optOut,consentEvidence:consentEvidence??null,source:"manual_contact_preference",scope:"contact_record"})]);
          }
          return result;
        });
        if (!contact) {
          return problem(404, "not-found", "Not Found", "Contact not found");
        }
        return reply.status(200).send({
          contact: {
            id: contact.id,
            workspaceId: contact.workspace_id,
            phoneE164: contact.phone_e164,
            name: contact.name,
            optOut: contact.opt_out,
            metadata: contact.metadata,
            createdAt: contact.created_at.toISOString(),
            updatedAt: contact.updated_at.toISOString(),
          },
        });
      } catch (err) {
        if (pgErrorCode(err) === "CONTACT_NOTES_CONFLICT") {
          return problem(409, "contact-notes-conflict", "Nota alterada", (err as Error).message);
        }
        if (pgErrorCode(err) === "23505") {
          return problem(409, "conflict", "Conflict", "Another contact already uses this phone number");
        }
        throw err;
      }
    }
  );

  // 4. Delete contact (blocked when linked to threads/journeys)
  app.delete(
    "/v1/workspaces/:workspaceId/contacts/:contactId",
    {
      preHandler: [
        app.authenticate,
        app.requireWorkspaceContext,
        app.requirePermission("cockpit:access"),
      ],
    },
    async (request, reply) => {
      const problem = sendProblem.bind(null, request, reply);

      const parsedParams = contactParamsSchema.safeParse(request.params);
      if (!parsedParams.success) {
        return problem(400, "bad-request", "Bad Request", "Invalid workspaceId or contactId parameter");
      }

      const { workspaceId, contactId } = parsedParams.data;

      try {
        const deleted = await withTenantTransaction(workspaceId, async (client) =>
          deleteContact(client, { workspaceId, contactId })
        );
        if (!deleted) {
          return problem(404, "not-found", "Not Found", "Contact not found");
        }
        return reply.status(204).send();
      } catch (err) {
        if (pgErrorCode(err) === "23503") {
          return problem(409, "conflict", "Conflict", "Contact has linked conversations or opportunities");
        }
        if (pgErrorCode(err) === "42501") {
          return problem(403, "forbidden", "Forbidden", "Contact deletion is disabled by retention policy");
        }
        throw err;
      }
    }
  );
};
