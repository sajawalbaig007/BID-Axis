"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const report_controller_1 = require("../controllers/report.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const role_middleware_1 = require("../middleware/role.middleware");
const router = (0, express_1.Router)();
router.get("/", auth_middleware_1.verifyToken, (0, role_middleware_1.allowRoles)("admin", "manager"), report_controller_1.getReports);
exports.default = router;
