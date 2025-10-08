import NodeBase from '@/containers/NodeBase'
import { useState, useEffect } from 'react'

export default function IfNode({ id, selected }: { id: string; selected?: boolean }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="If"
      inputs={[{ id: 'cond', label: 'Condition' }]}
      outputs={[{ id: 'true', label: 'True' }, { id: 'false', label: 'False' }]}
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

export function IfNodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const initialConditions = (meta && meta.conditions) || [{ id: makeId(), type: 'boolean', left: '', comparator: 'isTrue', right: '' }]
  const [conditions, setConditions] = useState<any[]>(initialConditions)

  // sync when meta changes externally (only update local state)
  useEffect(() => {
    const mconds = (meta && meta.conditions) || []
    if (JSON.stringify(mconds) !== JSON.stringify(conditions)) {
      setConditions(mconds.length ? mconds : [{ id: makeId(), type: 'boolean', left: '', comparator: 'isTrue', right: '' }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta && meta.conditions, meta && meta.logic])

  const writeMeta = (nextConditions: any[]) => {
    try { setMeta({ ...(meta || {}), conditions: nextConditions }) } catch {}
  }

  const updateCondition = (idx: number, patch: Partial<any>) => {
    setConditions((arr) => {
      const next = arr.map((c, i) => i === idx ? { ...c, ...patch } : c)
      writeMeta(next)
      return next
    })
  }

  const addCondition = () => setConditions((arr) => {
    // if there is at least one condition, ensure the previous condition has a join operator
    const prev = arr[arr.length - 1]
    const newCond = { id: makeId(), type: 'boolean', left: '', comparator: 'isTrue', right: '' }
    const next = arr.length === 0 ? [newCond] : arr.map((c, i) => i === arr.length - 1 ? { ...c, join: c.join || 'AND' } : c).concat(newCond)
    writeMeta(next)
    return next
  })

  const removeCondition = (idx: number) => setConditions((arr) => {
    if (arr.length <= 1) return arr // enforce at least one condition
    const next = arr.filter((_, i) => i !== idx)
    writeMeta(next)
    return next
  })

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium">Conditions</label>
      {/* Join operators are shown between conditions below */}

      <div className="flex flex-col gap-2">
        {conditions.map((c, idx) => (
          <div key={c.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <select className="p-2 rounded border" value={c.type || 'any'} onChange={(e) => {
                const t = e.target.value
                const comps = COMPARATORS[t] || COMPARATORS.any
                updateCondition(idx, { type: t, comparator: comps[0], right: '' })
              }}>
                <option value="boolean">Boolean</option>
                <option value="number">Number</option>
                <option value="string">String</option>
                <option value="date">Date</option>
                <option value="any">Other</option>
              </select>

              <input className="p-2 rounded border flex-1" placeholder="Left operand (e.g. variable)" value={c.left || ''} onChange={(e) => updateCondition(idx, { left: e.target.value })} />

              <select className="p-2 rounded border" value={c.comparator} onChange={(e) => updateCondition(idx, { comparator: e.target.value })}>
                {(COMPARATORS[c.type] || COMPARATORS.any).map((op) => <option key={op} value={op}>{op}</option>)}
              </select>

              {/* right-hand input only for comparators that need a value */}
              {((c.type === 'boolean' && c.comparator !== 'isTrue' && c.comparator !== 'isFalse') || c.type !== 'boolean') && (
                <input className="p-2 rounded border w-36" placeholder="Right value" value={c.right || ''} onChange={(e) => updateCondition(idx, { right: e.target.value })} />
              )}

              <button className="px-2 py-1 rounded bg-main-view-fg/10" onClick={() => removeCondition(idx)} title="Remove">Remove</button>
            </div>

            {/* Join selector between this condition and the next (not shown after last) */}
            {idx < conditions.length - 1 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Join with</span>
                <select value={c.join || 'AND'} onChange={(e) => updateCondition(idx, { join: e.target.value })} className="p-1 rounded border text-sm">
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <button className="px-3 py-1 rounded bg-main-view-fg/10" onClick={addCondition}>Add condition</button>
      </div>

      <div className="text-xs text-muted-foreground">Supported comparators: boolean (isTrue/isFalse), number (==, !=, &gt;, &lt;...), string (contains, startsWith...), date (before/after/on), other (exists/notExists).</div>
    </div>
  )
}
