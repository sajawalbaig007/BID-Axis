import { Router } from "express";
import {
  uploadReport,
  deleteReport,
} from "../controllers/reportUpload.controller";
import { uploadReportFile } from "../middleware/upload.middleware";
import { verifyToken } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = Router();

router.post(
  "/",
  verifyToken,
  allowRoles("admin"),
  uploadReportFile.single("file"),
  uploadReport
);

router.delete(
  "/:id",
  verifyToken,
  allowRoles("admin"),
  deleteReport
);

export default router;
