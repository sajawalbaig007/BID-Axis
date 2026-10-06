import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_USERS } from "../src/constants/seedUsers";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("TrioA15A20S30@", 10);

  for (const user of SEED_USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        password: hashedPassword,
        name: user.name,
        role: user.role,
        ...(user.csrCode ? { csrCode: user.csrCode } : {}),
      },
      create: {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
        ...(user.csrCode ? { csrCode: user.csrCode } : {}),
      },
    });
  }

  const companyHash = await bcrypt.hash("123456", 12);
  await prisma.companyCredential.upsert({
    where: { company: "BEM" },
    update: {},
    create: { company: "BEM", username: "BEM", password: companyHash },
  });
  await prisma.companyCredential.upsert({
    where: { company: "GPS" },
    update: {},
    create: { company: "GPS", username: "GPS", password: companyHash },
  });

  console.log("Seed complete");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
