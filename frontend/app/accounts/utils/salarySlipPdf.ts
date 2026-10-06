/**
 * Salary-slip PDF entry — routes to template layouts (GPS technical, BEM sales, BEM CSR/Hammad).
 */

export type {
  SalarySlipLine,
  SalarySlipPayload,
  SalarySlipTemplate,
} from "./salarySlipShared";

export {
  salarySlipMonthLabel,
  salarySlipMonthCompact,
  slipTemplateForKind,
} from "./salarySlipShared";

import {
  resolveSlipCompany,
  safeSlipFileName,
  type SalarySlipPayload,
} from "./salarySlipShared";
import { SALARY_SLIP_COMPANIES } from "./salarySlipCompanies";
import { renderSalarySlipByTemplate } from "./salarySlipTemplates";

export async function downloadSalarySlipPdf(payload: SalarySlipPayload): Promise<void> {
  const { key, company } = resolveSlipCompany(payload);
  if (!company.slipReady) {
    throw new Error(`${company.label} salary-slip format is not ready yet.`);
  }

  const signed: SalarySlipPayload = {
    ...payload,
    signedAt: payload.signedAt || new Date().toISOString(),
  };
  const doc = await renderSalarySlipByTemplate(signed, company, key);
  doc.save(safeSlipFileName(signed, SALARY_SLIP_COMPANIES[key].label));
}
