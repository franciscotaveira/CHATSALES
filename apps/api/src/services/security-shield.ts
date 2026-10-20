import type { Redis } from "ioredis";
import { logger } from "@sos-sales/observability";

export interface SecurityShieldOptions {
  readonly redisClient?: Redis | null;
  readonly globalLimitPerMinute?: number;
  readonly loginIpLimitPerMinute?: number;
  readonly loginEmailFailureLimit?: number;
  readonly loginEmailLockoutSeconds?: number;
  readonly jailDurationSeconds?: number;
}

export interface SecurityCheckResult {
  readonly allowed: boolean;
  readonly statusCode?: number;
  readonly reason?: string;
  readonly retryAfterSeconds?: number;
  readonly limit?: number;
  readonly remaining?: number;
}

export interface ScannerCheckResult {
  readonly isMalicious: boolean;
  readonly reason?: string;
}

/**
 * Known Automated Vulnerability Scanners and Attack Tools User-Agents
 */
const MALICIOUS_USER_AGENTS = [
  "sqlmap",
  "nikto",
  "masscan",
  "dirbuster",
  "nmap",
  "acunetix",
  "havij",
  "wprecon",
  "zgrab",
  "gobuster",
  "wpscan",
  "censys",
  "shodan",
  "nessus",
  "arachni",
];

/**
 * Malicious URL Path Signatures & Exploitation Probes
 */
const MALICIOUS_PATH_PATTERNS: RegExp[] = [
  // Path traversal
  /\.\.(\/|\\|%2f|%5c)/i,
  // WordPress / PHP CMS probe targets
  /(wp-admin|wp-login|xmlrpc\.php|wp-content|wp-includes)/i,
  // Sensitive configuration and secret exposures
  /(\.env|\.git|\.aws|\.docker|web\.config|server-status|dump\.sql|backup\.sql)/i,
  // Database administration probes
  /(phpmyadmin|pma|adminer|myadmin)/i,
  // Arbitrary execution & webshells
  /(eval\(|base64_decode|cgi-bin|\.php($|\?))/i,
];

/**
 * SecurityShield
 *
 * Sovereign enterprise security layer protecting SOS Vendas:
 * - Anti-Scanner / WAF Probes: Detects automated attack tooling and jailbreaks.
 * - IP Jail / Blacklist: Automatically jails malicious IPs with configurable TTL.
 * - Anti-Brute-Force & Credential Stuffing: Protects login per IP and per target email.
 * - Global Rate Limiting: Enforces per-IP sliding window request limits.
 * - Dual Engine: Redis-backed distributed state with automatic memory-bounded fallback.
 */
export class SecurityShield {
  private readonly redis: Redis | null;
  private readonly globalLimitPerMinute: number;
  private readonly loginIpLimitPerMinute: number;
  private readonly loginEmailFailureLimit: number;
  private readonly loginEmailLockoutSeconds: number;
  private readonly jailDurationSeconds: number;

  // In-memory fallbacks (bounded)
  private readonly memoryJail = new Map<string, { expiresAt: number; reason: string }>();
  private readonly memoryLoginHits = new Map<string, number[]>();
  private readonly memoryLoginFailures = new Map<string, { count: number; lockedUntil: number }>();
  private readonly memoryGlobalHits = new Map<string, number[]>();

  constructor(options: SecurityShieldOptions = {}) {
    this.redis = options.redisClient ?? null;
    this.globalLimitPerMinute = options.globalLimitPerMinute ?? 120;
    this.loginIpLimitPerMinute = options.loginIpLimitPerMinute ?? 10;
    this.loginEmailFailureLimit = options.loginEmailFailureLimit ?? 5;
    this.loginEmailLockoutSeconds = options.loginEmailLockoutSeconds ?? 300;
    this.jailDurationSeconds = options.jailDurationSeconds ?? 900;
  }

  /**
   * Evaluates if a request URL or User-Agent matches malicious scanner or probe patterns.
   */
  isScannerProbe(url: string, userAgent?: string): ScannerCheckResult {
    if (userAgent) {
      const lowerAgent = userAgent.toLowerCase();
      for (const badAgent of MALICIOUS_USER_AGENTS) {
        if (lowerAgent.includes(badAgent)) {
          return {
            isMalicious: true,
            reason: `Malicious Scanner User-Agent detected: ${badAgent}`,
          };
        }
      }
    }

    const decodedUrl = decodeURIComponent(url);
    for (const pattern of MALICIOUS_PATH_PATTERNS) {
      if (pattern.test(decodedUrl) || pattern.test(url)) {
        return {
          isMalicious: true,
          reason: `Malicious URL probe pattern detected: ${pattern}`,
        };
      }
    }

    return { isMalicious: false };
  }

  /**
   * Checks if an IP is currently jailed.
   */
  async checkIpJail(ip: string): Promise<{ jailed: boolean; reason?: string; retryAfterSeconds?: number }> {
    const now = Date.now();

    // 1. Check in-memory jail first
    const memRecord = this.memoryJail.get(ip);
    if (memRecord) {
      if (memRecord.expiresAt > now) {
        const retryAfter = Math.ceil((memRecord.expiresAt - now) / 1000);
        return { jailed: true, reason: memRecord.reason, retryAfterSeconds: retryAfter };
      }
      this.memoryJail.delete(ip);
    }

    // 2. Check Redis jail
    if (this.redis) {
      try {
        const key = `sos:shield:jail:${ip}`;
        const data = await this.redis.get(key);
        if (data) {
          const ttl = await this.redis.ttl(key);
          const parsed = JSON.parse(data);
          return {
            jailed: true,
            reason: parsed.reason || "Suspicious malicious activity",
            retryAfterSeconds: Math.max(1, ttl),
          };
        }
      } catch (err) {
        logger.warn({ ip, err }, "SecurityShield: Redis jail check failed, using fallback");
      }
    }

    return { jailed: false };
  }

  /**
   * Jails a malicious IP for the configured duration.
   */
  async jailIp(ip: string, reason: string, durationSeconds?: number): Promise<void> {
    const duration = durationSeconds ?? this.jailDurationSeconds;
    const now = Date.now();
    const expiresAt = now + duration * 1000;

    // Memory jail
    if (this.memoryJail.size >= 5000) {
      this.evictExpiredMemory(this.memoryJail);
    }
    this.memoryJail.set(ip, { expiresAt, reason });

    // Redis jail
    if (this.redis) {
      try {
        const key = `sos:shield:jail:${ip}`;
        await this.redis.set(
          key,
          JSON.stringify({ reason, bannedAt: now, expiresAt }),
          "EX",
          duration
        );
      } catch (err) {
        logger.warn({ ip, err }, "SecurityShield: Redis jailIp failed");
      }
    }

    logger.error(
      { ip, reason, durationSeconds: duration },
      "🛡️ SecurityShield: IP has been jailed for suspicious activity"
    );
  }

  /**
   * Pre-flight login check: Verifies if IP is allowed to attempt login and if target email is locked.
   */
  async checkLoginRateLimit(ip: string, email: string): Promise<SecurityCheckResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // 1. Check IP login frequency limit (max X per minute)
    const ipLimitRes = await this.checkSlidingLimit(
      `sos:shield:login:ip:${ip}`,
      this.memoryLoginHits,
      ip,
      this.loginIpLimitPerMinute,
      60_000
    );

    if (!ipLimitRes.allowed) {
      return {
        allowed: false,
        statusCode: 429,
        reason: "Muitas tentativas de login a partir deste IP. Aguarde 1 minuto.",
        retryAfterSeconds: Math.max(1, Math.ceil(ipLimitRes.resetMs / 1000)),
      };
    }

    // 2. Check target email brute-force lockout
    if (this.redis) {
      try {
        const key = `sos:shield:login:fail:email:${normalizedEmail}`;
        const failsStr = await this.redis.get(key);
        const fails = failsStr ? parseInt(failsStr, 10) : 0;
        if (fails >= this.loginEmailFailureLimit) {
          const ttl = await this.redis.ttl(key);
          return {
            allowed: false,
            statusCode: 429,
            reason: `Conta temporariamente protegida devido a múltiplas tentativas incorretas. Aguarde alguns minutos.`,
            retryAfterSeconds: Math.max(1, ttl),
          };
        }
      } catch (err) {
        logger.warn({ err }, "SecurityShield: Redis email lockout check failed");
      }
    } else {
      const memFail = this.memoryLoginFailures.get(normalizedEmail);
      if (memFail && memFail.count >= this.loginEmailFailureLimit && memFail.lockedUntil > now) {
        const retryAfter = Math.ceil((memFail.lockedUntil - now) / 1000);
        return {
          allowed: false,
          statusCode: 429,
          reason: `Conta temporariamente protegida devido a múltiplas tentativas incorretas. Aguarde alguns minutos.`,
          retryAfterSeconds: Math.max(1, retryAfter),
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Records a failed login attempt for both the client IP and target email.
   */
  async recordLoginFailure(ip: string, email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const now = Date.now();

    // 1. Record IP hit
    await this.recordSlidingHit(`sos:shield:login:ip:${ip}`, this.memoryLoginHits, ip, 60);

    // 2. Record Email failure counter
    if (this.redis) {
      try {
        const key = `sos:shield:login:fail:email:${normalizedEmail}`;
        const newCount = await this.redis.incr(key);
        if (newCount === 1) {
          await this.redis.expire(key, this.loginEmailLockoutSeconds);
        } else if (newCount >= this.loginEmailFailureLimit) {
          // Refresh lockout duration once threshold reached
          await this.redis.expire(key, this.loginEmailLockoutSeconds);
        }
      } catch (err) {
        logger.warn({ err }, "SecurityShield: Redis recordLoginFailure failed");
      }
    } else {
      const current = this.memoryLoginFailures.get(normalizedEmail);
      const count = (current ? current.count : 0) + 1;
      this.memoryLoginFailures.set(normalizedEmail, {
        count,
        lockedUntil: count >= this.loginEmailFailureLimit ? now + this.loginEmailLockoutSeconds * 1000 : 0,
      });
    }

    logger.warn({ ip, email: normalizedEmail }, "🛡️ SecurityShield: Login failure recorded");
  }

  /**
   * Resets email failure counter upon successful login.
   */
  async resetLoginSuccess(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (this.redis) {
      try {
        await this.redis.del(`sos:shield:login:fail:email:${normalizedEmail}`);
      } catch (err) {
        logger.warn({ err }, "SecurityShield: Redis resetLoginSuccess failed");
      }
    }
    this.memoryLoginFailures.delete(normalizedEmail);
  }

  /**
   * Checks global API request rate limit per IP.
   */
  async checkGlobalRateLimit(ip: string): Promise<SecurityCheckResult> {
    const res = await this.checkSlidingLimit(
      `sos:shield:global:ip:${ip}`,
      this.memoryGlobalHits,
      ip,
      this.globalLimitPerMinute,
      60_000
    );

    if (!res.allowed) {
      return {
        allowed: false,
        statusCode: 429,
        reason: "Limite global de requisições excedido. Aguarde antes de tentar novamente.",
        retryAfterSeconds: Math.max(1, Math.ceil(res.resetMs / 1000)),
        limit: this.globalLimitPerMinute,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      limit: this.globalLimitPerMinute,
      remaining: res.remaining,
      retryAfterSeconds: 0,
    };
  }

  // --- Helper methods for Sliding Window & Memory Eviction ---

  private async checkSlidingLimit(
    redisKey: string,
    memoryMap: Map<string, number[]>,
    id: string,
    limit: number,
    windowMs: number
  ): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
    const now = Date.now();

    if (this.redis) {
      try {
        const clearBefore = now - windowMs;
        const multi = this.redis.multi();
        multi.zremrangebyscore(redisKey, "-inf", clearBefore);
        multi.zcard(redisKey);
        const results = await multi.exec();
        const count = (results?.[1]?.[1] as number) ?? 0;

        if (count >= limit) {
          const oldest = await this.redis.zrange(redisKey, 0, 0, "WITHSCORES");
          const oldestScore = oldest.length > 1 ? parseInt(oldest[1]!, 10) : now;
          const resetMs = Math.max(0, oldestScore + windowMs - now);
          return { allowed: false, remaining: 0, resetMs };
        }

        // Add current hit
        const addMulti = this.redis.multi();
        addMulti.zadd(redisKey, now, `${now}:${Math.random()}`);
        addMulti.pexpire(redisKey, windowMs);
        await addMulti.exec();

        return { allowed: true, remaining: Math.max(0, limit - count - 1), resetMs: 0 };
      } catch (err) {
        logger.warn({ redisKey, err }, "SecurityShield: Sliding window check Redis error, fallback to memory");
      }
    }

    // Memory fallback
    let list = memoryMap.get(id);
    if (!list) {
      if (memoryMap.size >= 10_000) {
        this.evictOldestKeys(memoryMap);
      }
      list = [];
      memoryMap.set(id, list);
    }

    const valid = list.filter((t) => now - t < windowMs);
    if (valid.length >= limit) {
      memoryMap.set(id, valid);
      const oldest = valid[0] ?? now;
      return { allowed: false, remaining: 0, resetMs: Math.max(0, oldest + windowMs - now) };
    }

    valid.push(now);
    memoryMap.set(id, valid);
    return { allowed: true, remaining: Math.max(0, limit - valid.length), resetMs: 0 };
  }

  private async recordSlidingHit(
    redisKey: string,
    memoryMap: Map<string, number[]>,
    id: string,
    ttlSeconds: number
  ): Promise<void> {
    const now = Date.now();
    if (this.redis) {
      try {
        const multi = this.redis.multi();
        multi.zadd(redisKey, now, `${now}:${Math.random()}`);
        multi.expire(redisKey, ttlSeconds);
        await multi.exec();
      } catch (err) {
        logger.warn({ redisKey, err }, "SecurityShield: recordSlidingHit Redis error");
      }
    }

    let list = memoryMap.get(id);
    if (!list) {
      list = [];
      memoryMap.set(id, list);
    }
    list.push(now);
  }

  private evictExpiredMemory(map: Map<string, { expiresAt: number; reason: string }>): void {
    const now = Date.now();
    for (const [k, v] of map.entries()) {
      if (v.expiresAt <= now) {
        map.delete(k);
      }
    }
  }

  private evictOldestKeys(map: Map<string, number[]>): void {
    const keysToDelete: string[] = [];
    let i = 0;
    for (const k of map.keys()) {
      if (i++ > 2000) break;
      keysToDelete.push(k);
    }
    for (const k of keysToDelete) {
      map.delete(k);
    }
  }
}
