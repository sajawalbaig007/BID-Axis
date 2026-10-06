"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const security_1 = require("../config/security");
const generateToken = (id, role, tv, sid, expiresInHours) => {
    return jsonwebtoken_1.default.sign({ id, role, tv, sid }, (0, security_1.getJwtSecret)(), { expiresIn: `${expiresInHours}h` });
};
exports.generateToken = generateToken;
