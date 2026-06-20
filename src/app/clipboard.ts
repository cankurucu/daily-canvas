import type { NoteData, ShapeData } from './store/useCanvasStore'

// Module-level clipboard — not persisted, lives for the browser session.
// Only one type is populated at a time: copying shapes clears notes and vice versa.
export const clipboard: { shapes: ShapeData[]; notes: NoteData[] } = {
  shapes: [],
  notes: [],
}
