import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import type { Pool } from "pg";
import { logger } from "@sos-sales/observability";
import {
  ChannelAdapterRegistry,
  ChannelDispatchService,
  MetaWabaAdapter,
  WahaAdapter,
  EvolutionAdapter,
} from "@sos-sales/application";
import {
  ChannelInstanceRepository,
  DatabaseSigningSecretResolver,
  getWorkerDatabasePool,
  closeAllDatabasePools,
  parseKeyringFromEnv,
  type Keyring,
} from "@sos-sales/database";
import { InboxProcessor } from "./processors/inbox-processor";
import { OutboxDispatcher } from "./processors/outbox-dispatcher";
import { OperationalWebhookDispatcher } from "./processors/operational-webhook-dispatcher";
export * from "./processors/operational-webhook-dispatcher";
import { CapiDispatcher } from "./processors/capi-dispatcher";

export * from "./processors/inbox-processor";
export * from "./processors/outbox-dispatcher";
export * from "./processors/capi-dispatcher";
export * from "./processors/ai-receptionist.processor";

export interface WorkerRuntimeOptions {
  workerId?: string;
  masterKeyHex?: string;
  keyring?: Keyring;
  workerPool?: Pool;
  pollIntervalMs?: number;
  batchSize?: number;
  healthFilePath?: string;
  dispatchService?: ChannelDispatchService;
  channelInstanceRepo?: ChannelInstanceRepository;
  registry?: ChannelAdapterRegistry;
}

export interface WorkerHealthStatus {
  alive: boolean;
  healthy: boolean;
  workerId: string;
  uptimeSeconds: number;
  firstCycleCompleted: boolean;
  metrics: {
    attempted: number;
    completed: number;
    failed: number;
    reconciling: number;
    reconciled: number;
  };
  inbox: {
    lastPolledAt: string | null;
    consecutiveFailures: number;
    healthy: boolean;
  };
  outbox: {
    lastPolledAt: string | null;
    consecutiveFailures: number;
    healthy: boolean;
  };
}

export class WorkerRuntime {
  private readonly workerId: string;
  private readonly masterKeyHex?: string;
  private readonly keyring?: Keyring;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly healthFilePath: string;

  private pool: Pool | null = null;
  private isOwnPool = false;
  private isRunning = false;
  private startedAt: number | null = null;

  private abortController: AbortController | null = null;
  private loopPromise: Promise<void> | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private inboxProcessor: InboxProcessor | null = null;
  private outboxDispatcher: OutboxDispatcher | null = null;
  private operationalWebhookDispatcher: OperationalWebhookDispatcher | null = null;
  private capiDispatcher: CapiDispatcher | null = null;
  private registry: ChannelAdapterRegistry | null = null;
  private secretResolver: DatabaseSigningSecretResolver | null = null;
  private channelInstanceRepo: ChannelInstanceRepository | null = null;
  private dispatchService: ChannelDispatchService | null = null;

  private inboxLastPolledAt: Date | null = null;
  private inboxConsecutiveFailures = 0;
  private inboxFirstCycleSuccessful = false;

  private outboxLastPolledAt: Date | null = null;
  private outboxConsecutiveFailures = 0;
  private outboxFirstCycleSuccessful = false;

  public readonly metrics = {
    attempted: 0,
    completed: 0,
    failed: 0,
    reconciling: 0,
    reconciled: 0,
  };

  constructor(options: WorkerRuntimeOptions = {}) {
    this.workerId =
      options.workerId ||
      process.env.WORKER_ID ||
      `worker-${os.hostname()}-${process.pid}`;

    if (options.keyring && Object.keys(options.keyring).length > 0) {
      this.keyring = options.keyring;
    } else {
      const parsedEnv = parseKeyringFromEnv();
      if (parsedEnv) {
        this.keyring = parsedEnv.keyring;
      } else {
        const key =
          options.masterKeyHex ||
          process.env.MCT_CREDENTIALS_MASTER_KEY ||
          process.env.APP_MASTER_KEY ||
          process.env.MASTER_ENCRYPTION_KEY;

        if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
          throw new Error(
            "FATAL_CONFIG_ERROR: Master encryption key must be provided as a 64-character hex string or versioned keyring for WorkerRuntime"
          );
        }
        this.masterKeyHex = key;
      }
    }

    if (options.workerPool) {
      this.pool = options.workerPool;
      this.isOwnPool = false;
    }

    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 10;
    this.healthFilePath = options.healthFilePath ?? "/tmp/worker-healthy";

    if (options.registry) {
      this.registry = options.registry;
    }
    if (options.channelInstanceRepo) {
      this.channelInstanceRepo = options.channelInstanceRepo;
    }
    if (options.dispatchService) {
      this.dispatchService = options.dispatchService;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("WorkerRuntime is already running");
    }

    if (!this.pool) {
      if (!process.env.WORKER_DATABASE_URL) {
        throw new Error(
          "FATAL_CONFIG_ERROR: WORKER_DATABASE_URL environment variable is required for WorkerRuntime"
        );
      }
      this.pool = getWorkerDatabasePool();
      this.isOwnPool = true;
    }

    this.inboxProcessor = new InboxProcessor({
      masterKeyHex: this.masterKeyHex,
      keyring: this.keyring,
    });
    this.outboxDispatcher = new OutboxDispatcher({
      masterKeyHex: this.masterKeyHex,
    });
    this.capiDispatcher = new CapiDispatcher();
    this.operationalWebhookDispatcher = process.env.OUTBOUND_WEBHOOK_DISPATCH_ENABLED === "true" ? new OperationalWebhookDispatcher() : null;

    if (!this.registry) {
      this.registry = new ChannelAdapterRegistry();
      this.registry.register(
        new MetaWabaAdapter({
          baseUrl: process.env.META_WABA_BASE_URL || undefined,
        })
      );

      // P0: Startup WAHA validation
      // WorkerRuntime must NOT instantiate WahaAdapter with a forbidden default (e.g. localhost:3000).
      // WAHA_BASE_URL is strictly required when WAHA is enabled.
      const wahaEnabled = process.env.WAHA_ENABLED === "true" || !!process.env.WAHA_BASE_URL;
      if (wahaEnabled) {
        const wahaUrl = process.env.WAHA_BASE_URL;
        if (!wahaUrl) {
          throw new Error(
            "FATAL_CONFIG_ERROR: WAHA_BASE_URL is mandatory when WAHA is enabled in WorkerRuntime."
          );
        }
        this.registry.register(new WahaAdapter({ baseUrl: wahaUrl }));
      }

      // Native Evolution API v2 Adapter registration (MCT OS Sovereignty standard)
      const evolutionBaseUrl =
        process.env.EVOLUTION_BASE_URL ||
        (process.env.NODE_ENV === "test" || process.env.ALLOW_LOCAL_TEST_SERVICES === "true"
          ? "http://evolution:8080"
          : undefined);
      this.registry.register(
        new EvolutionAdapter({
          baseUrl: evolutionBaseUrl,
          defaultApiKey: process.env.EVOLUTION_API_KEY,
        })
      );
    }

    this.secretResolver = new DatabaseSigningSecretResolver({
      pool: this.pool,
      masterKeyHex: this.masterKeyHex,
      keyring: this.keyring,
    });

    if (!this.channelInstanceRepo) {
      this.channelInstanceRepo = new ChannelInstanceRepository(this.pool);
    }

    if (!this.dispatchService) {
      this.dispatchService = new ChannelDispatchService({
        channelInstanceRepo: this.channelInstanceRepo,
        adapterRegistry: this.registry,
        secretResolver: this.secretResolver,
      });
    }

    this.isRunning = true;
    this.startedAt = Date.now();
    this.abortController = new AbortController();

    logger.info(
      {
        workerId: this.workerId,
        pollIntervalMs: this.pollIntervalMs,
        batchSize: this.batchSize,
      },
      "🚀 Starting SOS Sales V3 Worker Runtime engine"
    );

    // Start governed background loop
    this.loopPromise = this.runLoop(this.abortController.signal);

    // Heartbeat touch governed by health
    this.heartbeatInterval = setInterval(() => {
      this.syncHeartbeat();
    }, 2000);
    this.syncHeartbeat();
  }

  private syncHeartbeat(): void {
    const health = this.getHealth();
    try {
      if (health.healthy) {
        fs.writeFileSync(
          this.healthFilePath,
          JSON.stringify({
            status: "healthy",
            workerId: this.workerId,
            timestamp: new Date().toISOString(),
            uptimeSeconds: health.uptimeSeconds,
          }),
          "utf8"
        );
      } else {
        if (fs.existsSync(this.healthFilePath)) {
          fs.unlinkSync(this.healthFilePath);
        }
      }
    } catch {
      // ignore file write/delete errors during shutdown or permission issues
    }
  }

  private async runLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted && this.isRunning) {
      try {
        await this.runSingleTick(signal);
      } catch (err) {
        logger.error({ err, workerId: this.workerId }, "Unexpected error in worker loop tick");
      }

      if (signal.aborted || !this.isRunning) break;

      // Sleep governed by AbortSignal
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, this.pollIntervalMs);
        const onAbort = () => {
          clearTimeout(timeout);
          resolve();
        };
        signal.addEventListener("abort", onAbort, { once: true });
      });
    }
  }

  async runSingleTick(signal?: AbortSignal): Promise<{
    inboxProcessed: number;
    outboxDispatched: number;
    outboxReconciled: number;
    capiDispatched?: number;
  }> {
    if (!this.pool || !this.inboxProcessor || !this.outboxDispatcher || !this.registry || !this.secretResolver) {
      throw new Error("WorkerRuntime is not initialized");
    }

    let inboxProcessed = 0;
    let outboxDispatched = 0;
    let outboxReconciled = 0;

    // 1. Inbox Processing
    try {
      const inboxBatch = await this.inboxProcessor.claimBatch(
        this.pool,
        this.workerId,
        this.batchSize
      );

      for (const item of inboxBatch) {
        if (signal?.aborted) break;
        try {
          await this.inboxProcessor.processItem(this.pool, item, this.workerId, signal);
          inboxProcessed++;
        } catch (itemErr: unknown) {
          const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
          if (msg.includes("FENCING")) {
            logger.warn({ inboxId: item.id, workerId: this.workerId, msg }, "Fencing abort or violation during inbox processing");
          } else {
            logger.error({ inboxId: item.id, workerId: this.workerId, itemErr }, "Error processing inbox item");
          }
        }
      }

      this.inboxLastPolledAt = new Date();
      this.inboxConsecutiveFailures = 0;
      this.inboxFirstCycleSuccessful = true;
    } catch (err) {
      this.inboxConsecutiveFailures++;
      logger.error(
        { err, failures: this.inboxConsecutiveFailures, workerId: this.workerId },
        "Error claiming/processing inbox batch"
      );
    }

    // 2. Outbox Dispatching
    try {
      await this.outboxDispatcher.reclaimExpiredLeases(this.pool, this.batchSize);

      const outboxBatch = await this.outboxDispatcher.claimBatch(
        this.pool,
        this.workerId,
        this.batchSize
      );

      for (const item of outboxBatch) {
        if (signal?.aborted) break;
        this.metrics.attempted++;
        try {
          const result = await this.outboxDispatcher.dispatchItem(
            this.pool,
            item,
            this.workerId,
            this.dispatchService ?? this.registry,
            this.secretResolver,
            signal
          );
          outboxDispatched++;

          if (result.status === "sent") {
            this.metrics.completed++;
          } else if (result.status === "reconciliation_required") {
            this.metrics.reconciling++;
          } else {
            this.metrics.failed++;
          }
        } catch (itemErr: unknown) {
          const msg = itemErr instanceof Error ? itemErr.message : String(itemErr);
          if (msg.includes("FENCING")) {
            logger.warn({ commandId: item.id, workerId: this.workerId, msg }, "Fencing abort or violation during outbox dispatch");
          } else {
            this.metrics.failed++;
            logger.error({ commandId: item.id, workerId: this.workerId, itemErr }, "Error dispatching outbox item");
          }
        }
      }

      this.outboxLastPolledAt = new Date();
      this.outboxConsecutiveFailures = 0;
      this.outboxFirstCycleSuccessful = true;
    } catch (err) {
      this.outboxConsecutiveFailures++;
      logger.error(
        { err, failures: this.outboxConsecutiveFailures, workerId: this.workerId },
        "Error claiming/dispatching outbox batch"
      );
    }

    // 3. Outbox Reconciliation
    try {
      outboxReconciled = await this.outboxDispatcher.reconcileBatch(
        this.pool,
        this.workerId,
        this.batchSize,
        60,
        signal
      );
      this.metrics.reconciled += outboxReconciled;
    } catch (err) {
      logger.error(
        { err, workerId: this.workerId },
        "Error reconciling ambiguous outbox batch"
      );
    }

    // 4. Meta CAPI Conversion Dispatching
    let capiDispatched = 0;
    if (this.capiDispatcher && this.pool) {
      try {
        const capiBatch = await this.capiDispatcher.claimBatch(this.pool, this.batchSize);
        for (const item of capiBatch) {
          if (signal?.aborted) break;
          await this.capiDispatcher.dispatchItem(this.pool, item, signal);
          capiDispatched++;
        }
      } catch (err) {
        logger.error(
          { err, workerId: this.workerId },
          "Error claiming/dispatching Meta CAPI conversion batch"
        );
      }
    }

    if(this.operationalWebhookDispatcher && this.pool && !signal?.aborted){
      try {
        const jobs=await this.operationalWebhookDispatcher.claimBatch(this.pool,this.workerId,this.batchSize);
        for(const job of jobs){if(signal?.aborted) break;await this.operationalWebhookDispatcher.dispatchItem(this.pool,job);}
      } catch {logger.error({workerId:this.workerId},"Operational webhook processing failed; jobs remain available for review");}
    }
    return { inboxProcessed, outboxDispatched, outboxReconciled, capiDispatched };
  }

  getHealth(): WorkerHealthStatus {
    const alive = this.isRunning;
    const uptimeSeconds = this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;

    const firstCycleCompleted = this.inboxFirstCycleSuccessful && this.outboxFirstCycleSuccessful;
    const inboxHealthy = this.inboxConsecutiveFailures < 5;
    const outboxHealthy = this.outboxConsecutiveFailures < 5;
    // P1: Health is ONLY healthy after at least one successful cycle has completed!
    const healthy = alive && firstCycleCompleted && inboxHealthy && outboxHealthy;

    return {
      alive,
      healthy,
      workerId: this.workerId,
      uptimeSeconds,
      firstCycleCompleted,
      metrics: { ...this.metrics },
      inbox: {
        lastPolledAt: this.inboxLastPolledAt ? this.inboxLastPolledAt.toISOString() : null,
        consecutiveFailures: this.inboxConsecutiveFailures,
        healthy: inboxHealthy,
      },
      outbox: {
        lastPolledAt: this.outboxLastPolledAt ? this.outboxLastPolledAt.toISOString() : null,
        consecutiveFailures: this.outboxConsecutiveFailures,
        healthy: outboxHealthy,
      },
    };
  }

  async stop(deadlineMs = 10000): Promise<void> {
    if (!this.isRunning) return;

    logger.info({ workerId: this.workerId }, "Stopping WorkerRuntime...");
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    try {
      if (fs.existsSync(this.healthFilePath)) {
        fs.unlinkSync(this.healthFilePath);
      }
    } catch {
      // ignore
    }

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.loopPromise) {
      // P1: Enforce shutdown deadline
      const deadlinePromise = new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Worker shutdown deadline of ${deadlineMs}ms exceeded`)),
          deadlineMs
        )
      );

      try {
        await Promise.race([this.loopPromise, deadlinePromise]);
      } catch (err) {
        logger.warn(
          { err, workerId: this.workerId },
          "WorkerRuntime loop shutdown timed out, proceeding with force teardown"
        );
      }
      this.loopPromise = null;
    }

    if (this.isOwnPool && this.pool) {
      await closeAllDatabasePools();
      this.pool = null;
    }

    logger.info({ workerId: this.workerId }, "WorkerRuntime stopped cleanly.");
  }
}

// Standalone entrypoint execution check
const scriptPath = process.argv[1];
const isMainModule =
  typeof scriptPath === "string" &&
  (scriptPath.endsWith("worker/src/index.ts") ||
    scriptPath.endsWith("worker/dist/index.js") ||
    scriptPath.endsWith("worker/index.ts") ||
    scriptPath.endsWith("worker/index.js"));

if (isMainModule) {
  const runtime = new WorkerRuntime();
  runtime.start().catch((err) => {
    logger.error({ err }, "FATAL: Failed to start WorkerRuntime standalone");
    process.exit(1);
  });

  const handleTermination = async (signal: string) => {
    logger.info({ signal }, "Worker runtime shutdown signal received");
    await runtime.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => handleTermination("SIGTERM"));
  process.on("SIGINT", () => handleTermination("SIGINT"));
}
