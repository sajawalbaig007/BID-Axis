"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiLimiter = exports.loginLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const rateLimitStore_1 = require("../utils/rateLimitStore");
const isProd = process.env.NODE_ENV === "production";
const usePrismaRateStore = process.env.RATE_LIMIT_STORE === "prisma";
const loginStore = isProd && usePrismaRateStore ? new rateLimitStore_1.PrismaRateLimitStore("rl:login:") : undefined;
const apiStore = isProd && usePrismaRateStore ? new rateLimitStore_1.PrismaRateLimitStore("rl:api:") : undefined;
exports.loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    ...(loginStore ? { store: loginStore } : {}),
    message: {
        success: false,
        message: "Too many login attempts. Please try again in 15 minutes.",
    },
});
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    ...(apiStore ? { store: apiStore } : {}),
    message: {
        success: false,
        message: "Too many requests. Please slow down.",
    },
});
