import React, { useState, useRef, useEffect, useCallback } from "react"
import { Pin, Tag, Trash2, X } from "lucide-react"
import { motion } from "motion/react"
import { useCanvasStore } from "../store/useCanvasStore"
import type { Tool } from "./FloatingToolbar"

export const TAG_COLORS: Record<string, string> = {
  Blocker: "#EF4444",
  "In Progress": "#F59E0B",
  Done: "#10B981",
  Todo: "#37003A",
  Idea: "#8B5CF6",
}

const PRESET_TAGS = Object.keys(TAG_COLORS)

/* ─── TagPicker ─── */

interface TagPickerProps {
  currentTag?: string
  onSelect: (tag: string | undefined) => void
  onClose: () => void
}

function TagPicker({ currentTag, onSelect, onClose }: TagPickerProps) {
  const [customInput, setCustomInput] = useState("")
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("click", handleClick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCustomSubmit() {
    const trimmed = customInput.trim()
    if (trimmed) {
      onSelect(trimmed)
      setCustomInput("")
    }
  }

  return (
    <div
      ref={pickerRef}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        left: 0,
        width: 196,
        backgroundColor: "#FFFFFF",
        borderRadius: 10,
        boxShadow: "0 8px 30px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
        border: "1px solid rgba(30,41,59,0.1)",
        padding: "10px",
        zIndex: 300,
      }}
    >
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#94A3B8",
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          margin: "0 0 8px",
          fontFamily: "'Inter', sans-serif",
        }}
      >
        Tag
      </p>

      {/* Preset chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {PRESET_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => onSelect(currentTag === t ? undefined : t)}
            style={{
              padding: "3px 8px",
              borderRadius: 99,
              border: currentTag === t ? "none" : "1px solid rgba(0,0,0,0.08)",
              cursor: "pointer",
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'Inter', sans-serif",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              backgroundColor: currentTag === t ? (TAG_COLORS[t] ?? "#64748B") : "#F8FAFC",
              color: currentTag === t ? "#FFFFFF" : "#475569",
              transition: "all 0.12s",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Custom input */}
      <div style={{ display: "flex", gap: 4 }}>
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCustomSubmit()
            if (e.key === "Escape") onClose()
            e.stopPropagation()
          }}
          placeholder="Custom tag…"
          style={{
            flex: 1,
            padding: "5px 8px",
            borderRadius: 6,
            border: "1px solid rgba(30,41,59,0.12)",
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            color: "#1E293B",
            outline: "none",
            backgroundColor: "#F8FAFC",
          }}
        />
        <button
          onClick={handleCustomSubmit}
          style={{
            padding: "5px 10px",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#37003A",
            color: "#FFFFFF",
            fontSize: 13,
            fontFamily: "'Inter', sans-serif",
            cursor: "pointer",
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Remove */}
      {currentTag && (
        <button
          onClick={() => onSelect(undefined)}
          style={{
            marginTop: 8,
            width: "100%",
            padding: "5px",
            borderRadius: 6,
            border: "1px solid rgba(239,68,68,0.2)",
            backgroundColor: "rgba(239,68,68,0.06)",
            color: "#EF4444",
            fontSize: 10.5,
            fontFamily: "'Inter', sans-serif",
            cursor: "pointer",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          <X size={10} />
          Remove tag
        </button>
      )}
    </div>
  )
}

/* ─── StickyNote ─── */

interface StickyNoteProps {
  id: string
  x: number
  y: number
  color: string
  text: string
  author?: string
  rotate?: number
  pinned?: boolean
  tag?: string
  activeTool: Tool
  isSelected?: boolean
  onDragStart: (id: string, noteX: number, noteY: number, e: React.MouseEvent) => void
}

export function StickyNote({
  id, x, y, color, text, author, rotate = 0, pinned = false, tag, activeTool, isSelected = false, onDragStart,
}: StickyNoteProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(text)
  const [isHovered, setIsHovered] = useState(false)
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { togglePin, updateNote, removeNote } = useCanvasStore()

  useEffect(() => { setEditText(text) }, [text])

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }
  }, [isEditing])

  useEffect(() => {
    setIsTagPickerOpen(false)
  }, [activeTool])

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation()
    setIsEditing(true)
  }

  function handleBlur() {
    setIsEditing(false)
    if (editText.trim() !== text) {
      updateNote(id, { text: editText.trim() })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setEditText(text)
      setIsEditing(false)
    }
  }

  function handleClick(e: React.MouseEvent) {
    if (activeTool === "pin") {
      e.stopPropagation()
      togglePin(id)
    }
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (activeTool !== "select" || isEditing) return
    e.stopPropagation()
    e.preventDefault()
    onDragStart(id, x, y, e)
  }

  const handleTagSelect = useCallback((newTag: string | undefined) => {
    updateNote(id, { tag: newTag })
    setIsTagPickerOpen(false)
  }, [id, updateNote])

  const handleTagPickerClose = useCallback(() => {
    setIsTagPickerOpen(false)
  }, [])

  function openTagPicker(e: React.MouseEvent) {
    e.stopPropagation()
    if (!isTagPickerOpen) setIsTagPickerOpen(true)
  }

  const getCursor = () => {
    if (activeTool === "pin") return "pointer"
    if (activeTool === "select") return "grab"
    return "default"
  }

  const showAddTagButton = (isHovered || isTagPickerOpen) && activeTool === "select" && !tag

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onClick={handleClick}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 168,
        transform: `rotate(${rotate}deg)`,
        backgroundColor: color,
        boxShadow: isSelected
          ? "0 0 0 2px #37003A, 0 4px 16px rgba(55,0,58,0.2)"
          : pinned
            ? "0 4px 20px rgba(55,0,58,0.3), 0 2px 8px rgba(0,0,0,0.12)"
            : "0 4px 14px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)",
        borderRadius: 4,
        padding: "14px 14px 18px",
        cursor: getCursor(),
        userSelect: "none",
        zIndex: pinned ? 20 : 10,
      }}
    >
      {/* Pin button */}
      <button
        onClick={(e) => { e.stopPropagation(); togglePin(id) }}
        style={{
          position: "absolute",
          top: -10,
          right: -10,
          width: 26,
          height: 26,
          borderRadius: "50%",
          border: pinned ? "2px solid #37003A" : "2px solid rgba(0,0,0,0.15)",
          backgroundColor: pinned ? "#37003A" : "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: pinned ? "0 0 0 3px rgba(55,0,58,0.25)" : "0 1px 4px rgba(0,0,0,0.15)",
          transition: "all 0.2s",
        }}
      >
        <Pin size={12} color={pinned ? "#FFFFFF" : "#94A3B8"} fill={pinned ? "#FFFFFF" : "none"} />
      </button>

      {/* Delete button — visible on hover in select mode */}
      {isHovered && activeTool === "select" && (
        <button
          onClick={(e) => { e.stopPropagation(); removeNote(id) }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Delete note"
          style={{
            position: "absolute",
            top: -10,
            left: -10,
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "2px solid rgba(239,68,68,0.3)",
            backgroundColor: "#FFFFFF",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget
            el.style.backgroundColor = "#EF4444"
            el.style.borderColor = "#EF4444"
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget
            el.style.backgroundColor = "#FFFFFF"
            el.style.borderColor = "rgba(239,68,68,0.3)"
          }}
        >
          <Trash2 size={11} color="#EF4444" />
        </button>
      )}

      {/* Tag area */}
      {(tag || showAddTagButton) && (
        <div style={{ position: "relative", marginBottom: 8 }}>
          {tag ? (
            <button
              onClick={openTagPicker}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                backgroundColor: TAG_COLORS[tag] ?? "#64748B",
                color: "#FFFFFF",
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'Inter', sans-serif",
                letterSpacing: "0.05em",
                padding: "2px 7px 2px 6px",
                borderRadius: 99,
                textTransform: "uppercase",
                border: "none",
                cursor: "pointer",
                transition: "opacity 0.12s",
              }}
            >
              <Tag size={8} color="rgba(255,255,255,0.8)" />
              {tag}
            </button>
          ) : (
            <button
              onClick={openTagPicker}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "rgba(30,41,59,0.45)",
                fontSize: 10,
                fontFamily: "'Inter', sans-serif",
                backgroundColor: "rgba(0,0,0,0.06)",
                border: "1.5px dashed rgba(0,0,0,0.13)",
                borderRadius: 99,
                padding: "2px 8px",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              <Tag size={8} />
              Add tag
            </button>
          )}

          {isTagPickerOpen && (
            <TagPicker
              currentTag={tag}
              onSelect={handleTagSelect}
              onClose={handleTagPickerClose}
            />
          )}
        </div>
      )}

      {/* Text or editor */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: "#111827",
            lineHeight: 1.5,
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "none",
            width: "100%",
            minHeight: 60,
            padding: 0,
            cursor: "text",
            userSelect: "text",
          }}
        />
      ) : (
        <p
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 18,
            fontWeight: 500,
            color: "#111827",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          {text || <span style={{ opacity: 0.4 }}>Double-click to edit...</span>}
        </p>
      )}

      {/* Author */}
      {!isEditing && (
        <p
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 14,
            color: author && author !== "Anonymous"
              ? "rgba(17,24,39,0.45)"
              : "rgba(17,24,39,0.28)",
            fontStyle: author && author !== "Anonymous" ? "normal" : "italic",
            marginTop: 8,
            marginBottom: 0,
          }}
        >
          — {author && author !== "Anonymous" ? author : "Anonymous"}
        </p>
      )}
    </motion.div>
  )
}

/* ─── Pinned sidebar card ─── */

interface PinnedCardProps {
  color: string
  text: string
  date: string
  tag?: string
  onClick?: () => void
}

export function PinnedCard({ color, text, date, tag, onClick }: PinnedCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: color,
        borderRadius: 4,
        padding: "8px 10px",
        marginBottom: 8,
        position: "relative",
        boxShadow: "0 2px 8px rgba(55,0,58,0.15), 0 1px 3px rgba(0,0,0,0.08)",
        cursor: onClick ? "pointer" : "default",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.opacity = "0.85" }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.opacity = "1" }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
        <p
          style={{
            fontFamily: "'DM Sans', system-ui, sans-serif",
            fontSize: 15,
            color: "#111827",
            margin: 0,
            lineHeight: 1.45,
            flex: 1,
          }}
        >
          {text.length > 52 ? text.slice(0, 52) + "…" : text}
        </p>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            backgroundColor: "#37003A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          <Pin size={7} color="#FFFFFF" fill="#FFFFFF" />
        </div>
      </div>
      {tag && (
        <span
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            color: TAG_COLORS[tag] ?? "#37003A",
            fontFamily: "'Inter', sans-serif",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginTop: 5,
            display: "block",
          }}
        >
          {tag}
        </span>
      )}
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          color: "rgba(17,24,39,0.4)",
          margin: "5px 0 0",
          letterSpacing: "0.01em",
        }}
      >
        {date}
      </p>
    </div>
  )
}

const SHAPE_TYPE_LABEL: Record<string, string> = {
  rect: 'Rectangle',
  circle: 'Circle',
  arrow: 'Arrow',
  path: 'Drawing',
  text: 'Text',
  diamond: 'Diamond',
  cylinder: 'Cylinder',
  cloud: 'Cloud',
  queue: 'Queue',
}

interface PinnedShapeCardProps {
  type: string
  stroke: string
  text?: string
  date: string
  onClick?: () => void
}

export function PinnedShapeCard({ type, stroke, text, date, onClick }: PinnedShapeCardProps) {
  const typeLabel = SHAPE_TYPE_LABEL[type] ?? type
  const displayText = text ? (text.length > 48 ? text.slice(0, 48) + '…' : text) : typeLabel
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: '#F8FAFC',
        border: '1.5px solid rgba(55,0,58,0.15)',
        borderRadius: 4,
        padding: '8px 10px',
        marginBottom: 8,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'opacity 0.15s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.opacity = '0.8' }}
      onMouseLeave={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.opacity = '1' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: stroke, flexShrink: 0 }} />
          <p
            style={{
              fontFamily: "'DM Sans', system-ui, sans-serif",
              fontSize: 14,
              color: '#111827',
              margin: 0,
              lineHeight: 1.4,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayText}
          </p>
        </div>
        <div
          style={{
            width: 14, height: 14, borderRadius: '50%',
            backgroundColor: '#37003A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 1,
          }}
        >
          <Pin size={7} color="#FFFFFF" fill="#FFFFFF" />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
        <span
          style={{
            fontSize: 9.5, fontWeight: 700,
            color: '#37003A',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {typeLabel}
        </span>
        <span style={{ fontSize: 9.5, color: 'rgba(17,24,39,0.35)', fontFamily: "'Inter', sans-serif" }}>
          {date}
        </span>
      </div>
    </div>
  )
}
