import React from "react"
import type { StrokeStyle } from "../store/useCanvasStore"

function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10000
  return x - Math.floor(x)
}

function jitter(seed: number, index: number, magnitude = 3): number {
  return (seededRand(seed * 31 + index) - 0.5) * magnitude * 2
}

function dashArray(style: StrokeStyle = 'solid'): string | undefined {
  if (style === 'dashed') return '8 4'
  if (style === 'dotted') return '2 4'
  return undefined
}

interface RoughRectProps {
  x: number
  y: number
  w: number
  h: number
  seed: number
  stroke?: string
  fill?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export function RoughRect({
  x, y, w, h, seed,
  stroke = "#1E293B",
  fill = "none",
  strokeWidth = 2,
  strokeStyle = 'solid',
}: RoughRectProps) {
  const j = (i: number) => jitter(seed, i, 2.2)

  const path1 = `M ${x + j(1)} ${y + j(2)}
    L ${x + w + j(3)} ${y + j(4)}
    L ${x + w + j(5)} ${y + h + j(6)}
    L ${x + j(7)} ${y + h + j(8)} Z`

  const path2 = `M ${x + j(9)} ${y + j(10)}
    L ${x + w + j(11)} ${y + j(12)}
    L ${x + w + j(13)} ${y + h + j(14)}
    L ${x + j(15)} ${y + h + j(16)} Z`

  const da = dashArray(strokeStyle)

  return (
    <g>
      {/* Shadow/depth pass — stroke only, no fill */}
      <path d={path1} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeDasharray={da} />
      {/* Main pass — fill + stroke */}
      <path d={path2} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={da} />
    </g>
  )
}

interface RoughCircleProps {
  cx: number
  cy: number
  r: number
  seed: number
  stroke?: string
  fill?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export function RoughCircle({
  cx, cy, r, seed,
  stroke = "#1E293B",
  fill = "none",
  strokeWidth = 2,
  strokeStyle = 'solid',
}: RoughCircleProps) {
  const j = (i: number) => jitter(seed, i, 2.5)
  const da = dashArray(strokeStyle)

  function buildPath(offset: number) {
    const points: string[] = []
    const count = 28
    for (let i = 0; i <= count; i++) {
      const angle = (i / count) * Math.PI * 2
      const rr = r + j(i + offset) * 0.7
      const px = cx + Math.cos(angle) * rr
      const py = cy + Math.sin(angle) * rr
      points.push(`${i === 0 ? "M" : "L"} ${px} ${py}`)
    }
    points.push("Z")
    return points.join(" ")
  }

  return (
    <g>
      <path d={buildPath(0)} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
      <path d={buildPath(30)} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
    </g>
  )
}

interface RoughArrowProps {
  x1: number
  y1: number
  x2: number
  y2: number
  seed: number
  stroke?: string
  strokeWidth?: number
  strokeStyle?: StrokeStyle
}

export function RoughArrow({
  x1, y1, x2, y2, seed,
  stroke = "#64748B",
  strokeWidth = 2,
  strokeStyle = 'solid',
}: RoughArrowProps) {
  const j = (i: number) => jitter(seed, i, 1.5)

  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)

  // Perpendicular unit vector for a subtle, seed-consistent curve
  const perpX = len > 1 ? -dy / len : 0
  const perpY = len > 1 ? dx / len : 0
  const curveMag = (seededRand(seed * 17) - 0.5) * Math.min(len * 0.18, 22)
  const mx = (x1 + x2) / 2 + perpX * curveMag + j(1)
  const my = (y1 + y2) / 2 + perpY * curveMag + j(2)

  const angle = Math.atan2(y2 - y1, x2 - x1)
  const headLen = Math.max(13, strokeWidth * 4)
  const headAngle = 0.38

  // Shorten line so it doesn't overlap the filled arrowhead
  const tailX = x1 + j(3) * 0.5
  const tailY = y1 + j(4) * 0.5
  const endX = x2 - Math.cos(angle) * headLen * 0.55
  const endY = y2 - Math.sin(angle) * headLen * 0.55

  const ax1 = x2 - Math.cos(angle - headAngle) * headLen
  const ay1 = y2 - Math.sin(angle - headAngle) * headLen
  const ax2 = x2 - Math.cos(angle + headAngle) * headLen
  const ay2 = y2 - Math.sin(angle + headAngle) * headLen

  const da = dashArray(strokeStyle)

  return (
    <g>
      <path
        d={`M ${tailX} ${tailY} Q ${mx} ${my} ${endX} ${endY}`}
        stroke={stroke}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={da}
      />
      {/* Filled triangle arrowhead */}
      <polygon
        points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`}
        fill={stroke}
        stroke="none"
      />
    </g>
  )
}

// ─── Diamond ────────────────────────────────────────────────────────────────

interface RoughDiamondProps {
  x: number; y: number; w: number; h: number
  seed: number; stroke?: string; fill?: string
  strokeWidth?: number; strokeStyle?: StrokeStyle
}

export function RoughDiamond({ x, y, w, h, seed, stroke = '#1E293B', fill = 'none', strokeWidth = 2, strokeStyle = 'solid' }: RoughDiamondProps) {
  const j = (i: number) => jitter(seed, i, 2.2)
  const cx = x + w / 2, cy = y + h / 2
  const da = dashArray(strokeStyle)

  const path1 = `M ${cx + j(1)} ${y + j(2)} L ${x + w + j(3)} ${cy + j(4)} L ${cx + j(5)} ${y + h + j(6)} L ${x + j(7)} ${cy + j(8)} Z`
  const path2 = `M ${cx + j(9)} ${y + j(10)} L ${x + w + j(11)} ${cy + j(12)} L ${cx + j(13)} ${y + h + j(14)} L ${x + j(15)} ${cy + j(16)} Z`

  return (
    <g>
      <path d={path1} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
      <path d={path2} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
    </g>
  )
}

// ─── Cylinder ────────────────────────────────────────────────────────────────

interface RoughCylinderProps {
  x: number; y: number; w: number; h: number
  seed: number; stroke?: string; fill?: string
  strokeWidth?: number; strokeStyle?: StrokeStyle
}

export function RoughCylinder({ x, y, w, h, seed, stroke = '#1E293B', fill = 'none', strokeWidth = 2, strokeStyle = 'solid' }: RoughCylinderProps) {
  const j = (i: number) => jitter(seed, i, 1.8)
  const da = dashArray(strokeStyle)
  const midX = x + w / 2, halfW = w / 2
  const ellH = Math.max(8, Math.min(h * 0.18, 30))
  const topCy = y + ellH, botCy = y + h - ellH
  const steps = 20

  function arc(cy: number, fromA: number, toA: number, offset: number, close: boolean) {
    const n = Math.round(steps * Math.abs(toA - fromA) / (Math.PI * 2))
    const pts: string[] = []
    for (let i = 0; i <= n; i++) {
      const a = fromA + (i / n) * (toA - fromA)
      const px = midX + Math.cos(a) * (halfW + j(i + offset) * 0.3)
      const py = cy + Math.sin(a) * (ellH + j(i + offset + 50) * 0.2)
      pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`)
    }
    if (close) pts.push('Z')
    return pts.join(' ')
  }

  const top1 = arc(topCy, 0, Math.PI * 2, 0, true)
  const top2 = arc(topCy, 0, Math.PI * 2, 40, true)
  const bot1 = arc(botCy, 0, Math.PI, 80, false)
  const bot2 = arc(botCy, 0, Math.PI, 120, false)
  const lx = x, rx = x + w
  const sl1 = `M ${lx + j(150)} ${topCy + j(151)} L ${lx + j(152)} ${botCy + j(153)}`
  const sr1 = `M ${rx + j(160)} ${topCy + j(161)} L ${rx + j(162)} ${botCy + j(163)}`
  const sl2 = `M ${lx + j(154)} ${topCy + j(155)} L ${lx + j(156)} ${botCy + j(157)}`
  const sr2 = `M ${rx + j(164)} ${topCy + j(165)} L ${rx + j(166)} ${botCy + j(167)}`
  const body = `M ${lx} ${topCy} L ${rx} ${topCy} L ${rx} ${botCy} L ${lx} ${botCy} Z`

  return (
    <g>
      {fill !== 'none' && <path d={body} stroke="none" fill={fill} />}
      <path d={top1} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeDasharray={da} />
      <path d={`${sl1} ${sr1}`} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeDasharray={da} />
      <path d={bot1} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeDasharray={da} />
      <path d={top2} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={da} />
      <path d={`${sl2} ${sr2}`} stroke={stroke} fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={da} />
      <path d={bot2} stroke={stroke} fill="none" strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={da} />
    </g>
  )
}

// ─── Cloud ───────────────────────────────────────────────────────────────────

interface RoughCloudProps {
  x: number; y: number; w: number; h: number
  seed: number; stroke?: string; fill?: string
  strokeWidth?: number; strokeStyle?: StrokeStyle
}

// ─── Queue (pill / stadium) ───────────────────────────────────────────────────

interface RoughQueueProps {
  x: number; y: number; w: number; h: number
  seed: number; stroke?: string; fill?: string
  strokeWidth?: number; strokeStyle?: StrokeStyle
}

export function RoughQueue({ x, y, w, h, seed, stroke = '#1E293B', fill = 'none', strokeWidth = 2, strokeStyle = 'solid' }: RoughQueueProps) {
  const da = dashArray(strokeStyle)
  const cy = y + h / 2
  const r = Math.min(h / 2, w / 2)  // semicircle radius clamped so shape is valid
  const count = 14

  function buildPath(jScale: number, jOff: number) {
    const j = (i: number) => jitter(seed, i + jOff, jScale)
    const pts: string[] = []
    // Start: top-left corner
    pts.push(`M ${(x + r + j(1)).toFixed(1)} ${(y + j(2)).toFixed(1)}`)
    // Top line →
    pts.push(`L ${(x + w - r + j(3)).toFixed(1)} ${(y + j(4)).toFixed(1)}`)
    // Right semicircle (top → bottom, clockwise)
    for (let i = 1; i <= count; i++) {
      const a = -Math.PI / 2 + (i / count) * Math.PI
      const px = (x + w - r) + Math.cos(a) * (r + j(i + 10) * 0.35)
      const py = cy + Math.sin(a) * (r + j(i + 10 + count) * 0.25)
      pts.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`)
    }
    // Bottom line ←
    pts.push(`L ${(x + r + j(25)).toFixed(1)} ${(y + h + j(26)).toFixed(1)}`)
    // Left semicircle (bottom → top, clockwise)
    for (let i = 1; i <= count; i++) {
      const a = Math.PI / 2 + (i / count) * Math.PI
      const px = (x + r) + Math.cos(a) * (r + j(i + 30) * 0.35)
      const py = cy + Math.sin(a) * (r + j(i + 30 + count) * 0.25)
      pts.push(`L ${px.toFixed(1)} ${py.toFixed(1)}`)
    }
    pts.push('Z')
    return pts.join(' ')
  }

  return (
    <g>
      <path d={buildPath(2.5, 0)} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
      <path d={buildPath(1.5, 100)} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
    </g>
  )
}

export function RoughCloud({ x, y, w, h, seed, stroke = '#1E293B', fill = 'none', strokeWidth = 2, strokeStyle = 'solid' }: RoughCloudProps) {
  const da = dashArray(strokeStyle)

  function buildPath(jScale: number, jOff: number) {
    const j = (i: number) => jitter(seed, i + jOff, jScale)
    const p = (nx: number, ny: number, idx: number) =>
      `${(x + nx * w + j(idx)).toFixed(1)},${(y + ny * h + j(idx + 30)).toFixed(1)}`
    return [
      `M ${p(0.1, 1.0, 1)}`,
      `C ${p(0.0, 1.0, 2)} ${p(0.0, 0.65, 3)} ${p(0.12, 0.55, 4)}`,
      `C ${p(0.02, 0.38, 5)} ${p(0.15, 0.22, 6)} ${p(0.28, 0.22, 7)}`,
      `C ${p(0.22, 0.02, 8)} ${p(0.42, 0.0, 9)} ${p(0.47, 0.18, 10)}`,
      `C ${p(0.48, 0.02, 11)} ${p(0.64, 0.0, 12)} ${p(0.68, 0.18, 13)}`,
      `C ${p(0.7, 0.04, 14)} ${p(0.88, 0.1, 15)} ${p(0.88, 0.32, 16)}`,
      `C ${p(1.0, 0.32, 17)} ${p(1.0, 0.65, 18)} ${p(0.9, 1.0, 19)}`,
      'Z',
    ].join(' ')
  }

  return (
    <g>
      <path d={buildPath(2.5, 0)} stroke={stroke} fill="none" strokeWidth={strokeWidth + 0.5} strokeOpacity={0.25} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
      <path d={buildPath(1.5, 100)} stroke={stroke} fill={fill} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
    </g>
  )
}
