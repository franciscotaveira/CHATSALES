import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { createTestDatabasePools } from "@sos-sales/database";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";

describe("Phase R3 Integration Suite: Commercial Concurrency, State Machine & Integrity", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";

  const { ownerPool, appPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let orgId: string;
  let workspaceId: string;
  let adminUserId: string;
  let memberUserId: string;
  let nonMemberUserId: string;
  let adminToken: string;

  let channelId: string;
  let contactId: string;
  let contactPhone: string;
  let threadId: string;
  let journeyId: string;
  let productId: string;

  beforeAll(async () => {
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
    });

    // 1. Provision Org & Workspace with Pix configuration
    const orgRes = await ownerPool.query(
      `INSERT INTO organizations (name, slug)
       VALUES ('R3 Concurrency Org', $1)
       RETURNING id;`,
      [`org-r3-${Date.now()}`]
    );
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(
      `INSERT INTO workspaces (
         organization_id, name, slug,
         default_pix_key, default_pix_merchant_name, default_pix_merchant_city
       ) VALUES ($1, 'R3 Concurrency Workspace', $2, 'financeiro@mct.br', 'SOS Sales', 'Chapeco')
       RETURNING id;`,
      [orgId, `ws-r3-${Date.now()}`]
    );
    workspaceId = wsRes.rows[0].id;

    // 2. Users: Admin and Member
    adminUserId = crypto.randomUUID();
    memberUserId = crypto.randomUUID();
    nonMemberUserId = crypto.randomUUID();

    await ownerPool.query(
      `INSERT INTO users (id, email, name)
       VALUES 
         ($1, $2, 'Admin User'),
         ($3, $4, 'Member User');`,
      [
        adminUserId,
        `admin-r3-${adminUserId}@example.com`,
        memberUserId,
        `member-r3-${memberUserId}@example.com`,
      ]
    );

    await ownerPool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES 
         ($1, $2, 'admin'),
         ($1, $3, 'operator');`,
      [workspaceId, adminUserId, memberUserId]
    );

    const encoder = new TextEncoder();
    adminToken = await new SignJWT({
      sub: adminUserId,
      email: `admin-r3-${adminUserId}@example.com`,
      workspace_id: workspaceId,
      role: "admin",
      app_metadata: { role: "authenticated" },
      user_metadata: { workspaceId },
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(encoder.encode(jwtSecret));

    // 3. Channels, Contacts, Threads, Journeys
    channelId = crypto.randomUUID();
    contactId = crypto.randomUUID();
    contactPhone = "+554999887766";
    threadId = crypto.randomUUID();
    journeyId = crypto.randomUUID();

    await ownerPool.query(
      `INSERT INTO channel_instances (id, workspace_id, provider, display_name, endpoint_token_hash, status, is_active)
       VALUES ($1, $2, 'meta_waba', 'Canal WABA R3', $3, 'connected', true);`,
      [channelId, workspaceId, crypto.createHash("sha256").update(channelId).digest("hex")]
    );

    await ownerPool.query(
      `INSERT INTO contacts (id, workspace_id, phone_e164, name)
       VALUES ($1, $2, $3, 'Contato R3 Concorrência');`,
      [contactId, workspaceId, contactPhone]
    );

    await ownerPool.query(
      `INSERT INTO commercial_threads (id, workspace_id, channel_instance_id, contact_id, status)
       VALUES ($1, $2, $3, $4, 'active');`,
      [threadId, workspaceId, channelId, contactId]
    );

    await ownerPool.query(
      `INSERT INTO commercial_journeys (id, workspace_id, thread_id, contact_id, stage, ctwa_clid)
       VALUES ($1, $2, $3, $4, 'proposal', 'ctwa-clid-r3-test');`,
      [journeyId, workspaceId, threadId, contactId]
    );

    const prodRes = await ownerPool.query(
      `INSERT INTO products (
         workspace_id, retailer_id, title, description, price_cents, category, image_url
       ) VALUES (
         $1, 'SKU-R3-CONCURRENCY', 'Consultoria Soberana', 'Descrição R3', 250000, 'Serviços', 'https://mct.br/icon.png'
       ) RETURNING id;`,
      [workspaceId]
    );
    productId = prodRes.rows[0].id;
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await ownerPool.end();
  });

  describe("1. Proposals State Machine & Optimistic Locking", () => {
    let proposalId: string;

    it("should create a proposal with initial stateVersion = 1", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          contactId,
          journeyId,
          title: "Proposta de Concorrência R3",
          items: [
            {
              productId,
              title: "Consultoria Soberana",
              unitPriceCents: 250000,
              quantity: 1,
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe("draft");
      expect(body.stateVersion).toBe(1);
      proposalId = body.id;
    });

    it("should allow draft -> sent transition with expectedVersion = 1, incrementing stateVersion to 2", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "sent",
          expectedVersion: 1,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("sent");
      expect(body.stateVersion).toBe(2);
      expect(body.sentAt).toBeTruthy();
    });

    it("should reject concurrent update when expectedVersion is stale (409 Conflict)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "accepted",
          expectedVersion: 1, // Stale! Current is 2
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.title).toBe("Conflict");
      expect(body.detail).toMatch(/OPTIMISTIC_LOCK_CONFLICT/);
    });

    it("should accept valid transition with correct expectedVersion = 2, moving to accepted (terminal state)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "accepted",
          expectedVersion: 2,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("accepted");
      expect(body.stateVersion).toBe(3);
      expect(body.acceptedAt).toBeTruthy();
    });

    it("should reject transitioning from terminal state 'accepted' (409 Conflict / INVALID_TRANSITION)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposalId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "cancelled",
          expectedVersion: 3,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toMatch(/INVALID_TRANSITION/);
    });

    it("should reject proposal status transition if expectedVersion is omitted (400 Bad Request)", async () => {
      const propRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          contactId,
          title: "Proposta Version Check",
          items: [{ title: "Item 1", unitPriceCents: 1000, quantity: 1 }],
        },
      });
      const pId = propRes.json().id;

      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/proposals/${pId}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "sent" },
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).detail).toMatch(/expectedVersion is strictly required/i);
    });

    it("should enforce state machine in database trigger on direct SQL bypass", async () => {
      await expect(
        ownerPool.query(
          `UPDATE public.commercial_proposals
           SET status = 'draft'
           WHERE id = $1;`,
          [proposalId]
        )
      ).rejects.toThrow(/INVALID_TRANSITION/);
    });
  });

  describe("2. Commercial Action Assignee Membership Guard", () => {
    let actionId: string;

    it("should reject creating an action assigned to a non-member (400 Bad Request)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/actions`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: "Follow-up com Lead",
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          assigneeUserId: nonMemberUserId, // Not in workspace_memberships!
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/ASSIGNEE_NOT_MEMBER/);
    });

    it("should allow creating an action assigned to a valid workspace member (201 Created)", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/actions`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: "Follow-up com Lead Legítimo",
          dueAt: new Date(Date.now() + 86400000).toISOString(),
          assigneeUserId: memberUserId,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.created).toBe(true);
      expect(body.action.assigneeUserId).toBe(memberUserId);
      actionId = body.action.id;
    });

    it("should reject reassigning an action to a non-member (400 Bad Request)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/actions/${actionId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          action: "assign",
          assigneeUserId: nonMemberUserId,
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/ASSIGNEE_NOT_MEMBER/);
    });

    it("should allow reassigning an action to another valid member (200 OK)", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/actions/${actionId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          action: "assign",
          assigneeUserId: adminUserId,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.action.assigneeUserId).toBe(adminUserId);
    });
  });

  describe("3. Commercial Outcomes Idempotency & Contact Phone Derivation (S-07)", () => {
    it("should derive contact phone from contact entity if omitted and populate conversion event", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/journeys/${journeyId}/outcomes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "won",
          valueCents: 250000,
          currency: "BRL",
          // userPhoneE164 is intentionally omitted to verify automatic contact phone derivation
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.outcome.status).toBe("won");
      expect(body.outcome.valueCents).toBe(250000);
      expect(body.conversionEvent).toBeTruthy();
      expect(body.conversionEvent.eventName).toBe("PurchaseCompleted");

      // Verify that userData.hashedPhone was derived from contactPhone (+554999887766 -> digits 554999887766)
      const expectedHash = crypto
        .createHash("sha256")
        .update("554999887766")
        .digest("hex");

      const eventDb = await ownerPool.query(
        `SELECT user_data FROM public.conversion_events WHERE id = $1;`,
        [body.conversionEvent.id]
      );
      expect(eventDb.rows[0].user_data.hashedPhone).toBe(expectedHash);
    });

    it("should idempotently return existing outcome without inserting duplicates when registering outcome again", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/journeys/${journeyId}/outcomes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "won",
          valueCents: 250000,
          currency: "BRL",
        },
      });

      // Should succeed idempotently
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.outcome.status).toBe("won");

      // Verify total number of outcomes for this journey remains exactly 1
      const countRes = await ownerPool.query(
        `SELECT COUNT(*)::int as total FROM public.commercial_outcomes WHERE workspace_id = $1 AND journey_id = $2;`,
        [workspaceId, journeyId]
      );
      expect(countRes.rows[0].total).toBe(1);

      // Verify total conversion events remains exactly 1
      const eventCountRes = await ownerPool.query(
        `SELECT COUNT(*)::int as total FROM public.conversion_events WHERE workspace_id = $1 AND journey_id = $2;`,
        [workspaceId, journeyId]
      );
      expect(eventCountRes.rows[0].total).toBe(1);
    });

    it("should prevent duplicate won outcomes at the database level via unique index", async () => {
      // Direct raw insert bypass attempt
      await expect(
        ownerPool.query(
          `INSERT INTO public.commercial_outcomes (
             workspace_id, journey_id, status, value_cents, currency, registered_by_user_id
           ) VALUES ($1, $2, 'won', 10000, 'BRL', $3);`,
          [workspaceId, journeyId, adminUserId]
        )
      ).rejects.toThrow(/uq_commercial_outcomes_journey_won/);
    });

    it("should reject divergent outcome update from won to lost with 409 Conflict", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/journeys/${journeyId}/outcomes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "lost",
          valueCents: 250000,
          currency: "BRL",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toMatch(/already reached terminal outcome 'won'/i);
    });

    it("should reject divergent outcome payload with different valueCents with 409 Conflict", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/journeys/${journeyId}/outcomes`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: "won",
          valueCents: 999999,
          currency: "BRL",
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toMatch(/already reached terminal outcome 'won'/i);
    });
  });

  describe("4. Atomic Proposal + Pix Charge Generation", () => {
    it("should atomically create a proposal and a linked Pix charge via generatePixCharge flag", async () => {
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          contactId,
          journeyId,
          title: "Proposta com Cobrança Pix Atômica",
          items: [
            {
              productId,
              title: "Consultoria Soberana",
              unitPriceCents: 150000,
              quantity: 1,
            },
          ],
          generatePixCharge: true,
          expiresMinutes: 45,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBeTruthy();
      expect(body.totalCents).toBe(150000);
      expect(body.stateVersion).toBe(1);

      expect(body.pixCharge).toBeTruthy();
      expect(body.pixCharge.proposalId).toBe(body.id);
      expect(body.pixCharge.amountCents).toBe(150000);
      expect(body.pixCharge.pixCode).toBeTruthy();
      expect(body.pixCharge.status).toBe("PENDING");

      // Verify in DB that pix_charge has proposal_id set
      const pixInDb = await ownerPool.query(
        `SELECT proposal_id, amount_cents FROM public.pix_charges WHERE id = $1;`,
        [body.pixCharge.id]
      );
      expect(pixInDb.rows[0].proposal_id).toBe(body.id);
      expect(Number(pixInDb.rows[0].amount_cents)).toBe(150000);
    });

    it("should generate a Pix charge for an existing proposal via dedicated endpoint", async () => {
      // 1. Create a regular proposal without Pix charge
      const propRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          contactId,
          journeyId,
          title: "Proposta Avulsa para Pix",
          items: [
            {
              productId,
              title: "Consultoria Soberana",
              unitPriceCents: 80000,
              quantity: 1,
            },
          ],
        },
      });
      expect(propRes.statusCode).toBe(201);
      const proposal = propRes.json();

      // 2. Request Pix charge issuance for this proposal
      const requestKey=crypto.randomUUID();
      const issued = await Promise.all([1,2].map(()=>app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposal.id}/pix-charge`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          expiresMinutes: 60,requestKey,expectedVersion:1,
        },
      })));
      const pixRes=issued[0]!;
      expect(issued[1]!.statusCode,issued[1]!.body).toBe(201);
      expect(issued[1]!.json().charge.id).toBe(pixRes.json().charge.id);

      expect(pixRes.statusCode,pixRes.body).toBe(201);
      const pixBody = pixRes.json();
      expect(pixBody.proposal.id).toBe(proposal.id);
      expect(pixBody.charge.proposalId).toBe(proposal.id);
      expect(pixBody.charge.amountCents).toBe(80000);
      expect(pixBody.charge.pixCode).toBeTruthy();
      const listed=await app.inject({method:'GET',url:`/v1/workspaces/${workspaceId}/threads/${threadId}/pix-charges`,headers:{authorization:`Bearer ${adminToken}`}});expect(listed.statusCode,listed.body).toBe(200);expect(listed.json().charges.find((charge:{id:string})=>charge.id===pixBody.charge.id)?.proposalId).toBe(proposal.id);
      const path=`/v1/workspaces/${workspaceId}/proposals/${proposal.id}/pix-charge`,headers={authorization:`Bearer ${adminToken}`};
      const replay=await Promise.all([1,2].map(()=>app.inject({method:'POST',url:path,headers,payload:{requestKey,expiresMinutes:60,expectedVersion:1}})));
      for(const response of replay){expect(response.statusCode,response.body).toBe(201);expect(response.json().charge.id).toBe(pixBody.charge.id);}
      const changed=await app.inject({method:'POST',url:path,headers,payload:{requestKey,expiresMinutes:30,expectedVersion:1}});expect(changed.statusCode,changed.body).toBe(409);
      const stale=await app.inject({method:'POST',url:path,headers,payload:{requestKey:crypto.randomUUID(),expectedVersion:99}});expect(stale.statusCode,stale.body).toBe(409);
      const recovered=await app.inject({method:'POST',url:path,headers,payload:{requestKey:crypto.randomUUID(),expiresMinutes:60,expectedVersion:1}});expect(recovered.statusCode,recovered.body).toBe(201);expect(recovered.json().charge.id).toBe(pixBody.charge.id);
      await ownerPool.query("UPDATE pix_charges SET status='EXPIRED' WHERE id=$1",[pixBody.charge.id]);
      const limitedUntil=await ownerPool.query("UPDATE commercial_proposals SET valid_until=now()+interval '10 minutes' WHERE id=$1 RETURNING valid_until,state_version",[proposal.id]);
      const limited=await app.inject({method:'POST',url:path,headers,payload:{requestKey:crypto.randomUUID(),expiresMinutes:60,expectedVersion:limitedUntil.rows[0].state_version}});expect(limited.statusCode,limited.body).toBe(201);expect(Date.parse(limited.json().charge.expiresAt)).toBeLessThanOrEqual(new Date(limitedUntil.rows[0].valid_until).getTime());
      await ownerPool.query("UPDATE pix_charges SET status='PAID' WHERE id=$1",[limited.json().charge.id]);
      const paid=await app.inject({method:'POST',url:path,headers,payload:{requestKey:crypto.randomUUID(),expectedVersion:limitedUntil.rows[0].state_version}});expect(paid.statusCode,paid.body).toBe(409);expect(paid.json().detail).toContain('pagamento registrado');
      const expiredVersion=await ownerPool.query("UPDATE commercial_proposals SET valid_until=now()-interval '1 minute' WHERE id=$1 RETURNING state_version",[proposal.id]);
      const expired=await app.inject({method:'POST',url:path,headers,payload:{requestKey:crypto.randomUUID(),expectedVersion:expiredVersion.rows[0].state_version}});expect(expired.statusCode,expired.body).toBe(409);expect(expired.json().detail).toContain('venceu');
      const count=await ownerPool.query('SELECT count(*)::int AS count FROM pix_charges WHERE proposal_id=$1',[proposal.id]);expect(count.rows[0].count).toBe(2);
    });

    it("should reject issuing a Pix charge for a cancelled proposal (409 Conflict)", async () => {
      // 1. Create a proposal and cancel it
      const propRes = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/threads/${threadId}/proposals`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          contactId,
          journeyId,
          title: "Proposta a ser Cancelada",
          items: [
            {
              productId,
              title: "Consultoria Soberana",
              unitPriceCents: 50000,
              quantity: 1,
            },
          ],
        },
      });
      const proposal = propRes.json();

      await app.inject({
        method: "PATCH",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposal.id}/status`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: "cancelled", expectedVersion: 1 },
      });

      // 2. Attempt to issue Pix charge
      const res = await app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/proposals/${proposal.id}/pix-charge`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toMatch(/INVALID_PROPOSAL_STATE/);
    });
  });
});
