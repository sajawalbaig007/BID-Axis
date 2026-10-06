import {
  Response,
  NextFunction,
} from "express";

import {
  AuthRequest,
} from "./auth.middleware";

function roleAllowed(userRole: string, roles: string[]): boolean {
  if (roles.includes(userRole)) return true;
  if (userRole === "bim_manager" && roles.includes("technical_manager")) return true;
  if (userRole === "bim" && roles.includes("estimator")) return true;
  return false;
}

export const allowRoles = (
  ...roles: string[]
) => {

  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {

    if (
      !req.user ||
      !roleAllowed(req.user.role, roles)
    ) {

      return res.status(403).json({
        success: false,
        message:
          "Access denied",
      });
    }

    next();
  };
};