import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/db";
import { comparePassword, hashPassword } from "../utils/hash";
import { getJwtSecret } from "../config/security";
import {
  normalizeCompanyKey,
  seedDefaultCompanyCredentials,
} from "../utils/companyCredentials";

const JWT_SECRET = getJwtSecret();

export async function companyLogin(req: Request, res: Response) {
  try {
    await seedDefaultCompanyCredentials();

    const company = normalizeCompanyKey(req.body?.company);
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!company) {
      return res.status(400).json({ success: false, message: "Select BEM or GPS." });
    }
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }

    const row = await prisma.companyCredential.findUnique({ where: { company } });
    if (!row) {
      return res.status(403).json({
        success: false,
        code: "COMPANY_ACCESS_MISSING",
        message: "Company access is not set up. Ask admin to create it from Users.",
      });
    }

    const userOk = row.username.trim().toLowerCase() === username.toLowerCase();
    const stored = row.password || "";
    const hashed = /^\$2[aby]\$/.test(stored);
    const passOk = hashed ? await comparePassword(password, stored) : stored === password;
    if (!userOk || !passOk) {
      return res.status(401).json({ success: false, message: "Invalid company username or password." });
    }
    if (!hashed) {
      await prisma.companyCredential.update({
        where: { company },
        data: { password: await hashPassword(password) },
      });
    }

    const token = jwt.sign(
      { typ: "company_gate", company },
      JWT_SECRET,
      { expiresIn: "12h" },
    );

    return res.json({
      success: true,
      token,
      company,
      username: row.username,
    });
  } catch (err) {
    console.error("[companyLogin]", err);
    return res.status(500).json({ success: false, message: "Company login failed." });
  }
}

export async function verifyCompanySession(req: Request, res: Response) {
  try {
    const header = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    const token = String(req.body?.token ?? "").trim() || header;
    if (!token) {
      return res.status(401).json({ success: false, message: "No company session." });
    }
    const decoded = jwt.verify(token, JWT_SECRET) as { typ?: string; company?: string };
    if (decoded.typ !== "company_gate") {
      return res.status(401).json({ success: false, message: "Invalid company session." });
    }
    const company = normalizeCompanyKey(decoded.company);
    if (!company) {
      return res.status(401).json({ success: false, message: "Invalid company session." });
    }
    const row = await prisma.companyCredential.findUnique({ where: { company } });
    if (!row) {
      return res.status(401).json({
        success: false,
        code: "COMPANY_ACCESS_MISSING",
        message: "Company access was removed.",
      });
    }
    return res.json({ success: true, company, username: row.username });
  } catch {
    return res.status(401).json({ success: false, message: "Company session expired." });
  }
}
