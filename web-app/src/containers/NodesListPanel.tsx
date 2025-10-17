import { useEffect, useState } from 'react'

type NodeRegistryItem = { id: string; title: string; category?: string; defaultMeta?: Record<string, any>; type?: string; display?: { Icon?: any; title?: string; description?: string } }

export default function NodesListPanel({
  open,
  search,
  onSearch,
  onClose,
  nodeRegistry,
  onInsert,
}: {
  open: boolean
  search: string
  onSearch: (s: string) => void
  onClose: () => void
  nodeRegistry: NodeRegistryItem[]
  onInsert: (n: NodeRegistryItem) => void
}) {
  if (!open) return null

  const q = (search || '').trim().toLowerCase()
  const groups: Record<string, NodeRegistryItem[]> = {}
  for (const n of nodeRegistry) {
    if (q && !n.title.toLowerCase().includes(q) && !(n.category || '').toLowerCase().includes(q)) continue
    const cat = n.category || 'Other'
    groups[cat] = groups[cat] || []
    groups[cat].push(n)
  }
  const groupEntries = Object.entries(groups)

  // expanded state per category (default: closed)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // ensure new groups exist in state, default closed (false)
  useEffect(() => {
    const keys = Object.keys(groups)
    setExpanded((prev) => {
      const next: Record<string, boolean> = { ...prev }
      for (const k of keys) {
        if (!(k in next)) next[k] = false
      }
      // optionally remove stale keys
      for (const k of Object.keys(next)) {
        if (!keys.includes(k)) delete next[k]
      }
      return next
    })
  }, [nodeRegistry, search])

  const toggle = (cat: string) => setExpanded((s) => ({ ...s, [cat]: !s[cat] }))

  return (
    <div className="absolute top-16 left-0 z-60 w-80 bg-main-view-fg/6 text-main-view-fg rounded-tr-md h-full border border-main-view-fg/10 p-3 shadow-lg flex flex-col">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search nodes..."
          style={{ flex: 1, padding: '6px 8px', borderRadius: 6 }}
        />
        <button onClick={onClose} style={{ padding: '6px 8px' }}>Close</button>
      </div>
      {/* group nodes by category - scrollable list */}
      {groupEntries.length === 0 ? (
        <div className="text-sm text-muted-foreground">No nodes</div>
      ) : (
        <div className="overflow-auto flex-1" style={{ paddingRight: 4 }}>
          {groupEntries.map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 8 }}>
              <button
                onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between p-1 rounded"
                style={{ marginBottom: 6 }}
              >
                <div style={{ fontSize: 12, fontWeight: 700 }}>{cat}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground, #9aa0a6)' }}>{items.length}</div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ transform: expanded[cat] ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>

              {expanded[cat] ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((it) => (
                    <button key={it.id} onClick={() => onInsert(it)} className="text-left p-2 rounded flex gap-2 items-center hover:bg-main-view-fg/10">
                      {it.display && it.display.Icon ? (
                        <it.display.Icon className="text-main-view-fg/80" size={18} />
                      ) : (
                        <div style={{ width: 18, height: 18, background: '#ddd', borderRadius: 4 }} />
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{(it.display && it.display.title) || it.title}</div>
                        {it.display && it.display.description ? <div style={{ fontSize: 11, color: 'var(--muted-foreground, #9aa0a6)' }}>{it.display.description}</div> : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
