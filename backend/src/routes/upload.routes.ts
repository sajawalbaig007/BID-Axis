import express from "express";
import multer from "multer";
import { uploadExcel } from "../middleware/upload.middleware";
import { verifyToken } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import {
  uploadLeads,
  getLatestUpload,
  previewUpload,
  getUploadHistory,
  deleteUploadFile,
  patchUploadFileSource,
} from "../controllers/upload.controller";

const router = express.Router();

router.use(verifyToken, allowRoles("admin", "manager"));

function handleExcelUpload(req: express.Request, res: express.Response, next: express.NextFunction) {
  uploadExcel.single("file")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: "File too large. Max upload size is 100 MB — split the sheet or compress and retry.",
      });
    }
    const message = err instanceof Error ? err.message : "Upload rejected";
    return res.status(400).json({ success: false, message });
  });
}

router.post("/", handleExcelUpload, uploadLeads);
router.post("/preview", handleExcelUpload, previewUpload);
router.get("/latest", getLatestUpload);
router.get("/history", getUploadHistory);
router.patch("/:id/source", patchUploadFileSource);
router.delete("/:id", deleteUploadFile);

export default router;
