"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const upload_middleware_1 = require("../middleware/upload.middleware");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const upload_controller_1 = require("../controllers/upload.controller");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"));
function handleExcelUpload(req, res, next) {
    upload_middleware_1.uploadExcel.single("file")(req, res, (err) => {
        if (!err)
            return next();
        if (err instanceof multer_1.default.MulterError && err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                success: false,
                message: "File too large. Max upload size is 100 MB — split the sheet or compress and retry.",
            });
        }
        const message = err instanceof Error ? err.message : "Upload rejected";
        return res.status(400).json({ success: false, message });
    });
}
router.post("/", handleExcelUpload, upload_controller_1.uploadLeads);
router.post("/preview", handleExcelUpload, upload_controller_1.previewUpload);
router.get("/latest", upload_controller_1.getLatestUpload);
router.get("/history", upload_controller_1.getUploadHistory);
router.patch("/:id/source", upload_controller_1.patchUploadFileSource);
router.delete("/:id", upload_controller_1.deleteUploadFile);
exports.default = router;
