"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrismaRateLimitStore = void 0;
const db_1 = __importDefault(require("../config/db"));
/** DB-backed rate limit store — one instance per rate limiter (unique prefix). */
class PrismaRateLimitStore {
    constructor(prefix) {
        this.windowMs = 60000;
        this.prefix = prefix;
    }
    init(options) {
        this.windowMs = options.windowMs;
    }
    async increment(key) {
        const fullKey = `${this.prefix}${key}`;
        const now = new Date();
        const existing = await db_1.default.rateLimitEntry.findUnique({ where: { key: fullKey } });
        if (!existing || existing.resetAt <= now) {
            const resetAt = new Date(now.getTime() + this.windowMs);
            const row = await db_1.default.rateLimitEntry.upsert({
                where: { key: fullKey },
                create: { key: fullKey, hits: 1, resetAt },
                update: { hits: 1, resetAt },
            });
            return { totalHits: row.hits, resetTime: row.resetAt };
        }
        const row = await db_1.default.rateLimitEntry.update({
            where: { key: fullKey },
            data: { hits: { increment: 1 } },
        });
        return { totalHits: row.hits, resetTime: row.resetAt };
    }
    async decrement(key) {
        const fullKey = `${this.prefix}${key}`;
        const row = await db_1.default.rateLimitEntry.findUnique({ where: { key: fullKey } });
        if (row && row.hits > 0) {
            await db_1.default.rateLimitEntry.update({
                where: { key: fullKey },
                data: { hits: { decrement: 1 } },
            });
        }
    }
    async resetKey(key) {
        await db_1.default.rateLimitEntry.deleteMany({ where: { key: `${this.prefix}${key}` } });
    }
}
exports.PrismaRateLimitStore = PrismaRateLimitStore;
