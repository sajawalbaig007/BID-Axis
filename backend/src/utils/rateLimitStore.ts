import type { Store, Options, IncrementResponse } from "express-rate-limit";
import prisma from "../config/db";

/** DB-backed rate limit store — one instance per rate limiter (unique prefix). */
export class PrismaRateLimitStore implements Store {
  prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const fullKey = `${this.prefix}${key}`;
    const now = new Date();

    const existing = await prisma.rateLimitEntry.findUnique({ where: { key: fullKey } });

    if (!existing || existing.resetAt <= now) {
      const resetAt = new Date(now.getTime() + this.windowMs);
      const row = await prisma.rateLimitEntry.upsert({
        where:  { key: fullKey },
        create: { key: fullKey, hits: 1, resetAt },
        update: { hits: 1, resetAt },
      });
      return { totalHits: row.hits, resetTime: row.resetAt };
    }

    const row = await prisma.rateLimitEntry.update({
      where: { key: fullKey },
      data:  { hits: { increment: 1 } },
    });
    return { totalHits: row.hits, resetTime: row.resetAt };
  }

  async decrement(key: string): Promise<void> {
    const fullKey = `${this.prefix}${key}`;
    const row = await prisma.rateLimitEntry.findUnique({ where: { key: fullKey } });
    if (row && row.hits > 0) {
      await prisma.rateLimitEntry.update({
        where: { key: fullKey },
        data:  { hits: { decrement: 1 } },
      });
    }
  }

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimitEntry.deleteMany({ where: { key: `${this.prefix}${key}` } });
  }
}
