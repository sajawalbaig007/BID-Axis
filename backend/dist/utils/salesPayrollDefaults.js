"use strict";
/** Sales team payroll defaults — Hammad (Team Lead) + Sales Team members */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROJECT_SLABS = void 0;
exports.defaultSalesPayrollData = defaultSalesPayrollData;
exports.normalizeSalesPayrollData = normalizeSalesPayrollData;
exports.PROJECT_SLABS = [
    { key: "0-1000", label: "$0 – $1,000", rate: 0.03 },
    { key: "1001-3000", label: "$1,001 – $3,000", rate: 0.035 },
    { key: "3001-5000", label: "$3,001 – $5,000", rate: 0.04 },
    { key: "5001-10000", label: "$5,001 – $10,000", rate: 0.045 },
    { key: "10001+", label: "$10,001+", rate: 0.05 },
];
function rid(prefix, n) {
    return `${prefix}-${n}`;
}
function salesMember(id, name, code, basic, allowance) {
    return {
        id,
        name,
        code,
        role: "sales",
        basic,
        allowance,
        commission: {
            oldClientProjects: 0,
            oldClientPartialCount: 0,
            newClientProjects: 0,
            fixClientProjects: [],
        },
        assignedToLead: false,
        assignedTeamLeadId: null,
        checkIn: "18:00",
        lateDeductionOverride: null,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        loanTotal: 0,
        loanPaid: 0,
        loanThisMonth: 0,
        incomeTax: 0,
        remarks: "",
    };
}
function defaultSalesPayrollData() {
    const hammadId = "stl-hammad";
    return {
        salesTeamLeads: [
            {
                ...salesMember(hammadId, "Hammad", "STL-01", 0, 0),
                role: "team_lead",
                basic: 0,
                allowance: 0,
            },
        ],
        salesTeamMembers: [
            salesMember("sal-huraira", "Huraira", "SAL-01", 0, 0),
            salesMember("sal-faris", "Faris", "SAL-02", 0, 0),
            salesMember("sal-ali", "Ali", "SAL-03", 0, 0),
            salesMember("sal-faizan", "Faizan", "SAL-04", 0, 0),
            salesMember("sal-asim", "Asim", "SAL-05", 0, 0),
            salesMember("sal-anam", "Anam", "SAL-06", 0, 0),
        ].map(m => ({ ...m, assignedTeamLeadId: null })),
    };
}
function normalizeSalesPayrollData(raw) {
    const base = defaultSalesPayrollData();
    if (!raw || typeof raw !== "object")
        return base;
    const o = raw;
    return {
        salesTeamMembers: Array.isArray(o.salesTeamMembers) && o.salesTeamMembers.length > 0
            ? o.salesTeamMembers
            : base.salesTeamMembers,
        salesTeamLeads: Array.isArray(o.salesTeamLeads) && o.salesTeamLeads.length > 0
            ? o.salesTeamLeads
            : base.salesTeamLeads,
    };
}
