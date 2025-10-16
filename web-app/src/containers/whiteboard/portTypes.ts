export enum portEnum {
  Input = 'input',
  Output = 'output',
}

export type port = {
  id: string
  kind?: portEnum
  label?: string
  /** When true the port label should be rendered next to the port */
  showLabel?: boolean
  meta?: Record<string, unknown>
}

export default port
