import React from "react"
import {
  MousePointer2,
  PenLine,
  Square,
  Circle,
  ArrowRight,
  Diamond,
  Database,
  Cloud,
  Type,
  StickyNote,
  Pin,
} from "lucide-react"

function QueueIcon({ size = 17, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) {
  const r = size * 0.34, cx = size / 2, cy = size / 2
  const lx = cx - size * 0.3, rx = cx + size * 0.3
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round">
      <path d={`M ${lx} ${cy - r} L ${rx} ${cy - r}`} />
      <path d={`M ${lx} ${cy + r} L ${rx} ${cy + r}`} />
      <path d={`M ${rx} ${cy - r} A ${r} ${r} 0 0 1 ${rx} ${cy + r}`} />
      <path d={`M ${lx} ${cy - r} A ${r} ${r} 0 0 0 ${lx} ${cy + r}`} />
    </svg>
  )
}

export type Tool =
  | "select"
  | "pen"
  | "rect"
  | "circle"
  | "arrow"
  | "diamond"
  | "cylinder"
  | "cloud"
  | "queue"
  | "text"
  | "sticky"
  | "pin"

const TOOLS: { id: Tool; Icon: React.ElementType; label: string; key: string }[] = [
  { id: "select",   Icon: MousePointer2, label: "Select",    key: "1" },
  { id: "pen",      Icon: PenLine,       label: "Draw",      key: "2" },
  { id: "rect",     Icon: Square,        label: "Rectangle", key: "3" },
  { id: "circle",   Icon: Circle,        label: "Circle",    key: "4" },
  { id: "arrow",    Icon: ArrowRight,    label: "Arrow",     key: "5" },
  { id: "diamond",  Icon: Diamond,       label: "Diamond",   key: "6" },
  { id: "cylinder", Icon: Database,      label: "Cylinder",  key: "7" },
  { id: "cloud",    Icon: Cloud,         label: "Cloud",     key: "8" },
  { id: "queue",    Icon: QueueIcon,     label: "Queue",     key: "9" },
  { id: "text",     Icon: Type,          label: "Text",      key: "0" },
  { id: "sticky",   Icon: StickyNote,    label: "Sticky Note", key: "-" },
  { id: "pin",      Icon: Pin,           label: "Pin",       key: "" },
]

interface FloatingToolbarProps {
  activeTool: Tool
  onToolChange: (tool: Tool) => void
}

export function FloatingToolbar({ activeTool, onToolChange }: FloatingToolbarProps) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 28,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 2,
        backgroundColor: "#FFFFFF",
        borderRadius: 40,
        padding: "6px 10px",
        boxShadow:
          "0 8px 32px rgba(30,41,59,0.14), 0 2px 8px rgba(30,41,59,0.08), 0 0 0 1px rgba(30,41,59,0.06)",
        zIndex: 100,
      }}
    >
      {TOOLS.map(({ id, Icon, label, key }, index) => {
        const isActive = activeTool === id
        const isSeparator = index === 1 || index === 9
        return (
          <React.Fragment key={id}>
            {isSeparator && (
              <div
                style={{
                  width: 1,
                  height: 22,
                  backgroundColor: "rgba(30,41,59,0.1)",
                  margin: "0 4px",
                }}
              />
            )}
            <button
              onClick={() => onToolChange(id)}
              title={`${label} [${key}]`}
              style={{
                width: 38,
                height: 38,
                borderRadius: 30,
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                backgroundColor: isActive ? "#1E293B" : "transparent",
                color: isActive ? "#FFFFFF" : "#64748B",
                transition: "all 0.15s ease",
                position: "relative",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F1F5F9"
                  ;(e.currentTarget as HTMLButtonElement).style.color = "#1E293B"
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"
                  ;(e.currentTarget as HTMLButtonElement).style.color = "#64748B"
                }
              }}
            >
              <Icon size={17} strokeWidth={isActive ? 2 : 1.75} />
              <span style={{
                position: "absolute",
                bottom: 2,
                right: 3,
                fontSize: 8,
                fontFamily: "'Inter', sans-serif",
                fontWeight: 600,
                lineHeight: 1,
                color: isActive ? "rgba(255,255,255,0.5)" : "rgba(100,116,139,0.5)",
                pointerEvents: "none",
              }}>
                {key}
              </span>
            </button>
          </React.Fragment>
        )
      })}
    </div>
  )
}
