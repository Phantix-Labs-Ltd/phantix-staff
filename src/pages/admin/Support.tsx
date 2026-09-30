import React, { useState } from "react";
import { MessageSquare, Search, RefreshCw, Eye, Clock, Send, AlertCircle, Plus, User, Lock } from "lucide-react";
import { PageHeader, Card, StatusBadge, TableSkeleton, EmptyState } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { timeAgo, cx } from "@/lib/utils";
import type { SupportTicket } from "@/lib/types";

type TicketStatus = "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
type TicketPriority = "low" | "medium" | "high" | "critical";

const demoTickets: SupportTicket[] = [
  { id: 1, subject: "Cannot access scan results", status: "open", priority: "high", org_name: "Acme Financial Group", org_id: 1, created_by: "admin@acme.ng", created_at: new Date(Date.now() - 3600000).toISOString(), updated_at: new Date().toISOString(), messages: [{ id: 1, from: "admin@acme.ng", from_type: "customer", body: "I ran a scan yesterday but the results page shows nothing.", at: new Date(Date.now() - 3600000).toISOString() }, { id: 2, from: "support@phantixlabs.com", from_type: "staff", body: "Checking your scan job logs now.", at: new Date(Date.now() - 1800000).toISOString() }] },
  { id: 2, subject: "Billing invoice discrepancy", status: "in_progress" as any, priority: "normal", org_name: "TechStart Ltd", org_id: 2, created_by: "ops@techstart.io", created_at: new Date(Date.now() - 86400000).toISOString(), updated_at: new Date(Date.now() - 43200000).toISOString(), messages: [{ id: 1, from: "ops@techstart.io", from_type: "customer", body: "Invoice shows wrong amount.", at: new Date(Date.now() - 86400000).toISOString() }] },
  { id: 3, subject: "Setup verification stuck", status: "waiting_on_customer", priority: "low", org_name: "PendingCorp", org_id: 4, created_by: "info@pendingcorp.com", created_at: new Date(Date.now() - 172800000).toISOString(), updated_at: new Date().toISOString(), messages: [{ id: 1, from: "info@pendingcorp.com", from_type: "customer", body: "Submitted documents 3 days ago, still pending.", at: new Date(Date.now() - 172800000).toISOString() }, { id: 2, from: "support@phantixlabs.com", from_type: "staff", body: "Please send your CAC registration number for manual verification.", at: new Date(Date.now() - 86400000).toISOString() }] },
  { id: 4, subject: "Security DB bootstrap fails", status: "resolved", priority: "critical", org_name: "HealthPlus NG", org_id: 3, created_by: "security@healthplus.ng", created_at: new Date(Date.now() - 259200000).toISOString(), updated_at: new Date(Date.now() - 86400000).toISOString(), messages: [{ id: 1, from: "security@healthplus.ng", from_type: "customer", body: "Error 409 during security database bootstrap.", at: new Date(Date.now() - 259200000).toISOString() }, { id: 2, from: "support@phantixlabs.com", from_type: "staff", body: "Driver issue resolved --- please retry.", at: new Date(Date.now() - 100000000).toISOString() }] },
];

const statuses: TicketStatus[] = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];
const priorities: TicketPriority[] = ["low", "medium", "high", "critical"];

export default function SupportTickets() {
  const { toast } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [assignTo, setAssignTo] = useState("");

  const tickets = useResource<SupportTicket[]>(
    async (signal) => {
      if (DEMO_MODE) return demoTickets;
      const raw = await api.get<any>("/admin/support/tickets");
      const items = Array.isArray(raw) ? raw : (raw?.value ?? raw?.items ?? []);
      return (items as any[]).map((t: any) => ({
        id: Number(t.id ?? 0),
        subject: String(t.subject ?? ""),
        status: String(t.status ?? "open"),
        priority: String(t.priority ?? "medium"),
        org_name: t.organization_name || t.org_name || "",
        org_id: t.organization_id || t.org_id || 0,
        created_by: t.submitter_name || t.created_by || "",
        created_at: t.created_at || "",
        updated_at: t.last_activity_at || t.updated_at || t.created_at || "",
        messages: Array.isArray(t.messages)
          ? (t.messages as any[])
              .filter((m) => m && typeof m === "object")
              .map((m) => ({
                id: Number(m.id ?? 0),
                from: String(m.submitter_name || m.from || "customer"),
                from_type: String(m.is_internal ? "staff" : m.from_type || "customer"),
                body: String(m.body ?? ""),
                at: String(m.created_at || m.at || ""),
              }))
          : [],
      })) as SupportTicket[];
    },
    [],
  );

  const data = DEMO_MODE ? demoTickets : (tickets.data?.length ? tickets.data : []);

  const filtered = data.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return t.subject.toLowerCase().includes(q) || (t.org_name || "").toLowerCase().includes(q) || (t.created_by || "").toLowerCase().includes(q);
  });

  const selected = selectedTicket ? data.find((t) => t.id === selectedTicket) : null;

  const handleStatusChange = async (id: number, status: string) => {
    const previous = tickets.data;
    tickets.setData((list) => list.map((t) => (t.id === id ? { ...t, status: status as SupportTicket["status"] } : t)));
    try {
      await api.patch(`/admin/support/tickets/${id}`, { status });
      toast("success", "Updated", `Status → ${status.replace(/_/g, " ")}`);
      tickets.refresh();
    } catch (e) {
      tickets.setData(previous);
      toast("error", "Failed", e instanceof Error ? e.message : "");
    }
  };

  const handleReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);
    const previous = tickets.data;
    try {
      await api.post(`/admin/support/tickets/${selectedTicket}/messages`, {
        body: replyText,
        is_internal: internalNote,
      });
      toast("success", internalNote ? "Internal note saved" : "Reply sent");
      setReplyText("");
      setInternalNote(false);
      tickets.refresh();
    } catch (e) {
      tickets.setData(previous);
      toast("error", "Failed", e instanceof Error ? e.message : "");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        description="Manage and respond to customer support tickets with triage tools"
        actions={
          <button onClick={() => tickets.refresh()} className="btn-ghost text-sm px-3 py-1.5" disabled={tickets.loading}>
            <RefreshCw size={14} className={tickets.loading ? "animate-spin" : ""} />
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-9 py-2 text-sm" placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </select>
        <select className="input w-auto py-2 text-sm" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="">All Priority</option>
          {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-4">
        <Card>
          {tickets.loading && !data.length ? (
            <div className="p-4"><TableSkeleton rows={6} /></div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<MessageSquare size={24} />} title="No tickets" body="All clear or try adjusting filters" />
          ) : (
            <div className="divide-y divide-phantix-700/30">
              {filtered.map((ticket) => (
                <button
                  key={ticket.id}
                  onClick={() => setSelectedTicket(selectedTicket === ticket.id ? null : ticket.id)}
                  className={cx(
                    "w-full text-left px-4 py-3 hover:bg-phantix-800/40 transition-colors",
                    selectedTicket === ticket.id && "bg-phantix-800/60 border-l-2 border-gold-400"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200 truncate">{ticket.subject}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{ticket.org_name} • {ticket.created_by}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={ticket.status} />
                      {ticket.priority === "critical" && <AlertCircle size={14} className="text-severity-critical" />}
                      {ticket.priority === "high" && <AlertCircle size={14} className="text-severity-high" />}
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{timeAgo((ticket as any).updated_at || ticket.last_activity_at)}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {selected ? (
          <Card className="h-fit">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-white truncate">{selected.subject}</h3>
              <div className="flex items-center gap-1.5 shrink-0">
                <select className="input w-auto py-1 text-xs" value={selected.status} onChange={(e) => handleStatusChange(selected.id, e.target.value)}>
                  {statuses.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </select>
                <select className="input w-auto py-1 text-xs" value={selected.priority} onChange={(e) => api.patch(`/admin/support/tickets/${selected.id}`, { priority: e.target.value }).then(() => { toast("success", "Priority updated"); tickets.refresh(); })}>
                  {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="text-xs text-slate-500 mb-3 flex flex-wrap gap-x-3 gap-y-1">
              <span>{selected.org_name}</span>
              <span>•</span>
              <span>{selected.created_by}</span>
              <span>•</span>
              <span className="capitalize">{selected.priority} priority</span>
            </div>

            <div className="space-y-3 mb-4 max-h-72 overflow-y-auto">
              {selected.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cx(
                    "rounded-lg p-3 text-sm",
                    msg.from_type === "staff"
                      ? "bg-gold-400/10 border border-gold-400/20 ml-4"
                      : "bg-phantix-800/40 border border-phantix-700/30 mr-4"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-300">{msg.from}</span>
                    <span className="text-[12px] text-slate-500">{msg.from_type}</span>
                    <span className="text-[12px] text-slate-500 ml-auto">{timeAgo(msg.at)}</span>
                  </div>
                  <p className="text-sm text-slate-300">{msg.body}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <textarea
                  className="input flex-1 text-sm resize-none"
                  rows={2}
                  placeholder={internalNote ? "Internal note (not visible to customer)..." : "Type your reply..."}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                />
                <button onClick={handleReply} disabled={sending || !replyText.trim()} className="btn-primary shrink-0 px-3 py-2">
                  {sending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input type="checkbox" checked={internalNote} onChange={(e) => setInternalNote(e.target.checked)} className="rounded accent-gold-400" />
                <Lock size={10} /> Internal note (staff only)
              </label>
            </div>
          </Card>
        ) : (
          <Card className="h-fit">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare size={24} className="text-slate-600 mb-2" />
              <p className="text-sm text-slate-500">Select a ticket to view</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
