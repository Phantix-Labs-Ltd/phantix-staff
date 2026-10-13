import React, { useEffect, useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { Card, PageHeader, PageSkeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { ISSUE_FIELDS, type Issue } from "@/pages/admin/weeklyShared";

/**
 * Masthead — the cover copy and newsletter box every reader sees on the Weekly.
 *
 * Kept as a page of its own (it used to be a modal on the inventory), so the
 * editorial team can link to it directly and work on the copy full-width.
 * Individual issues are managed on the Issues page; this is the shared
 * masthead/defaults the public reader falls back to.
 */
export default function WeeklyMasthead() {
  const { toast } = useStore();
  const [issue, setIssue] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ issue: Issue }>("/admin/blog/issue")
      .then((r) => {
        if (!cancelled) setIssue(r.issue);
      })
      .catch((e) => {
        if (!cancelled) toast("error", "Could not load the masthead", e instanceof Error ? e.message : "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const save = async () => {
    if (!issue) return;
    setBusy(true);
    try {
      await api.put("/admin/blog/issue", issue);
      toast("success", "Masthead saved", "The Weekly picks it up within a minute.");
    } catch (e) {
      toast("error", "Could not save", e instanceof Error ? e.message : "");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <div>
      <PageHeader
        title="Masthead"
        description="The publication name, cover copy and newsletter box every reader sees. These are the defaults the public Weekly falls back to."
        actions={
          <button className="btn-primary" disabled={busy || !issue} onClick={() => void save()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Settings2 size={14} />} Save masthead
          </button>
        }
      />
      {issue && (
        <Card>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ISSUE_FIELDS.map((f) => (
              <div key={f.key} className={f.long ? "sm:col-span-2" : undefined}>
                <label className="label" htmlFor={`issue-${f.key}`}>{f.label}</label>
                {f.long ? (
                  <textarea
                    id={`issue-${f.key}`}
                    className="input !min-h-[72px]"
                    value={issue[f.key]}
                    onChange={(e) => setIssue({ ...issue, [f.key]: e.target.value })}
                  />
                ) : (
                  <input
                    id={`issue-${f.key}`}
                    className="input"
                    value={issue[f.key]}
                    onChange={(e) => setIssue({ ...issue, [f.key]: e.target.value })}
                  />
                )}
                {f.hint && <p className="mt-1 text-[12px] text-slate-500">{f.hint}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
