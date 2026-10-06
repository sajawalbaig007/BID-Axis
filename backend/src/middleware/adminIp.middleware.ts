import { Request, Response, NextFunction } from "express";
import { getAdminAllowedIps } from "../config/env";
import { getClientIp } from "../utils/requestMeta";

/** Block admin login/API from IPs not in ADMIN_ALLOWED_IPS (when configured). */
export function enforceAdminIpAllowlist(req: Request, res: Response, next: NextFunction) {
  const allowed = getAdminAllowedIps();
  if (allowed.length === 0) return next();

  const ip = getClientIp(req);
  if (!allowed.includes(ip)) {
    return res.status(403).json({
      success: false,
      code:    "IP_NOT_ALLOWED",
      message: "Admin access is restricted to approved networks.",
    });
  }
  next();
}
