import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteGraph } from "./links";

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

interface Props {
  graph: NoteGraph;
  colors: Map<number, string>;
  currentId?: number | null;
  untitled: string;
  onOpen: (id: number) => void;
  height?: number;
}

const LINK_LENGTH = 90;

/** Obsidian-style note graph: force layout, drag nodes, pan with the background, zoom with the wheel. */
export function Graph({ graph, colors, currentId, untitled, onOpen, height = 520 }: Props) {
  const bodies = useRef(new Map<number, Body>());
  const alpha = useRef(1);
  const [, setFrame] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: height });
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const drag = useRef<{ kind: "node" | "pan"; id?: number; startX: number; startY: number; moved: boolean; vx?: number; vy?: number } | null>(null);

  const neighbors = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const e of graph.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set());
      if (!m.has(e.target)) m.set(e.target, new Set());
      m.get(e.source)!.add(e.target);
      m.get(e.target)!.add(e.source);
    }
    return m;
  }, [graph]);

  // Keep positions of notes that still exist; place new ones on a spiral.
  useEffect(() => {
    const map = bodies.current;
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
    graph.nodes.forEach((n, i) => {
      if (!map.has(n.id)) {
        const angle = i * 2.4;
        const r = 30 + 12 * Math.sqrt(i);
        map.set(n.id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r, vx: 0, vy: 0, fixed: false });
      }
    });
    alpha.current = 1;
  }, [graph]);

  useEffect(() => {
    let raf = 0;
    const step = () => {
      const map = bodies.current;
      const list = [...map.entries()];
      if (alpha.current > 0.005 && list.length) {
        const a = alpha.current;
        for (let i = 0; i < list.length; i++) {
          const [, p] = list[i];
          for (let j = i + 1; j < list.length; j++) {
            const [, q] = list[j];
            let dx = p.x - q.x;
            let dy = p.y - q.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) {
              dx = Math.random() - 0.5;
              dy = Math.random() - 0.5;
              d2 = 1;
            }
            const f = (2200 / d2) * a;
            const d = Math.sqrt(d2);
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
            q.vx -= (dx / d) * f;
            q.vy -= (dy / d) * f;
          }
        }
        for (const e of graph.edges) {
          const p = map.get(e.source);
          const q = map.get(e.target);
          if (!p || !q) continue;
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const f = (d - LINK_LENGTH) * 0.04 * a;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
          q.vx -= (dx / d) * f;
          q.vy -= (dy / d) * f;
        }
        for (const [, p] of list) {
          p.vx -= p.x * 0.012 * a;
          p.vy -= p.y * 0.012 * a;
          if (!p.fixed) {
            p.x += p.vx;
            p.y += p.vy;
          }
          p.vx *= 0.6;
          p.vy *= 0.6;
        }
        alpha.current *= 0.985;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  const toGraph = (clientX: number, clientY: number) => {
    const rect = svg.current!.getBoundingClientRect();
    return { x: (clientX - rect.left - rect.width / 2 - view.x) / view.k, y: (clientY - rect.top - rect.height / 2 - view.y) / view.k };
  };

  const radius = (degree: number) => 5 + Math.min(10, Math.sqrt(degree) * 3);
  const focus = hover ?? currentId ?? null;
  const lit = (id: number) => focus == null || id === focus || neighbors.get(focus)?.has(id);
  const showLabels = graph.nodes.length <= 60;

  return (
    <svg
      ref={svg}
      className="graph"
      style={{ height }}
      role="img"
      aria-label="graph"
      onWheel={(e) => {
        const k = Math.min(4, Math.max(0.25, view.k * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        setView({ ...view, k });
      }}
      onPointerDown={(e) => {
        const id = (e.target as SVGElement).closest<SVGGElement>("[data-node]")?.dataset.node;
        (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
        if (id) {
          const body = bodies.current.get(Number(id));
          if (body) body.fixed = true;
          drag.current = { kind: "node", id: Number(id), startX: e.clientX, startY: e.clientY, moved: false };
        } else {
          drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, moved: false, vx: view.x, vy: view.y };
        }
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
        if (d.kind === "node" && d.id != null) {
          const body = bodies.current.get(d.id);
          if (!body) return;
          const p = toGraph(e.clientX, e.clientY);
          body.x = p.x;
          body.y = p.y;
          alpha.current = Math.max(alpha.current, 0.3);
          setFrame((f) => f + 1);
        } else {
          setView({ ...view, x: d.vx! + e.clientX - d.startX, y: d.vy! + e.clientY - d.startY });
        }
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (d?.kind === "node" && d.id != null) {
          const body = bodies.current.get(d.id);
          if (body) body.fixed = false;
          if (!d.moved) onOpen(d.id);
        }
      }}
    >
      <g transform={`translate(${size.w / 2 + view.x},${size.h / 2 + view.y}) scale(${view.k})`}>
        {graph.edges.map((e) => {
          const p = bodies.current.get(e.source);
          const q = bodies.current.get(e.target);
          if (!p || !q) return null;
          const on = focus != null && (e.source === focus || e.target === focus);
          return <line key={`${e.source}-${e.target}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className={`edge ${on ? "on" : ""} ${focus != null && !on ? "dim" : ""}`} />;
        })}
        {graph.nodes.map((n) => {
          const b = bodies.current.get(n.id);
          if (!b) return null;
          const r = radius(n.degree);
          const isLit = lit(n.id);
          return (
            <g
              key={n.id}
              data-node={n.id}
              transform={`translate(${b.x},${b.y})`}
              className={`node ${isLit ? "" : "dim"} ${n.id === currentId ? "current" : ""}`}
              onPointerEnter={() => setHover(n.id)}
              onPointerLeave={() => setHover(null)}
            >
              <circle r={r} fill={colors.get(n.subjectId) ?? "var(--accent)"} />
              {(showLabels || isLit) && (
                <text y={r + 13} textAnchor="middle">
                  {(n.title || untitled).length > 28 ? `${(n.title || untitled).slice(0, 27)}…` : n.title || untitled}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
