/**
 * Layout for the overwatch map.
 *
 * A deliberate port of the standalone map's layout, carrying over the two lessons
 * that mattered there:
 *
 *  * **Boxes are sized for the label they hold**, including the kind tag drawn on the
 *    right. A fixed character count for the name plus a fixed right offset for the tag
 *    is what let text collide and escape its box.
 *  * **The renderer wraps the way the layout measured.** Measuring a wrapped label and
 *    then drawing one line ellipsises names that would have fitted.
 *
 * Layout is computed from the topology, never hand-placed: boundaries become lanes,
 * units inside a lane are ordered by the barycentre of their neighbours (which removes
 * most long crossing links), lanes wrap into rows to keep the canvas near 16:9, and a
 * unit that another unit is colocated in is drawn *inside* its box.
 */
import {
  BOUNDARIES,
  EDGES,
  UNITS,
  type TopologyEdge,
  type TopologyUnit,
} from "./overwatchTopology";

// ── text metrics: monospace advance ≈ 0.62em, matching the standalone map
export const CHAR_W = 0.62;
export const NAME_FONT = 11.5;
export const TAG_FONT = 8.4;
export const PAD_L = 10;
export const PAD_R = 9;
export const TAG_GAP = 8;

export const textWidth = (text: string, size: number) => String(text).length * size * CHAR_W;

export function wrapLabel(text: string, max: number): string[] {
  const words = String(text).split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((`${cur} ${w}`).trim().length > max) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = `${cur} ${w}`.trim();
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}

/** Truncate to fit, with an ellipsis. Never returns text wider than `maxWidth`. */
export function fitText(text: string, maxWidth: number, size: number): string {
  const t = String(text ?? "");
  if (maxWidth <= 0) return "";
  if (textWidth(t, size) <= maxWidth) return t;
  const keep = Math.max(1, Math.floor(maxWidth / (size * CHAR_W)) - 1);
  return `${t.slice(0, keep).trimEnd()}…`;
}

// ── sizing
const CELL_W = 150;
const CELL_H = 20;
const CELL_GAP = 4;
const colsFor = (n: number) => (n > 26 ? 3 : n > 12 ? 2 : 1);

export interface SizedUnit extends TopologyUnit {
  parent?: string;
  children: SizedUnit[];
  lines: string[];
  tag: string;
  w: number;
  h: number;
  header: number;
}

function wrapLabelFor(u: TopologyUnit): string[] {
  return wrapLabel(u.label, 30);
}

function measure(u: TopologyUnit, children: SizedUnit[]): { w: number; h: number; header: number } {
  const lines = wrapLabelFor(u);
  const longest = Math.max(...lines.map((l) => l.length));
  const tag = (u.parent ? "" : GROUP_LABEL[u.kind] ?? u.kind).toUpperCase();
  const tagW = tag ? textWidth(tag, TAG_FONT) : 0;
  let w = Math.max(
    138,
    Math.min(304, longest * (NAME_FONT * CHAR_W) + PAD_L + PAD_R + (tagW ? tagW + TAG_GAP : 0)),
  );
  let h = 24 + (lines.length - 1) * 12;
  if (u.members?.length) h += Math.min(2, Math.ceil(u.members.length / 4)) * 11 + 2;
  if (children.length) {
    const cols = colsFor(children.length);
    const rows = Math.ceil(children.length / cols);
    w = Math.max(w, cols * CELL_W + (cols - 1) * CELL_GAP + 18 + 10);
    h = Math.max(h, 26 + 14 + rows * (CELL_H + CELL_GAP) - CELL_GAP + 14);
  }
  return { w, h: Math.max(40, h), header: children.length ? 26 : 0 };
}

/** Kind → the group tag drawn on the right of a box, mirroring the legend. */
export const GROUP_LABEL: Record<string, string> = {
  runner: "runners",
  engine: "engines",
  supervisor: "supervisors",
  "specialist-agent": "agents",
  "mcp-server": "mcp",
  "mcp-client": "mcp",
  "model-endpoint": "models",
  queue: "queues",
  bus: "queues",
  gateway: "gateways",
  "memory-store": "stores",
  "vector-store": "stores",
  "object-store": "stores",
  cache: "stores",
  observer: "observers",
  sandbox: "sandboxes",
  registry: "supervisors",
  stray: "strays",
  target: "targets",
};

// ── layout
export interface NodeBox {
  id: string;
  unit: SizedUnit;
  x: number;
  y: number;
  w: number;
  h: number;
  nested: boolean;
}

export interface LinkPath {
  edge: TopologyEdge;
  d: string;
  s: { x: number; y: number };
  t: { x: number; y: number };
  c1: { x: number; y: number };
  c2: { x: number; y: number };
}

export interface LaneBox {
  id: string;
  label: string;
  note?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OverwatchLayout {
  nodes: Map<string, NodeBox>;
  links: LinkPath[];
  lanes: LaneBox[];
  width: number;
  height: number;
}

const BOUNDARY_ORDER = [
  "edge",
  "coolify",
  "core",
  "queues",
  "agi",
  "sandbox",
  "mcp",
  "hostsvc",
  "strays",
  "providers",
  "egress",
  "targets",
];

export function computeLayout(): OverwatchLayout {
  // attach children to the unit they are colocated in
  const sized = new Map<string, SizedUnit>();
  for (const u of UNITS) {
    sized.set(u.id, { ...u, children: [], lines: wrapLabelFor(u), tag: "", w: 0, h: 0, header: 0 });
  }
  for (const u of UNITS) {
    if (u.parent && sized.has(u.parent)) sized.get(u.parent)!.children.push(sized.get(u.id)!);
  }
  for (const u of Array.from(sized.values())) {
    const m = measure(u, u.children);
    u.w = m.w;
    u.h = m.h;
    u.header = m.header;
  }

  const topLevel = Array.from(sized.values()).filter((u) => !u.parent || !sized.has(u.parent));
  const byBoundary = new Map<string, SizedUnit[]>();
  for (const u of topLevel) {
    const list = byBoundary.get(u.boundary) ?? [];
    list.push(u);
    byBoundary.set(u.boundary, list);
  }
  const laneOrder = BOUNDARY_ORDER.filter((b) => byBoundary.has(b)).concat(
    Array.from(byBoundary.keys()).filter((b) => !BOUNDARY_ORDER.includes(b)),
  );
  const boundaryRank = new Map(laneOrder.map((b, i) => [b, i]));

  // ── order units inside a boundary by the barycentre of their neighbours, which
  //    pulls connected things together and shortens the links between them
  const adj = new Map<string, string[]>();
  for (const e of EDGES) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    if (!adj.has(e.to)) adj.set(e.to, []);
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const rankOf = (id: string) => {
    const u = sized.get(id);
    return u && boundaryRank.has(u.boundary) ? boundaryRank.get(u.boundary)! : laneOrder.length;
  };
  for (const list of Array.from(byBoundary.values())) {
    const score = new Map<string, number>();
    for (const u of list) {
      const neighbours = adj.get(u.id) ?? [];
      const ranks = neighbours.map(rankOf);
      const own = boundaryRank.get(u.boundary) ?? laneOrder.length;
      score.set(
        u.id,
        ranks.length ? ranks.reduce((a, c) => a + c, 0) / ranks.length : own,
      );
    }
    list.sort((a, c) => score.get(a.id)! - score.get(c.id)! || a.label.localeCompare(c.label));
  }

  const GAP = 15;
  const LANE_PAD = 20;
  const LANE_TITLE = 30;
  const LANE_GAP = 32;
  const ROW_BUDGET = 2520;
  const TARGET_EXTENT = 1120;

  const nodes = new Map<string, NodeBox>();
  const lanes: LaneBox[] = [];

  const planLane = (list: SizedUnit[]) => {
    const maxW = Math.max(...list.map((i) => i.w));
    const totalH = list.reduce((a, i) => a + i.h + GAP, -GAP);
    const colCount = Math.max(1, Math.round(totalH / Math.max(420, TARGET_EXTENT)));
    const per = totalH / colCount;
    const columns: SizedUnit[][] = [];
    let cur: SizedUnit[] = [];
    let curH = 0;
    for (const u of list) {
      if (curH + u.h + GAP > per && cur.length && columns.length < colCount - 1) {
        columns.push(cur);
        cur = [];
        curH = 0;
      }
      cur.push(u);
      curH += u.h + GAP;
    }
    if (cur.length) columns.push(cur);
    const contentH = Math.max(
      ...columns.map((c) => c.reduce((a, i) => a + i.h + GAP, -GAP)),
    );
    const contentW = columns.length * maxW + (columns.length - 1) * GAP;
    return {
      columns,
      maxW,
      boxW: contentW + LANE_PAD * 2,
      boxH: contentH + LANE_TITLE + LANE_PAD * 2,
    };
  };

  let x = 40;
  let y = 40;
  let rowH = 0;
  for (const b of laneOrder) {
    const plan = planLane(byBoundary.get(b)!);
    if (x > 40 && x + plan.boxW > ROW_BUDGET + 40) {
      x = 40;
      y += rowH + LANE_GAP;
      rowH = 0;
    }
    const meta = BOUNDARIES.find((z) => z.id === b);
    lanes.push({
      id: b,
      label: meta?.label ?? b,
      note: meta?.note,
      x,
      y,
      w: plan.boxW,
      h: plan.boxH,
    });
    plan.columns.forEach((col, ci) => {
      let cy = y + LANE_TITLE + LANE_PAD;
      const cx = x + LANE_PAD + ci * (plan.maxW + GAP);
      for (const u of col) {
        nodes.set(u.id, { id: u.id, unit: u, x: cx, y: cy, w: u.w, h: u.h, nested: false });
        cy += u.h + GAP;
      }
    });
    x += plan.boxW + LANE_GAP;
    rowH = Math.max(rowH, plan.boxH);
  }

  // ── children inside their container
  for (const u of Array.from(sized.values())) {
    if (!u.children.length) continue;
    const host = nodes.get(u.id);
    if (!host) continue;
    const cols = colsFor(u.children.length);
    u.children.forEach((c, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      nodes.set(c.id, {
        id: c.id,
        unit: c,
        x: host.x + 10 + col * (CELL_W + CELL_GAP),
        y: host.y + u.header + 10 + row * (CELL_H + CELL_GAP),
        w: CELL_W,
        h: CELL_H,
        nested: true,
      });
    });
  }

  // ── link paths between facing sides of the two boxes
  const links: LinkPath[] = [];
  for (const e of EDGES) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) continue;
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = bc.x - ac.x;
    const dy = bc.y - ac.y;
    let s: { x: number; y: number };
    let t: { x: number; y: number };
    if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
      s = { x: dx >= 0 ? a.x + a.w : a.x, y: ac.y };
      t = { x: dx >= 0 ? b.x : b.x + b.w, y: bc.y };
    } else {
      s = { x: ac.x, y: dy >= 0 ? a.y + a.h : a.y };
      t = { x: bc.x, y: dy >= 0 ? b.y : b.y + b.h };
    }
    const cx = Math.max(38, Math.abs(t.x - s.x) * 0.44);
    const cy = Math.max(38, Math.abs(t.y - s.y) * 0.44);
    const horiz = Math.abs(t.x - s.x) >= Math.abs(t.y - s.y);
    const c1 = horiz
      ? { x: s.x + (t.x > s.x ? cx : -cx), y: s.y }
      : { x: s.x, y: s.y + (t.y > s.y ? cy : -cy) };
    const c2 = horiz
      ? { x: t.x - (t.x > s.x ? cx : -cx), y: t.y }
      : { x: t.x, y: t.y - (t.y > s.y ? cy : -cy) };
    links.push({
      edge: e,
      d: `M ${s.x} ${s.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${t.x} ${t.y}`,
      s,
      t,
      c1,
      c2,
    });
  }

  const width = Math.max(...lanes.map((l) => l.x + l.w)) + 40;
  const height = Math.max(...lanes.map((l) => l.y + l.h)) + 40;
  return { nodes, links, lanes, width, height };
}
