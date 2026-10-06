import express from "express";
import { verifyToken } from "../middleware/auth.middleware";
import { allowRoles } from "../middleware/role.middleware";
import { uploadReportFile } from "../middleware/upload.middleware";
import {
  getAccountsDashboardSummary,
  getAccountsRecord,
  getIncomeBudgetActuals,
  getProvidentFundBreakdown,
  listAccountsDates,
  listEmployeeNameMerges,
  saveAccountsRecord,
  uploadAccountsFile,
} from "../controllers/accounts.controller";
import {
  deletePayrollLoan,
  listPayrollLoans,
  lookupPayrollLoan,
  upsertPayrollLoan,
} from "../controllers/payrollLoan.controller";
import { getMonthlyAccountsReport, listMonthlyAccountsReports, saveMonthlyAccountsReport } from "../controllers/accountsReport.controller";
import { getLiveFxRates } from "../controllers/accountsFx.controller";

const router = express.Router();

router.use(verifyToken, allowRoles("accounts", "admin"));
router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/dashboard/summary", getAccountsDashboardSummary);
router.get("/fx-rates", getLiveFxRates);
router.get("/income-budget/actuals", getIncomeBudgetActuals);
router.get("/income-statement/pf-breakdown", getProvidentFundBreakdown);
router.get("/employee-name-merges", listEmployeeNameMerges);
router.get("/reports/monthly/saved", listMonthlyAccountsReports);
router.post("/reports/monthly/save", uploadReportFile.single("file"), saveMonthlyAccountsReport);
router.get("/reports/monthly", getMonthlyAccountsReport);
router.get("/payroll-loans/lookup", lookupPayrollLoan);
router.get("/payroll-loans", listPayrollLoans);
router.post("/payroll-loans", upsertPayrollLoan);
router.put("/payroll-loans", upsertPayrollLoan);
router.delete("/payroll-loans/:id", deletePayrollLoan);
router.get("/:page", listAccountsDates);
router.get("/:page/:date", getAccountsRecord);
router.put("/:page/:date", saveAccountsRecord);
router.post("/:page/:date/upload", uploadReportFile.single("file"), uploadAccountsFile);

export default router;
