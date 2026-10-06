import fs from "fs";
import path from "path";

export type MailSignatureBrand = "bds" | "ps" | "devcon";

export type MailSignature = {
  brand: MailSignatureBrand;
  label: string;
  html: string;
  attachments: Array<{ filename: string; path: string; cid: string }>;
};

const BRAND_LABEL: Record<MailSignatureBrand, string> = {
  bds: "BEM Design Studio (BDS)",
  ps: "Pacific Sunshine Estimating",
  devcon: "Devcon Estimating",
};

function signaturesDir(): string {
  return path.resolve(__dirname, "..", "..", "assets", "mail-signatures");
}

export function resolveMailBrand(email?: string | null, name?: string | null): MailSignatureBrand | null {
  const hay = `${email ?? ""} ${name ?? ""}`.trim().toLowerCase();
  if (!hay) return null;
  if (
    hay.includes("bimdesignstudio") ||
    hay.includes("bemdesignstudio") ||
    hay.includes("bem design studio") ||
    /(^|[^a-z])bds([^a-z]|$)/.test(hay)
  ) {
    return "bds";
  }
  if (
    hay.includes("psestimating") ||
    hay.includes("ps estimating") ||
    hay.includes("pacificsunshine") ||
    hay.includes("pacific sunshine")
  ) {
    return "ps";
  }
  if (hay.includes("devcon")) return "devcon";
  return null;
}

function readHtml(file: string): string {
  const full = path.join(signaturesDir(), file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing mail signature template: ${file}`);
  }
  return fs.readFileSync(full, "utf8").trim();
}

function pngAttachment(file: string, cid: string): { filename: string; path: string; cid: string } | null {
  const full = path.join(signaturesDir(), file);
  if (!fs.existsSync(full)) return null;
  return { filename: file, path: full, cid };
}

export function getMailSignature(email?: string | null, name?: string | null): MailSignature | null {
  const brand = resolveMailBrand(email, name);
  if (!brand) return null;
  try {
    const attachments: MailSignature["attachments"] = [];
    if (brand === "bds") {
      const logo = pngAttachment("bds-logo.png", "bds-logo");
      if (logo) attachments.push(logo);
    }
    if (brand === "ps") {
      const logo = pngAttachment("ps-logo.png", "ps-logo");
      if (logo) attachments.push(logo);
    }
    if (brand === "devcon") {
      const logo = pngAttachment("devcon-logo.png", "devcon-logo");
      if (logo) attachments.push(logo);
    }
    return {
      brand,
      label: BRAND_LABEL[brand],
      html: readHtml(`${brand}.html`),
      attachments,
    };
  } catch (err) {
    console.error("[mailSignatures]", err);
    return null;
  }
}

export function signatureLabel(email?: string | null, name?: string | null): string | null {
  const brand = resolveMailBrand(email, name);
  return brand ? BRAND_LABEL[brand] : null;
}

const SIGN_OFF_RE = /\n*(?:Thanks|Thank you|Best regards|Kind regards|Warm regards|Regards),?\s*\n[\s\S]*$/i;

export function stripMailSignOff(body: string): string {
  return body.replace(SIGN_OFF_RE, "").trimEnd();
}
