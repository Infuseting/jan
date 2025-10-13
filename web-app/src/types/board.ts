export type BoardSnapshot = {
  elements: WBElement[]
  connections: Array<{ from: { nodeId: string; portId: string }; to: { nodeId: string; portId: string } }>
  scale: number
  translate: { x: number; y: number }
}

export type WBElementType = 'note' | 'shape' | 'image' | 'other'
export type WBElement = { id: string; type: WBElementType; x: number; y: number; meta?: Record<string, unknown> }

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
