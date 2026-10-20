import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools, createOrGetContact } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

describe("Contacts Routes Integration (Fastify + RLS)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { appPool, ownerPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

  const userOperatorId = crypto.randomUUID();
  let operatorToken: string;

  beforeAll(async () => {
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 1. Provision Org & Workspaces
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Contacts Test Org', $1)
       RETURNING id;`,
      [`org-contacts-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace Contacts A', $2)
       RETURNING id;`,
      [orgId, `ws-contacts-a-${Date.now()}`]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace Contacts B', $2)
       RETURNING id;`,
      [orgId, `ws-contacts-b-${Date.now()}`]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2. User & Memberships
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Operator Contacts');`,
      [userOperatorId, `op-contacts-${Date.now()}@example.com`]
    );

    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'operator');`,
      [workspaceAId, userOperatorId]
    );

    // 3. Generate JWT
    const secretKey = new TextEncoder().encode(jwtSecret);
    operatorToken = await new SignJWT({
      sub: userOperatorId,
      email: "operator@example.com",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);

    // 4. Provision Contacts in Workspace A and B
    await createOrGetContact(ownerPool, {
      workspaceId: workspaceAId,
      phoneE164: "+5511999990001",
      name: "Lead Alice",
    });

    await createOrGetContact(ownerPool, {
      workspaceId: workspaceAId,
      phoneE164: "+5511999990002",
      name: "Lead Bob",
    });

    await createOrGetContact(ownerPool, {
      workspaceId: workspaceBId,
      phoneE164: "+5511999999999",
      name: "Secret Lead Workspace B",
    });
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
  });

  it("lists contacts for Workspace A under RLS", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/contacts`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contacts).toBeDefined();
    expect(body.contacts.length).toBe(2);
    const phones = body.contacts.map((c: any) => c.phoneE164);
    expect(phones).toContain("+5511999990001");
    expect(phones).toContain("+5511999990002");
    expect(phones).not.toContain("+5511999999999");
  });

  it("filters contacts by search query", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/contacts?search=Alice`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.contacts.length).toBe(1);
    expect(body.contacts[0].name).toBe("Lead Alice");
  });

  it("creates a new contact in Workspace A under RLS", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/contacts`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
      payload: {
        phoneE164: "+5511988881234",
        name: "Lead Carlos",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.contact).toBeDefined();
    expect(body.contact.phoneE164).toBe("+5511988881234");
    expect(body.contact.name).toBe("Lead Carlos");
  });

  it("blocks cross-tenant access to Workspace B contacts (fail-closed RLS)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceBId}/contacts`,
      headers: {
        authorization: `Bearer ${operatorToken}`,
      },
    });

    expect(res.statusCode).toBe(403);
  });
  it("updates and deletes a contact in Workspace A", async () => {
    const auth = { authorization: `Bearer ${operatorToken}` };
    const created = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/contacts`,
      headers: auth,
      payload: { phoneE164: "+5511977770001", name: "Para Editar" },
    });
    expect(created.statusCode).toBe(201);
    const contactId = created.json().contact.id as string;
    const base = `/v1/workspaces/${workspaceAId}/contacts/${contactId}`;

    const patched = await app.inject({ method: "PATCH", url: base, headers: auth, payload: { name: "Renomeado" } });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().contact.name).toBe("Renomeado");
    expect(patched.json().contact.phoneE164).toBe("+5511977770001");

    const empty = await app.inject({ method: "PATCH", url: base, headers: auth, payload: {} });
    expect(empty.statusCode).toBe(400);

    const badPhone = await app.inject({ method: "PATCH", url: base, headers: auth, payload: { phoneE164: "123" } });
    expect(badPhone.statusCode).toBe(400);

    // Hard delete is revoked for sos_app_user (migration 005) — API must fail closed with 403, never 500.
    const removed = await app.inject({ method: "DELETE", url: base, headers: auth });
    expect(removed.statusCode).toBe(403);
  });

  it("returns 409 when patching a contact's phone to one already in use", async () => {
    const auth = { authorization: `Bearer ${operatorToken}` };
    const base = `/v1/workspaces/${workspaceAId}/contacts`;

    const created = await app.inject({
      method: "POST",
      url: base,
      headers: auth,
      payload: { phoneE164: "+5511977770002", name: "Contato Duplicado" },
    });
    expect(created.statusCode).toBe(201);
    const contactId = created.json().contact.id as string;

    const patched = await app.inject({
      method: "PATCH",
      url: `${base}/${contactId}`,
      headers: auth,
      payload: { phoneE164: "+5511999990001" },
    });

    expect(patched.statusCode).toBe(409);
    expect(patched.json().status).toBe(409);
  });

  it("returns 404 when patching an unknown contact", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceAId}/contacts/00000000-0000-4000-8000-000000000000`,
      headers: { authorization: `Bearer ${operatorToken}` },
      payload: { name: "Ninguém" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("blocks cross-tenant PATCH/DELETE on Workspace B", async () => {
    const url = `/v1/workspaces/${workspaceBId}/contacts/00000000-0000-4000-8000-000000000000`;
    const auth = { authorization: `Bearer ${operatorToken}` };
    const patch = await app.inject({ method: "PATCH", url, headers: auth, payload: { name: "X" } });
    const del = await app.inject({ method: "DELETE", url, headers: auth });
    expect(patch.statusCode).toBe(403);
    expect(del.statusCode).toBe(403);
  });
  it("rejects stale notes atomically and serializes competing writers", async () => {
    const created = await createOrGetContact(ownerPool, {workspaceId:workspaceAId,phoneE164:"+5511977700011",name:"Original"});
    const url = `/v1/workspaces/${workspaceAId}/contacts/${created.id}`;
    const headers = {authorization:`Bearer ${operatorToken}`};
    const results = await Promise.all(["SIM first", "SIM second"].map(notes => app.inject({method:"PATCH",url,headers,payload:{metadata:{notes},expectedNotes:null}})));
    expect(results.map(r=>r.statusCode).sort()).toEqual([200,409]);
    const winner=results.find(r=>r.statusCode===200)!.json().contact.metadata.notes;
    const stale=await app.inject({method:"PATCH",url,headers,payload:{name:"Must not apply",metadata:{notes:"SIM stale",company:"Must not apply"},expectedNotes:null}});
    expect(stale.statusCode).toBe(409); expect(stale.json().type).toContain("contact-notes-conflict");
    const stored=await ownerPool.query("SELECT name,metadata FROM public.contacts WHERE id=$1",[created.id]);
    expect(stored.rows[0].name).toBe("Original"); expect(stored.rows[0].metadata.notes).toBe(winner); expect(stored.rows[0].metadata.company).toBeUndefined();
    const retry=await app.inject({method:"PATCH",url,headers,payload:{metadata:{notes:"SIM reviewed"},expectedNotes:winner}});
    expect(retry.statusCode).toBe(200); expect(retry.json().contact.metadata.notes).toBe("SIM reviewed");
  });
  it("compares legacy JSON notes without coercion and rejects a detached precondition", async () => {
    const contact=await createOrGetContact(ownerPool,{workspaceId:workspaceAId,phoneE164:"+5511977700012"});
    await ownerPool.query("UPDATE public.contacts SET metadata=$2::jsonb WHERE id=$1",[contact.id,JSON.stringify({notes:{legacy:true},tags:["SIM"]})]);
    const url=`/v1/workspaces/${workspaceAId}/contacts/${contact.id}`; const headers={authorization:`Bearer ${operatorToken}`};
    expect((await app.inject({method:"PATCH",url,headers,payload:{expectedNotes:null,metadata:{notes:"wrong"}}})).statusCode).toBe(409);
    const repaired=await app.inject({method:"PATCH",url,headers,payload:{expectedNotes:{legacy:true},metadata:{notes:"SIM repaired"}}});
    expect(repaired.statusCode).toBe(200); expect(repaired.json().contact.metadata.tags).toEqual(["SIM"]);
    expect((await app.inject({method:"PATCH",url,headers,payload:{expectedNotes:"SIM repaired",name:"Other"}})).statusCode).toBe(400);
  });

});
