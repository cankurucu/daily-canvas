import React, { useState, useMemo, useRef, useEffect, useCallback } from "react"
import {
  Share2,
  ChevronLeft,
  ChevronRight,
  User,
  Check,
  Link,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react"
import { LogoIcon } from "./components/LogoIcon"
import { RoughRect, RoughCircle, RoughArrow } from "./components/CanvasShapes"
import { StickyNote, PinnedCard, PinnedShapeCard } from "./components/StickyNote"
import { FloatingToolbar, type Tool } from "./components/FloatingToolbar"
import { DrawingLayer } from "./components/DrawingLayer"
import { useCanvasStore, type ShapeData } from "./store/useCanvasStore"
import { awareness, clientColor } from "./store/yjsProvider"
import { LiveCursors } from "./components/LiveCursors"
import { clipboard } from "./clipboard"

/* ─── Constants ─── */

function getInitials(name: string): string {
  if (!name || name === 'Anonymous') return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase()
}

function useLiveUsers() {
  const [users, setUsers] = useState<Array<{ clientId: number; name: string; color: string; isSelf: boolean }>>([])

  useEffect(() => {
    function sync() {
      const result: typeof users = []
      awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: { name: string; color: string } }).user
        if (!u) return
        result.push({ clientId, name: u.name, color: u.color, isSelf: clientId === awareness.clientID })
      })
      // Self first, then others in join order
      result.sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : 0))
      setUsers(result)
    }
    sync()
    awareness.on('change', sync)
    return () => awareness.off('change', sync)
  }, [])

  return users
}

const NOTE_COLORS = ["#BBFAD4", "#FEF3A0", "#BAE6FD", "#FBCFE8", "#E9D5FF"]

/* ─── Helpers ─── */

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getShapeWorldCenter(s: ShapeData): { x: number; y: number } {
  const dx = s.dx ?? 0, dy = s.dy ?? 0
  if (s.rect) return { x: s.rect.x + dx + s.rect.w / 2, y: s.rect.y + dy + s.rect.h / 2 }
  if (s.circle) return { x: s.circle.cx + dx, y: s.circle.cy + dy }
  if (s.arrow) return { x: (s.arrow.x1 + s.arrow.x2) / 2 + dx, y: (s.arrow.y1 + s.arrow.y2) / 2 + dy }
  return { x: dx, y: dy }
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
}

function formatDayShort(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short" })
}

function formatDayNum(date: Date) {
  return date.getDate().toString()
}

function isToday(date: Date) {
  const today = new Date()
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  )
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]

/* ─── Dot Grid (outside world div — aligns with view transform) ─── */

function DotGrid({ tx, ty, scale }: { tx: number; ty: number; scale: number }) {
  const spacing = 24 * scale
  const ox = ((tx % spacing) + spacing) % spacing
  const oy = ((ty % spacing) + spacing) % spacing
  const r = Math.min(1.5, Math.max(0.6, scale))
  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="dots" x={ox} y={oy} width={spacing} height={spacing} patternUnits="userSpaceOnUse">
          <circle cx={0} cy={0} r={r} fill="#CBD5E1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots)" />
    </svg>
  )
}

/* ─── Zoom controls ─── */

function ZoomControls({
  scale, onZoomIn, onZoomOut, onReset,
}: { scale: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void }) {
  const btn: React.CSSProperties = {
    width: 30, height: 30, border: "none", backgroundColor: "transparent",
    cursor: "pointer", fontSize: 15, color: "#475569",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background-color 0.1s",
    fontFamily: "'Inter', sans-serif",
  }
  return (
    <div style={{
      position: "absolute", bottom: 76, right: 20,
      display: "flex", alignItems: "center",
      backgroundColor: "#FFFFFF",
      border: "1px solid rgba(30,41,59,0.1)",
      borderRadius: 8,
      boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
      overflow: "hidden",
    }}>
      <button onClick={onZoomOut} style={{ ...btn, borderRight: "1px solid rgba(30,41,59,0.08)" }} title="Zoom out (Ctrl+−)">−</button>
      <button
        onClick={onReset}
        title="Reset zoom (Ctrl+0)"
        style={{
          height: 30, padding: "0 8px", border: "none", borderRight: "1px solid rgba(30,41,59,0.08)",
          backgroundColor: "transparent", cursor: "pointer",
          fontSize: 11.5, fontWeight: 500, color: "#475569",
          fontFamily: "'Inter', sans-serif", minWidth: 52, whiteSpace: "nowrap",
        }}
      >
        {Math.round(scale * 100)}%
      </button>
      <button onClick={onZoomIn} style={btn} title="Zoom in (Ctrl+=)">+</button>
    </div>
  )
}

/* ─── Demo shapes (day-specific decorative content) ─── */

function DemoShapes({ date }: { date: string }) {
  const todayStr = localDateStr(new Date())
  const d = new Date(date), t = new Date(todayStr)
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000)
  return (
    <svg
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      {diff === 0 && (
        <>

        </>
      )}
      {diff === -1 && (
        <>

        </>
      )}
      {diff === 1 && (
        <>

        </>
      )}
    </svg>
  )
}

/* ─── App ─── */

export default function App() {
  const today = useMemo(() => new Date(), [])
  const [selectedDay, setSelectedDay] = useState<Date>(today)
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeTool, setActiveTool] = useState<Tool>("select")
  const [monthOffset, setMonthOffset] = useState(0)
  const [viewTransform, setViewTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [isPanning, setIsPanning] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const canvasRef = useRef<HTMLDivElement>(null)
  const draggingIdRef = useRef<string | null>(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const colorIndexRef = useRef(0)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, origTx: 0, origTy: 0 })

  const { notes, addNote, updateNote, removeNote, nickname, setNickname, shapes, toggleShapePin, updateShape, selectedShapeIds } = useCanvasStore()

  const [showProfileModal, setShowProfileModal] = useState(false)
  const [profileInput, setProfileInput] = useState('')
  const [copied, setCopied] = useState(false)
  const liveUsers = useLiveUsers()

  const handleShare = useCallback(() => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }, [])

  // Keep awareness presence in sync with current user identity
  useEffect(() => {
    awareness.setLocalState({
      user: { name: nickname || 'Anonymous', color: clientColor() },
      cursor: null,
    })
    return () => { awareness.setLocalState(null) }
  }, [nickname])

  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false)
  const noteMarqueeStartRef = useRef<{ worldX: number; worldY: number } | null>(null)
  const dragGroupRef = useRef<Array<{ id: string; origX: number; origY: number }>>([])
  const dragGroupStartMouseRef = useRef<{ clientX: number; clientY: number } | null>(null)
  // Snapshot of selected shapes captured at note drag start for coordinated drag
  const shapeGroupDragRef = useRef<Array<{ id: string; origDx: number; origDy: number }>>([])

  /* ── Wheel: zoom (Ctrl) or pan (no modifier) — non-passive so preventDefault works ── */
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const rect = el!.getBoundingClientRect()
        const mx = e.clientX - rect.left, my = e.clientY - rect.top
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
        setViewTransform(prev => {
          const newScale = Math.max(0.1, Math.min(8, prev.scale * factor))
          const ratio = newScale / prev.scale
          return { x: mx - (mx - prev.x) * ratio, y: my - (my - prev.y) * ratio, scale: newScale }
        })
      } else {
        setViewTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }))
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  /* ── Clear note selection when tool changes ── */
  useEffect(() => {
    if (activeTool !== "select") setSelectedNoteIds([])
  }, [activeTool])

  /* ── Delete selected notes with Delete / Backspace ── */
  useEffect(() => {
    if (selectedNoteIds.length === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Delete" && e.key !== "Backspace") return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return
      for (const id of selectedNoteIds) removeNote(id)
      setSelectedNoteIds([])
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedNoteIds, removeNote])

  /* ── Copy / Paste notes ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return

      if (e.key === "c") {
        if (selectedNoteIds.length === 0) return
        e.preventDefault()
        const { notes } = useCanvasStore.getState()
        clipboard.notes = notes.filter(n => selectedNoteIds.includes(n.id)).map(n => ({ ...n }))
        clipboard.shapes = []
      }

      if (e.key === "v") {
        if (clipboard.notes.length === 0) return
        e.preventDefault()
        const OFFSET = 20
        const { addNote } = useCanvasStore.getState()
        const newIds: string[] = []
        for (const n of clipboard.notes) {
          const newId = `note-${Date.now()}-${Math.random().toString(36).slice(2)}`
          newIds.push(newId)
          addNote({
            ...n,
            id: newId,
            x: n.x + OFFSET,
            y: n.y + OFFSET,
            date: localDateStr(selectedDay),
            pinned: false,
          })
        }
        setSelectedNoteIds(newIds)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [selectedNoteIds, selectedDay, addNote])

  /* ── Tool keyboard shortcuts: 1–8 ── */
  useEffect(() => {
    const TOOL_KEYS: Record<string, Tool> = {
      "1": "select", "2": "pen",      "3": "rect",     "4": "circle",
      "5": "arrow",  "6": "diamond",  "7": "cylinder", "8": "cloud",
      "9": "queue",  "0": "text",     "-": "sticky",
    }
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === "TEXTAREA" || tag === "INPUT") return
      const tool = TOOL_KEYS[e.key]
      if (tool) setActiveTool(tool)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ── Keyboard shortcuts: Ctrl+= zoom in, Ctrl+− zoom out, Ctrl+0 reset ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === "=" || e.key === "+") {
        e.preventDefault()
        setViewTransform(prev => ({ ...prev, scale: Math.min(8, prev.scale * 1.2) }))
      } else if (e.key === "-") {
        e.preventDefault()
        setViewTransform(prev => ({ ...prev, scale: Math.max(0.1, prev.scale / 1.2) }))
      } else if (e.key === "0") {
        e.preventDefault()
        setViewTransform({ x: 0, y: 0, scale: 1 })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const monthStart = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + monthOffset, 1),
    [today, monthOffset]
  )

  const monthGridDays = useMemo(() => {
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()
    const firstDow = monthStart.getDay() // 0=Sun
    const startPad = firstDow === 0 ? 6 : firstDow - 1 // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days: Date[] = []
    for (let i = startPad; i > 0; i--) days.push(new Date(year, month, 1 - i))
    for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
    const rem = days.length % 7
    if (rem !== 0) for (let d = 1; d <= 7 - rem; d++) days.push(new Date(year, month + 1, d))
    return days
  }, [monthStart])

  const selectedDate = useMemo(
    () => localDateStr(selectedDay),
    [selectedDay]
  )

  const visibleNotes = notes.filter((n) => n.date === selectedDate)
  const pinnedNotes = notes.filter((n) => n.pinned)
  const pinnedShapes = shapes.filter((s) => s.pinned)

  const dayHasContent = (d: Date) => {
    const dateStr = localDateStr(d)
    return notes.some((n) => n.date === dateStr)
  }

  /* Drag / pan handling */

  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, origTx: viewTransform.x, origTy: viewTransform.y }
      return
    }
    // Left-click on empty canvas in select mode → start note marquee
    if (e.button === 0 && activeTool === "select") {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const { x: tx, y: ty, scale: s } = viewTransform
      noteMarqueeStartRef.current = {
        worldX: (e.clientX - rect.left - tx) / s,
        worldY: (e.clientY - rect.top - ty) / s,
      }
      setIsMarqueeSelecting(true)
    }
  }

  function handleNoteDragStart(id: string, noteX: number, noteY: number, e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    noteMarqueeStartRef.current = null

    // If dragged note is already selected, drag the whole group; otherwise select just this one
    const groupIds = selectedNoteIds.includes(id) ? selectedNoteIds : [id]
    if (!selectedNoteIds.includes(id)) setSelectedNoteIds([id])

    draggingIdRef.current = id
    const { x: tx, y: ty, scale: s } = viewTransform
    dragOffsetRef.current = {
      x: (e.clientX - rect.left - tx) / s - noteX,
      y: (e.clientY - rect.top - ty) / s - noteY,
    }
    dragGroupStartMouseRef.current = { clientX: e.clientX, clientY: e.clientY }
    dragGroupRef.current = notes
      .filter(n => groupIds.includes(n.id))
      .map(n => ({ id: n.id, origX: n.x, origY: n.y }))

    // Snapshot selected shapes so they move together with the notes
    const currentShapes = useCanvasStore.getState().shapes
    const currentSelectedShapeIds = useCanvasStore.getState().selectedShapeIds
    shapeGroupDragRef.current = currentShapes
      .filter(s => currentSelectedShapeIds.includes(s.id))
      .map(s => ({ id: s.id, origDx: s.dx ?? 0, origDy: s.dy ?? 0 }))

    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
  }

  function handleCanvasMouseMove(e: React.MouseEvent) {
    // Broadcast cursor position in world coordinates to all other clients
    const canvasRect = canvasRef.current?.getBoundingClientRect()
    if (canvasRect) {
      const { x: tx, y: ty, scale: s } = viewTransform
      const wx = (e.clientX - canvasRect.left - tx) / s
      const wy = (e.clientY - canvasRect.top - ty) / s
      awareness.setLocalStateField('cursor', { x: wx, y: wy })
    }

    if (isPanning) {
      const dx = e.clientX - panStartRef.current.mouseX
      const dy = e.clientY - panStartRef.current.mouseY
      setViewTransform(prev => ({ ...prev, x: panStartRef.current.origTx + dx, y: panStartRef.current.origTy + dy }))
      return
    }
    if (!draggingIdRef.current || !dragGroupStartMouseRef.current) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const { x: tx, y: ty, scale: s } = viewTransform

    const dxWFromStart = (e.clientX - dragGroupStartMouseRef.current.clientX) / s
    const dyWFromStart = (e.clientY - dragGroupStartMouseRef.current.clientY) / s

    if (dragGroupRef.current.length > 1) {
      for (const { id, origX, origY } of dragGroupRef.current) {
        updateNote(id, { x: origX + dxWFromStart, y: origY + dyWFromStart })
      }
    } else {
      const x = (e.clientX - rect.left - tx) / s - dragOffsetRef.current.x
      const y = (e.clientY - rect.top - ty) / s - dragOffsetRef.current.y
      updateNote(draggingIdRef.current, { x, y })
    }

    // Also move selected shapes during note drag
    if (shapeGroupDragRef.current.length > 0) {
      for (const { id, origDx, origDy } of shapeGroupDragRef.current) {
        updateShape(id, { dx: origDx + dxWFromStart, dy: origDy + dyWFromStart })
      }
    }
  }

  function handleCanvasMouseUp(e: React.MouseEvent) {
    setIsPanning(false)

    // Compute note marquee selection
    if (noteMarqueeStartRef.current && draggingIdRef.current === null) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (rect) {
        const { x: tx, y: ty, scale: s } = viewTransform
        const wx2 = (e.clientX - rect.left - tx) / s
        const wy2 = (e.clientY - rect.top - ty) / s
        const { worldX: wx1, worldY: wy1 } = noteMarqueeStartRef.current
        const x1 = Math.min(wx1, wx2), y1 = Math.min(wy1, wy2)
        const x2 = Math.max(wx1, wx2), y2 = Math.max(wy1, wy2)
        if (x2 - x1 > 6 || y2 - y1 > 6) {
          const NOTE_W = 168, NOTE_H = 180
          const hit = visibleNotes
            .filter(n => n.x + NOTE_W > x1 && n.x < x2 && n.y + NOTE_H > y1 && n.y < y2)
            .map(n => n.id)
          setSelectedNoteIds(hit)
        } else {
          setSelectedNoteIds([])
        }
      }
    }

    setIsMarqueeSelecting(false)
    noteMarqueeStartRef.current = null
    draggingIdRef.current = null
    dragGroupRef.current = []
    shapeGroupDragRef.current = []
    dragGroupStartMouseRef.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  function handleCanvasMouseLeave() {
    awareness.setLocalStateField('cursor', null)
    setIsPanning(false)
    setIsMarqueeSelecting(false)
    noteMarqueeStartRef.current = null
    draggingIdRef.current = null
    dragGroupRef.current = []
    shapeGroupDragRef.current = []
    dragGroupStartMouseRef.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  function handleZoom(direction: 1 | -1) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.width / 2, cy = rect.height / 2
    const factor = direction > 0 ? 1.25 : 1 / 1.25
    setViewTransform(prev => {
      const newScale = Math.max(0.1, Math.min(8, prev.scale * factor))
      const ratio = newScale / prev.scale
      return { x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio, scale: newScale }
    })
  }

  /* Note creation */

  function handleCreateNote(x: number, y: number) {
    const color = NOTE_COLORS[colorIndexRef.current % NOTE_COLORS.length]
    colorIndexRef.current++
    addNote({
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      x: Math.max(0, x - 84),
      y: Math.max(0, y - 40),
      color,
      text: "",
      author: nickname || "Anonymous",
      rotate: (Math.random() - 0.5) * 4,
      pinned: false,
      date: selectedDate,
    })
    setActiveTool("select")
  }

  const isSelectedToday = isToday(selectedDay)
  const dayLabel = formatDayLabel(selectedDay)

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100vw",
        backgroundColor: "#F9FAFB",
        fontFamily: "'Inter', system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── SIDEBAR ── */}
      <aside
        style={{
          width: sidebarOpen ? 240 : 0,
          flexShrink: 0,
          height: "100vh",
          overflow: "hidden",
          transition: "width 0.22s ease",
        }}
      >
        <div
          style={{
            width: 240,
            height: "100vh",
            backgroundColor: "#FFFFFF",
            borderRight: "1px solid rgba(30,41,59,0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
        {/* Logo + Workspace */}
        <div style={{ padding: "18px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <LogoIcon size={28} />
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1E293B", letterSpacing: "-0.025em" }}>
                DailyCanvas
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              title="Sidebar'ı kapat"
              style={{
                border: "none",
                background: "none",
                cursor: "pointer",
                color: "#94A3B8",
                padding: 4,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <PanelLeftClose size={17} />
            </button>
          </div>

        </div>

        {/* Calendar Navigation */}
        <div style={{ padding: "0 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              {monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <div style={{ display: "flex", gap: 1 }}>
              <button onClick={() => setMonthOffset(o => o - 1)} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}>
                <ChevronLeft size={12} />
              </button>
              <button onClick={() => setMonthOffset(o => o + 1)} style={{ border: "none", background: "none", cursor: "pointer", color: "#94A3B8", padding: "2px 4px", borderRadius: 4, display: "flex", alignItems: "center" }}>
                <ChevronRight size={12} />
              </button>
            </div>
          </div>

          {/* Weekday header */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 3 }}>
            {WEEKDAY_LABELS.map((label, i) => (
              <div key={i} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.03em" }}>
                {label}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {monthGridDays.map((d) => {
              const sel = isSameDay(d, selectedDay)
              const tod = isToday(d)
              const hasContent = dayHasContent(d)
              const inMonth = isSameMonth(d, monthStart)
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => {
                    setSelectedDay(d)
                    if (!inMonth) {
                      const diff = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth())
                      setMonthOffset(diff)
                    }
                  }}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    gap: 2, height: 30, borderRadius: 6, padding: 0, cursor: "pointer",
                    border: tod && !sel ? "1.5px solid #37003A" : "1.5px solid transparent",
                    backgroundColor: sel ? "#1E293B" : "transparent",
                    transition: "background-color 0.12s",
                    opacity: inMonth ? 1 : 0.3,
                  }}
                >
                  <span style={{
                    fontSize: 12,
                    fontWeight: sel ? 700 : tod ? 600 : 400,
                    color: sel ? "#FFFFFF" : tod ? "#37003A" : "#374151",
                    lineHeight: 1,
                  }}>
                    {d.getDate()}
                  </span>
                  <div style={{
                    width: 3, height: 3, borderRadius: "50%",
                    backgroundColor: hasContent ? (sel ? "rgba(255,255,255,0.55)" : "#37003A") : "transparent",
                  }} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, backgroundColor: "rgba(30,41,59,0.06)", margin: "14px 0 0" }} />

        {/* Pinned Items */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", padding: "12px 16px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Pinned Items
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "#37003A",
                backgroundColor: "#FFDCFF",
                padding: "1px 7px",
                borderRadius: 99,
              }}
            >
              {pinnedNotes.length + pinnedShapes.length}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16, scrollbarWidth: "none" }}>
            {pinnedNotes.length === 0 && pinnedShapes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#CBD5E1" }}>
                <p style={{ fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 17, margin: 0, lineHeight: 1.45 }}>
                  Pin a sticky note or shape to save it here
                </p>
              </div>
            ) : (
              <>
                {pinnedNotes.map((note) => {
                  const noteDate = new Date(note.date + 'T12:00:00')
                  const handlePinnedClick = () => {
                    const [y, m, d] = note.date.split('-').map(Number)
                    setSelectedDay(new Date(y, m - 1, d))
                    const rect = canvasRef.current?.getBoundingClientRect()
                    if (rect) {
                      setViewTransform(prev => ({
                        ...prev,
                        x: rect.width / 2 - (note.x + 84) * prev.scale,
                        y: rect.height / 2 - (note.y + 40) * prev.scale,
                      }))
                    }
                  }
                  return (
                    <PinnedCard
                      key={note.id}
                      color={note.color}
                      text={note.text}
                      date={noteDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      tag={note.tag}
                      onClick={handlePinnedClick}
                    />
                  )
                })}
                {pinnedShapes.map((shape) => {
                  const shapeDate = new Date(shape.date + 'T12:00:00')
                  const handleShapeClick = () => {
                    const [y, m, d] = shape.date.split('-').map(Number)
                    setSelectedDay(new Date(y, m - 1, d))
                    const center = getShapeWorldCenter(shape)
                    const rect = canvasRef.current?.getBoundingClientRect()
                    if (rect) {
                      setViewTransform(prev => ({
                        ...prev,
                        x: rect.width / 2 - center.x * prev.scale,
                        y: rect.height / 2 - center.y * prev.scale,
                      }))
                    }
                  }
                  return (
                    <PinnedShapeCard
                      key={shape.id}
                      type={shape.type}
                      stroke={shape.stroke}
                      text={shape.text}
                      date={shapeDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      onClick={handleShapeClick}
                    />
                  )
                })}
              </>
            )}
          </div>
        </div>
        </div>
      </aside>

      {/* ── MAIN CANVAS AREA ── */}
      <main style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Header */}
        <header
          style={{
            height: 56,
            flexShrink: 0,
            backgroundColor: "#FFFFFF",
            borderBottom: "1px solid rgba(30,41,59,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 22px",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Sidebar'ı aç"
                style={{
                  border: "1px solid rgba(30,41,59,0.1)",
                  background: "#FFFFFF",
                  cursor: "pointer",
                  color: "#475569",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginRight: 4,
                }}
              >
                <PanelLeftOpen size={17} />
              </button>
            )}
            {isSelectedToday && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#37003A",
                  backgroundColor: "#FFDCFF",
                  padding: "3px 8px",
                  borderRadius: 99,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  flexShrink: 0,
                }}
              >
                Today
              </span>
            )}
            <h1 style={{ fontSize: 17, fontWeight: 600, color: "#0F172A", margin: 0, lineHeight: 1, letterSpacing: "-0.015em" }}>
              {dayLabel}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Live participant avatars */}
            {liveUsers.length > 0 && (
              <div style={{ display: "flex", alignItems: "center" }}>
                {liveUsers.slice(0, 5).map((u, i) => (
                  <div
                    key={u.clientId}
                    title={u.isSelf ? `${u.name} (you)` : u.name}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      backgroundColor: u.color,
                      border: u.isSelf ? "2px solid #FF8AFF" : "2px solid #FFFFFF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#FFFFFF",
                      marginLeft: i > 0 ? -8 : 0,
                      cursor: "default",
                      letterSpacing: "0.02em",
                      boxShadow: u.isSelf ? "0 0 0 2px #FF8AFF" : undefined,
                      zIndex: u.isSelf ? 2 : 1,
                      position: "relative",
                      textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                    }}
                  >
                    {getInitials(u.name)}
                  </div>
                ))}
                {liveUsers.length > 5 && (
                  <div style={{
                    width: 30, height: 30, borderRadius: "50%",
                    backgroundColor: "#F1F5F9", border: "2px solid #FFFFFF",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginLeft: -8, fontSize: 10, fontWeight: 700, color: "#64748B",
                  }}>
                    +{liveUsers.length - 5}
                  </div>
                )}
              </div>
            )}

            <div style={{ width: 1, height: 20, backgroundColor: "rgba(30,41,59,0.1)" }} />

            <button
              onClick={handleShare}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                backgroundColor: copied ? "#22C55E" : "#1E293B",
                color: "#FFFFFF",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "'Inter', sans-serif",
                transition: "background-color 0.2s",
              }}
            >
              {copied ? <Check size={12} /> : <Link size={12} />}
              {copied ? "Copied!" : "Share"}
            </button>

            <div style={{ width: 1, height: 20, backgroundColor: "rgba(30,41,59,0.1)" }} />

            {/* Profile button */}
            <button
              onClick={() => {
                setProfileInput(nickname)
                setShowProfileModal(true)
              }}
              title={nickname ? `${nickname} — edit profile` : "Profile"}
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                backgroundColor: nickname ? "#FF8AFF" : "#F1F5F9",
                border: nickname ? "2px solid #FF8AFF" : "2px solid rgba(30,41,59,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: nickname ? "#37003A" : "#94A3B8",
                fontSize: 11,
                fontWeight: 700,
                fontFamily: "'Inter', sans-serif",
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              {nickname
                ? nickname.slice(0, 2).toUpperCase()
                : <User size={14} />}
            </button>
          </div>
        </header>

        {/* Canvas */}
        <div
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleCanvasMouseMove}
          onMouseUp={handleCanvasMouseUp}
          onMouseLeave={handleCanvasMouseLeave}
          style={{ flex: 1, position: "relative", overflow: "hidden", cursor: isPanning ? "grabbing" : undefined }}
        >
          {/* Dot grid — outside world, aligned via transform */}
          <DotGrid tx={viewTransform.x} ty={viewTransform.y} scale={viewTransform.scale} />

          {/* DrawingLayer: outside world div so its SVG always covers the full canvas
              regardless of pan/zoom. World transform is applied internally via <g transform>. */}
          <DrawingLayer activeTool={activeTool} date={selectedDate} onCreateNote={handleCreateNote} viewTransform={viewTransform} selectedNoteIds={selectedNoteIds} />

          {/* World: everything that zooms and pans */}
          <div
            style={{
              position: "absolute", inset: 0,
              transform: `translate(${viewTransform.x}px, ${viewTransform.y}px) scale(${viewTransform.scale})`,
              transformOrigin: "0 0",
              willChange: "transform",
              pointerEvents: "none",
            }}
          >
            <DemoShapes date={selectedDate} />

            {/* Live cursors — rendered in world space so they follow pan/zoom */}
            <LiveCursors />

            {/* Sticky notes */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {visibleNotes.map((note) => (
                <div key={note.id} style={{ pointerEvents: isMarqueeSelecting ? "none" : "all" }}>
                  <StickyNote
                    {...note}
                    activeTool={activeTool}
                    isSelected={selectedNoteIds.includes(note.id)}
                    onDragStart={handleNoteDragStart}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Fixed UI — not affected by zoom/pan */}

          {activeTool !== "select" && (
            <div
              style={{
                position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
                backgroundColor: "rgba(30,41,59,0.82)", color: "#FFFFFF",
                fontSize: 12.5, fontFamily: "'Inter', sans-serif",
                padding: "5px 14px", borderRadius: 99, backdropFilter: "blur(8px)",
                pointerEvents: "none", whiteSpace: "nowrap",
              }}
            >
              {activeTool === "pen" && "Draw mode — click and drag on canvas"}
              {activeTool === "rect" && "Rectangle — click and drag to draw"}
              {activeTool === "circle" && "Circle — click and drag to draw"}
              {activeTool === "arrow" && "Arrow — click and drag to draw · snap to shape edges"}
              {activeTool === "text" && "Text — click anywhere to add text · Enter commits · Shift+Enter new line"}
              {activeTool === "sticky" && "Sticky Note — double-click anywhere to place"}
              {activeTool === "pin" && "Pin mode — click a note to toggle its pin"}
            </div>
          )}

          <FloatingToolbar activeTool={activeTool} onToolChange={setActiveTool} />
          <ZoomControls
            scale={viewTransform.scale}
            onZoomIn={() => handleZoom(1)}
            onZoomOut={() => handleZoom(-1)}
            onReset={() => setViewTransform({ x: 0, y: 0, scale: 1 })}
          />
        </div>
      </main>

      {/* Profile modal */}
      {showProfileModal && (
        <div
          onClick={() => setShowProfileModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 16,
              padding: "28px 28px 24px",
              width: 340,
              boxShadow: "0 20px 60px rgba(55,0,58,0.2), 0 4px 16px rgba(55,0,58,0.1)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  backgroundColor: profileInput ? "#37003A" : "#F1F5F9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  fontWeight: 700,
                  color: profileInput ? "#FFFFFF" : "#94A3B8",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                {profileInput ? profileInput.slice(0, 2).toUpperCase() : <User size={18} />}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#37003A", lineHeight: 1.2 }}>
                  {profileInput || "Profile"}
                </div>
                <div style={{ fontSize: 12, color: "rgba(55,0,58,0.5)", marginTop: 2 }}>Set your nickname</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#37003A", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Nickname
              </label>
              <input
                autoFocus
                value={profileInput}
                onChange={(e) => setProfileInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setNickname(profileInput.trim())
                    setShowProfileModal(false)
                  }
                  if (e.key === "Escape") setShowProfileModal(false)
                }}
                placeholder="Enter your name..."
                maxLength={24}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1.5px solid rgba(55,0,58,0.2)",
                  fontSize: 14,
                  color: "#0F172A",
                  fontFamily: "'Inter', sans-serif",
                  outline: "none",
                  boxSizing: "border-box",
                  backgroundColor: "#FFF5FF",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => { e.target.style.borderColor = "#FF8AFF" }}
                onBlur={(e) => { e.target.style.borderColor = "rgba(55,0,58,0.2)" }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowProfileModal(false)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid rgba(55,0,58,0.2)",
                  backgroundColor: "transparent",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#37003A",
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setNickname(profileInput.trim())
                  setShowProfileModal(false)
                }}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#37003A",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#FFFFFF",
                  cursor: "pointer",
                  fontFamily: "'Inter', sans-serif",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Check size={13} />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
