import { Response } from "express";
import prisma from "../config/db";
import { hashPassword } from "../utils/hash";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  COMPANY_KEYS,
  normalizeCompanyKey,
  publicCredential,
  seedDefaultCompanyCredentials,
} from "../utils/companyCredentials";

export async function listCompanyCredentials(_req: AuthRequest, res: Response) {
  try {
    await seedDefaultCompanyCredentials();
    const rows = await prisma.companyCredential.findMany({
      orderBy: { company: "asc" },
    });
    return res.json({
      success: true,
      credentials: rows.map(publicCredential),
    });
  } catch (err) {
    console.error("[listCompanyCredentials]", err);
    return res.status(500).json({ success: false, message: "Failed to load company access." });
  }
}

export async function upsertCompanyCredential(req: AuthRequest, res: Response) {
  try {
    const company = normalizeCompanyKey(req.params.company ?? req.body?.company);
    if (!company) {
      return res.status(400).json({ success: false, message: "Company must be BEM or GPS." });
    }

    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    const existing = await prisma.companyCredential.findUnique({ where: { company } });

    if (!username) {
      return res.status(400).json({ success: false, message: "Username is required." });
    }
    if (username.length > 64) {
      return res.status(400).json({ success: false, message: "Username is too long." });
    }
    if (!existing && !password) {
      return res.status(400).json({ success: false, message: "Password is required." });
    }
    if (password && password.length < 4) {
      return res.status(400).json({ success: false, message: "Password must be at least 4 characters." });
    }

    const data: { username: string; password?: string } = { username };
    if (password) data.password = await hashPassword(password);

    const row = existing
      ? await prisma.companyCredential.update({
          where: { company },
          data,
        })
      : await prisma.companyCredential.create({
          data: {
            company,
            username,
            password: data.password!,
          },
        });

    return res.json({
      success: true,
      credential: publicCredential(row),
      message: existing ? "Company access updated." : "Company access created.",
    });
  } catch (err) {
    console.error("[upsertCompanyCredential]", err);
    return res.status(500).json({ success: false, message: "Failed to save company access." });
  }
}

export async function deleteCompanyCredential(req: AuthRequest, res: Response) {
  try {
    const company = normalizeCompanyKey(req.params.company);
    if (!company) {
      return res.status(400).json({ success: false, message: "Company must be BEM or GPS." });
    }
    const existing = await prisma.companyCredential.findUnique({ where: { company } });
    if (!existing) {
      return res.status(404).json({ success: false, message: "Company access not found." });
    }
    await prisma.companyCredential.delete({ where: { company } });
    return res.json({ success: true, message: `${company} company access removed.` });
  } catch (err) {
    console.error("[deleteCompanyCredential]", err);
    return res.status(500).json({ success: false, message: "Failed to delete company access." });
  }
}

export { COMPANY_KEYS };
