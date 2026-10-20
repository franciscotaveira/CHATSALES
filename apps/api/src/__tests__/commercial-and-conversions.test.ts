import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabasePools,
  resetTestQueueState,
} from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Commercial Core & Meta CAPI Return Loop Integration", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const { ownerPool, ingressPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let workspaceAId: string;
  let workspaceBId: string;
  let userAId: string;
  let userBId: string;
  let tokenA: string;
  let tokenB: string;

  let contactAId: string;
  let channelAId: string;
  let threadAId: string;

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
      VALUES ('CRM E2E Org', $1)
      RETURNING id;
    `, [`crm-org-${crypto.randomUUID()}`]);
    const orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace CRM Alpha', $2)
      RETURNING id;
    `, [orgId, `crm-ws-a-${crypto.randomUUID()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace CRM Beta', $2)
      RETURNING id;
    `, [orgId, `crm-ws-b-${crypto.randomUUID()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 2. Provision Users & Memberships
    userAId = crypto.randomUUID();
    userBId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $3, 'Operator Alpha'),
        ($2, $4, 'Operator Beta');
    `, [
      userAId,
      userBId,
      `op-crm-a-${crypto.randomUUID()}@mct.br`,
      `op-crm-b-${crypto.randomUUID()}@mct.br`,
    ]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($3, $4, 'operator');
    `, [workspaceAId, userAId, workspaceBId, userBId]);

    // 3. Provision Contact, Channel & Thread in Workspace Alpha
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511977776666', 'Lead Qualificado CTWA')
      RETURNING id;
    `, [workspaceAId]);
    contactAId = contactRes.rows[0].id;

    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164, endpoint_token_hash, is_active
      ) VALUES (
        $1, 'meta_waba', 'Canal Principal WABA', '+5511999991234',
        $2, true
      ) RETURNING id;
    `, [workspaceAId, crypto.createHash("sha256").update(crypto.randomUUID()).digest("hex")]);
    channelAId = chanRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (
        workspace_id, channel_instance_id, contact_id, status
      ) VALUES ($1, $2, $3, 'active')
      RETURNING id;
    `, [workspaceAId, channelAId, contactAId]);
    threadAId = threadRes.rows[0].id;

    // 4. Generate JWT tokens
    tokenA = await new SignJWT({
      sub: userAId,
      workspace_id: workspaceAId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    tokenB = await new SignJWT({
      sub: userBId,
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
    await resetTestQueueState(ownerPool);
    if (app) await app.close();
    await ingressPool.end();
    await ownerPool.end();
  });

  let createdJourneyId: string;

  it("rejects estimated values above the integer storage boundary without creating a journey", async () => {
    const before=await ownerPool.query("SELECT count(*)::int AS count FROM commercial_journeys WHERE workspace_id=$1",[workspaceAId]);
    for(const estimatedValueCents of [2147483648,Number.MAX_SAFE_INTEGER]){
      const res=await app.inject({method:"POST",url:`/v1/workspaces/${workspaceAId}/journeys`,headers:{authorization:`Bearer ${tokenA}`,"x-workspace-id":workspaceAId},payload:{contactId:contactAId,stage:"lead",estimatedValueCents}});
      expect(res.statusCode).toBe(400);
      expect(res.json().details.estimatedValueCents).toBeDefined();
    }
    const after=await ownerPool.query("SELECT count(*)::int AS count FROM commercial_journeys WHERE workspace_id=$1",[workspaceAId]);
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("CRM-01: should create a commercial journey (opportunity) with CTWA attribution under tenant RLS", async () => {
    const payload = {
      contactId: contactAId,
      threadId: threadAId,
      title: "Negociação Mentoria High Ticket",
      stage: "qualified",
      attributionSource: "ctwa_meta",
      campaignId: "cmp_meta_high_ticket_2026",
      adId: "ad_video_ugc_01",
      ctwaClid: "ctwa_clid_mock_secure_hash_12345",
      estimatedValueCents: 150000,
    };

    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/journeys`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.contactId).toBe(contactAId);
    expect(body.threadId).toBe(threadAId);
    expect(body.stage).toBe("qualified");
    expect(body.status).toBe("open");
    expect(body.attributionSource).toBe("ctwa_meta");
    expect(body.estimatedValueCents).toBe(150000);

    createdJourneyId = body.id;
  });

  it("CRM-02: should list commercial journeys for the workspace with tenant isolation", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/journeys`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-workspace-id": workspaceAId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    const item = body.items.find((j: any) => j.id === createdJourneyId);
    expect(item).toBeDefined();
    expect(item.title).toBe("Negociação Mentoria High Ticket");
  });

  it("CRM-03: should record a WON commercial outcome with real monetary value (R$ 497,00) and automatically enqueue a PurchaseCompleted CAPI conversion event", async () => {
    const outcomePayload = {
      status: "won",
      valueCents: 49700,
      currency: "BRL",
      reason: "Fechamento via WhatsApp com pagamento PIX confirmado",
      userPhoneE164: "+5511977776666",
    };

    const res = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/journeys/${createdJourneyId}/outcomes`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: outcomePayload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();

    // Verify outcome
    expect(body.outcome).toBeDefined();
    expect(body.outcome.journeyId).toBe(createdJourneyId);
    expect(body.outcome.status).toBe("won");
    expect(body.outcome.valueCents).toBe(49700);
    expect(body.outcome.currency).toBe("BRL");

    // Verify automatically enqueued CAPI conversion event
    expect(body.conversionEvent).toBeDefined();
    expect(body.conversionEvent.eventName).toBe("PurchaseCompleted");
    expect(body.conversionEvent.valueCents).toBe(49700);
    expect(body.conversionEvent.status).toBe("QUEUED");

    // Verify database state: journey updated to won
    await ownerPool.query("SELECT set_config('app.current_workspace_id', $1, false)", [workspaceAId]);
    const journeyCheck = await ownerPool.query(`
      SELECT status, stage FROM commercial_journeys WHERE id = $1;
    `, [createdJourneyId]);
    expect(journeyCheck.rows[0].status).toBe("won");
    expect(journeyCheck.rows[0].stage).toBe("won");

    // Verify database state: conversion_events record with SHA-256 hashed phone and ctwaClid
    const convCheck = await ownerPool.query(`
      SELECT event_name, status, user_data FROM conversion_events WHERE id = $1;
    `, [body.conversionEvent.id]);
    expect(convCheck.rowCount).toBe(1);
    expect(convCheck.rows[0].event_name).toBe("PurchaseCompleted");
    expect(convCheck.rows[0].status).toBe("QUEUED");
    expect(convCheck.rows[0].user_data.hashedPhone).toBe(
      crypto.createHash("sha256").update("5511977776666").digest("hex")
    );
    expect(convCheck.rows[0].user_data.ctwaClid).toBe("ctwa_clid_mock_secure_hash_12345");
  });

  it("CRM-04: should record a LOST commercial outcome and NOT enqueue any Meta CAPI conversion event", async () => {
    // Create another journey
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/journeys`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: {
        contactId: contactAId,
        title: "Tentativa de Reengajamento",
        stage: "proposal",
        attributionSource: "organic_whatsapp",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const lostJourneyId = createRes.json().id;

    // Record LOST outcome
    const lostRes = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/journeys/${lostJourneyId}/outcomes`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: {
        status: "lost",
        valueCents: 0,
        reason: "Cliente optou por adiar compra para próximo trimestre",
      },
    });

    expect(lostRes.statusCode).toBe(201);
    const body = lostRes.json();
    expect(body.outcome.status).toBe("lost");
    expect(body.conversionEvent).toBeNull();

    // Verify zero conversion_events created for lostJourneyId
    const convCheck = await ownerPool.query(`
      SELECT id FROM conversion_events WHERE journey_id = $1;
    `, [lostJourneyId]);
    expect(convCheck.rowCount).toBe(0);
  });

  it("CRM-05: should reject cross-tenant journey creation and outcome recording with HTTP 403 (fail-closed)", async () => {
    // Operator B tries to create journey in Workspace A
    const crossCreate = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/journeys`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: {
        contactId: contactAId,
        title: "Tentativa Cross Tenant",
      },
    });
    expect(crossCreate.statusCode).toBe(403);

    // Operator B tries to record outcome on journey of Workspace A
    const crossOutcome = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/journeys/${createdJourneyId}/outcomes`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: {
        status: "won",
        valueCents: 99900,
      },
    });
    expect(crossOutcome.statusCode).toBe(403);
  });

  it("CRM-06: should list conversion events strictly scoped to tenant with receipts", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/conversions`,
      headers: {
        authorization: `Bearer ${tokenA}`,
        "x-workspace-id": workspaceAId,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.items[0].eventName).toBe("PurchaseCompleted");
    expect(body.items[0].status).toBe("QUEUED");

    // Workspace B operator querying Workspace A conversions is rejected
    const crossAudit = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceAId}/conversions`,
      headers: {
        authorization: `Bearer ${tokenB}`,
        "x-workspace-id": workspaceAId,
      },
    });
    expect(crossAudit.statusCode).toBe(403);
  });
  it("CRM-07: paginates tied timestamps without duplicates and rejects invalid or foreign cursors",async()=>{
    await ownerPool.query(`INSERT INTO conversion_events(workspace_id,journey_id,event_name,created_at) SELECT $1,$2,'LeadQualified','2026-10-18T12:00:00.123456Z'::timestamptz FROM generate_series(1,51)`,[workspaceAId,createdJourneyId]);
    const read=(suffix='')=>app.inject({method:'GET',url:`/v1/workspaces/${workspaceAId}/conversions${suffix}`,headers:{authorization:`Bearer ${tokenA}`,'x-workspace-id':workspaceAId}});
    const first=await read();expect(first.statusCode).toBe(200);const a=first.json();expect(a.items).toHaveLength(50);expect(a.pagination.hasMore).toBe(true);
    const second=await read(`?beforeId=${a.pagination.nextCursor}`);expect(second.statusCode).toBe(200);const b=second.json();expect(b.items.length).toBeGreaterThanOrEqual(2);expect(b.pagination.hasMore).toBe(false);
    const ids=[...a.items,...b.items].map(item=>item.id);expect(new Set(ids).size).toBe(ids.length);
    expect((await read('?beforeId=invalid')).statusCode).toBe(400);expect((await read(`?beforeId=${crypto.randomUUID()}`)).statusCode).toBe(400);
    const cross=await app.inject({method:'GET',url:`/v1/workspaces/${workspaceBId}/conversions?beforeId=${a.pagination.nextCursor}`,headers:{authorization:`Bearer ${tokenB}`,'x-workspace-id':workspaceBId}});expect(cross.statusCode).toBe(400);
  });

});
