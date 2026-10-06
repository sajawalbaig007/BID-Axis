import { redirect } from "next/navigation";

/** Payroll lives under Income Statement → Team Salaries */
export default function SalesTeamPayrollRedirect() {
  redirect("/accounts/income-statement");
}
