import NodeBase from '@/containers/NodeBase'
import { useState, useEffect } from 'react'
import { NodeType } from '@/lib/node'
import { portEnum } from '@/containers/whiteboard/portTypes'
import SmartInput from '@/containers/SmartInput'
import { GLOBAL_SUGGESTIONS, resolveGlobal } from '@/lib/globals'
import { evaluateExpression } from '@/lib/expression'

export default function Node({ id, selected, activePortId, activePortKind }: { id: string; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  return (
    <NodeBase
      id={id}
      selected={selected}
      title="HTTP Request"
  inputs={[{ id: 'in', label: 'Trigger', kind: portEnum.Input, showLabel: true }]}
  outputs={[{ id: 'out', label: 'Response', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
    />
  )
}

// small helper to parse key:value lines into object
const parseKeyValueLines = (raw: string) => {
  const out: Record<string, string> = {}
  if (!raw) return out
  for (const line of raw.split(/\r?\n/)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const k = line.substring(0, idx).trim()
    const v = line.substring(idx + 1).trim()
    if (k) out[k] = v
  }
  return out
}

// Substitute $input.* and $meta.* tokens with values from provided samples
const substituteTokens = (text: string, inputSample: any, metaSample: any) => {
  if (!text) return ''

  const formatForInsert = (val: any) => {
    if (val === null || val === undefined) return ''
    if (val instanceof Date) return val.toISOString()
    if (typeof val === 'string') return val
    try { return JSON.stringify(val) } catch { return String(val) }
  }

  // match token optionally followed by a single pair of parentheses (no deep nesting in regex)
  return text.replace(/\$[a-zA-Z0-9_\.]+(?:\([^)]*\))?/g, function (m: string) {
    // m is the full match (token + optional paren part)
    // extract the base token (without parentheses)
    const tokenOnly = m.replace(/\([^)]*\)$/, '')
    let exprToEval = m

    // if there were no parentheses in the match, but the referenced property is callable,
    // append '()' to call it before evaluation (so we consume the call and don't leave trailing parens)
    if (!/\([^)]*\)$/.test(m)) {
      const varName = tokenOnly.substring(1)
      const segs = varName.split('.')
      let baseVal: any = undefined
      try {
        if (segs[0] === 'input') baseVal = segs.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), inputSample)
        else if (segs[0] === 'meta') baseVal = segs.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
        else {
          baseVal = segs.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), inputSample)
          if (baseVal === undefined) baseVal = segs.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
          if (baseVal === undefined) baseVal = resolveGlobal(segs[0])
        }
      } catch {}

      // if last segment is a method and is function on baseVal's prototype/instance, call it
      if (segs.length > 1 && baseVal !== undefined) {
        const last = segs[segs.length - 1]
        try {
          const maybe = (baseVal as any)[last]
          if (typeof maybe === 'function') {
            exprToEval = tokenOnly + '()'
          }
        } catch {}
      }
    }

    try {
      const ev = evaluateExpression(exprToEval, inputSample, metaSample)
      if (ev !== undefined) return formatForInsert(ev)
    } catch {}

    // fallback: resolve tokenOnly without evaluating function calls
    const varName = tokenOnly.substring(1)
    const segs = varName.split('.')
    let val: any = undefined
    if (segs[0] === 'input') {
      val = segs.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), inputSample)
    } else if (segs[0] === 'meta') {
      val = segs.slice(1).reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
    } else {
      val = segs.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), inputSample)
      if (val === undefined) val = segs.reduce((acc: any, s: string) => (acc && acc[s] !== undefined ? acc[s] : undefined), metaSample)
      if (val === undefined) {
        const g = resolveGlobal(segs[0])
        if (g !== undefined) val = g
      }
    }
    if (val === undefined) return m
    return formatForInsert(val)
  })
}

export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [method, setMethod] = useState<string>((meta && meta.method) || 'GET')
  const [url, setUrl] = useState<string>((meta && meta.url) || '')
  const [headersRaw, setHeadersRaw] = useState<string>(() => {
    if (!meta || !meta.headers) return ''
    return Object.entries(meta.headers).map(([k, v]) => `${k}: ${v}`).join('\n')
  })
  const [paramsRaw, setParamsRaw] = useState<string>(() => {
    if (!meta || !meta.params) return ''
    return Object.entries(meta.params).map(([k, v]) => `${k}=${v}`).join('\n')
  })
  const [body, setBody] = useState<string>((meta && meta.body) || '')

  useEffect(() => {
    try { setHeadersRaw(meta && meta.headers ? Object.entries(meta.headers).map(([k, v]) => `${k}: ${v}`).join('\n') : (meta && meta.headersRaw) || '') } catch {}
    try { setParamsRaw(meta && meta.params ? Object.entries(meta.params).map(([k, v]) => `${k}=${v}`).join('\n') : (meta && meta.paramsRaw) || '') } catch {}
    if ((meta && meta.method) && (meta.method !== method)) setMethod(meta.method)
    if ((meta && meta.url) && (meta.url !== url)) setUrl(meta.url)
    if ((meta && meta.body) && (meta.body !== body)) setBody(meta.body)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta])

  const write = (next: Record<string, any>) => {
    try { setMeta({ ...(meta || {}), ...next }) } catch {}
  }

  const sample = (meta && (meta.input || meta.sample)) || {}
  const metaObj = meta || {}

  const buildPreview = () => {
    const headers = parseKeyValueLines(headersRaw)
  const paramsLines = (paramsRaw || '').split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
    const params: Record<string,string> = {}
    for (const p of paramsLines) {
      const idx = p.indexOf('=')
      if (idx === -1) continue
      params[p.substring(0, idx).trim()] = p.substring(idx + 1).trim()
    }
    // substitute tokens
    const finalUrl = (() => {
      let u = substituteTokens(url, sample, metaObj)
      // append substituted params
  const qp = Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(substituteTokens(v, sample, metaObj))}`).join('&')
      if (qp) {
        u += (u.includes('?') ? '&' : '?') + qp
      }
      return u
    })()
    const finalBody = method.toUpperCase() === 'GET' ? '' : substituteTokens(body, sample, metaObj)
    return { method, url: finalUrl, headers, body: finalBody }
  }

  return (
    <div className="flex flex-col gap-3" style={{ position: 'relative' }}>
      <label className="text-sm font-medium">Method</label>
      <select value={method} onChange={(e) => { setMethod(e.target.value); write({ method: e.target.value }) }} className="p-2 rounded border w-full">
        <option>GET</option>
        <option>POST</option>
        <option>PUT</option>
        <option>DELETE</option>
        <option>PATCH</option>
      </select>

  <label className="text-sm font-medium">URL</label>
  <SmartInput value={url} onChange={(v) => { setUrl(v); write({ url: v }) }} placeholder="https://api.example.com/path" className="" suggestionsSource={[...GLOBAL_SUGGESTIONS]} sample={sample} meta={metaObj} />

  <label className="text-sm font-medium">Query params (one per line key=value)</label>
  <SmartInput multiline rows={6} value={paramsRaw} onChange={(v) => { setParamsRaw(v); write({ paramsRaw: v }) }} className="" suggestionsSource={[...GLOBAL_SUGGESTIONS]} sample={sample} meta={metaObj} />

  <label className="text-sm font-medium">Headers (one per line Key: Value)</label>
  <SmartInput multiline rows={6} value={headersRaw} onChange={(v) => { setHeadersRaw(v); write({ headersRaw: v }) }} className="" suggestionsSource={[...GLOBAL_SUGGESTIONS]} sample={sample} meta={metaObj} />

  <label className="text-sm font-medium">Body (for POST/PUT/PATCH)</label>
  <SmartInput multiline rows={10} value={body} onChange={(v) => { setBody(v); write({ body: v }) }} className="" suggestionsSource={[...GLOBAL_SUGGESTIONS]} sample={sample} meta={metaObj} />

      <div>
        <div className="text-sm font-medium">Preview</div>
        <div className="mt-2 p-2 rounded border bg-main-view-fg/6">
          {(() => {
            const p = buildPreview()
            return (
              <div>
                <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' as any, wordBreak: 'break-word' as any }}>{p.method} {p.url}</div>
                {Object.keys(p.headers || {}).length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium">Headers</div>
                    <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' as any, wordBreak: 'break-word' as any }}>{Object.entries(p.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}</div>
                  </div>
                )}
                {p.body && (
                  <div className="mt-2">
                    <div className="text-xs font-medium">Body</div>
                    <pre style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', margin: 0, overflowWrap: 'anywhere' as any, wordBreak: 'break-word' as any }}>{p.body}</pre>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

// executor: performs the HTTP request using fetch. Returns portId 'out' with response details.
export async function execute(input?: any, meta?: Record<string, any>, context?: { [k: string]: any; signal?: AbortSignal }) {
  const m = (meta && meta.method) || 'GET'
  const urlRaw = (meta && meta.url) || ''
  const headersRaw = (meta && meta.headersRaw) || ''
  const paramsRaw = (meta && meta.paramsRaw) || ''
  const bodyRaw = (meta && meta.body) || ''

  const inputSample = (meta && (meta.input || meta.sample)) || input || {}
  const metaSample = meta || {}

  // build URL and body
  const buildUrl = () => {
    let u = substituteTokens(urlRaw, inputSample, metaSample)
    const paramsLines = (paramsRaw || '').split(/\r?\n/).map((l: string) => l.trim()).filter(Boolean)
    const qp = paramsLines.map((p: string) => {
      const idx = p.indexOf('=')
      if (idx === -1) return ''
      const k = p.substring(0, idx).trim()
      const v = substituteTokens(p.substring(idx + 1).trim(), inputSample, metaSample)
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    }).filter(Boolean).join('&')
    if (qp) u += (u.includes('?') ? '&' : '?') + qp
    return u
  }

  const headers = parseKeyValueLines(headersRaw)
  const finalUrl = buildUrl()
  const methodUp = m.toUpperCase()
  const fetchOpts: any = { method: methodUp, headers }
  
  if (methodUp !== 'GET' && bodyRaw) {
    const b = substituteTokens(bodyRaw, inputSample, metaSample)
    fetchOpts.body = b
  }
  
  
  try {
    
  console.log("HTTP Request execute")
    const resp = await fetch(finalUrl, { ...fetchOpts, signal: context && context.signal })
    console.log(resp)
    const text = await resp.text()
    const respHeaders: Record<string,string> = {}
    try { resp.headers.forEach((v,k) => { respHeaders[k] = v }) } catch {}
    return { portId: 'out', output: { status: resp.status, statusText: resp.statusText, headers: respHeaders, body: text } }
  } catch (e: any) {
    console.error('HTTP Request error', e)
    return { portId: 'out', output: { error: true, message: String(e) } }
  }
}

export function getNodeEntry() {
  return {
    id: 'http_request',
    title: 'HTTP Request',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'IO/Network',
    component: Node,
    config: NodeConfig,
    execute: execute,
    display: { title: 'HTTP Request', description: 'Perform an HTTP GET/POST request with headers, params and body' },
  }
}
