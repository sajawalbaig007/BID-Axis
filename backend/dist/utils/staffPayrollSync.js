"use strict";
/**
 * Sync Admin → All Employees payroll assignments into Income Statement team heads.
 * SubHead ids are stable: staff-emp-{staffEmployeeId}
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCOUNTS_PAYROLL_HEADS = void 0;
exports.isAccountsPayrollHead = isAccountsPayrollHead;
exports.staffPayrollSubId = staffPayrollSubId;
exports.isStaffPayrollSubId = isStaffPayrollSubId;
exports.payrollMonthReached = payrollMonthReached;
exports.mergeStaffPayrollIntoIncomeStatement = mergeStaffPayrollIntoIncomeStatement;
exports.ACCOUNTS_PAYROLL_HEADS = [
    "Technical Team Salaries",
    "Sales Team Salaries",
    "Sales Team Lead Salaries",
    "Technical Manager Salaries",
    "Email Marketing Team Salaries",
    "Administration Salaries",
    "Executive Salaries",
];
function isAccountsPayrollHead(v) {
    return !!v && exports.ACCOUNTS_PAYROLL_HEADS.includes(v);
}
function staffPayrollSubId(staffId) {
    return `staff-emp-${staffId}`;
}
function isStaffPayrollSubId(id) {
    return !!id && String(id).startsWith("staff-emp-");
}
/** recordDate YYYY-MM-DD, startMonth YYYY-MM */
function payrollMonthReached(recordDate, startMonth) {
    const ym = String(recordDate || "").slice(0, 7);
    const sm = String(startMonth || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || !/^\d{4}-\d{2}$/.test(sm))
        return false;
    return ym >= sm;
}
function newTeamId() {
    return `team-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function isSalesLeadHead(team) {
    return /sales team lead/i.test(team);
}
function isSalesHead(team) {
    return /sales team/i.test(team) && !isSalesLeadHead(team);
}
function isSeededLeadPlaceholder(sub) {
    const id = String(sub.id ?? "");
    if (id.startsWith("staff-emp-"))
        return false;
    const label = String(sub.label ?? "").trim().toLowerCase();
    return id === "stl-hammad" || label === "hammad";
}
function isAdminHead(team) {
    return /administration/i.test(team);
}
function isTechMgrHead(team) {
    return /technical manager/i.test(team);
}
function isExecHead(team) {
    return /executive/i.test(team);
}
function emptySalary(team, profile) {
    const base = {
        basic: 0,
        allowance: 0,
        weekdayOtHours: 0,
        weekendOtHours: 0,
        checkIn: isAdminHead(team) ? "18:00" : isTechMgrHead(team) ? "09:00" : "07:00",
        checkOut: isTechMgrHead(team) ? "18:00" : "16:00",
        lateDeductionOverride: null,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        loanTotal: 0,
        loanPaid: 0,
        loanThisMonth: 0,
        loanPaymentMode: "salary",
        incomeTax: 0,
        pfAuto: true,
        remarks: "",
        employeeId: profile.employeeCode || "",
        address: profile.currentAddress || "",
        phone: profile.contactNo || "",
        cnic: profile.cnic || "",
    };
    if (isExecHead(team)) {
        base.commissionPct = 0;
        base.loanPositive = 0;
        base.loanNegative = 0;
    }
    return base;
}
function emptySales(profile, role, subId) {
    return {
        id: subId,
        name: profile.name,
        code: profile.employeeCode || "",
        role,
        basic: 0,
        allowance: 0,
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
        loanPaymentMode: "salary",
        incomeTax: 0,
        remarks: "",
        cnic: profile.cnic || "",
        address: profile.currentAddress || "",
        phone: profile.contactNo || "",
    };
}
function applyProfileToExisting(sub, person, team) {
    const label = person.name;
    if (isSalesHead(team) || isSalesLeadHead(team)) {
        const role = isSalesLeadHead(team) ? "team_lead" : "sales";
        const prev = (sub.salesPayroll ?? {});
        return {
            ...sub,
            label,
            salesPayroll: {
                ...emptySales(person, role, String(sub.id)),
                ...prev,
                name: label,
                code: person.employeeCode || String(prev.code || ""),
                role: prev.role === "team_lead" || role === "team_lead" ? "team_lead" : "sales",
                cnic: person.cnic || "",
                address: person.currentAddress || "",
                phone: person.contactNo || "",
            },
        };
    }
    const prev = (sub.salary ?? {});
    const salary = {
        ...emptySalary(team, person),
        ...prev,
        employeeId: person.employeeCode || String(prev.employeeId || ""),
        address: person.currentAddress || "",
        phone: person.contactNo || "",
        cnic: person.cnic || "",
    };
    return { ...sub, label, salary, salesPayroll: undefined };
}
function createSub(person, team, filledAt) {
    const id = staffPayrollSubId(person.id);
    if (isSalesHead(team) || isSalesLeadHead(team)) {
        const role = isSalesLeadHead(team) ? "team_lead" : "sales";
        return {
            id,
            label: person.name,
            amount: 0,
            filledAt,
            salesPayroll: emptySales(person, role, id),
        };
    }
    return {
        id,
        label: person.name,
        amount: 0,
        filledAt,
        salary: emptySalary(team, person),
    };
}
function sumSubs(subs) {
    return subs.reduce((a, s) => a + (Number(s.amount) || 0), 0);
}
/**
 * Inject / refresh / prune staff-assigned employees on team salary heads
 * for the given Income Statement record date.
 */
function mergeStaffPayrollIntoIncomeStatement(data, recordDate, people) {
    const active = people.filter(p => isAccountsPayrollHead(p.payrollHead) &&
        payrollMonthReached(recordDate, p.payrollStartMonth) &&
        !!String(p.name || "").trim());
    const byHead = new Map();
    for (const p of active) {
        const list = byHead.get(p.payrollHead) ?? [];
        list.push(p);
        byHead.set(p.payrollHead, list);
    }
    const activeIds = new Set(active.map(p => staffPayrollSubId(p.id)));
    const teams = [...data.teamSalaries ?? []].map(t => ({
        ...t,
        subHeads: [...(t.subHeads ?? [])],
    }));
    const teamByName = new Map(teams.map(t => [String(t.team || ""), t]));
    for (const head of exports.ACCOUNTS_PAYROLL_HEADS) {
        const assigned = byHead.get(head) ?? [];
        let team = teamByName.get(head);
        if (!team && assigned.length === 0)
            continue;
        if (!team) {
            team = {
                id: newTeamId(),
                team: head,
                totalSalary: 0,
                filledAt: recordDate,
                subHeads: [],
                notes: [],
            };
            teams.push(team);
            teamByName.set(head, team);
        }
        // Drop roster-synced rows no longer assigned to this head / active
        let subs = (team.subHeads ?? []).filter(s => {
            if (isSalesLeadHead(head) && isSeededLeadPlaceholder(s))
                return false;
            if (!isStaffPayrollSubId(s.id))
                return true;
            if (!activeIds.has(String(s.id)))
                return false;
            // Keep only if still assigned to THIS head
            return assigned.some(p => staffPayrollSubId(p.id) === s.id);
        });
        for (const person of assigned) {
            const sid = staffPayrollSubId(person.id);
            const idx = subs.findIndex(s => s.id === sid);
            if (idx >= 0) {
                subs[idx] = applyProfileToExisting(subs[idx], person, head);
            }
            else {
                subs.push(createSub(person, head, recordDate));
            }
        }
        team.subHeads = subs;
        team.totalSalary = sumSubs(subs);
    }
    // Also prune staff-emp rows on any other team titles
    for (const team of teams) {
        const head = String(team.team || "");
        if (exports.ACCOUNTS_PAYROLL_HEADS.includes(head))
            continue;
        const before = team.subHeads?.length ?? 0;
        team.subHeads = (team.subHeads ?? []).filter(s => !isStaffPayrollSubId(s.id));
        if ((team.subHeads?.length ?? 0) !== before) {
            team.totalSalary = sumSubs(team.subHeads ?? []);
        }
    }
    return { ...data, teamSalaries: teams };
}
