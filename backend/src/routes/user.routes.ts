import express from "express";
import prisma from "../config/db";
import { verifyToken, AuthRequest } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { maskCnic } from "../config/security";
import { userBrowserMap } from "../utils/sessions";
import { getCache, setCache, invalidateCache } from "../utils/cache";
import upload, { uploadPdf } from "../middleware/upload.middleware";
import cloudinary from "../config/cloudinary";
import { Readable } from "stream";
import { SEED_USER_EMAILS } from "../constants/seedUsers";
import {
  updateUser,
  deleteUser,
  adminSetUserPassword,
  adminLogoutAllDevices,
} from "../controllers/user.controller";
/* ================= ROUTERS — user routes ================== */
const router = express.Router();
/* ================= MIDDLEWARE — authenticated users ================= */
router.use(verifyToken);

/* ================= GET ALL USERS — admin + csr (chat) ================= */
router.get("/", allowRoles("admin", "csr", "manager"), async (req: AuthRequest, res) => {
  try {
    const viewerRole = req.user!.role;
    const CACHE_KEY = `users:list:${viewerRole}`;

    let users = getCache<Array<Record<string, unknown>>>(CACHE_KEY);
    if (!users) {
      users = await prisma.user.findMany({
        where: viewerRole === "admin"
          ? { email: { notIn: SEED_USER_EMAILS } }
          : undefined,
        select: {
          id:         true,
          name:       true,
          email:      true,  
          role:       true,
          csrCode:    true,
          employeeCode: true,
          fatherName: true,
          currentAddress: true,
          contactNo: true,
          cnic:       true,
          cnicPdfUrl: true,
          profilePic: true,
          isActive:   true,
          isOnline:   true,
          lastActive: true,
          allowedIps: true,
          allowedMacAddress: true,
          temporaryAccessIp: true,
          temporaryAccessMac: true,
          temporaryAccessUntil: true,
          chatEnabled: true,
          chatAllowedUserIds: true,
          chatVisibleToUserIds: true,
          createdAt:  true,
        },
        orderBy: { createdAt: "asc" },
      }) as Array<Record<string, unknown>>;
      setCache(CACHE_KEY, users, 8_000);
    }

    const withBrowser = users.map(u => ({
      ...u,
      cnic:       maskCnic(u.cnic as string | null, viewerRole),
      cnicPdfUrl: viewerRole === "admin" ? (u.cnicPdfUrl as string | null) : null,
      allowedIps: viewerRole === "admin" ? ((u.allowedIps as string[] | undefined) ?? []) : [],
      allowedMacAddress: viewerRole === "admin" ? ((u.allowedMacAddress as string | null) ?? null) : null,
      temporaryAccessIp: viewerRole === "admin" ? ((u.temporaryAccessIp as string | null) ?? null) : null,
      temporaryAccessMac: viewerRole === "admin" ? ((u.temporaryAccessMac as string | null) ?? null) : null,
      temporaryAccessUntil: viewerRole === "admin" ? ((u.temporaryAccessUntil as string | null) ?? null) : null,
      browser:    userBrowserMap.get(u.id as string)?.browser    ?? null,
      tabId:      userBrowserMap.get(u.id as string)?.tabId      ?? null,
      openedAt:   userBrowserMap.get(u.id as string)?.openedAt   ?? null,
      tabVisible: userBrowserMap.get(u.id as string)?.tabVisible ?? null,
      hiddenAt:   userBrowserMap.get(u.id as string)?.hiddenAt   ?? null,
    }));

    return res.json(withBrowser);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

/* ================= UPLOAD PROFILE PIC — authenticated users ================= */
router.post("/upload-pic", upload.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const url = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: "crm_profile_pics", transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face" }] },
        (err, result) => { if (err || !result) return reject(err); resolve(result.secure_url); }
      );
      Readable.from(req.file!.buffer).pipe(stream);
    });
    return res.json({ url });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "Upload failed" });
  }
});

/* ================= UPLOAD CNIC PDF — admin only ================= */
router.post("/upload-cnic", allowRoles("admin"), uploadPdf.single("file"), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No PDF file provided" });
    const url = await new Promise<string>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "crm_cnic_docs",
          // image+pdf enables inline preview / page thumbnails (raw uploads blank in iframes)
          resource_type: "image",
          format: "pdf",
          type: "upload",
          access_mode: "public",
        },
        (err, result) => { if (err || !result) return reject(err); resolve(result.secure_url); }
      );
      Readable.from(req.file!.buffer).pipe(stream);
    });
    return res.json({ url });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ message: "CNIC PDF upload failed" });
  }
});

router.put("/:id/password", allowRoles("admin"), adminSetUserPassword);
router.post("/:id/logout-all", allowRoles("admin"), adminLogoutAllDevices);
router.put("/:id", allowRoles("admin"), updateUser);
router.delete("/:id", allowRoles("admin"), deleteUser);

export default router;