"use client";

import { Suspense } from "react";
import TechnicalPageShell from "../components/TechnicalPageShell";
import { TechnicalActiveProjectsPageInner } from "../active-projects/page";

export default function TechnicalRevisionsPage() {
  return (
    <Suspense
      fallback={
        <TechnicalPageShell bgClass="bg-[#F5F6FA] dark:bg-crm-bg">
          <div className="p-6">
            <div className="h-10 w-48 bg-crm-muted rounded-xl animate-pulse mb-4" />
            <div className="h-64 bg-crm-surface rounded-2xl border border-crm-border-subtle animate-pulse" />
          </div>
        </TechnicalPageShell>
      }
    >
      <TechnicalActiveProjectsPageInner variant="revisions" />
    </Suspense>
  );
}
