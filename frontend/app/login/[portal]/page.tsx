import { notFound } from "next/navigation";
import LoginPortalForm from "@/app/components/auth/LoginPortalForm";
import { PORTAL_OPTIONS, type PortalRole } from "@/lib/loginRole";

const VALID = new Set(PORTAL_OPTIONS.map(o => o.value));

type Props = { params: Promise<{ portal: string }> };

export default async function LoginPortalPage({ params }: Props) {
  const { portal } = await params;
  if (!VALID.has(portal as PortalRole)) notFound();
  return <LoginPortalForm portal={portal as PortalRole} />;
}

export function generateStaticParams() {
  return PORTAL_OPTIONS.map(o => ({ portal: o.value }));
}
