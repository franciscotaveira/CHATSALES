import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import crypto from "node:crypto";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import { BoundedTwoTierRateLimiter } from "../services/redis-rate-limiter";
import type { FastifyInstance } from "fastify";

describe("Outbound Messages Routes Integration (CH-11)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { appPool, ownerPool, workerPool } = createTestDatabasePools();

  let app: FastifyInstance;

  let workspaceAId: string;
  let workspaceBId: string;
  let orgId: string;

  let channelAId: string;
  let channelBId: string;
  let channelInactiveId: string;

  const userOperatorId = crypto.randomUUID();
  const userAnalystId = crypto.randomUUID();

  let operatorToken: string;
  let analystToken: string;

  beforeAll(async () => {
    // 1. Build Fastify app instance
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 2. Provision Organizations and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('API Route Test Org', $1)
      RETURNING id;
    `, [`org-api-${Date.now()}`]);
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Alpha', $2)
      RETURNING id;
    `, [orgId, `ws-alpha-${Date.now()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Beta', $2)
      RETURNING id;
    `, [orgId, `ws-beta-${Date.now()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 3. Provision Users and Memberships
    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $3, 'Operator User'),
        ($2, $4, 'Analyst User')
      ON CONFLICT (id) DO NOTHING;
    `, [
      userOperatorId,
      userAnalystId,
      `op-${Date.now()}@mct.br`,
      `an-${Date.now()}@mct.br`,
    ]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($1, $3, 'analyst')
      ON CONFLICT DO NOTHING;
    `, [workspaceAId, userOperatorId, userAnalystId]);

    // 4. Provision Channel Instances:
    // Channel A (Active, in Workspace A)
    const tokenHashA = crypto.createHash("sha256").update(`token-a-${Date.now()}`).digest("hex");
    const chanARes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Alpha Line', '+5511999991111', $2, true)
      RETURNING id;
    `, [workspaceAId, tokenHashA]);
    channelAId = chanARes.rows[0].id;

    // Channel B (Active, in Workspace B - Cross Tenant)
    const tokenHashB = crypto.createHash("sha256").update(`token-b-${Date.now()}`).digest("hex");
    const chanBRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Beta Line', '+5511999992222', $2, true)
      RETURNING id;
    `, [workspaceBId, tokenHashB]);
    channelBId = chanBRes.rows[0].id;

    // Channel Inactive (Inactive, in Workspace A)
    const tokenHashInact = crypto.createHash("sha256").update(`token-inact-${Date.now()}`).digest("hex");
    const chanInactRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, is_active
      ) VALUES ($1, 'meta_waba', 'Inactive Line', '+5511999993333', $2, false)
      RETURNING id;
    `, [workspaceAId, tokenHashInact]);
    channelInactiveId = chanInactRes.rows[0].id;

    // 5. Generate Signed JWTs
    const secretKey = new TextEncoder().encode(jwtSecret);

    operatorToken = await new SignJWT({
      email: "operator@mct.br",
      role: "operator",
      workspaceId: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userOperatorId)
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);

    analystToken = await new SignJWT({
      email: "analyst@mct.br",
      role: "analyst",
      workspaceId: workspaceAId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userAnalystId)
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("1h")
      .sign(secretKey);
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
    await appPool.end();
    await workerPool.end();
  });

  describe("1. Successful Outbound Creation and Replay (HTTP 201 and 200)", () => {
    it("should return HTTP 201 Created on new outbound request", async () => {
      const idempotencyKey = `http-create-${Date.now()}`;
      const payload = {
        recipientPhoneE164: "+5511999994444",
        contentType: "text",
        body: "Hello from HTTP test",
        idempotencyKey,
      };

      const response = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload,
      });

      expect(response.statusCode).toBe(201);
      const data = response.json();
      expect(data.commandId).toBeDefined();
      expect(data.messageId).toBeDefined();
      expect(data.threadId).toBeDefined();
      expect(data.contactId).toBeDefined();
      expect(data.isIdempotentReplay).toBe(false);
      expect(data.status).toBe("pending");
      expect(data.deliveryStatus).toBe("queued");
    });

    it("should return HTTP 200 OK on identical replay with same idempotencyKey", async () => {
      const idempotencyKey = `http-replay-${Date.now()}`;
      const payload = {
        recipientPhoneE164: "+5511999995555",
        contentType: "text",
        body: "Identical replay body",
        idempotencyKey,
      };

      // 1. First invocation (201)
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload,
      });
      expect(res1.statusCode).toBe(201);
      const first = res1.json();

      // 2. Second invocation (200)
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload,
      });
      expect(res2.statusCode).toBe(200);
      const replay = res2.json();

      expect(replay.isIdempotentReplay).toBe(true);
      expect(replay.commandId).toBe(first.commandId);
      expect(replay.messageId).toBe(first.messageId);
      expect(replay.contactId).toBe(first.contactId);
      expect(replay.threadId).toBe(first.threadId);
    });

    it("should return HTTP 409 Conflict when reusing idempotencyKey with different body", async () => {
      const idempotencyKey = `http-conflict-${Date.now()}`;

      // 1. First invocation
      await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999996666",
          contentType: "text",
          body: "Original body",
          idempotencyKey,
        },
      });

      // 2. Second invocation with different body
      const resConflict = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999996666",
          contentType: "text",
          body: "Modified conflicting body",
          idempotencyKey,
        },
      });

      expect(resConflict.statusCode).toBe(409);
      const errorBody = resConflict.json();
      expect(errorBody.title).toBe("Conflict");
      expect(errorBody.detail).toMatch(/Idempotency key/);
    });

    it("should return HTTP 409 Conflict when replaying with subtle whitespace difference (exact semantics without trim)", async () => {
      const idempotencyKey = `exact-sem-${Date.now()}`;
      // 1. Initial send
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999991234",
          contentType: "text",
          body: "Mensagem Exata",
          idempotencyKey,
        },
      });
      expect(res1.statusCode).toBe(201);

      // 2. Replay with leading/trailing spaces in body
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999991234",
          contentType: "text",
          body: " Mensagem Exata ",
          idempotencyKey,
        },
      });
      expect(res2.statusCode).toBe(409);
      expect(res2.json().title).toBe("Conflict");
    });
  });

  describe("2. Security Boundary & Strict Schema", () => {
    it("should return HTTP 400 Bad Request if injected authority fields are in the body (.strict())", async () => {
      const payloadWithInjectedAuthority = {
        recipientPhoneE164: "+5511999997777",
        contentType: "text",
        body: "Malicious injection attempt",
        idempotencyKey: `exploit-${Date.now()}`,
        workspaceId: crypto.randomUUID(), // Unauthorized authority field!
        role: "owner",                   // Unauthorized authority field!
        actorId: crypto.randomUUID(),    // Unauthorized authority field!
      };

      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: payloadWithInjectedAuthority,
      });

      expect(res.statusCode).toBe(400);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Bad Request");
      expect(errorBody.detail).toMatch(/unrecognized/i);
    });

    it("should return HTTP 400 Bad Request on SSRF mediaUrl attempt", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999998888",
          contentType: "image",
          body: "SSRF image",
          mediaUrl: "https://192.168.1.1/exploit.jpg",
          idempotencyKey: `ssrf-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(400);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Bad Request");
      expect(errorBody.detail).toMatch(/SSRF protection rejected mediaUrl/);
    });

    it("should return HTTP 403 Forbidden for analyst role lacking cockpit:send_message", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${analystToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999999999",
          contentType: "text",
          body: "Analyst attempt",
          idempotencyKey: `analyst-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Forbidden");
      expect(errorBody.detail).toMatch(/does not possess required permission 'cockpit:send_message'/);
    });

    it("should return HTTP 404 Not Found indistinguishable for cross-tenant channelInstanceId", async () => {
      // Channel B belongs to Workspace B, but operator is sending under Workspace A
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelBId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990000",
          contentType: "text",
          body: "Cross-tenant probe",
          idempotencyKey: `xtenant-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(404);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Not Found");
      expect(errorBody.detail).toMatch(/not found/i);
    });

    it("should return HTTP 422 Unprocessable Entity for inactive channel", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelInactiveId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Inactive channel test",
          idempotencyKey: `inact-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(422);
      const errorBody = res.json();
      expect(errorBody.title).toBe("Unprocessable Entity");
      expect(errorBody.detail).toMatch(/is marked as inactive/);
    });

    it("should return HTTP 403 Forbidden when activeRole is missing or user has no workspace membership", async () => {
      const orphanUserId = crypto.randomUUID();
      await ownerPool.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, 'Orphan') ON CONFLICT DO NOTHING;`,
        [orphanUserId, `orphan-${Date.now()}@mct.br`]
      );
      const orphanToken = await new SignJWT({
        email: "orphan@mct.br",
        role: "operator",
        workspaceId: workspaceAId,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(orphanUserId)
        .setIssuer(testIssuer)
        .setAudience(testAudience)
        .setExpirationTime("1h")
        .sign(crypto.createSecretKey(Buffer.from(jwtSecret, "utf-8")));

      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${orphanToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Orphan message",
          idempotencyKey: `orphan-${Date.now()}`,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("should return HTTP 403 and never reach producerService when activeRole is invalid", async () => {
      const invalidRoleUserId = crypto.randomUUID();
      await ownerPool.query(
        `INSERT INTO users (id, email, name) VALUES ($1, $2, 'Guest User') ON CONFLICT DO NOTHING;`,
        [invalidRoleUserId, `guest-${Date.now()}@mct.br`]
      );
      await ownerPool.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'guest') ON CONFLICT DO NOTHING;`,
        [workspaceAId, invalidRoleUserId]
      );
      const invalidRoleToken = await new SignJWT({
        email: "guest@mct.br",
        role: "guest",
        workspaceId: workspaceAId,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(invalidRoleUserId)
        .setIssuer(testIssuer)
        .setAudience(testAudience)
        .setExpirationTime("1h")
        .sign(crypto.createSecretKey(Buffer.from(jwtSecret, "utf-8")));

      const mockProducer = {
        produce: vi.fn(),
      };

      const testApp = await buildApp({
        providerType: "local-jwt",
        jwtSecret,
        issuer: testIssuer,
        audience: testAudience,
        outboundProducerService: mockProducer as any,
      });

      const res = await testApp.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${invalidRoleToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Invalid role probe",
          idempotencyKey: `invalid-role-${Date.now()}`,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(mockProducer.produce).not.toHaveBeenCalled();
      await testApp.close();
    });
  });

  describe("Advanced template component integrity", () => {
    it("rejects a missing media header and retains a verified layout snapshot for a valid message", async () => {
      const name = `sim_components_${Date.now()}`;
      await ownerPool.query(`INSERT INTO message_templates
        (workspace_id,name,category,body_text,status,language,meta_template_id,meta_verified_at,meta_verified_channel_id,provider_components)
        VALUES($1,$2,'UTILITY','Pedido {{1}}','APPROVED','pt_BR','SIM_PROVIDER_ID',NOW(),$3,$4::jsonb)`,
        [workspaceAId,name,channelAId,JSON.stringify([{type:'HEADER',format:'IMAGE'},{type:'BODY',text:'Pedido {{1}}'},{type:'BUTTONS',buttons:[{type:'URL',text:'Ver pedido',url:'https://example.com/{{1}}'}]}])]);
      const send = (components: unknown[], key: string) => app.inject({method:'POST',
        url:`/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers:{authorization:`Bearer ${operatorToken}`,'x-workspace-id':workspaceAId},
        payload:{recipientPhoneE164:'+5500000000001',contentType:'text',body:'SIMULADO — Pedido 42',idempotencyKey:key,
          template:{name,language:'pt_BR',components}}});
      const body = {type:'body',parameters:[{type:'text',text:'42'}]};
      const button = {type:'button',sub_type:'url',index:0,parameters:[{type:'text',text:'42'}]};
      const rejected = await send([body,button],`sim-missing-${Date.now()}`);
      expect(rejected.statusCode,rejected.body).toBe(400);
      const valid = await send([{type:'header',parameters:[{type:'image',image:{link:'https://example.com/sim.png'}}]},body,button],`sim-valid-${Date.now()}`);
      expect(valid.statusCode,valid.body).toBe(201);
      const stored = await ownerPool.query('SELECT metadata FROM messages WHERE id=$1',[valid.json().messageId]);
      expect(stored.rows[0].metadata.systemTemplateLayoutHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("4. Distributed Rate Limiting (IRateLimiter)", () => {
    it("should enforce per-IP rate limit returning HTTP 429 with correct headers and block producer call", async () => {
      const mockProducer = {
        produce: vi.fn().mockResolvedValue({
          messageId: crypto.randomUUID(),
          commandId: crypto.randomUUID(),
          threadId: crypto.randomUUID(),
          contactId: crypto.randomUUID(),
          idempotencyKey: "rate-key",
          status: "pending",
          deliveryStatus: "queued",
          isIdempotentReplay: false,
          createdAt: new Date().toISOString(),
        }),
      };

      const testRateLimiter = new BoundedTwoTierRateLimiter({
        maxIpRequests: 2,
        maxChannelRequests: 10,
        windowMs: 60_000,
      });

      const rateLimitApp = await buildApp({
        providerType: "local-jwt",
        jwtSecret,
        issuer: testIssuer,
        audience: testAudience,
        rateLimiter: testRateLimiter,
        rateLimitMax: 2,
        rateLimitWindowMs: 60_000,
        outboundProducerService: mockProducer as any,
      });

      // 1st request -> 201
      const res1 = await rateLimitApp.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Req 1",
          idempotencyKey: `rl-ip-1-${Date.now()}`,
        },
      });
      expect(res1.statusCode).toBe(201);
      expect(res1.headers["x-ratelimit-limit"]).toBeDefined();

      // 2nd request -> 201
      const res2 = await rateLimitApp.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Req 2",
          idempotencyKey: `rl-ip-2-${Date.now()}`,
        },
      });
      expect(res2.statusCode).toBe(201);

      // 3rd request from same IP -> 429 Too Many Requests
      const res3 = await rateLimitApp.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Req 3",
          idempotencyKey: `rl-ip-3-${Date.now()}`,
        },
      });
      expect(res3.statusCode).toBe(429);
      expect(res3.headers["retry-after"]).toBeDefined();
      expect(res3.headers["x-ratelimit-limit"]).toBe("2");
      expect(res3.headers["x-ratelimit-remaining"]).toBe("0");

      const body3 = res3.json();
      expect(body3.title).toBe("Too Many Requests");
      expect(body3.detail).toMatch(/client IP/i);

      // Verify producer was only called twice (not called for the blocked 3rd request)
      expect(mockProducer.produce).toHaveBeenCalledTimes(2);

      await rateLimitApp.close();
    });

    it("should enforce per-composite actor/channel rate limit and ensure workspaces do not share quota", async () => {
      const testRateLimiter = new BoundedTwoTierRateLimiter({
        maxIpRequests: 100,
        maxChannelRequests: 2,
        windowMs: 60_000,
      });

      const rateLimitApp = await buildApp({
        providerType: "local-jwt",
        jwtSecret,
        issuer: testIssuer,
        audience: testAudience,
        rateLimiter: testRateLimiter,
        rateLimitMax: 100,
        rateLimitWindowMs: 60_000,
      });

      // Provision operator in Workspace B as well
      await ownerPool.query(`
        INSERT INTO workspace_memberships (workspace_id, user_id, role)
        VALUES ($1, $2, 'operator')
        ON CONFLICT DO NOTHING;
      `, [workspaceBId, userOperatorId]);

      const operatorTokenWsB = await new SignJWT({
        email: "operator@mct.br",
        role: "operator",
        workspaceId: workspaceBId,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userOperatorId)
        .setIssuer(testIssuer)
        .setAudience(testAudience)
        .setExpirationTime("1h")
        .sign(crypto.createSecretKey(Buffer.from(jwtSecret, "utf-8")));

      // 2 requests under Workspace A on channelA
      for (let i = 1; i <= 2; i++) {
        const res = await rateLimitApp.inject({
          method: "POST",
          url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
          headers: {
            authorization: `Bearer ${operatorToken}`,
            "x-workspace-id": workspaceAId,
          },
          payload: {
            recipientPhoneE164: "+5511999990001",
            contentType: "text",
            body: `Msg A${i}`,
            idempotencyKey: `wsA-lim-${i}-${Date.now()}`,
          },
        });
        expect(res.statusCode).toBe(201);
      }

      // 3rd request under Workspace A -> 429
      const res3 = await rateLimitApp.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-workspace-id": workspaceAId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Msg A3",
          idempotencyKey: `wsA-lim-3-${Date.now()}`,
        },
      });
      expect(res3.statusCode).toBe(429);
      expect(res3.json().detail).toMatch(/actor and channel in workspace/i);

      // Now send under Workspace B on channelB: MUST SUCCEED (quota is isolated per workspace)
      const resWsB = await rateLimitApp.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceBId}/channels/${channelBId}/messages`,
        headers: {
          authorization: `Bearer ${operatorTokenWsB}`,
          "x-workspace-id": workspaceBId,
        },
        payload: {
          recipientPhoneE164: "+5511999990001",
          contentType: "text",
          body: "Msg B1",
          idempotencyKey: `wsB-lim-1-${Date.now()}`,
        },
      });
      expect(resWsB.statusCode).toBe(201);

      await rateLimitApp.close();
    });
  });
});
