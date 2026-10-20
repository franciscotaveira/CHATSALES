import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import type { FastifyInstance } from "fastify";

const providerMock=vi.hoisted(()=>({fetch:vi.fn()}));
vi.mock('@sos-sales/application',async original=>({...await original<typeof import('@sos-sales/application')>(),safeFetchWithSsrfGuard:(...args:unknown[])=>providerMock.fetch(...args)}));
providerMock.fetch.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('/api/sessions/')?{name:decodeURIComponent(url.split('/api/sessions/')[1]!.split('/')[0]!),status:'WORKING',me:{id:'551130000000@c.us'}}:{id:'SIM-meta-phone-id',display_phone_number:'551130000000'}),{status:200,headers:{'content-type':'application/json'}}));

describe("R2 Security Hardening Integration (SSRF, State Machine, Keyring, Least Privilege)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { ownerPool, appPool, workerPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceId: string;
  let orgId: string;
  let adminUserId: string;
  let adminToken: string;

  beforeAll(async () => {
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 1. Provision Org & Workspace
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('R2 Security Org', $1)
       RETURNING id;`,
      [`org-r2-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(
      `INSERT INTO workspaces (organization_id, name, slug)
       VALUES ($1, 'R2 Security Workspace', $2)
       RETURNING id;`,
      [orgId, `ws-r2-${Date.now()}`]
    );
    workspaceId = wsRes.rows[0].id;

    // 2. Admin User
    adminUserId = crypto.randomUUID();
    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES ($1, $2, 'Security Admin');`,
      [adminUserId, `admin-r2-${Date.now()}@example.com`]
    );
    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'admin');`,
      [workspaceId, adminUserId]
    );

    const encoder = new TextEncoder();
    adminToken = await new SignJWT({
      sub: adminUserId,
      email: "security-admin@example.com",
      workspace_id: workspaceId,
      role: "admin",
      permissions: ["workspace:manage", "workspace:read"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(encoder.encode(jwtSecret));
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
    await appPool.end();
    await workerPool.end();
  });

  describe("S-01: SSRF Guard on Channel Endpoints", () => {
    it("should reject WAHA test connection pointing to metadata/loopback with HTTP 400", async () => {
      const oldEnv = process.env.NODE_ENV;
      const oldAllow = process.env.ALLOW_LOCAL_NETWORK_CHANNELS;
      const oldLab = process.env.ENABLE_LAB_SYNTHETIC;
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_LOCAL_NETWORK_CHANNELS;
      delete process.env.ENABLE_LAB_SYNTHETIC;

      try {
        const res = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspaceId}/channels/test-connection`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          payload: {
            provider: "waha",
            credentials: {
              baseUrl: "http://169.254.169.254/latest/meta-data",
              apiKey: "mock-key",
            },
          },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/SSRF|privado|link-local|BLOCKED/i);
      } finally {
        process.env.NODE_ENV = oldEnv;
        if (oldAllow !== undefined) process.env.ALLOW_LOCAL_NETWORK_CHANNELS = oldAllow;
        if (oldLab !== undefined) process.env.ENABLE_LAB_SYNTHETIC = oldLab;
      }
    });

    it("should reject Evolution test connection pointing to internal host with HTTP 400", async () => {
      const oldEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_LOCAL_NETWORK_CHANNELS;
      delete process.env.ENABLE_LAB_SYNTHETIC;

      try {
        const res = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspaceId}/channels/test-connection`,
          headers: {
            authorization: `Bearer ${adminToken}`,
            "content-type": "application/json",
          },
          payload: {
            provider: "evolution",
            credentials: {
              baseUrl: "http://10.0.0.5:8080",
              apiKey: "mock-evolution-key",
            },
          },
        });

        expect(res.statusCode).toBe(400);
        const body = JSON.parse(res.body);
        expect(body.success).toBe(false);
        expect(body.error).toMatch(/SSRF|privado|BLOCKED/i);
      } finally {
        process.env.NODE_ENV = oldEnv;
      }
    });
  });

  describe("S-02: Channel State Machine Lifecycle & Active Sync Invariant", () => {
    let createdChannelId: string;

    it("should create channel in unconfigured status with is_active = false", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          provider: "waha",
          displayName: "Support WhatsApp WAHA",
          phoneNumberE164: "+5511988887777",
          status: "unconfigured",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.channel).toBeDefined();
      expect(body.channel.id).toBeDefined();
      expect(body.channel.status).toBe("unconfigured");
      expect(body.channel.isActive).toBe(false);
      createdChannelId = body.channel.id;

      // Verify in DB directly
      const dbCheck = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [createdChannelId]
      );
      expect(dbCheck.rows[0].status).toBe("unconfigured");
      expect(dbCheck.rows[0].is_active).toBe(false);
    });

    it("keeps a validating channel inactive when QR credentials are missing", async () => {
      // Legacy status edits cannot manufacture a validating state.
      const resVal = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "validating" },
      });
      expect(resVal.statusCode).toBe(410);

      // Step 2: direct client transition to pairing or connected is prohibited (400 Bad Request)
      const resPairDirect = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "pairing" },
      });
      expect(resPairDirect.statusCode).toBe(400);
      expect(JSON.parse(resPairDirect.body).detail).toMatch(/prohibited/i);

      const resConnDirect = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "connected" },
      });
      expect(resConnDirect.statusCode).toBe(400);
      expect(JSON.parse(resConnDirect.body).detail).toMatch(/prohibited/i);

      // QR consultation stays read-only even when credentials are missing.
      const resQr = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/qr-code`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(resQr.statusCode).toBe(422);
      const dbCheckPair = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [createdChannelId]
      );
      expect(dbCheckPair.rows[0].status).toBe("unconfigured");
      expect(dbCheckPair.rows[0].is_active).toBe(false);
    });

    it("should transition to connected only via POST /verify-session with active credentials and set is_active = true", async () => {
      // 1. Create a channel with credentials -> starts in validating, is_active = false
      const resChan = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          provider: "waha",
          displayName: "Verified WAHA Channel",
          credentials: {
            baseUrl: "https://waha.example.com",
            apiKey: "waha-secret-key-12345",
          },
        },
      });
      expect(resChan.statusCode).toBe(201);
      const chan = JSON.parse(resChan.body).channel;
      expect(chan.status).toBe("validating");
      expect(chan.isActive).toBe(false);

      // 2. Execute server-side verify-session handshake -> transitions to connected with is_active = true
      const resVerify = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels/${chan.id}/verify-session`,
      payload: {expectedRevision:(await app.inject({url:`/v1/workspaces/${workspaceId}/channels?includeInactive=true`,headers:{authorization:`Bearer ${adminToken}`}})).json().channels.find((ch:any)=>ch.id===chan.id).revision,acknowledgedConnection:true},
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(resVerify.statusCode).toBe(200);
      const verifyBody = JSON.parse(resVerify.body);
      expect(verifyBody.success).toBe(true);
      expect(verifyBody.status).toBe("connected");
      expect(verifyBody.isActive).toBe(true);

      const dbCheck = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [chan.id]
      );
      expect(dbCheck.rows[0].status).toBe("connected");
      expect(dbCheck.rows[0].is_active).toBe(true);
    });

    it("should transition to revoked via POST /revoke endpoint and sync is_active = false", async () => {
      const resRev = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/revoke`,
        payload: {expectedRevision:(await app.inject({url:`/v1/workspaces/${workspaceId}/channels?includeInactive=true`,headers:{authorization:`Bearer ${adminToken}`}})).json().channels.find((channel:any)=>channel.id===createdChannelId).revision},
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });
      expect(resRev.statusCode).toBe(200);
      const body = JSON.parse(resRev.body);
      expect(body.success).toBe(true);
      expect(body.status).toBe("revoked");

      const dbCheck = await ownerPool.query(
        `SELECT status, is_active FROM channel_instances WHERE id = $1;`,
        [createdChannelId]
      );
      expect(dbCheck.rows[0].status).toBe("revoked");
      expect(dbCheck.rows[0].is_active).toBe(false);
    });

    it("should reject invalid status with HTTP 400 Bad Request", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/channels/${createdChannelId}/status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: { status: "non_existent_status" },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("S-03: Keyring Version Persistence & Rotation Decryption", () => {
    it("should persist key_version when configuring provider credentials", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/channels`,
        headers: {
          authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        payload: {
          provider: "waha",
          displayName: "WAHA Keyring Channel",
          credentials: {
            baseUrl: "https://waha.example.com",
            apiKey: "waha-secret-key-12345",
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const created = JSON.parse(res.body);
      expect(created.channel.id).toBeDefined();

      const credRow = await ownerPool.query(
        `SELECT key_version, status FROM provider_credentials WHERE workspace_id = $1 AND account_id = 'waha_keyring_channel';`,
        [workspaceId]
      );

      expect(credRow.rows.length).toBe(1);
      expect(credRow.rows[0].key_version).toBeDefined();
      expect(credRow.rows[0].key_version.length).toBeGreaterThan(0);
      expect(credRow.rows[0].status).toBe("ACTIVE");
    });
  });

  describe("S-04: Operational Table Immutability & Worker RLS Fail-Closed", () => {
    it("should forbid DELETE on pix_charges for application/appPool user", async () => {
      await expect(
        appPool.query(`DELETE FROM pix_charges WHERE workspace_id = $1;`, [workspaceId])
      ).rejects.toThrow(/permission denied for table pix_charges/i);
    });

    it("should forbid DELETE on commercial_proposals for application/appPool user", async () => {
      await expect(
        appPool.query(`DELETE FROM commercial_proposals WHERE workspace_id = $1;`, [workspaceId])
      ).rejects.toThrow(/permission denied for table commercial_proposals/i);
    });

    it("should forbid DELETE on commercial_outcomes for application/appPool user", async () => {
      await expect(
        appPool.query(`DELETE FROM commercial_outcomes WHERE workspace_id = $1;`, [workspaceId])
      ).rejects.toThrow(/permission denied for table commercial_outcomes/i);
    });

    it("should enforce fail-closed RLS on workerPool when workspace context is unset", async () => {
      const contactRes = await ownerPool.query(
        `INSERT INTO contacts (workspace_id, name, phone_e164) VALUES ($1, 'RLS Contact', '+5511999990001') RETURNING id;`,
        [workspaceId]
      );
      const contactId = contactRes.rows[0].id;

      const tokenHash = crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex");
      const chanRes = await ownerPool.query(
        `INSERT INTO channel_instances (workspace_id, provider, display_name, status, is_active, endpoint_token_hash)
         VALUES ($1, 'waha', 'Worker Test Channel', 'unconfigured', false, $2) RETURNING id;`,
        [workspaceId, tokenHash]
      );
      const chanId = chanRes.rows[0].id;

      const threadRes = await ownerPool.query(
        `INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
         VALUES ($1, $2, $3, 'active') RETURNING id;`,
        [workspaceId, chanId, contactId]
      );
      const threadId = threadRes.rows[0].id;

      await ownerPool.query(
        `INSERT INTO commercial_journeys (workspace_id, thread_id, contact_id, stage, status, title)
         VALUES ($1, $2, $3, 'lead', 'open', 'Worker RLS Journey') RETURNING id;`,
        [workspaceId, threadId, contactId]
      );

      // Querying with workerPool without setting app.current_workspace_id returns 0 rows (fail-closed)
      const unauthWorker = await workerPool.query(
        `SELECT count(*)::int as count FROM commercial_journeys WHERE workspace_id = $1;`,
        [workspaceId]
      );
      expect(unauthWorker.rows[0].count).toBe(0);

      // Querying with workerPool after setting app.current_workspace_id returns the journey
      const client = await workerPool.connect();
      try {
        await client.query("BEGIN;");
        await client.query(`SET LOCAL app.current_workspace_id = '${workspaceId}';`);
        const authWorker = await client.query(
          `SELECT count(*)::int as count FROM commercial_journeys WHERE workspace_id = $1;`,
          [workspaceId]
        );
        expect(authWorker.rows[0].count).toBe(1);
        await client.query("ROLLBACK;");
      } finally {
        client.release();
      }
    });
  });
});
