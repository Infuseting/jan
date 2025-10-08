import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/builder/$builderId')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/builder/$builderId"!</div>
}
