import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { DemoRequestsPanel } from "@/components/DemoRequestsPanel";

// ── Staff triage queue for public demo-request leads (§3) ────────────────────
// Data layer lives in DemoRequestsPanel (GET/PATCH /api/v1/admin/demo-requests).

export default function DemoRequests() {
  return (
    <div>
      <PageHeader
        title="Demo Requests"
        description="Lead queue from the marketing site. Attribution source, path and UTM are intact."
        actions={<span className="chip border-phantix-600/50 bg-phantix-800/60 text-slate-300"><Inbox size={11} className="mr-1 inline" /> new → contacted → converted → closed</span>}
      />
      <DemoRequestsPanel />
    </div>
  );
}
