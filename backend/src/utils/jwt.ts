import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/security";

export const generateToken = (
  id: string,
  role: string,
  tv: number,
  sid: string,
  expiresInHours: number
) => {
  return jwt.sign(
    { id, role, tv, sid },
    getJwtSecret(),
    { expiresIn: `${expiresInHours}h` }
  );
};
