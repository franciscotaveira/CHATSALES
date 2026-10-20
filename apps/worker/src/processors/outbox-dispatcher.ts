import crypto from "node:crypto";
import {broadcastBlockCodes,encodeBroadcastBlockReason,aiCapabilitySignature,storedTemplateLayout,templateLayoutSignature,validateTemplateComponents,type WabaTemplateComponent} from "@sos-sales/contracts";
import type { Pool } from "pg";
import type {
  ChannelAdapterRegistry,
  ISigningSecretResolver,
  ChannelSendResult,
} from "@sos-sales/application";
import {
  ChannelDispatchService,
  ChannelInstanceNotFoundError,
  ChannelInstanceInactiveError,
  ChannelCapabilityUnsupportedError,
  QueueRetryPolicy,
  sanitizeOutboxErrorMessage,
  resolveCanonicalErrorCode,
} from "@sos-sales/application";
import {
  withWorkerTransaction,
  withTenantTransaction,
  ChannelInstanceRepository,
  OutboundCommandRepository,
  FencingViolationError,
  encryptPayload,
  DatabaseSigningSecretResolver,
  PostSendReconciliationOutcome,
  resolveBroadcastAudience,
  type BroadcastAudienceSelection,
} from "@sos-sales/database";
import { logger } from "@sos-sales/observability";

export interface ClaimedOutboxItem {
  id: string;
  workspace_id: string;
  channel_instance_id: string;
  thread_id: string | null;
  message_id: string;
  recipient_e164: string;
  body: string;
  media_url: string | null;
  template_name?: string | null;
  template_language?: string | null;
  template_components?: Record<string, unknown>[] | null;
  interactive_payload?: Record<string, unknown> | null;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  lease_token: string;
  previous_status?: string;
}

export interface OutboxDispatcherOptions {
  outboundRepo?: OutboundCommandRepository;
  masterKeyHex?: string;
  secretResolver?: ISigningSecretResolver | DatabaseSigningSecretResolver;
}

export class FatalCryptographicConfigError extends Error {
  readonly code = "FATAL_CRYPTOGRAPHIC_CONFIG_ERROR" as const;
  constructor(message: string) {
    super(message);
    this.name = "FatalCryptographicConfigError";
  }
}

export class OutboxDispatcher {
  private readonly outboundRepo: OutboundCommandRepository;
  private readonly configuredMasterKeyHex?: string;
  private readonly configuredSecretResolver?: ISigningSecretResolver | DatabaseSigningSecretResolver;

  constructor(
    outboundRepoOrOptions?: OutboundCommandRepository | OutboxDispatcherOptions
  ) {
    if (outboundRepoOrOptions && "claimPendingBatch" in outboundRepoOrOptions) {
      this.outboundRepo = outboundRepoOrOptions;
    } else if (outboundRepoOrOptions) {
      const opts = outboundRepoOrOptions as OutboxDispatcherOptions;
      this.outboundRepo = opts.outboundRepo || new OutboundCommandRepository();
      this.configuredMasterKeyHex = opts.masterKeyHex;
      this.configuredSecretResolver = opts.secretResolver;
    } else {
      this.outboundRepo = new OutboundCommandRepository();
    }
  }

  /**
   * Resolves the cryptographic master key for delivery event encryption.
   * Fail-Closed: Strict validation without hardcoded default keys.
   */
  resolveMasterKey(secretResolver?: ISigningSecretResolver | DatabaseSigningSecretResolver): string {
    const candidate =
      this.configuredMasterKeyHex ||
      (secretResolver as any)?.keyringOrKey ||
      (this.configuredSecretResolver as any)?.keyringOrKey ||
      process.env.MCT_CREDENTIALS_MASTER_KEY ||
      process.env.APP_MASTER_KEY ||
      process.env.MASTER_ENCRYPTION_KEY;

    if (typeof candidate === "string" && /^[0-9a-fA-F]{64}$/.test(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === "object") {
      const keys = Object.values(candidate) as string[];
      for (const k of keys) {
        if (typeof k === "string" && /^[0-9a-fA-F]{64}$/.test(k)) {
          return k;
        }
      }
    }

    throw new FatalCryptographicConfigError(
      "FATAL_CONFIG_ERROR: Master encryption key must be explicitly provided as a 64-character hex string for OutboxDispatcher delivery event encryption (no hardcoded fallback allowed)"
    );
  }

  /**
   * Concurrently claims a batch of eligible outbound commands using SKIP LOCKED and lease fencing.
   * Delegates entirely to OutboundCommandRepository as the sole persistence authority.
   */
  async claimBatch(
    pool: Pool,
    workerId: string,
    limit = 10
  ): Promise<ClaimedOutboxItem[]> {
    const records = await this.outboundRepo.claimPendingBatch(workerId, limit, 30, pool);
    return records as ClaimedOutboxItem[];
  }

  /**
   * Renews the lease for a currently running task to prevent lease expiry during long processing.
   */
  async renewLease(
    pool: Pool,
    itemId: string,
    workerId: string,
    leaseToken: string,
    extendSeconds = 30
  ): Promise<boolean> {
    return this.outboundRepo.markProcessing(itemId, workerId, leaseToken, extendSeconds, pool);
  }

  /**
   * Dispatches a single outbound command explicitly via ChannelDispatchService.
   *
   * Invariants:
   * 1. Lease Fencing: Heartbeat renews lease; if lost, aborts in-flight and rejects finalization.
   * 2. Sanitized Errors: Zero raw error messages or provider payloads stored in database.
   * 3. Zero PII Logging: Telephone numbers (masked or unmasked) are NEVER logged.
   */
  async dispatchItem(
    pool: Pool,
    item: ClaimedOutboxItem,
    workerId: string,
    dispatchServiceOrRegistry: ChannelDispatchService | ChannelAdapterRegistry,
    secretResolver?: ISigningSecretResolver,
    signal?: AbortSignal
  ): Promise<{ success: boolean; externalMessageId?: string; status: string }> {
    let heartbeatTimer: NodeJS.Timeout | null = null;
    let inFlightHeartbeat: Promise<void> | null = null;

    // 0. Crash recovery protection:
    // If the command was claimed from 'processing' (lease had expired), a previous worker
    // may have crashed AFTER the external provider accepted the message.
    // Blindly re-sending would cause duplicate external messages to the customer.
    // Instead, route this ambiguous state directly to 'reconciliation_required'.
    if (item.previous_status === "processing") {
      logger.warn(
        { commandId: item.id, workerId },
        "Outbox command lease expired while in processing (potential worker crash). Routing to reconciliation_required to prevent duplicate dispatch."
      );
      const sanitizedCrashError = sanitizeOutboxErrorMessage("reconciliation", "ERR_LEASE_EXPIRED_DURING_PROCESSING");
      await withWorkerTransaction(item.workspace_id, async (client) => {
        await this.outboundRepo.markReconciliationRequired(
          item.id,
          workerId,
          item.lease_token,
          sanitizedCrashError,
          client
        );
      }, pool);
      return { success: false, status: "reconciliation_required" };
    }

    // Fail-Closed: Validate cryptographic master key before any dispatch or persistence
    const masterKey = this.resolveMasterKey(secretResolver);

    try {
      // Reset lease clock immediately upon starting item dispatch
      const initialLease = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
      if (!initialLease) {
        throw new FencingViolationError(
          item.id,
          "Lease expired or was reclaimed before execution"
        );
      }

      const abortController = new AbortController();
      if (signal) {
        if (signal.aborted) {
          abortController.abort(signal.reason);
        } else {
          signal.addEventListener("abort", () => abortController.abort(signal.reason), { once: true });
        }
      }
      const effectiveSignal = abortController.signal;

      // Start background heartbeat to renew lease every 10 seconds during processing
      heartbeatTimer = setInterval(() => {
        if (effectiveSignal.aborted) {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
          return;
        }

        inFlightHeartbeat = (async () => {
          try {
            if (effectiveSignal.aborted) return;
            const renewed = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
            if (!renewed) {
              logger.warn(
                { commandId: item.id, workerId },
                "Lease lost during heartbeat renewal, aborting in-flight dispatch"
              );
              abortController.abort(
                new FencingViolationError(
                  item.id,
                  "Lease expired or stolen during dispatch heartbeat"
                )
              );
            }
          } catch (err: unknown) {
            logger.warn(
              { commandId: item.id, workerId, err: err instanceof Error ? err.message : String(err) },
              "Heartbeat renewal threw exception; aborting in-flight dispatch (fail-closed)"
            );
            abortController.abort(
              new FencingViolationError(
                item.id,
                `Heartbeat renewal exception: ${err instanceof Error ? err.message : String(err)}`
              )
            );
          } finally {
            inFlightHeartbeat = null;
          }
        })();
      }, 10000);
      heartbeatTimer.unref();

      if (effectiveSignal.aborted) {
        throw new FencingViolationError(item.id, "Dispatch was aborted by signal before execution");
      }

      // Resolve ChannelDispatchService
      let dispatchService: ChannelDispatchService;
      if ("dispatchOutbound" in dispatchServiceOrRegistry) {
        dispatchService = dispatchServiceOrRegistry as ChannelDispatchService;
      } else {
        if (!secretResolver) {
          throw new Error("SECRET_RESOLVER_REQUIRED: Must provide secretResolver when passing ChannelAdapterRegistry to dispatchItem");
        }
        const channelRepo = new ChannelInstanceRepository(pool);
        dispatchService = new ChannelDispatchService({
          channelInstanceRepo: channelRepo,
          adapterRegistry: dispatchServiceOrRegistry as ChannelAdapterRegistry,
          secretResolver,
        });
      }

      // 1. Fetch optional 24h window timestamp under tenant scope
      let lastInboundAt: Date | null = null;
      if (item.thread_id) {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          const lastInboundRes = await client.query<{ created_at: Date }>(
            `SELECT created_at FROM public.messages 
             WHERE thread_id = $1 AND direction = 'inbound' 
             ORDER BY created_at DESC LIMIT 1;`,
            [item.thread_id]
          );
          if (lastInboundRes.rows.length > 0) {
            lastInboundAt = lastInboundRes.rows[0]!.created_at;
          }
        }, pool);
      }

      // Construct WABA template object if template_name is present
      const template = item.template_name
        ? {
            name: item.template_name,
            language: item.template_language || "pt_BR",
            components: (item.template_components as any) || undefined,
          }
        : undefined;

      const interactive = item.interactive_payload
        ? (item.interactive_payload as any)
        : undefined;

      // PRE-SEND FENCING VALIDATION (CH-02):
      // Verify that the lease is still valid and owned by this worker immediately before external send
      if (effectiveSignal.aborted) {
        throw new FencingViolationError(
          item.id,
          "Dispatch aborted before external send"
        );
      }
      const preSendRenewed = await this.renewLease(pool, item.id, workerId, item.lease_token, 30);
      if (!preSendRenewed) {
        throw new FencingViolationError(
          item.id,
          "Lease expired or stolen immediately before external send"
        );
      }

      const autonomous = await withWorkerTransaction(item.workspace_id,async client=>(await client.query<{source:string|null;status:string|null;enabled:boolean|null;handoff_ack:boolean|null;capability_signature:string|null;ai_skills:Record<string,unknown>|null}>(`SELECT m.metadata->>'source' AS source,(m.metadata->>'needsHandoff'='true') AS handoff_ack,ct.status,w.ai_receptionist_enabled AS enabled,m.metadata->>'capabilitySignature' AS capability_signature,w.ai_skills
        FROM public.messages m JOIN public.workspaces w ON w.id=m.workspace_id
        LEFT JOIN public.commercial_threads ct ON ct.id=m.thread_id AND ct.workspace_id=m.workspace_id
        WHERE m.workspace_id=$1 AND m.id=$2`,[item.workspace_id,item.message_id])).rows[0],pool);
      if(autonomous?.source==="ai_receptionist" && (!(autonomous.status==="active" || (autonomous.status==="waiting_human" && autonomous.handoff_ack===true)) || autonomous.enabled!==true || !autonomous.capability_signature || autonomous.capability_signature!==aiCapabilitySignature(autonomous.ai_skills))){
        await withWorkerTransaction(item.workspace_id,async client=>{
          await this.outboundRepo.markPermanentFailure(item.id,workerId,item.lease_token,"AI_REPLY_SUSPENDED: atendimento assumido, IA suspensa ou funções alteradas; revise a conversa",client);
          await client.query("UPDATE public.messages SET delivery_status='failed',status_rank=-1,updated_at=now() WHERE workspace_id=$1 AND id=$2",[item.workspace_id,item.message_id]);
        },pool);
        return {success:false,status:"dead_letter"};
      }

      if(autonomous?.source==='ai_receptionist'){
        const checkout=await withWorkerTransaction(item.workspace_id,async client=>(await client.query(`SELECT m.metadata->>'checkoutRequestId' AS request_id,m.metadata->>'generatedPixChargeId' AS charge_id,m.metadata->>'checkoutMessageKind' AS kind FROM messages m WHERE workspace_id=$1 AND id=$2`,[item.workspace_id,item.message_id])).rows[0],pool);
        if(checkout?.request_id&&checkout.kind!=="status"){
          const valid=await withWorkerTransaction(item.workspace_id,async client=>checkout.charge_id?
            (await client.query("SELECT r.id FROM ai_checkout_requests r JOIN pix_charges p ON p.workspace_id=r.workspace_id AND p.id=r.charge_id WHERE r.workspace_id=$1 AND r.id=$2 AND p.id=$3 AND p.status='PENDING' AND p.expires_at>clock_timestamp()",[item.workspace_id,checkout.request_id,checkout.charge_id])).rows.length>0:
            (await client.query("SELECT id FROM ai_checkout_requests WHERE workspace_id=$1 AND id=$2 AND summary_message_id=$3 AND status='pending' AND valid_until>clock_timestamp()",[item.workspace_id,checkout.request_id,item.message_id])).rows.length>0,pool);
          if(!valid){await withWorkerTransaction(item.workspace_id,async client=>{await this.outboundRepo.markPermanentFailure(item.id,workerId,item.lease_token,'CHECKOUT_MESSAGE_STALE: resumo ou cobrança encerrados; revise o pedido antes de enviar',client);await client.query("UPDATE messages SET delivery_status='failed',status_rank=-1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",[item.workspace_id,item.message_id]);},pool);return {success:false,status:'dead_letter'};}
        }
      }

      if(item.template_name){
        const proof=await withWorkerTransaction(item.workspace_id,async client=>(await client.query(`SELECT ch.provider,m.metadata->>'systemTemplateLayoutHash' AS snapshot_hash,mt.* FROM messages m JOIN channel_instances ch ON ch.id=m.channel_instance_id AND ch.workspace_id=m.workspace_id LEFT JOIN message_templates mt ON mt.workspace_id=m.workspace_id AND mt.name=$3 AND mt.language=$4 WHERE m.workspace_id=$1 AND m.id=$2`,[item.workspace_id,item.message_id,item.template_name,item.template_language||"pt_BR"])).rows[0],pool);
        if(!proof)throw new Error("TEMPLATE_CONTEXT_MISSING: a mensagem perdeu seu contexto de envio");
        if(proof.provider==="meta_waba"){
          const layout=storedTemplateLayout(proof),hash=crypto.createHash("sha256").update(templateLayoutSignature(layout)).digest("hex");
          const components=(item.template_components||[]) as WabaTemplateComponent[];
          if(!proof.snapshot_hash||proof.snapshot_hash!==hash||proof.status!=="APPROVED"||!proof.meta_template_id||proof.meta_verified_channel_id!==item.channel_instance_id||!proof.meta_verified_at||new Date(proof.meta_verified_at).getTime()<=Date.now()-86400000||validateTemplateComponents(layout,components).length){
            await withWorkerTransaction(item.workspace_id,async client=>{await this.outboundRepo.markPermanentFailure(item.id,workerId,item.lease_token,"TEMPLATE_LAYOUT_CHANGED: confira o modelo e prepare o envio novamente",client);await client.query("UPDATE messages SET delivery_status='failed',status_rank=-1,updated_at=now() WHERE workspace_id=$1 AND id=$2",[item.workspace_id,item.message_id]);},pool);
            return {success:false,status:"dead_letter"};
          }
        }
      }

      if(item.idempotency_key.startsWith("btest_")){
        const valid=await withWorkerTransaction(item.workspace_id,async client=>(await client.query<{valid:boolean}>(`SELECT (p.expires_at>now() AND ch.is_active AND ch.status='connected' AND COALESCE(c.opt_out,false)=false AND mt.body_text=t.template_body AND mt.name=t.template_name AND mt.language=t.template_language AND (ch.provider<>'meta_waba' OR (ch.meta_billing_configured AND mt.status='APPROVED' AND mt.meta_template_id IS NOT NULL AND mt.meta_verified_channel_id=ch.id AND mt.meta_verified_at>now()-interval '24 hours'))) AS valid
          FROM broadcast_message_tests t JOIN broadcast_preparations p ON p.id=t.preparation_id AND p.workspace_id=t.workspace_id JOIN message_templates mt ON mt.id=t.template_id AND mt.workspace_id=t.workspace_id JOIN channel_instances ch ON ch.id=$3 AND ch.workspace_id=t.workspace_id LEFT JOIN contacts c ON c.workspace_id=t.workspace_id AND c.phone_e164=t.phone_e164 WHERE t.workspace_id=$1 AND t.outbound_command_id=$2`,[item.workspace_id,item.id,item.channel_instance_id])).rows[0]?.valid===true,pool);
        if(!valid){
          await withWorkerTransaction(item.workspace_id,async client=>{
            await this.outboundRepo.markPermanentFailure(item.id,workerId,item.lease_token,"BROADCAST_TEST_BLOCKED: expired review, changed template, opt-out or disconnected channel",client);
            await client.query("UPDATE public.messages SET delivery_status='failed',status_rank=-1,updated_at=now() WHERE workspace_id=$1 AND id=$2",[item.workspace_id,item.message_id]);
          },pool);
          return {success:false,status:"dead_letter"};
        }
      }

      // Campaign consent/cancellation is revalidated just before an external send.
      const campaignGuard = await withWorkerTransaction(item.workspace_id, async client => {
        const guard=(await client.query<{
        id: string; campaign_id: string; status: string; opt_out: boolean | null; provider: string; verified: boolean; channel_active: boolean; channel_status: string; billing_declared: boolean; audience_type:BroadcastAudienceSelection["type"];audience_stage:string|null;phone_e164:string;contact_id:string|null;
      }>(`SELECT br.id,br.campaign_id,bc.status,c.opt_out,ch.provider,ch.is_active AS channel_active,ch.status AS channel_status,ch.meta_billing_configured AS billing_declared,bc.audience_type,bc.audience_stage,br.phone_e164,br.contact_id,
          (mt.status='APPROVED' AND mt.meta_template_id IS NOT NULL AND mt.meta_verified_channel_id=bc.channel_instance_id AND mt.meta_verified_at>now()-interval '24 hours') AS verified
          FROM public.broadcast_recipients br JOIN public.broadcast_campaigns bc ON bc.id=br.campaign_id AND bc.workspace_id=br.workspace_id
          JOIN public.channel_instances ch ON ch.id=bc.channel_instance_id AND ch.workspace_id=bc.workspace_id
          LEFT JOIN public.contacts c ON c.id=br.contact_id AND c.workspace_id=br.workspace_id
          JOIN public.message_templates mt ON mt.id=br.template_id AND mt.workspace_id=br.workspace_id
          WHERE br.workspace_id=$1 AND br.outbound_command_id=$2`, [item.workspace_id,item.id])).rows[0];
        if(!guard)return undefined;
        const manual=["MANUAL","IMPORT_LIST"].includes(guard.audience_type);
        const selection:BroadcastAudienceSelection={type:manual?"MANUAL":guard.audience_type,stage:guard.audience_stage||undefined,smartFilter:guard.audience_stage||undefined,customPhoneNumbers:[guard.phone_e164]};
        let eligible=false;
        if(guard.contact_id&&guard.opt_out===false&&["ALL_CONTACTS","BY_STAGE","MANUAL","IMPORT_LIST","SMART_FILTER"].includes(guard.audience_type)&&!(guard.audience_type==="SMART_FILTER"&&!["NON_BUYERS","PIX_ABANDONED","INACTIVE_30_DAYS","CTWA_RESCUE"].includes(guard.audience_stage||""))){
          const matches=await resolveBroadcastAudience(client,item.workspace_id,selection,[{phone_e164:guard.phone_e164,contact_id:guard.contact_id}]);
          eligible=matches.some(target=>!target.opt_out);
        }
        return {...guard,eligible};
      }, pool);
      if ((!campaignGuard && item.idempotency_key.startsWith("bcast_")) || (campaignGuard && (!["queued","partial","processing"].includes(campaignGuard.status) || !campaignGuard.channel_active || campaignGuard.channel_status !== "connected" || !campaignGuard.eligible || campaignGuard.opt_out !== false || (campaignGuard.provider === "meta_waba" && (!campaignGuard.verified || !campaignGuard.billing_declared))))) {
        await withWorkerTransaction(item.workspace_id, async client => {
          const reason = encodeBroadcastBlockReason(broadcastBlockCodes(campaignGuard));
          await this.outboundRepo.markPermanentFailure(item.id,workerId,item.lease_token,reason,client);
          await client.query("UPDATE public.messages SET delivery_status='failed',status_rank=-1,updated_at=now() WHERE workspace_id=$1 AND id=$2", [item.workspace_id,item.message_id]);
          await client.query("UPDATE public.broadcast_recipients SET status='blocked',error_message=$3 WHERE workspace_id=$1 AND id=$2", [item.workspace_id,campaignGuard?.id ?? null,reason]);
        }, pool);
        return { success: false, status: "dead_letter" };
      }

      // 2. Perform outbound dispatch via ChannelDispatchService
      let sendResult: ChannelSendResult;
      try {
        sendResult = await dispatchService.dispatchOutbound(
          item.workspace_id,
          item.channel_instance_id,
          {
            recipientE164: item.recipient_e164,
            body: item.body,
            mediaUrl: item.media_url,
            template,
            interactive,
            idempotencyKey: item.idempotency_key,
            commandId: item.id,
            messageId: item.message_id,
            lastInboundMessageAt: lastInboundAt,
            signal: effectiveSignal,
          }
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const causeMsg = (err instanceof Error && (err as any).cause instanceof Error) ? (err as any).cause.message : "";
        if (msg.includes("FENCING") || causeMsg.includes("FENCING") || effectiveSignal.aborted) {
          throw err;
        }

        if (
          err instanceof ChannelInstanceNotFoundError ||
          err instanceof ChannelInstanceInactiveError ||
          err instanceof ChannelCapabilityUnsupportedError
        ) {
          const canonicalCode = resolveCanonicalErrorCode(err, "permanent");
          const sanitizedError = sanitizeOutboxErrorMessage("permanent", canonicalCode);
          logger.warn(
            { commandId: item.id, workerId, errorCode: canonicalCode },
            "Permanent dispatch rejection from ChannelDispatchService"
          );
          await withWorkerTransaction(item.workspace_id, async (client) => {
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
              client
            );
            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
                [item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }
          }, pool);
          return { success: false, status: "dead_letter" };
        }

        if (
          msg.includes("ETIMEDOUT") ||
          msg.includes("ECONNRESET") ||
          msg.includes("timeout") ||
          msg.includes("ambiguous")
        ) {
          const canonicalCode = resolveCanonicalErrorCode(msg, "ambiguous");
          const sanitizedError = sanitizeOutboxErrorMessage("ambiguous", canonicalCode);
          logger.warn(
            { commandId: item.id, workerId, errorCode: canonicalCode },
            "Ambiguous timeout/socket reset during dispatch. Routing to reconciliation_required to prevent duplicate dispatch."
          );
          await withWorkerTransaction(item.workspace_id, async (client) => {
            await this.outboundRepo.markReconciliationRequired(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
              client
            );
          }, pool);
          return { success: false, status: "reconciliation_required" };
        }

        throw err;
      }

      // Await any in-flight heartbeat and stop the timer before evaluating post-send ownership
      if (inFlightHeartbeat) {
        try {
          await inFlightHeartbeat;
        } catch {
          // ignore handled error
        }
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      // POST-SEND FENCING CHECK (P0-3):
      // After provider returns, verify ownership before finalization.
      // If ownership was lost after provider confirmed delivery, route to reconciliation, NEVER retry!
      const leaseLostDuringSend = effectiveSignal.aborted;
      const postSendRenewed = !leaseLostDuringSend && (await this.renewLease(pool, item.id, workerId, item.lease_token, 30));

      if (leaseLostDuringSend || !postSendRenewed) {
        if (sendResult.success) {
          logger.warn(
            { commandId: item.id, workerId },
            "Lease lost or expired during external send after provider confirmed delivery. Routing to reconciliation_required."
          );
          const sanitizedPostSendLeaseError = sanitizeOutboxErrorMessage("reconciliation", "ERR_LEASE_LOST_AFTER_SEND");
          let outcome: PostSendReconciliationOutcome;
          try {
            outcome = await withWorkerTransaction(item.workspace_id, async (client) => {
              return await this.outboundRepo.markPostSendReconciliationRequired(
                item.workspace_id,
                item.id,
                workerId,
                item.lease_token,
                sendResult.externalMessageId!,
                sanitizedPostSendLeaseError,
                client
              );
            }, pool);
          } catch (reconErr: unknown) {
            logger.error(
              { commandId: item.id, workerId, err: reconErr instanceof Error ? reconErr.message : String(reconErr) },
              "Critical: Failed to record post-send lease loss reconciliation state"
            );
            throw reconErr;
          }
          return this.handlePostSendReconciliationOutcome(outcome, item.id, sendResult.externalMessageId);
        } else {
          throw new FencingViolationError(item.id, "Lease lost during dispatch execution");
        }
      }

      // 3. Handle success: Transactional finalization of command, EXACT message, and delivery event
      if (sendResult.success) {
        try {
          await withWorkerTransaction(item.workspace_id, async (client) => {
            // Step 1: Verify channel instance and provider (fail-closed, no fallback)
            const chanRes = await client.query<{ provider: string }>(
              "SELECT provider FROM public.channel_instances WHERE id = $1 AND workspace_id = $2 AND is_active = true;",
              [item.channel_instance_id, item.workspace_id]
            );
            const provider = chanRes.rows[0]?.provider;
            if (!provider) {
              throw new ChannelInstanceNotFoundError(item.channel_instance_id, item.workspace_id);
            }

            // Step 2: Fencing update to 'sent'
            await this.outboundRepo.markSent(
              item.id,
              workerId,
              item.lease_token,
              sendResult.externalMessageId!,
              sendResult.sentAt ?? new Date(),
              client
            );

            // Step 3: Strictly update single message
            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'sent', status_rank = 10, provider_message_id = $1, updated_at = clock_timestamp()
                 WHERE id = $2 AND workspace_id = $3 AND channel_instance_id = $4;`,
                [sendResult.externalMessageId, item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }

            // Step 3.1: Reconcile broadcast_recipients if command was dispatched by a broadcast campaign
            const sentRecipients = await client.query<{campaign_id:string}>(
              `UPDATE public.broadcast_recipients
               SET external_message_id=$1,status='sent',sent_at=$3
               WHERE outbound_command_id=$2 AND sent_at IS NULL RETURNING campaign_id`,
              [sendResult.externalMessageId,item.id,sendResult.sentAt ?? new Date()]
            );
            for (const recipient of sentRecipients.rows) await client.query(
              "UPDATE public.broadcast_campaigns SET sent_count=sent_count+1,updated_at=now() WHERE workspace_id=$1 AND id=$2", [item.workspace_id,recipient.campaign_id]
            );

            // Step 4: Record delivery event append-only without swallowing errors
            const rawEvent = JSON.stringify({
              externalMessageId: sendResult.externalMessageId,
              sentAt: sendResult.sentAt,
              commandId: item.id,
              status: "sent",
            });
            const eventHash = crypto.createHash("sha256").update(rawEvent).digest("hex");
            const enc = encryptPayload(rawEvent, masterKey);

            await client.query(
              `INSERT INTO public.provider_delivery_events (
                 workspace_id, channel_instance_id, message_id, external_message_id,
                 external_event_id, recipient_e164, provider, status,
                 raw_payload_hash, encrypted_payload, payload_iv, payload_auth_tag, occurred_at
               ) VALUES (
                 $1, $2, $3, $4,
                 $5, $6, $7, 'sent',
                 $8, $9, $10, $11, $12
               )
               ON CONFLICT (channel_instance_id, external_event_id) DO NOTHING;`,
              [
                item.workspace_id,
                item.channel_instance_id,
                item.message_id,
                sendResult.externalMessageId,
                `send-${item.id}`,
                item.recipient_e164,
                provider,
                eventHash,
                enc.encryptedBase64,
                enc.ivBase64,
                enc.authTagBase64,
                sendResult.sentAt ?? new Date(),
              ]
            );
          }, pool);

          return { success: true, externalMessageId: sendResult.externalMessageId, status: "sent" };
        } catch (postSendErr: unknown) {
          // Provider send succeeded, but local transactional finalization failed.
          // Incomplete transaction rolled back automatically.
          // Persist state reconciliation_required in new transaction to preserve externalMessageId and prevent duplicate dispatch!
          const errorDetail = postSendErr instanceof Error ? postSendErr.message : String(postSendErr);
          logger.error(
            { commandId: item.id, workerId, err: errorDetail },
            "Post-send persistence failed after provider confirmation. Routing to reconciliation_required to preserve externalMessageId and prevent duplicate dispatch."
          );

          const sanitizedPostSendError = sanitizeOutboxErrorMessage("reconciliation", "ERR_POST_SEND_PERSISTENCE_FAILED");
          let outcome: PostSendReconciliationOutcome;
          try {
            outcome = await withWorkerTransaction(item.workspace_id, async (client) => {
              return await this.outboundRepo.markPostSendReconciliationRequired(
                item.workspace_id,
                item.id,
                workerId,
                item.lease_token,
                sendResult.externalMessageId!,
                sanitizedPostSendError,
                client
              );
            }, pool);
          } catch (reconErr: unknown) {
            logger.error(
              { commandId: item.id, workerId, err: reconErr instanceof Error ? reconErr.message : String(reconErr) },
              "Critical: Failed to record post-send reconciliation state after rollback"
            );
            throw reconErr;
          }

          return this.handlePostSendReconciliationOutcome(outcome, item.id, sendResult.externalMessageId);
        }
      }

      // 4. Handle non-success response with centralized sanitization
      const canonicalErrorCode = resolveCanonicalErrorCode(sendResult.errorCode, sendResult.category);
      const sanitizedErrorMessage = sanitizeOutboxErrorMessage(sendResult.category, canonicalErrorCode);

      if (sendResult.category === "ambiguous") {
        // P0: Ambiguous results (timeout, socket reset) MUST NOT enter normal retry.
        // Set reconciliation_required to prevent duplicate external messages!
        await withWorkerTransaction(item.workspace_id, async (client) => {
          await this.outboundRepo.markReconciliationRequired(
            item.id,
            workerId,
            item.lease_token,
            sanitizedErrorMessage,
            client
          );
        }, pool);
        return { success: false, status: "reconciliation_required" };
      }

      if (sendResult.category === "permanent") {
        // Permanent failure: transition command to dead_letter and message to failed (-1)
        await withWorkerTransaction(item.workspace_id, async (client) => {
          await this.outboundRepo.markPermanentFailure(
            item.id,
            workerId,
            item.lease_token,
            sanitizedErrorMessage,
            client
          );

          if (item.message_id) {
            await client.query(
              `UPDATE public.messages
               SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
               WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
              [item.message_id, item.workspace_id, item.channel_instance_id]
            );
          }
        }, pool);
        return { success: false, status: "dead_letter" };
      }

      // Transient failure with exponential backoff and jitter
      let nextAttemptAt: Date;
      if (sendResult.retryAfterSeconds && sendResult.retryAfterSeconds > 0) {
        nextAttemptAt = new Date(Date.now() + sendResult.retryAfterSeconds * 1000);
      } else {
        const decision = QueueRetryPolicy.evaluate(item.retry_count, item.max_retries, new Date(), {
          jitterRatio: 0.15,
        });
        if (decision.nextStatus === "dead_letter") {
          const maxRetrySanitized = sanitizeOutboxErrorMessage("permanent", "ERR_RECONCILIATION_TTL_EXPIRED");
          await withWorkerTransaction(item.workspace_id, async (client) => {
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              maxRetrySanitized,
              client
            );

            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
                [item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }
          }, pool);
          return { success: false, status: "dead_letter" };
        }
        nextAttemptAt = decision.nextAttemptAt ?? new Date();
      }

      await withWorkerTransaction(item.workspace_id, async (client) => {
        await this.outboundRepo.markRetryableFailure(
          item.id,
          workerId,
          item.lease_token,
          sanitizedErrorMessage,
          nextAttemptAt,
          client
        );
      }, pool);
      return { success: false, status: "failed" };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const causeMsg = (err instanceof Error && (err as any).cause instanceof Error) ? (err as any).cause.message : "";
      if (
        msg.includes("FENCING") ||
        causeMsg.includes("FENCING") ||
        (err instanceof FencingViolationError) ||
        msg.includes("DATA_INCONSISTENCY")
      ) {
        throw err;
      }
      const canonicalCode = resolveCanonicalErrorCode(err, "transient");
      logger.error({ commandId: item.id, workerId, errorCode: canonicalCode }, "Exception during outbox dispatch");

      const decision = QueueRetryPolicy.evaluate(item.retry_count, item.max_retries, new Date(), {
        jitterRatio: 0.15,
      });
      const sanitizedError = sanitizeOutboxErrorMessage(
        decision.nextStatus === "dead_letter" ? "permanent" : "transient",
        canonicalCode
      );

      try {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          if (decision.nextStatus === "dead_letter") {
            await this.outboundRepo.markPermanentFailure(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
              client
            );
            if (item.message_id) {
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2 AND channel_instance_id = $3;`,
                [item.message_id, item.workspace_id, item.channel_instance_id]
              );
            }
          } else {
            await this.outboundRepo.markRetryableFailure(
              item.id,
              workerId,
              item.lease_token,
              sanitizedError,
              decision.nextAttemptAt ?? new Date(),
              client
            );
          }
        }, pool);
      } catch {
        logger.error({ commandId: item.id, workerId }, "Failed to update failed status for outbox command");
      }

      return { success: false, status: "failed" };
    } finally {
      if(item.idempotency_key.startsWith("bcast_")){
        try {await this.refreshCampaignProgress(pool,item);}catch{logger.error({commandId:item.id},"Campaign progress requires reconciliation");}
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (inFlightHeartbeat) {
        try {
          await inFlightHeartbeat;
        } catch {
          // ignore
        }
      }
    }
  }

  /**
   * Administrative reconciliation action for commands in 'reconciliation_required'.
   */
  private async refreshCampaignProgress(pool:Pool,item:ClaimedOutboxItem):Promise<void>{
    await withWorkerTransaction(item.workspace_id,async client=>{
      const campaign=(await client.query<{id:string}>(`SELECT bc.id FROM public.broadcast_campaigns bc JOIN public.broadcast_recipients br ON br.campaign_id=bc.id AND br.workspace_id=bc.workspace_id WHERE br.workspace_id=$1 AND br.outbound_command_id=$2 FOR UPDATE OF bc`,[item.workspace_id,item.id])).rows[0];
      if(!campaign)return;
      await client.query(`UPDATE public.broadcast_recipients br SET status=CASE WHEN br.status='blocked' THEN 'blocked' WHEN oc.status='dead_letter' THEN 'failed' WHEN oc.status IN ('reconciliation_required','reconciling') THEN 'uncertain' ELSE br.status END
        FROM public.outbound_commands oc WHERE br.workspace_id=$1 AND br.campaign_id=$2 AND oc.id=br.outbound_command_id AND oc.workspace_id=br.workspace_id`,[item.workspace_id,campaign.id]);
      await client.query(`UPDATE public.broadcast_campaigns bc SET sent_count=s.sent,failed_count=s.failed,
        status=CASE WHEN bc.status='cancelled' THEN 'cancelled' WHEN s.terminal>=bc.total_targeted THEN CASE WHEN s.failed>0 THEN 'partial' ELSE 'completed' END ELSE 'queued' END,updated_at=now()
        FROM (SELECT count(*) FILTER(WHERE sent_at IS NOT NULL)::int AS sent,count(*) FILTER(WHERE status IN ('blocked','failed'))::int AS failed,count(*) FILTER(WHERE sent_at IS NOT NULL OR status IN ('blocked','failed'))::int AS terminal FROM public.broadcast_recipients WHERE workspace_id=$1 AND campaign_id=$2) s
        WHERE bc.workspace_id=$1 AND bc.id=$2`,[item.workspace_id,campaign.id]);
    },pool);
  }

  async reconcileItem(
    pool: Pool,
    workspaceId: string,
    commandId: string,
    resolution: "sent" | "dead_letter" | "retry",
    options: {
      externalMessageId?: string;
      adminNote?: string;
      actorId?: string;
    } = {}
  ): Promise<boolean> {
    if (resolution === "sent") {
      if (
        !options.externalMessageId ||
        typeof options.externalMessageId !== "string" ||
        !options.externalMessageId.trim()
      ) {
        throw new Error("ADMIN_RECONCILE_ERROR: externalMessageId is mandatory for manual 'sent' resolution");
      }
      if (options.externalMessageId.startsWith("manual-recon-")) {
        throw new Error("ADMIN_RECONCILE_ERROR: Artificial externalMessageId is strictly prohibited for 'sent' resolution");
      }
    }

    const effectiveAdminNote = options.adminNote || (
      resolution === "sent"
        ? "Reconciled: Externally verified sent"
        : resolution === "dead_letter"
        ? sanitizeOutboxErrorMessage("permanent", "ERR_ADMIN_RESOLVED_DEAD_LETTER")
        : sanitizeOutboxErrorMessage("reconciliation", "ERR_ADMIN_RESOLVED_RETRY")
    );

    return await withTenantTransaction(workspaceId, async (client) => {
      const reconciled = await this.outboundRepo.adminReconcile(
        workspaceId,
        commandId,
        resolution,
        {
          externalMessageId: options.externalMessageId,
          adminNote: effectiveAdminNote,
          actorId: options.actorId,
        },
        client
      );

      return Boolean(reconciled);
    }, pool);
  }

  /**
   * Reclaims abandoned processing leases and routes them directly to reconciliation_required.
   * Does NOT touch retry_count. Guarantees expired processing items never re-enter dispatch without reconciliation.
   */
  async reclaimExpiredLeases(pool: Pool, limit = 50): Promise<number> {
    return await this.outboundRepo.reclaimExpiredLeases(limit, pool);
  }

  /**
   * Executes a single claim-and-dispatch iteration.
   */
  async runOnce(
    pool: Pool,
    workerId: string,
    dispatchServiceOrRegistry: ChannelDispatchService | ChannelAdapterRegistry,
    secretResolver?: ISigningSecretResolver,
    limit = 10,
    signal?: AbortSignal
  ): Promise<number> {
    const items = await this.claimBatch(pool, workerId, limit);
    for (const item of items) {
      if (signal?.aborted) break;
      try {
        await this.dispatchItem(pool, item, workerId, dispatchServiceOrRegistry, secretResolver, signal);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("FENCING") || (err instanceof FencingViolationError)) {
          logger.warn({ commandId: item.id, workerId }, "Fencing abort or violation during dispatch");
        } else {
          logger.error({ commandId: item.id, workerId }, "Unhandled error during dispatch item");
        }
      }
    }
    return items.length;
  }

  /**
   * Automated periodic reconciliation of outbound commands in 'reconciliation_required'.
   * 1. Claims ambiguous commands with expired/null lease using SKIP LOCKED via repository.
   * 2. Checks provider_delivery_events under tenant scope for confirmed status.
   * 3. If delivery event found: auto-resolves to 'sent' or 'dead_letter' via repository.
   * 4. If no delivery event found: under P0-4 policy, command remains in 'reconciliation_required'
   *    (absence of webhook/evidence NEVER auto-retries). Releases lease so future ticks can re-evaluate.
   */
  async reconcileBatch(
    pool: Pool,
    workerId: string,
    limit = 10,
    _ttlSeconds = 60,
    signal?: AbortSignal
  ): Promise<number> {
    const items = await this.outboundRepo.claimReconciliationBatch(workerId, limit, 30, pool);
    let reconciledCount = 0;

    for (const item of items) {
      if (signal?.aborted) break;

      try {
        await withWorkerTransaction(item.workspace_id, async (client) => {
          // 1. Check if provider_delivery_events contains a matching delivery event
          const eventRes = await client.query<{
            status: string;
            external_message_id: string;
            error_message: string | null;
          }>(
            `SELECT status, external_message_id, error_message
             FROM public.provider_delivery_events
             WHERE workspace_id = $1
               AND (
                 message_id = $2
                 OR (external_message_id = $3 AND $3 IS NOT NULL)
                 OR ($3 IS NULL AND message_id IS NULL AND channel_instance_id = $4 AND recipient_e164 = $5 AND occurred_at >= ($6::timestamptz - INTERVAL '10 seconds'))
               )
             ORDER BY occurred_at DESC
             LIMIT 1;`,
            [
              item.workspace_id,
              item.message_id,
              item.external_message_id,
              item.channel_instance_id,
              item.recipient_e164,
              item.created_at,
            ]
          );

          if (eventRes.rows.length > 0) {
            const devEvent = eventRes.rows[0]!;
            if (devEvent.status !== "failed") {
              const rank = devEvent.status === "read" ? 30 : devEvent.status === "delivered" ? 20 : 10;
              await this.outboundRepo.resolveReconciliationSent(
                item.id,
                workerId,
                item.lease_token,
                devEvent.external_message_id,
                "Reconciled: Delivery event confirmed by provider",
                new Date(),
                client
              );
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = $1, status_rank = $2,
                     provider_message_id = COALESCE(provider_message_id, $3),
                     updated_at = clock_timestamp()
                 WHERE id = $4 AND workspace_id = $5;`,
                [devEvent.status, rank, devEvent.external_message_id, item.message_id, item.workspace_id]
              );
            } else {
              const sanitizedDevError = sanitizeOutboxErrorMessage("reconciliation", "ERR_DELIVERY_FAILURE_CONFIRMED");
              await this.outboundRepo.resolveReconciliationDeadLetter(
                item.id,
                workerId,
                item.lease_token,
                sanitizedDevError,
                client
              );
              await client.query(
                `UPDATE public.messages
                 SET delivery_status = 'failed', status_rank = -1, updated_at = clock_timestamp()
                 WHERE id = $1 AND workspace_id = $2;`,
                [item.message_id, item.workspace_id]
              );
            }
            reconciledCount++;
            return;
          }

          // 2. Inconclusive delivery: no provider delivery event found.
          // Under P0-4 policy: absence of webhook/evidence NEVER triggers automatic resend.
          // Command MUST remain in 'reconciliation_required'. Release lease so future ticks
          // or late webhook arrivals can re-evaluate.
          await this.outboundRepo.releaseReconciliationLease(
            item.id,
            workerId,
            item.lease_token,
            client
          );
          return;
        }, pool);
      } catch {
        logger.warn({ commandId: item.id, workerId }, "Failed to reconcile command");
      }
    }

    return reconciledCount;
  }

  private handlePostSendReconciliationOutcome(
    outcomeResult: PostSendReconciliationOutcome,
    commandId: string,
    localExternalMessageId?: string
  ): { success: boolean; externalMessageId?: string; status: string } {
    const { outcome, persistedExternalMessageId, persistedStatus } = outcomeResult;

    if (outcome === "already_sent") {
      if (!persistedExternalMessageId || persistedExternalMessageId.trim() === "") {
        logger.error(
          { commandId, persistedStatus },
          "Data inconsistency: Command is marked 'sent' in database but external_message_id is missing"
        );
        throw new Error(
          `DATA_INCONSISTENCY: Outbound command '${commandId}' is marked 'sent' but lacks a canonical external_message_id`
        );
      }

      if (localExternalMessageId && localExternalMessageId !== persistedExternalMessageId) {
        logger.warn(
          { commandId, localExternalMessageId, persistedExternalMessageId },
          "External message ID divergence detected: Local send attempt had different ID than canonical persisted ID from webhook/concurrent send"
        );
      }

      logger.info(
        { commandId, externalMessageId: persistedExternalMessageId },
        "Post-send reconciliation detected command is already sent (idempotent success with canonical ID)"
      );
      return {
        success: true,
        externalMessageId: persistedExternalMessageId,
        status: "sent",
      };
    }

    if (outcome === "already_dead_letter") {
      logger.warn(
        { commandId, persistedExternalMessageId },
        "Post-send reconciliation detected command is already dead_letter"
      );
      return {
        success: false,
        externalMessageId: persistedExternalMessageId ?? localExternalMessageId,
        status: "dead_letter",
      };
    }

    if (outcome === "ownership_lost") {
      logger.error(
        { commandId, persistedStatus, persistedExternalMessageId },
        "Post-send reconciliation rejected: lease ownership lost"
      );
      throw new FencingViolationError(commandId, "Lease ownership lost during post-send reconciliation");
    }

    if (outcome === "transitioned_to_reconciliation") {
      return {
        success: false,
        externalMessageId: persistedExternalMessageId ?? localExternalMessageId,
        status: "reconciliation_required",
      };
    }

    throw new Error(`INVALID_OUTBOX_STATE: Post-send reconciliation rejected with state '${outcome}'`);
  }
}
