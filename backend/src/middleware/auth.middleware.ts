import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/db";
import { getJwtSecret } from "../config/security";
import { touchActiveSession } from "../utils/sessions";
import { evaluateNetworkAccess } from "../utils/networkAccess";
import { officeNetworkMessage } from "../utils/staffAttendance";

export interface AuthRequest extends Request {
  user?: { id: string; role: string; iat?: number; tv?: number; sid?: string };
}

const JWT_SECRET = getJwtSecret();

export const verifyToken = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token =
      req.cookies?.token ??
      req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string; role: string; tv?: number; sid?: string; iat: number;
    };

    if (!decoded.sid) {
      return res.status(401).json({
        success: false,
        code:    "SESSION_INVALID",
        message: "Session expired. Please log in again.",
      });
    }

    const user = await prisma.user.findUnique({
      where:  { id: decoded.id },
      select: {
        activeSessionId: true,
        tokenVersion: true,
        isActive: true,
        role: true,
        allowedIps: true,
        allowedMacAddress: true,
        temporaryAccessIp: true,
        temporaryAccessMac: true,
        temporaryAccessUntil: true,
      },
    });

    if (!user?.isActive) {
      return res.status(403).json({ success: false, message: "Account is deactivated" });
    }

    if (
      !user.activeSessionId ||
      user.activeSessionId !== decoded.sid ||
      user.tokenVersion !== decoded.tv
    ) {
      return res.status(401).json({
        success: false,
        code:    "SESSION_INVALID",
        message: "Session expired. Please log in again.",
      });
    }

    if (user.role !== decoded.role) {
      return res.status(401).json({
        success: false,
        code:    "SESSION_INVALID",
        message: "Session expired. Please log in again.",
      });
    }

    const networkError = evaluateNetworkAccess(user, req);
    if (user.role === "manager" && !networkError) {
      const officeError = await officeNetworkMessage(req);
      if (officeError) {
        return res.status(403).json({ success: false, code: "IP_NOT_ALLOWED", message: officeError });
      }
    }
    if (networkError) {
      return res.status(403).json({
        success: false,
        code: "NETWORK_POLICY_DENIED",
        message: networkError,
      });
    }

    void touchActiveSession(decoded.id);

    req.user = {
      id:   decoded.id,
      role: decoded.role,
      iat:  decoded.iat,
      tv:   decoded.tv,
      sid:  decoded.sid,
    };
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};
