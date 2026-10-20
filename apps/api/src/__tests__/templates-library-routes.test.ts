import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { templatesRoutes } from "../routes/templates.routes";
import * as databaseModule from "@sos-sales/database";
import { CANONICAL_TEMPLATE_LIBRARY } from "@sos-sales/contracts";

describe("Templates Library Routes", () => {
  let app: ReturnType<typeof Fastify>;
  const workspaceId = "11111111-1111-1111-1111-111111111111";

  beforeEach(async () => {
    app = Fastify();

    // Mock authentication and context decorations
    app.decorate("authenticate", async (request: any) => {
      request.user = { id: "user-1", email: "tester@mct.br" };
    });
    app.decorate("requireWorkspaceContext", async (request: any) => {
      request.workspaceId = workspaceId;
    });
    app.decorate("requirePermission", () => async () => {});

    await app.register(templatesRoutes);
    await app.ready();
  });

  it("GET /v1/workspaces/:workspaceId/templates/library returns the canonical catalog and segments", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/templates/library`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(CANONICAL_TEMPLATE_LIBRARY.length);
    expect(Array.isArray(body.items)).toBe(true);
    expect(Array.isArray(body.segments)).toBe(true);
    expect(body.items[0]).toHaveProperty("name");
    expect(body.items[0]).toHaveProperty("tacticalTip");
  });

  it("GET /v1/workspaces/:workspaceId/templates/library filters by category and segment", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/templates/library?category=UTILITY&segment=ecommerce`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.every((i: any) => i.category === "UTILITY" && i.segment === "ecommerce")).toBe(true);
  });

  it("POST /v1/workspaces/:workspaceId/templates/library/import successfully imports a template", async () => {
    const targetItem = CANONICAL_TEMPLATE_LIBRARY[0];

    vi.spyOn(databaseModule, "withTenantTransaction").mockImplementation(async (_ws, callback: any) => {
      const mockClient: any = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      return callback(mockClient);
    });

    vi.spyOn(databaseModule, "upsertMessageTemplate").mockResolvedValue({
      id: "tpl-imported-999",
      workspace_id: workspaceId,
      name: targetItem.name,
      category: targetItem.category,
      language: "pt_BR",
      header_text: targetItem.headerText,
      body_text: targetItem.bodyText,
      footer_text: targetItem.footerText,
      buttons: targetItem.buttons,
      variables: targetItem.variables,
      status: "PENDING",
      meta_template_id: null,
      created_at: new Date(),
      updated_at: new Date(),
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/templates/library/import`,
      payload: { templateId: targetItem.id },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.template.name).toBe(targetItem.name);
    expect(body.template.category).toBe(targetItem.category);
    expect(body.message).toContain("importado");
  });
});
