import { Response } from "express";
import prisma from "../config/db";
import { AuthRequest } from "../middleware/auth.middleware";

function normName(n: string) {
  return n.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchLoanByName<T extends { employeeName: string; department: string; id: string }>(
  loans: T[],
  name: string,
  department?: string,
): T | null {
  const q = normName(name);
  if (!q) return null;
  const sameName = loans.filter(l => normName(l.employeeName) === q);
  if (!sameName.length) return null;
  if (department) {
    const dept = sameName.find(l => l.department === department);
    if (dept) return dept;
    // One person in the ledger → allow (legacy rows without a team split)
    return sameName.length === 1 ? sameName[0] : null;
  }
  return sameName[0];
}

export async function listPayrollLoans(req: AuthRequest, res: Response) {
  try {
    const name = String(req.query.name ?? "").trim();
    const department = String(req.query.department ?? "").trim();
    let loans = await prisma.payrollLoan.findMany({ orderBy: { updatedAt: "desc" } });
    if (name) {
      const q = normName(name);
      loans = loans.filter(l => normName(l.employeeName) === q);
    }
    if (department) {
      loans = loans.filter(l => l.department === department);
    }
    return res.json({ success: true, loans });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to list loans." });
  }
}

export async function lookupPayrollLoan(req: AuthRequest, res: Response) {
  try {
    const name = String(req.query.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ success: false, message: "Name required." });
    }
    const department = String(req.query.department ?? "").trim();
    const loans = await prisma.payrollLoan.findMany({ orderBy: { updatedAt: "desc" } });
    const match = matchLoanByName(loans, name, department || undefined);
    return res.json({ success: true, loan: match });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Loan lookup failed." });
  }
}

export async function upsertPayrollLoan(req: AuthRequest, res: Response) {
  try {
    const { id, employeeName, department, totalAmount, paidAmount } = req.body as {
      id?: string;
      employeeName?: string;
      department?: string;
      totalAmount?: number;
      paidAmount?: number;
    };

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
      loan = await prisma.payrollLoan.update({ where: { id }, data: payload });
    } else {
      const all = await prisma.payrollLoan.findMany();
      const existing = matchLoanByName(all, name, payload.department) ?? matchLoanByName(all, name);
      loan = existing
        ? await prisma.payrollLoan.update({ where: { id: existing.id }, data: payload })
        : await prisma.payrollLoan.create({ data: payload });
    }

    return res.json({ success: true, loan });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to save loan." });
  }
}

export async function deletePayrollLoan(req: AuthRequest, res: Response) {
  try {
    const id = String(req.params.id ?? "");
    await prisma.payrollLoan.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ success: false, message: "Failed to delete loan." });
  }
}
