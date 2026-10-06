"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listPayrollLoans = listPayrollLoans;
exports.lookupPayrollLoan = lookupPayrollLoan;
exports.upsertPayrollLoan = upsertPayrollLoan;
exports.deletePayrollLoan = deletePayrollLoan;
const db_1 = __importDefault(require("../config/db"));
function normName(n) {
    return n.trim().toLowerCase().replace(/\s+/g, " ");
}
function matchLoanByName(loans, name, department) {
    const q = normName(name);
    if (!q)
        return null;
    const sameName = loans.filter(l => normName(l.employeeName) === q);
    if (!sameName.length)
        return null;
    if (department) {
        const dept = sameName.find(l => l.department === department);
        if (dept)
            return dept;
        // One person in the ledger → allow (legacy rows without a team split)
        return sameName.length === 1 ? sameName[0] : null;
    }
    return sameName[0];
}
async function listPayrollLoans(req, res) {
    try {
        const name = String(req.query.name ?? "").trim();
        const department = String(req.query.department ?? "").trim();
        let loans = await db_1.default.payrollLoan.findMany({ orderBy: { updatedAt: "desc" } });
        if (name) {
            const q = normName(name);
            loans = loans.filter(l => normName(l.employeeName) === q);
        }
        if (department) {
            loans = loans.filter(l => l.department === department);
        }
        return res.json({ success: true, loans });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to list loans." });
    }
}
async function lookupPayrollLoan(req, res) {
    try {
        const name = String(req.query.name ?? "").trim();
        if (!name) {
            return res.status(400).json({ success: false, message: "Name required." });
        }
        const department = String(req.query.department ?? "").trim();
        const loans = await db_1.default.payrollLoan.findMany({ orderBy: { updatedAt: "desc" } });
        const match = matchLoanByName(loans, name, department || undefined);
        return res.json({ success: true, loan: match });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Loan lookup failed." });
    }
}
async function upsertPayrollLoan(req, res) {
    try {
        const { id, employeeName, department, totalAmount, paidAmount } = req.body;
        if (!employeeName?.trim()) {
            return res.status(400).json({ success: false, message: "Employee name required." });
        }
        const name = employeeName.trim();
        const payload = {
            employeeName: name,
            department: (department ?? "sales_team").trim(),
            totalAmount: Number(totalAmount) || 0,
            paidAmount: Number(paidAmount) || 0,
            updatedBy: req.user?.id ?? null,
        };
        let loan;
        if (id) {
            loan = await db_1.default.payrollLoan.update({ where: { id }, data: payload });
        }
        else {
            const all = await db_1.default.payrollLoan.findMany();
            const existing = matchLoanByName(all, name, payload.department) ?? matchLoanByName(all, name);
            loan = existing
                ? await db_1.default.payrollLoan.update({ where: { id: existing.id }, data: payload })
                : await db_1.default.payrollLoan.create({ data: payload });
        }
        return res.json({ success: true, loan });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to save loan." });
    }
}
async function deletePayrollLoan(req, res) {
    try {
        const id = String(req.params.id ?? "");
        await db_1.default.payrollLoan.delete({ where: { id } });
        return res.json({ success: true });
    }
    catch (err) {
        console.log(err);
        return res.status(500).json({ success: false, message: "Failed to delete loan." });
    }
}
