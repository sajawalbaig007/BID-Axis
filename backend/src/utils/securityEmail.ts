import nodemailer from "nodemailer";
import { detectBrowser } from "./sessions";

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  pool: true,
});

function sendMail(opts: { to: string; subject: string; html: string }): void {
  if (!SMTP_USER || !SMTP_PASS) return;
  transporter.sendMail({
    from:    `"BidAxis" <${SMTP_USER}>`,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
  }).catch((err) => console.log("[Security Email]", err));
}

export function sendOTPEmail(to: string, otp: string): void {
  sendMail({
    to,
    subject: "Your CRM Login OTP",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;background:#fff;border-radius:16px;border:1px solid #eee">
        <div style="background:#1B6FE8;padding:20px 24px;border-radius:12px;margin-bottom:24px">
          <h2 style="color:#fff;margin:0">CRM Dashboard</h2>
          <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px">Login Verification Code</p>
        </div>
        <p style="color:#555;margin:0 0 20px">Your one-time login code:</p>
        <div style="background:#EAF2FE;border:2px dashed #1B6FE8;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
          <span style="font-size:48px;font-weight:900;letter-spacing:16px;color:#1B6FE8">${otp}</span>
        </div>
        <p style="color:#999;font-size:13px">Expires in <strong>5 minutes</strong>. Maximum <strong>2 attempts</strong>.</p>
      </div>
    `,
  });
}

export function sendLoginAlertEmail(opts: {
  to: string;
  name: string;
  ip: string;
  userAgent: string;
}): void {
  const browser = detectBrowser(opts.userAgent);
  const when = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  sendMail({
    to:      opts.to,
    subject: "New login to your CRM account",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
        <h2 style="color:#1B6FE8;margin:0 0 12px">New sign-in detected</h2>
        <p style="color:#444">Hi ${opts.name},</p>
        <p style="color:#444">Your CRM account was just signed in to.</p>
        <ul style="color:#555;font-size:14px;line-height:1.8">
          <li><strong>Time:</strong> ${when}</li>
          <li><strong>Browser:</strong> ${browser}</li>
          <li><strong>IP:</strong> ${opts.ip}</li>
        </ul>
        <p style="color:#888;font-size:13px">If this wasn't you, change your password immediately and use "Logout all devices" in Settings.</p>
      </div>
    `,
  });
}
