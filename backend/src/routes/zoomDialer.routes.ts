import express from "express";
import prisma from "../config/db";
import { verifyToken, AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import {
  ZoomDialerError,
  adminAccount,
  getValidPreference,
  listCsrAccounts,
  parseNumberList,
  placeZoomCall,
  sameNumber,
  savePreference,
} from "../utils/zoomDialer";

const router = express.Router();

router.use(verifyToken);

function fail(res: express.Response, error: unknown, fallback: string) {
  if (error instanceof ZoomDialerError) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      saved: Boolean(error.saved),
      message: error.message,
    });
  }
  console.error("[zoom-dialer]", error);
  return res.status(500).json({ success: false, message: fallback });
}

router.get("/accounts", allowRoles("csr", "admin"), async (_req, res) => {
  try {
    const accounts = await listCsrAccounts();
    return res.json({ success: true, accounts });
  } catch (error) {
    return fail(res, error, "Failed to load Zoom accounts.");
  }
});

router.get("/preference", allowRoles("csr", "admin"), async (req: AuthRequest, res) => {
  try {
    const preference = await getValidPreference(req.user!.id);
    return res.json({ success: true, preference });
  } catch (error) {
    return fail(res, error, "Failed to load your saved number.");
  }
});

router.put("/preference", allowRoles("csr", "admin"), async (req: AuthRequest, res) => {
  try {
    const accountId = String(req.body?.accountId ?? "").trim();
    const callerNumber = String(req.body?.callerNumber ?? "").trim();
    if (!accountId || !callerNumber) {
      return res.status(400).json({ success: false, message: "Choose an account and a number." });
    }
    const preference = await savePreference(req.user!.id, accountId, callerNumber);
    return res.json({ success: true, preference, message: "Saved as your default number." });
  } catch (error) {
    return fail(res, error, "Failed to save your default number.");
  }
});

router.delete("/preference", allowRoles("csr", "admin"), async (req: AuthRequest, res) => {
  try {
    await prisma.csrDialerPreference.deleteMany({ where: { userId: req.user!.id } });
    return res.json({ success: true, message: "Default number cleared." });
  } catch (error) {
    return fail(res, error, "Failed to clear your default number.");
  }
});

router.post("/call", allowRoles("csr", "admin"), async (req: AuthRequest, res) => {
  try {
    const accountId = String(req.body?.accountId ?? "").trim();
    const callerNumber = String(req.body?.callerNumber ?? "").trim();
    const destination = String(req.body?.destination ?? "").trim();
    const leadId = String(req.body?.leadId ?? "").trim();
    if (!accountId || !callerNumber || !destination) {
      return res.status(400).json({ success: false, message: "Choose an account, a number, and who to call." });
    }
    const result = await placeZoomCall({
      userId: req.user!.id,
      accountId,
      callerNumber,
      destination,
      leadId: leadId || undefined,
      saveDefault: Boolean(req.body?.saveDefault),
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return fail(res, error, "Failed to start the call.");
  }
});

router.get("/admin/accounts", allowRoles("admin"), async (_req, res) => {
  try {
    const rows = await prisma.zoomDialerAccount.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return res.json({ success: true, accounts: rows.map(adminAccount) });
  } catch (error) {
    return fail(res, error, "Failed to load Zoom accounts.");
  }
});

router.post("/admin/accounts", allowRoles("admin"), async (req, res) => {
  try {
    const label = String(req.body?.label ?? "").trim();
    const email = String(req.body?.email ?? "").trim().slice(0, 120);
    const password = String(req.body?.password ?? "").slice(0, 200);
    const numbers = parseNumberList(req.body?.numbers);
    if (!label || label.length > 80) {
      return res.status(400).json({ success: false, message: "Account name is required." });
    }
    if (numbers.length === 0) {
      return res.status(400).json({ success: false, message: "Add at least one phone number for this account." });
    }
    const last = await prisma.zoomDialerAccount.findFirst({ orderBy: { sortOrder: "desc" } });
    const row = await prisma.zoomDialerAccount.create({
      data: {
        label,
        email,
        password,
        numbers,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        isActive: req.body?.isActive !== false,
      },
    });
    return res.json({ success: true, account: adminAccount(row), message: "Zoom account added." });
  } catch (error) {
    return fail(res, error, "Failed to add the Zoom account.");
  }
});

router.put("/admin/accounts/:id", allowRoles("admin"), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const existing = await prisma.zoomDialerAccount.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Zoom account not found." });

    const label = String(req.body?.label ?? existing.label).trim();
    const email = req.body?.email === undefined ? existing.email : String(req.body.email).trim().slice(0, 120);
    const password = req.body?.password === undefined ? existing.password : String(req.body.password).slice(0, 200);
    const numbers = req.body?.numbers === undefined ? existing.numbers : parseNumberList(req.body.numbers);
    if (!label || label.length > 80) {
      return res.status(400).json({ success: false, message: "Account name is required." });
    }
    if (numbers.length === 0) {
      return res.status(400).json({ success: false, message: "Add at least one phone number for this account." });
    }
    const row = await prisma.zoomDialerAccount.update({
      where: { id },
      data: {
        label,
        email,
        password,
        numbers,
        isActive: req.body?.isActive === undefined ? existing.isActive : Boolean(req.body.isActive),
      },
    });
    const prefs = await prisma.csrDialerPreference.findMany({ where: { accountId: id } });
    const stale = prefs.filter((p) => !numbers.some((n) => sameNumber(n, p.callerNumber)));
    if (stale.length) {
      await prisma.csrDialerPreference.deleteMany({ where: { id: { in: stale.map((p) => p.id) } } });
    }
    return res.json({ success: true, account: adminAccount(row), message: "Zoom account updated." });
  } catch (error) {
    return fail(res, error, "Failed to update the Zoom account.");
  }
});

router.delete("/admin/accounts/:id", allowRoles("admin"), async (req, res) => {
  try {
    const id = String(req.params.id ?? "");
    const existing = await prisma.zoomDialerAccount.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: "Zoom account not found." });
    await prisma.csrDialerPreference.deleteMany({ where: { accountId: id } });
    await prisma.zoomDialerAccount.delete({ where: { id } });
    return res.json({ success: true, message: "Zoom account removed." });
  } catch (error) {
    return fail(res, error, "Failed to remove the Zoom account.");
  }
});

export default router;
