import NodeBase from '@/containers/NodeBase'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IconPlayerPlay } from '@tabler/icons-react'
import { NodeType } from '@/lib/node'

export default function Node({ id, selected, activePortId, activePortKind }: { id: string; selected?: boolean; activePortId?: string | null; activePortKind?: 'input' | 'output' | null }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="If"
      inputs={[{ id: 'cond', label: 'Condition' }]}
      outputs={[{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

type Comparator = string

const COMPARATORS: Record<string, Comparator[]> = {
  boolean: ['isTrue', 'isFalse'],
  number: ['==', '!=', '>', '<', '>=', '<='],
  string: ['==', '!=', 'contains', 'startsWith', 'endsWith', 'matches'],
  date: ['before', 'after', 'on'],
  any: ['exists', 'notExists'],
}

function makeId(prefix = 'c') { return `${prefix}${Date.now().toString(36)}_${Math.floor(Math.random()*10000)}` }

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [expr, setExpr] = useState<string>((meta && meta.expr) || '')

  useEffect(() => {
    if ((meta && meta.expr) !== expr) setExpr((meta && meta.expr) || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta && meta.expr])

  const write = (next: string) => {
    setExpr(next)
    try { setMeta({ ...(meta || {}), expr: next }) } catch {}
  }

  // gather suggestion paths from provided meta/input/sample up to depth 3
  const gatherPaths = (obj: any, prefix = '', depth = 0, maxDepth = 3): string[] => {
    if (!obj || typeof obj !== 'object' || depth > maxDepth) return []
    const paths: string[] = []
    for (const k of Object.keys(obj)) {
      const val = obj[k]
      const p = prefix ? `${prefix}.${k}` : k
      paths.push(p)
      if (val && typeof val === 'object') {
        paths.push(...gatherPaths(val, p, depth + 1, maxDepth))
      }
    }
    return paths
  }

  const sample = (meta && (meta.input || meta.sample)) || {}
  const metaObj = meta || {}
  const suggestions = Array.from(new Set([...(gatherPaths(sample, 'input', 0, 2).map(p => `$${p}`)), ...(gatherPaths(metaObj, 'meta', 0, 2).map(p => `$${p}`))]))



  // helper to render with $var substitution; returns array of { t: string, known: boolean, kind: string, raw?: any }
  const renderPreviewParts = () => {
    const inputSample = sample
    const metaSample = metaObj
    const text = expr || ''
    const parts: Array<{ t: string; known: boolean; kind?: string; raw?: any }> = []

    const formatValue = (val: any) => {
      if (val === null) return { text: 'null', kind: 'null' }
      if (val === undefined) return { text: 'undefined', kind: 'undefined' }
      if (typeof val === 'string') return { text: JSON.stringify(val), kind: 'string' }
      if (typeof val === 'number') return { text: String(val), kind: 'number' }
      if (typeof val === 'boolean') return { text: String(val), kind: 'boolean' }
      // objects and arrays -> pretty printed JSON
      try {
        const json = JSON.stringify(val, null, 2)
        return { text: json, kind: 'object' }
      } catch (e) {
        return { text: String(val), kind: 'unknown' }
      }
    }

    // split on $var occurrences
    const re = /\$[a-zA-Z0-9_\.]+/g
    let lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const idx = m.index
      if (idx > lastIndex) parts.push({ t: text.substring(lastIndex, idx), known: true, kind: 'text' })
      const varName = m[0].substring(1)
      const segs = varName.split('.')
      let val: any = undefined
      if (segs[0] === 'input') {
        val = segs.slice(1).reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), inputSample)
      } else if (segs[0] === 'meta') {
        val = segs.slice(1).reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), metaSample)
      } else {
        // fallback: try input then meta
        val = segs.reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), inputSample)
        if (val === undefined) val = segs.reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), metaSample)
      }
      const known = val !== undefined && val !== null
      if (known) {
        const formatted = formatValue(val)
        parts.push({ t: formatted.text, known: true, kind: formatted.kind, raw: val })
      } else {
        // unknown variable: show the literal token
        parts.push({ t: m[0], known: false, kind: 'unknown' })
      }
      lastIndex = idx + m[0].length
    }
    if (lastIndex < text.length) parts.push({ t: text.substring(lastIndex), known: true, kind: 'text' })
    return parts
  }

  const parts = renderPreviewParts()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const [filtered, setFiltered] = useState<string[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [showList, setShowList] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  const computeToken = (value: string, pos: number) => {
    const left = value.slice(0, pos)
    const m = left.match(/\$[A-Za-z0-9_\.]*$/)
    if (!m) return null
    const token = m[0]
    const start = pos - token.length
    return { token, start }
  }

  const updateSuggestionsForCaret = (pos: number | null) => {
    if (pos == null) { setShowList(false); return }
    // prefer live DOM value because onKeyDown may run before onChange updates state
    const liveValue = (inputRef.current && typeof inputRef.current.value === 'string') ? inputRef.current.value : expr
    const tokenInfo = computeToken(liveValue, pos)
    if (!tokenInfo) { setShowList(false); return }
    const prefix = tokenInfo.token
    // when token is just '$' show all suggestions (help discoverability)
    const list = (prefix === '$') ? suggestions.slice(0, 30) : suggestions.filter(s => s.startsWith(prefix))
    setFiltered(list.slice(0, 30))
    setActiveIdx(0)
    setShowList(list.length > 0)
    // compute dropdown position from input rect
    try {
      const el = inputRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setDropdownPos({ left: r.left, top: r.top, width: r.width, height: r.height })
      }
    } catch {}
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    write(v)
    const pos = e.target.selectionStart || 0
    setCaret(pos)
    updateSuggestionsForCaret(pos)
  }

  const insertSuggestionAtToken = (sugg: string) => {
    const pos = caret ?? expr.length
    const tokenInfo = computeToken(expr, pos)
    if (!tokenInfo) return
    const before = expr.slice(0, tokenInfo.start)
    const after = expr.slice(pos)
    const next = before + sugg + after
    write(next)
    // place caret after inserted suggestion
    const newPos = (before + sugg).length
    setTimeout(() => {
      try { if (inputRef.current) { inputRef.current.focus(); inputRef.current.setSelectionRange(newPos, newPos) } } catch {}
    }, 0)
    setShowList(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) insertSuggestionAtToken(filtered[activeIdx]); return }
    if (e.key === 'Escape') { setShowList(false); return }
  }

  // fallback: if user types '$' key (keydown happens before input value change) schedule update
  const onKeyDownWrapper = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '$') {
      setTimeout(() => {
        try { const pos = inputRef.current?.selectionStart || 0; setCaret(pos); updateSuggestionsForCaret(pos) } catch {}
      }, 0)
    }
    onKeyDown(e)
  }

  useEffect(() => {
    const onWindow = () => {
      if (!showList) return
      try {
        const el = inputRef.current
        if (!el) return
        const r = el.getBoundingClientRect()
        setDropdownPos({ left: r.left, top: r.top, width: r.width, height: r.height })
      } catch {}
    }
    window.addEventListener('resize', onWindow)
    window.addEventListener('scroll', onWindow, true)
    return () => { window.removeEventListener('resize', onWindow); window.removeEventListener('scroll', onWindow, true) }
  }, [showList])

  return (
    <div className="flex flex-col gap-3" style={{ position: 'relative' }}>
      <label className="text-sm font-medium">Expression</label>
      <input
        ref={inputRef}
        value={expr}
        onChange={handleChange}
        onKeyDown={onKeyDownWrapper}
        onClick={(e) => { const pos = (e.target as HTMLInputElement).selectionStart || 0; setCaret(pos); updateSuggestionsForCaret(pos) }}
        onBlur={() => { setTimeout(() => setShowList(false), 120) }}
        placeholder="e.g. Hello $user.name, got $input.count items"
        className="p-2 rounded border w-full"
      />

      {showList && filtered.length > 0 && dropdownPos && createPortal(
        <div style={{ position: 'absolute', left: dropdownPos.left, top: dropdownPos.top + dropdownPos.height + 6, width: dropdownPos.width, zIndex: 99999 }}>
          <div className="bg-main-view-fg/6 border rounded shadow-sm" style={{ maxHeight: 320, overflow: 'auto' }}>
            {filtered.map((s, i) => (
              <div
                key={s}
                onMouseDown={(ev) => { ev.preventDefault(); insertSuggestionAtToken(s) }}
                className={`px-2 py-1 text-sm cursor-pointer ${i === activeIdx ? 'bg-main-view-fg/10' : ''}`}
              >{s}</div>
            ))}
          </div>
        </div>,
        document.body
      )}

      <div>
        <div className="text-sm font-medium">Preview</div>
        <div className="mt-2 p-2 rounded border bg-main-view-fg/6">
          {parts.map((p, i) => {
            // objects/arrays -> render as inline pre/code with preserved whitespace
            if (p.kind === 'object') {
              return (
                <code
                  key={i}
                  style={{
                    display: 'inline-block',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                    fontSize: '0.9em',
                    background: p.known ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                    color: 'inherit',
                    padding: '2px 6px',
                    borderRadius: 6,
                    margin: '0 2px'
                  }}
                >{p.t}</code>
              )
            }
            // strings already JSON.stringify-ed (includes quotes)
            const color = p.known ? '#10b981' : '#ef4444'
            return (
              <span key={i} style={{ color }}>{p.t}</span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// simple executor for the If node: evaluates the expression against the input (meta.input or provided input)
// and returns the chosen port id ('true' or 'false') along with the output payload.
export async function execute(input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  // expression stored in meta.expr; simple support for $var substitution using input object
  const expr = (meta && meta.expr) || ''
  let truthy = false
  try {
    if (!expr) {
      // if no expression, determine truthiness of input directly
      truthy = !!input
    } else {
      // replace $var occurrences with values from input/meta.input or meta
      const sample = (meta && (meta.input || meta.sample)) || input || {}
      const metaSample = meta || {}
      const evalStr = expr.replace(/\$[a-zA-Z0-9_\.]+/g, (m: string) => {
        const varName = m.substring(1)
        const segs = varName.split('.')
        let val: any = undefined
        if (segs[0] === 'input') {
          val = segs.slice(1).reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), sample)
        } else if (segs[0] === 'meta') {
          val = segs.slice(1).reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), metaSample)
        } else {
          val = segs.reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), sample)
          if (val === undefined) val = segs.reduce((acc: any, seg: string) => (acc && acc[seg] !== undefined ? acc[seg] : undefined), metaSample)
        }
        // for safety, JSON.stringify simple primitives, otherwise empty
        if (val === undefined) return 'undefined'
        if (typeof val === 'string') return JSON.stringify(val)
        try { return String(val) } catch { return 'undefined' }
      })
      // attempt a very small, controlled evaluation for common comparisons
      // support: ==, !=, >, <, >=, <= and simple boolean 'isTrue' / 'isFalse'
      if (evalStr.includes('isTrue') || evalStr.includes('isFalse')) {
        truthy = evalStr.includes('isTrue')
      } else {
        // fallback: try to eval in a very constrained way
        // eslint-disable-next-line no-eval
        try { // eslint-disable-next-line no-eval
          // wrap in Boolean() to coerce
          // note: this is minimal and assumes expressions are safe (coming from user meta)
          // keep this simple for preview purposes
          // eslint-disable-next-line no-eval
          truthy = Boolean(eval(evalStr))
        } catch {
          truthy = false
        }
      }
    }
  } catch (e) {
    truthy = false
  }

  const portId = truthy ? 'true' : 'false'
  return { portId, output: { matched: truthy, input } }
}

// node metadata exported so the registry can be assembled from each node file
export function getNodeEntry() {
  return {
    id: 'if',
    title: 'If',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'Control/Conditional',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { Icon: IconPlayerPlay, title: 'If', description: 'Branch when a condition is true/false' },
  }
}
