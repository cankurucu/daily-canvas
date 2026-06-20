import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ydoc, yNotes, yShapes, undoManager } from './yjsProvider'

export interface NoteData {
  id: string
  x: number
  y: number
  color: string
  text: string
  author: string
  rotate: number
  pinned: boolean
  tag?: string
  date: string
}

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export interface ShapeData {
  id: string
  type: 'rect' | 'circle' | 'arrow' | 'path' | 'text' | 'diamond' | 'cylinder' | 'cloud' | 'queue'
  seed: number
  stroke: string
  fill: string
  strokeWidth: number
  strokeStyle?: StrokeStyle
  date: string
  pinned?: boolean
  dx?: number
  dy?: number
  text?: string
  sourceId?: string
  targetId?: string
  rect?: { x: number; y: number; w: number; h: number }
  circle?: { cx: number; cy: number; r: number }
  arrow?: { x1: number; y1: number; x2: number; y2: number }
  path?: { d: string }
}

interface CanvasState {
  notes: NoteData[]
  shapes: ShapeData[]
  nickname: string
  addNote: (note: NoteData) => void
  updateNote: (id: string, updates: Partial<NoteData>) => void
  removeNote: (id: string) => void
  togglePin: (id: string) => void
  addShape: (shape: ShapeData) => void
  updateShape: (id: string, updates: Partial<ShapeData>) => void
  removeShape: (id: string) => void
  removeShapes: (ids: string[]) => void
  toggleShapePin: (id: string) => void
  selectedShapeIds: string[]
  setSelectedShapeIds: (ids: string[]) => void
  saveSnapshot: () => void
  undo: () => void
  redo: () => void
  setNickname: (nickname: string) => void
}

export const useCanvasStore = create<CanvasState>()(
  persist(
    (set) => ({
      // Initial state from Yjs — will be updated via observers once IDB syncs
      notes: Array.from(yNotes.values()),
      shapes: Array.from(yShapes.values()),
      nickname: '',

      // ── Notes ──────────────────────────────────────────────────────────────
      addNote: (note) => {
        yNotes.set(note.id, note)
      },
      updateNote: (id, updates) => {
        const existing = yNotes.get(id)
        if (existing) yNotes.set(id, { ...existing, ...updates })
      },
      removeNote: (id) => {
        yNotes.delete(id)
      },
      togglePin: (id) => {
        const n = yNotes.get(id)
        if (n) yNotes.set(id, { ...n, pinned: !n.pinned })
      },

      // ── Shapes ─────────────────────────────────────────────────────────────
      addShape: (shape) => {
        yShapes.set(shape.id, shape)
      },
      updateShape: (id, updates) => {
        const existing = yShapes.get(id)
        if (existing) yShapes.set(id, { ...existing, ...updates })
      },
      removeShape: (id) => {
        yShapes.delete(id)
      },
      removeShapes: (ids) => {
        ydoc.transact(() => {
          ids.forEach((id) => yShapes.delete(id))
        })
      },
      toggleShapePin: (id) => {
        const s = yShapes.get(id)
        if (s) yShapes.set(id, { ...s, pinned: !s.pinned })
      },

      // ── Selection (local-only, not synced) ─────────────────────────────────
      selectedShapeIds: [],
      setSelectedShapeIds: (ids) => set({ selectedShapeIds: ids }),

      // ── Undo / Redo (delegated to Yjs UndoManager) ─────────────────────────
      // stopCapturing() marks a boundary so the next change starts a fresh step
      saveSnapshot: () => undoManager.stopCapturing(),
      undo: () => undoManager.undo(),
      redo: () => undoManager.redo(),

      setNickname: (nickname) => set({ nickname }),
    }),
    {
      name: 'daily-canvas-v1',
      // Only persist nickname — notes and shapes live in Yjs / IndexedDB
      partialize: (state) => ({ nickname: state.nickname }),
    }
  )
)

// ─── Yjs → Zustand observers ─────────────────────────────────────────────────
// Keep Zustand state in sync whenever Yjs state changes (local or remote)

yNotes.observe(() => {
  useCanvasStore.setState({ notes: Array.from(yNotes.values()) })
})

yShapes.observe(() => {
  useCanvasStore.setState({ shapes: Array.from(yShapes.values()) })
})
