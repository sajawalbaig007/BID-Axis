import { redirect } from "next/navigation";

export default function LegacyCsrPayrollRedirect() {
  redirect("/accounts/income-statement");
}
