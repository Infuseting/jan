import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { GLOBAL_SUGGESTIONS, resolveGlobal } from '@/lib/globals'
import { evaluateExpressionToBoolean } from '@/lib/expression'
import TextareaAutosize from 'react-textarea-autosize'
type Suggestion = string

type SmartInputProps = {
  value?: string
  onChange: (v: string) => void
  suggestionsSource?: Suggestion[] // flat list of suggestions
  globalSuggestions?: Suggestion[]
  maxSuggestions?: number
  placeholder?: string
  className?: string
  multiline?: boolean
  rows?: number
  // optional: evaluate expression to boolean using globals/sample/meta
  onEvaluate?: (result: boolean) => void
  // optional context used when evaluating expressions
  sample?: any
  meta?: any
}
export default forwardRef(function SmartInput(props: SmartInputProps, ref: any) {
  const { value = '', onChange, suggestionsSource = [], maxSuggestions = 30, placeholder, className, onEvaluate, sample, meta } = props
  const globals = GLOBAL_SUGGESTIONS
  // merge suggestions: user provided first, then globals (unique)
  const mergedSuggestions = Array.from(new Set([...(suggestionsSource || []), ...globals]))
  
  const { multiline = false, rows = 4 } = props
  const [text, setText] = useState<string>(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const [filtered, setFiltered] = useState<Suggestion[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const [showList, setShowList] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  useEffect(() => { setText(value) }, [value])

  const computeToken = (v: string, pos: number) => {
    const left = v.slice(0, pos)
    const m = left.match(/\$[A-Za-z0-9_\.]*$/)
    if (!m) return null
    const token = m[0]
    const start = pos - token.length
    return { token, start }
  }

  const updateSuggestionsForCaret = (pos: number | null) => {
    if (pos == null) { setShowList(false); return }
    const liveValue = (inputRef.current && typeof inputRef.current.value === 'string') ? inputRef.current.value : text
    const tokenInfo = computeToken(liveValue, pos)
    if (!tokenInfo) { setShowList(false); return }
    const prefix = tokenInfo.token

    // If the token contains a dot (e.g. $now.get), try to resolve the base ($now)
    // and enumerate its properties/methods for type-aware suggestions.
    let list: Suggestion[] = []
    if (prefix.includes('.') && prefix.startsWith('$')) {
      const withoutDollar = prefix.substring(1)
      const parts = withoutDollar.split('.')
      const base = parts[0]
      const tailPrefix = parts.slice(1).join('.') // partial after the dot
      try {
        const val = resolveGlobal(base)
        if (val !== undefined && val !== null) {
          // collect own and prototype property names
          const props = new Set<string>()
          try {
            Object.getOwnPropertyNames(val).forEach(p => props.add(p))
          } catch {}
          try {
            let proto = Object.getPrototypeOf(val)
            while (proto && proto !== Object.prototype) {
              Object.getOwnPropertyNames(proto).forEach(p => props.add(p))
              proto = Object.getPrototypeOf(proto)
            }
            // also include Object.prototype last (filtered later)
            Object.getOwnPropertyNames(Object.prototype).forEach(p => props.add(p))
          } catch {}

          const filteredProps = Array.from(props)
            .filter(p => typeof p === 'string' && p !== 'constructor' && !p.startsWith('_'))
            .filter(p => tailPrefix === '' ? true : p.startsWith(tailPrefix))
            .slice(0, maxSuggestions)

          list = filteredProps.map(p => {
            // try to detect if property is function on the instance/prototype
            let isFn = false
            try {
              const maybe = (val as any)[p]
              isFn = typeof maybe === 'function'
            } catch {}
            return `${'$' + base}.${p}${isFn ? '()' : ''}`
          })
        }
      } catch {}
    }

    if (list.length === 0) {
      list = (prefix === '$') ? mergedSuggestions.slice(0, maxSuggestions) : mergedSuggestions.filter(s => s.startsWith(prefix)).slice(0, maxSuggestions)
    }
    setFiltered(list)
    setActiveIdx(0)
    setShowList(list.length > 0)
    try {
      const el = inputRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setDropdownPos({ left: r.left, top: r.top, width: r.width, height: r.height })
      }
    } catch {}
  }

  const write = (next: string) => { setText(next); try { onChange(next) } catch {} }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    write(v)
    const pos = (e.target as HTMLInputElement | HTMLTextAreaElement).selectionStart || 0
    setCaret(pos)
    updateSuggestionsForCaret(pos)
  }

  const insertSuggestionAtToken = (sugg: string) => {
    const pos = caret ?? text.length
    const tokenInfo = computeToken(text, pos)
    if (!tokenInfo) return
    const before = text.slice(0, tokenInfo.start)
    const after = text.slice(pos)
    const next = before + sugg + after
    write(next)
    const newPos = (before + sugg).length
    // If the suggestion ends with '()', place caret between the parentheses
    const placeInsideParens = sugg.endsWith('()')
    setTimeout(() => {
      try {
        if (inputRef.current) {
          inputRef.current.focus()
          if (placeInsideParens) {
            const inside = newPos - 1
            inputRef.current.setSelectionRange(inside, inside)
          } else {
            inputRef.current.setSelectionRange(newPos, newPos)
          }
        }
      } catch {}
    }, 0)
    setShowList(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (!showList) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) insertSuggestionAtToken(filtered[activeIdx]); return }
    if (e.key === 'Escape') { setShowList(false); return }
  }

  // Evaluate current expression to boolean and call onEvaluate if provided
  const evaluateNow = (samp?: any, m?: any) => {
    try {
      const ctxSample = samp ?? sample ?? {}
      const ctxMeta = m ?? meta ?? {}
      const res = evaluateExpressionToBoolean(text, ctxSample, ctxMeta)
      try { onEvaluate && onEvaluate(res) } catch {}
      return res
    } catch { return false }
  }

  useImperativeHandle(ref, () => ({ evaluate: evaluateNow }))

  const onKeyDownWrapper = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === '$') {
      setTimeout(() => {
        try { const pos = inputRef.current?.selectionStart || 0; setCaret(pos); updateSuggestionsForCaret(pos) } catch {}
      }, 0)
    }
    // If Enter pressed and suggestion list not shown, evaluate
    if (e.key === 'Enter' && !showList) {
      // evaluate using supplied context
      try { evaluateNow() } catch {}
      return
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
    <div style={{ position: 'relative' }} className={className}>
      {!multiline ? (
        <input
          ref={inputRef as any}
          value={text}
          onChange={handleChange}
          onKeyDown={onKeyDownWrapper}
          onClick={(e) => { const pos = (e.target as HTMLInputElement).selectionStart || 0; setCaret(pos); updateSuggestionsForCaret(pos) }}
          onBlur={() => { setTimeout(() => setShowList(false), 120) }}
          placeholder={placeholder}
          className="p-2 rounded border w-full"
        />
      ) : (
        <TextareaAutosize
          ref={inputRef as any}
          value={text}
          rows={rows}
          onChange={handleChange}
          onKeyDown={onKeyDownWrapper}
          onClick={(e) => { const pos = (e.target as HTMLTextAreaElement).selectionStart || 0; setCaret(pos); updateSuggestionsForCaret(pos) }}
          onBlur={() => { setTimeout(() => setShowList(false), 120) }}
          placeholder={placeholder}
          className="p-2 rounded border w-full"
        />
      )}

      {showList && filtered.length > 0 && dropdownPos && createPortal(
        <div style={{ position: 'absolute', left: dropdownPos.left, top: dropdownPos.top + dropdownPos.height + 6, width: dropdownPos.width, zIndex: 99999 }}>
          <div className="bg-black text-white border rounded shadow-sm" style={{ maxHeight: 320, overflow: 'auto' }}>
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
    </div>
  )
})
