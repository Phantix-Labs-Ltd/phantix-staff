import React, { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { RefreshCw, Wifi, WifiOff, ShieldAlert, TerminalSquare, Play, Square, RotateCcw } from "lucide-react";
import { PageHeader, Card, StatusBadge, EmptyState, PageHeaderSkeleton } from "@/components/ui";
import { api, tokens, API_BASE, DEMO_MODE } from "@/lib/api";
import { useStore } from "@/lib/store";
import { cx } from "@/lib/utils";

interface TerminalCapability {
  enabled: boolean;
  mode?: string;
  shell?: string;
  sshTarget?: string | null;
  idleSeconds?: number;
  maxSessions?: number;
  defaultCols?: number;
  defaultRows?: number;
  websocketPath?: string;
  auth?: string;
  activeSessions?: number;
  warning?: string;
  staff?: { id: number; email: string; role: string };
}

/**
 * WebSocket base for the superadmin terminal.
 *
 * Vercel rewrites are HTTP-only and CANNOT tunnel WebSocket upgrades, so in
 * production we must connect directly to the WS-capable backend origin
 * (VITE_TERMINAL_WS_ORIGIN, e.g. "wss://staging.phantix.site"). In local dev the
 * Vite proxy forwards /api with ws:true, so same-origin works there.
 */
function wsBase(): string | null {
  if (typeof window === "undefined") return null;
  const configured = (import.meta.env.VITE_TERMINAL_WS_ORIGIN as string | undefined)?.trim();
  if (configured) {
    const origin = configured.startsWith("http") ? configured.replace(/^http/, "ws") : configured;
    return `${origin.replace(/\/+$/, "")}/api/v1/admin/super/terminal/ws`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/v1/admin/super/terminal/ws`;
}

const demoCapability: TerminalCapability = {
  enabled: true,
  mode: "local",
  shell: "/bin/bash",
  idleSeconds: 1800,
  maxSessions: 3,
  defaultCols: 120,
  defaultRows: 40,
  websocketPath: "/api/v1/admin/super/terminal/ws",
  auth: "Staff JWT required (role=superadmin)",
  activeSessions: 0,
  warning: "Demo terminal ’” connect a live API to open a real PTY session.",
  staff: { id: 1, email: "admin@example.com", role: "superadmin" },
};

export default function SuperadminTerminal() {
  const { toast } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const keepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [cap, setCap] = useState<TerminalCapability | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadCapability = async () => {
    setLoading(true);
    try {
      if (DEMO_MODE) {
        setCap(demoCapability);
        return;
      }
      const res = await api.get<TerminalCapability>("/admin/super/terminal");
      setCap(res);
    } catch (e) {
      toast("error", "Terminal unavailable", e instanceof Error ? e.message : "Could not load terminal capability");
      setCap({ enabled: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCapability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (keepaliveRef.current) clearInterval(keepaliveRef.current);
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, []);

  const openTerminal = async () => {
    if (DEMO_MODE) {
      if (!containerRef.current) return;
      initTerm();
      toast("info", "Demo terminal", "Connect a live API for a real superadmin PTY session.");
      return;
    }
    const base = wsBase();
    const token = tokens.staff;
    if (!base || !token) {
      toast("error", "Cannot connect", "Missing API base or staff token.");
      return;
    }
    setBusy(true);
    try {
      const url = new URL(base);
      url.searchParams.set("token", token);
      url.searchParams.set("cols", String(cap?.defaultCols ?? 120));
      url.searchParams.set("rows", String(cap?.defaultRows ?? 40));
      url.searchParams.set("format", "json");
      initTerm();
      connectWs(url.toString());
    } finally {
      setBusy(false);
    }
  };

  const initTerm = () => {
    const el = containerRef.current;
    if (!el) return;
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
    }
    const term = new XTerm({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
      fontSize: 13,
      theme: {
        background: "#0B1026",
        foreground: "#D8E1F5",
        cursor: "#E8B54D",
        selectionBackground: "rgba(232,181,77,0.25)",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    window.setTimeout(() => fit.fit(), 80);
  };

  const connectWs = (wsUrl: string) => {
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        termRef.current?.writeln("\r\n\x1b[1;33m[session opening...]\x1b[0m");
      };

      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          termRef.current?.write(String(ev.data));
          return;
        }
        switch (msg.type) {
          case "ready":
            termRef.current?.writeln(`\r\n\x1b[1;32m[session ready ${String(msg.sessionId ?? "")} ’” mode ${String(msg.mode ?? "local")}]\x1b[0m`);
            termRef.current?.focus();
            break;
          case "output":
            termRef.current?.write(String(msg.data ?? ""));
            break;
          case "resized":
            // ack ’” nothing needed
            break;
          case "error":
            termRef.current?.writeln(`\r\n\x1b[1;31m[error] ${String(msg.message ?? "unknown")}\x1b[0m`);
            toast("error", "Terminal error", String(msg.message ?? ""));
            break;
          case "exit":
            termRef.current?.writeln(`\r\n\x1b[1;33m[session exit ${String(msg.code ?? 0)}]\x1b[0m`);
            setConnected(false);
            break;
          case "pong":
            break;
          default:
            break;
        }
      };

      ws.onclose = (ev) => {
        setConnected(false);
        termRef.current?.writeln(`\r\n\x1b[1;31m[connection closed ${ev.code}]\x1b[0m`);
        if (keepaliveRef.current) {
          clearInterval(keepaliveRef.current);
          keepaliveRef.current = null;
        }
      };

      ws.onerror = () => {
        setConnected(false);
        termRef.current?.writeln("\r\n\x1b[1;31m[connection error]\x1b[0m");
      };

      // Input →’ server
      termRef.current?.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "input", data }));
        }
      });

      // Resize
      const onResize = () => {
        if (!fitRef.current || !termRef.current) return;
        try {
          fitRef.current.fit();
        } catch { /* ignore */ }
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: termRef.current.cols, rows: termRef.current.rows }));
        }
      };
      window.addEventListener("resize", onResize);
      termRef.current?.onData(() => {});

      // Keepalive
      keepaliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 30000);

      // Store cleanup for resize listener
      (ws as unknown as { _resize?: () => void })._resize = onResize;
      const origClose = ws.close.bind(ws);
      ws.close = () => {
        window.removeEventListener("resize", onResize);
        return origClose();
      };
    } catch (e) {
      toast("error", "WebSocket failed", e instanceof Error ? e.message : "Could not open terminal");
      setConnected(false);
    }
  };

  const sendClose = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "close" }));
    }
    wsRef.current?.close();
  };

  if (loading) {
    return (
      <div>
        <PageHeaderSkeleton actions />
        <div className="space-y-4">
          <div className="card">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="skeleton h-6 w-28 rounded-full" />
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-3 w-24 rounded" />
              <div className="skeleton ml-auto h-3 w-40 rounded" />
            </div>
          </div>
          <div className="card !p-0 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-phantix-700/40 bg-phantix-900/60 px-4 py-2.5">
              <div className="skeleton h-3.5 w-3.5 rounded" />
              <div className="skeleton h-3 w-40 rounded" />
              <div className="skeleton ml-auto h-7 w-24 rounded-md" />
            </div>
            <div className="skeleton m-4 h-64 rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  const enabled = cap?.enabled === true;

  return (
    <div>
      <PageHeader
        title="Superadmin Terminal"
        description="Secure interactive shell to the SecureGraph API runtime ’” superadmin only, fully audited"
        actions={
          <div className="flex items-center gap-2">
            <span className={cx("flex items-center gap-1.5 text-xs font-mono", connected ? "text-emerald-400" : "text-slate-500")}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              {connected ? "Connected" : "Idle"}
            </span>
            <button className="btn-ghost text-sm px-3 py-1.5" onClick={() => void loadCapability()}><RefreshCw size={14} /></button>
          </div>
        }
      />

      {!enabled ? (
        <EmptyState
          icon={<ShieldAlert size={24} />}
          title="Terminal disabled"
          body="SUPERADMIN_TERMINAL_ENABLED is off. Contact ops to enable remote shell access."
        />
      ) : (
        <div className="space-y-4">
          {/* Capability strip */}
          <Card>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300">mode: {cap?.mode ?? "local"}</span>
              {cap?.shell && <span className="font-mono text-xs text-slate-400">shell: {cap.shell}</span>}
              {cap?.mode === "ssh" && cap?.sshTarget && <span className="font-mono text-xs text-slate-400">ssh: {cap.sshTarget}</span>}
              {cap?.maxSessions != null && <span className="text-xs text-slate-400">{cap.activeSessions ?? 0}/{cap.maxSessions} sessions</span>}
              {cap?.idleSeconds != null && <span className="text-xs text-slate-400">idle close: {Math.round(cap.idleSeconds / 60)}m</span>}
              {cap?.staff && <span className="ml-auto text-xs text-slate-500">{cap.staff.email} · {cap.staff.role}</span>}
            </div>
            {cap?.warning && <p className="mt-2 text-xs leading-5 text-amber-400/80">{cap.warning}</p>}
          </Card>

          {/* Terminal window */}
          <Card className="!p-0 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-phantix-700/40 bg-phantix-900/60 px-4 py-2.5">
              <TerminalSquare size={15} className="text-gold-400" />
              <span className="font-mono text-xs text-slate-300">phantix-superadmin</span>
              <span className="ml-auto flex items-center gap-2">
                <StatusBadge status={connected ? "active" : "draft"} />
                {!connected ? (
                  <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => void openTerminal()} disabled={busy}>
                    <Play size={12} /> Open session
                  </button>
                ) : (
                  <button className="btn-danger !py-1.5 !px-3 !text-xs" onClick={sendClose}>
                    <Square size={12} /> Close
                  </button>
                )}
              </span>
            </div>
            <div ref={containerRef} className="h-[420px] w-full bg-[#0B1026] p-2" />
            {!connected && (
              <div className="border-t border-phantix-700/40 bg-phantix-900/40 px-4 py-2 text-xs text-slate-500">
                Click <strong className="text-slate-300">Open session</strong> to start a PTY. Keystrokes and output are never logged by the frontend.
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
