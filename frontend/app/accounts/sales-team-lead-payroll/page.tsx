import { redirect } from "next/navigation";

/** Payroll lives under Income Statement → Team Salaries */
export default function SalesTeamLeadPayrollRedirect() {
  redirect("/accounts/income-statement");
}
