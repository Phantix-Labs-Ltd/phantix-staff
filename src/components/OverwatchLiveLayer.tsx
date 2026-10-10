/**
 * Live mode on the map: each flow is a dot travelling its wire.
 *
 * A flow between two wired units follows that link's curve (backwards when the
 * wire is drawn the other way). Two units with no wire between them get a
 * shallow arc, so the movement is still visible without inventing a link. A flow
 * whose source and destination are the same unit (an error) is a ring that
 * pulses on it. Every arrival leaves a short ring on the destination.
 *
 * Only this layer re-renders per frame, and only while something is moving; the
 * map underneath is untouched. Dots keep a constant size on screen whatever the
 * zoom, so a zoomed-out map still shows them. Under reduced motion, dots jump
 * straight to the arrival ring.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { LinkPath, OverwatchLayout } from "@/lib/overwatchLayout";
import { FLOW_COLOR, type FlowKind, type LiveFlow } from "@/lib/overwatchLive";

type Pt = { x: number; y: number };
type Curve = { s: Pt; c1: Pt; c2: Pt; t: Pt };

interface Particle {
  key: number;
  kind: FlowKind;
  curve: Curve | null;
  /** Arrival / pulse centre. */
  at: Pt;
  start: number;
  travel: number;
}

const TRAVEL_MS = 900;
const RING_MS = 650;
const MAX_PARTICLES = 140;

function bezier(c: Curve, u: number): Pt {
  const v = 1 - u;
  const a = v * v * v;
  const b = 3 * v * v * u;
  const d = 3 * v * u * u;
  const e = u * u * u;
  return {
    x: a * c.s.x + b * c.c1.x + d * c.c2.x + e * c.t.x,
    y: a * c.s.y + b * c.c1.y + d * c.c2.y + e * c.t.y,
  };
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);

interface Props {
  layout: OverwatchLayout;
  subscribe: (fn: (flow: LiveFlow) => void) => () => void;
  /** Current map zoom, so dot sizes stay constant on screen. */
  zoom?: number;
}

export default function OverwatchLiveLayer({ layout, subscribe, zoom = 1 }: Props) {
  // SVG units per screen pixel, clamped so extreme zooms stay sensible
  const k = 1 / Math.min(2, Math.max(0.2, zoom));
  const particles = useRef<Particle[]>([]);
  const [, setFrame] = useState(0);
  const raf = useRef<number | null>(null);
  const calm = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // wire lookup: "from>to" → the link, either direction
  const wires = useMemo(() => {
    const m = new Map<string, { link: LinkPath; reverse: boolean }>();
    for (const link of layout.links) {
      m.set(`${link.edge.from}>${link.edge.to}`, { link, reverse: false });
      if (!m.has(`${link.edge.to}>${link.edge.from}`)) {
        m.set(`${link.edge.to}>${link.edge.from}`, { link, reverse: true });
      }
    }
    return m;
  }, [layout]);

  const centre = (id: string): Pt | null => {
    const n = layout.nodes.get(id);
    return n ? { x: n.x + n.w / 2, y: n.y + n.h / 2 } : null;
  };

  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      particles.current = particles.current.filter((p) => now - p.start < p.travel + RING_MS);
      setFrame((f) => (f + 1) % 1_000_000);
      raf.current = particles.current.length ? requestAnimationFrame(tick) : null;
    };

    const unsubscribe = subscribe((flow) => {
      const from = flow.from;
      const to = flow.to ?? flow.from;
      if (!to) return;
      const end = centre(to);
      if (!end) return;
      let curve: Curve | null = null;
      if (from && from !== to) {
        const wire = wires.get(`${from}>${to}`);
        if (wire) {
          const { s, c1, c2, t } = wire.link;
          curve = wire.reverse ? { s: t, c1: c2, c2: c1, t: s } : { s, c1, c2, t };
        } else {
          const start = centre(from);
          if (start) {
            // no wire: a shallow arc, bowed to one side so it reads as motion
            const mx = (start.x + end.x) / 2;
            const my = (start.y + end.y) / 2;
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const bow = 0.18;
            const ctl = { x: mx - dy * bow, y: my + dx * bow };
            curve = { s: start, c1: ctl, c2: ctl, t: end };
          }
        }
      }
      particles.current.push({
        key: flow.seq,
        kind: flow.kind,
        curve,
        at: curve ? curve.t : end,
        start: performance.now(),
        travel: curve && !calm ? TRAVEL_MS : 0,
      });
      if (particles.current.length > MAX_PARTICLES) {
        particles.current.splice(0, particles.current.length - MAX_PARTICLES);
      }
      if (raf.current === null) raf.current = requestAnimationFrame(tick);
    });

    return () => {
      unsubscribe();
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      particles.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, wires, calm]);

  const now = performance.now();
  return (
    <g style={{ pointerEvents: "none" }} aria-hidden="true">
      {particles.current.map((p) => {
        const color = FLOW_COLOR[p.kind];
        const age = now - p.start;
        if (p.curve && age < p.travel) {
          const u = ease(Math.min(1, age / p.travel));
          const head = bezier(p.curve, u);
          const trail = [0.06, 0.12, 0.18].map((lag) => bezier(p.curve!, Math.max(0, u - lag)));
          return (
            <g key={p.key}>
              {trail.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r={(3 - i * 0.7) * k} fill={color} opacity={0.5 - i * 0.14} />
              ))}
              <circle cx={head.x} cy={head.y} r={8 * k} fill={color} opacity={0.2} />
              <circle cx={head.x} cy={head.y} r={4 * k} fill={color} />
            </g>
          );
        }
        // arrival (or same-unit pulse): an expanding ring that fades out
        const v = Math.min(1, Math.max(0, (age - p.travel) / RING_MS));
        return (
          <circle
            key={p.key}
            cx={p.at.x}
            cy={p.at.y}
            r={(4 + v * (p.kind === "error" ? 22 : 14)) * k}
            fill="none"
            stroke={color}
            strokeWidth={(p.kind === "error" ? 2.4 : 1.6) * k}
            opacity={(1 - v) * 0.9}
          />
        );
      })}
    </g>
  );
}
