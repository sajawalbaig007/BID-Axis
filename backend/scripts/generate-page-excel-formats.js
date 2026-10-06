/**
 * Page-wise Excel upload formats — each CSR page has DIFFERENT columns.
 * Saves to Desktop only (no CRM app UI changes).
 * Run: node scripts/generate-page-excel-formats.js
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const os = require("os");

const outDir = path.join(os.homedir(), "Desktop", "CRM-Excel-Formats-By-Page");
fs.mkdirSync(outDir, { recursive: true });

/* ── helpers ─────────────────────────────────────────────── */
function sheetFromRows(headers, rows) {
  const data = rows.map(r => {
    const o = {};
    for (const h of headers) o[h] = r[h] ?? "";
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map(h => ({
    wch: Math.max(16, h.length + 2, ...data.map(r => String(r[h] ?? "").length + 2)),
  }));
  return ws;
}

function guideSheet(columns) {
  const ws = XLSX.utils.json_to_sheet(
    columns.map(c => ({
      Column: c.name,
      Required: c.required,
      "Shows On Page As": c.showsAs,
      "What To Put": c.what,
      "Also Accepts": c.also || "—",
    }))
  );
  ws["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 48 }, { wch: 36 }];
  return ws;
}

function infoSheet(meta, steps, tips) {
  const rows = [
    { Field: "CRM Page", Value: meta.page },
    { Field: "Upload Box (Admin)", Value: meta.upload },
    { Field: "After Upload Status", Value: meta.status },
    { Field: "What This File Is For", Value: meta.purpose },
    { Field: "", Value: "" },
    ...steps.map((s, i) => ({ Field: `Step ${i + 1}`, Value: s })),
    { Field: "", Value: "" },
    ...tips.map((t, i) => ({ Field: `Tip ${i + 1}`, Value: t })),
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [{ wch: 24 }, { wch: 78 }];
  return ws;
}

function writeWorkbook(file, sheets) {
  const wb = XLSX.utils.book_new();
  for (const { name, ws } of sheets) {
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const outPath = path.join(outDir, file);
  XLSX.writeFile(wb, outPath);
  console.log("Created:", outPath);
}

/* ═══════════════════════════════════════════════════════════
   01 — CALL DATA / TODAY LINKS
   Today's fresh leads only — NO Notes (CSR adds notes while calling)
═══════════════════════════════════════════════════════════ */
{
  const headers = [
    "Client Name",
    "Client Company",
    "Phone",
    "Email",
    "State",
  ];
  const samples = [
    {
      "Client Name": "John Smith",
      "Client Company": "JC Air Conditioning",
      Phone: "2145550100",
      Email: "john@jcair.com",
      State: "Texas",
    },
    {
      "Client Name": "Maria Garcia",
      "Client Company": "Sunrise Builders",
      Phone: "5125550199",
      Email: "maria@sunrise.com",
      State: "Austin, TX",
    },
  ];
  writeWorkbook("01-Call-Data-Today-Links.xlsx", [
    { name: "Call Data", ws: sheetFromRows(headers, samples) },
    {
      name: "Column Guide",
      ws: guideSheet([
        { name: "Client Name", required: "Yes*", showsAs: "Client Name", what: "Person to call today", also: "Name, Contact Name, Customer" },
        { name: "Client Company", required: "No", showsAs: "Company (detail)", what: "Their company / business name", also: "Company, Business Name" },
        { name: "Phone", required: "Yes*", showsAs: "Phone (+ timezone)", what: "Mobile / office — min 7 digits", also: "Mobile, Cell, Number" },
        { name: "Email", required: "No", showsAs: "Email (detail)", what: "Optional email", also: "Mail, E-mail" },
        { name: "State", required: "No", showsAs: "Filter / location", what: "City, state, or region", also: "Location, City, Address" },
      ]),
    },
    {
      name: "How to Upload",
      ws: infoSheet(
        {
          page: "CSR → Call Data / Today Links",
          upload: "Admin → Upload New Leads → Call Data",
          status: "pending (today's call queue)",
          purpose: "Today's fresh leads only. Contact info — NO Notes, NO Service, NO Client Code.",
        },
        [
          "Fill Call Data sheet (delete sample rows first)",
          "Admin → Upload & Distribute Leads → Upload New Leads",
          "Choose Call Data → pick company + CSRs → upload this file",
          "Leads appear on CSR Call Data page as Pending",
        ],
        [
          "* Each row needs Client Name OR Phone (7+ digits).",
          "NO Notes column — CSRs write notes themselves while calling.",
          "NO Interested Service / Client Code / Project Detail on this file.",
        ]
      ),
    },
  ]);
}

/* ═══════════════════════════════════════════════════════════
   02 — POTENTIAL → IMPORTANT
   Page columns: Client Name | Phone | Notes | Status | Our Company | Action
═══════════════════════════════════════════════════════════ */
{
  const headers = [
    "Client Name",
    "Client Company",
    "Phone",
    "Email",
    "State",
    "Notes",
  ];
  const samples = [
    {
      "Client Name": "Sarah Lee",
      "Client Company": "Premier Plumbing",
      Phone: "4695550188",
      Email: "sarah@premierplumb.com",
      State: "Dallas, TX",
      Notes: "Known VIP — always follow up same day. Prefers morning calls.",
    },
    {
      "Client Name": "David Park",
      "Client Company": "Park Mechanical",
      Phone: "9725550133",
      Email: "",
      State: "Plano, TX",
      Notes: "Old contact from 2024 — asked to keep on important list",
    },
  ];
  writeWorkbook("02-Potential-Clients-Important.xlsx", [
    { name: "Important", ws: sheetFromRows(headers, samples) },
    {
      name: "Column Guide",
      ws: guideSheet([
        { name: "Client Name", required: "Yes*", showsAs: "Client Name", what: "Priority / known contact name", also: "Name, Contact Name" },
        { name: "Client Company", required: "No", showsAs: "Company", what: "Their business name", also: "Company" },
        { name: "Phone", required: "Yes*", showsAs: "Phone", what: "Must dial number", also: "Mobile, Cell" },
        { name: "Email", required: "No", showsAs: "Email", what: "Optional", also: "Mail" },
        { name: "State", required: "No", showsAs: "Location", what: "City / state", also: "Location, City" },
        { name: "Notes", required: "Recommended", showsAs: "Notes", what: "Why they are important + past conversation", also: "Comments, History, Talk" },
      ]),
    },
    {
      name: "How to Upload",
      ws: infoSheet(
        {
          page: "CSR → Potential Clients → Important tab",
          upload: "Admin → Previous Important Clients",
          status: "important",
          purpose: "Old / known / VIP contacts that must stay on the Important list — not fresh cold leads.",
        },
        [
          "Put previous important clients + Notes (why important / last talk)",
          "Admin → Previous Important Clients → upload this file",
          "Appears on Potential Clients → Important",
        ],
        [
          "Notes are the main value here — CSRs open Notes popup to see past talk.",
          "No Interested Service column — that belongs on the Interested file.",
          "No Client Code — codes are for Clients / Active Projects pages.",
        ]
      ),
    },
  ]);
}

/* ═══════════════════════════════════════════════════════════
   03 — POTENTIAL → INTERESTED
   Page columns: Client Name | Phone | Interested In | Notes | Status | Our Company
═══════════════════════════════════════════════════════════ */
{
  const headers = [
    "Client Name",
    "Client Company",
    "Phone",
    "Email",
    "State",
    "Interested Service",
    "Notes",
  ];
  const samples = [
    {
      "Client Name": "Mike Johnson",
      "Client Company": "BuildRight LLC",
      Phone: "5125550177",
      Email: "mike@buildright.com",
      State: "Austin, TX",
      "Interested Service": "Estimating",
      Notes: "Wants residential framing takeoff — call back Monday 10am",
    },
    {
      "Client Name": "Lisa Wong",
      "Client Company": "Wong Electric",
      Phone: "7135550166",
      Email: "lisa@wongelectric.com",
      State: "Houston, TX",
      "Interested Service": "Shop Drawing",
      Notes: "Interested in electrical shop drawings for school project",
    },
  ];
  writeWorkbook("03-Potential-Clients-Interested.xlsx", [
    { name: "Interested", ws: sheetFromRows(headers, samples) },
    {
      name: "Column Guide",
      ws: guideSheet([
        { name: "Client Name", required: "Yes*", showsAs: "Client Name", what: "Lead name", also: "Name, Contact Name" },
        { name: "Client Company", required: "No", showsAs: "Company", what: "Business name", also: "Company" },
        { name: "Phone", required: "Yes*", showsAs: "Phone", what: "Contact number", also: "Mobile, Cell" },
        { name: "Email", required: "No", showsAs: "Email", what: "Optional", also: "Mail" },
        { name: "State", required: "No", showsAs: "Location", what: "City / state", also: "Location, City" },
        {
          name: "Interested Service",
          required: "Yes (recommended)",
          showsAs: "Interested In column",
          what: "What they want — Estimating, Scheduling, Shop Drawing, Drafting, BIM, or IT",
          also: "Service, Interested In, Scope",
        },
        { name: "Notes", required: "Recommended", showsAs: "Notes", what: "What you discussed + next step", also: "Comments, Conversation, Talk" },
      ]),
    },
    {
      name: "How to Upload",
      ws: infoSheet(
        {
          page: "CSR → Potential Clients → Interested tab",
          upload: "Admin → Interested Clients",
          status: "interested",
          purpose: "Leads who already showed interest in a service — Interested In column is the key difference from Important.",
        },
        [
          "Fill Interested Service (this shows as “Interested In” on the page)",
          "Add Notes with past conversation",
          "Admin → Interested Clients → upload",
          "Schedule Call tab: set date/time manually in CRM after upload",
        ],
        [
          "Services used in CRM: Estimating | Scheduling | Shop Drawing | Drafting | BIM | IT",
          "You can also write free text (e.g. HVAC Estimating) — it still shows in Interested In.",
          "No Client Code / Project Detail here — move to Clients when project is won.",
        ]
      ),
    },
  ]);
}

/* ═══════════════════════════════════════════════════════════
   04 — CLIENTS → NEW CLIENTS
   Page columns: Code | Client | Company | Phone | Sub Contacts | Email | Service | Latest Note
   History (Eye): Total Business, Projects count, Project History — built from phone match
═══════════════════════════════════════════════════════════ */
{
  const headers = [
    "Client Name",
    "Client Company",
    "Phone",
    "Email",
    "State",
    "Interested Service",
    "Client Code",
    "Project Detail",
    "Quotation",
    "Notes",
  ];
  const samples = [
    {
      "Client Name": "Alex Turner",
      "Client Company": "Turner Electric",
      Phone: "7135550166",
      Email: "alex@turnerelectric.com",
      State: "Houston, TX",
      "Interested Service": "Estimating",
      "Client Code": "TE-001",
      "Project Detail": "First commercial electrical estimate — Westside Plaza",
      Quotation: "3200",
      Notes: "First project closed — new client. Upfront discussed.",
    },
    {
      "Client Name": "Nina Patel",
      "Client Company": "Patel Construction",
      Phone: "4695550144",
      Email: "nina@patelconst.com",
      State: "Frisco, TX",
      "Interested Service": "Drafting",
      "Client Code": "PC-001",
      "Project Detail": "Residential drafting package — Lot 12",
      Quotation: "1800",
      Notes: "Won first job after 3 calls",
    },
  ];
  writeWorkbook("04-Clients-New.xlsx", [
    { name: "New Clients", ws: sheetFromRows(headers, samples) },
    {
      name: "Column Guide",
      ws: guideSheet([
        { name: "Client Name", required: "Yes*", showsAs: "Client", what: "Won client name (first-time)", also: "Name, Contact Name" },
        { name: "Client Company", required: "No", showsAs: "Company", what: "Company column", also: "Company" },
        { name: "Phone", required: "Yes*", showsAs: "Phone", what: "Used for history lookup (Eye button)", also: "Mobile, Cell" },
        { name: "Email", required: "No", showsAs: "Email", what: "Email column", also: "Mail" },
        { name: "State", required: "No", showsAs: "Detail / TZ", what: "Location", also: "Location, City" },
        { name: "Interested Service", required: "Recommended", showsAs: "Service", what: "Service column on Clients page", also: "Service, Interested In" },
        { name: "Client Code", required: "Recommended", showsAs: "Code column", what: "Unique code for this first project (e.g. TE-001)", also: "Project Code, ClientCode" },
        { name: "Project Detail", required: "Recommended", showsAs: "History → Project title", what: "What project they won — shows in project history", also: "Project Title, Project Name" },
        { name: "Quotation", required: "No", showsAs: "Quotation in detail", what: "Quote / budget amount (numbers only, no $)", also: "Quote, Budget" },
        { name: "Notes", required: "No", showsAs: "Latest Note", what: "Closing notes — shows as Latest Note + Notes history", also: "Comments, Remarks" },
      ]),
    },
    {
      name: "How to Upload",
      ws: infoSheet(
        {
          page: "CSR → Clients → New Clients tab",
          upload: "Admin → Upload New Leads → Clients → New Client",
          status: "Close Client (first-time won)",
          purpose: "FIRST-TIME won clients only (1 project so far). Code + Service + Notes show on Clients page. Eye button shows project history by phone.",
        },
        [
          "Use only for clients who just won their FIRST project",
          "Fill Client Code (shows in Code column) + Project Detail + Quotation",
          "Interested Service → shows as Service column",
          "Notes → shows as Latest Note",
          "Admin → Upload New Leads → Clients → New Client → upload",
        ],
        [
          "New vs Old is also based on how many won projects share the same phone/company.",
          "Same phone with 2+ won projects → client moves to Old Clients tab automatically.",
          "Project history (how many projects, total business) opens via Eye icon — needs Phone.",
          "Sub Contacts are added later inside CRM (not via Excel).",
        ]
      ),
    },
  ]);
}

/* ═══════════════════════════════════════════════════════════
   05 — CLIENTS → OLD CLIENTS
   Same page columns as New, but repeat clients — history matters more
═══════════════════════════════════════════════════════════ */
{
  const headers = [
    "Client Name",
    "Client Company",
    "Phone",
    "Email",
    "State",
    "Interested Service",
    "Client Code",
    "Project Detail",
    "Quotation",
    "Notes",
    "Projects Done",
  ];
  const samples = [
    {
      "Client Name": "John Smith",
      "Client Company": "JC Air Conditioning",
      Phone: "2145550100",
      Email: "john@jcair.com",
      State: "Texas",
      "Interested Service": "Estimating",
      "Client Code": "JC-003",
      "Project Detail": "3rd project — Commercial HVAC Dallas office expansion",
      Quotation: "5200",
      Notes: "Repeat client — previous 2 projects paid on time. Prefers email quotes.",
      "Projects Done": "2 previous + this one",
    },
    {
      "Client Name": "Maria Garcia",
      "Client Company": "Sunrise Builders",
      Phone: "5125550199",
      Email: "maria@sunrise.com",
      State: "Austin, TX",
      "Interested Service": "BIM",
      "Client Code": "SB-205",
      "Project Detail": "Repeat BIM coordination — Phase 2 apartments",
      Quotation: "7500",
      Notes: "Old client since 2023 — always asks for BIM + Estimating bundle",
      "Projects Done": "4 previous projects",
    },
  ];
  writeWorkbook("05-Clients-Old.xlsx", [
    { name: "Old Clients", ws: sheetFromRows(headers, samples) },
    {
      name: "Column Guide",
      ws: guideSheet([
        { name: "Client Name", required: "Yes*", showsAs: "Client", what: "Returning / repeat client name", also: "Name" },
        { name: "Client Company", required: "No", showsAs: "Company", what: "Company", also: "Company" },
        { name: "Phone", required: "Yes*", showsAs: "Phone + History", what: "SAME phone as before so Eye history links all projects", also: "Mobile, Cell" },
        { name: "Email", required: "No", showsAs: "Email", what: "Email", also: "Mail" },
        { name: "State", required: "No", showsAs: "Location", what: "City / state", also: "Location" },
        { name: "Interested Service", required: "Recommended", showsAs: "Service", what: "Service for THIS latest project", also: "Service, Interested In" },
        { name: "Client Code", required: "Recommended", showsAs: "Code", what: "NEW unique code for this latest project (not old codes)", also: "Project Code" },
        { name: "Project Detail", required: "Recommended", showsAs: "History list", what: "Latest project title — appears in project history", also: "Project Title, Project Name" },
        { name: "Quotation", required: "No", showsAs: "Quotation", what: "Latest quote amount (numbers only)", also: "Quote, Budget" },
        { name: "Notes", required: "Recommended", showsAs: "Latest Note", what: "Relationship notes + past talk summary", also: "Comments, History, Talk" },
        {
          name: "Projects Done",
          required: "No (reference only)",
          showsAs: "Not imported",
          what: "Optional reminder for you — how many projects before. CRM builds real history from Phone.",
          also: "—",
        },
      ]),
    },
    {
      name: "How to Upload",
      ws: infoSheet(
        {
          page: "CSR → Clients → Old Clients tab",
          upload: "Admin → Upload New Leads → Clients → Old Client",
          status: "Close Client + isOldClient (returning)",
          purpose: "REPEAT clients (2+ projects). Phone must match previous records so Eye → Project History shows all past projects + total business.",
        },
        [
          "Use for clients who already worked with you before",
          "Keep the SAME Phone as their earlier projects (history depends on it)",
          "Give a NEW Client Code for the latest project",
          "Fill Project Detail + Quotation + Notes (relationship history)",
          "Projects Done column is only for your reference — CRM does not import it",
          "Admin → Upload New Leads → Clients → Old Client → upload",
        ],
        [
          "Eye button on Clients page = Project History (count, total business, each project).",
          "That history is built automatically from matching Phone — not from Projects Done column.",
          "Old Clients tab shows the LATEST project row; older ones stay in history.",
          "If you upload as New by mistake, CRM may still move them to Old when phone has 2+ wins.",
        ]
      ),
    },
  ]);
}

/* ═══════════════════════════════════════════════════════════
   06 — ACTIVE PROJECTS
   Page columns: Client Detail | Project Detail | Quoted | Payment | Fulfillment | Notes
═══════════════════════════════════════════════════════════ */
{
  const headers = [
    "Client Name",
    "Client Company",
    "Phone",
    "Email",
    "State",
    "Interested Service",
    "Client Code",
    "Project Detail",
    "Quotation",
    "Notes",
  ];
  const samples = [
    {
      "Client Name": "John Smith",
      "Client Company": "JC Air Conditioning",
      Phone: "2145550100",
      Email: "john@jcair.com",
      State: "Texas",
      "Interested Service": "Estimating",
      "Client Code": "1000-01",
      "Project Detail": "Commercial HVAC — Dallas office takeoff",
      Quotation: "4500",
      Notes: "In progress — takeoff due Friday. Client wants weekly update.",
    },
    {
      "Client Name": "Maria Garcia",
      "Client Company": "Sunrise Builders",
      Phone: "5125550199",
      Email: "maria@sunrise.com",
      State: "Austin, TX",
      "Interested Service": "BIM",
      "Client Code": "1000-02",
      "Project Detail": "Apartment Phase 2 — BIM coordination",
      Quotation: "8900",
      Notes: "Kickoff done. Waiting on architectural files.",
    },
  ];
  writeWorkbook("06-Active-Projects.xlsx", [
    { name: "Active Projects", ws: sheetFromRows(headers, samples) },
    {
      name: "Column Guide",
      ws: guideSheet([
        { name: "Client Name", required: "Yes", showsAs: "Client Detail", what: "Person name inside Client Detail cell", also: "Name, Contact Name" },
        { name: "Client Company", required: "Recommended", showsAs: "Client Detail", what: "Company line in Client Detail", also: "Company" },
        { name: "Phone", required: "Recommended", showsAs: "Client Detail", what: "Phone line in Client Detail", also: "Mobile, Cell" },
        { name: "Email", required: "No", showsAs: "Client Detail", what: "Email line", also: "Mail" },
        { name: "State", required: "No", showsAs: "Project region", what: "Region under project", also: "Location, City" },
        { name: "Interested Service", required: "Recommended", showsAs: "Project Detail", what: "Service under project", also: "Service, Scope" },
        { name: "Client Code", required: "Yes (unique)", showsAs: "Project Detail badge", what: "Unique project code — same code again UPDATES that project", also: "Project Code, ClientCode" },
        { name: "Project Detail", required: "Yes", showsAs: "Project Detail title", what: "Project title / description", also: "Project Title, Project Name" },
        { name: "Quotation", required: "Recommended", showsAs: "Quoted column", what: "Budget / quote (numbers only, no $)", also: "Quote, Budget" },
        { name: "Notes", required: "No", showsAs: "Notes", what: "Work notes — shows in Notes column", also: "Comments, Remarks" },
      ]),
    },
    {
      name: "How to Upload",
      ws: infoSheet(
        {
          page: "CSR → Active Projects",
          upload: "Admin → Active Projects",
          status: "Close Client + project fields (in progress / completed by deadline)",
          purpose: "Live projects with Client Code + Project Detail + Quotation. Payment & Fulfillment are managed inside CRM after upload.",
        },
        [
          "Fill Client Code (unique), Project Detail, Quotation for every row",
          "Same Client Code again = updates that existing project (does not create duplicate)",
          "Admin → Active Projects → upload",
          "Payment Detail + Fulfillment (phase / deadlines) are set later in the project workbench",
        ],
        [
          "Client Detail on page = Company + Name + Phone + Email from this sheet.",
          "Project Detail on page = Client Code + Project Detail + Service + State.",
          "Quoted = Quotation column.",
          "Do not put payment amounts in Excel — add payments inside Active Projects modal.",
        ]
      ),
    },
  ]);
}

/* ── README index ────────────────────────────────────────── */
const indexPath = path.join(outDir, "00-README-Which-File-For-Which-Page.txt");
fs.writeFileSync(
  indexPath,
  `CRM Excel Formats — Har Page Ka Alag Format
============================================

01-Call-Data-Today-Links.xlsx
   Page: Call Data / Today Links (today's fresh leads)
   Columns: Client Name, Company, Phone, Email, State
   NO Notes (CSR adds while calling)
   NO Interested Service, NO Client Code, NO Project

02-Potential-Clients-Important.xlsx
   Page: Potential Clients → Important
   Columns: Client Name, Company, Phone, Email, State, Notes
   Focus: VIP / known contacts + past talk in Notes
   NO Interested Service, NO Client Code

03-Potential-Clients-Interested.xlsx
   Page: Potential Clients → Interested
   Columns: + Interested Service (shows as “Interested In”)
   Notes = conversation; Schedule Call date set in CRM

04-Clients-New.xlsx
   Page: Clients → New Clients
   Columns: + Client Code (Code column), Project Detail, Quotation, Service, Notes
   First-time won clients only
   Eye button = project history (needs Phone)

05-Clients-Old.xlsx
   Page: Clients → Old Clients
   Same as New + optional “Projects Done” (reference only, not imported)
   Repeat clients — SAME Phone so history links all projects
   NEW Client Code for latest project
   Eye → how many projects, total business, project list

06-Active-Projects.xlsx
   Page: Active Projects
   Columns: Client Code + Project Detail + Quotation required
   Page shows: Client Detail | Project Detail | Quoted | Payment | Fulfillment | Notes
   Payment / Fulfillment managed inside CRM after upload

Uploads all go through Admin → Upload & Distribute Leads.

Generated: ${new Date().toLocaleString()}
`,
  "utf8"
);
console.log("Created:", indexPath);
console.log(`\nAll files saved to:\n${outDir}`);
