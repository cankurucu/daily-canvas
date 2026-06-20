import React, { useState, useRef, useCallback, useEffect } from "react"
import { createPortal } from "react-dom"
import { Pin } from "lucide-react"
import { RoughRect, RoughCircle, RoughArrow, RoughDiamond, RoughCylinder, RoughCloud, RoughQueue } from "./CanvasShapes"
import { useCanvasStore, type ShapeData, type StrokeStyle } from "../store/useCanvasStore"
import { clipboard } from "../clipboard"
import type { Tool } from "./FloatingToolbar"

// ─── Style constants ────────────────────────────────────────────────────────

const STROKE_COLORS = [
  '#1E293B', '#64748B', '#6366F1', '#3B82F6',
  '#10B981', '#F59E0B', '#F97316', '#EF4444',
]

const FILL_OPTIONS: { value: string; preview: string }[] = [
  { value: 'none',                    preview: 'transparent' },
  { value: 'rgba(241,245,249,0.8)',   preview: '#F1F5F9' },
  { value: 'rgba(238,242,255,0.8)',   preview: '#EEF2FF' },
  { value: 'rgba(219,234,254,0.8)',   preview: '#DBEAFE' },
  { value: 'rgba(209,250,229,0.8)',   preview: '#D1FAE5' },
  { value: 'rgba(254,249,195,0.8)',   preview: '#FEF9C3' },
  { value: 'rgba(255,237,213,0.8)',   preview: '#FFEDD5' },
  { value: 'rgba(254,226,226,0.8)',   preview: '#FEE2E2' },
]

// ─── Types ──────────────────────────────────────────────────────────────────

type ShapePreviewType =
  | { type: "rect"; x: number; y: number; w: number; h: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { type: "diamond"; x: number; y: number; w: number; h: number }
  | { type: "cylinder"; x: number; y: number; w: number; h: number }
  | { type: "cloud"; x: number; y: number; w: number; h: number }
  | { type: "queue"; x: number; y: number; w: number; h: number }

interface DrawingStyle {
  stroke: string
  fill: string
  strokeWidth: number
  strokeStyle: StrokeStyle
}

interface DrawingLayerProps {
  activeTool: Tool
  date: string  // YYYY-MM-DD
  onCreateNote: (x: number, y: number) => void
  viewTransform: { x: number; y: number; scale: number }
  selectedNoteIds: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSVGCoords(svgEl: SVGSVGElement | null, clientX: number, clientY: number, vt: { x: number; y: number; scale: number }) {
  if (!svgEl) return { x: clientX / vt.scale, y: clientY / vt.scale }
  const rect = svgEl.getBoundingClientRect()
  return { x: (clientX - rect.left - vt.x) / vt.scale, y: (clientY - rect.top - vt.y) / vt.scale }
}

const DRAWING_TOOLS: Tool[] = ["pen", "rect", "circle", "arrow", "diamond", "cylinder", "cloud", "queue"]
const SNAP_RADIUS = 28

function getShapeCenter(shape: ShapeData): { x: number; y: number } {
  const dx = shape.dx ?? 0, dy = shape.dy ?? 0
  if ((shape.type === "rect" || shape.type === "diamond" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && shape.rect)
    return { x: shape.rect.x + shape.rect.w / 2 + dx, y: shape.rect.y + shape.rect.h / 2 + dy }
  if (shape.type === "circle" && shape.circle)
    return { x: shape.circle.cx + dx, y: shape.circle.cy + dy }
  return { x: dx, y: dy }
}

function getShapeEdgePoint(shape: ShapeData, towardX: number, towardY: number): { x: number; y: number } {
  const center = getShapeCenter(shape)
  const dx = towardX - center.x, dy = towardY - center.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 1) return center
  if (shape.type === "circle" && shape.circle) {
    const r = shape.circle.r
    return { x: center.x + (dx / dist) * r, y: center.y + (dy / dist) * r }
  }
  if (shape.type === "diamond" && shape.rect) {
    const hw = shape.rect.w / 2, hh = shape.rect.h / 2
    const denom = Math.abs(dx) / hw + Math.abs(dy) / hh
    return { x: center.x + dx / denom, y: center.y + dy / denom }
  }
  if ((shape.type === "rect" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && shape.rect) {
    const hw = shape.rect.w / 2, hh = shape.rect.h / 2
    const tX = hw / Math.abs(dx), tY = hh / Math.abs(dy)
    const t = Math.min(tX, tY)
    return { x: center.x + t * dx, y: center.y + t * dy }
  }
  return center
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax, aby = by - ay
  const len2 = abx * abx + aby * aby
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2))
  const sx = ax + t * abx, sy = ay + t * aby
  return { dist: Math.sqrt((px - sx) ** 2 + (py - sy) ** 2), snapPoint: { x: sx, y: sy } }
}

function distanceToShapeBorder(px: number, py: number, shape: ShapeData): { dist: number; snapPoint: { x: number; y: number } } {
  const sdx = shape.dx ?? 0, sdy = shape.dy ?? 0
  if (shape.type === "circle" && shape.circle) {
    const cx = shape.circle.cx + sdx, cy = shape.circle.cy + sdy, r = shape.circle.r
    const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
    const dist = Math.abs(d - r)
    const snapPoint = d < 1 ? { x: cx + r, y: cy } : { x: cx + (px - cx) / d * r, y: cy + (py - cy) / d * r }
    return { dist, snapPoint }
  }
  if (shape.type === "diamond" && shape.rect) {
    const rx = shape.rect.x + sdx, ry = shape.rect.y + sdy, rw = shape.rect.w, rh = shape.rect.h
    const cx = rx + rw / 2, cy = ry + rh / 2
    const top = { x: cx, y: ry }, right = { x: rx + rw, y: cy }, bot = { x: cx, y: ry + rh }, left = { x: rx, y: cy }
    const segs = [
      distToSeg(px, py, top.x, top.y, right.x, right.y),
      distToSeg(px, py, right.x, right.y, bot.x, bot.y),
      distToSeg(px, py, bot.x, bot.y, left.x, left.y),
      distToSeg(px, py, left.x, left.y, top.x, top.y),
    ]
    return segs.reduce((a, b) => a.dist < b.dist ? a : b)
  }
  if ((shape.type === "rect" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && shape.rect) {
    const rx = shape.rect.x + sdx, ry = shape.rect.y + sdy, rw = shape.rect.w, rh = shape.rect.h
    const inside = px >= rx && px <= rx + rw && py >= ry && py <= ry + rh
    let snapX: number, snapY: number
    if (inside) {
      const dLeft = px - rx, dRight = rx + rw - px, dTop = py - ry, dBottom = ry + rh - py
      const minD = Math.min(dLeft, dRight, dTop, dBottom)
      if (minD === dLeft)       { snapX = rx;      snapY = py }
      else if (minD === dRight) { snapX = rx + rw; snapY = py }
      else if (minD === dTop)   { snapX = px;      snapY = ry }
      else                      { snapX = px;      snapY = ry + rh }
    } else {
      snapX = Math.max(rx, Math.min(px, rx + rw))
      snapY = Math.max(ry, Math.min(py, ry + rh))
    }
    return { dist: Math.sqrt((px - snapX) ** 2 + (py - snapY) ** 2), snapPoint: { x: snapX, y: snapY } }
  }
  return { dist: Infinity, snapPoint: { x: px, y: py } }
}

function findSnapTarget(px: number, py: number, shapes: ShapeData[], excludeId?: string) {
  let best: ShapeData | null = null, bestSnap = { x: px, y: py }, bestDist = Infinity
  for (const s of shapes) {
    if (s.id === excludeId || s.type === "arrow" || s.type === "path") continue
    const { dist, snapPoint } = distanceToShapeBorder(px, py, s)
    if (dist < SNAP_RADIUS && dist < bestDist) { best = s; bestSnap = snapPoint; bestDist = dist }
  }
  return best ? { shape: best, snapPoint: bestSnap } : null
}

function getComputedArrowEndpoints(shape: ShapeData, allShapes: ShapeData[]) {
  if (shape.type !== "arrow" || !shape.arrow) return { x1: 0, y1: 0, x2: 0, y2: 0 }
  const adx = shape.dx ?? 0, ady = shape.dy ?? 0
  let x1 = shape.arrow.x1 + adx, y1 = shape.arrow.y1 + ady
  let x2 = shape.arrow.x2 + adx, y2 = shape.arrow.y2 + ady
  const src = shape.sourceId ? allShapes.find(s => s.id === shape.sourceId) : null
  const tgt = shape.targetId ? allShapes.find(s => s.id === shape.targetId) : null
  const srcCenter = src ? getShapeCenter(src) : null
  const tgtCenter = tgt ? getShapeCenter(tgt) : null
  if (src) { const ep = getShapeEdgePoint(src, tgtCenter?.x ?? x2, tgtCenter?.y ?? y2); x1 = ep.x; y1 = ep.y }
  if (tgt) { const ep = getShapeEdgePoint(tgt, srcCenter?.x ?? x1, srcCenter?.y ?? y1); x2 = ep.x; y2 = ep.y }
  return { x1, y1, x2, y2 }
}

function getShapeBounds(shape: ShapeData, allShapes: ShapeData[] = []) {
  const dx = shape.dx ?? 0, dy = shape.dy ?? 0, pad = 6
  if (shape.type === "rect" && shape.rect)
    return { bx: shape.rect.x + dx - pad, by: shape.rect.y + dy - pad, bw: shape.rect.w + pad * 2, bh: shape.rect.h + pad * 2 }
  if (shape.type === "circle" && shape.circle) {
    const { cx, cy, r } = shape.circle
    return { bx: cx + dx - r - pad, by: cy + dy - r - pad, bw: (r + pad) * 2, bh: (r + pad) * 2 }
  }
  if (shape.type === "arrow") {
    const { x1, y1, x2, y2 } = getComputedArrowEndpoints(shape, allShapes)
    const p = 16
    return { bx: Math.min(x1, x2) - p, by: Math.min(y1, y2) - p, bw: Math.abs(x2 - x1) + p * 2, bh: Math.abs(y2 - y1) + p * 2 }
  }
  if (shape.type === "path" && shape.path) {
    const nums = shape.path.d.match(/-?\d+(?:\.\d+)?/g)
    if (!nums || nums.length < 4) return null
    const xs: number[] = [], ys: number[] = []
    for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(parseFloat(nums[i])); ys.push(parseFloat(nums[i + 1])) }
    return { bx: Math.min(...xs) + dx - pad, by: Math.min(...ys) + dy - pad, bw: Math.max(...xs) - Math.min(...xs) + pad * 2, bh: Math.max(...ys) - Math.min(...ys) + pad * 2 }
  }
  if (shape.type === "text" && shape.rect) {
    const lineCount = (shape.text ?? " ").split("\n").length
    return { bx: shape.rect.x + dx - 4, by: shape.rect.y + dy - 22, bw: 260, bh: lineCount * 26 + 12 }
  }
  if ((shape.type === "diamond" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && shape.rect)
    return { bx: shape.rect.x + dx - pad, by: shape.rect.y + dy - pad, bw: shape.rect.w + pad * 2, bh: shape.rect.h + pad * 2 }
  return null
}

function getUnionBounds(ids: string[], shapes: ShapeData[], allShapes: ShapeData[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of ids) {
    const shape = shapes.find(s => s.id === id)
    if (!shape) continue
    const b = getShapeBounds(shape, allShapes)
    if (!b) continue
    minX = Math.min(minX, b.bx); minY = Math.min(minY, b.by)
    maxX = Math.max(maxX, b.bx + b.bw); maxY = Math.max(maxY, b.by + b.bh)
  }
  return minX === Infinity ? null : { bx: minX, by: minY, bw: maxX - minX, bh: maxY - minY }
}

function shapesInMarquee(shapes: ShapeData[], mx1: number, my1: number, mx2: number, my2: number, allShapes: ShapeData[]): string[] {
  const x1 = Math.min(mx1, mx2), y1 = Math.min(my1, my2)
  const x2 = Math.max(mx1, mx2), y2 = Math.max(my1, my2)
  if (x2 - x1 < 4 && y2 - y1 < 4) return []
  return shapes
    .filter(s => {
      const b = getShapeBounds(s, allShapes)
      return b ? (b.bx + b.bw > x1 && b.bx < x2 && b.by + b.bh > y1 && b.by < y2) : false
    })
    .map(s => s.id)
}

function getEditingBounds(shape: ShapeData, allShapes: ShapeData[] = []) {
  const dx = shape.dx ?? 0, dy = shape.dy ?? 0
  if (shape.type === "rect" && shape.rect)
    return { x: shape.rect.x + dx, y: shape.rect.y + dy, w: shape.rect.w, h: shape.rect.h }
  if (shape.type === "circle" && shape.circle) {
    const { cx, cy, r } = shape.circle
    return { x: cx + dx - r, y: cy + dy - r, w: r * 2, h: r * 2 }
  }
  if (shape.type === "arrow") {
    const { x1, y1, x2, y2 } = getComputedArrowEndpoints(shape, allShapes)
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
    return { x: cx - 90, y: cy - 36, w: 180, h: 56 }
  }
  if (shape.type === "text" && shape.rect)
    return { x: shape.rect.x + dx - 4, y: shape.rect.y + dy - 24, w: 320, h: 140 }
  if ((shape.type === "diamond" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && shape.rect)
    return { x: shape.rect.x + dx, y: shape.rect.y + dy, w: shape.rect.w, h: shape.rect.h }
  return null
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function ShapeText({ lines, cx, cy, color }: { lines: string[]; cx: number; cy: number; color: string }) {
  const lineH = 22, totalH = (lines.length - 1) * lineH
  return (
    <text textAnchor="middle" fontFamily="'DM Sans', system-ui, sans-serif" fontSize={17} fill={color} style={{ pointerEvents: "none" }}>
      {lines.map((line, i) => <tspan key={i} x={cx} y={cy - totalH / 2 + i * lineH}>{line}</tspan>)}
    </text>
  )
}

function ResizeHandle({ x, y, cursor, onMouseDown }: {
  x: number; y: number; cursor: string
  onMouseDown: (e: React.MouseEvent<SVGRectElement>) => void
}) {
  return (
    <rect
      x={x - 5} y={y - 5} width={10} height={10} rx={2}
      fill="#FFFFFF" stroke="#6366F1" strokeWidth={1.5}
      style={{ cursor, pointerEvents: "all" }}
      onMouseDown={onMouseDown}
    />
  )
}

function EndpointHandle({ cx, cy, connected, onMouseDown }: {
  cx: number; cy: number; connected: boolean
  onMouseDown: (e: React.MouseEvent<SVGCircleElement>) => void
}) {
  return (
    <circle cx={cx} cy={cy} r={7}
      fill={connected ? "#6366F1" : "#FFFFFF"} stroke="#6366F1" strokeWidth={2}
      style={{ cursor: 'crosshair', pointerEvents: 'all' }}
      onMouseDown={onMouseDown}
    />
  )
}

// ─── Style Panel (rendered via portal outside world transform) ───────────────

interface StylePanelProps {
  selectedIds: string[]
  shapes: ShapeData[]
  currentStyle: DrawingStyle
  onStyleChange: (updates: Partial<DrawingStyle>) => void
  onPin?: () => void
  isPinned?: boolean
}

function StylePanel({ selectedIds, shapes, currentStyle, onStyleChange, onPin, isPinned }: StylePanelProps) {
  const first = shapes.find(s => selectedIds.includes(s.id))
  const effectiveStroke = first?.stroke ?? currentStyle.stroke
  const effectiveFill = first?.fill ?? currentStyle.fill
  const effectiveWidth = first?.strokeWidth ?? currentStyle.strokeWidth
  const effectiveStyle = first?.strokeStyle ?? currentStyle.strokeStyle

  const swatch: React.CSSProperties = {
    width: 22, height: 22, borderRadius: 5, border: '1.5px solid transparent',
    cursor: 'pointer', flexShrink: 0,
  }
  const widthBtn: React.CSSProperties = {
    width: 34, height: 26, borderRadius: 5, border: '1.5px solid rgba(0,0,0,0.12)',
    backgroundColor: 'transparent', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const styleBtn: React.CSSProperties = { ...widthBtn, width: 40 }
  const divider = <div style={{ width: 1, height: 32, backgroundColor: 'rgba(0,0,0,0.08)', flexShrink: 0 }} />
  const label = (text: string) => (
    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 5, fontFamily: "'Inter', sans-serif" }}>
      {text}
    </div>
  )

  return createPortal(
    <div
      style={{
        position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)',
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(30,41,59,0.1)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        padding: '10px 14px',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        zIndex: 9999,
        userSelect: 'none',
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Stroke */}
      <div>
        {label('Stroke')}
        <div style={{ display: 'flex', gap: 3 }}>
          {STROKE_COLORS.map(c => (
            <button
              key={c}
              title={c}
              onClick={() => onStyleChange({ stroke: c })}
              style={{
                ...swatch,
                backgroundColor: c,
                border: effectiveStroke === c ? '2.5px solid #6366F1' : '1.5px solid rgba(0,0,0,0.12)',
                outline: effectiveStroke === c ? '2px solid rgba(99,102,241,0.25)' : 'none',
                outlineOffset: 1,
              }}
            />
          ))}
        </div>
      </div>

      {divider}

      {/* Fill */}
      <div>
        {label('Fill')}
        <div style={{ display: 'flex', gap: 3 }}>
          {FILL_OPTIONS.map(({ value, preview }) => (
            <button
              key={value}
              title={value === 'none' ? 'No fill' : value}
              onClick={() => onStyleChange({ fill: value })}
              style={{
                ...swatch,
                backgroundColor: preview,
                border: effectiveFill === value ? '2.5px solid #6366F1' : '1.5px solid rgba(0,0,0,0.12)',
                outline: effectiveFill === value ? '2px solid rgba(99,102,241,0.25)' : 'none',
                outlineOffset: 1,
                position: 'relative', overflow: 'hidden',
              }}
            >
              {value === 'none' && (
                <svg style={{ position: 'absolute', inset: 0 }} width="22" height="22">
                  <line x1="3" y1="19" x2="19" y2="3" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {divider}

      {/* Stroke width */}
      <div>
        {label('Width')}
        <div style={{ display: 'flex', gap: 3 }}>
          {([1, 2, 4] as const).map(w => (
            <button
              key={w}
              title={`${w}px`}
              onClick={() => onStyleChange({ strokeWidth: w })}
              style={{
                ...widthBtn,
                border: effectiveWidth === w ? '2.5px solid #6366F1' : '1.5px solid rgba(0,0,0,0.12)',
              }}
            >
              <div style={{ width: 18, height: w === 1 ? 1.5 : w === 2 ? 2.5 : 4, backgroundColor: '#1E293B', borderRadius: 2 }} />
            </button>
          ))}
        </div>
      </div>

      {divider}

      {/* Stroke style */}
      <div>
        {label('Style')}
        <div style={{ display: 'flex', gap: 3 }}>
          {(['solid', 'dashed', 'dotted'] as StrokeStyle[]).map(st => (
            <button
              key={st}
              title={st}
              onClick={() => onStyleChange({ strokeStyle: st })}
              style={{
                ...styleBtn,
                border: effectiveStyle === st ? '2.5px solid #6366F1' : '1.5px solid rgba(0,0,0,0.12)',
              }}
            >
              <svg width="24" height="4">
                <line x1="0" y1="2" x2="24" y2="2" stroke="#1E293B" strokeWidth="2"
                  strokeDasharray={st === 'dashed' ? '5 3' : st === 'dotted' ? '2 3' : undefined}
                  strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      </div>

      {onPin && (
        <>
          {divider}
          <div>
            {label('Pin')}
            <button
              onClick={onPin}
              title={isPinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
              style={{
                ...widthBtn,
                width: 34,
                border: isPinned ? '2.5px solid #6366F1' : '1.5px solid rgba(0,0,0,0.12)',
                backgroundColor: isPinned ? '#EEF2FF' : 'transparent',
              }}
            >
              <Pin size={14} color={isPinned ? '#6366F1' : '#64748B'} fill={isPinned ? '#6366F1' : 'none'} />
            </button>
          </div>
        </>
      )}
    </div>,
    document.body
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function DrawingLayer({ activeTool, date, onCreateNote, viewTransform, selectedNoteIds }: DrawingLayerProps) {
  const { shapes, addShape, updateShape, removeShape, removeShapes, toggleShapePin, selectedShapeIds, setSelectedShapeIds, saveSnapshot, undo, redo } = useCanvasStore()

  // ── Drawing state ──
  const [isDrawing, setIsDrawing] = useState(false)
  const [pathPreview, setPathPreview] = useState("")
  const [shapePreview, setShapePreview] = useState<ShapePreviewType | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const seedRef = useRef(0)
  const pathDRef = useRef("")

  // ── Current drawing style (inherited by new shapes, updated by style panel) ──
  const [drawStyle, setDrawStyle] = useState<DrawingStyle>({
    stroke: '#1E293B',
    fill: 'rgba(241,245,249,0.8)',
    strokeWidth: 2,
    strokeStyle: 'solid',
  })

  // ── Selection ──
  // selectedShapeIds lives in the Zustand store so App.tsx can coordinate note+shape drag
  const selectedShapeIdsRef = useRef<string[]>([])
  selectedShapeIdsRef.current = selectedShapeIds

  // Ref for selected notes (prop) so shape-drag closures can read the latest value
  const selectedNoteIdsRef = useRef<string[]>([])
  selectedNoteIdsRef.current = selectedNoteIds
  // Snapshot of note origX/origY captured at shape drag start for coordinated drag
  const noteGroupDragRef = useRef<Array<{ id: string; origX: number; origY: number }>>([])
  const [isDraggingShape, setIsDraggingShape] = useState(false)
  const shapeDragRef = useRef<{
    mouseX: number; mouseY: number
    shapes: Array<{ id: string; origDx: number; origDy: number }>
  } | null>(null)

  // ── Marquee ──
  const [marquee, setMarquee] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null)
  const marqueeCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { marqueeCleanupRef.current?.() }, [])

  // ── Text editing (for rect / circle / arrow labels via foreignObject) ──
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── Standalone text input overlay (for "text" tool shapes) ──
  const [pendingText, setPendingText] = useState<{
    worldX: number; worldY: number; shapeId: string | null
  } | null>(null)
  const [pendingTextValue, setPendingTextValue] = useState("")
  const textOverlayRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!pendingText) return
    const id = setTimeout(() => textOverlayRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [pendingText])

  // ── Arrow snap ──
  const [snapHighlightId, setSnapHighlightId] = useState<string | null>(null)
  const pendingSourceIdRef = useRef<string | null>(null)
  const pendingTargetIdRef = useRef<string | null>(null)

  // ── Resize ──
  const [resizing, setResizing] = useState<{ id: string; handle: string; origShape: ShapeData } | null>(null)
  const resizingRef = useRef(resizing)
  resizingRef.current = resizing

  const viewTransformRef = useRef(viewTransform)
  viewTransformRef.current = viewTransform
  const scaleRef = useRef(viewTransform.scale)
  scaleRef.current = viewTransform.scale
  const svgRef = useRef<SVGSVGElement>(null)

  const dayShapes = shapes.filter(s => s.date === date)
  const dayShapesRef = useRef<ShapeData[]>(dayShapes)
  dayShapesRef.current = dayShapes

  const selectionBounds = selectedShapeIds.length > 1
    ? getUnionBounds(selectedShapeIds, dayShapes, dayShapes)
    : null

  const editingShape = editingShapeId ? dayShapes.find(s => s.id === editingShapeId) : null
  const editingBounds = editingShape ? getEditingBounds(editingShape, dayShapesRef.current) : null

  const isDrawingTool = DRAWING_TOOLS.includes(activeTool)
  const isCapturing = isDrawingTool || activeTool === "sticky" || activeTool === "select" || activeTool === "text"

  // ── Clear selection on tool change ──
  useEffect(() => {
    setPendingText(null); setPendingTextValue("")
    if (activeTool !== "select") {
      marqueeCleanupRef.current?.()
      setSelectedShapeIds([]); setEditingShapeId(null); setMarquee(null)
    }
    if (activeTool !== "arrow") {
      setSnapHighlightId(null)
      pendingSourceIdRef.current = null
      pendingTargetIdRef.current = null
    }
  }, [activeTool])

  // ── Focus textarea when editing ──
  useEffect(() => {
    if (editingShapeId && textareaRef.current) {
      textareaRef.current.focus(); textareaRef.current.select()
    }
  }, [editingShapeId])

  // ── Delete selected shapes ──
  useEffect(() => {
    if (selectedShapeIds.length === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return
      removeShapes(selectedShapeIds)
      setSelectedShapeIds([])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedShapeIds, removeShapes])

  // ── Escape: cancel drawing / deselect ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (isDrawing) {
        setIsDrawing(false); startRef.current = null
        pathDRef.current = ""; setPathPreview(""); setShapePreview(null)
        pendingSourceIdRef.current = null; pendingTargetIdRef.current = null
        setSnapHighlightId(null)
      }
      if (editingShapeId) { setEditingShapeId(null); setEditText("") }
      setSelectedShapeIds([])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isDrawing, editingShapeId])

  // ── Undo / Redo ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); setSelectedShapeIds([]) }
      if ((e.key === "z" && e.shiftKey) || e.key === "y") { e.preventDefault(); redo(); setSelectedShapeIds([]) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [undo, redo])

  // ── Copy / Paste shapes ──
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return

      if (e.key === "c") {
        const sel = selectedShapeIdsRef.current
        if (sel.length === 0) return
        e.preventDefault()
        const { shapes } = useCanvasStore.getState()
        clipboard.shapes = shapes.filter(s => sel.includes(s.id)).map(s => ({ ...s }))
        clipboard.notes = []
      }

      if (e.key === "v") {
        if (clipboard.shapes.length === 0) return
        e.preventDefault()
        const OFFSET = 20
        const { addShape } = useCanvasStore.getState()
        const newIds: string[] = []
        for (const s of clipboard.shapes) {
          const newId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
          newIds.push(newId)
          const pasted: ShapeData = {
            ...s,
            id: newId,
            seed: Math.floor(Math.random() * 100),
            date,
            rect: s.rect ? { ...s.rect, x: s.rect.x + OFFSET, y: s.rect.y + OFFSET } : undefined,
            circle: s.circle ? { ...s.circle, cx: s.circle.cx + OFFSET, cy: s.circle.cy + OFFSET } : undefined,
            arrow: s.arrow ? { ...s.arrow, x1: s.arrow.x1 + OFFSET, y1: s.arrow.y1 + OFFSET, x2: s.arrow.x2 + OFFSET, y2: s.arrow.y2 + OFFSET } : undefined,
            sourceId: undefined,
            targetId: undefined,
          }
          addShape(pasted)
        }
        setSelectedShapeIds(newIds)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [date, addShape])

  // ── Commit text edit ──
  const commitTextEdit = useCallback(() => {
    if (!editingShapeId) return
    const trimmed = editText.trim()
    const shapeType = dayShapesRef.current.find(s => s.id === editingShapeId)?.type
    if (!trimmed && shapeType === "text") {
      removeShape(editingShapeId)
    } else {
      updateShape(editingShapeId, { text: trimmed || undefined })
    }
    setEditingShapeId(null); setEditText("")
  }, [editingShapeId, editText, updateShape, removeShape])

  // ── Commit pending text overlay ──
  // Use a ref so onBlur (fired on unmount) can't double-commit after Enter already committed.
  const pendingTextRef = useRef(pendingText)
  pendingTextRef.current = pendingText
  const isCommittingRef = useRef(false)

  const commitPendingText = useCallback(() => {
    if (isCommittingRef.current) return
    const pt = pendingTextRef.current
    if (!pt) return
    isCommittingRef.current = true

    const v = pendingTextValue.trim()
    if (pt.shapeId) {
      if (v) updateShape(pt.shapeId, { text: v })
      else removeShape(pt.shapeId)
    } else if (v) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      addShape({ id, type: "text", seed: 0, stroke: drawStyle.stroke, fill: "none", strokeWidth: 1, strokeStyle: "solid", date, rect: { x: pt.worldX, y: pt.worldY, w: 0, h: 0 }, text: v })
      setSelectedShapeIds([id])
    }
    setPendingText(null)
    setPendingTextValue("")
    isCommittingRef.current = false
  }, [pendingTextValue, updateShape, removeShape, addShape, drawStyle, date])

  // ── Commit drawn shape ──
  const commitShape = useCallback(() => {
    if (!isDrawing) return
    const seed = seedRef.current
    const base = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      seed,
      stroke: drawStyle.stroke,
      strokeWidth: drawStyle.strokeWidth,
      strokeStyle: drawStyle.strokeStyle,
      date,
    }
    if (activeTool === "pen" && pathDRef.current.length > 6) {
      addShape({ ...base, type: "path", fill: "none", path: { d: pathDRef.current } })
    } else if (shapePreview) {
      if (shapePreview.type === "rect" && shapePreview.w > 10 && shapePreview.h > 10)
        addShape({ ...base, type: "rect", fill: drawStyle.fill, rect: shapePreview })
      else if ((shapePreview.type === "diamond" || shapePreview.type === "cylinder" || shapePreview.type === "cloud" || shapePreview.type === "queue") && shapePreview.w > 10 && shapePreview.h > 10)
        addShape({ ...base, type: shapePreview.type, fill: drawStyle.fill, rect: { x: shapePreview.x, y: shapePreview.y, w: shapePreview.w, h: shapePreview.h } })
      else if (shapePreview.type === "circle" && shapePreview.r > 10)
        addShape({ ...base, type: "circle", fill: "none", circle: shapePreview })
      else if (shapePreview.type === "arrow") {
        const ddx = shapePreview.x2 - shapePreview.x1, ddy = shapePreview.y2 - shapePreview.y1
        if (Math.sqrt(ddx * ddx + ddy * ddy) > 20)
          addShape({
            ...base, type: "arrow", fill: "none",
            arrow: shapePreview,
            sourceId: pendingSourceIdRef.current ?? undefined,
            targetId: pendingTargetIdRef.current ?? undefined,
          })
      }
    }
    setIsDrawing(false); startRef.current = null
    pathDRef.current = ""; setPathPreview(""); setShapePreview(null)
    pendingSourceIdRef.current = null; pendingTargetIdRef.current = null
    setSnapHighlightId(null)
  }, [activeTool, date, isDrawing, shapePreview, addShape, drawStyle])

  // ── Shape double-click: start text edit ──
  const handleShapeDoubleClick = useCallback((shape: ShapeData, e: React.MouseEvent) => {
    if (activeTool !== "select") return
    if (shape.type !== "rect" && shape.type !== "circle" && shape.type !== "arrow" && shape.type !== "text" && shape.type !== "diamond" && shape.type !== "cylinder" && shape.type !== "cloud" && shape.type !== "queue") return
    e.stopPropagation()
    setIsDraggingShape(false); setSelectedShapeIds([shape.id])
    if (shape.type === "text" && shape.rect) {
      setPendingTextValue(shape.text ?? "")
      setPendingText({ worldX: shape.rect.x + (shape.dx ?? 0), worldY: shape.rect.y + (shape.dy ?? 0), shapeId: shape.id })
      return
    }
    setEditingShapeId(shape.id); setEditText(shape.text ?? "")
  }, [activeTool])

  // ── Shape mousedown: select + drag ──
  const handleShapeMouseDown = useCallback((shape: ShapeData, e: React.MouseEvent) => {
    e.stopPropagation()
    if (activeTool !== "select") return

    let currentIds: string[]
    if (e.shiftKey) {
      // Shift+click: toggle shape in/out of selection
      currentIds = selectedShapeIds.includes(shape.id)
        ? selectedShapeIds.filter(id => id !== shape.id)
        : [...selectedShapeIds, shape.id]
    } else {
      // Normal click: keep group if already selected, else select only this
      currentIds = selectedShapeIds.includes(shape.id) ? selectedShapeIds : [shape.id]
    }
    setSelectedShapeIds(currentIds)

    // Don't start a drag if this shape was just deselected via Shift
    if (!currentIds.includes(shape.id)) return

    if (shape.type === "arrow" && shape.sourceId && shape.targetId) return

    setIsDraggingShape(true)
    const relevant = dayShapesRef.current.filter(s => currentIds.includes(s.id))
    shapeDragRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      shapes: relevant.map(s => ({ id: s.id, origDx: s.dx ?? 0, origDy: s.dy ?? 0 })),
    }
    // Snapshot selected notes so they move together with shapes
    const { notes } = useCanvasStore.getState()
    noteGroupDragRef.current = notes
      .filter(n => selectedNoteIdsRef.current.includes(n.id))
      .map(n => ({ id: n.id, origX: n.x, origY: n.y }))
    document.body.style.cursor = "move"
  }, [activeTool, selectedShapeIds])

  // ── Arrow endpoint drag (reconnect) ──
  const startEndpointDrag = useCallback((e: React.MouseEvent, shape: ShapeData, endpoint: 'source' | 'target') => {
    e.stopPropagation()
    if (!shape.arrow) return

    const computed = getComputedArrowEndpoints(shape, dayShapesRef.current)
    const odx = shape.dx ?? 0, ody = shape.dy ?? 0

    if (endpoint === 'source') {
      updateShape(shape.id, {
        arrow: { x1: computed.x1, y1: computed.y1, x2: shape.arrow.x2 + odx, y2: shape.arrow.y2 + ody },
        sourceId: undefined, dx: 0, dy: 0,
      })
    } else {
      updateShape(shape.id, {
        arrow: { x1: shape.arrow.x1 + odx, y1: shape.arrow.y1 + ody, x2: computed.x2, y2: computed.y2 },
        targetId: undefined, dx: 0, dy: 0,
      })
    }

    function onDocMove(ev: MouseEvent) {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const vt = viewTransformRef.current
      const mx = (ev.clientX - rect.left - vt.x) / vt.scale
      const my = (ev.clientY - rect.top - vt.y) / vt.scale
      const snap = findSnapTarget(mx, my, dayShapesRef.current, shape.id)
      setSnapHighlightId(snap?.shape.id ?? null)
      const ex = snap?.snapPoint.x ?? mx, ey = snap?.snapPoint.y ?? my
      const cur = dayShapesRef.current.find(s => s.id === shape.id)
      if (!cur?.arrow) return
      if (endpoint === 'source') {
        updateShape(shape.id, { arrow: { x1: ex, y1: ey, x2: cur.arrow.x2, y2: cur.arrow.y2 } })
      } else {
        updateShape(shape.id, { arrow: { x1: cur.arrow.x1, y1: cur.arrow.y1, x2: ex, y2: ey } })
      }
    }

    function onDocUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onDocMove)
      document.removeEventListener('mouseup', onDocUp)
      setSnapHighlightId(null)
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      const vt = viewTransformRef.current
      const mx = (ev.clientX - rect.left - vt.x) / vt.scale
      const my = (ev.clientY - rect.top - vt.y) / vt.scale
      const snap = findSnapTarget(mx, my, dayShapesRef.current, shape.id)
      if (snap) updateShape(shape.id, { [endpoint === 'source' ? 'sourceId' : 'targetId']: snap.shape.id })
      saveSnapshot()
    }

    document.addEventListener('mousemove', onDocMove)
    document.addEventListener('mouseup', onDocUp)
  }, [updateShape, saveSnapshot])

  // ── SVG mousedown ──
  const handleMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (editingShapeId) { commitTextEdit(); return }

    if (activeTool === "select") {
      const isAdditive = e.shiftKey
      // Capture current selection before clearing (ref always has latest value)
      const prevIds = isAdditive ? selectedShapeIdsRef.current : []
      if (!isAdditive) setSelectedShapeIds([])

      // Capture SVG origin once at mousedown so all move/up coords use the same origin
      const svgEl = svgRef.current
      const originRect = svgEl?.getBoundingClientRect()
      const { x: vtx, y: vty, scale: vts } = viewTransformRef.current
      const toWorld = (cx: number, cy: number) => ({
        x: originRect ? (cx - originRect.left - vtx) / vts : cx,
        y: originRect ? (cy - originRect.top - vty) / vts : cy,
      })

      const start = toWorld(e.clientX, e.clientY)
      const startX = start.x, startY = start.y
      setMarquee({ startX, startY, curX: startX, curY: startY })

      function onDocMove(ev: MouseEvent) {
        const { x: cx, y: cy } = toWorld(ev.clientX, ev.clientY)
        setMarquee(prev => prev ? { ...prev, curX: cx, curY: cy } : null)
      }
      function onDocUp(ev: MouseEvent) {
        cleanup()
        const { x: endX, y: endY } = toWorld(ev.clientX, ev.clientY)
        const hit = shapesInMarquee(dayShapesRef.current, startX, startY, endX, endY, dayShapesRef.current)
        const merged = isAdditive ? [...new Set([...prevIds, ...hit])] : hit
        setSelectedShapeIds(merged)
        setMarquee(null)
      }
      function cleanup() {
        document.removeEventListener('mousemove', onDocMove)
        document.removeEventListener('mouseup', onDocUp)
        marqueeCleanupRef.current = null
      }
      document.addEventListener('mousemove', onDocMove)
      document.addEventListener('mouseup', onDocUp)
      marqueeCleanupRef.current = cleanup
      return
    }

    if (activeTool === "text") {
      const p = getSVGCoords(svgRef.current, e.clientX, e.clientY, viewTransformRef.current)
      setPendingTextValue("")
      setPendingText({ worldX: p.x, worldY: p.y, shapeId: null })
      return
    }

    if (!isDrawingTool) return
    const p = getSVGCoords(svgRef.current, e.clientX, e.clientY, viewTransformRef.current)
    seedRef.current = Math.floor(Math.random() * 100)
    setIsDrawing(true)

    if (activeTool === "arrow") {
      const snapResult = findSnapTarget(p.x, p.y, dayShapesRef.current)
      if (snapResult) {
        pendingSourceIdRef.current = snapResult.shape.id
        startRef.current = snapResult.snapPoint
        return
      }
    }
    startRef.current = p
    if (activeTool === "pen") {
      const d = `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      pathDRef.current = d; setPathPreview(d)
    }
  }, [activeTool, editingShapeId, isDrawingTool, commitTextEdit])

  // ── SVG mousemove ──
  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // Resize
    const r = resizingRef.current
    if (r) {
      const svgRect = svgRef.current?.getBoundingClientRect()
      if (!svgRect) return
      const vt = viewTransformRef.current
      const mx = (e.clientX - svgRect.left - vt.x) / vt.scale
      const my = (e.clientY - svgRect.top - vt.y) / vt.scale
      const { id, handle, origShape: orig } = r
      const MIN = 20

      if (orig.type === 'rect' && orig.rect) {
        const dx = orig.dx ?? 0, dy = orig.dy ?? 0
        let x0 = orig.rect.x + dx, y0 = orig.rect.y + dy
        let x1 = x0 + orig.rect.w, y1 = y0 + orig.rect.h
        switch (handle) {
          case 'NW': x0 = mx; y0 = my; break; case 'N': y0 = my; break
          case 'NE': x1 = mx; y0 = my; break; case 'E': x1 = mx; break
          case 'SE': x1 = mx; y1 = my; break; case 'S': y1 = my; break
          case 'SW': x0 = mx; y1 = my; break; case 'W': x0 = mx; break
        }
        // Shift: constrain to square on corner handles
        if (e.shiftKey && ['NW', 'NE', 'SE', 'SW'].includes(handle)) {
          const side = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))
          if (handle === 'NW') { x0 = x1 - side; y0 = y1 - side }
          if (handle === 'NE') { x1 = x0 + side; y0 = y1 - side }
          if (handle === 'SE') { x1 = x0 + side; y1 = y0 + side }
          if (handle === 'SW') { x0 = x1 - side; y1 = y0 + side }
        }
        if (x1 - x0 < MIN) { if (handle.includes('W')) x0 = x1 - MIN; else x1 = x0 + MIN }
        if (y1 - y0 < MIN) { if (handle.includes('N')) y0 = y1 - MIN; else y1 = y0 + MIN }
        updateShape(id, { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, dx: 0, dy: 0 })
      }

      if ((orig.type === 'diamond' || orig.type === 'cylinder' || orig.type === 'cloud' || orig.type === 'queue') && orig.rect) {
        const dx = orig.dx ?? 0, dy = orig.dy ?? 0
        let x0 = orig.rect.x + dx, y0 = orig.rect.y + dy
        let x1 = x0 + orig.rect.w, y1 = y0 + orig.rect.h
        switch (handle) {
          case 'NW': x0 = mx; y0 = my; break; case 'N': y0 = my; break
          case 'NE': x1 = mx; y0 = my; break; case 'E': x1 = mx; break
          case 'SE': x1 = mx; y1 = my; break; case 'S': y1 = my; break
          case 'SW': x0 = mx; y1 = my; break; case 'W': x0 = mx; break
        }
        if (x1 - x0 < MIN) { if (handle.includes('W')) x0 = x1 - MIN; else x1 = x0 + MIN }
        if (y1 - y0 < MIN) { if (handle.includes('N')) y0 = y1 - MIN; else y1 = y0 + MIN }
        updateShape(id, { rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, dx: 0, dy: 0 })
      }

      if (orig.type === 'circle' && orig.circle) {
        const cdx = orig.dx ?? 0, cdy = orig.dy ?? 0
        const cx = orig.circle.cx + cdx, cy = orig.circle.cy + cdy
        const newR = Math.max(10, ['NW', 'NE', 'SE', 'SW'].includes(handle)
          ? Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
          : handle === 'N' ? cy - my
          : handle === 'S' ? my - cy
          : handle === 'E' ? mx - cx
          : cx - mx)
        updateShape(id, { circle: { cx, cy, r: newR }, dx: 0, dy: 0 })
      }

      if (orig.type === 'path' && orig.path) {
        const odx = orig.dx ?? 0, ody = orig.dy ?? 0
        const nums = orig.path.d.match(/-?\d+(?:\.\d+)?/g)
        if (!nums || nums.length < 4) return
        const xs: number[] = [], ys: number[] = []
        for (let i = 0; i + 1 < nums.length; i += 2) {
          xs.push(parseFloat(nums[i]) + odx); ys.push(parseFloat(nums[i + 1]) + ody)
        }
        const bx0 = Math.min(...xs), by0 = Math.min(...ys)
        const bx1 = Math.max(...xs), by1 = Math.max(...ys)
        const origW = bx1 - bx0, origH = by1 - by0
        let nbx0 = bx0, nby0 = by0, nbx1 = bx1, nby1 = by1
        switch (handle) {
          case 'NW': nbx0 = mx; nby0 = my; break; case 'NE': nbx1 = mx; nby0 = my; break
          case 'SE': nbx1 = mx; nby1 = my; break; case 'SW': nbx0 = mx; nby1 = my; break
        }
        if (nbx1 - nbx0 < MIN) { if (handle.includes('W')) nbx0 = nbx1 - MIN; else nbx1 = nbx0 + MIN }
        if (nby1 - nby0 < MIN) { if (handle.includes('N')) nby0 = nby1 - MIN; else nby1 = nby0 + MIN }
        const scaleX = origW > 0 ? (nbx1 - nbx0) / origW : 1
        const scaleY = origH > 0 ? (nby1 - nby0) / origH : 1
        let i = 0
        const newD = orig.path.d.replace(/-?\d+(?:\.\d+)?/g, (match) => {
          const isX = i % 2 === 0
          const val = parseFloat(match) + (isX ? odx : ody)
          const result = isX ? nbx0 + (val - bx0) * scaleX : nby0 + (val - by0) * scaleY
          i++; return result.toFixed(1)
        })
        updateShape(id, { path: { d: newD }, dx: 0, dy: 0 })
      }
      return
    }

    // Drag shapes (and coordinated notes)
    if (isDraggingShape && shapeDragRef.current) {
      const dxDelta = (e.clientX - shapeDragRef.current.mouseX) / scaleRef.current
      const dyDelta = (e.clientY - shapeDragRef.current.mouseY) / scaleRef.current
      for (const { id, origDx, origDy } of shapeDragRef.current.shapes) {
        updateShape(id, { dx: origDx + dxDelta, dy: origDy + dyDelta })
      }
      if (noteGroupDragRef.current.length > 0) {
        const { updateNote } = useCanvasStore.getState()
        for (const { id, origX, origY } of noteGroupDragRef.current) {
          updateNote(id, { x: origX + dxDelta, y: origY + dyDelta })
        }
      }
      return
    }

    if (!isDrawing || !startRef.current) return
    const p = getSVGCoords(svgRef.current, e.clientX, e.clientY, viewTransformRef.current), s = startRef.current

    if (activeTool === "pen") {
      pathDRef.current += ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
      setPathPreview(pathDRef.current)
    } else if (activeTool === "rect") {
      let w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y)
      if (e.shiftKey) { const side = Math.max(w, h); w = side; h = side }
      setShapePreview({
        type: "rect",
        x: p.x < s.x ? s.x - w : s.x,
        y: p.y < s.y ? s.y - h : s.y,
        w, h,
      })
    } else if (activeTool === "circle") {
      const r = Math.sqrt((p.x - s.x) ** 2 + (p.y - s.y) ** 2)
      setShapePreview({ type: "circle", cx: s.x, cy: s.y, r })
    } else if (activeTool === "arrow") {
      const snapResult = findSnapTarget(p.x, p.y, dayShapesRef.current, pendingSourceIdRef.current ?? undefined)
      pendingTargetIdRef.current = snapResult?.shape.id ?? null
      setSnapHighlightId(snapResult?.shape.id ?? null)
      setShapePreview({ type: "arrow", x1: s.x, y1: s.y, x2: snapResult?.snapPoint.x ?? p.x, y2: snapResult?.snapPoint.y ?? p.y })
    } else if (activeTool === "diamond" || activeTool === "cylinder" || activeTool === "cloud" || activeTool === "queue") {
      const ww = Math.abs(p.x - s.x), hh = Math.abs(p.y - s.y)
      setShapePreview({ type: activeTool, x: p.x < s.x ? s.x - ww : s.x, y: p.y < s.y ? s.y - hh : s.y, w: ww, h: hh })
    }
  }, [activeTool, isDraggingShape, isDrawing, updateShape])

  // ── SVG mouseup ──
  const handleMouseUp = useCallback(() => {
    if (resizingRef.current) {
      setResizing(null)
      saveSnapshot()
      return
    }
    if (isDraggingShape) {
      setIsDraggingShape(false); shapeDragRef.current = null; noteGroupDragRef.current = []; document.body.style.cursor = ""
      saveSnapshot()
      return
    }
    commitShape()
  }, [isDraggingShape, commitShape, saveSnapshot])

  const handleDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== "sticky") return
    const p = getSVGCoords(svgRef.current, e.clientX, e.clientY, viewTransformRef.current)
    onCreateNote(p.x, p.y)
  }, [activeTool, onCreateNote])

  // ── Style panel handler ──
  const handleStyleChange = useCallback((updates: Partial<DrawingStyle>) => {
    setDrawStyle(prev => ({ ...prev, ...updates }))
    for (const id of selectedShapeIds) updateShape(id, updates as Partial<ShapeData>)
  }, [selectedShapeIds, updateShape])

  // ─── Computed visual elements ────────────────────────────────────────────

  const snapHighlightShape = snapHighlightId ? dayShapes.find(s => s.id === snapHighlightId) : null
  const snapHighlightEl = snapHighlightShape ? (() => {
    const sdx = snapHighlightShape.dx ?? 0, sdy = snapHighlightShape.dy ?? 0
    if (snapHighlightShape.type === "circle" && snapHighlightShape.circle) {
      const { cx, cy, r } = snapHighlightShape.circle
      return <circle cx={cx + sdx} cy={cy + sdy} r={r + 9} fill="rgba(99,102,241,0.08)" stroke="#6366F1" strokeWidth={2} strokeDasharray="5 3" style={{ pointerEvents: "none" }} />
    }
    const b = getShapeBounds(snapHighlightShape)
    if (!b) return null
    return <rect x={b.bx - 5} y={b.by - 5} width={b.bw + 10} height={b.bh + 10} rx={8} fill="rgba(99,102,241,0.08)" stroke="#6366F1" strokeWidth={2} strokeDasharray="5 3" style={{ pointerEvents: "none" }} />
  })() : null

  const marqueeEl = marquee ? (() => {
    const x = Math.min(marquee.startX, marquee.curX), y = Math.min(marquee.startY, marquee.curY)
    const w = Math.abs(marquee.curX - marquee.startX), h = Math.abs(marquee.curY - marquee.startY)
    if (w < 2 && h < 2) return null
    return (
      <rect x={x} y={y} width={w} height={h}
        fill="rgba(99,102,241,0.06)" stroke="#6366F1" strokeWidth={1.5} strokeDasharray="5 3" rx={3}
        style={{ pointerEvents: "none" }} />
    )
  })() : null

  const svgCursor = resizing
    ? resizing.handle.toLowerCase().replace('n', 'n').replace('s', 's').replace('e', 'e').replace('w', 'w') + '-resize'
    : isDraggingShape ? "move"
    : marquee ? "crosshair"
    : (({ pen: "crosshair", rect: "crosshair", circle: "crosshair", arrow: "crosshair",
           diamond: "crosshair", cylinder: "crosshair", cloud: "crosshair", queue: "crosshair",
           sticky: "copy", text: "text", select: "default", pin: "pointer" } as Record<Tool, string>)[activeTool] ?? "default")

  const showStylePanel = selectedShapeIds.length > 0 && activeTool === "select" && !editingShapeId

  return (
    <>
      <svg
        ref={svgRef}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          pointerEvents: isCapturing ? "all" : "none",
          cursor: svgCursor, overflow: "visible",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        <g transform={`translate(${viewTransform.x} ${viewTransform.y}) scale(${viewTransform.scale})`}>
        {snapHighlightEl}
        {marqueeEl}

        {/* ── Shapes ── */}
        {dayShapes.map((shape) => {
          const isSelected = selectedShapeIds.includes(shape.id)
          const isEditing = shape.id === editingShapeId
          const dx = shape.dx ?? 0, dy = shape.dy ?? 0
          const textLines = (shape.text ?? "").split("\n")
          const hasSavedText = !!shape.text && !isEditing
          const isFullyConnected = shape.type === "arrow" && !!shape.sourceId && !!shape.targetId

          const rectAbs = shape.type === "rect" && shape.rect
            ? { x: shape.rect.x + dx, y: shape.rect.y + dy, w: shape.rect.w, h: shape.rect.h } : null
          const circleAbs = shape.type === "circle" && shape.circle
            ? { cx: shape.circle.cx + dx, cy: shape.circle.cy + dy, r: shape.circle.r } : null
          const arrowAbs = shape.type === "arrow" && shape.arrow
            ? getComputedArrowEndpoints(shape, dayShapesRef.current) : null
          const polyAbs = (shape.type === "diamond" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && shape.rect
            ? { x: shape.rect.x + dx, y: shape.rect.y + dy, w: shape.rect.w, h: shape.rect.h } : null

          const rectCenter = rectAbs ? { cx: rectAbs.x + rectAbs.w / 2, cy: rectAbs.y + rectAbs.h / 2 } : null
          const circleCenter = circleAbs ? { cx: circleAbs.cx, cy: circleAbs.cy } : null
          const arrowCenter = arrowAbs ? { cx: (arrowAbs.x1 + arrowAbs.x2) / 2, cy: (arrowAbs.y1 + arrowAbs.y2) / 2 - 14 } : null
          const polyCenter = polyAbs ? { cx: polyAbs.x + polyAbs.w / 2, cy: polyAbs.y + polyAbs.h / 2 } : null
          const hintCenter = rectCenter ?? circleCenter ?? arrowCenter ?? polyCenter

          return (
            <g
              key={shape.id}
              style={{
                cursor: activeTool === "select" ? (isFullyConnected ? "pointer" : "move") : "default",
                pointerEvents: marquee ? "none" : undefined,
              }}
              onMouseDown={e => handleShapeMouseDown(shape, e)}
              onDoubleClick={e => handleShapeDoubleClick(shape, e)}
            >
              {/* Per-shape selection ring */}
              {isSelected && rectAbs && (
                <rect x={rectAbs.x - 5} y={rectAbs.y - 5} width={rectAbs.w + 10} height={rectAbs.h + 10}
                  fill="none" stroke="#6366F1" strokeWidth={1.5} rx={5}
                  style={{ pointerEvents: "none" }} />
              )}
              {isSelected && circleAbs && (
                <circle cx={circleAbs.cx} cy={circleAbs.cy} r={circleAbs.r + 5}
                  fill="none" stroke="#6366F1" strokeWidth={1.5}
                  style={{ pointerEvents: "none" }} />
              )}
              {isSelected && (shape.type === "path" || shape.type === "text" || shape.type === "diamond" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && (() => {
                const b = getShapeBounds(shape, dayShapes)
                if (!b) return null
                return <rect x={b.bx - 2} y={b.by - 2} width={b.bw + 4} height={b.bh + 4}
                  fill="none" stroke="#6366F1" strokeWidth={1.5} rx={4}
                  style={{ pointerEvents: "none" }} />
              })()}

              {/* Shape rendering */}
              {rectAbs && <RoughRect {...rectAbs} seed={shape.seed} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />}
              {circleAbs && <RoughCircle {...circleAbs} seed={shape.seed} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />}
              {polyAbs && shape.type === "diamond" && <RoughDiamond {...polyAbs} seed={shape.seed} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />}
              {polyAbs && shape.type === "cylinder" && <RoughCylinder {...polyAbs} seed={shape.seed} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />}
              {polyAbs && shape.type === "cloud" && <RoughCloud {...polyAbs} seed={shape.seed} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />}
              {polyAbs && shape.type === "queue" && <RoughQueue {...polyAbs} seed={shape.seed} stroke={shape.stroke} fill={shape.fill} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />}
              {arrowAbs && (
                <>
                  <line x1={arrowAbs.x1} y1={arrowAbs.y1} x2={arrowAbs.x2} y2={arrowAbs.y2}
                    stroke="transparent" strokeWidth={20} strokeLinecap="round" />
                  <RoughArrow {...arrowAbs} seed={shape.seed} stroke={shape.stroke} strokeWidth={shape.strokeWidth} strokeStyle={shape.strokeStyle} />
                </>
              )}
              {shape.type === "path" && shape.path && (
                <path d={shape.path.d} stroke={shape.stroke} fill="none" strokeWidth={shape.strokeWidth}
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray={shape.strokeStyle === 'dashed' ? '8 4' : shape.strokeStyle === 'dotted' ? '2 4' : undefined}
                  transform={`translate(${dx}, ${dy})`} />
              )}
              {shape.type === "text" && shape.rect && !isEditing && (() => {
                const tx = shape.rect.x + dx, ty = shape.rect.y + dy
                const lineCount = textLines.length || 1
                const hitW = 260, hitH = lineCount * 26 + 8
                return (
                  <>
                    {/* Transparent hit area so the <g> receives mouse events */}
                    <rect x={tx - 4} y={ty - 22} width={hitW} height={hitH} fill="transparent" style={{ cursor: activeTool === "select" ? "move" : "default" }} />
                    <text fontFamily="'DM Sans', system-ui, sans-serif" fontSize={20} fontWeight={500} fill={shape.stroke} style={{ pointerEvents: "none", whiteSpace: "pre" }}>
                      {textLines.map((line, i) => (
                        <tspan key={i} x={tx} y={ty + i * 26}>{line || " "}</tspan>
                      ))}
                    </text>
                  </>
                )
              })()}

              {/* Arrow connection indicators */}
              {arrowAbs && shape.sourceId && (
                <circle cx={arrowAbs.x1} cy={arrowAbs.y1} r={3.5} fill="#6366F1" opacity={0.6} style={{ pointerEvents: "none" }} />
              )}
              {arrowAbs && shape.targetId && (
                <circle cx={arrowAbs.x2} cy={arrowAbs.y2} r={3.5} fill="#6366F1" opacity={0.6} style={{ pointerEvents: "none" }} />
              )}

              {/* Saved text */}
              {hasSavedText && rectCenter && <ShapeText lines={textLines} cx={rectCenter.cx} cy={rectCenter.cy} color="#1E293B" />}
              {hasSavedText && circleCenter && <ShapeText lines={textLines} cx={circleCenter.cx} cy={circleCenter.cy} color={shape.stroke} />}
              {hasSavedText && arrowCenter && <ShapeText lines={textLines} cx={arrowCenter.cx} cy={arrowCenter.cy} color={shape.stroke} />}
              {hasSavedText && polyCenter && <ShapeText lines={textLines} cx={polyCenter.cx} cy={polyCenter.cy} color={shape.stroke} />}

              {/* Type hint when selected */}
              {isSelected && !shape.text && hintCenter && (shape.type === "rect" || shape.type === "circle" || shape.type === "arrow" || shape.type === "diamond" || shape.type === "cylinder" || shape.type === "cloud" || shape.type === "queue") && (
                <text textAnchor="middle" fontFamily="'DM Sans', system-ui, sans-serif" fontSize={12}
                  fill="#94A3B8" style={{ pointerEvents: "none" }} x={hintCenter.cx} y={hintCenter.cy}>
                  double-click to type
                </text>
              )}
            </g>
          )
        })}

        {/* ── Multi-selection union box ── */}
        {selectedShapeIds.length > 1 && selectionBounds && (
          <>
            <rect
              x={selectionBounds.bx - 2} y={selectionBounds.by - 2}
              width={selectionBounds.bw + 4} height={selectionBounds.bh + 4}
              fill="none" stroke="#6366F1" strokeWidth={1.5} strokeDasharray="6 3" rx={5}
              style={{ pointerEvents: "none" }}
            />
            <text
              x={selectionBounds.bx + selectionBounds.bw / 2}
              y={selectionBounds.by - 10}
              textAnchor="middle" fontFamily="'Inter', sans-serif" fontSize={10.5} fill="#6366F1"
              style={{ pointerEvents: "none" }}
            >
              {selectedShapeIds.length} shapes selected
            </text>
            {/* Delete group */}
            <g
              style={{ cursor: "pointer" }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation()
                removeShapes(selectedShapeIds)
                setSelectedShapeIds([])
              }}
            >
              <circle cx={selectionBounds.bx + selectionBounds.bw + 12} cy={selectionBounds.by - 2} r={11} fill="#EF4444" />
              <line x1={selectionBounds.bx + selectionBounds.bw + 8} y1={selectionBounds.by - 6}
                x2={selectionBounds.bx + selectionBounds.bw + 16} y2={selectionBounds.by + 2}
                stroke="white" strokeWidth={1.5} strokeLinecap="round" />
              <line x1={selectionBounds.bx + selectionBounds.bw + 16} y1={selectionBounds.by - 6}
                x2={selectionBounds.bx + selectionBounds.bw + 8} y2={selectionBounds.by + 2}
                stroke="white" strokeWidth={1.5} strokeLinecap="round" />
            </g>
          </>
        )}

        {/* ── Arrow endpoint handles ── */}
        {selectedShapeIds.length === 1 && activeTool === "select" && (() => {
          const shape = dayShapes.find(s => s.id === selectedShapeIds[0])
          if (shape?.type !== 'arrow') return null
          const { x1, y1, x2, y2 } = getComputedArrowEndpoints(shape, dayShapesRef.current)
          return (
            <>
              <EndpointHandle cx={x1} cy={y1} connected={!!shape.sourceId}
                onMouseDown={e => startEndpointDrag(e, shape, 'source')} />
              <EndpointHandle cx={x2} cy={y2} connected={!!shape.targetId}
                onMouseDown={e => startEndpointDrag(e, shape, 'target')} />
            </>
          )
        })()}

        {/* ── Resize handles (single selection, non-arrow) ── */}
        {selectedShapeIds.length === 1 && activeTool === "select" && (() => {
          const shape = dayShapes.find(s => s.id === selectedShapeIds[0])
          if (!shape || shape.type === 'arrow') return null
          const dx = shape.dx ?? 0, dy = shape.dy ?? 0
          let handles: Array<{ id: string; x: number; y: number; cursor: string }> = []

          if (shape.type === 'rect' && shape.rect) {
            const { x, y, w, h } = shape.rect
            const ax = x + dx, ay = y + dy
            handles = [
              { id: 'NW', x: ax,       y: ay,       cursor: 'nw-resize' },
              { id: 'N',  x: ax + w/2, y: ay,       cursor: 'n-resize'  },
              { id: 'NE', x: ax + w,   y: ay,       cursor: 'ne-resize' },
              { id: 'E',  x: ax + w,   y: ay + h/2, cursor: 'e-resize'  },
              { id: 'SE', x: ax + w,   y: ay + h,   cursor: 'se-resize' },
              { id: 'S',  x: ax + w/2, y: ay + h,   cursor: 's-resize'  },
              { id: 'SW', x: ax,       y: ay + h,   cursor: 'sw-resize' },
              { id: 'W',  x: ax,       y: ay + h/2, cursor: 'w-resize'  },
            ]
          } else if (shape.type === 'circle' && shape.circle) {
            const { cx, cy, r } = shape.circle
            const acx = cx + dx, acy = cy + dy
            const d = r * 0.707
            handles = [
              { id: 'N',  x: acx,     y: acy - r, cursor: 'n-resize'  },
              { id: 'NE', x: acx + d, y: acy - d, cursor: 'ne-resize' },
              { id: 'E',  x: acx + r, y: acy,     cursor: 'e-resize'  },
              { id: 'SE', x: acx + d, y: acy + d, cursor: 'se-resize' },
              { id: 'S',  x: acx,     y: acy + r, cursor: 's-resize'  },
              { id: 'SW', x: acx - d, y: acy + d, cursor: 'sw-resize' },
              { id: 'W',  x: acx - r, y: acy,     cursor: 'w-resize'  },
              { id: 'NW', x: acx - d, y: acy - d, cursor: 'nw-resize' },
            ]
          } else if ((shape.type === 'diamond' || shape.type === 'cylinder' || shape.type === 'cloud' || shape.type === 'queue') && shape.rect) {
            const { x, y, w, h } = shape.rect
            const ax = x + dx, ay = y + dy
            handles = [
              { id: 'NW', x: ax,       y: ay,       cursor: 'nw-resize' },
              { id: 'N',  x: ax + w/2, y: ay,       cursor: 'n-resize'  },
              { id: 'NE', x: ax + w,   y: ay,       cursor: 'ne-resize' },
              { id: 'E',  x: ax + w,   y: ay + h/2, cursor: 'e-resize'  },
              { id: 'SE', x: ax + w,   y: ay + h,   cursor: 'se-resize' },
              { id: 'S',  x: ax + w/2, y: ay + h,   cursor: 's-resize'  },
              { id: 'SW', x: ax,       y: ay + h,   cursor: 'sw-resize' },
              { id: 'W',  x: ax,       y: ay + h/2, cursor: 'w-resize'  },
            ]
          } else if (shape.type === 'path' && shape.path) {
            const nums = shape.path.d.match(/-?\d+(?:\.\d+)?/g)
            if (nums && nums.length >= 4) {
              const xs: number[] = [], ys: number[] = []
              for (let i = 0; i + 1 < nums.length; i += 2) {
                xs.push(parseFloat(nums[i]) + dx); ys.push(parseFloat(nums[i + 1]) + dy)
              }
              const bx = Math.min(...xs), by = Math.min(...ys)
              const bxr = Math.max(...xs), byr = Math.max(...ys)
              handles = [
                { id: 'NW', x: bx,  y: by,  cursor: 'nw-resize' },
                { id: 'NE', x: bxr, y: by,  cursor: 'ne-resize' },
                { id: 'SE', x: bxr, y: byr, cursor: 'se-resize' },
                { id: 'SW', x: bx,  y: byr, cursor: 'sw-resize' },
              ]
            }
          }

          return handles.map(h => (
            <ResizeHandle key={h.id} x={h.x} y={h.y} cursor={h.cursor}
              onMouseDown={(e) => {
                e.stopPropagation()
                setResizing({ id: shape.id, handle: h.id, origShape: { ...shape } })
              }}
            />
          ))
        })()}

        {/* ── Inline text editor ── */}
        {editingShape && editingBounds && (
          <foreignObject x={editingBounds.x} y={editingBounds.y} width={editingBounds.w} height={editingBounds.h}>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: editingShape.type === "text" ? "flex-start" : "center", justifyContent: editingShape.type === "text" ? "flex-start" : "center" }}>
              <textarea
                ref={textareaRef} value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={commitTextEdit}
                onKeyDown={e => {
                  if (e.key === "Escape") {
                    if (editingShape.type === "text" && !editText.trim()) removeShape(editingShape.id)
                    setEditingShapeId(null); setEditText("")
                  }
                  if (e.key === "Enter" && !e.shiftKey && editingShape.type !== "text") { e.preventDefault(); commitTextEdit() }
                }}
                onMouseDown={e => e.stopPropagation()}
                placeholder={editingShape.type === "text" ? "Metin gir…" : "Type here…"}
                style={{
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                  fontSize: editingShape.type === "text" ? 20 : 16,
                  fontWeight: 500,
                  color: editingShape.type === "text" ? editingShape.stroke : "#1E293B",
                  textAlign: editingShape.type === "text" ? "left" : "center",
                  background: editingShape.type === "text" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.9)",
                  border: editingShape.type === "text" ? "1.5px dashed rgba(99,102,241,0.5)" : "2px solid #6366F1",
                  borderRadius: 6, outline: "none",
                  resize: "none",
                  width: editingShape.type === "text" ? "100%" : "90%",
                  height: editingShape.type === "text" ? "100%" : undefined,
                  maxHeight: editingShape.type === "text" ? undefined : "90%",
                  padding: "6px 8px", cursor: "text", lineHeight: 1.4,
                  boxShadow: "0 0 0 4px rgba(99,102,241,0.08)",
                }}
              />
            </div>
          </foreignObject>
        )}

        {/* ── Drawing previews ── */}
        {activeTool === "pen" && pathPreview && (
          <path d={pathPreview} stroke={drawStyle.stroke} fill="none" strokeWidth={drawStyle.strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />
        )}
        {shapePreview?.type === "rect" && shapePreview.w > 0 && shapePreview.h > 0 && (
          <RoughRect x={shapePreview.x} y={shapePreview.y} w={shapePreview.w} h={shapePreview.h}
            seed={seedRef.current} stroke={drawStyle.stroke} fill={drawStyle.fill} strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        {shapePreview?.type === "circle" && shapePreview.r > 0 && (
          <RoughCircle cx={shapePreview.cx} cy={shapePreview.cy} r={shapePreview.r}
            seed={seedRef.current} stroke={drawStyle.stroke} fill="none" strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        {shapePreview?.type === "arrow" && (
          <RoughArrow x1={shapePreview.x1} y1={shapePreview.y1} x2={shapePreview.x2} y2={shapePreview.y2}
            seed={seedRef.current} stroke={drawStyle.stroke} strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        {shapePreview?.type === "diamond" && shapePreview.w > 0 && shapePreview.h > 0 && (
          <RoughDiamond x={shapePreview.x} y={shapePreview.y} w={shapePreview.w} h={shapePreview.h}
            seed={seedRef.current} stroke={drawStyle.stroke} fill={drawStyle.fill} strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        {shapePreview?.type === "cylinder" && shapePreview.w > 0 && shapePreview.h > 0 && (
          <RoughCylinder x={shapePreview.x} y={shapePreview.y} w={shapePreview.w} h={shapePreview.h}
            seed={seedRef.current} stroke={drawStyle.stroke} fill={drawStyle.fill} strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        {shapePreview?.type === "cloud" && shapePreview.w > 0 && shapePreview.h > 0 && (
          <RoughCloud x={shapePreview.x} y={shapePreview.y} w={shapePreview.w} h={shapePreview.h}
            seed={seedRef.current} stroke={drawStyle.stroke} fill={drawStyle.fill} strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        {shapePreview?.type === "queue" && shapePreview.w > 0 && shapePreview.h > 0 && (
          <RoughQueue x={shapePreview.x} y={shapePreview.y} w={shapePreview.w} h={shapePreview.h}
            seed={seedRef.current} stroke={drawStyle.stroke} fill={drawStyle.fill} strokeWidth={drawStyle.strokeWidth} strokeStyle={drawStyle.strokeStyle} />
        )}
        </g>
      </svg>

      {/* ── Style panel (fixed position via portal, unaffected by canvas transform) ── */}
      {showStylePanel && (() => {
        const singleShape = selectedShapeIds.length === 1 ? dayShapes.find(s => s.id === selectedShapeIds[0]) : undefined
        return (
          <StylePanel
            selectedIds={selectedShapeIds}
            shapes={dayShapes}
            currentStyle={drawStyle}
            onStyleChange={handleStyleChange}
            onPin={singleShape ? () => toggleShapePin(singleShape.id) : undefined}
            isPinned={singleShape?.pinned ?? false}
          />
        )
      })()}

      {/* ── Text tool overlay: absolute textarea positioned by viewTransform ── */}
      {pendingText && (
        <textarea
          ref={textOverlayRef}
          value={pendingTextValue}
          onChange={e => setPendingTextValue(e.target.value)}
          placeholder="Metin gir… (Shift+Enter yeni satır, Enter bitir)"
          onKeyDown={e => {
            if (e.key === "Escape") { setPendingText(null); setPendingTextValue(""); e.stopPropagation() }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitPendingText() }
          }}
          onBlur={commitPendingText}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: "absolute",
            left: viewTransform.x + pendingText.worldX * viewTransform.scale,
            top: viewTransform.y + pendingText.worldY * viewTransform.scale,
            minWidth: 180,
            minHeight: Math.max(12, 20 * viewTransform.scale) * 1.8,
            fontSize: Math.max(12, 20 * viewTransform.scale),
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontWeight: 500,
            color: drawStyle.stroke,
            background: "rgba(255,255,255,0.95)",
            border: "1.5px dashed rgba(99,102,241,0.6)",
            borderRadius: 6,
            outline: "none",
            resize: "both",
            padding: "4px 8px",
            lineHeight: 1.5,
            zIndex: 200,
            boxShadow: "0 2px 16px rgba(99,102,241,0.18)",
            cursor: "text",
          }}
        />
      )}
    </>
  )
}
