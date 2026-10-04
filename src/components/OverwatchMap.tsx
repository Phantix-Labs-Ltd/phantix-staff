/**
 * The live topology.
 *
 * Draws every deployed unit — including the ones that will never handle a request, which
 * is itself information — and colours each by what the snapshot says it is doing. The
 * layout is static (computed from the topology); only the state changes, so the picture
 * does not jump around while an operator is reading it.
 *
 * Two rendering rules carried over from the standalone map, because they were real bugs
 * there: a box is sized for its name *and* its kind tag, and the renderer wraps a name to
 * two lines before it is allowed to ellipsise. Text must not escape its container.
 *
 * The canvas is pannable and zoomable (wheel, buttons, drag). Zoom/pan is a CSS transform
 * on the `<svg>` itself, so the layout coordinates stay in SVG units and the pointer maths
 * stays in screen pixels.
 *
 * Hovering a card or a boundary lane lights that thing's one-hop neighbourhood: the card
 * (plus anything nested inside it) or everything in the lane, every unit directly wired to
 * any of those, and the links that leave the set. Everything else dims. This is a reading
 * aid, not a selection — the ranked "look here first" highlight only shows through when
 * nothing is hovered.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";

import { EDGE_COLOR, KIND_COLOR } from "@/lib/overwatchTopology";
import { computeLayout, fitText, GROUP_LABEL, textWidth, wrapLabel } from "@/lib/overwatchLayout";
import { LEVEL_COLOR, type NodeState } from "@/lib/overwatchMap";
import { cx } from "@/lib/utils";

interface Props {
  states: Map<string, NodeState>;
  /** Node ids the ranking wants the eye drawn to. */
  highlight?: string[];
  selected?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const NAME_SIZE = 11;
const NESTED_NAME_SIZE = 9.6;
const TAG_SIZE = 8.4;

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
/** Cap the auto-fit so a small graph on a big screen does not balloon. */
const MAX_FIT = 1.5;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const CTL =
  "flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-phantix-900/80 text-slate-300 backdrop-blur transition-colors hover:border-phantix-500/60 hover:text-white";

type Hover = { kind: "node" | "lane"; id: string } | null;

export default function OverwatchMap({
  states,
  highlight = [],
  selected,
  onSelect,
  className,
  fullscreen,
  onToggleFullscreen,
}: Props) {
  const layout = useMemo(() => computeLayout(), []);
  const hot = useMemo(() => new Set(highlight), [highlight]);

  // ── canvas size, so "fit" knows what it is fitting into
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ z: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ px: number; py: number; x: number; y: number; moved: boolean } | null>(null);
  const didPan = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // ── zoom / pan
  const fitView = useCallback(() => {
    if (!size.w || !size.h) return;
    const pad = 28;
    const z = clamp(
      Math.min((size.w - pad * 2) / layout.width, (size.h - pad * 2) / layout.height),
      MIN_ZOOM,
      MAX_FIT,
    );
    setView({ z, x: (size.w - layout.width * z) / 2, y: (size.h - layout.height * z) / 2 });
  }, [size.w, size.h, layout.width, layout.height]);

  // refit whenever the canvas changes shape: mount, fullscreen toggle, window resize
  useEffect(() => {
    fitView();
  }, [fitView]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const z = clamp(v.z * factor, MIN_ZOOM, MAX_ZOOM);
      if (z === v.z) return v;
      const k = z / v.z;
      return { z, x: px - k * (px - v.x), y: py - k * (py - v.y) };
    });
  }, []);

  const zoomCenter = useCallback(
    (factor: number) => zoomAt(factor, size.w / 2, size.h / 2),
    [zoomAt, size.w, size.h],
  );

  // wheel must be a native non-passive listener, or preventDefault is ignored
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragRef.current = { px: e.clientX, py: e.clientY, x: view.x, y: view.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (!d.moved && Math.hypot(dx, dy) > 4) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) {
      didPan.current = true;
      setView((v) => ({ ...v, x: d.x + dx, y: d.y + dy }));
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    // clear the click-suppressor after the click event that follows this pointerup
    if (d?.moved) window.setTimeout(() => { didPan.current = false; }, 0);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be gone */
    }
  };

  // ── hover neighbourhood (1-hop)
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [hoverLane, setHoverLane] = useState<string | null>(null);
  const hover: Hover = hoverNode
    ? { kind: "node", id: hoverNode }
    : hoverLane
      ? { kind: "lane", id: hoverLane }
      : null;

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of layout.links) {
      const { from, to } = l.edge;
      if (!m.has(from)) m.set(from, new Set());
      if (!m.has(to)) m.set(to, new Set());
      m.get(from)!.add(to);
      m.get(to)!.add(from);
    }
    return m;
  }, [layout]);

  const active = useMemo(() => {
    if (!hover) return null;
    // "self" is the thing hovered: a card plus its nested children, or every unit in a lane
    const self = new Set<string>();
    if (hover.kind === "lane") {
      for (const [id, box] of layout.nodes) if (box.unit.boundary === hover.id) self.add(id);
    } else {
      self.add(hover.id);
      for (const [id, box] of layout.nodes) if (box.unit.parent === hover.id) self.add(id);
    }
    const nodes = new Set(self);
    for (const id of self) for (const n of adjacency.get(id) ?? []) nodes.add(n);
    const links = new Set<number>();
    layout.links.forEach((l, i) => {
      if (self.has(l.edge.from) || self.has(l.edge.to)) links.add(i);
    });
    return { nodes, links };
  }, [hover, layout, adjacency]);

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setHoverNode(null);
        setHoverLane(null);
      }}
      className={cx(
        "relative h-full w-full touch-none select-none overflow-hidden bg-phantix-950",
        dragging ? "cursor-grabbing" : "cursor-grab",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        className="absolute left-0 top-0 block"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`,
          transformOrigin: "0 0",
          willChange: "transform",
        }}
        role="img"
        aria-label="Live topology of the deployed backend"
      >
        <defs>
          <pattern id="ow-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="1.1" opacity="0.28" />
          </pattern>
        </defs>

        {/* deployment boundaries: the unit that shares a lifecycle, not a slide deck */}
        {layout.lanes.map((lane) => {
          const laneHot = hoverLane === lane.id;
          return (
            <g
              key={lane.id}
              onPointerEnter={() => setHoverLane(lane.id)}
              onPointerLeave={() => setHoverLane((l) => (l === lane.id ? null : l))}
            >
              <rect
                x={lane.x}
                y={lane.y}
                width={lane.w}
                height={lane.h}
                rx={10}
                fill={laneHot ? "#0b131c" : "#080c11"}
                stroke={laneHot ? "#38bdf8" : "#161f2a"}
                strokeWidth={laneHot ? 1.6 : 1}
              />
              <text x={lane.x + 11} y={lane.y + 18} fill="#5b6675" fontSize={10.5} letterSpacing={1.25} fontWeight={600}>
                {fitText(lane.label.toUpperCase(), lane.w - 22, 11.75)}
              </text>
              {lane.note && (
                <text x={lane.x + 11} y={lane.y + 30} fill="#2c3743" fontSize={8.6}>
                  {fitText(lane.note, lane.w - 22, 8.6)}
                </text>
              )}
            </g>
          );
        })}

        {/* links: thick where the two ends are hot, otherwise a quiet wire */}
        <g style={{ pointerEvents: "none" }}>
          {layout.links.map((link, i) => {
            const isHoverLit = active ? active.links.has(i) : false;
            const dim = !!active && !isHoverLit;
            const isAttention = hot.has(link.edge.from) || hot.has(link.edge.to);
            const unverified = link.edge.unverified === true;
            const lit = active ? isHoverLit : isAttention;
            const opacity = unverified
              ? isHoverLit
                ? 0.9
                : dim
                  ? 0.06
                  : 0.4
              : lit
                ? 0.85
                : dim
                  ? 0.05
                  : 0.22;
            return (
              <path
                key={`${link.edge.from}-${link.edge.to}-${i}`}
                d={link.d}
                fill="none"
                stroke={unverified ? "#f87171" : EDGE_COLOR[link.edge.kind] ?? "#64748b"}
                strokeWidth={lit ? 2.4 : 1.1}
                strokeDasharray={unverified ? "5 4" : undefined}
                opacity={opacity}
              />
            );
          })}
        </g>

        {/* units */}
        {Array.from(layout.nodes.values()).map((node) => {
          const state = states.get(node.id);
          const unit = node.unit;
          const kindColor = KIND_COLOR[unit.kind] ?? "#64748b";
          const level = state?.level ?? "unknown";
          const fill = level === "unknown" ? "#0d1219" : LEVEL_COLOR[level];
          const isHot = hot.has(node.id);
          const isSelected = selected === node.id;
          const dimmed = !!active && !active.nodes.has(node.id);
          const nameSize = node.nested ? NESTED_NAME_SIZE : NAME_SIZE;
          const tag = node.nested ? "" : (GROUP_LABEL[unit.kind] ?? unit.kind).toUpperCase();
          const tagW = tag ? textWidth(tag, TAG_SIZE) : 0;
          const nameRoom = node.w - 10 - 9 - (tagW ? tagW + 8 : 0);
          const lines = (node.nested ? [unit.label] : wrapLabel(unit.label, 30)).slice(0, 2);
          const membersLine =
            unit.members?.length && !node.nested
              ? fitText(
                  `${unit.members.slice(0, 3).join(" · ")}${unit.members.length > 3 ? `  +${unit.members.length - 3}` : ""}`,
                  node.w - 19,
                  8.2,
                )
              : null;

          return (
            <g
              key={node.id}
              opacity={dimmed ? 0.12 : 1}
              onPointerEnter={() => setHoverNode(node.id)}
              onPointerLeave={() => setHoverNode((n) => (n === node.id ? null : n))}
              onClick={() => {
                if (didPan.current) return;
                onSelect?.(node.id);
              }}
              style={{ cursor: onSelect ? "pointer" : "default" }}
            >
              <title>
                {[
                  unit.label,
                  `${unit.kind} · ${unit.boundary}${unit.version ? ` · v${unit.version}` : ""}`,
                  unit.replicas !== undefined ? `replicas: ${unit.replicas}` : null,
                  unit.concurrency !== undefined ? `concurrency: ${unit.concurrency}` : null,
                  state?.metrics?.length ? `now: ${state.metrics.join(" · ")}` : "not reported by this payload",
                  unit.unverified ? "UNVERIFIED — not confirmable from the deployment" : null,
                  unit.note ?? null,
                ]
                  .filter(Boolean)
                  .join("\n")}
              </title>

              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={5}
                fill={fill}
                fillOpacity={level === "unknown" ? 1 : node.nested ? 0.35 : 0.5}
                stroke={isSelected ? "#a5e8ff" : isHot ? "#38bdf8" : level === "unknown" ? kindColor : LEVEL_COLOR[level]}
                strokeOpacity={isSelected || isHot ? 1 : node.nested ? 0.34 : level === "unknown" ? 0.5 : 0.9}
                strokeWidth={isSelected ? 2 : isHot ? 1.8 : 1.1}
              />
              {unit.unverified && (
                <rect x={node.x} y={node.y} width={node.w} height={node.h} rx={5} fill="url(#ow-hatch)" />
              )}
              <rect
                x={node.x}
                y={node.y}
                width={2.6}
                height={node.h}
                rx={1.3}
                fill={kindColor}
                fillOpacity={node.nested ? 0.5 : 0.9}
              />

              {lines.map((raw, li) => (
                <text
                  key={li}
                  x={node.x + 10}
                  y={node.y + 14 + li * 12}
                  fill={node.nested ? "#c3cfdd" : "#e6edf5"}
                  fontSize={nameSize}
                  fontWeight={node.nested ? 400 : 600}
                >
                  {li === lines.length - 1 ? fitText(raw, nameRoom, nameSize) : raw}
                </text>
              ))}

              {tag && (
                <text
                  x={node.x + node.w - 9}
                  y={node.y + 14}
                  fill={kindColor}
                  fontSize={TAG_SIZE}
                  textAnchor="end"
                  fillOpacity={0.85}
                >
                  {tag}
                </text>
              )}

              {membersLine && (
                <text x={node.x + 10} y={node.y + 14 + lines.length * 12} fill="#55616f" fontSize={8.2}>
                  {membersLine}
                </text>
              )}

              {/* occupancy gauge: how full this unit is right now */}
              {state && state.level !== "unknown" && (
                <rect
                  x={node.x}
                  y={node.y + node.h - 2.5}
                  width={node.w}
                  height={2.5}
                  rx={1.2}
                  fill={LEVEL_COLOR[state.level]}
                  fillOpacity={level === "idle" ? 0.35 : 0.95}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* controls — stop propagation so pressing them never starts a pan */}
      <div
        className="absolute right-3 top-3 z-10 flex flex-col items-center gap-1.5"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={CTL} title="Zoom in" onClick={() => zoomCenter(1.25)}>
          <ZoomIn size={14} />
        </button>
        <button type="button" className={CTL} title="Zoom out" onClick={() => zoomCenter(0.8)}>
          <ZoomOut size={14} />
        </button>
        <button type="button" className={CTL} title="Reset view" onClick={fitView}>
          <RotateCcw size={14} />
        </button>
        {onToggleFullscreen && (
          <button
            type="button"
            className={CTL}
            title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
            onClick={onToggleFullscreen}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        )}
        <span className="rounded bg-phantix-900/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 backdrop-blur">
          {Math.round(view.z * 100)}%
        </span>
      </div>

      <div className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-slate-600">
        drag to pan · scroll to zoom · hover a card or boundary to trace what it touches
      </div>
    </div>
  );
}
