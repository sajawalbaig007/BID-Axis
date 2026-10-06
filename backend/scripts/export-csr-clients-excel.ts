import fs from "fs";
import os from "os";
import path from "path";
import { buildAllCsrClientsWorkbook } from "../src/utils/allCsrClientsExcel";

async function main() {
  const { buffer, filename, summary } = await buildAllCsrClientsWorkbook();
  const desktop = path.join(os.homedir(), "Desktop", filename);
  fs.writeFileSync(desktop, buffer);
  console.log("Wrote", desktop);
  console.log(
    `CSR tabs: ${summary.filter(s => s.important + s.interested + s.closeClients + s.activeProjects > 0).length}`,
  );
  for (const row of summary) {
    console.log(
      `${row.csr}: important=${row.important} interested=${row.interested} close=${row.closeClients} projects=${row.activeProjects}`,
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
