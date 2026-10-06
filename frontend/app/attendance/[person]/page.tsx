import { notFound } from "next/navigation";
import DeptAttendancePage from "@/app/components/DeptAttendancePage";

const PEOPLE: Record<string, { department: "dev" | "office_boy" | "hr" | "bim_modeler"; title: string; name: string }> = {
  "ahmer-shah": { department: "dev", title: "Dev", name: "Ahmer Shah" },
  sajawal: { department: "dev", title: "Dev", name: "Sajawal" },
  khalil: { department: "office_boy", title: "Office Boy", name: "Khalil" },
  ismail: { department: "office_boy", title: "Office Boy", name: "Ismail" },
  "mahnoor-imran": { department: "hr", title: "HR", name: "Mahnoor Imran" },
  "ahmad-nadeem": { department: "bim_modeler", title: "BIM Modeler", name: "Ahmad Nadeem" },
};

type Props = { params: Promise<{ person: string }> };

export default async function PersonAttendancePage({ params }: Props) {
  const { person } = await params;
  const row = PEOPLE[person];
  if (!row) notFound();
  return (
    <DeptAttendancePage
      department={row.department}
      title={row.title}
      personKey={person}
      personName={row.name}
    />
  );
}

export function generateStaticParams() {
  return Object.keys(PEOPLE).map((person) => ({ person }));
}
