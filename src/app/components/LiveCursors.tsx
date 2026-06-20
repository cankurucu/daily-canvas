import { useEffect, useState } from 'react'
import { awareness } from '../store/yjsProvider'
import type { UserPresence } from '../store/yjsProvider'

interface RemoteCursor {
  clientId: number
  cursor: { x: number; y: number }
  user: { name: string; color: string }
}

export function LiveCursors() {
  const [cursors, setCursors] = useState<RemoteCursor[]>([])

  useEffect(() => {
    function update() {
      const remote: RemoteCursor[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        const presence = state as Partial<UserPresence>
        if (!presence.cursor || !presence.user) return
        remote.push({ clientId, cursor: presence.cursor, user: presence.user })
      })
      setCursors(remote)
    }

    awareness.on('change', update)
    return () => awareness.off('change', update)
  }, [])

  if (cursors.length === 0) return null

  return (
    <>
      {cursors.map(({ clientId, cursor, user }) => (
        <div
          key={clientId}
          style={{
            position: 'absolute',
            left: cursor.x,
            top: cursor.y,
            pointerEvents: 'none',
            transform: 'translate(-2px, -2px)',
            zIndex: 9999,
          }}
        >
          {/* Cursor arrow */}
          <svg width={20} height={20} viewBox="0 0 20 20" style={{ display: 'block', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))' }}>
            <path
              d="M3 2 L17 9 L10 11 L8 18 Z"
              fill={user.color}
              stroke="#fff"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </svg>
          {/* Name label */}
          <div style={{
            marginTop: 2,
            marginLeft: 14,
            backgroundColor: user.color,
            color: '#fff',
            fontSize: 11,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            padding: '2px 7px',
            borderRadius: 99,
            whiteSpace: 'nowrap',
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
            {user.name || 'Anonymous'}
          </div>
        </div>
      ))}
    </>
  )
}
