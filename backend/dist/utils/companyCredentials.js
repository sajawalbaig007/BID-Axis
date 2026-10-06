"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMPANY_KEYS = void 0;
exports.normalizeCompanyKey = normalizeCompanyKey;
exports.publicCredential = publicCredential;
exports.seedDefaultCompanyCredentials = seedDefaultCompanyCredentials;
const db_1 = __importDefault(require("../config/db"));
const hash_1 = require("./hash");
exports.COMPANY_KEYS = ["BEM", "GPS"];
const DEFAULTS = {
    BEM: { username: "BEM", password: "123456" },
    GPS: { username: "GPS", password: "123456" },
};
function normalizeCompanyKey(raw) {
    const v = String(raw ?? "").trim().toUpperCase();
    if (v === "BEM" || v === "GPS")
        return v;
    return null;
}
function publicCredential(row) {
    return {
        company: row.company,
        username: row.username,
        updatedAt: row.updatedAt,
        createdAt: row.createdAt,
    };
}
/** First deploy only: if the collection is empty, create BEM + GPS defaults. */
async function seedDefaultCompanyCredentials() {
    const count = await db_1.default.companyCredential.count();
    if (count > 0)
        return;
    await Promise.all(exports.COMPANY_KEYS.map(async (company) => {
        const def = DEFAULTS[company];
        await db_1.default.companyCredential.create({
            data: {
                company,
                username: def.username,
                password: await (0, hash_1.hashPassword)(def.password),
            },
        });
    }));
}
