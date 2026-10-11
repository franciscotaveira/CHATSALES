import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  withTenantTransaction,
  listContacts,
  createOrGetContact,
  updateContact,
  deleteContact,
} from "@sos-sales/database";

const workspaceParamsSchema = z.object({
  workspaceId: z.string().uuid(),
});

const listContactsQuerySchema = z.object({
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: z.enum(["active", "inactive", "all"]).default("all"),
});

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
      const { search, limit, offset, status } = parsedQuery.data;

      const contacts = await withTenantTransaction(workspaceId, async (client) => {
        return listContacts(client, {
          workspaceId,
          search,
          limit,
          offset,
          status,
        });
      });

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

      try {
        const contact = await withTenantTransaction(workspaceId, async (client) =>
          updateContact(client, { workspaceId, contactId, ...parsedBody.data })
        );
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
