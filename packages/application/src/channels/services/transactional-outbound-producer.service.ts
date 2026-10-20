import {
  withTenantTransaction,
  getMessageTemplateByName,
  TransactionalOutboundProducerRepository,
  IdempotencyRaceLostError,
  LegacyIdempotencyRecordError,
  IdempotencyConflictError,
  ChannelInstanceNotFoundError,
  ChannelInstanceInactiveError,
  OutboundProducerValidationError,
  type Pool,
  type PoolClient,
} from "@sos-sales/database";
import crypto from "node:crypto";
import {storedTemplateLayout,templateLayoutSignature,validateTemplateComponents} from "@sos-sales/contracts";
import type {
  PublicOutboundRequest,
  TrustedOutboundContext,
  ProduceOutboundOutput,
} from "@sos-sales/contracts";
import type { ITransactionalOutboundProducerService } from "../../ports/transactional-outbound-producer.port";
import { validateMediaUrl } from "../security/ssrf-guard";
import {
  computeOutboundPayloadFingerprint,
  isFingerprintMatch,
} from "../sanitizers/canonical-fingerprint";


export interface TransactionalOutboundProducerServiceOptions {
  repository?: TransactionalOutboundProducerRepository;
  /** Internal transactional linkage; never populated from an HTTP payload. */
  onCreated?: (client: PoolClient, result: ProduceOutboundOutput) => Promise<void>;
  pool?: Pool;
  ssrfOptions?: {
    allowLocalTest?: boolean;
  };
}

/**
 * TransactionalOutboundProducerService
 *
 * Implements CH-11: Atomic outbound message intention production.
 * Atomicity = { message + outbound_command + audit_event } in a single PostgreSQL transaction under RLS.
 */
export class TransactionalOutboundProducerService implements ITransactionalOutboundProducerService {
  private readonly onCreated?: TransactionalOutboundProducerServiceOptions["onCreated"];
  private readonly repository: TransactionalOutboundProducerRepository;
  private readonly pool?: Pool;
  private readonly ssrfOptions?: { allowLocalTest?: boolean };

  constructor(options: TransactionalOutboundProducerServiceOptions = {}) {
    this.onCreated = options.onCreated;
    this.repository = options.repository ?? new TransactionalOutboundProducerRepository(options.pool);
    this.pool = options.pool;
    this.ssrfOptions = options.ssrfOptions;
  }

  async produce(
    request: PublicOutboundRequest,
    context: TrustedOutboundContext
  ): Promise<ProduceOutboundOutput> {
    // 1. SSRF Perimeter Guard on mediaUrl (before opening any database transaction)
    if (request.mediaUrl) {
      try {
        validateMediaUrl(request.mediaUrl, this.ssrfOptions);
      } catch (err: any) {
        throw new OutboundProducerValidationError(
          `SSRF protection rejected mediaUrl: ${err.message}`
        );
      }
    }

    // 2. Canonical payload fingerprint calculation (SHA-256 64-hex lowercase)
    const computedFingerprint = computeOutboundPayloadFingerprint(request, context);

    // 3. Execution inside tenant transaction under RLS
    try {
      return await withTenantTransaction(
        context.workspaceId,
        async (client) => {
          // 3.1 Check existing command for persistent idempotency
          const existing = await this.repository.findReplayProjection(
            { workspaceId: context.workspaceId, idempotencyKey: request.idempotencyKey },
            client
          );

          if (existing) {
            // Fail closed if legacy record has null fingerprint
            if (!existing.payloadFingerprint) {
              throw new LegacyIdempotencyRecordError(
                context.workspaceId,
                request.idempotencyKey
              );
            }

            // Constant-time timing-safe comparison
            if (isFingerprintMatch(computedFingerprint, existing.payloadFingerprint)) {
              return {
                messageId: existing.messageId,
                commandId: existing.commandId,
                threadId: existing.threadId,
                contactId: existing.contactId,
                idempotencyKey: request.idempotencyKey,
                status: existing.commandStatus as any,
                deliveryStatus: existing.deliveryStatus as any,
                isIdempotentReplay: true,
                createdAt: existing.createdAt.toISOString(),
              };
            } else {
              throw new IdempotencyConflictError(
                context.workspaceId,
                request.idempotencyKey,
                "Payload does not match original request parameters"
              );
            }
          }

          // 3.2 Validate Channel Instance under RLS
          const channel = await this.repository.getChannelInstance(
            {
              workspaceId: context.workspaceId,
              channelInstanceId: context.channelInstanceId,
            },
            client
          );

          if (!channel) {
            throw new ChannelInstanceNotFoundError(
              context.channelInstanceId,
              context.workspaceId
            );
          }

          if (!channel.isActive) {
            throw new ChannelInstanceInactiveError(context.channelInstanceId);
          }

          const senderE164 = channel.phoneNumberE164;
          if (!senderE164) {
            throw new OutboundProducerValidationError(
              `Channel instance '${context.channelInstanceId}' lacks a valid phone_number_e164 for outbound dispatch`
            );
          }

          let templateLayoutHash:string|undefined;
          if(channel.provider==="meta_waba"&&request.template){
            const template=await getMessageTemplateByName(client,context.workspaceId,request.template.name);
            if(!template||template.language!==request.template.language||template.status!=="APPROVED"||!template.meta_template_id||template.meta_verified_channel_id!==context.channelInstanceId||!template.meta_verified_at||template.meta_verified_at.getTime()<=Date.now()-86400000)throw new OutboundProducerValidationError("Sincronize um modelo aprovado para o canal antes de preparar o envio.");
            const layout=storedTemplateLayout(template as unknown as Record<string,unknown>);
            const errors=validateTemplateComponents(layout,request.template.components??[]);
            if(errors.length)throw new OutboundProducerValidationError(errors.join(" "));
            templateLayoutHash=crypto.createHash("sha256").update(templateLayoutSignature(layout)).digest("hex");
          }

          // 3.3 Relational Upserts & Inserts
          const contactId = await this.repository.upsertContact(
            {
              workspaceId: context.workspaceId,
              phoneE164: request.recipientPhoneE164,
            },
            client
          );

          const threadId = await this.repository.upsertCommercialThread(
            {
              workspaceId: context.workspaceId,
              channelInstanceId: context.channelInstanceId,
              contactId,
            },
            client
          );

          const message = await this.repository.insertMessage(
            {
              workspaceId: context.workspaceId,
              channelInstanceId: context.channelInstanceId,
              threadId,
              provider: channel.provider,
              senderE164,
              recipientE164: request.recipientPhoneE164,
              contentType: request.contentType,
              body: request.body,
              mediaUrl: request.mediaUrl,
              metadata:templateLayoutHash?{...(request.metadata as Record<string,unknown>??{}),systemTemplateLayoutHash:templateLayoutHash}:(request.metadata as Record<string, unknown>) || null,
            },
            client
          );

          const command = await this.repository.insertOutboundCommand(
            {
              workspaceId: context.workspaceId,
              channelInstanceId: context.channelInstanceId,
              threadId,
              messageId: message.id,
              recipientE164: request.recipientPhoneE164,
              body: request.body,
              mediaUrl: request.mediaUrl,
              templateName: request.template?.name,
              templateLanguage: request.template?.language,
              templateComponents: request.template?.components,
              interactivePayload: request.interactive ? (request.interactive as unknown as Record<string, unknown>) : undefined,
              idempotencyKey: request.idempotencyKey,
              payloadFingerprint: computedFingerprint,
            },
            client
          );

          if (!command) {
            // Concurrency race lost: another transaction committed same (workspace_id, idempotency_key).
            // Throwing IdempotencyRaceLostError ensures full ROLLBACK of this transaction,
            // purging the uncommitted message and avoiding any orphan message in the database.
            throw new IdempotencyRaceLostError(
              context.workspaceId,
              request.idempotencyKey
            );
          }

          // 3.4 Synchronous Audit Event within same transaction
          await this.repository.recordAudit(
            {
              workspaceId: context.workspaceId,
              actorId: context.actorId,
              actorType: "user",
              action: "outbound.enqueued",
              resourceType: "outbound_command",
              resourceId: command.id,
              metadata: {
                channelInstanceId: context.channelInstanceId,
                messageId: message.id,
                threadId,
                contactId,
                contentType: request.contentType,
                payloadFingerprint: computedFingerprint,
                idempotencyKey: request.idempotencyKey,
              },
              ipAddress: context.ipAddress,
              userAgent: context.userAgent,
            },
            client
          );

          const output: ProduceOutboundOutput = {
            messageId: message.id,
            commandId: command.id,
            threadId,
            contactId,
            idempotencyKey: request.idempotencyKey,
            status: command.status as any,
            deliveryStatus: message.deliveryStatus as any,
            isIdempotentReplay: false,
            createdAt: command.createdAt.toISOString(),
          };
          await this.onCreated?.(client, output);
          return output;
        },
        this.pool
      );
    } catch (err: any) {
      if (err instanceof IdempotencyRaceLostError) {
        // Safe post-rollback replay lookup in a clean transaction
        const winner = await withTenantTransaction(
          context.workspaceId,
          async (client) => {
            return this.repository.findReplayProjection(
              {
                workspaceId: context.workspaceId,
                idempotencyKey: request.idempotencyKey,
              },
              client
            );
          },
          this.pool
        );

        if (!winner || !winner.payloadFingerprint) {
          throw new LegacyIdempotencyRecordError(
            context.workspaceId,
            request.idempotencyKey
          );
        }

        if (isFingerprintMatch(computedFingerprint, winner.payloadFingerprint)) {
          return {
            messageId: winner.messageId,
            commandId: winner.commandId,
            threadId: winner.threadId,
            contactId: winner.contactId,
            idempotencyKey: request.idempotencyKey,
            status: winner.commandStatus as any,
            deliveryStatus: winner.deliveryStatus as any,
            isIdempotentReplay: true,
            createdAt: winner.createdAt.toISOString(),
          };
        } else {
          throw new IdempotencyConflictError(
            context.workspaceId,
            request.idempotencyKey,
            "Payload does not match winning concurrent transaction"
          );
        }
      }
      throw err;
    }
  }
}
