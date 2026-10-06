"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMailBrand = resolveMailBrand;
exports.getMailSignature = getMailSignature;
exports.signatureLabel = signatureLabel;
exports.stripMailSignOff = stripMailSignOff;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const BRAND_LABEL = {
    bds: "BEM Design Studio (BDS)",
    ps: "Pacific Sunshine Estimating",
    devcon: "Devcon Estimating",
};
function signaturesDir() {
    return path_1.default.resolve(__dirname, "..", "..", "assets", "mail-signatures");
}
function resolveMailBrand(email, name) {
    const hay = `${email ?? ""} ${name ?? ""}`.trim().toLowerCase();
    if (!hay)
        return null;
    if (hay.includes("bimdesignstudio") ||
        hay.includes("bemdesignstudio") ||
        hay.includes("bem design studio") ||
        /(^|[^a-z])bds([^a-z]|$)/.test(hay)) {
        return "bds";
    }
    if (hay.includes("psestimating") ||
        hay.includes("ps estimating") ||
        hay.includes("pacificsunshine") ||
        hay.includes("pacific sunshine")) {
        return "ps";
    }
    if (hay.includes("devcon"))
        return "devcon";
    return null;
}
function readHtml(file) {
    const full = path_1.default.join(signaturesDir(), file);
    if (!fs_1.default.existsSync(full)) {
        throw new Error(`Missing mail signature template: ${file}`);
    }
    return fs_1.default.readFileSync(full, "utf8").trim();
}
function pngAttachment(file, cid) {
    const full = path_1.default.join(signaturesDir(), file);
    if (!fs_1.default.existsSync(full))
        return null;
    return { filename: file, path: full, cid };
}
function getMailSignature(email, name) {
    const brand = resolveMailBrand(email, name);
    if (!brand)
        return null;
    try {
        const attachments = [];
        if (brand === "bds") {
            const logo = pngAttachment("bds-logo.png", "bds-logo");
            if (logo)
                attachments.push(logo);
        }
        if (brand === "ps") {
            const logo = pngAttachment("ps-logo.png", "ps-logo");
            if (logo)
                attachments.push(logo);
        }
        if (brand === "devcon") {
            const logo = pngAttachment("devcon-logo.png", "devcon-logo");
            if (logo)
                attachments.push(logo);
        }
        return {
            brand,
            label: BRAND_LABEL[brand],
            html: readHtml(`${brand}.html`),
            attachments,
        };
    }
    catch (err) {
        console.error("[mailSignatures]", err);
        return null;
    }
}
function signatureLabel(email, name) {
    const brand = resolveMailBrand(email, name);
    return brand ? BRAND_LABEL[brand] : null;
}
const SIGN_OFF_RE = /\n*(?:Thanks|Thank you|Best regards|Kind regards|Warm regards|Regards),?\s*\n[\s\S]*$/i;
function stripMailSignOff(body) {
    return body.replace(SIGN_OFF_RE, "").trimEnd();
}
