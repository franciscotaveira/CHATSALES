import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import {
  createTestDatabasePools,
  encryptPayload,
  withWorkerTransaction,
  DatabaseSigningSecretResolver,
  resetTestQueueState,
} from "@sos-sales/database";
import {
  ChannelAdapterRegistry,
  type IChannelAdapter,
  type OutboundSendParams,
  type ChannelSendResult,
} from "@sos-sales/application";
import {templateLayoutSignature} from "@sos-sales/contracts";
import { InboxProcessor } from "../processors/inbox-processor";
import { OutboxDispatcher } from "../processors/outbox-dispatcher";

describe("Worker Operational Resilience & P0/P1 Edge Case Verification", () => {
  const { ownerPool, workerPool } = createTestDatabasePools();
  const testMasterKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  let orgId: string;
  let workspaceId: string;
  let channelInstanceId: string;
  let credentialId: string;
  let baseContactId: string;
  let baseThreadId: string;

  beforeAll(async () => {
    // 0. Reset operational queues
    await resetTestQueueState(ownerPool);

    // 1. Provision Organization and Workspace using ownerPool
    const orgRes = await ownerPool.query(`
      INSERT INTO organizations (name, slug)
      VALUES ('Resilience Test Org', $1)
      RETURNING id;
    `, [`org-resil-${crypto.randomUUID()}`]);
    orgId = orgRes.rows[0].id;

    const wsRes = await ownerPool.query(`
      INSERT INTO workspaces (organization_id, name, slug)
      VALUES ($1, 'Resilience Workspace', $2)
      RETURNING id;
    `, [orgId, `ws-resil-${crypto.randomUUID()}`]);
    workspaceId = wsRes.rows[0].id;

    // 2. Provision Encrypted Credential
    const rawCredentials = JSON.stringify({
      access_token: "EAAB_test_resilience_token",
      phone_number_id: "10987654321",
      app_secret: "waba_secret_resilience",
    });
    const encrypted = encryptPayload(rawCredentials, testMasterKey);

    const credRes = await ownerPool.query(`
      INSERT INTO provider_credentials (
        workspace_id, provider, account_id, encrypted_payload, iv, auth_tag
      ) VALUES ($1, 'meta_waba', 'waba_acc_resil', $2, $3, $4)
      RETURNING id;
    `, [workspaceId, encrypted.encryptedBase64, encrypted.ivBase64, encrypted.authTagBase64]);
    credentialId = credRes.rows[0].id;

    // 3. Provision Channel Instance
    const chanRes = await ownerPool.query(`
      INSERT INTO channel_instances (
        workspace_id, provider, display_name, phone_number_e164,
        endpoint_token_hash, credential_id, is_active
      ) VALUES (
        $1, 'meta_waba', 'Resilience Test Line', '+5511999992222',
        $2, $3, true
      ) RETURNING id;
    `, [workspaceId, crypto.createHash("sha256").update(`token-resil-${crypto.randomUUID()}`).digest("hex"), credentialId]);
    channelInstanceId = chanRes.rows[0].id;

    // 4. Provision Base Contact and Commercial Thread
    const contactRes = await ownerPool.query(`
      INSERT INTO contacts (workspace_id, phone_e164, name)
      VALUES ($1, '+5511999992222', 'Resilience Base Contact')
      ON CONFLICT (workspace_id, phone_e164) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `, [workspaceId]);
    baseContactId = contactRes.rows[0].id;

    const threadRes = await ownerPool.query(`
      INSERT INTO commercial_threads (workspace_id, channel_instance_id, contact_id, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (workspace_id, channel_instance_id, contact_id) DO UPDATE SET status = EXCLUDED.status
      RETURNING id;
    `, [workspaceId, channelInstanceId, baseContactId]);
    baseThreadId = threadRes.rows[0].id;
  });

  afterAll(async () => {
    await resetTestQueueState(ownerPool);
    await workerPool.end();
    await ownerPool.end();
  });

  describe("Crash Recovery & Blind Retransmission Prevention (P0 Item 4)", () => {
    it("should route crashed processing items to reconciliation_required without calling adapter", async () => {
      // 1. Insert a message and an outbound command simulating a task that a previous worker
      // died while executing (status = 'processing' and lease_until < clock_timestamp())
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999992222', '+5511988887777', 'text', 'Crashed worker test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status, retry_count, max_retries,
          lease_until, worker_id, lease_token
        ) VALUES (
          $1, $2, $3, $4,
          '+5511988887777', 'Crashed worker test', $5,
          'processing', 1, 3,
          clock_timestamp() - INTERVAL '10 seconds', 'dead-worker-pid-999', gen_random_uuid()
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId, messageId, `crash_test_${Date.now()}`]);
      const commandId = outboxRes.rows[0].id;

      let adapterCalled = false;
      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(): Promise<ChannelSendResult> {
          adapterCalled = true;
          return { success: true, externalMessageId: "wamid.DUPLICATE_SENT", sentAt: new Date() };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);

      const dispatcher = new OutboxDispatcher();

      // 1. Normal claimBatch MUST NOT claim the expired processing item (P0-5)
      const claimed = await dispatcher.claimBatch(workerPool, "recovery-worker-1", 100);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeUndefined();

      // 2. Dedicated lease reclamation recovers it directly to reconciliation_required without touching retry_count
      const reclaimed = await dispatcher.reclaimExpiredLeases(workerPool, 100);
      expect(reclaimed).toBeGreaterThanOrEqual(1);

      // P0 Assertion: Adapter MUST NOT be called!
      expect(adapterCalled).toBe(false);

      // Verify state in database: moved to reconciliation_required with zero retry increment
      const checkRes = await ownerPool.query(
        "SELECT status, error_message, retry_count, lease_until, worker_id, lease_token FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(checkRes.rows[0].status).toBe("reconciliation_required");
      expect(checkRes.rows[0].error_message).toContain("ERR_LEASE_EXPIRED_DURING_PROCESSING");
      expect(checkRes.rows[0].retry_count).toBe(1); // Unchanged from initial 1 (zero increment upon lease reclamation)
      expect(checkRes.rows[0].lease_until).toBeNull();
      expect(checkRes.rows[0].worker_id).toBeNull();
      expect(checkRes.rows[0].lease_token).toBeNull();

      // Verify administrative reconciliation action
      const reconciled = await dispatcher.reconcileItem(
        ownerPool,
        workspaceId,
        commandId,
        "sent",
        { externalMessageId: "wamid.MANUAL_RECON_VERIFIED_123" }
      );
      expect(reconciled).toBe(true);

      const postReconRes = await ownerPool.query(
        "SELECT status, external_message_id FROM outbound_commands WHERE id = $1;",
        [commandId]
      );
      expect(postReconRes.rows[0].status).toBe("sent");
      expect(postReconRes.rows[0].external_message_id).toBe("wamid.MANUAL_RECON_VERIFIED_123");

      const msgCheckRes = await ownerPool.query(
        "SELECT delivery_status, status_rank, provider_message_id FROM messages WHERE id = $1;",
        [messageId]
      );
      expect(msgCheckRes.rows[0].delivery_status).toBe("sent");
      expect(msgCheckRes.rows[0].status_rank).toBe(10);
      expect(msgCheckRes.rows[0].provider_message_id).toBe("wamid.MANUAL_RECON_VERIFIED_123");
    });
  });

  describe("Retry Boundary Safety (P0 Item 2)", () => {
    it("should never claim or increment an item that has reached max_retries", async () => {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999992222', '+5511988887777', 'text', 'Retry limit test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;

      // Item exactly at the boundary: retry_count = 3, max_retries = 3
      const key = `retry_boundary_${Date.now()}`;
      await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status, retry_count, max_retries, next_attempt_at
        ) VALUES (
          $1, $2, $3, $4,
          '+5511988887777', 'Retry limit test', $5,
          'failed', 3, 3, clock_timestamp() - INTERVAL '1 minute'
        );
      `, [workspaceId, channelInstanceId, baseThreadId, messageId, key]);

      const dispatcher = new OutboxDispatcher();
      const claimed = await dispatcher.claimBatch(workerPool, "test-retry-worker", 10);

      // The item at retry_count === max_retries must NOT be claimed
      const matched = claimed.find((c) => c.idempotency_key === key);
      expect(matched).toBeUndefined();
    });
  });

  describe("WABA Template Passthrough (P0 Item 9)", () => {
    it("should persist template parameters in outbox and pass them cleanly to adapter", async () => {
      const msgRes = await ownerPool.query(`
        INSERT INTO messages (
          workspace_id, channel_instance_id, thread_id, provider, direction,
          sender_e164, recipient_e164, content_type, body, delivery_status, status_rank
        ) VALUES (
          $1, $2, $3, 'meta_waba', 'outbound',
          '+5511999992222', '+5511988887777', 'template', 'Template message test', 'queued', 0
        ) RETURNING id;
      `, [workspaceId, channelInstanceId, baseThreadId]);
      const messageId = msgRes.rows[0].id;
      await ownerPool.query(`INSERT INTO message_templates
        (workspace_id,name,category,body_text,status,language,meta_template_id,meta_verified_at,meta_verified_channel_id)
        VALUES($1,'appointment_reminder','UTILITY','Olá {{1}}','APPROVED','pt_BR','SIM_APPOINTMENT_TEMPLATE',NOW(),$2)`,[workspaceId,channelInstanceId]);
      const layoutHash=crypto.createHash('sha256').update(templateLayoutSignature({bodyText:'Olá {{1}}'})).digest('hex');
      await ownerPool.query(`UPDATE messages SET metadata=jsonb_build_object('systemTemplateLayoutHash',$2::text) WHERE id=$1`,[messageId,layoutHash]);

      const templateComponents = [
        {
          type: "body",
          parameters: [{ type: "text", text: "Dr. Roberto" }],
        },
      ];

      const outboxRes = await ownerPool.query(`
        INSERT INTO outbound_commands (
          workspace_id, channel_instance_id, thread_id, message_id,
          recipient_e164, body, idempotency_key, status,
          template_name, template_language, template_components
        ) VALUES (
          $1, $2, $3, $4,
          '+5511988887777', 'Olá Dr. Roberto', $5, 'pending',
          'appointment_reminder', 'pt_BR', $6
        ) RETURNING id;
      `, [
        workspaceId,
        channelInstanceId,
        baseThreadId,
        messageId,
        `template_test_${Date.now()}`,
        JSON.stringify(templateComponents),
      ]);
      const commandId = outboxRes.rows[0].id;

      let capturedTemplate: any = null;
      const fakeAdapter: IChannelAdapter = {
        provider: "meta_waba",
        async sendMessage(params: OutboundSendParams): Promise<ChannelSendResult> {
          capturedTemplate = params.template;
          return { success: true, externalMessageId: "wamid.TEMPLATE_SENT_123", sentAt: new Date() };
        },
      };

      const registry = new ChannelAdapterRegistry();
      registry.register(fakeAdapter);

      const secretResolver = new DatabaseSigningSecretResolver({
        pool: workerPool,
        masterKeyHex: testMasterKey,
      });

      const dispatcher = new OutboxDispatcher();
      const claimed = await dispatcher.claimBatch(workerPool, "template-worker", 100);
      const targetItem = claimed.find((c) => c.id === commandId);
      expect(targetItem).toBeDefined();

      const res = await dispatcher.dispatchItem(
        workerPool,
        targetItem!,
        "template-worker",
        registry,
        secretResolver
      );

      expect(res.success).toBe(true);
      expect(capturedTemplate).toEqual({
        name: "appointment_reminder",
        language: "pt_BR",
        components: templateComponents,
      });

      // A later sync changing a header must invalidate the queued layout before adapter execution.
      const nextMessage = await ownerPool.query(`INSERT INTO messages
        (workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,delivery_status,status_rank,metadata)
        SELECT workspace_id,channel_instance_id,thread_id,provider,direction,sender_e164,recipient_e164,content_type,body,'queued',0,metadata
        FROM messages WHERE id=$1 RETURNING id`,[messageId]);
      const nextCommand = await ownerPool.query(`INSERT INTO outbound_commands
        (workspace_id,channel_instance_id,thread_id,message_id,recipient_e164,body,idempotency_key,status,template_name,template_language,template_components)
        SELECT workspace_id,channel_instance_id,thread_id,$2,recipient_e164,body,$3,'pending',template_name,template_language,template_components
        FROM outbound_commands WHERE id=$1 RETURNING id`,[commandId,nextMessage.rows[0].id,`sim-layout-change-${crypto.randomUUID()}`]);
      await ownerPool.query(`UPDATE message_templates SET header_text='Novo cabeçalho' WHERE workspace_id=$1 AND name='appointment_reminder'`,[workspaceId]);
      capturedTemplate=null;
      const changed=(await dispatcher.claimBatch(workerPool,'changed-layout-worker',100)).find(item=>item.id===nextCommand.rows[0].id);
      expect(changed).toBeDefined();
      const blocked=await dispatcher.dispatchItem(workerPool,changed!,'changed-layout-worker',registry,secretResolver);
      expect(blocked.success).toBe(false);
      expect(capturedTemplate).toBeNull();
      const status=await ownerPool.query('SELECT status FROM outbound_commands WHERE id=$1',[nextCommand.rows[0].id]);
      expect(status.rows[0].status).toBe('dead_letter');
    });
  });

  describe("Late Reconciliation under Real sos_worker_user Role (P0 Item 6)", () => {
    it("should allow sos_worker_user to update message_id in provider_delivery_events during late reconciliation", async () => {
      const externalMessageId = `wamid.LATE_ARRIVING_${Date.now()}`;

      // 1. Insert a delivery event that arrived BEFORE the message (status-before-message)
      // Done using workerPool under sos_worker_user privileges!
      const enc = encryptPayload(JSON.stringify({ status: "delivered" }), testMasterKey);
      await withWorkerTransaction(workspaceId, async (client) => {
        await client.query(`
          INSERT INTO provider_delivery_events (
            workspace_id, channel_instance_id, message_id, external_message_id,
            external_event_id, recipient_e164, provider, status,
            raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
          ) VALUES (
            $1, $2, NULL, $3,
            $4, '+5511988887777', 'meta_waba', 'delivered',
            $5, $6, $7, $8, clock_timestamp()
          );
        `, [
          workspaceId,
          channelInstanceId,
          externalMessageId,
          `event_late_${Date.now()}`,
          "c".repeat(64),
          enc.encryptedBase64,
          enc.ivBase64,
          enc.authTagBase64,
        ]);
      }, workerPool);

      // 2. Now ingest the inbound message with matching externalMessageId
      const processor = new InboxProcessor({ masterKeyHex: testMasterKey });

      const wabaPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "WABA_ID",
            changes: [
              {
                field: "messages",
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "5511999992222",
                    phone_number_id: "10987654321",
                  },
                  contacts: [{ profile: { name: "Late Reconciler" }, wa_id: "5511988887777" }],
                  messages: [
                    {
                      from: "5511988887777",
                      id: externalMessageId,
                      timestamp: "1711234567",
                      type: "text",
                      text: { body: "Late message body" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      const rawJson = JSON.stringify(wabaPayload);
      const rawHash = crypto.createHash("sha256").update(Buffer.from(rawJson)).digest("hex");
      const aad = `${workspaceId}:${channelInstanceId}:${rawHash}`;
      const encPayload = encryptPayload(rawJson, testMasterKey, { aad });
      const inboxRes = await ownerPool.query(`
        INSERT INTO channel_webhook_inbox (
          channel_instance_id, workspace_id, provider_event_key, raw_payload_hash,
          encrypted_payload, payload_iv, payload_auth_tag, key_version, status, retry_count, max_retries
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, 1, 'pending', 0, 5
        ) RETURNING id;
      `, [
        channelInstanceId,
        workspaceId,
        `event_key_late_${Date.now()}`,
        rawHash,
        encPayload.encryptedBase64,
        encPayload.ivBase64,
        encPayload.authTagBase64,
      ]);

      const inboxId = inboxRes.rows[0].id;
      const claimedInbox = await processor.claimBatch(workerPool, "late-recon-worker", 100);
      const targetInbox = claimedInbox.find((i) => i.id === inboxId);
      expect(targetInbox).toBeDefined();

      // Execute processor using workerPool (sos_worker_user)
      const processResult = await processor.processItem(workerPool, targetInbox!, "late-recon-worker");
      expect(processResult.success).toBe(true);

      // Verify that provider_delivery_events had its message_id updated by sos_worker_user
      const deliveryEventRes = await ownerPool.query(
        "SELECT message_id, status FROM provider_delivery_events WHERE external_message_id = $1;",
        [externalMessageId]
      );
      expect(deliveryEventRes.rows[0].message_id).toBeDefined();
      expect(deliveryEventRes.rows[0].message_id).not.toBeNull();

      // Verify message status was updated to delivered (status_rank = 20)
      const messageCheckRes = await ownerPool.query(
        "SELECT delivery_status, status_rank FROM messages WHERE provider_message_id = $1;",
        [externalMessageId]
      );
      expect(messageCheckRes.rows[0].delivery_status).toBe("delivered");
      expect(messageCheckRes.rows[0].status_rank).toBe(20);
    });
  });
});
