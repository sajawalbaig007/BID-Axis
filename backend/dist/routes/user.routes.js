"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../config/db"));
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const security_1 = require("../config/security");
const sessions_1 = require("../utils/sessions");
const cache_1 = require("../utils/cache");
const upload_middleware_1 = __importStar(require("../middleware/upload.middleware"));
const cloudinary_1 = __importDefault(require("../config/cloudinary"));
const stream_1 = require("stream");
const user_controller_1 = require("../controllers/user.controller");
/* ================= ROUTERS — user routes ================== */
const router = express_1.default.Router();
/* ================= MIDDLEWARE — authenticated users ================= */
router.use(auth_middleware_1.verifyToken);
/* ================= GET ALL USERS — admin + csr (chat) ================= */
router.get("/", (0, role_middleware_1.allowRoles)("admin", "csr", "manager"), async (req, res) => {
    try {
        const viewerRole = req.user.role;
        const CACHE_KEY = `users:list:${viewerRole}`;
        let users = (0, cache_1.getCache)(CACHE_KEY);
        if (!users) {
            users = await db_1.default.user.findMany({
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    csrCode: true,
                    employeeCode: true,
                    fatherName: true,
                    currentAddress: true,
                    contactNo: true,
                    cnic: true,
                    cnicPdfUrl: true,
                    profilePic: true,
                    isActive: true,
                    isOnline: true,
                    lastActive: true,
                    allowedIps: true,
                    allowedMacAddress: true,
                    temporaryAccessIp: true,
                    temporaryAccessMac: true,
                    temporaryAccessUntil: true,
                    chatEnabled: true,
                    chatAllowedUserIds: true,
                    chatVisibleToUserIds: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "asc" },
            });
            (0, cache_1.setCache)(CACHE_KEY, users, 8000);
        }
        const withBrowser = users.map(u => ({
            ...u,
            cnic: (0, security_1.maskCnic)(u.cnic, viewerRole),
            cnicPdfUrl: viewerRole === "admin" ? u.cnicPdfUrl : null,
            allowedIps: viewerRole === "admin" ? (u.allowedIps ?? []) : [],
            allowedMacAddress: viewerRole === "admin" ? (u.allowedMacAddress ?? null) : null,
            temporaryAccessIp: viewerRole === "admin" ? (u.temporaryAccessIp ?? null) : null,
            temporaryAccessMac: viewerRole === "admin" ? (u.temporaryAccessMac ?? null) : null,
            temporaryAccessUntil: viewerRole === "admin" ? (u.temporaryAccessUntil ?? null) : null,
            browser: sessions_1.userBrowserMap.get(u.id)?.browser ?? null,
            tabId: sessions_1.userBrowserMap.get(u.id)?.tabId ?? null,
            openedAt: sessions_1.userBrowserMap.get(u.id)?.openedAt ?? null,
            tabVisible: sessions_1.userBrowserMap.get(u.id)?.tabVisible ?? null,
            hiddenAt: sessions_1.userBrowserMap.get(u.id)?.hiddenAt ?? null,
        }));
        return res.json(withBrowser);
    }
    catch (error) {
        console.log(error);
        return res.status(500).json({ success: false, message: "Failed to fetch users" });
    }
});
/* ================= UPLOAD PROFILE PIC — authenticated users ================= */
router.post("/upload-pic", upload_middleware_1.default.single("file"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ message: "No file provided" });
        const url = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({ folder: "crm_profile_pics", transformation: [{ width: 300, height: 300, crop: "fill", gravity: "face" }] }, (err, result) => { if (err || !result)
                return reject(err); resolve(result.secure_url); });
            stream_1.Readable.from(req.file.buffer).pipe(stream);
        });
        return res.json({ url });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ message: "Upload failed" });
    }
});
/* ================= UPLOAD CNIC PDF — admin only ================= */
router.post("/upload-cnic", (0, role_middleware_1.allowRoles)("admin"), upload_middleware_1.uploadPdf.single("file"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ message: "No PDF file provided" });
        const url = await new Promise((resolve, reject) => {
            const stream = cloudinary_1.default.uploader.upload_stream({
                folder: "crm_cnic_docs",
                // image+pdf enables inline preview / page thumbnails (raw uploads blank in iframes)
                resource_type: "image",
                format: "pdf",
                type: "upload",
                access_mode: "public",
            }, (err, result) => { if (err || !result)
                return reject(err); resolve(result.secure_url); });
            stream_1.Readable.from(req.file.buffer).pipe(stream);
        });
        return res.json({ url });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ message: "CNIC PDF upload failed" });
    }
});
router.put("/:id/password", (0, role_middleware_1.allowRoles)("admin"), user_controller_1.adminSetUserPassword);
router.post("/:id/logout-all", (0, role_middleware_1.allowRoles)("admin"), user_controller_1.adminLogoutAllDevices);
router.put("/:id", (0, role_middleware_1.allowRoles)("admin"), user_controller_1.updateUser);
router.delete("/:id", (0, role_middleware_1.allowRoles)("admin"), user_controller_1.deleteUser);
exports.default = router;
