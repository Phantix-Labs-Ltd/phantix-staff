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
 */
import { useMemo } from "react";

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
}

const NAME_SIZE = 11;
const NESTED_NAME_SIZE = 9.6;
const TAG_SIZE = 8.4;

export default function OverwatchMap({ states, highlight = [], selected, onSelect, className }: Props) {
  const layout = useMemo(() => computeLayout(), []);
  const hot = useMemo(() => new Set(highlight), [highlight]);

  return (
    <div className={cx("relative h-full w-full overflow-auto bg-phantix-950", className)}>
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        className="block"
        role="img"
        aria-label="Live topology of the deployed backend"
      >
        <defs>
          <pattern id="ow-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ef4444" strokeWidth="1.1" opacity="0.28" />
          </pattern>
        </defs>

        {/* deployment boundaries: the unit that shares a lifecycle, not a slide deck */}
        {layout.lanes.map((lane) => (
          <g key={lane.id}>
            <rect x={lane.x} y={lane.y} width={lane.w} height={lane.h} rx={10} fill="#080c11" stroke="#161f2a" />
            <text x={lane.x + 11} y={lane.y + 18} fill="#5b6675" fontSize={10.5} letterSpacing={1.25} fontWeight={600}>
              {fitText(lane.label.toUpperCase(), lane.w - 22, 11.75)}
            </text>
            {lane.note && (
              <text x={lane.x + 11} y={lane.y + 30} fill="#2c3743" fontSize={8.6}>
                {fitText(lane.note, lane.w - 22, 8.6)}
              </text>
            )}
          </g>
        ))}

        {/* links: thick where the two ends are hot, otherwise a quiet wire */}
        {layout.links.map((link, i) => {
          const lit = hot.has(link.edge.from) || hot.has(link.edge.to);
          const unverified = link.edge.unverified === true;
          return (
            <path
              key={`${link.edge.from}-${link.edge.to}-${i}`}
              d={link.d}
              fill="none"
              stroke={unverified ? "#f87171" : EDGE_COLOR[link.edge.kind] ?? "#64748b"}
              strokeWidth={lit ? 2.4 : 1.1}
              strokeDasharray={unverified ? "5 4" : undefined}
              opacity={unverified ? 0.4 : lit ? 0.85 : 0.22}
            />
          );
        })}

        {/* units */}
        {Array.from(layout.nodes.values()).map((node) => {
          const state = states.get(node.id);
          const unit = node.unit;
          const kindColor = KIND_COLOR[unit.kind] ?? "#64748b";
          const level = state?.level ?? "unknown";
          const fill = level === "unknown" ? "#0d1219" : LEVEL_COLOR[level];
          const isHot = hot.has(node.id);
          const isSelected = selected === node.id;
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
              onClick={() => onSelect?.(node.id)}
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
    </div>
  );
}
