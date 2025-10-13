export function uid() {
  return `e_${Date.now().toString(36)}_${Math.floor(Math.random() * 10000)}`
}
