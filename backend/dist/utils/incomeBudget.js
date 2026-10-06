"use strict";
/**
 * Income Statement → 3-month budget helpers (server).
 * Sales salaries are split from commission. Technical overtime is listed separately
 * but the Technical Team actual is the full Income Statement net (OT included).
 * OPEX = head totals only (no sub-heads). Loans / PF are excluded.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_OPEX_HEAD_LABELS = exports.CORE_BUDGET_LINE_DEFS = void 0;
exports.emptyCoreActuals = emptyCoreActuals;
exports.budgetKeyForTeamTitle = budgetKeyForTeamTitle;
exports.opexSubKey = opexSubKey;
exports.opexHeadKey = opexHeadKey;
exports.accumulateCoreBudget = accumulateCoreBudget;
exports.collectOpexHeadAmounts = collectOpexHeadAmounts;
exports.accumulateOpexHeads = accumulateOpexHeads;
exports.collectOpexSubAmounts = collectOpexSubAmounts;
exports.accumulateOpexSubs = accumulateOpexSubs;
exports.quarterMonths = quarterMonths;
const salesPayrollFormula_1 = require("./salesPayrollFormula");
exports.CORE_BUDGET_LINE_DEFS = [
    { key: "revenue", label: "Total Revenue" },
    { key: "sales", label: "Sales Team (incl. Team Lead)" },
    { key: "sales_commission", label: "Sales Team Commission (incl. Team Lead)" },
    { key: "technical", label: "Technical Team (incl. Manager)" },
    { key: "technical_overtime", label: "Technical Overtime (incl. Manager)" },
    { key: "email_marketing", label: "Email Marketing" },
    { key: "administration", label: "Administration" },
    { key: "executive", label: "Executive" },
    { key: "other_payroll", label: "Other Team Salaries" },
];
function emptyCoreActuals() {
    return {
        revenue: 0,
        sales: 0,
        sales_commission: 0,
        technical: 0,
        technical_overtime: 0,
        email_marketing: 0,
        administration: 0,
        executive: 0,
        other_payroll: 0,
    };
}
function budgetKeyForTeamTitle(teamTitle) {
    const t = teamTitle.trim().toLowerCase();
    if (t.includes("email"))
        return "email_marketing";
    if (t.includes("sales"))
        return "sales";
    if (t.includes("technical"))
        return "technical";
    if (t.includes("admin"))
        return "administration";
    if (t.includes("executive"))
        return "executive";
    return "other_payroll";
}
function opexSubKey(headLabel, subLabel) {
    return `opex::${headLabel.trim()}::${subLabel.trim()}`;
}
/** One budget/actual line per OPEX head (sub-heads rolled up). */
function opexHeadKey(headLabel) {
    return `opex_head::${headLabel.trim()}`;
}
function lineTotal(row) {
    if (row.subHeads && row.subHeads.length > 0) {
        return row.subHeads.reduce((a, s) => a + (Number(s.amount) || 0), 0);
    }
    return Number(row.amount ?? row.totalSalary) || 0;
}
function salesEmpFromSub(teamTitle, sub) {
    const sp = sub.salesPayroll;
    const role = sp?.role === "team_lead" || /lead/i.test(teamTitle) ? "team_lead" : "sales";
    const name = String(sp?.name || sub.label || "").trim();
    if (!sp && !name)
        return null;
    return {
        id: String(sp?.id || sub.id || name || "sales"),
        name: name || String(sp?.name || ""),
        code: String(sp?.code ?? ""),
        role,
        basic: Number(sp?.basic) || 0,
        allowance: Number(sp?.allowance) || 0,
        homeAllowance: Number(sp?.homeAllowance) || 0,
        fuelAllowance: Number(sp?.fuelAllowance) || 0,
        medicalAllowance: Number(sp?.medicalAllowance) || 0,
        commission: {
            oldClientProjects: Number(sp?.commission?.oldClientProjects) || 0,
            oldClientPartialCount: Number(sp?.commission?.oldClientPartialCount) || 0,
            newClientProjects: Number(sp?.commission?.newClientProjects) || 0,
            fixClientProjects: sp?.commission?.fixClientProjects ?? [],
        },
        assignedToLead: !!sp?.assignedToLead,
        assignedTeamLeadId: sp?.assignedTeamLeadId ?? null,
        checkIn: String(sp?.checkIn || "18:00"),
        lateDeductionOverride: sp?.lateDeductionOverride ?? null,
        paidLeaveDays: Number(sp?.paidLeaveDays) || 0,
        unpaidLeaveDays: Number(sp?.unpaidLeaveDays) || 0,
        loanTotal: Number(sp?.loanTotal) || 0,
        loanPaid: Number(sp?.loanPaid) || 0,
        loanThisMonth: Number(sp?.loanThisMonth) || 0,
        incomeTax: Number(sp?.incomeTax) || 0,
        remarks: String(sp?.remarks ?? ""),
    };
}
function tlExtraForLead(lead, salesPeers, opts) {
    const leadId = String(lead.id || "").trim();
    return salesPeers
        .filter(p => {
        if (!p.assignedToLead)
            return false;
        const tid = String(p.assignedTeamLeadId || "").trim();
        if (!tid)
            return /hammad/i.test(lead.name) || /lead/i.test(lead.role);
        return tid === leadId;
    })
        .reduce((sum, p) => sum + (0, salesPayrollFormula_1.calcTlAssignedCommission)(p, opts), 0);
}
function isTechnicalManagerPerson(teamTitle, subLabel) {
    const t = teamTitle.trim().toLowerCase();
    const l = String(subLabel ?? "").trim().toLowerCase();
    if (t.includes("technical manager") || t.includes("tech manager"))
        return true;
    return (l.includes("technical manager") ||
        l.includes("tech manager") ||
        l.includes("tech mgr") ||
        l.includes("(technical mgr)"));
}
function techTimeToMinutes(t) {
    if (!t || !/^\d{1,2}:\d{2}$/.test(String(t).trim()))
        return null;
    const [h, m] = String(t).trim().split(":").map(Number);
    if (h < 0 || h > 23 || m < 0 || m > 59)
        return null;
    return h * 60 + m;
}
/** Same late slabs as Income Statement (tech team 07:00 · manager 09:00). */
function incomeStatementLateDeduction(daySalary, checkIn, checkOut, override, shiftStartHour) {
    if (override != null && Number.isFinite(override) && override >= 0)
        return Number(override) || 0;
    const inMin = techTimeToMinutes(checkIn);
    const outMin = techTimeToMinutes(checkOut);
    if (inMin == null)
        return 0;
    const start = shiftStartHour * 60;
    const reliefEnd = start + 30;
    const quarterEnd = start + 60;
    const thirdEnd = start + 120;
    if (inMin <= reliefEnd)
        return 0;
    if (outMin != null) {
        const worked = outMin >= inMin ? outMin - inMin : outMin + 24 * 60 - inMin;
        if (worked >= 9 * 60)
            return 0;
    }
    if (inMin < quarterEnd)
        return daySalary / 4;
    if (inMin < thirdEnd)
        return daySalary / 3;
    return daySalary / 2;
}
/**
 * Income Statement Technical / Manager net + OT.
 * Mirrors frontend computeSalary (all allowance lines, cash loan, manager late 09:00).
 */
function incomeStatementTechnicalFromSalary(sal, lateShiftHour) {
    if (!sal)
        return { totalSalary: 0, totalOvertime: 0 };
    const basic = Number(sal.basic) || 0;
    const allowance = (Number(sal.allowance) || 0) +
        (Number(sal.homeAllowance) || 0) +
        (Number(sal.fuelAllowance) || 0) +
        (Number(sal.medicalAllowance) || 0);
    const travel = Number(sal.travelAllowance) || 0;
    const monthlySalary = basic + allowance + travel;
    const daySalary = basic / 30;
    const hour = monthlySalary / 30 / 8;
    const weekday = Number(sal.weekdayOtHours) || 0;
    const weekend = Number(sal.weekendOtHours) || 0;
    const totalOvertime = weekday * hour * 1.5 + weekend * hour * 2;
    const totalEarning = monthlySalary + totalOvertime;
    const lateOverride = sal.lateDeductionOverride == null || String(sal.lateDeductionOverride) === ""
        ? null
        : Number(sal.lateDeductionOverride);
    const late = incomeStatementLateDeduction(daySalary, String(sal.checkIn ?? ""), String(sal.checkOut ?? ""), lateOverride, lateShiftHour);
    const unpaidLeaveDeduction = (Number(sal.unpaidLeaveDays) || 0) * daySalary;
    const loanThisMonth = Number(sal.loanThisMonth) || 0;
    const loanFromSalary = String(sal.loanPaymentMode ?? "salary") === "cash" ? 0 : loanThisMonth;
    const pf = sal.pfAuto !== false ? basic * 0.08 : Number(sal.pfOverride) || 0;
    const incomeTax = Number(sal.incomeTax) || 0;
    const occasional = Math.max(0, Number(sal.occasionalAmount) || 0);
    const totalSalary = totalEarning - late - unpaidLeaveDeduction - loanFromSalary - pf - incomeTax + occasional;
    return { totalSalary, totalOvertime };
}
function accumulateCoreBudget(data, into, revenue, recordDate) {
    into.revenue += revenue;
    const teams = data.teamSalaries ?? [];
    const opts = { recordDate };
    const salesPeers = [];
    for (const team of teams) {
        if (budgetKeyForTeamTitle(String(team.team ?? "")) !== "sales")
            continue;
        if (/lead/i.test(String(team.team ?? "")))
            continue;
        for (const sub of team.subHeads ?? []) {
            const emp = salesEmpFromSub(String(team.team ?? ""), sub);
            if (emp)
                salesPeers.push(emp);
        }
    }
    for (const team of teams) {
        const key = budgetKeyForTeamTitle(String(team.team ?? ""));
        const total = lineTotal(team);
        if (key === "sales") {
            let commission = 0;
            const title = String(team.team ?? "");
            for (const sub of team.subHeads ?? []) {
                const emp = salesEmpFromSub(title, sub);
                if (!emp)
                    continue;
                const extra = emp.role === "team_lead" ? tlExtraForLead(emp, salesPeers, opts) : 0;
                const b = (0, salesPayrollFormula_1.computeSalesEmployeePayroll)(emp, extra, opts);
                commission += (Number(b.totalCommission) || 0) + extra;
            }
            commission = Math.max(0, commission);
            into.sales_commission += commission;
            into.sales += Math.max(0, total - commission);
            continue;
        }
        if (key === "technical") {
            const title = String(team.team ?? "");
            const subs = team.subHeads ?? [];
            let overtime = 0;
            let net = 0;
            if (subs.length === 0) {
                net = total;
            }
            else {
                for (const sub of subs) {
                    if (!sub.salary) {
                        net += Number(sub.amount) || 0;
                        continue;
                    }
                    const shift = isTechnicalManagerPerson(title, sub.label) ? 9 : 7;
                    const b = incomeStatementTechnicalFromSalary(sub.salary, shift);
                    net += b.totalSalary;
                    overtime += b.totalOvertime;
                }
            }
            into.technical_overtime += Math.max(0, overtime);
            // Full IS team total (OT already inside net). Do not subtract — OT is its own row.
            into.technical += Math.max(0, net);
            continue;
        }
        into[key] += total;
    }
}
/** Default OPEX heads (same as Income Statement seed) — always listed in budget even at 0. */
exports.DEFAULT_OPEX_HEAD_LABELS = [
    "Office Management Expenses",
    "IT Equipments Expenses",
    "Regular IT Expenses",
    "Outsourcing Expenses",
    "Asset Purchasing Expenses",
    "Miscellaneous Expenses",
];
/** Collect OPEX head totals (all sub-heads summed into the head). Includes 0-amount heads. */
function collectOpexHeadAmounts(data) {
    const out = [];
    const heads = data.opexHeads ?? [];
    for (const head of heads) {
        const headLabel = String(head.label ?? "").trim() || "OPEX";
        const subs = head.subHeads ?? [];
        const amt = subs.length > 0
            ? subs.reduce((a, s) => a + (Number(s.amount) || 0), 0)
            : Number(head.amount) || 0;
        out.push({
            key: opexHeadKey(headLabel),
            headLabel,
            label: headLabel,
            amount: amt,
        });
    }
    return out;
}
function accumulateOpexHeads(data, into) {
    for (const row of collectOpexHeadAmounts(data)) {
        const prev = into[row.key];
        if (prev) {
            prev.amount += row.amount;
        }
        else {
            into[row.key] = { ...row };
        }
    }
}
/** @deprecated Prefer collectOpexHeadAmounts — kept for any legacy callers. */
function collectOpexSubAmounts(data) {
    return collectOpexHeadAmounts(data).map(h => ({
        key: h.key,
        headLabel: h.headLabel,
        subLabel: h.headLabel,
        label: h.label,
        amount: h.amount,
    }));
}
function accumulateOpexSubs(data, into) {
    for (const row of collectOpexSubAmounts(data)) {
        const prev = into[row.key];
        if (prev) {
            prev.amount += row.amount;
        }
        else {
            into[row.key] = { ...row };
        }
    }
}
function quarterMonths(quarterId) {
    const m = /^(\d{4})-Q([1-4])$/.exec(quarterId.trim());
    if (!m) {
        const now = new Date();
        const y = now.getUTCFullYear();
        const q = Math.ceil((now.getUTCMonth() + 1) / 3);
        return quarterMonths(`${y}-Q${q}`);
    }
    const y = Number(m[1]);
    const q = Number(m[2]);
    const startM = (q - 1) * 3 + 1;
    const months = [0, 1, 2].map(i => `${y}-${String(startM + i).padStart(2, "0")}`);
    return { startMonth: months[0], endMonth: months[2], months };
}
