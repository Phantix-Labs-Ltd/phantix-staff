import React from "react";
import { Cookie, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader, Card, CardHeader } from "@/components/ui";
import { clearConsent, getConsent } from "@/lib/consent";

// ── Cookies and analytics policy (staff portal, public) ─────────────────────────

export default function Cookies() {
  const consent = getConsent();

  const reset = () => {
    clearConsent();
    window.location.reload();
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader
        title="Cookies and analytics"
        description="What the staff portal measures, why, and how to change your choice."
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="No advertising cookies"
            subtitle="First-party, cookieless product analytics only."
            action={<Cookie size={16} className="text-gold-300" />}
          />
          <p className="text-sm leading-6 text-slate-300">
            The staff portal records <strong className="text-slate-100">first-party, cookieless analytics</strong>{" "}
            It records page path, referrer and coarse device info, to understand internal tool usage. No advertising
            cookies, no cross-site tracking, no personal data.
          </p>
        </Card>

        <Card>
          <CardHeader
            title="Your choice"
            subtitle="Analytics runs only after you accept"
            action={<ShieldCheck size={16} className="text-emerald-300" />}
          />
          <p className="text-sm leading-6 text-slate-300">
            You can accept or decline analytics at any time. Declining stops all beacons; nothing else in the
            portal is affected.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Current choice:{" "}
            <strong className="text-slate-300">
              {consent === "accepted" ? "Accepted" : consent === "declined" ? "Declined" : "Not set"}
            </strong>
          </p>
          <button className="btn-secondary mt-4 text-xs" onClick={reset}>
            <RefreshCw size={13} className="mr-1.5 inline" /> Change my choice
          </button>
        </Card>

        <Card>
          <CardHeader title="Retention and contact" subtitle="Governed by internal policy" />
          <p className="text-sm leading-6 text-slate-300">
            Analytics records are retained in aggregate for product measurement and are not used to identify
            staff. Contact the platform team for any question.
          </p>
        </Card>
      </div>
    </div>
  );
}
