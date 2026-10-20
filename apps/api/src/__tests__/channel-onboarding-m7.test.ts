import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

const providerMock=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('@sos-sales/application',async original=>({...await original<typeof import('@sos-sales/application')>(),safeFetchWithSsrfGuard:(...args:unknown[])=>providerMock.fetch(...args)}));
providerMock.fetch.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('/api/sessions/')?{name:decodeURIComponent(url.split('/api/sessions/')[1]!.split('/')[0]!),status:'WORKING',me:{id:'5511999992222@c.us'}}:url.includes('/subscribed_apps')?{data:[{whatsapp_business_api_data:{id:'2294262161340902'}}]}:url.includes('/phone_numbers')?{data:[{id:'phone_id_9999',display_phone_number:'5511999991111'}]}:{id:'phone_id_9999',display_phone_number:'5511999991111'}),{status:200,headers:{'content-type':'application/json'}}));

describe("M7 Channel Onboarding, Governance & Revocation Integration (Fastify + RLS + Audit)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { ownerPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

  const userAdminAId = crypto.randomUUID();
  let adminAToken: string;

  const userOperatorAId = crypto.randomUUID();
  let operatorAToken: string;

  const userAdminBId = crypto.randomUUID();
  let adminBToken: string;

  beforeAll(async () => {
    vi.stubEnv("META_APP_ID","2294262161340902");
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 1. Provision Org & Workspaces
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('Channel Onboarding M7 Org', $1)
       RETURNING id;`,
      [`org-m7-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace M7 A', $2)
       RETURNING id;`,
      [orgId, `ws-m7-a-${Date.now()}`]
    );
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'Workspace M7 B', $2)
       RETURNING id;`,
      [orgId, `ws-m7-b-${Date.now()}`]
    );
    workspaceBId = wsBRes.rows[0].id;

    // 2. Users & Memberships
    // Admin in WS A
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Admin Alice');`,
      [userAdminAId, `admin-a-${Date.now()}@example.com`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin');`,
      [workspaceAId, userAdminAId]
    );

    // Operator in WS A (lacks workspace:manage)
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Operator Bob');`,
      [userOperatorAId, `operator-a-${Date.now()}@example.com`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'operator');`,
      [workspaceAId, userOperatorAId]
    );

    // Admin in WS B
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Admin Charlie');`,
      [userAdminBId, `admin-b-${Date.now()}@example.com`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin');`,
      [workspaceBId, userAdminBId]
    );

    // 3. Generate JWTs
    const secretKey = new TextEncoder().encode(jwtSecret);

    adminAToken = await new SignJWT({
      sub: userAdminAId,
      email: "admin-a@example.com",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);

    operatorAToken = await new SignJWT({
      sub: userOperatorAId,
      email: "operator-a@example.com",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);

    adminBToken = await new SignJWT({
      sub: userAdminBId,
      email: "admin-b@example.com",
      role: "authenticated",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
    vi.unstubAllEnvs();
  });

  it("provisions a Meta WABA channel with encrypted credentials without leaking secrets in responses", async () => {
    const rawSecret = "super_confidential_meta_app_secret_12345";
    const rawToken = "EAABtest_meta_access_token_67890";

    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
      payload: {
        provider: "meta_waba",
        displayName: "Linha Oficial Principal",
        phoneNumberE164: "+5511999991111",
        credentials: {
          accessToken: rawToken,
          phoneNumberId: "phone_id_9999",
          wabaAccountId: "987654321",
          appSecret: rawSecret,
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.channel).toBeDefined();
    expect(body.channel.id).toBeDefined();
    expect(body.channel.displayName).toBe("Linha Oficial Principal");
    expect(body.channel.provider).toBe("meta_waba");
    expect(body.channel.status).toBe("validating");
    expect(body.channel.isActive).toBe(false);

    const observed=async()=>(await app.inject({url:`/v1/workspaces/${workspaceAId}/channels?includeInactive=true`,headers:{authorization:`Bearer ${adminAToken}`}})).json().channels.find((ch:any)=>ch.id===body.channel.id).revision;
    const subscription=await app.inject({method:"POST",url:`/v1/workspaces/${workspaceAId}/channels/${body.channel.id}/meta-subscription/check`,headers:{authorization:`Bearer ${adminAToken}`},payload:{expectedRevision:await observed()}});expect(subscription.statusCode,subscription.body).toBe(200);expect(subscription.json().subscriptionStatus).toBe("confirmed");
    // Verify session to transition channel to connected
    const verifyWabaRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${body.channel.id}/verify-session`,
      payload: {expectedRevision:(await app.inject({url:`/v1/workspaces/${workspaceAId}/channels?includeInactive=true`,headers:{authorization:`Bearer ${adminAToken}`}})).json().channels.find((ch:any)=>ch.id===body.channel.id).revision,acknowledgedConnection:true},
      headers: { authorization: `Bearer ${adminAToken}` },
    });
    expect(verifyWabaRes.statusCode).toBe(200);
    expect(verifyWabaRes.json().status).toBe("connected");
    expect(verifyWabaRes.json().isActive).toBe(true);

    // Assert zero secret leaks in the response body
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain(rawSecret);
    expect(bodyStr).not.toContain(rawToken);

    // Verify credential persisted in provider_credentials as encrypted payload
    const credRows = await ownerPool.query(
      `SELECT id, provider, account_id, encrypted_payload, iv, auth_tag, status
       FROM provider_credentials
       WHERE workspace_id = $1 AND provider = 'meta_waba';`,
      [workspaceAId]
    );
    expect(credRows.rows.length).toBe(1);
    const cred = credRows.rows[0];
    expect(cred.status).toBe("ACTIVE");
    expect(cred.encrypted_payload).not.toBe(rawToken);
    expect(cred.encrypted_payload).not.toBe(rawSecret);
  });

  it("lists connection status separately from the configured runtime environment", async () => {
    // Also create a WAHA channel in Workspace A
    const wahaRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
      payload: {
        provider: "waha",
        displayName: "Linha Local Lab",
        phoneNumberE164: "+5511999992222",
        credentials: {
          baseUrl: "http://localhost:3000",
          apiKey: "local-waha-key-12345",
        },
      },
    });
    expect(wahaRes.statusCode).toBe(201);

    // Verify WAHA session to transition to connected
    const verifyWahaRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${wahaRes.json().channel.id}/verify-session`,
      payload: {expectedRevision:(await app.inject({url:`/v1/workspaces/${workspaceAId}/channels?includeInactive=true`,headers:{authorization:`Bearer ${adminAToken}`}})).json().channels.find((ch:any)=>ch.id===wahaRes.json().channel.id).revision,acknowledgedConnection:true},
      headers: { authorization: `Bearer ${adminAToken}` },
    });
    expect(verifyWahaRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });

    expect(listRes.statusCode).toBe(200);
    const body = listRes.json();
    expect(body.channels).toBeDefined();
    expect(body.channels.length).toBe(2);

    const waba = body.channels.find((c: any) => c.provider === "meta_waba");
    expect(waba).toBeDefined();
    expect(waba.status).toBe("connected");
    expect(waba.environment).toBe("lab");
    expect(waba.isActive).toBe(true);

    const waha = body.channels.find((c: any) => c.provider === "waha");
    expect(waha).toBeDefined();
    expect(waha.status).toBe("connected");
    expect(waha.environment).toBe("lab");
    expect(waha.isActive).toBe(true);

    // Verify zero credential leaks in channel listing
    const listBodyStr = JSON.stringify(body);
    expect(listBodyStr).not.toContain("local-waha-key-12345");
    expect(listBodyStr).not.toContain("EAABtest_meta_access_token_67890");
  });

  it("fetches WAHA safe QR code for WAHA channel without token leak, and rejects non-WAHA channels", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });
    const channels = listRes.json().channels;
    const wabaChan = channels.find((c: any) => c.provider === "meta_waba");
    const wahaChan = channels.find((c: any) => c.provider === "waha");

    // 1. Fetching QR code for Meta WABA must return 400 Bad Request
    const wabaQrRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels/${wabaChan.id}/qr-code`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });
    expect(wabaQrRes.statusCode).toBe(422);
    expect(wabaQrRes.json().detail).toContain("somente ao WAHA");

    // 2. Fetching QR code for WAHA channel returns safe QR code in lab mode
    const wahaQrRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels/${wahaChan.id}/qr-code`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });
    expect(wahaQrRes.statusCode).toBe(200);
    const qrBody = wahaQrRes.json();
    expect(qrBody.success).toBe(true);
    expect(qrBody.status).toBe("CONNECTED");
    expect(qrBody.qrDataUri).toBeUndefined();
    expect(qrBody.isSimulated).toBe(false);
    // Ensure no apiKey or session token is leaked
    expect(JSON.stringify(qrBody)).not.toContain("local-waha-key-12345");
  });

  it("enforces RBAC: operator without 'workspace:manage' cannot revoke channels", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${operatorAToken}`,
      },
    });
    const channels = listRes.json().channels;
    const chanToRevoke = channels[0];

    const revokeRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${chanToRevoke.id}/revoke`,
      headers: {
        authorization: `Bearer ${operatorAToken}`,
      },
    });

    expect(revokeRes.statusCode).toBe(403);
  });

  it("enforces cross-tenant isolation: Workspace B cannot revoke or access Workspace A channels", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });
    const chanA = listRes.json().channels[0];

    // Admin B attempts to revoke Workspace A channel using Workspace B context
    const crossRevokeRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceBId}/channels/${chanA.id}/revoke`,
      payload: {expectedRevision:chanA.revision},
      headers: {
        authorization: `Bearer ${adminBToken}`,
      },
    });
    // Must fail as Not Found in Workspace B
    expect(crossRevokeRes.statusCode).toBe(404);

    // Admin B attempts to access Workspace A route directly
    const crossDirectRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${chanA.id}/revoke`,
      headers: {
        authorization: `Bearer ${adminBToken}`,
      },
    });
    // Forbidden because Admin B has no membership in Workspace A
    expect(crossDirectRes.statusCode).toBe(403);
  });

  it("revokes channel: updates active status, marks credentials REVOKED, and records security audit log", async () => {
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });
    const wahaChan = listRes.json().channels.find((c: any) => c.provider === "waha");

    const revokeRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${wahaChan.id}/revoke`,
      payload: {expectedRevision:wahaChan.revision},
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });

    expect(revokeRes.statusCode).toBe(200);
    const body = revokeRes.json();
    expect(body.success).toBe(true);
    expect(body.channelId).toBe(wahaChan.id);
    expect(body.status).toBe("revoked");
    expect(body.isActive).toBe(false);

    // Verify channel is_active in DB
    const chanDbRes = await ownerPool.query(
      `SELECT is_active, credential_id FROM channel_instances WHERE id = $1;`,
      [wahaChan.id]
    );
    expect(chanDbRes.rows[0].is_active).toBe(false);

    // Verify credential status is REVOKED
    const credDbRes = await ownerPool.query(
      `SELECT status FROM provider_credentials WHERE id = $1;`,
      [chanDbRes.rows[0].credential_id]
    );
    expect(credDbRes.rows[0].status).toBe("REVOKED");

    // Verify audit_events table has the audit log
    const auditRes = await ownerPool.query(
      `SELECT action, actor_id, resource_type, resource_id, metadata
       FROM audit_events
       WHERE workspace_id = $1 AND action = 'channel.revoked' AND resource_id = $2;`,
      [workspaceAId, wahaChan.id]
    );
    expect(auditRes.rows.length).toBe(1);
    const auditEvent = auditRes.rows[0];
    expect(auditEvent.action).toBe("channel.revoked");
    expect(auditEvent.actor_id).toBe(userAdminAId);
    expect(auditEvent.resource_type).toBe("channel");
    expect(auditEvent.metadata.provider).toBe("waha");

    // Verify subsequent QR code retrieval fails on revoked channel with 409 Conflict
    const qrRevokedRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/channels/${wahaChan.id}/qr-code`,
      headers: {
        authorization: `Bearer ${adminAToken}`,
      },
    });
    expect(qrRevokedRes.statusCode).toBe(409);
    expect(qrRevokedRes.json().detail).toContain("suspenso ou arquivado");
  });
});
