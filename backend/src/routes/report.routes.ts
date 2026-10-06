import { Router } from "express";
import { getReports } from "../controllers/report.controller";
import { verifyToken } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";

const router = Router();

router.get("/", verifyToken, allowRoles("admin", "manager"), getReports);

export default router;
