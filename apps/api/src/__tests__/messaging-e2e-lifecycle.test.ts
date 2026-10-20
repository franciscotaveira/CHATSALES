import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  createTestDatabasePools,
  encryptPayload,
  resetTestQueueState,
  DatabaseSigningSecretResolver,
  ChannelInstanceRepository,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  ChannelDispatchService,
  type IChannelAdapter,
  type OutboundSendParams,
  type ChannelSendResult,
} from "@sos-sales/application";
import { SignJWT } from "@sos-sales/auth";
import { buildApp } from "../index";
import { InboxProcessor, OutboxDispatcher } from "@sos-sales/worker";

describe("CH-12: Full Omnichannel Messaging E2E Lifecycle", () => {
  const jwtSecret = "test_jwt_secret_key_minimum_32_characters_long_2026!";
  const testIssuer = "sos-sales-test";
  const testAudience = "sos-sales-api-test";
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  const rawWabaAppSecret = "waba_app_secret_super_secure_ch12";
  const rawWabaVerifyToken = "verify_token_ch12_waba";
  const wabaEndpointToken = "waba_endpoint_token_ch12_unique";
  const wabaEndpointTokenHash = crypto
    .createHash("sha256")
    .update(wabaEndpointToken)
    .digest("hex");
  const wabaVerifyTokenHash = crypto
    .createHash("sha256")
    .update(rawWabaVerifyToken)
    .digest("hex");

  const rawWahaApiKey = "waha_api_key_ch12_secure";
  const wahaEndpointToken = "waha_endpoint_token_ch12_unique";
  const wahaEndpointTokenHash = crypto
    .createHash("sha256")
    .update(wahaEndpointToken)
    .digest("hex");

  const { appPool, ownerPool, workerPool, ingressPool } = createTestDatabasePools();

  let app: FastifyInstance;
  let inboxProcessor: InboxProcessor;
  let outboxDispatcher: OutboxDispatcher;
  let dispatchService: ChannelDispatchService;

  let orgId: string;
  let workspaceAId: string;
  let workspaceBId: string;

  let userOperatorAId: string;
  let userOperatorBId: string;
  let operatorAToken: string;
  let operatorBToken: string;

  let wabaChannelAId: string;
  let wahaChannelAId: string;
  let wabaChannelBId: string;

  let capturedAdapterCalls: OutboundSendParams[] = [];

  beforeAll(async () => {
    // 0. Ensure clean state in shared queues
    await resetTestQueueState(ownerPool);

    // 1. Build Fastify API instance
    app = await buildApp({
      providerType: "local-jwt",
      jwtSecret,
      issuer: testIssuer,
      audience: testAudience,
      masterKeyHex: testMasterKey,
      ingressPool,
    });

    // 2. Provision Organizations and Workspaces
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('E2E Lifecycle Org', $1)
      RETURNING id;
    `, [`org-e2e-${crypto.randomUUID()}`]);
    orgId = orgRes.rows[0].id;

    const wsARes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Alpha', $2)
      RETURNING id;
    `, [orgId, `ws-alpha-${crypto.randomUUID()}`]);
    workspaceAId = wsARes.rows[0].id;

    const wsBRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Workspace Beta', $2)
      RETURNING id;
    `, [orgId, `ws-beta-${crypto.randomUUID()}`]);
    workspaceBId = wsBRes.rows[0].id;

    // 3. Provision Users and Memberships
    userOperatorAId = crypto.randomUUID();
    userOperatorBId = crypto.randomUUID();

    await ownerPool.query(`
      INSERT INTO users (id, email, name)
      VALUES 
        ($1, $3, 'Operator Alpha'),
        ($2, $4, 'Operator Beta')
      ON CONFLICT (id) DO NOTHING;
    `, [
      userOperatorAId,
      userOperatorBId,
      `op-a-${crypto.randomUUID()}@mct.br`,
      `op-b-${crypto.randomUUID()}@mct.br`,
    ]);

    await ownerPool.query(`
      INSERT INTO workspace_memberships (workspace_id, user_id, role)
      VALUES 
        ($1, $2, 'operator'),
        ($3, $4, 'operator')
      ON CONFLICT DO NOTHING;
    `, [workspaceAId, userOperatorAId, workspaceBId, userOperatorBId]);

    // 4. Provision Encrypted Credentials for WABA and WAHA
    const wabaCredPayload = JSON.stringify({
      app_secret: rawWabaAppSecret,
      phone_number_id: "10987654321",
      access_token: "EAAB_test_waba_access_token_ch12",
    });
    const encWaba = encryptPayload(wabaCredPayload, testMasterKey);

    const credWabaRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_ch12', $2, $3, $4)
      RETURNING id;
    `, [workspaceAId, encWaba.encryptedBase64, encWaba.ivBase64, encWaba.authTagBase64]);
    const wabaCredId = credWabaRes.rows[0].id;

    const wahaCredPayload = JSON.stringify({
      api_key: rawWahaApiKey,
      webhook_secret: rawWahaApiKey,
      session: "default",
    });
    const encWaha = encryptPayload(wahaCredPayload, testMasterKey);

    const credWahaRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'waha', 'waha_acc_ch12', $2, $3, $4)
      RETURNING id;
    `, [workspaceAId, encWaha.encryptedBase64, encWaha.ivBase64, encWaha.authTagBase64]);
    const wahaCredId = credWahaRes.rows[0].id;

    // Cross-tenant credential in Workspace B
    const credBRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_beta_ch12', $2, $3, $4)
      RETURNING id;
    `, [workspaceBId, encWaba.encryptedBase64, encWaba.ivBase64, encWaba.authTagBase64]);
    const credBId = credBRes.rows[0].id;

    // 5. Provision Channel Instances:
    // - WABA Channel (Workspace Alpha)
    const chanWabaRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, verify_token_hash, credential_id, is_active
      ) VALUES ($1, 'meta_waba', 'WABA Channel Alpha', '+5511999990001', $2, $3, $4, true)
      RETURNING id;
    `, [workspaceAId, wabaEndpointTokenHash, wabaVerifyTokenHash, wabaCredId]);
    wabaChannelAId = chanWabaRes.rows[0].id;

    // - WAHA Channel (Workspace Alpha)
    const chanWahaRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES ($1, 'waha', 'WAHA Channel Alpha', '+5511999990002', $2, $3, true)
      RETURNING id;
    `, [workspaceAId, wahaEndpointTokenHash, wahaCredId]);
    wahaChannelAId = chanWahaRes.rows[0].id;

    // - WABA Channel (Workspace Beta - Cross-tenant target)
    const chanBRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, verify_token_hash, credential_id, is_active
      ) VALUES ($1, 'meta_waba', 'WABA Channel Beta', '+5511999990003', $2, $3, $4, true)
      RETURNING id;
    `, [
      workspaceBId,
      crypto.createHash("sha256").update(`tok-b-${crypto.randomUUID()}`).digest("hex"),
      crypto.createHash("sha256").update(`ver-b-${crypto.randomUUID()}`).digest("hex"),
      credBId,
    ]);
    wabaChannelBId = chanBRes.rows[0].id;

    // 6. Sign JWT Authentication Tokens
    operatorAToken = await new SignJWT({
      sub: userOperatorAId,
      workspace_id: workspaceAId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    operatorBToken = await new SignJWT({
      sub: userOperatorBId,
      workspace_id: workspaceBId,
      role: "operator",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer(testIssuer)
      .setAudience(testAudience)
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(jwtSecret));

    // 7. Instantiate Processors and Dispatcher with Mock Channel Dispatch
    inboxProcessor = new InboxProcessor({ masterKeyHex: testMasterKey });

    const mockAdapter: IChannelAdapter = {
      provider: "meta_waba",
      sendMessage: async (params: OutboundSendParams): Promise<ChannelSendResult> => {
        capturedAdapterCalls.push(params);
        return {
          success: true,
          externalMessageId: `wamid.CH12_SENT_${crypto.randomUUID()}`,
          sentAt: new Date(),
        };
      },
    };

    const registry = new ChannelAdapterRegistry();
    registry.register(mockAdapter);

    const secretResolver = new DatabaseSigningSecretResolver({
      pool: ownerPool,
      masterKeyHex: testMasterKey,
    });
    const channelRepo = new ChannelInstanceRepository(ownerPool);
    dispatchService = new ChannelDispatchService({
      channelInstanceRepo: channelRepo,
      adapterRegistry: registry,
      secretResolver,
    });

    outboxDispatcher = new OutboxDispatcher({
      masterKeyHex: testMasterKey,
      secretResolver,
    });
  });

  afterAll(async () => {
    await resetTestQueueState(ownerPool);
    if (app) await app.close();
    await ingressPool.end();
    await appPool.end();
    await workerPool.end();
    await ownerPool.end();
  });

  it("AC-CH12-001: should ingest inbound WABA message via Fastify HTTP endpoint and enqueue encrypted in inbox", async () => {
    const rawWabaPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999990001",
                  phone_number_id: "10987654321",
                },
                contacts: [
                  {
                    profile: { name: "Cliente VIP E2E" },
                    wa_id: "5511988887777",
                  },
                ],
                messages: [
                  {
                    from: "5511988887777",
                    id: `wamid.INBOUND_${crypto.randomUUID()}`,
                    timestamp: "1711234500",
                    type: "text",
                    text: { body: "Olá, gostaria de saber mais sobre o produto!" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const rawBodyBuffer = Buffer.from(JSON.stringify(rawWabaPayload), "utf-8");
    const hmacSig = crypto
      .createHmac("sha256", rawWabaAppSecret)
      .update(rawBodyBuffer)
      .digest("hex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/webhooks/whatsapp/${wabaEndpointToken}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${hmacSig}`,
      },
      payload: rawBodyBuffer,
    });

    expect(response.statusCode).toBe(200);

    // Verify record in channel_webhook_inbox
    const inboxRows = await ownerPool.query(`
      SELECT id, status, channel_instance_id, workspace_id, encrypted_payload
      FROM channel_webhook_inbox
      WHERE channel_instance_id = $1 AND status = 'pending';
    `, [wabaChannelAId]);

    expect(inboxRows.rowCount).toBeGreaterThanOrEqual(1);
    expect(inboxRows.rows[0].workspace_id).toBe(workspaceAId);
  });

  it("AC-CH12-002: should claim and process inbound webhook via InboxProcessor, creating contact, thread and message", async () => {
    const claimed = await inboxProcessor.claimBatch(workerPool, "worker-e2e-inbox", 10);
    expect(claimed.length).toBeGreaterThanOrEqual(1);

    const task = claimed.find((c: { channel_instance_id: string }) => c.channel_instance_id === wabaChannelAId);
    expect(task).toBeDefined();

    const result = await inboxProcessor.processItem(workerPool, task!, "worker-e2e-inbox");
    expect(result.success).toBe(true);

    // Verify contact creation
    const contactCheck = await ownerPool.query(`
      SELECT id, name, phone_e164 FROM contacts WHERE workspace_id = $1 AND phone_e164 = '+5511988887777';
    `, [workspaceAId]);
    expect(contactCheck.rowCount).toBe(1);
    expect(contactCheck.rows[0].name).toBe("Cliente VIP E2E");

    // Verify commercial thread
    const threadCheck = await ownerPool.query(`
      SELECT id, status FROM commercial_threads WHERE workspace_id = $1 AND contact_id = $2;
    `, [workspaceAId, contactCheck.rows[0].id]);
    expect(threadCheck.rowCount).toBe(1);
    expect(threadCheck.rows[0].status).toBe("active");

    // Verify inbound message
    const msgCheck = await ownerPool.query(`
      SELECT id, direction, body, content_type, delivery_status
      FROM messages
      WHERE workspace_id = $1 AND thread_id = $2 AND direction = 'inbound';
    `, [workspaceAId, threadCheck.rows[0].id]);
    expect(msgCheck.rowCount).toBe(1);
    expect(msgCheck.rows[0].body).toBe("Olá, gostaria de saber mais sobre o produto!");
    expect(msgCheck.rows[0].delivery_status).toBe("delivered");

    // Verify inbox status transitioned to processed
    const inboxFinal = await ownerPool.query(`
      SELECT status FROM channel_webhook_inbox WHERE id = $1;
    `, [task!.id]);
    expect(inboxFinal.rows[0].status).toBe("processed");
  });

  it("AC-CH12-003: should produce an outbound text message via Fastify API with atomic RLS persistence", async () => {
    const textIdempKey = `idemp-text-${crypto.randomUUID()}`;
    const textPayload = {
      recipientPhoneE164: "+5511988887777",
      contentType: "text",
      body: "Olá Cliente VIP! Nosso produto está disponível com pronta entrega.",
      idempotencyKey: textIdempKey,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${wabaChannelAId}/messages`,
      headers: {
        authorization: `Bearer ${operatorAToken}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: textPayload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.messageId).toBeDefined();
    expect(body.commandId).toBeDefined();
    expect(body.status).toBe("pending");
    expect(body.deliveryStatus).toBe("queued");
    expect(body.isIdempotentReplay).toBe(false);

    // Verify database record has valid 64-hex SHA-256 fingerprint
    const cmdCheck = await ownerPool.query(`
      SELECT id, status, payload_fingerprint, template_name
      FROM outbound_commands
      WHERE id = $1;
    `, [body.commandId]);
    expect(cmdCheck.rowCount).toBe(1);
    expect(cmdCheck.rows[0].status).toBe("pending");
    expect(cmdCheck.rows[0].payload_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(cmdCheck.rows[0].template_name).toBeNull();
  });

  it("AC-CH12-004: should produce an official WABA template outbound message via Fastify API and persist template metadata", async () => {
    await ownerPool.query(`INSERT INTO message_templates
      (workspace_id,name,category,body_text,status,language,meta_template_id,meta_verified_at,meta_verified_channel_id)
      VALUES($1,'order_confirmation_v1','UTILITY','Pedido {{1}}, valor {{2}}','APPROVED','pt_BR','SIM_ORDER_TEMPLATE',NOW(),$2)`,[workspaceAId,wabaChannelAId]);
    const templateIdempKey = `idemp-template-${crypto.randomUUID()}`;
    const templatePayload = {
      recipientPhoneE164: "+5511988887777",
      contentType: "template",
      body: "Seu pedido #9921 foi confirmado com sucesso!",
      template: {
        name: "order_confirmation_v1",
        language: "pt_BR",
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "9921" },
              { type: "text", text: "R$ 497,00" },
            ],
          },
        ],
      },
      idempotencyKey: templateIdempKey,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${wabaChannelAId}/messages`,
      headers: {
        authorization: `Bearer ${operatorAToken}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: templatePayload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.messageId).toBeDefined();
    expect(body.commandId).toBeDefined();

    // Verify template fields are explicitly stored in outbound_commands
    const templateCmd = await ownerPool.query(`
      SELECT id, status, template_name, template_language, template_components, payload_fingerprint
      FROM outbound_commands
      WHERE id = $1;
    `, [body.commandId]);
    expect(templateCmd.rowCount).toBe(1);
    expect(templateCmd.rows[0].template_name).toBe("order_confirmation_v1");
    expect(templateCmd.rows[0].template_language).toBe("pt_BR");
    expect(templateCmd.rows[0].template_components).toBeDefined();
    expect(templateCmd.rows[0].payload_fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("AC-CH12-005: should dispatch queued outbound commands via OutboxDispatcher to provider, transitioning to 'sent'", async () => {
    capturedAdapterCalls = [];
    const claimed = await outboxDispatcher.claimBatch(workerPool, "worker-e2e-outbox", 10);
    expect(claimed.length).toBeGreaterThanOrEqual(2);

    for (const item of claimed) {
      await outboxDispatcher.dispatchItem(workerPool, item, "worker-e2e-outbox", dispatchService);
    }

    // Verify adapter captured both dispatches with correct structures
    expect(capturedAdapterCalls.length).toBeGreaterThanOrEqual(2);
    const templateCall = capturedAdapterCalls.find((c) => c.template?.name === "order_confirmation_v1");
    expect(templateCall).toBeDefined();
    expect(templateCall!.template!.language).toBe("pt_BR");

    // Verify both commands transitioned to 'sent'
    for (const item of claimed) {
      const checkCmd = await ownerPool.query(`
        SELECT status, external_message_id, sent_at
        FROM outbound_commands
        WHERE id = $1;
      `, [item.id]);
      expect(checkCmd.rows[0].status).toBe("sent");
      expect(checkCmd.rows[0].external_message_id).toMatch(/^wamid\.CH12_SENT_/);
      expect(checkCmd.rows[0].sent_at).not.toBeNull();

      // Verify associated message delivery_status updated to 'sent'
      const checkMsg = await ownerPool.query(`
        SELECT delivery_status FROM messages WHERE id = $1;
      `, [item.message_id]);
      expect(checkMsg.rows[0].delivery_status).toBe("sent");

      // Verify provider_delivery_events recorded
      const checkEvents = await ownerPool.query(`
        SELECT id, status, external_message_id
        FROM provider_delivery_events
        WHERE message_id = $1;
      `, [item.message_id]);
      expect(checkEvents.rowCount).toBeGreaterThanOrEqual(1);
      expect(checkEvents.rows[0].status).toBe("sent");
    }
  });

  it("AC-CH12-006: should process delivery status webhook (delivered -> read), advancing message status monotonically", async () => {
    // Pick the external message ID of one of the sent commands
    const sentCmd = await ownerPool.query(`
      SELECT message_id, external_message_id
      FROM outbound_commands
      WHERE channel_instance_id = $1 AND status = 'sent' AND external_message_id IS NOT NULL
      LIMIT 1;
    `, [wabaChannelAId]);
    expect(sentCmd.rowCount).toBe(1);
    const { message_id: targetMessageId, external_message_id: targetExtId } = sentCmd.rows[0];

    // 1. Ingest 'delivered' status webhook
    const deliveredPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999990001",
                  phone_number_id: "10987654321",
                },
                statuses: [
                  {
                    id: targetExtId,
                    status: "delivered",
                    timestamp: "1711234700",
                    recipient_id: "5511988887777",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const delBuffer = Buffer.from(JSON.stringify(deliveredPayload), "utf-8");
    const delSig = crypto
      .createHmac("sha256", rawWabaAppSecret)
      .update(delBuffer)
      .digest("hex");

    const delResp = await app.inject({
      method: "POST",
      url: `/v1/webhooks/whatsapp/${wabaEndpointToken}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${delSig}`,
      },
      payload: delBuffer,
    });
    expect(delResp.statusCode).toBe(200);

    // Process 'delivered' in worker
    const delClaimed = await inboxProcessor.claimBatch(workerPool, "worker-e2e-status", 10);
    const delTask = delClaimed.find((c: { channel_instance_id: string }) => c.channel_instance_id === wabaChannelAId);
    expect(delTask).toBeDefined();
    await inboxProcessor.processItem(workerPool, delTask!, "worker-e2e-status");

    const msgDelCheck = await ownerPool.query(`
      SELECT delivery_status, status_rank FROM messages WHERE id = $1;
    `, [targetMessageId]);
    expect(msgDelCheck.rows[0].delivery_status).toBe("delivered");
    expect(msgDelCheck.rows[0].status_rank).toBe(20);

    // 2. Ingest 'read' status webhook
    const readPayload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "5511999990001",
                  phone_number_id: "10987654321",
                },
                statuses: [
                  {
                    id: targetExtId,
                    status: "read",
                    timestamp: "1711234750",
                    recipient_id: "5511988887777",
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    const readBuffer = Buffer.from(JSON.stringify(readPayload), "utf-8");
    const readSig = crypto
      .createHmac("sha256", rawWabaAppSecret)
      .update(readBuffer)
      .digest("hex");

    const readResp = await app.inject({
      method: "POST",
      url: `/v1/webhooks/whatsapp/${wabaEndpointToken}`,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": `sha256=${readSig}`,
      },
      payload: readBuffer,
    });
    expect(readResp.statusCode).toBe(200);

    // Process 'read' in worker
    const readClaimed = await inboxProcessor.claimBatch(workerPool, "worker-e2e-status-2", 10);
    const readTask = readClaimed.find((c: { channel_instance_id: string }) => c.channel_instance_id === wabaChannelAId);
    expect(readTask).toBeDefined();
    await inboxProcessor.processItem(workerPool, readTask!, "worker-e2e-status-2");

    const msgReadCheck = await ownerPool.query(`
      SELECT delivery_status, status_rank FROM messages WHERE id = $1;
    `, [targetMessageId]);
    expect(msgReadCheck.rows[0].delivery_status).toBe("read");
    expect(msgReadCheck.rows[0].status_rank).toBe(30);
  });

  it("AC-CH12-007: should reject cross-tenant dispatch attempt with HTTP 404/403 and zero database writes", async () => {
    // Operator A (Workspace Alpha) attempts to dispatch through Channel B (Workspace Beta)
    const crossTenantPayload = {
      recipientPhoneE164: "+5511988887777",
      contentType: "text",
      body: "Tentativa de injeção cross-tenant não autorizada",
      idempotencyKey: `idemp-cross-${crypto.randomUUID()}`,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${wabaChannelBId}/messages`,
      headers: {
        authorization: `Bearer ${operatorAToken}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: crossTenantPayload,
    });

    // Must fail closed with 404 (ChannelInstanceNotFoundError) because channel does not belong to workspaceA
    expect(response.statusCode).toBe(404);

    // Operator B (Workspace Beta) attempts to dispatch through WAHA Channel A (Workspace Alpha)
    const crossTenantRespB = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceBId}/channels/${wahaChannelAId}/messages`,
      headers: {
        authorization: `Bearer ${operatorBToken}`,
        "x-workspace-id": workspaceBId,
        "content-type": "application/json",
      },
      payload: crossTenantPayload,
    });
    expect(crossTenantRespB.statusCode).toBe(404);

    // Verify zero commands written for that idempotency key
    const checkLeak = await ownerPool.query(`
      SELECT id FROM outbound_commands WHERE idempotency_key = $1;
    `, [crossTenantPayload.idempotencyKey]);
    expect(checkLeak.rowCount).toBe(0);
  });

  it("AC-CH12-008: should reject outbound message with SSRF mediaUrl before opening database transaction", async () => {
    const ssrfPayload = {
      recipientPhoneE164: "+5511988887777",
      contentType: "image",
      body: "Foto do produto",
      mediaUrl: "http://169.254.169.254/latest/meta-data/credentials",
      idempotencyKey: `idemp-ssrf-${crypto.randomUUID()}`,
    };

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceAId}/channels/${wabaChannelAId}/messages`,
      headers: {
        authorization: `Bearer ${operatorAToken}`,
        "x-workspace-id": workspaceAId,
        "content-type": "application/json",
      },
      payload: ssrfPayload,
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.detail).toContain("SSRF");

    // Zero records created
    const checkSsrfCmd = await ownerPool.query(`
      SELECT id FROM outbound_commands WHERE idempotency_key = $1;
    `, [ssrfPayload.idempotencyKey]);
    expect(checkSsrfCmd.rowCount).toBe(0);
  });
});
