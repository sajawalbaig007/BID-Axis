# BEM CRM — Complete Codebase Documentation

> **Project:** CRM Dashboard for BEM Solutions  
> **Repository:** `CRM/` (monorepo: `backend/` + `frontend/`)  
> **Last updated:** August 2026 — includes Messages (§13), Notifications (§14), Presence/Work Sessions (§15), full dashboard merges (§22)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Tech Stack](#3-tech-stack)
4. [Repository Structure](#4-repository-structure)
5. [Database (MongoDB + Prisma)](#5-database-mongodb--prisma)
6. [Backend](#6-backend)
7. [API Reference](#7-api-reference)
8. [Frontend](#8-frontend)
9. [Authentication & Sessions](#9-authentication--sessions)
10. [Security](#10-security)
11. [Lead Workflow & Business Logic](#11-lead-workflow--business-logic)
12. [Uploads & Data Import](#12-uploads--data-import)
13. [Chat / Messages System](#13-chat--messages-system)
14. [Notifications & Alerts](#14-notifications--alerts)
15. [Presence, Heartbeat & Work Sessions](#15-presence-heartbeat--work-sessions)
16. [Background Jobs (Cron)](#16-background-jobs-cron)
17. [Caching & Performance](#17-caching--performance)
18. [External Services](#18-external-services)
19. [Environment Variables](#19-environment-variables)
20. [Local Development](#20-local-development)
21. [Deployment Notes](#21-deployment-notes)
22. [Every Dashboard - Sources & Merges](#22-every-dashboard---sources--merges)
23. [Quick Reference](#23-quick-reference)

---

## 1. Overview

This is a **full-stack Customer Relationship Management (CRM)** system built for **BEM Solutions**. It powers daily sales/CSR operations plus technical delivery and accounts:

- **Lead assignment** to CSRs with status workflows (pending, not picked, not interested, important, interested, etc.)
- **Potential clients** pipeline (important / scheduled / interested)
- **Client directory** (new vs returning / old clients)
- **Active projects / Project DB** (won deals with phases, deadlines, multi-currency payments)
- **Payments dashboard** (Admin/Manager) — collections by source (AH / SN / CHQ / HM), USD·CAD·PKR, full payment history
- **Technical portal** — assignments, deadlines, KPI, reports (Technical Manager / Estimators)
- **Accounts portal** — income statement, team salaries / payroll (PF, occasional), balance sheet, cash flow
- **Admin bulk Excel uploads** with CSR round-robin distribution
- **Internal real-time chat / Messages** (WebSocket + REST fallback; org pools + ACL)
- **In-app notifications** — Admin/Manager meetings bell, CSR schedule + stats, TM project inbox, concurrent-login alerts
- **Work sessions** — CSR/Estimator check-in, dashboard vs away time, Admin session report
- **Reports**, audit logs, access history, and layered security controls

### User Roles

| Role | Route prefix | Purpose |
|------|--------------|---------|
| `admin` | `/admin/*` | Full control: users, settings, stealth CSR chat, shuffle, CSR purge, access history, payments |
| `manager` | `/manager/*` | Leads, reports, projects, uploads, bin, payments — **reuses admin pages** (no Users / Settings) |
| `csr` | `/csr/*` | Own assigned leads, status updates, clients, projects, bin, chat |
| `technical_manager` | `/technical/*` | Technical dashboard, active projects, assignments, KPI, reports |
| `estimator` | `/estimator/*` | Assigned takeoff work, notes, time tracking |
| `accounts` | `/accounts/*` | Income statement, payroll, balance sheet, cash flow, assets |

Login requires selecting the correct **portal**. Backend enforces `loginRole` must match account role.

### Seed Accounts (`backend/prisma/seed.ts`)

| Email | Password | Role | Notes |
|-------|----------|------|-------|
| `admin@gmail.com` | `123456` | admin | |
| `manager@gmail.com` | `123456` | manager | |
| `csr@gmail.com` | `123456` | csr | `csrCode`: CSR001 |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     Browser (Next.js 16 App Router)                   │
│  /  → portal picker   |   /login/{admin|manager|csr|…}               │
│  /admin/*  |  /manager/*  |  /csr/*  |  /technical/*  |  /estimator/* │
│  /accounts/*  |  proxy.ts (route guard)                               │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
              ┌─────────────────┴─────────────────┐
              │  POST /api/auth/set-session        │  httpOnly JWT cookie
              │  /api/backend/[...path]            │  reverse proxy → Express
              └─────────────────┬─────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│              Express 5 API (port 5000) + WebSocket /ws/chat           │
│  /api/auth | /api/admin | /api/csr | /api/users | /api/uploads      │
│  /api/reports | /api/report-uploads | /api/chat                     │
│  /api/accounts | /api/estimator                                       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
    MongoDB               Cloudinary              Gmail SMTP
   (Prisma ORM)         (files, reports)       (2FA OTP, alerts)
         │
    Cloudflare Turnstile (login CAPTCHA)
    Have I Been Pwned (password breach check)
```

### Request Flow (Development)

1. Browser calls `/api/backend/csr/stats` (same-origin Next.js proxy)
2. `frontend/app/api/backend/[...path]/route.ts` forwards to `http://127.0.0.1:5000/api/csr/stats`
3. Cookie `token` + optional `Authorization: Bearer` + `X-Client-Mac` header sent to backend
4. `verifyToken` validates JWT, session binding, active account, network access policy
5. `allowRoles("csr")` checks role
6. Handler returns JSON (often from in-memory cache)

### Production Topology

- **Frontend:** Vercel (`dashboard.bemsolutions.io`)
- **Backend:** Render / Node host (`node dist/server.js`)
- **Database:** MongoDB Atlas (or compatible)

---

## 3. Tech Stack

### Backend (`backend/`)

| Layer | Technology |
|-------|------------|
| Runtime | Node.js, TypeScript 5.8 |
| Framework | Express 5.1 |
| ORM | Prisma 6.19 → **MongoDB** |
| Auth | JWT + httpOnly cookies, bcryptjs |
| Security | helmet, cors, express-rate-limit, login lockout |
| Realtime | `ws` WebSocket (`/ws/chat`) |
| Files | multer (memory), xlsx (Excel), Cloudinary |
| Email | Nodemailer (Gmail SMTP) |
| Dev | ts-node-dev |
| Prod start | `node dist/server.js` (compiled `dist/` is committed) |

### Frontend (`frontend/`)

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16.2 (App Router), React 19 |
| Styling | Tailwind CSS v4, CSS variables (light/dark) |
| HTTP | Axios (`lib/api.ts`) |
| Realtime | WebSocket client (`lib/chatSocket.ts`) |
| Charts | Recharts (lazy-loaded on Reports) |
| Themes | next-themes |
| Icons | lucide-react, react-icons |
| PDF | jspdf + jspdf-autotable |
| Toasts | react-hot-toast |

---

## 4. Repository Structure

```
CRM/
├── CODEBASE.md
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── dist/                    # Compiled JS (used by npm start)
│   └── src/
│       ├── server.ts            # HTTP + WS + cron jobs
│       ├── app.ts               # Express middleware + route mount
│       ├── chat/
│       │   ├── chatSocket.ts    # WebSocket server
│       │   └── chatMessageFormat.ts
│       ├── config/              # db, env, cloudinary, security
│       ├── controllers/         # auth, user, upload, report (5 files)
│       ├── middleware/          # auth, role, rateLimit, upload, adminIp
│       ├── routes/              # 8 route modules (heavy inline logic)
│       └── utils/               # ~30 domain helpers
└── frontend/
    ├── proxy.ts                 # Route guard logic (+ config.matcher)
    ├── app/
    │   ├── page.tsx             # Portal picker (Admin / Manager / CSR)
    │   ├── login/[portal]/      # Per-portal login
    │   ├── layout.tsx           # Root: fonts, theme, toast
    │   ├── api/
    │   │   ├── auth/            # set-session, clear-session
    │   │   └── backend/         # Reverse proxy to Express
    │   ├── admin/               # Admin pages + components
    │   ├── manager/             # Re-exports admin pages + own sidebar
    │   ├── csr/                 # CSR pages, hooks, constants, components
    │   ├── technical/           # Technical Manager portal
    │   ├── estimator/           # Estimator portal
    │   ├── accounts/            # Accounts / payroll / statements
    │   └── components/          # Shared: chat, auth, projects, staff, tables
    └── lib/                     # api, session, caches, paymentsSummary, projectFields
```

> **Note:** `proxy.ts` exports `proxy()` and `config.matcher`. Ensure a root `middleware.ts` re-exports it if your Next.js version requires that wiring for route protection to run.

---

## 5. Database (MongoDB + Prisma)

**Provider:** MongoDB (`DATABASE_URL`)  
**IDs:** `cuid()` mapped to `_id` via `@map("_id")`  
**Lead statuses:** plain strings (not Prisma enums) for workflow flexibility

### Models

#### `User`

| Field | Notes |
|-------|-------|
| `role` | `admin` \| `csr` \| `manager` \| `technical_manager` \| `estimator` \| `accounts` |
| `csrCode` | e.g. CSR001 / Estimator code — used in `clientCode` generation |
| `cnic`, `cnicPdfUrl` | Identity docs (Cloudinary; CNIC PDF uploaded as `image`/`pdf` for preview) |
| `profilePic` | Cloudinary URL |
| `isActive` | `false` after 90-day CSR inactivity (cron) |
| `isOnline`, `lastActive` | Presence via heartbeat |
| `twoFAEnabled` | Email OTP on login |
| `tokenVersion` | Incremented on password change / logout-all |
| `activeSessionId` | Single active session binding (`sid` in JWT) |
| `allowedIps[]` | Max 5 in-house approved IPs |
| `allowedMacAddress` | In-house device ID (via `X-Client-Mac` header) |
| `temporaryAccessIp/Mac/Until` | Temporary outside access (9–10 hours, auto-expires) |

**Indexes:** `role`, `isActive`, `lastActive`, `[role,isActive]`, `temporaryAccessUntil`

#### `Lead` (central entity)

| Field | Notes |
|-------|-------|
| `status` | Default `"pending"` — see [Lead Statuses](#lead-statuses) |
| `assignedTo` | FK → User (CSR) |
| `important`, `interested` | Boolean flags synced with status |
| `nextSchedule`, `nextTime`, `timezone` | Scheduled important calls |
| `followUpNotes` | Multi-line try history (NI / NP) |
| `interestedService` | Service when interested |
| `projectTitle`, `projectCode`, `projectDeadline`, etc. | Active project fields |
| `projectPhase` | `not_started`, takeoff/pricing/QA phases |
| `projectPayments` | JSON string of payment entries (see [§22](#22-every-dashboard---sources--merges)) |
| `technicalReceivedAt`, `pricingReceivedAt` | Handoff timestamps into Technical / Pricing |
| `technicalAssignments`, `technicalNotes` | JSON: estimator assignments + working notes |
| `projectWorkStatus`, `hiddenOnTechnical`, `needsRevision` | Technical workflow flags |
| `revisionRequestedAt`, `revisionNotes` | Admin → TM revision queue |
| `deadlineTiming` | `morning` \| `cob` emergency submit window (TM notified on change) |
| `clientCode` | Auto on Close Client: `{csrCode}-01`, etc. |
| `isOldClient` | Auto if company had prior won project |
| `notInterestedCount`, `notPickedCount` | Retry counters (limits: 3 / 7) |
| `inBin`, `binReason`, `binPreviousStatus` | Bin / soft-delete |
| `hiddenOnMain` | Hides from CSR main pipeline |
| `uploadedFileId` | FK → UploadFile |
| `shuffleAttempts` | Lead shuffle cron counter |

**Indexes:** `assignedTo`, `status`, `phone`, `email`, `company`, `createdAt`, `updatedAt`, `important`, `interested`, `inBin`, `nextSchedule`, `hiddenOnMain`, and multiple composites for tab/bin queries.

#### User (extra fields beyond auth)

| Field | Purpose |
|-------|---------|
| `csrCode` / `employeeCode` | Client coding vs HR employee ID |
| `fatherName`, `currentAddress`, `contactNo`, `cnic`, `cnicPdfUrl`, `profilePic` | HR / profile |
| `allowedIps`, `allowedMacAddress`, `temporaryAccessIp/Mac/Until` | Network gate |
| `chatEnabled` | Master switch — false = no Messages UI / WS / send |
| `chatAllowedUserIds` | Empty = message anyone allowed by org; else allowlist only |
| `chatVisibleToUserIds` | Empty = visible in directories; else only those viewers see this user |

#### Other Models

| Model | Purpose |
|-------|---------|
| `LeadNote` | Timestamped notes per lead — optional `parentId` for replies; **edit bumps `createdAt`** so note sorts as latest |
| `SubContact` | Extra contacts on a lead |
| `CallLog` | CSR status change history (feeds CSR 24h notification stats) |
| `UploadSource` | Admin source label + `sudoName` (shown to CSRs) |
| `Trade` | Trade labels for uploads / projects — `/admin/trades` CRUD |
| `UploadFile` | Excel upload metadata + Cloudinary URL |
| `Report` | Generated or uploaded reports (cron JSON + manual report-uploads) |
| `Conversation` | Chat thread (direct / group) |
| `ConversationMember` | Membership, `lastReadAt`, `archivedAt` |
| `Message` | Text/file/voice; reactions JSON; replies; mentions |
| `SecurityAuditLog` | Auth & security events |
| `AccessHistory` | Login/logout/heartbeat per user |
| `LoginLockout` | Failed login tracking |
| `LoginAttemptAlert` | Concurrent login attempt — drives session notifier + WS push |
| `RateLimitEntry` | Optional Prisma rate-limit store |
| `CsrWorkSession` | CSR **and** Estimator check-in sessions (`dashboardMs` / `awayMs` / `pausedMs` + `pausedAt`, device, IP, `closedReason`) |
| `PayrollLoan` | Accounts loan ledger (employee + department + paid/total) |
| `AccountsRecord` | Day JSON keyed by `AccountsPage` enum + `recordDate` |
| `AccountsFileUpload` | Proof / attachment uploads per accounts page/date |
| `AccountsMonthlyReport` | Saved Word monthly archives |
| `EstimatorKpiRecord` | Monthly KPI marks/stars/remarks per estimator |
| `TechnicalNotification` | TM inbox rows (`technical_notifications`) — Admin/Estimator/system producers |

`AccountsPage` enum: `dashboard`, `balance_sheet`, `income_statement`, `cash_flow`, `total_assets`, `sales_payroll`, `technical_payroll`, `income_budget`.

### Entity Relationship (simplified)

```
User ──< Lead (assignedTo)
Lead ──< LeadNote, SubContact, CallLog
UploadSource ──< UploadFile ──< Lead
User ──< Report, CsrWorkSession, AccessHistory
User ──< EstimatorKpiRecord (as estimator)
Conversation ──< ConversationMember >── User
Conversation ──< Message >── User (sender)
TechnicalNotification ──(leadId)→ Lead   (no Prisma relation; string id)
AccountsRecord / AccountsFileUpload / AccountsMonthlyReport / PayrollLoan  (standalone)
```

---

## 6. Backend

### Entry: `src/server.ts`

1. Loads `.env`, `validateEnv()`
2. Creates HTTP server, attaches Express app
3. Initializes WebSocket chat (`initChatSocket` on `/ws/chat`)
4. Runs background cron jobs (see [§16](#16-background-jobs-cron))

### App: `src/app.ts`

| Middleware | Purpose |
|------------|---------|
| `helmet` | CSP (prod), HSTS, security headers |
| `cors` | localhost, bemsolutions.io, Vercel, `FRONTEND_URL` |
| `express.json` | 1 MB limit |
| `cookieParser` | JWT cookie |
| `apiLimiter` | 300 req/min on `/api` (in-memory by default) |

### Route Mounting

| Prefix | File | Notes |
|--------|------|-------|
| `/api/auth` | `auth.routes.ts` | Login, 2FA, profile |
| `/api/admin` | `admin.routes.ts` | `enforceAdminIpAllowlist` on all routes |
| `/api/csr` | `csr.routes.ts` | ~1,200 lines — most CSR business logic |
| `/api/users` | `user.routes.ts` | User CRUD + network policy |
| `/api/uploads` | `upload.routes.ts` | Excel import |
| `/api/reports` | `report.routes.ts` | Performance reports |
| `/api/report-uploads` | `reportUpload.routes.ts` | Manual report files |
| `/api/chat` | `chat.routes.ts` | Chat REST + admin stealth view |
| `/api/accounts` | `accounts.routes.ts` | Accounts dashboard data / uploads |
| `/api/estimator` | `estimator.routes.ts` | Estimator project notes & assignments |

### Controllers (`src/controllers/`)

| File | Responsibility |
|------|----------------|
| `auth.controller.ts` | Login, 2FA, register, profile, password, audit logs, network policy on login |
| `user.controller.ts` | User CRUD, network policy fields, admin password reset |
| `upload.controller.ts` | Excel parse, chunked insert (1000), batched updates (30), CSR distribution |
| `report.controller.ts` | Period reports + internal 90s/300s cache |
| `reportUpload.controller.ts` | Report file upload/delete |

> Most admin/CSR lead logic lives **inline in route files**, not controllers.

### Middleware (`src/middleware/`)

| File | Purpose |
|------|---------|
| `auth.middleware.ts` | JWT verify, session binding, network access, `lastActive` touch |
| `role.middleware.ts` | `allowRoles(...)` |
| `rateLimit.middleware.ts` | Login 15/15min; API 300/min; Prisma store only if `RATE_LIMIT_STORE=prisma` |
| `adminIp.middleware.ts` | `ADMIN_ALLOWED_IPS` gate on `/api/admin/*` |
| `upload.middleware.ts` | Multer: images 5MB, Excel 15MB, PDF 10MB |

### Key Utils (`src/utils/`)

| File | Purpose |
|------|---------|
| `cache.ts` | In-memory TTL cache, pattern invalidation, throttled heal lock |
| `binLeads.ts` | Bin rules (NI=3, NP=7), `buildBinWhere`, pipeline where-clauses |
| `csrDashboardQueries.ts` | CSR tab stats, paginated tab leads, potential leads |
| `csrLeadSelect.ts` | Lean Prisma `select` shapes (max 5 notes on client list) |
| `adminClientQueries.ts` | Admin list filters (important/schedule/interested/closed) + **search / state / phone / areaCodes** |
| `adminSummaryStats.ts` | Admin dashboard tab counts + chart series (tab counts accept same filters) |
| `potentialClientBuckets.ts` | Important / interested / scheduled bucket rules |
| `leadClientPromotion.ts` | Won-client promotion, pending dedupe, `healPipelineLeaksForCsr` |
| `leadPhoneLookup.ts` | Returning client phone search |
| `leadDuplicateCheck.ts` | Phone/email duplicate detection |
| `projectLeads.ts` | Active/won project filters |
| `projectPayments.ts` | Payment JSON parse/totals — channels AH/SN/CHQ/HM, currencies USD/CAD/PKR, `paidAt` / `createdAt` / `accountsMonth` |
| `paymentsSummary.ts` | Admin/Manager **Payments dashboard** payload (KPIs, sources, full/partial/unpaid lists) |
| `projectCurrencyCollections.ts` | Bridge: project payments → Accounts currency month buckets |
| `technicalEstimators.ts` | Technical assignments + technical notes JSON helpers |
| `technicalNotifications.ts` | Create TM inbox rows; field-diff for Admin project updates |
| `technicalMonitoring.ts` | Estimator workload / timer / overdue monitoring payload |
| `technicalKpiRecords.ts` | KPI CRUD + previous-month ratings |
| `chatAccess.ts` | Org pools (GPS vs BEM), allowlist/visibility, directory filter |
| `csrSessionTracking.ts` | Work-session check-in/out/heartbeat (CSR + Estimator); 16h auto-close |
| `csrResetPages.ts` | Admin CSR page/lead reset helpers |
| `fxRates.ts` | Live FX for Accounts |
| `accountsStorage.ts` | Accounts day-record persistence helpers |
| `businessCalendar.ts` / `estTime.ts` | Business day / EST helpers |
| `securityEmail.ts` | Login alert emails (SMTP) |
| `networkAccess.ts` | Per-user IP/MAC allowlist + temporary access |
| `uploadExcelParse.ts` | xlsx row parsing + classification |
| `uploadCategory.ts` | Upload category enum |
| `deleteLeadsCascade.ts` | Cascade delete + cache invalidation |
| `purgeCsrLeads.ts` | Bulk purge CSR leads |
| `sessions.ts` | OTP store, `activeSessionId`, login alerts, browser tab map |
| `loginLockout.ts` | 8 fails → 30min block; CAPTCHA after 3 |
| `auditLog.ts` | Security audit writes |
| `accessHistory.ts` | Login/logout/heartbeat history (throttled) |
| `rateLimitStore.ts` | Prisma-backed express-rate-limit store |

---

## 7. API Reference

All endpoints prefixed with `/api`. Auth: `verifyToken` unless noted.

### Auth — `/api/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/captcha-config` | Public | Turnstile site key |
| POST | `/login` | Public | Login (+ portal role, network policy, CAPTCHA) |
| POST | `/verify-otp` | Public | 2FA OTP |
| POST | `/resend-otp` | Public | Resend OTP |
| POST | `/register` | Admin | Create user |
| POST | `/logout` | Auth | Logout |
| GET | `/me` | Auth | Current user |
| GET | `/session-status` | Auth | Login-attempt alert status |
| POST | `/session-alert/ack` | Auth | Dismiss alert |
| POST | `/logout-all` | Admin/Manager | Invalidate all sessions |
| GET | `/audit-logs` | Admin | Security audit log |
| PUT | `/profile` | Auth | Update profile |
| PUT | `/change-password` | Auth | Change password |
| PUT | `/toggle-2fa` | Auth | Enable/disable 2FA |

### Admin — `/api/admin`

Protected by `verifyToken` + role + `enforceAdminIpAllowlist`.  
Many routes allow **`admin` and `manager`**; admin-only routes noted.

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/dashboard` | admin | Legacy stub |
| GET | `/notifications` | admin, manager, TM | **Meetings** (`scheduledCalls`) + **technical notes** (`technicalNotes`) — see [§14](#14-notifications--alerts) |
| GET | `/csrs` | admin, manager | Active CSR list |
| GET | `/clients/tab-counts` | admin, manager, TM | Tab badge counts — optional `search`, `state`, `phone`, `areaCodes`, `scheduleDate`, **`csr`** |
| GET | `/clients/summary` | admin, manager | Dashboard stats + charts |
| GET | `/clients` | admin, manager, TM | Paginated leads (`view`, `search`, `state`, `phone`, `areaCodes`, `scheduleDate`, `csr`) |
| GET/PUT/DELETE | `/lead/:id` | admin, manager | Lead CRUD |
| PUT | `/lead/:id/reassign` | admin, manager | Reassign to CSR |
| POST | `/leads/reassign-bulk` | admin, manager | Bulk move: From CSR+page → To CSR(s)+page (equal round-robin; destination page sets status) |
| POST/PUT/DELETE | `/lead/:id/notes[/:noteId]` | admin, manager, TM | Notes CRUD — POST accepts `parentId` (reply); **PUT bumps `createdAt`**; DELETE removes nested replies; UI via CommentCell `+N` sticky |
| POST/PUT/DELETE | `/lead/:id/subcontacts[/:subId]` | admin, manager | Sub-contacts |
| GET | `/projects` | admin, manager | Paginated active projects |
| GET | `/projects/excel-template` | admin, manager | Download Project DB Excel template (all fields) |
| POST | `/projects/excel-upload` | admin, manager | Bulk upload projects from Excel (any dates) |
| POST/PUT | `/project`, `/project/:id` | admin, manager | Project CRUD |
| GET | `/lookup-by-phone` | admin, manager | Phone lookup |
| GET | `/bin` | admin, manager | Bin leads (`buildBinWhere`) |
| PUT | `/csr-status/:id` | admin | Activate/deactivate CSR |
| GET | `/csr-history/:csrId` | admin | CSR history |
| DELETE | `/csr-leads/:csrId` | admin | Purge all CSR leads |
| GET | `/shuffle-status` | admin | Shuffle preview |
| POST | `/run-shuffle` | admin | Manual shuffle |
| GET/POST/PATCH/DELETE | `/upload-sources[/:id]` | admin, manager | Upload sources |
| GET | `/access-history/:userId` | admin | User access history |
| POST | `/migrate-legacy-notes` | admin | One-time migration |
| GET/POST/PATCH/DELETE | `/trades[/:id]` | admin, manager | Trade labels |
| GET | `/payments-summary` | admin, manager | Payments dashboard (month) |
| PUT | `/project/:id/send-final-submission` | admin, manager, TM | → `qa_phase` |
| PUT | `/project/:id/return-pricing` | admin, manager, TM | Final → pricing |
| PUT | `/project/:id/hide-technical` | admin, manager, TM | Soft-hide from TM only |
| PUT | `/project/:id/mark-completed` | admin, manager | Completed + hide TM + Completed tab |
| PUT | `/project/:id/request-revision` | admin, manager | TM revision queue + TM inbox notify |
| PUT | `/lead/:id/technical-notes/read` | admin, manager, TM | Stub success (UI dismiss companion) |
| GET | `/technical-notifications` | TM, admin | TM inbox list (`?limit=&unread=`) |
| PUT | `/technical-notifications/read-all` | TM, admin | Mark all read |
| PUT | `/technical-notifications/:id/read` | TM, admin | Mark one read |
| DELETE | `/technical-notifications/:id` | TM, admin | Hard dismiss |
| GET | `/technical-estimators` | TM, admin, manager | Estimator directory for assign |
| GET | `/technical-monitoring` | TM, admin | Live workload / timers |
| GET/POST/PUT/DELETE | `/technical-kpi*` | TM, admin | KPI records + auto-fill |
| GET | `/technical-previous-month-ratings` | TM, admin, estimator* | Previous month stars/marks |
| GET | `/csr-session-report` | admin, manager | Work-session hours report |
| PUT | `/csr-work-session/:id` | admin | Edit session times |
| GET | `/csr-reset-pages` | admin | CSR page reset helpers |
| DELETE | `/csr-leads/:id/reset` | admin | Targeted CSR lead reset |

\* Estimator uses own `/api/estimator/previous-month-rating` for self.

### CSR — `/api/csr`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Tab counts (cached; throttled pipeline heal) |
| GET | `/tab-leads` | Paginated leads by tab (`today`, `pending`, `important`, etc.) |
| GET | `/potential-leads` | Important / schedule / interested bucket |
| GET | `/dashboard` | Legacy full dashboard payload (cached) |
| GET | `/clients` | Won clients (new vs old; cache-first, lean notes) |
| GET | `/leads` | Client directory leads |
| GET | `/not-interested` | NI / NP retry leads |
| GET | `/bin` | Bin leads (`buildBinWhere` DB query) |
| GET | `/projects` | Active projects |
| GET | `/notifications` | Scheduled calls + 24h `CallLog` stats — see [§14](#14-notifications--alerts) |
| GET | `/activity-report` | Activity by date range |
| GET/POST/PUT | `/lead`, `/lead/:id` | Lead CRUD + status workflow |
| PUT | `/lead/:id/assign` | CSR-to-CSR assign |
| GET | `/lookup-by-phone` | Returning client lookup |
| GET | `/csrs` | Peer CSR list |
| POST | `/project` | Create project lead |
| GET | `/work-session` | Current open check-in session |
| POST | `/check-in` \| `/check-out` | Start/end work session |
| POST | `/pause` \| `/resume` | Pause work clock (e.g. WhatsApp) without checkout; resume on return |
| POST | `/heartbeat` | Presence + work-session visibility (DB write throttled) |
| POST | `/offline` | Mark offline (beacon) |
| POST/PUT/DELETE | `/lead/:id/notes`, `/subcontacts` | Notes & sub-contacts — **PUT bumps `createdAt`** |

### Uploads — `/api/uploads`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| POST | `/` | admin, manager | Excel upload → distribute |
| POST | `/preview` | admin, manager | Dry-run preview |
| GET | `/latest`, `/history` | admin, manager | Upload metadata |
| PATCH | `/:id/source` | admin, manager | Change source |
| DELETE | `/:id` | admin, manager | Delete upload + cascade |

### Reports

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/reports/` | admin, manager | CSR performance report |
| POST | `/report-uploads/` | admin | Upload report file |
| DELETE | `/report-uploads/:id` | admin | Delete report |

### Chat — `/api/chat`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/conversations` | List (`?archived=1`) — filtered by chat ACL |
| POST | `/conversations` | Create direct/group (org + allowlist enforced) |
| DELETE | `/conversations/:id` | Delete/leave |
| GET/POST | `/conversations/:id/messages` | Fetch/send (files up to 200 MB) |
| PATCH/DELETE | `/messages/:id` | Edit (10 min) / delete |
| POST | `/messages/:id/reactions` | Toggle reaction |
| POST | `/conversations/:id/read` | Mark read |
| POST/GET | `/conversations/:id/typing` | Typing (in-memory + WS) |
| POST | `/conversations/:id/pin` | Pin message |
| POST | `/conversations/:id/archive` \| `/unarchive` | Per-user archive |
| POST | `/status` | Online/offline heartbeat (chat presence) |
| GET | `/users` | Chat directory (org pools + visibility) |
| GET | `/conversations/:id/members` | Group members |
| GET | `/admin/viewable-users` | Admin stealth: users whose chats can be viewed |
| GET | `/admin/view/:userId/conversations` | Admin stealth conversation list |
| GET | `/admin/view/:userId/.../messages` | Admin read messages (read-only) |

### Accounts — `/api/accounts`

Role: `accounts` (and admin where noted). Day records use `AccountsPage` + `YYYY-MM-DD`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/summary` | Currency dashboard summary |
| GET | `/fx-rates` | Live FX rates |
| GET | `/income-budget/actuals` | Budget vs actual helpers |
| GET | `/reports/monthly` | Generate monthly report payload |
| GET | `/reports/monthly/saved` | List saved Word reports |
| POST | `/reports/monthly/save` | Upload/save monthly Word |
| GET/POST/PUT/DELETE | `/payroll-loans[/:id]` | Loan ledger (+ lookup) |
| GET | `/:page` | List dates with records |
| GET/PUT | `/:page/:date` | Load/save day JSON |
| POST | `/:page/:date/upload` | Proof file upload |

### Estimator — `/api/estimator`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard` | Stats + recent assignments |
| GET | `/projects` | Assigned projects |
| GET | `/lead/:id` | Single assigned lead |
| PUT | `/project/:id/timer` | Start/stop/pause timer |
| PUT | `/project/:id/complete` | Complete assignment work |
| PUT | `/project/:id/takeoff` | Mark takeoff done → TM notify |
| POST | `/lead/:id/notes` | Append technical note → TM notify |
| GET | `/previous-month-rating` | Own previous-month KPI stars |
| GET | `/work-session` | Open check-in |
| POST | `/check-in` \| `/check-out` | Work session |
| POST | `/heartbeat` \| `/offline` | Presence |

### Users — `/api/users`

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/` | admin, csr, manager | User list (CNIC masked for non-admin) |
| POST | `/upload-pic` | Auth | Profile picture |
| POST | `/upload-cnic` | admin | CNIC PDF — Cloudinary **`resource_type: image`, `format: pdf`** (iframe-friendly); legacy raw URLs use Docs viewer on UI |
| PUT | `/:id` | admin | Update user + network policy + **chat ACL** (`chatEnabled`, allow/visibility lists) |
| PUT | `/:id/password` | admin | Reset password |
| DELETE | `/:id` | admin | Delete user + chat cascade |

---

## 8. Frontend

### Routes

| Path | Page | Role |
|------|------|------|
| `/` | Portal picker | Public |
| `/login/admin` \| `/login/manager` \| `/login/csr` … | Login + 2FA | Public |
| `/admin` | Dashboard | Admin |
| `/admin/users` | User management + IP/MAC policy + CNIC preview | Admin only |
| `/admin/leads` | All leads — **tab counts follow search / state / area-code filters** | Admin |
| `/admin/reports` | CSR performance | Admin |
| `/admin/active-projects` | Project DB | Admin |
| `/admin/payments` | Payments / collections dashboard | Admin |
| `/admin/uploads` | Excel uploads | Admin |
| `/admin/bin` | Bin (all CSRs) | Admin |
| `/admin/settings` | Profile, 2FA, audit logs | Admin only |
| `/manager` … `/manager/payments` | Same admin pages (no Users/Settings) | Manager |
| `/csr` | Call Data main dashboard | CSR |
| `/csr/potential-clients` | Important / schedule / interested | CSR |
| `/csr/not-interested` | NI, NP, misc statuses | CSR |
| `/csr/clients` | Client directory | CSR |
| `/csr/active-projects` | CSR projects | CSR |
| `/csr/bin` | CSR bin | CSR |
| `/csr/chat` | Full-page chat | CSR |
| `/csr/settings` | CSR 2FA settings | CSR |
| `/technical` … | Technical Manager dashboard / projects / reports | TM |
| `/estimator` … | Estimator my-projects | Estimator |
| `/accounts` … | Income statement, payroll, balance sheet, cash flow, assets | Accounts |

### Layouts

| Layout | Initializes |
|--------|-------------|
| `app/layout.tsx` | Fonts, `ThemeProvider`, toast |
| `app/admin/layout.tsx` | `StaffPresenceInit`, `StaffChatNotifier`, `SessionNotifierInit`, `ChatLayoutCleanup` |
| `app/manager/layout.tsx` | Same as admin |
| `app/csr/layout.tsx` | Above + `DevToolsGuard`, `CsrPresenceInit` |
| `app/technical/layout.tsx` | Presence + chat notifier + session notifier + TM sidebar (Messages + inbox) |
| `app/estimator/layout.tsx` | Presence + chat + session notifier + work-session shell |
| `app/accounts/layout.tsx` | Presence + chat + session notifier + Accounts sidebar |

### Route Protection: `frontend/proxy.ts`

- Parses JWT from httpOnly `token` cookie (`role`, `exp`, `sid`)
- Protects **all six portals:** `/admin`, `/manager`, `/csr`, `/technical`, `/estimator`, `/accounts`
- Redirects unauthenticated → `/`
- Redirects authenticated at `/` or `/login/*` → role home
- Cross-role redirects to correct portal (**admin may also enter `/accounts`**)

### API Client: `lib/api.ts`

- Axios, `withCredentials: true`, 30s timeout
- Dev: base URL `/api/backend` (Next.js proxy)
- Prod: `NEXT_PUBLIC_API_URL` or `/api/backend`
- Sends `Authorization: Bearer` from `sessionStorage` + `X-Client-Mac` from `deviceIdentity.ts`
- **401** on `/admin` or `/csr` → clear session → redirect `/`

### Session: `lib/session.ts`

1. Login → backend JWT
2. `setFrontendSession(token)` → httpOnly cookie + `sessionStorage` mirror
3. `dashboardPathForRole()` → `/admin`, `/manager`, or `/csr`

### CSR Data Architecture

Main dashboard (`/csr`) uses **`useCsrTabPage`** hooks:

| Hook / API | Source |
|------------|--------|
| `useCsrStats` | `GET /csr/stats` via `csrTabApiCache` |
| `useCsrTabLeads` | `GET /csr/tab-leads` (paginated per tab) |
| `usePotentialLeads` | `GET /csr/potential-leads` |

Other CSR pages use dedicated hooks + `csrApiCache`:

- `useLeadsData` → `/csr/clients`
- `useProjectsData` → `/csr/projects`
- `useBinData` → `/csr/bin`
- `useNotInterested` → `/csr/not-interested`

Legacy `useCsrDashboard` (`/csr/dashboard`) exists but main page no longer uses it.

### Admin / Manager Shared Pages

Manager routes **re-export** admin page components (including `/payments`). `useStaffBase()` / `useStaffSidebar()` switch paths between `/admin` and `/manager`. Manager sidebar omits Users and Settings.

### Key UI Patterns

- **CSR tables:** `csrTableStyles.tsx` — shared column layout
- **Column filters:** `components/table/columnFilters.tsx`
- **Notes UI:** `CommentCell.tsx` — compact `+N` chip; sticky popup with **Bold / Italic / Underline** (`**` / `*` / `__`, Ctrl+B/I/U); add/edit/delete; right-click reply; timestamps on every entry
- **Project editor:** `ProjectWorkbenchModal.tsx` — admin + CSR + technical (payment channel / currency / accounts month)
- **Payment detail cell:** `ProjectTableCells.tsx` — latest payment + **+N** expandable history (date · source · amount · currency)
- **Client history:** `ClientHistoryModal.tsx` — old client services & revenue
- **Theme:** `next-themes` + `globals.css` CSS variables
- **Staff shell:** `StaffPageShell.tsx`, `StaffMobileNav.tsx`
- **Payments dashboard:** `admin/payments/page.tsx` (+ manager re-export) — KPIs, charts, multi-currency source cards, expandable project tables
- **Accounts payroll:** `accounts/utils/payrollFormula.ts`, sales/executive editors, PF checkbox + occasional amount on all Team Salaries heads

### Lead Statuses (`csr/constants/leadStatuses.ts`)

| Status | Display | Notes |
|--------|---------|-------|
| `pending` | Pending | Default |
| `not picked` / `not completed` | Not Picked | Limit: 7 |
| `Not Interested` / `completed` | Not Interested | Limit: 3 |
| `no owner available` | No Owner | Misc tab |
| `not in service` | Not In Service | Misc tab |
| `in house` | In House | Misc tab |
| `important` | Important | + schedule fields |
| `interested` | Interested | + `interestedService` |
| `Close Client` | Close Client | Becomes active project |

---

## 9. Authentication & Sessions

### Login Flow

1. User picks portal → `/login/{admin|manager|csr}`
2. `POST /api/auth/login` with email, password, `loginRole`, optional Turnstile
3. Lockout check → CAPTCHA if needed → bcrypt verify
4. **Network access policy** evaluated (IP + `X-Client-Mac`)
5. Optional HIBP breach check
6. If 2FA → OTP email → `POST /api/auth/verify-otp`
7. JWT: `{ id, role, tv, sid }`
8. `setFrontendSession(token)` → httpOnly cookie (7 days) + sessionStorage
9. `POST /chat/status { online: true }` → redirect to dashboard

### Session Binding

- **One active session** per user (`activeSessionId` must match JWT `sid`)
- `tokenVersion` incremented on password change / logout-all
- `verifyToken` rejects: missing `sid`, version mismatch, deactivated account, failed network policy

### Per-User Network Access (`utils/networkAccess.ts`)

- **In-house:** up to 5 `allowedIps` + one `allowedMacAddress`
- **Temporary outside:** `temporaryAccessIp/Mac` with `temporaryAccessUntil` (9 or 10 hours)
- Frontend sends persistent device ID as `X-Client-Mac` (`lib/deviceIdentity.ts`)
- Enforced on login, OTP verify, and every authenticated request

---

## 10. Security

### Backend

| Control | Implementation |
|---------|----------------|
| Password hashing | bcryptjs (10 rounds) |
| JWT secret | Min 32 chars in production |
| Rate limiting | Login 15/15min; API 300/min (in-memory default) |
| Login lockout | Prisma `LoginLockout` — 8 fails / 30min |
| CAPTCHA | Cloudflare Turnstile after 3 fails |
| Password breach | Have I Been Pwned k-anonymity |
| Admin IP allowlist | `ADMIN_ALLOWED_IPS` on login + `/api/admin/*` |
| Per-user network policy | IP/MAC allowlist + temporary access |
| Portal role gate | Login role must match account role |
| Helmet + CORS | CSP (prod), HSTS, origin allowlist |
| Audit logs | `SecurityAuditLog` |
| Access history | IP, user-agent, device per login/heartbeat |
| CSR auto-deactivate | 90 days without `lastActive` |
| File upload limits | Images 5MB, Excel 15MB, PDF 10MB |
| CNIC masking | Non-admins see masked CNIC |

### Frontend

| Control | Implementation |
|---------|----------------|
| Route guard | `proxy.ts` |
| DevTools guard | `DevToolsGuard.tsx` on CSR layout |
| Session invalidation | Axios 401 interceptor |
| Device identity | `localStorage` device ID for MAC header |

---

## 11. Lead Workflow & Business Logic

### CSR Main Dashboard (`/csr`)

- Uses `/csr/stats` + `/csr/tab-leads` (paginated, DB-level filters)
- Tabs: Today, Pending, Important, Schedule, Interested, Project Won, etc.
- Client-side filters: state, timezone, phone code, upload source
- Status changes open modals (Important, Interested, Project Won, etc.)

### Potential Clients (`/csr/potential-clients`)

- `fetchPotentialLeads`: broad DB query (important OR interested), then in-memory bucket filter via `potentialClientBuckets.ts`
- Buckets: important-only, scheduled call, interested

### Not Interested / Not Picked Limits

- **Not Interested:** `notInterestedCount++` → at **3** → `inBin: true`, `binReason: limit-not-interested`
- **Not picked:** `notPickedCount++` → at **7** → bin with `limit-not-picked`
- Bin leads need manual CSR reassignment

### Bin System (`utils/binLeads.ts`)

Lead is in bin if `inBin === true` OR NP count ≥ 7 OR NI count ≥ 3.  
`buildBinWhere(csrId)` powers efficient DB queries (no full-table scan).

### Close Client → Project

- Status `Close Client` → auto `clientCode` (`{csrCode}-01`, …)
- `isOldClient` from prior won leads with same company
- Appears in Active Projects / Project DB with phases, deadlines, payments
- Payments: each entry stores `amount`, `type`, `link`, `isPaid`, `paidAt`, `createdAt`, `paymentChannel` (AH|SN|CHQ|HM), `currency` (USD|CAD|PKR), `accountsMonth` (receive month, separate from paidAt)

### Notes (all portals using LeadNote)

- **Add** → new `createdAt` → appears as latest on top
- **Edit** (CSR + Admin/Manager PUT) → **`createdAt` reset to now** → note moves to top
- Accounts dated notes: editing text bumps `date` to today and re-sorts

### Admin Leads filters ↔ tab counts

- Search, State/Province, and Area code are sent to `GET /admin/clients` and `GET /admin/clients/tab-counts`
- Capsule tab badges (Important / Schedule / Interested / Closed) update with the same filters

### Pipeline Heal

`healPipelineLeaksForCsr` dedupes won/pending conflicts — throttled to once per CSR per 2 minutes via `shouldSkipThrottledHeal`.

### Lead Shuffle (Cron)

- Midnight, then every **2 days**
- Reassigns `not completed` leads to other CSRs (round-robin)
- Max **3 shuffle attempts** → lead deleted; report saved to Cloudinary

---

## 12. Uploads & Data Import

### Admin Upload Flow (`/admin/uploads`)

1. Wizard: category, reset mode, company, source (optional), CSR selection, preview
2. `POST /api/uploads` — Excel parsed, duplicates by phone/email
3. Leads distributed round-robin to selected CSRs
4. File archived to Cloudinary

### Upload Categories

`call-data`, `new-client`, `old-client`, `interested`, `important`, `active-projects`

### CSR lead reassignment (same Uploads grid)

- Card **Reassign CSR Leads** (merged with the four Excel upload cards)
- Modal: **From CSR + page** → **To CSR(s) + page** (multi-select CSRs, equal round-robin)
- API: `POST /api/admin/leads/reassign-bulk` with `fromCsrId`, `fromPage`, `toCsrIds`, `toPage` — destination page sets status/flags so leads land on that CSR page
- Schedule destination only when source is Schedule (needs meeting date)

### Upload Source

- `name` — admin-only label
- `sudoName` — shown to CSRs as lead source

---

## 13. Chat / Messages System

### Architecture (WebSocket-first)

```
StaffPresenceInit → connectWebSocket() + startChatStatusHeartbeat()
StaffChatNotifier → initChatRealtime() → chatUnreadStore
SessionNotifierInit → also listens on same WS for auth:login_attempt
ChatPanel / TopNavbar / AdminChatPanel → UI
```

- **Only WS endpoint:** `ws://host/ws/chat` (JWT `token` query param) — also carries presence + login-attempt pushes
- **REST fallback:** polling when WS disconnected
- **Global unread:** `chatUnreadStore.ts` — WS `conversation:update` + 60s HTTP fallback
- **Gating:** `useChatEnabled()` — if `chatEnabled === false`, MessageSquare is disabled on every portal

### Access control (`backend/src/utils/chatAccess.ts`)

| Rule | Detail |
|------|--------|
| `chatEnabled` | Master off → no directory, no send, WS rejected |
| Org pools | **GPS:** `technical_manager`, `estimator` · **BEM:** `csr`, `manager`, `accounts` · **Admin** sees everyone |
| Visibility | GPS ↔ GPS + admin + accounts · Accounts bridges both orgs · BEM ↔ BEM + admin |
| `chatAllowedUserIds` | Empty = unrestricted within org rules; else can only message listed IDs |
| `chatVisibleToUserIds` | Empty = appear in others' directories; else only listed viewers see this user |
| Admin UI | Users page toggles ACL fields on `PUT /users/:id` |

### WebSocket Events (`chat/chatSocket.ts`)

Client: `ping`, `presence`, `watch`, `typing`  
Server: `message:new`, `message:edit`, `message:delete`, `message:reaction`, `message:pinned`, `conversation:update`, `read`, `presence`, `typing`, **`auth:login_attempt`** (session alert — not a chat message)

### Features

- Direct + group conversations
- Text, image, file, voice (Cloudinary, up to 200 MB)
- Reactions, replies, mentions, pin, per-user archive
- Read receipts via `lastReadAt`
- Offline queue: `chatOfflineQueue.ts` (localStorage)
- Sound + **desktop** `Notification` API: `chatSound.ts` / `chatUnreadStore` (chat only — not meetings)
- **Admin stealth:** `AdminChatPanel` → `GET /chat/admin/viewable-users` then read any viewable user's threads (not CSR-only; path uses `:userId`)

### Entry Points

| Portal | Chat UI | Notes |
|--------|---------|-------|
| Admin | `AdminChatPanel` in sidebar | Stealth + own chat |
| Manager | `ChatPanel` in sidebar | No stealth |
| CSR | `TopNavbar` `ChatPanel` or `/csr/chat` | Full-page option |
| Technical | `Sidebar` `ChatPanel` | GPS pool |
| Estimator | `Sidebar` `ChatPanel` | GPS pool |
| Accounts | `Sidebar` `ChatPanel` | Bridge both orgs |

### Key frontend libs

`chatSocket.ts`, `chatUnreadStore.ts`, `chatStatusHeartbeat.ts`, `chatApiCache.ts`, `chatOfflineQueue.ts`, `chatConversations.ts`, `chatSound.ts`, `useChatUnreadBadge.ts`, `useChatEnabled.ts`, `components/chat/ChatPanel.tsx`, `ChatActionRail.tsx`, `MessageExtras.tsx`, `StaffChatNotifier.tsx`, `ChatLayoutCleanup.tsx`

---

## 14. Notifications & Alerts

> **Not the same as Messages.** Bells/inboxes are separate from the MessageSquare unread badge. Desktop OS notifications apply to **chat** only (except CSR bell’s “Enable message notifications” CTA which grants chat permission).

### Portal matrix

| Portal | Bell / inbox | What it shows | Transport | Dismiss |
|--------|--------------|---------------|-----------|---------|
| **Admin** | Bell | Scheduled meetings + latest technical notes | `GET /admin/notifications` poll **25s** (module cache **20s**) | `notificationDismiss` localStorage; Clear-all |
| **Manager** | Bell | Scheduled meetings only (API still returns tech notes; UI ignores) | Same API; **no interval** — fetch on mount / open bell (cache **60s**) | Per-item localStorage; no Clear-all |
| **Technical** | Bell | `TechnicalNotification` inbox | `GET /admin/technical-notifications` poll **20s** when tab visible | Server `readAt` / DELETE |
| **CSR** | Bell in `TopNavbar` | Own scheduled calls + 24h CallLog stats panel | `GET /csr/notifications` (cache **60s**, no continuous poll) | localStorage for calls |
| **CSR** | Dashboard banner | `scheduledCount > 0` amber banner | From stats | React state only |
| **Estimator / Accounts** | — | No product bell | — | — |
| **All portals** | Toast (not bell) | Concurrent login attempt | `GET /auth/session-status` **10s** + WS `auth:login_attempt` | `POST /auth/session-alert/ack` |

### Shared dismiss store

- **File:** `frontend/lib/notificationDismiss.ts`
- **Key:** `localStorage` `crm_dismissed_notifications` (JSON id array)
- **Used by:** Admin, Manager, CSR meeting/tech-note IDs
- **Not used by:** TM inbox (DB), session notifier

### Admin / Manager — `GET /admin/notifications`

**Payload A — `scheduledCalls`:** leads with `status: important`, `nextSchedule >= today`, `nextTime` set (max 30). Fields: `id`, `client`, `date`, `time`, `timezone`, `csrName`, `csrCode`, `csrId`.

**Payload B — `technicalNotes`:** project leads’ latest `Lead.technicalNotes` JSON entry. Id shape `tn-${leadId}-${noteId}`. Navigate → `/admin/active-projects`. Companion stub: `PUT /admin/lead/:id/technical-notes/read`.

**UI files:** `admin/components/layout/Sidebar.tsx`, `manager/components/layout/Sidebar.tsx`.

### Technical Manager inbox — `TechnicalNotification`

| Item | Detail |
|------|--------|
| Model | `technical_notifications` — `source` (`admin`\|`estimator`\|`system`), `title`, `message`, `changeSummary`, `readAt`, `leadId`, actor fields |
| Client | `frontend/lib/technicalNotifications.ts` |
| Server | `backend/src/utils/technicalNotifications.ts` → `notifyTmFromActor` (skips if actor is TM) |
| Badge | **`unreadCount`** only |
| Open | Mark read → `/technical/revisions?project=` if title contains `"revision"`, else `/technical/active-projects?project=` |
| Mark all | `PUT .../read-all` |
| Dismiss X | `DELETE` row |

**Producers:**

| Trigger | Source | Title |
|---------|--------|-------|
| Admin/manager project field update (watched diff) | admin | `Project updated` |
| Admin request-revision | admin | `Revision requested` |
| Estimator takeoff complete | estimator | `Takeoff completed` |
| Estimator technical note | estimator | `Estimator note` |

**Watched fields** (`diffProjectChangesForTm`): phase/status, work status, deadlines (incl. Morning/COB `deadlineTiming`), title/code/scope, bid instruction, service, estimator assignments.

### CSR — `GET /csr/notifications`

```ts
{
  scheduledCalls: { id, client, date, time, timezone, status }[]; // own leads, max 20
  dailyStats: { total, byStatus, periodHours: 24 } // CallLog last 24h
}
```

- Click call → `/csr/potential-clients?leadId=&tab=schedule`
- Status chips / deep-links: `csr/constants/notificationRoutes.ts` (`getLeadPageForStatus`, badge colors)
- “View Report” → `CsrActivityReportModal`
- “Enable message notifications” → **chat** `Notification` permission (not meetings)

### Session / concurrent-login alerts

| Piece | Path |
|-------|------|
| Init | `SessionNotifierInit` in **every** portal layout |
| Hook | `useSessionNotifier.ts` + `visibleInterval` (pauses when tab hidden) |
| Persist | `LoginAttemptAlert` via `sessions.ts` |
| Emit | `notifyLoginAttempt` in `chatSocket.ts` when second device blocked |
| Email | `sendLoginAlertEmail` on successful login (`securityEmail.ts`) — separate from in-app toast |

### Messages vs Notifications (contrast)

| | Notifications (bell) | Messages (chat) |
|--|---------------------|-----------------|
| Control | Bell | MessageSquare |
| Badge | Meetings / notes / TM unread | Sum of conversation `unreadCount` |
| Transport | HTTP poll/fetch | WebSocket + 60s fallback |
| Desktop OS notifs | No | Yes (if permission) |

---

## 15. Presence, Heartbeat & Work Sessions

### Two parallel channels

| Channel | Purpose | Endpoints |
|---------|---------|-----------|
| **User online** | Admin Users “online” charts / `isOnline` | `POST /csr|/estimator/heartbeat`, `/offline`; cron auto-offline |
| **Chat presence** | Green dots in Messages | `POST /chat/status` and/or WS `presence` |

Auto-offline cron (**60s**): sets `isOnline: false` if `lastActive` > **90s**; circuit breaker on DB errors. **Does not close work sessions.**

### Work sessions (`CsrWorkSession`)

Shared by **CSR and Estimator** (`csrSessionTracking.ts`).

| Field | Meaning |
|-------|---------|
| `loginAt` / `logoutAt` | Check-in / check-out |
| `dashboardMs` / `awayMs` | Time tab visible vs hidden |
| `lastHeartbeatAt`, `lastVisible` | Heartbeat bookkeeping |
| `deviceId`, `browser`, `ip` | Device identity |
| `closedReason` | Manual / 16h auto-close / etc. |

**APIs:** `/work-session`, `/check-in`, `/check-out` on CSR + Estimator; Admin `GET /csr-session-report`, `PUT /csr-work-session/:id`.

**UI:** CSR check-in banner; Admin Reports activity hours.

### Layout bootstrapping (every staff portal)

Typically mounts: `StaffPresenceInit`, `StaffChatNotifier`, `SessionNotifierInit`, `ChatLayoutCleanup` (CSR also `DevToolsGuard` / `CsrPresenceInit`).

### Polling cheat sheet

| Interval | Where | Purpose |
|----------|-------|---------|
| 10s | `useSessionNotifier` | Login-attempt status |
| 10s | `chatSocket` | WS ping |
| 20s | TM sidebar | Technical notifications |
| 25s | Admin sidebar | Meetings + tech notes |
| 30s | CSR/Estimator heartbeat | Online + work-session |
| 30s | `chatStatusHeartbeat` | Chat presence |
| 60s | `chatUnreadStore` | Conversations if WS down |
| 60s | Server cron | Auto-offline sweep |

---

## 16. Background Jobs (Cron)

| Job | Schedule | Purpose |
|-----|----------|---------|
| Auto-offline | Every **60s** | `isOnline: false` if `lastActive` > **90s** ago; circuit breaker on DB failures; **does not close work sessions** |
| Daily report | **3:30 AM** daily | Yesterday's leads → JSON → Cloudinary → `Report` |
| Lead shuffle | Midnight, every **2 days** | Reassign not-completed leads (max attempts → delete + Cloudinary report) |
| CSR deactivation | Every **24h** + on startup | Deactivate CSRs inactive 90+ days |

Manual shuffle: `POST /api/admin/run-shuffle`

---

## 17. Caching & Performance

### Backend Cache (`utils/cache.ts`)

In-process `Map` with TTL (not Redis — per-process only).

| Key pattern | TTL | Used for |
|-------------|-----|----------|
| `admin:clients:summary` | 180s | Admin dashboard |
| `admin:clients:tab-counts` | 60s | Tab badges (unfiltered only; filtered requests bypass shared cache key) |
| `admin:clients:list:*` | 60s | Paginated leads (cache key includes search/state/phone/areaCodes) |
| `admin:bin:*` | 30s | Admin bin |
| `admin:projects:*` | 45s | Projects |
| `csr:stats:*` | 30s | CSR tab counts |
| `csr:tab:*` | 20s | Paginated tab leads |
| `csr:clients:*` | 45s | Won clients |
| `csr:bin:*` | 30s | CSR bin |
| `csr:heal-lock:*` | 120s | Throttle pipeline heal |
| Report controller | 90s / 300s | Reports endpoint |

Invalidated on mutations via `invalidateCsrLeadCaches`, `flushAdminClientsCache`, etc.

### Backend Performance Patterns

1. **Lean Prisma selects** — `CSR_DASHBOARD_LEAD_SELECT`, max 5 notes on client list
2. **DB pagination** — `/csr/tab-leads`, admin `/clients` (not full in-memory slice)
3. **`buildBinWhere`** — bin queries at DB level
4. **Cache-first reads** — clients, bin, projects skip heal on GET
5. **Throttled heartbeat DB writes** — CSR heartbeat writes at most every 30s
6. **Throttled pipeline heal** — max once per CSR per 2 min
7. **Bulk upload batching** — 1000-row inserts, 30-row updates
8. **Optional Prisma rate-limit store** — only when `RATE_LIMIT_STORE=prisma`
9. **Compound indexes** on `Lead` for tab/bin/assigned queries
10. **WebSocket push** — chat without constant HTTP polling

### Frontend Cache (`lib/`)

| Module | TTL | Endpoints |
|--------|-----|-----------|
| `authMeCache` | 60s | `/auth/me` |
| `adminSummaryCache` | 60–120s | summary, tab-counts (+ sessionStorage) |
| `csrTabApiCache` | 45s | stats, tab-leads, potential-leads |
| `csrApiCache` | 28s | clients, leads, bin, projects, NI |
| `reportsCache` | 300s | `/reports` |
| `chatApiCache` | 12–120s | conversations, messages, members |

### Polling / Heartbeat Intervals

Full matrix (notifications + presence + chat) is in [§15](#15-presence-heartbeat--work-sessions). Core repeats:

| Interval | Location | Purpose |
|----------|----------|---------|
| 10s | `useSessionNotifier` | Concurrent-login alert |
| 10s | `chatSocket.ts` | WebSocket ping |
| 20s | TM sidebar | Technical inbox |
| 25s | Admin sidebar | Meetings + tech notes |
| 30s | `useCsrPresence` / estimator heartbeat | Online + work-session |
| 30s | `chatStatusHeartbeat.ts` | `/chat/status` or WS presence |
| 60s | `chatUnreadStore.ts` | Conversation poll when WS down |

`visibleInterval.ts` pauses timers when browser tab is hidden.

### Render / Budget Hosting Notes

- Run `npx tsc` after src changes — production uses committed `dist/`
- Do **not** set `RATE_LIMIT_STORE=prisma` unless you need multi-instance rate limiting (adds DB load)
- Keep heartbeat/cron intervals at current values (60s offline, 30s presence) on $25 plans

---

## 18. External Services

| Service | Purpose | Config |
|---------|---------|--------|
| MongoDB | Primary database | `DATABASE_URL` |
| Cloudinary | Uploads, reports, profiles, CNIC, chat files | `CLOUDINARY_*` |
| Gmail SMTP | 2FA OTP, login alerts | `SMTP_USER`, `SMTP_PASS` |
| Cloudflare Turnstile | Login CAPTCHA | `TURNSTILE_SECRET_KEY` |
| Have I Been Pwned | Password breach check | Public API |

---

## 19. Environment Variables

### Backend (`.env`)

| Variable | Required (prod) | Description |
|----------|-----------------|-------------|
| `PORT` | No | Default 5000 |
| `DATABASE_URL` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes (≥32 chars) | JWT signing |
| `FRONTEND_URL` | Yes | CORS + cookies |
| `NODE_ENV` | No | `production` enables strict checks |
| `SMTP_USER` / `SMTP_PASS` | Recommended | 2FA email |
| `ADMIN_ALLOWED_IPS` | Optional | Comma-separated admin IPs |
| `TURNSTILE_SECRET_KEY` | Optional | Turnstile verify |
| `TURNSTILE_SITE_KEY` | Optional | Returned by `/auth/captcha-config` |
| `RATE_LIMIT_STORE` | Optional | Set `prisma` for distributed rate limit (default: in-memory) |
| `SESSION_DEFAULT_HOURS` | Optional | Default 12 |
| `SESSION_REMEMBER_HOURS` | Optional | Default 168 (7 days) |
| `SESSION_STALE_MS` | Optional | Stale session / OTP timing |
| `BUSINESS_TIMEZONE` | Optional | Business calendar |
| `BUSINESS_DAY_START_HOUR` | Optional | Business day boundary |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Yes | Cloudinary |

### Frontend

| Variable | Description |
|----------|-------------|
| `BACKEND_URL` | Server-side proxy target (default `http://127.0.0.1:5000`) |
| `NEXT_PUBLIC_BACKEND_URL` | Used by proxy / WS URL derivation when set |
| `NEXT_PUBLIC_API_URL` | Direct API URL (optional) |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL (optional; defaults derived from API) |
| `NEXT_DIST_DIR` | Optional custom Next.js dist dir |

---

## 20. Local Development

```bash
# Terminal 1 — Backend
cd backend
npm install
# Create .env: DATABASE_URL, JWT_SECRET, FRONTEND_URL, CLOUDINARY_*
npx prisma generate
npx prisma db push
npm run dev          # http://localhost:5000

# Terminal 2 — Frontend
cd frontend
npm install
# .env.local: BACKEND_URL=http://127.0.0.1:5000
npm run dev          # http://localhost:3000
```

**Login:** `admin@gmail.com` / `manager@gmail.com` / `csr@gmail.com` — password `123456`

**After backend src changes for production parity:**
```bash
cd backend && npx tsc
```

---

## 21. Deployment Notes

| Component | Typical host | Start command |
|-----------|--------------|---------------|
| Frontend | Vercel | `next build && next start` |
| Backend | Render ($25 plan) | `npm start` → `node dist/server.js` |

**Backend build** (`package.json`): `prisma generate && prisma db push && tsc && seed`

**Checklist:**
- `FRONTEND_URL` on backend must match deployed frontend origin
- `BACKEND_URL` on frontend must point to backend
- Rebuild `dist/` before pushing backend changes
- Run `npx prisma db push` when schema changes (network access fields, indexes)
- WebSocket must be reachable at `/ws/chat` on same host (or set `NEXT_PUBLIC_WS_URL`)

---

## 22. Every Dashboard - Sources & Merges

This section is the **full inventory**: every portal page, where data is loaded from, and where it is merged/synced into another module.

**Route count:** Admin 9 · Manager 7 (re-exports) · CSR 8 · Technical 6 · Estimator 2 · Accounts 10 (incl. 4 payroll redirects) ≈ **42 pages**.

### 22.1 Cross-cutting merges (read this first)

```
Project DB (Lead.projectPayments)
        │
        ├─► Payments dashboard (read-only summary)
        │
        └─► Accounts currency tabs (AH/SN/CHQ/HM × USD/CAD/PKR)
              syncAccountsCurrencyForDates on project save + Accounts GET

Team Salaries (income statement)
        ├─► Provident Fund heads     (payrollPfSync)
        ├─► Loan heads / loan ledger (payrollLoan* sync)
        └─► Head amounts             (payrollAmountSync + salesPayrollBridge)

LeadNote CRUD
        └─► CommentCell / noteHistory (LeadNote + legacy comments/followUpNotes)
              PUT edit bumps createdAt → latest on top

CSR pipeline reads
        └─► healPipelineLeaksForCsr (throttled ~2 min / CSR)
```

| Merge | From → To | Trigger | Code |
|-------|-----------|---------|------|
| Payments → Accounts currency | `projectPayments` → Accounts dashboard tabs | Admin/Manager project save; Accounts dashboard GET | `projectCurrencyCollections.ts` |
| Payments dashboard | Same JSON → KPIs / sources / lists | Page load / refresh | `paymentsSummary.ts` |
| Payroll PF | Employee PF → Provident Fund heads | Income statement recompute/save | `payrollPfSync.ts` |
| Payroll loans | Salary loan fields ↔ loan heads ↔ ledger | Income statement + `/accounts/payroll-loans*` | `payrollLoanSync`, `payrollLoanHeadsSync` |
| Payroll amounts | Formula net (incl. occasional) → sub-head `amount` | Income statement load/edit | `payrollAmountSync.ts` |
| Sales payroll bridge | Sales / TL JSON → Team Salaries rows | Income statement normalize | `salesPayrollBridge.ts` |
| Currency formula revenue | Dashboard currency tabs → IS revenue | IS + monthly reports | `currencyFormula.ts` |
| Notes merge | `LeadNote` + legacy strings | CommentCell / lists | `noteHistory.ts` |
| Technical notes | Separate `technicalNotes` JSON | TM / Admin / Estimator | `technicalEstimators.ts` |
| Pipeline heal | Won/pending conflict cleanup | CSR stats/list (throttled) | `leadClientPromotion.ts` |
| Upload interested merge | Same phone/CSR on Excel upload | Upload POST | `upload.controller` |
| Won client split | New vs old identity | CSR clients page | `splitWonClientsByIdentity` |

### 22.2 Shared UI (used on multiple dashboards)

| Component | Path | Used on |
|-----------|------|---------|
| `ProjectWorkbenchModal` | `components/projects/ProjectWorkbenchModal.tsx` | Admin/Manager Project DB, CSR clients & projects, Technical |
| `CommentCell` | `csr/components/shared/CommentCell.tsx` | Admin leads/projects, CSR, Technical, Estimator |
| `ProjectTableCells` (+ payment **+N** history) | `components/projects/ProjectTableCells.tsx` | Admin/CSR/Technical/Estimator tables |
| `csrTableStyles` | `csr/components/shared/csrTableStyles.tsx` | Admin, CSR, Technical, Estimator |
| State / area-code filters | CSR shared + `lib/stateLocationFilter` | Admin leads/bin/projects, CSR, Technical |
| `CapsuleTabs` | `components/CapsuleTabs.tsx` | Admin, CSR, Technical, Estimator |
| `ChatPanel` / `AdminChatPanel` | `components/chat/*`, `admin/.../AdminChatPanel` | All portals (Admin stealth) |
| `StaffChatNotifier` / `StaffPresenceInit` / `SessionNotifierInit` | `components/*` | All staff layouts |
| `RechartsBox` | `components/charts/RechartsBox.tsx` | Admin reports/users, Accounts, TM/Estimator dashboards |
| `ThemeProvider` / `ThemeToggle` | theme components | Root layout |
| Payments page | `admin/payments/page.tsx` | Admin + Manager re-export |
| `useStaffSidebar` / `useStaffBase` | `hooks/*` | Admin vs Manager path switching |

### 22.3 Payment JSON shape (single source of truth)

Stored on **`Lead.projectPayments`**. Parsers: `backend/.../projectPayments.ts`, `frontend/lib/projectFields.ts`.

| Field | Meaning |
|-------|---------|
| `id` | Stable row id |
| `type` | **Partial** / **Full** only (Full auto when collection ≥ 100%; legacy Milestone/Final/Other still display until changed) |
| `amount` | Collected amount |
| `link` | Slip URL (Admin/Manager) — **clickable in +N history popup** |
| `isPaid` | Collected flag |
| `paidAt` | **Specific payment date** (workbench date picker; drives Accounts month) |
| `createdAt` | Row history timestamp |
| `paymentChannel` | AH · SN · CHQ · HM |
| `currency` | USD · CAD · PKR (multi-currency per source) |
| `accountsMonth` | **Receive / Accounts month** (`YYYY-MM`, derived from `paidAt` day) |

Project DB payment filter: **Partial** (`0 < % < 100`) / **Full** (`% ≥ 100`) via `matchesPaymentCollectionFilter` / `paymentTypeDisplay`.

---

### 22.4 Admin (`/admin/*`)

#### `/admin` — Dashboard
- **File:** `admin/page.tsx`
- **Source:** `GET /admin/clients/summary` via `lib/adminSummaryCache` (+ widgets: Top Estimators, CSRs)
- **Shows:** KPI tiles (**Total Leads** + **Pending** non-clickable; **Important** where Online CSR was; **Total Completed** = all-time CSR status updates via `CallLog`; **Today Completed Calls** = today’s CallLog); chart (**Today / Pending** range label) + **Top 5 Estimators**; recent activity; top CSR performers — **no Project DB preview**
- **Merge:** Summary cache / sessionStorage; stale broadcast after users/leads mutations
- **Backend:** `adminSummaryStats.ts` · widget `TopEstimatorsWidget.tsx`

#### `/admin/leads`
- **File:** `admin/leads/page.tsx`
- **Source:** `GET /admin/clients` (view/page/search/state/phone/areaCodes/**csr**); `GET /admin/clients/tab-counts` (**same filters incl. csr**); `GET /admin/csrs`; lead CRUD/notes/reassign
- **Shows:** Tabs Important / Schedule / Interested / Closed; generic search across client/company/phone/email/project/notes/CSR/status; Closed status label **Closed** (not “Not Interested” for `completed`)
- **Merge:** Tab **counts follow CSR + search filters**; notes via CommentCell (`createdAt` bump on edit; delete sticky via `deletedNoteIdsRef`)
- **Backend:** `adminClientQueries.ts`, `adminSummaryStats.ts`

#### `/admin/active-projects` (Project DB)
- **File:** `admin/active-projects/page.tsx`
- **Source:** `GET /admin/projects` (paged); project CRUD; notes; reassign; phone lookup; technical-notes read; **`PUT /admin/project/:id/mark-completed`**
- **Excel:** **`GET /admin/projects/excel-template`** (all table + workbench + payment1–5 columns + Instructions sheet); **`POST /admin/projects/excel-upload`** (multipart `file`) — bulk import historical projects (any deadline / `createdAt` date)
- **Shows:** Tabs **All / Active / Completed**; search by **project name / client name / project code**; payment filter **Partial | Full**; Code/title/client/phase/deadline/quoted/paid/**+N full history popup (clickable links)**/CSR/technical status/notes; header **Template** + **Upload Excel**
- **Final → Completed:** When status is **Final Submission**, Admin sees **Complete** → sets `projectWorkStatus`/`status` completed, `hiddenOnTechnical: true` (drops from TM), lands in **Completed** tab
- **Merge:** **On save → Accounts currency** (`syncAccountsCurrencyForDates`); phone lookup autofill; Excel upload also syncs paid payment months
- **UI:** `ProjectWorkbenchModal` (channel / currency / **payment date** / slip link; auto **Full** at 100%)
- **Util:** `backend/src/utils/projectDbExcel.ts` · `frontend/lib/projectFields.ts`

#### `/admin/payments`
- **File:** `admin/payments/page.tsx` · **Lib:** `lib/paymentsSummary.ts`
- **Source:** `GET /admin/payments-summary?month=`
  - **Quoted (month):** this-month collected + still-due (includes unpaid/partial with no payment this month)
  - **Collected:** payments in selected month only
  - **Outstanding:** remaining after all-time payments (never re-opens prior-month halves)
  - **Collection rate:** collected ÷ quoted
- **Shows:** Quoted/collected/outstanding; status donut; source bars; **AH/SN/CHQ/HM cards with USD·CAD·PKR separate**; Full/Partial/Unpaid expandable tables (proj code, client, email, link, status, amount, payment date, source, receive date, **+N**)
- **Merge:** Read-only from `projectPayments` (write path = Project DB save). **Collected** buckets by payment month; split halves stay in their months; **outstanding uses all-time paid %** (prior-month half is not false outstanding)
- **Backend:** `paymentsSummary.ts`

#### `/admin/uploads`
- **File:** `admin/uploads/page.tsx`
- **Source:** upload-sources, trades, CSRs, `POST /uploads`, history/latest/delete, **`POST /admin/leads/reassign-bulk`**
- **Shows:** Five-card grid (New / Important / **Reassign CSR Leads** / Interested / Active), wizard, preview, CSR distribution, history
- **Merge:** Interested-by-phone consolidate on upload (`upload.controller`); reassign = From CSR+page → To CSR(s)+page

#### `/admin/reports`
- **File:** `admin/reports/page.tsx`
- **Source:** `GET /reports`; CSR history; CSR session report; session edit
- **Shows:** Period KPIs, CSR activity hours
- **Merge:** `reportsCache`; session reconcile backend

#### `/admin/bin`
- **File:** `admin/bin/page.tsx`
- **Source:** `GET /admin/bin`; reassign
- **Shows:** Binned leads + reason (NI/NP/…)
- **Merge:** Same `binLeads` rules as CSR

#### `/admin/users` (Admin only)
- **File:** `admin/users/page.tsx`
- **Source:** `/users` CRUD; upload-pic/cnic; access-history; CSR leads reset
- **Shows:** Roles (CSR/Manager/Accounts/Admin/TM/Estimator), codes, online charts, **CNIC number + PDF preview**
- **Merge:** CNIC upload as Cloudinary image/pdf; legacy raw → Docs viewer

#### `/admin/settings` (Admin only)
- **File:** `admin/settings/page.tsx`
- **Source:** `/auth/me`, profile, password, 2FA, audit-logs, logout-all
- **Shows:** Profile + security audit

---

### 22.5 Manager (`/manager/*`) — re-exports Admin

| Item | Detail |
|------|--------|
| Pages | Same as Admin except **no** Users / Settings |
| Paths | `useStaffBase()` → `/manager`; proxy blocks `/admin/*` for manager role |
| Chat | Regular `ChatPanel` — **no** Admin stealth panel |
| Notifications | Meetings bell only (see [§14](#14-notifications--alerts)) |
| APIs | Most `/api/admin/*` with `allowRoles(admin, manager[, TM])` |
| Admin-only | User CRUD, access-history, CSR purge/reset, shuffle run, migrate-notes, report-uploads |

| Route | Re-exports |
|-------|------------|
| `/manager` | `admin/page` |
| `/manager/leads` | `admin/leads/page` |
| `/manager/active-projects` | `admin/active-projects/page` |
| `/manager/payments` | `admin/payments/page` |
| `/manager/uploads` | `admin/uploads/page` |
| `/manager/reports` | `admin/reports/page` |
| `/manager/bin` | `admin/bin/page` |

---

### 22.6 CSR (`/csr/*`)

#### `/csr` — Call Data main
- **Source:** `GET /csr/stats`, `GET /csr/tab-leads`; mutations `PUT /csr/lead/:id`, notes
- **Hooks:** `useCsrStats`, `useCsrTabLeads`, `useLeadActions` + `csrTabApiCache`
- **Shows:** Today/Pending/Important/… tabs; client/phone/company/status/notes/schedule
- **Merge:** Pipeline heal on stats; notes merge; cache invalidate on actions

#### `/csr/potential-clients`
- **Source:** `GET /csr/potential-leads`, stats; lead updates / bin
- **Shows:** Important / Schedule / Interested buckets
- **Merge:** `potentialClientBuckets`

#### `/csr/clients`
- **Source:** `GET /csr/clients`; lead/project create; notes; phone lookup
- **Shows:** Won clients new vs old; payment circle; workbench payments
- **Merge:** Identity split; notes; payments JSON (Accounts sync on Admin save path)

#### `/csr/active-projects`
- **Source:** `GET /csr/projects`; lead update; notes; project create
- **Shows:** Phase, deadlines, budget, payment status, notes
- **UI:** `ProjectWorkbenchModal`, `CommentCell`

#### `/csr/not-interested`
- **Source:** `GET /csr/not-interested`; status/assign/notes
- **Shows:** NI/NP counts, follow-ups
- **Merge:** Limits NI=3 / NP=7 → bin (`binLeads`)

#### `/csr/bin`
- **Source:** `GET /csr/bin`; restore `inBin: false`
- **Shows:** Reason categories, charts

#### `/csr/chat`
- **Source:** `/chat/*` REST + WebSocket `/ws/chat` — see [§13](#13-chat--messages-system)
- **Merge:** Conversation list merge/dedupe; unread store; presence heartbeat; ACL via `chatAccess`

#### `/csr/settings`
- **Source:** `/auth/me`, toggle 2FA

**Shell:** `POST /csr/heartbeat`, `/csr/offline`; **Messages** + **Notifications bell** ([§14](#14-notifications--alerts) — `GET /csr/notifications`); check-in work session ([§15](#15-presence-heartbeat--work-sessions)); `SessionNotifierInit`

---

### 22.7 Technical (`/technical/*`)

#### `/technical` — Dashboard
- **Source:** `GET /admin/projects?technicalView=1&excludeRevisions=1`; previous-month ratings
- **Shows:** Stats cards; **project-mix pie + workflow-stage bar charts**; top performers; nav cards; recent projects

#### `/technical/active-projects`
- **Source:** Admin projects (technicalView); estimators; assign/takeoff/pricing/final/return/QA; technical-notes; hide
- **Shows:** Assignments, scopes, workflow, technical notes, deadlines
- **Merge:** Same Project DB as Admin; `technicalNotes` thread; deep-link `?project=`
- **Hide rules:** `hiddenOnTechnical` **or** `projectWorkStatus`/`status` = completed (Admin Mark Completed)
- **UI:** `ProjectWorkbenchModal`, `AssignEstimatorsModal`, `CommentCell`

#### `/technical/revisions`
- Same page inner with `variant="revisions"` / revisions-only filter

#### `/technical/kpi`
- **Source:** KPI records CRUD; KPI auto; monitoring
- **Shows:** Pipeline health, scoreboard, KPI entries
- **Backend:** `technicalKpiRecords`, monitoring builder

#### `/technical/team`
- **Source:** monitoring + ratings
- **Shows:** Per-estimator workload, timers, hours, overdue

#### `/technical/reports`
- **Source:** Composed monitoring + KPI auto + revision projects
- **Shows:** Monthly charts, stars, hours, Word export

**Shell:** Messages (`ChatPanel`) + **project inbox** ([§14](#14-notifications--alerts) — `/admin/technical-notifications*`); `SessionNotifierInit`

---

### 22.8 Estimator (`/estimator/*`)

#### `/estimator`
- **Source:** `GET /estimator/dashboard`; previous-month rating
- **Shows:** Assigned / pending / takeoff done / overdue; **assignment-mix pie + workload bar**; stars; recent

#### `/estimator/my-projects`
- **Source:** `GET /estimator/projects`; notes; timer; complete
- **Shows:** Scopes, timer, man-hours, notes, takeoff complete
- **Merge:** Timers → TM monitoring; notes via estimator API

**Shell:** work-session check-in/out; `/estimator/heartbeat|/offline`

---

### 22.9 Accounts (`/accounts/*`)

Shared: **`useAccountsPage`** → `GET/PUT /accounts/:page/:date`, uploads.

#### `/accounts` — Currency dashboard
- **Source:** `page: "dashboard"`; summary; FX rates
- **Shows:** AH/SN/CHQ/HM × USD/CAD/PKR; rates; formula book
- **Merge:** **Live overlay of Project DB payments** (`applyCollectionsToDashboardData`); currency formula

#### `/accounts/income-statement`
- **Source:** `income_statement` day record; dashboard date for revenue; budget APIs; payroll loans
- **Shows:** Revenue, **Team Salaries** (all heads), OPEX, PF, loans, budget vs actual
- **Merge:** PF sync · loan sync · amount/occasional sync · sales bridge · executive commission base · currency formula revenue
- **Payroll detail:** Apply PF (8%) + Occasional on Technical / Sales / Sales Lead / Tech Manager / Email Marketing / Admin / Executive

#### `/accounts/balance-sheet`
- **Source:** `balance_sheet` day record — assets / equity / liabilities + notes

#### `/accounts/cash-flow-statement`
- **Source:** `cash_flow` — bank debit/credit rows, net

#### `/accounts/total-assets`
- **Source:** `total_assets` — register sections + proof uploads

#### `/accounts/reports`
- **Source:** monthly report generate/save
- **Merge:** Revenue from currency formula across month days

#### Legacy redirects → income-statement
`/accounts/csr-payroll`, `sales-team-payroll`, `sales-team-lead-payroll`, `technical-team-payroll`

---

### 22.10 Data-flow cheat sheet

| User action | Lands in | Also updates |
|-------------|----------|--------------|
| CSR Close Client | Project DB / CSR projects | clientCode, isOldClient |
| Admin saves payment (channel+currency+month) | `Lead.projectPayments` | Accounts currency tabs for that month; Payments dashboard on next load |
| Add 2nd/3rd payment | Same JSON array | Project DB **+N** history; Payments expand table |
| Edit Lead note | `LeadNote.createdAt` now | Latest note on top everywhere CommentCell is used |
| Edit salary PF / occasional | Income statement day JSON | Head total + PF heads (on sync) |
| TM assigns estimator | `technicalAssignments` | Estimator my-projects + TM monitoring |
| TM Final Submission | `projectPhase: qa_phase` | Admin Project DB Final Submission + **Complete** button |
| Admin Mark Completed | `projectWorkStatus` + `hiddenOnTechnical` | TM list removes project; Admin **Completed** tab |
| Project DB Excel upload | New Project DB leads (any `createdAt` / deadline) | Accounts currency sync for paid months |
| Estimator starts timer | Assignment timer fields | Technical team / KPI monitoring |
| Estimator takeoff / note | `TechnicalNotification` row | TM sidebar inbox |
| Admin revision request | `needsRevision` + TM inbox | TM Revisions tab |
| Concurrent login blocked | `LoginAttemptAlert` + WS | Session toast on all portals |
| Excel upload interested | Leads for CSRs | Phone merge for same CSR |

---

## 23. Quick Reference

| Concern | File |
|---------|------|
| DB schema | `backend/prisma/schema.prisma` |
| Server + cron | `backend/src/server.ts` |
| Express app | `backend/src/app.ts` |
| WebSocket chat | `backend/src/chat/chatSocket.ts` |
| Chat ACL (org pools) | `backend/src/utils/chatAccess.ts` |
| Notifications (TM inbox) | `backend/src/utils/technicalNotifications.ts`, `frontend/lib/technicalNotifications.ts` |
| Notification dismiss (local) | `frontend/lib/notificationDismiss.ts` |
| Session login-attempt toast | `frontend/lib/useSessionNotifier.ts`, `SessionNotifierInit` |
| Work sessions | `backend/src/utils/csrSessionTracking.ts` |
| Auth middleware | `backend/src/middleware/auth.middleware.ts` |
| Network access | `backend/src/utils/networkAccess.ts` |
| Bin logic | `backend/src/utils/binLeads.ts` |
| CSR tab queries | `backend/src/utils/csrDashboardQueries.ts` |
| Admin client filters / tab counts | `backend/src/utils/adminClientQueries.ts`, `adminSummaryStats.ts` |
| Payments summary API | `backend/src/utils/paymentsSummary.ts` |
| Project payment JSON | `backend/src/utils/projectPayments.ts`, `frontend/lib/projectFields.ts` |
| Mark project completed (Admin) | `PUT /admin/project/:id/mark-completed` → hide TM + Completed tab |
| Project DB Excel template/upload | `backend/src/utils/projectDbExcel.ts` · `GET/POST /admin/projects/excel-*` |
| Upload parser | `backend/src/controllers/upload.controller.ts` |
| Portal picker | `frontend/app/page.tsx` |
| Login form | `frontend/app/components/auth/LoginPortalForm.tsx` |
| API client | `frontend/lib/api.ts` |
| Device ID header | `frontend/lib/deviceIdentity.ts` |
| Route guard | `frontend/proxy.ts` |
| Backend proxy | `frontend/app/api/backend/[...path]/route.ts` |
| CSR main page | `frontend/app/csr/page.tsx` |
| CSR tab hooks | `frontend/app/csr/hooks/useCsrTabPage.ts` |
| Notes UI | `frontend/app/csr/components/shared/CommentCell.tsx` |
| Admin users + CNIC | `frontend/app/admin/users/page.tsx` |
| Admin leads (filtered counts) | `frontend/app/admin/leads/page.tsx` |
| Admin / Manager payments | `frontend/app/admin/payments/page.tsx` |
| Project DB workbench | `frontend/app/components/projects/ProjectWorkbenchModal.tsx` |
| Accounts payroll | `frontend/app/accounts/utils/payrollFormula.ts` |
| Technical sidebar | `frontend/app/technical/components/layout/Sidebar.tsx` |
| Chat panel | `frontend/app/components/chat/ChatPanel.tsx` |
| Admin stealth chat | `frontend/app/admin/components/layout/AdminChatPanel.tsx` |
| Admin notification bell | `frontend/app/admin/components/layout/Sidebar.tsx` |
| Manager notification bell | `frontend/app/manager/components/layout/Sidebar.tsx` |
| CSR notification bell | `frontend/app/csr/components/navigation/TopNavbar.tsx` |
| CSR notification deep-links | `frontend/app/csr/constants/notificationRoutes.ts` |
| Manager sidebar | `frontend/app/manager/components/layout/Sidebar.tsx` |
| Lead statuses | `frontend/app/csr/constants/leadStatuses.ts` |

---

*End of documentation.*
