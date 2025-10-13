import { useEffect } from 'react'

export default function useNodeStateStyles() {
  useEffect(() => {
    const id = 'wb-node-state-styles'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.innerHTML = `
      .node-wrapper { position: absolute; display: inline-block }
      .node--selected { box-shadow: 0 0 0 2px rgba(99,102,241,0.12) inset }
      /* when a port is selected for connection, highlight node with green border */
      .node--port-selected { box-shadow: 0 0 0 2px rgba(16,185,129,0.9) inset }
      .node--success { box-shadow: 0 0 0 2px rgba(16,185,129,0.6) inset }
      .node--error { box-shadow: 0 0 0 2px rgba(239,68,68,0.7) inset }
      .node--running { position: relative; }
      .node--running::after {
        content: '';
        position: absolute;
        inset: -6px;
        border-radius: 10px;
        background: conic-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.25) 40%, transparent 120deg);
        pointer-events: none;
        animation: wb-run-spin 1s linear infinite;
        mix-blend-mode: overlay;
      }
      @keyframes wb-run-spin { to { transform: rotate(360deg) } }
    `
    document.head.appendChild(style)
    return () => {
      try { style.remove() } catch {}
    }
  }, [])
}
