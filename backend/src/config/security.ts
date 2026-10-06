const DEV_FALLBACK = "dev-only-insecure-secret-change-me-32chars";

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET must be set and at least 32 characters in production.");
  }

  if (secret && secret.length < 32) {
    console.warn("[Security] JWT_SECRET is too short — use at least 32 characters in production.");
  } else {
    console.warn("[Security] JWT_SECRET not set — using development fallback.");
  }
  return secret && secret.length > 0 ? secret : DEV_FALLBACK;
}

export function validatePassword(password: string): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter.";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter.";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number.";
  }
  return null;
}

export function maskCnic(cnic: string | null | undefined, viewerRole: string): string | null {
  if (!cnic) return null;
  if (viewerRole === "admin") return cnic;
  if (cnic.length <= 4) return "****";
  return "*".repeat(cnic.length - 4) + cnic.slice(-4);
}
