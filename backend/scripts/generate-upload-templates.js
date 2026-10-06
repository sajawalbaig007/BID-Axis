/**
 * Generates Excel upload templates for the admin Uploads page.
 * Each category has columns that match what Admin should fill.
 * Run: node scripts/generate-upload-templates.js
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "../../frontend/public/upload-templates");
fs.mkdirSync(outDir, { recursive: true });

function writeTemplate({ file, sheet, headers, samples, instructions }) {
  const wb = XLSX.utils.book_new();
  const data = samples.map(r => {
    const o = {};
    for (const h of headers) o[h] = r[h] ?? "";
    return o;
  });
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  ws["!cols"] = headers.map(h => ({
    wch: Math.max(h.length, ...data.map(r => String(r[h] ?? "").length)) + 2,
  }));
  XLSX.utils.book_append_sheet(wb, ws, sheet);

  const instrData = instructions.map((line, i) => ({
    Step: i + 1,
    Instruction: line,
  }));
  const wsInstr = XLSX.utils.json_to_sheet(instrData);
  wsInstr["!cols"] = [{ wch: 6 }, { wch: 78 }];
  XLSX.utils.book_append_sheet(wb, wsInstr, "How to Use");

  const outPath = path.join(outDir, file);
  XLSX.writeFile(wb, outPath);
  console.log("Created:", outPath);
}

const TRADES_INSTRUCTION =
  "Trades: write names only — no numbers (Concrete, HVAC, Plumbing). New names are added automatically.";

const TEMPLATES = [
  {
    file: "CRM-Call-Data-Template.xlsx",
    sheet: "Call Data",
    headers: ["Client Name", "Client Company", "Phone", "Email", "State", "Sub Contacts", "Trades", "Sub Trades"],
    samples: [
      {
        "Client Name": "John Smith",
        "Client Company": "JC Air Conditioning",
        Phone: "2145550100",
        Email: "john@jcair.com",
        State: "Texas",
        "Sub Contacts": "Jane Doe | Manager | 2145550198 | jane@jcair.com",
        Trades: "HVAC, Plumbing",
        "Sub Trades": "Ductwork, Fixtures",
      },
      {
        "Client Name": "Maria Garcia",
        "Client Company": "Sunrise Builders",
        Phone: "5125550199",
        Email: "maria@sunrise.com",
        State: "Austin, TX",
      },
    ],
    instructions: [
      "Admin upload: Upload New Leads → Call Data",
      "CSR page: Call Data / Today Links (today's fresh leads)",
      "Put: Client Name, Client Company, Phone, Email, State, Sub Contacts, Trades, Sub Trades",
      TRADES_INSTRUCTION,
      "Multiple subcontacts / subtrades: separate with commas. Subcontact fields: Name | designation | phone | email",
      "NO Notes column — CSRs add notes while calling",
      "NO Interested Service / Client Code / Project",
      "Required: Client Name OR Phone (7+ digits)",
      "Delete sample rows before upload",
    ],
  },
  {
    file: "CRM-Important-Clients-Template.xlsx",
    sheet: "Important",
    headers: ["Client Name", "Client Company", "Phone", "Email", "State", "Notes", "Sub Contacts", "Trades", "Sub Trades"],
    samples: [
      {
        "Client Name": "Sarah Lee",
        "Client Company": "Premier Plumbing",
        Phone: "4695550188",
        Email: "sarah@premierplumb.com",
        State: "Dallas, TX",
        Notes: "VIP — prefer morning calls. Known since 2023.",
        Trades: "Plumbing",
        "Sub Trades": "Fixtures",
      },
    ],
    instructions: [
      "Admin upload: Previous Important Clients",
      "CSR page: Potential Clients → Important",
      "Put: Name, Company, Phone, Email, State, Notes (why important / past talk)",
      TRADES_INSTRUCTION,
      "NO Interested Service or Client Code",
      "Delete sample rows before upload",
    ],
  },
  {
    file: "CRM-Interested-Clients-Template.xlsx",
    sheet: "Interested",
    headers: [
      "Client Name",
      "Client Company",
      "Phone",
      "Email",
      "State",
      "Interested Service",
      "Notes",
      "Sub Contacts",
      "Trades",
      "Sub Trades",
    ],
    samples: [
      {
        "Client Name": "Mike Johnson",
        "Client Company": "BuildRight LLC",
        Phone: "5125550177",
        Email: "mike@buildright.com",
        State: "Austin, TX",
        "Interested Service": "Estimating",
        Notes: "Wants residential takeoff — call Monday",
      },
    ],
    instructions: [
      "Admin upload: Interested Clients",
      "CSR page: Potential Clients → Interested (Interested In column)",
      "Put: Name, Company, Phone, Email, State, Interested Service, Notes",
      TRADES_INSTRUCTION,
      "Services: Estimating, Scheduling, Shop Drawing, Drafting, BIM, IT",
      "Delete sample rows before upload",
    ],
  },
  {
    file: "CRM-New-Clients-Template.xlsx",
    sheet: "New Clients",
    headers: [
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
      "Sub Contacts",
      "Trades",
      "Sub Trades",
    ],
    samples: [
      {
        "Client Name": "Alex Turner",
        "Client Company": "Turner Electric",
        Phone: "7135550166",
        Email: "alex@turnerelectric.com",
        State: "Houston, TX",
        "Interested Service": "Estimating",
        "Client Code": "TE-001",
        "Project Detail": "First commercial electrical estimate",
        Quotation: "3200",
        Notes: "First project closed — new client",
      },
    ],
    instructions: [
      "Admin upload: Upload New Leads → Clients → New Client",
      "CSR page: Clients → New Clients",
      "Put: Name, Company, Phone, Email, State, Service, Client Code, Project Detail, Quotation, Notes",
      TRADES_INSTRUCTION,
      "Client Code → Code column | Service → Service | Notes → Latest Note",
      "First-time won clients only",
      "Delete sample rows before upload",
    ],
  },
  {
    file: "CRM-Old-Clients-Template.xlsx",
    sheet: "Old Clients",
    headers: [
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
      "Sub Contacts",
      "Trades",
      "Sub Trades",
    ],
    samples: [
      {
        "Client Name": "John Smith",
        "Client Company": "JC Air Conditioning",
        Phone: "2145550100",
        Email: "john@jcair.com",
        State: "Texas",
        "Interested Service": "Estimating",
        "Client Code": "JC-003",
        "Project Detail": "3rd project — Commercial HVAC expansion",
        Quotation: "5200",
        Notes: "Repeat client — previous projects paid on time",
      },
    ],
    instructions: [
      "Admin upload: Upload New Leads → Clients → Old Client",
      "CSR page: Clients → Old Clients",
      "Same columns as New Clients",
      TRADES_INSTRUCTION,
      "Use SAME Phone as earlier projects (history / Eye button)",
      "NEW Client Code for the latest project",
      "Delete sample rows before upload",
    ],
  },
  {
    file: "CRM-Active-Projects-Template.xlsx",
    sheet: "Active Projects",
    headers: [
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
      "Sub Contacts",
      "Trades",
      "Sub Trades",
    ],
    samples: [
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
        Notes: "In progress — takeoff due Friday",
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
        Notes: "Kickoff done — waiting on files",
      },
    ],
    instructions: [
      "Admin upload: Active Projects",
      "CSR page: Active Projects",
      "Put: Name, Company, Phone, Email, State, Service, Client Code, Project Detail, Quotation, Notes",
      TRADES_INSTRUCTION,
      "Client Code unique — same code updates existing project",
      "Payment & Fulfillment set inside CRM after upload",
      "Delete sample rows before upload",
    ],
  },
];

for (const t of TEMPLATES) writeTemplate(t);
console.log(`\nDone — ${TEMPLATES.length} templates in ${outDir}`);
