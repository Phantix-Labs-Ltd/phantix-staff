import React, { useState } from "react";
import { ScanLine, RefreshCw, Terminal, FileText, Play, Settings, HardDrive, CheckCircle2, XCircle, Container, Cloud, Zap } from "lucide-react";
import { PageHeader, Card, CardHeader, StatusBadge, TableSkeleton, EmptyState, Modal, Tabs } from "@/components/ui";
import { useResource } from "@/lib/useResource";
import { useStore } from "@/lib/store";
import { api, DEMO_MODE } from "@/lib/api";
import { cx } from "@/lib/utils";

type ScannerTool = { tool_key: string; name: string; purpose: string; docker_image: string | null; host_binary: string | null; available: boolean; docker_available: boolean; version: string | null; update_action: string };
type Wordlist = { key: string; name: string; purpose: string; path: string; present: boolean; bytes: number; source_url: string | null };
type ScannerResponse = { tools: ScannerTool[]; wordlists: Wordlist[]; wordlist_root: string; notes: string[] };

// Live API poller registry (GET /admin/cloud-security/pollers). Providers with
// `liveApi` are polled read-only; the rest are webhook-only until a request
// signer lands.
type CloudPollerCapability = { provider: string; displayName: string; auth: string; liveApi: boolean; note: string };
type CloudPollersResponse = { items: CloudPollerCapability[]; total: number; pollable: number; webhook_only: number };

const demoTools: ScannerTool[] = [
  { tool_key: "subfinder", name: "Subdomain enum", purpose: "subdomain", docker_image: "projectdiscovery/subfinder:latest", host_binary: "/usr/local/bin/subfinder", available: true, docker_available: true, version: "v2.6.1", update_action: "docker pull projectdiscovery/subfinder:latest" },
  { tool_key: "nuclei", name: "Template vulns", purpose: "vuln", docker_image: "projectdiscovery/nuclei:latest", host_binary: null, available: true, docker_available: true, version: "v3.2.0", update_action: "docker pull projectdiscovery/nuclei:latest" },
  { tool_key: "nmap", name: "Port scan", purpose: "network", docker_image: "instrumentisto/nmap:latest", host_binary: "/usr/bin/nmap", available: true, docker_available: true, version: "7.95", update_action: "docker pull instrumentisto/nmap:latest" },
  { tool_key: "httpx", name: "HTTP probe + tech", purpose: "probe", docker_image: "projectdiscovery/httpx:latest", host_binary: "/usr/local/bin/httpx", available: true, docker_available: true, version: "v1.3.7", update_action: "docker pull projectdiscovery/httpx:latest" },
  { tool_key: "searchsploit", name: "Exploit-DB search", purpose: "exploit", docker_image: null, host_binary: "/usr/local/bin/searchsploit", available: true, docker_available: false, version: null, update_action: "git pull or package update" },
  { tool_key: "sqlmap", name: "SQL injection", purpose: "exploit", docker_image: null, host_binary: null, available: false, docker_available: false, version: null, update_action: "pip install sqlmap" },
];

const demoWordlists: Wordlist[] = [
  { key: "seclists_subdomains", name: "SecLists subdomains top5000", purpose: "subdomain_bruteforce", path: "/usr/share/wordlists/subdomains.txt", present: true, bytes: 30075, source_url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/DNS/subdomains-top1million-5000.txt" },
  { key: "seclists_dir_small", name: "SecLists directory-list small", purpose: "directory_enum", path: "/usr/share/wordlists/dir-small.txt", present: true, bytes: 725434, source_url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/directory-list-2.3-small.txt" },
  { key: "seclists_raft_medium", name: "SecLists raft-medium-dirs", purpose: "directory_enum", path: "/usr/share/wordlists/raft-medium.txt", present: true, bytes: 250427, source_url: "https://raw.githubusercontent.com/danielmiessler/SecLists/master/Discovery/Web-Content/raft-medium-directories.txt" },
];

const demoPollers: CloudPollerCapability[] = [
  { provider: "contabo", displayName: "Contabo", auth: "oauth2", liveApi: true, note: "client_credentials token exchange" },
  { provider: "hetzner", displayName: "Hetzner Cloud", auth: "bearer", liveApi: true, note: "" },
  { provider: "vercel", displayName: "Vercel", auth: "bearer", liveApi: true, note: "" },
  { provider: "ovh", displayName: "OVHcloud", auth: "custom", liveApi: false, note: "request signing pending" },
];

export default function ScannerTools() {
  const { toast } = useStore();
  const [tab, setTab] = useState("tools");
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showWordlistModal, setShowWordlistModal] = useState(false);

  const resource = useResource<ScannerResponse>(
    async (signal) => {
      if (DEMO_MODE) return { tools: demoTools, wordlists: demoWordlists, wordlist_root: "/usr/share/wordlists", notes: [] };
      return api.get<ScannerResponse>("/admin/scanner-tools");
    },
    {} as any,
  );

  const tools = resource.data?.tools ?? (DEMO_MODE ? demoTools : []);
  const wordlists = resource.data?.wordlists ?? (DEMO_MODE ? demoWordlists : []);
  const wordlistRoot = resource.data?.wordlist_root ?? "";

  const pollers = useResource<CloudPollersResponse>(
    async () => {
      if (DEMO_MODE) return { items: demoPollers, total: demoPollers.length, pollable: 3, webhook_only: 1 };
      return api.get<CloudPollersResponse>("/admin/cloud-security/pollers");
    },
    { items: DEMO_MODE ? demoPollers : [], total: 0, pollable: 0, webhook_only: 0 },
  );
  const pollerItems = pollers.data?.items ?? (DEMO_MODE ? demoPollers : []);

  const handleUpdate = async () => {
    try {
      await api.post("/admin/scanner-tools/update", {});
      toast("success", "Tools updated", "Latest versions pulled");
      resource.refresh();
      setShowUpdateModal(false);
    } catch (e) {
      toast("error", "Update failed", e instanceof Error ? e.message : "");
    }
  };

  const handleEnsureWordlists = async () => {
    try {
      await api.post("/admin/scanner-tools/wordlists/ensure", {});
      toast("success", "Wordlists ready", "Default wordlists ensured");
      setShowWordlistModal(false);
    } catch (e) {
      toast("error", "Failed", e instanceof Error ? e.message : "");
    }
  };

  return (
    <div>
      <PageHeader
        title="Scanner Tools"
        description="Installed scanner tools, versions, and wordlists for discovery operations"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => resource.refresh()} className="btn-ghost text-sm px-3 py-1.5">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => setShowUpdateModal(true)} className="btn-secondary text-sm px-3 py-1.5">
              <Settings size={14} /> Update
            </button>
            <button onClick={() => setShowWordlistModal(true)} className="btn-secondary text-sm px-3 py-1.5">
              <FileText size={14} /> Wordlists
            </button>
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "tools", label: "Tools", count: tools.length },
          { id: "wordlists", label: "Wordlists", count: wordlists.length },
          { id: "pollers", label: "Cloud pollers", count: pollerItems.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "tools" && (
        <Card>
          {resource.loading ? (
            <div className="p-4"><TableSkeleton rows={6} /></div>
          ) : tools.length === 0 ? (
            <EmptyState icon={<Terminal size={24} />} title="No tools found" body="Check scanner configuration" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Tool</th>
                    <th className="th">Purpose</th>
                    <th className="th">Binary</th>
                    <th className="th">Docker</th>
                    <th className="th">Version</th>
                  </tr>
                </thead>
                <tbody>
                  {tools.map((t) => (
                    <tr key={t.tool_key} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <Terminal size={15} className={t.available ? "text-emerald-400" : "text-slate-600"} />
                          <span className="text-sm font-medium text-slate-100">{t.name}</span>
                        </div>
                        <p className="text-xs text-slate-500">{t.tool_key}</p>
                      </td>
                      <td className="td"><span className="chip text-xs text-slate-400 bg-slate-400/10 border-slate-500/30">{t.purpose}</span></td>
                      <td className="td">
                        {t.host_binary ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-400" />
                            <span className="text-xs font-mono text-slate-400 truncate max-w-[120px]" title={t.host_binary}>{t.host_binary.split("/").pop()}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">---</span>
                        )}
                      </td>
                      <td className="td">
                        {t.docker_available ? (
                          <div className="flex items-center gap-1">
                            <Container size={12} className="text-emerald-400" />
                            <span className="text-xs text-slate-400">available</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">---</span>
                        )}
                      </td>
                      <td className="td">
                        {t.version ? (
                          <span className="text-xs font-mono text-slate-400 truncate max-w-[140px] block">{t.version.split("\n")[0]}</span>
                        ) : (
                          <span className="text-xs text-slate-600">not installed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "wordlists" && (
        <Card>
          {wordlists.length === 0 ? (
            <EmptyState icon={<FileText size={24} />} title="No wordlists" body="Ensure wordlists are present" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Wordlist</th>
                    <th className="th">Purpose</th>
                    <th className="th">Size</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {wordlists.map((w) => (
                    <tr key={w.key} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                      <td className="td">
                        <span className="block max-w-[26rem] truncate" title={w.path}>
                          <span className="font-medium text-slate-100">{w.name}</span>
                          <span className="ml-2 font-mono text-[12px] text-slate-500">{w.path}</span>
                        </span>
                      </td>
                      <td className="td"><span className="chip text-xs text-slate-400 bg-slate-400/10 border-slate-500/30">{w.purpose.replace(/_/g, " ")}</span></td>
                      <td className="td"><span className="text-xs font-mono text-slate-300">{w.present ? `${(w.bytes / 1024).toFixed(1)} KB` : "---"}</span></td>
                      <td className="td">
                        {w.present ? <StatusBadge status="ready" /> : <StatusBadge status="failed" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {wordlistRoot && (
            <div className="px-4 py-2 text-xs text-slate-500 border-t border-phantix-700/40">
              <HardDrive size={12} className="inline mr-1" />
              Root: {wordlistRoot}
            </div>
          )}
        </Card>
      )}

      {tab === "pollers" && (
        <Card>
          <CardHeader
            title="Live API pollers"
            subtitle="Read-only provider inventory pulls (OAuth2 / bearer / api-key). Signer-pending providers stay webhook-only."
          />
          {pollerItems.length === 0 ? (
            <EmptyState icon={<Cloud size={24} />} title="No poller registry" body="Poller capabilities load from the backend registry" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-phantix-700/40">
                    <th className="th">Provider</th>
                    <th className="th">Auth</th>
                    <th className="th">Transport</th>
                    <th className="th">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {pollerItems.map((p) => (
                    <tr key={p.provider} className="border-b border-phantix-700/20 hover:bg-phantix-800/40">
                      <td className="td">
                        <span className="whitespace-nowrap">
                          <span className="font-medium text-slate-100">{p.displayName || p.provider}</span>
                          <span className="ml-2 font-mono text-[12px] text-slate-500">{p.provider}</span>
                        </span>
                      </td>
                      <td className="td"><span className="chip text-xs text-slate-400 bg-slate-400/10 border-slate-500/30">{p.auth}</span></td>
                      <td className="td">
                        {p.liveApi ? (
                          <span className="chip text-xs text-emerald-300 bg-emerald-400/10 border-emerald-400/30"><Zap size={10} className="mr-1" />Live API</span>
                        ) : (
                          <span className="chip text-xs text-slate-400 bg-slate-400/10 border-slate-500/30">Webhook only</span>
                        )}
                      </td>
                      <td className="td"><span className="text-xs text-slate-500">{p.note || (p.liveApi ? "live read-only API pull" : "webhook only — signer pending")}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="px-4 py-2 text-xs text-slate-500 border-t border-phantix-700/40">
            {pollers.data?.pollable ?? 0} live-pollable · {pollers.data?.webhook_only ?? 0} webhook-only
          </div>
        </Card>
      )}

      <Modal open={showUpdateModal} onClose={() => setShowUpdateModal(false)} title="Update Scanner Tools">
        <p className="text-sm text-slate-400 mb-4">Pull latest versions of all installed scanner tools. This may affect running scans.</p>
        <button onClick={handleUpdate} className="btn-primary w-full"><Play size={14} /> Update All Tools</button>
      </Modal>

      <Modal open={showWordlistModal} onClose={() => setShowWordlistModal(false)} title="Ensure Wordlists">
        <p className="text-sm text-slate-400 mb-4">Ensure default wordlists are present on the server.</p>
        <button onClick={handleEnsureWordlists} className="btn-primary w-full"><FileText size={14} /> Ensure Wordlists</button>
      </Modal>
    </div>
  );
}
