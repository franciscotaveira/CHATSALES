import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabasePools,
  resetTestQueueState,
} from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Integration Routes (F1.1-C Radar Hardening & Final Governance)", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const { ownerPool, ingressPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let operatorAId: string;
  let integrationUserId: string;

  let tokenOperatorA: string;
  let tokenIntegrationService: string;
  let tokenOperatorB: string;

  let contactAId: string;
  let channelAId: string;
  let threadAId: string;

  async function fetchCandidateRevision(wsId: string, threadId: string): Promise<string> {
    const candRes = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${wsId}/integrations/candidates`,
      headers: { authorization: `Bearer ${tokenIntegrationService}` },
    });
    expect(candRes.statusCode).toBe(200);
    const items = candRes.json().items;
    const item = items.find((c: any) => c.threadId === threadId);
    if (!item) throw new Error(`Candidate not found for thread ${threadId}`);
    return item.candidateRevision;
  }

  async function createTestThread(wsId: string, hoursAgo: number = 3): Promise<{ contactId: string; threadId: string }> {
    const cRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name, opt_out)
      VALUES ($1, $2, 'Lead Candidate', false)
      RETURNING id;
    `, [wsId, `+554998888${Math.floor(1000 + Math.random() * 9000)}`]);
    const contactId = cRes.rows[0].id;

    const tRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status, last_message_at)
      VALUES ($1, $2, $3, 'active', now() - ($4 || ' hours')::interval)
      RETURNING id;
    `, [wsId, channelAId, contactId, hoursAgo]);
    const threadId = tRes.rows[0].id;

    await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, created_at
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'inbound',
        '+5549988880002', '+5549988880001', 'text',
        'Mensagem inbound do lead', now() - ($4 || ' hours')::interval
      );
    `, [wsId, channelAId, threadId, hoursAgo]);

    return { contactId, threadId };
  }

  beforeAll(async () => {
    await resetTestQueueState(ownerPool);

    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
      masterKeyHex: testMasterKey,
      ingressPool,
    });

    // 1. Provision Organization and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('F1.1-C Radar Route Org', $1)
      RETURNING id;
    `, [`radar-route-org-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, radar_enabled, radar_cooldown_seconds, radar_rule_version)
      VALUES ($1, 'Workspace Radar Alpha', $2, true, 86400, '1.0.0')
      RETURNING id;
    `, [orgId, `radar-ws-a-${crypto.randomUUID()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug, radar_enabled, radar_cooldown_seconds, radar_rule_version)
      VALUES ($1, 'Workspace Radar Beta', $2, true, 86400, '1.0.0')
      RETURNING id;
    `, [orgId, `radar-ws-b-${crypto.randomUUID()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Provision Users & Memberships
    operatorAId = crypto.randomUUID();
    integrationUserId = crypto.randomUUID();
    const operatorBId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $4, 'Radar Operator A'),
        ($2, $5, 'n8n Integration Service'),
        ($3, $6, 'Radar Operator B');
    `, [
      operatorAId,
      integrationUserId,
      operatorBId,
      `op-a-${crypto.randomUUID()}@mct.br`,
      `n8n-svc-${crypto.randomUUID()}@mct.br`,
      `op-b-${crypto.randomUUID()}@mct.br`,
    ]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($1, $3, 'integration_service'),
        ($4, $5, 'operator');
    `, [workspaceAId, operatorAId, integrationUserId, workspaceBId, operatorBId]);

    // 3. Provision Channel & Contact & Thread
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
      ) VALUES (
        $1, 'meta_waba', 'Canal Radar WABA', '+5549988880001',
        $2, true
      ) RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex")]);
    channelAId = chanRes.rows[0].id;

    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name, opt_out)
      VALUES ($1, '+5549988880002', 'Contato Radar Lead', false)
      RETURNING id;
    `, [workspaceAId]);
    contactAId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (
        workspace_id, channel_instance_id, contact_id, status, last_message_at
      ) VALUES ($1, $2, $3, 'active', now() - interval '3 hours')
      RETURNING id;
    `, [workspaceAId, channelAId, contactAId]);
    threadAId = threadRes.rows[0].id;

    await ownerPool.query(`
      INSERT INTO messages (
        workspace_id, channel_instance_id, thread_id, provider, direction,
        sender_e164, recipient_e164, content_type, body, created_at
      ) VALUES (
        $1, $2, $3, 'meta_waba', 'inbound',
        '+5549988880002', '+5549988880001', 'text',
        'Olá, quero proposta para consultoria', now() - interval '3 hours'
      );
    `, [workspaceAId, channelAId, threadAId]);

    // 4. Issue JWTs
    tokenOperatorA = await new SignJWT({
      sub: operatorAId,
      workspace_id: workspaceAId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    tokenIntegrationService = await new SignJWT({
      sub: integrationUserId,
      workspace_id: workspaceAId,
      role: "integration_service",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    tokenOperatorB = await new SignJWT({
      sub: operatorBId,
      workspace_id: workspaceBId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));
  });

  afterAll(async () => {
    await app.close();
    await ownerPool.end();
  });

  describe("1. Candidate-Suggestion Link & Server-Owned Contract", () => {
    it("returns 409 CANDIDATE_STALE and inserts ZERO rows when message arrives between candidate read and POST", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 4);

      // Step 1: Read candidate revision
      const staleRev = await fetchCandidateRevision(workspaceAId, threadId);

      // Step 2: New message arrives
      await ownerPool.query(`
        INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988880002', '+5549988880001', 'text', 'Mensagem rápida', now());
      `, [workspaceAId, channelAId, threadId]);
      await ownerPool.query(`UPDATE commercial_threads SET last_message_at = now() WHERE id = $1;`, [threadId]);

      // Step 3: POST with stale revision -> 409 CANDIDATE_STALE
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `stale-cand-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: staleRev,
          title: "Follow-up",
          body: "Corpo",
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe("CANDIDATE_STALE");

      // Step 4: Verify 0 rows in database
      const countRes = await ownerPool.query(
        `SELECT COUNT(*)::text as count FROM integration_suggestions WHERE workspace_id = $1 AND thread_id = $2;`,
        [workspaceAId, threadId]
      );
      expect(countRes.rows[0].count).toBe("0");
    });

    it("creates suggestion with server-owned snapshot when candidateRevision matches current facts", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 4);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `valid-cand-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Follow-up Seguro",
          body: "Corpo seguro",
          draftMessage: "Olá!",
        },
      });

      expect(res.statusCode).toBe(201);
      const data = res.json();
      expect(data.moduleKey).toBe("radar_m01");
      expect(data.ruleVersion).toBe("1.0.0");
      expect(data.source).toBe("n8n");
      expect(data.originSnapshot.candidateRevision).toBe(currentRev);
    });

    it("rejects public creation payload without candidateRevision (400 Bad Request)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `missing-rev-${crypto.randomUUID()}`,
          threadId: threadAId,
          title: "Sem Revisão",
          body: "Corpo",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().title).toBe("Bad Request");
    });

    it("rejects public creation payload with forbidden fields: source, moduleKey, ruleVersion, metadata, originSnapshot (400 Bad Request)", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 4);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const forbiddenFields = [
        { source: "manual" },
        { moduleKey: "radar_m01" },
        { ruleVersion: "1.0.0" },
        { metadata: { custom: true } },
        { originSnapshot: { threadId } },
      ];

      for (const field of forbiddenFields) {
        const res = await app.inject({
          method: "POST",
          url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
          headers: { authorization: `Bearer ${tokenIntegrationService}` },
          payload: {
            idempotencyKey: `forbidden-${crypto.randomUUID()}`,
            threadId,
            contactId,
            candidateRevision: currentRev,
            title: "Teste Proibido",
            body: "Corpo",
            ...field,
          },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json().title).toBe("Bad Request");
      }
    });

    it("rejects candidate query with moduleKey (400 Bad Request strict schema)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates?moduleKey=radar_m01`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().title).toBe("Bad Request");
    });
  });

  describe("2. Governance Revalidation on Decision (Kill-Switch, Inactivity, Stale Rule)", () => {
    it("returns 409 RULE_VERSION_STALE and persists invalidated state when rule version changes before decision", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 4);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `rule-ver-change-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão v1.0",
          body: "Corpo",
        },
      });
      expect(createRes.statusCode).toBe(201);
      const sugId = createRes.json().id;

      // Bump workspace rule version
      await ownerPool.query(`UPDATE workspaces SET radar_rule_version = '2.0.0' WHERE id = $1;`, [workspaceAId]);

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${sugId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(patchRes.statusCode).toBe(409);
      expect(patchRes.json().code).toBe("RULE_VERSION_STALE");

      // Verify DB persistence
      const dbRow = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [sugId]);
      expect(dbRow.rows[0].status).toBe("invalidated");
      expect(dbRow.rows[0].state_version).toBe(2);
      expect(dbRow.rows[0].metadata.rejection_code).toBe("RULE_VERSION_STALE");

      // Restore workspace rule version
      await ownerPool.query(`UPDATE workspaces SET radar_rule_version = '1.0.0' WHERE id = $1;`, [workspaceAId]);
    });

    it("returns 409 MODULE_DISABLED and persists invalidated state when radar is disabled before decision", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 4);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `radar-kill-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Pré-Desativação",
          body: "Corpo",
        },
      });
      const sugId = createRes.json().id;

      // Disable radar
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = false WHERE id = $1;`, [workspaceAId]);

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${sugId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(patchRes.statusCode).toBe(409);
      expect(patchRes.json().code).toBe("MODULE_DISABLED");

      // Verify DB persistence
      const dbRow = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [sugId]);
      expect(dbRow.rows[0].status).toBe("invalidated");
      expect(dbRow.rows[0].metadata.rejection_code).toBe("MODULE_DISABLED");

      // Restore radar
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = true WHERE id = $1;`, [workspaceAId]);
    });

    it("returns 409 WORKSPACE_INACTIVE and persists invalidated state when workspace is deactivated before decision", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 4);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `ws-inact-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão WS Inativo",
          body: "Corpo",
        },
      });
      const sugId = createRes.json().id;

      // Deactivate workspace
      await ownerPool.query(`UPDATE workspaces SET is_active = false WHERE id = $1;`, [workspaceAId]);

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${sugId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(patchRes.statusCode).toBe(409);
      expect(patchRes.json().code).toBe("WORKSPACE_INACTIVE");

      const dbRow = await ownerPool.query(`SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;`, [sugId]);
      expect(dbRow.rows[0].status).toBe("invalidated");
      expect(dbRow.rows[0].metadata.rejection_code).toBe("WORKSPACE_INACTIVE");

      // Restore workspace
      await ownerPool.query(`UPDATE workspaces SET is_active = true WHERE id = $1;`, [workspaceAId]);
    });
  });

  describe("3. Comprehensive RBAC Matrix for integration_service (Read vs Mutation)", () => {
    it("ALLOWS candidates list (GET /integrations/candidates -> 200)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toBeDefined();
    });

    it("ALLOWS thread journey view (GET /threads/:id/journey -> 200)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/journey`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it("DENIES outbound message dispatch (POST /messages -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/channels/${channelAId}/messages`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          recipientE164: "+5549988880002",
          body: "Tentativa de envio direto não autorizada pelo n8n",
          idempotencyKey: `deny-send-${crypto.randomUUID()}`,
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES suggestion internal list (GET /suggestions -> 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES suggestion decision (PATCH /suggestions/:id -> 403)", async () => {
      const currentRev = await fetchCandidateRevision(workspaceAId, threadAId);
      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `decide-deny-${crypto.randomUUID()}`,
          threadId: threadAId,
          contactId: contactAId,
          candidateRevision: currentRev,
          title: "Para teste",
          body: "Corpo",
        },
      });
      const sugId = createRes.json().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${sugId}`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { status: "accepted", stateVersion: 1 },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES suggestion count badge (GET /suggestions/count -> 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/count`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES commercial journey creation (POST /journeys -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          contactId: contactAId,
          threadId: threadAId,
          title: "Tentativa de Criar Jornada",
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES commercial outcome registration (POST /journeys/:id/outcomes -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/journeys/${crypto.randomUUID()}/outcomes`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { status: "won", valueCents: 50000 },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES pix charge creation (POST /threads/:id/pix-charges -> 403)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/threads/${threadAId}/pix-charges`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: { contactId: contactAId, title: "Tentativa Pix", amountCents: 5000 },
      });
      expect(res.statusCode).toBe(403);
    });

    it("DENIES conversion events audit/dispatch (GET /conversions -> 403)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/conversions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("4. Query Parameters & Cursor Validation", () => {
    it("returns 400 Bad Request with code INVALID_CURSOR when cursor is malformed", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates?cursor=invalid-cursor-bad-data`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });

      expect(res.statusCode).toBe(400);
      const json = res.json();
      expect(json.code).toBe("INVALID_CURSOR");
      expect(json.title).toBe("Bad Request");
    });

    it("returns 400 Bad Request when candidates query parameters violate bounds", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates?minHoursSinceLastMessage=-5`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().title).toBe("Bad Request");
    });

    it("returns 400 Bad Request when limit exceeds maximum limit (100)", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/candidates?limit=500`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().title).toBe("Bad Request");
    });
  });

  describe("5. Origin Revalidation & Invariant on Decision", () => {
    it("returns 409 Conflict AND persists invalidated state with ORIGIN_STALE_NEW_MESSAGE when new message arrives", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 2);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `stale-api-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão com snapshot",
          body: "Corpo",
          draftMessage: "Rascunho",
        },
      });
      const suggestionId = createRes.json().id;

      // Customer sends message
      await ownerPool.query(`
        INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988880099', '+5549988880001', 'text', 'Nova mensagem superveniente', now());
      `, [workspaceAId, channelAId, threadId]);

      await ownerPool.query(`
        UPDATE commercial_threads SET last_message_at = now() WHERE id = $1;
      `, [threadId]);

      const decideRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(decideRes.statusCode).toBe(409);
      expect(decideRes.json().code).toBe("ORIGIN_STALE_NEW_MESSAGE");

      const checkRes = await ownerPool.query(`
        SELECT status, state_version, metadata FROM integration_suggestions WHERE id = $1;
      `, [suggestionId]);
      expect(checkRes.rows[0].status).toBe("invalidated");
      expect(checkRes.rows[0].state_version).toBe(2);
      expect(checkRes.rows[0].metadata.rejection_code).toBe("ORIGIN_STALE_NEW_MESSAGE");
      expect(checkRes.rows[0].metadata.rejection_reason).toContain("nova mensagem");
    });

    it("returns draftMessage on accept and inserts ZERO outbound messages in queue", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 2);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `draft-inv-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Draft Only",
          body: "Corpo",
          draftMessage: "Mensagem pronta para composer humano",
        },
      });
      const suggestionId = createRes.json().id;

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });

      expect(patchRes.statusCode).toBe(200);
      const data = patchRes.json();
      expect(data.status).toBe("accepted");
      expect(data.draftMessage).toBe("Mensagem pronta para composer humano");

      const outboxCheck = await ownerPool.query(`
        SELECT COUNT(*) as count FROM outbound_commands WHERE workspace_id = $1;
      `, [workspaceAId]);
      expect(parseInt(outboxCheck.rows[0].count, 10)).toBe(0);
    });

    it("DENIES operator of Workspace B from accessing Workspace A suggestions", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenOperatorB}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe("6. Terminal Immutability & Replay Resilience (F1.1-C.1 Hardening)", () => {
    it("returns 409 ALREADY_DECIDED when repeating PATCH on an accepted suggestion after radar is disabled", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 2);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `api-term-accept-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Terminal Accept",
          body: "Corpo",
        },
      });
      const suggestionId = createRes.json().id;

      // 1. Operator accepts suggestion
      const acceptRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 1 },
      });
      expect(acceptRes.statusCode).toBe(200);

      // 2. Disable radar on workspace
      await ownerPool.query(`UPDATE workspaces SET radar_enabled = false WHERE id = $1;`, [workspaceAId]);

      try {
        // 3. Repeat PATCH
        const repeatRes = await app.inject({
          method: "PATCH",
          url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
          headers: { authorization: `Bearer ${tokenOperatorA}` },
          payload: { status: "accepted", stateVersion: 2 },
        });

        expect(repeatRes.statusCode).toBe(409);
        expect(repeatRes.json().code).toBe("ALREADY_DECIDED");

        // Verify status remains accepted and was NOT overwritten by MODULE_DISABLED
        const row = await ownerPool.query(`SELECT status, state_version FROM integration_suggestions WHERE id = $1;`, [suggestionId]);
        expect(row.rows[0].status).toBe("accepted");
        expect(row.rows[0].state_version).toBe(2);
      } finally {
        await ownerPool.query(`UPDATE workspaces SET radar_enabled = true WHERE id = $1;`, [workspaceAId]);
      }
    });

    it("replays suggestion POST idempotently when an intervening message arrives", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 2);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);
      const idempotencyKey = `api-replay-msg-${crypto.randomUUID()}`;

      // 1. Initial POST
      const res1 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Intervening API",
          body: "Corpo",
        },
      });
      expect(res1.statusCode).toBe(201);
      const suggestionId = res1.json().id;

      // 2. Customer sends message
      await ownerPool.query(`
        INSERT INTO messages (workspace_id, channel_instance_id, thread_id, provider, direction, sender_e164, recipient_e164, content_type, body, created_at)
        VALUES ($1, $2, $3, 'meta_waba', 'inbound', '+5549988880099', '+5549988880001', 'text', 'Mensagem interveniente', now());
      `, [workspaceAId, channelAId, threadId]);

      // 3. Repeat POST with same idempotency key
      const res2 = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Intervening API",
          body: "Corpo",
        },
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().id).toBe(suggestionId);
      expect(res2.json().created).toBe(false);
    });

    it("returns 409 VERSION_MISMATCH when stateVersion does not match", async () => {
      const { contactId, threadId } = await createTestThread(workspaceAId, 2);
      const currentRev = await fetchCandidateRevision(workspaceAId, threadId);

      const createRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions`,
        headers: { authorization: `Bearer ${tokenIntegrationService}` },
        payload: {
          idempotencyKey: `api-ver-mismatch-${crypto.randomUUID()}`,
          threadId,
          contactId,
          candidateRevision: currentRev,
          title: "Sugestão Concurrency API",
          body: "Corpo",
        },
      });
      const suggestionId = createRes.json().id;

      const patchRes = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceAId}/integrations/suggestions/${suggestionId}`,
        headers: { authorization: `Bearer ${tokenOperatorA}` },
        payload: { status: "accepted", stateVersion: 999 },
      });

      expect(patchRes.statusCode).toBe(409);
      expect(patchRes.json().code).toBe("VERSION_MISMATCH");

      const row = await ownerPool.query(`SELECT status, state_version FROM integration_suggestions WHERE id = $1;`, [suggestionId]);
      expect(row.rows[0].status).toBe("pending");
      expect(row.rows[0].state_version).toBe(1);
    });
  });
  it("keeps proposal-linked Pix protected from integration identities and other workspaces",async()=>{
    const created=await app.inject({method:'POST',url:`/v1/workspaces/${workspaceAId}/threads/${threadAId}/proposals`,headers:{authorization:`Bearer ${tokenOperatorA}`},payload:{contactId:contactAId,title:'SIM proposta de isolamento',items:[{title:'SIM item',unitPriceCents:15000,quantity:1}]}});
    expect(created.statusCode,created.body).toBe(201);const proposalId=created.json().id;
    const integration=await app.inject({method:'POST',url:`/v1/workspaces/${workspaceAId}/proposals/${proposalId}/pix-charge`,headers:{authorization:`Bearer ${tokenIntegrationService}`},payload:{requestKey:crypto.randomUUID(),expectedVersion:1}});expect(integration.statusCode,integration.body).toBe(403);
    const foreign=await app.inject({method:'POST',url:`/v1/workspaces/${workspaceAId}/proposals/${proposalId}/pix-charge`,headers:{authorization:`Bearer ${tokenOperatorB}`},payload:{requestKey:crypto.randomUUID(),expectedVersion:1}});expect(foreign.statusCode,foreign.body).toBe(403);
    const ownWrongProposal=await app.inject({method:'POST',url:`/v1/workspaces/${workspaceBId}/proposals/${proposalId}/pix-charge`,headers:{authorization:`Bearer ${tokenOperatorB}`},payload:{requestKey:crypto.randomUUID(),expectedVersion:1}});expect(ownWrongProposal.statusCode,ownWrongProposal.body).toBe(404);
    const count=await ownerPool.query('SELECT count(*)::int AS count FROM pix_charges WHERE proposal_id=$1',[proposalId]);expect(count.rows[0].count).toBe(0);
  });

});

