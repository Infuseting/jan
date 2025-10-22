export enum portEnum {
  Input = 'input',
  Output = 'output',
}

export type port = {
  id: string
  kind?: portEnum
  label?: string
  showLabel?: boolean
  meta?: Record<string, unknown>
}

export default port
