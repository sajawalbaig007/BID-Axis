import { redirect } from "next/navigation";

/** Payroll lives under Income Statement → Team Salaries */
export default function TechnicalTeamPayrollRedirect() {
  redirect("/accounts/income-statement");
}
