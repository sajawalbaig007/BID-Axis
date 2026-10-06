"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadStaffPayrollPeople = loadStaffPayrollPeople;
exports.applyStaffPayrollToIncomeData = applyStaffPayrollToIncomeData;
const db_1 = __importDefault(require("../config/db"));
const staffPayrollSync_1 = require("./staffPayrollSync");
/** Load assigned staff employees (profile from User when linked). */
async function loadStaffPayrollPeople() {
    const rows = await db_1.default.staffEmployee.findMany();
    const assigned = rows.filter(r => !!r.payrollHead && !!r.payrollStartMonth);
    const userIds = assigned.map(r => r.userId).filter((id) => !!id);
    const users = userIds.length > 0
        ? await db_1.default.user.findMany({
            where: { id: { in: userIds } },
            select: {
                id: true,
                name: true,
                employeeCode: true,
                currentAddress: true,
                contactNo: true,
                cnic: true,
            },
        })
        : [];
    const byId = new Map(users.map(u => [u.id, u]));
    const out = [];
    for (const r of assigned) {
        if (!(0, staffPayrollSync_1.isAccountsPayrollHead)(r.payrollHead) || !r.payrollStartMonth)
            continue;
        const u = r.userId ? byId.get(r.userId) : null;
        const name = (u?.name || r.name || "").trim();
        if (!name)
            continue;
        out.push({
            id: r.id,
            name,
            employeeCode: u?.employeeCode ?? r.employeeCode ?? null,
            currentAddress: u?.currentAddress ?? r.currentAddress ?? null,
            contactNo: u?.contactNo ?? r.contactNo ?? null,
            cnic: u?.cnic ?? r.cnic ?? null,
            payrollHead: r.payrollHead,
            payrollStartMonth: r.payrollStartMonth,
        });
    }
    return out;
}
async function applyStaffPayrollToIncomeData(data, recordDate) {
    try {
        const people = await loadStaffPayrollPeople();
        if (!people.length) {
            // Still prune stale staff-emp-* if assignments cleared
            return (0, staffPayrollSync_1.mergeStaffPayrollIntoIncomeStatement)(data, recordDate, []);
        }
        return (0, staffPayrollSync_1.mergeStaffPayrollIntoIncomeStatement)(data, recordDate, people);
    }
    catch (err) {
        console.error("[staffPayroll] merge failed", err);
        return data;
    }
}
