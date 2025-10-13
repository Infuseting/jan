README: Creating a Trigger Node (Thread Created)

This document explains how to create a trigger node that fires when a new thread is created. Follow this recipe to add a new trigger similar to the project's existing `thread_created` node.

1) File and exports
- Create a TSX file inside `web-app/src/containers/node/`, for example `MyTriggerNode.tsx`.
- Export three things from the file:
  - default React component that renders the node inside the whiteboard (UI),
  - an optional `NodeConfig` component that the panel shows when the node is selected,
  - a `getNodeEntry()` function that returns the NodeEntry (id, component, config, defaultMeta, execute, etc.).

2) Node UI component (default export)
- Props signature used in this repo's nodes:
  function Node({ id, meta, onMetaChange, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean; activePortId?: string | null; activePortKind?: 'input' | 'output' | null })
- Use `NodeBase` (import from `@/containers/NodeBase`) to keep consistent styling and ports. Example:
  <NodeBase id={id} title="My Trigger" inputs={[]} outputs={[{ id: 'out', label: 'Trigger' }]}>
    { /* your UI controls */ }
  </NodeBase>
- The UI should call `onMetaChange?.({ ...(meta || {}), yourKey: newValue })` when a config value changes so the editor updates the node meta.

3) Config component (optional)
- Export `NodeConfig({ meta, setMeta })` if you need richer configuration in the side panel.
- `setMeta` should be called with the full meta object to update node settings.

4) getNodeEntry() details
- Implement `getNodeEntry()` and return an object like:
  {
    id: 'my_trigger', // unique id used by the registry and board
    title: 'My Trigger',
    nodeType: NodeType.Trigger,
    type: 'note',
    category: 'Trigger',
    component: Node,
    config: NodeConfig, // or null
    defaultMeta: { folders: [] },
    display: { Icon: IconFoo, title: 'My Trigger', description: 'Trigger description' },
    execute: async (input, meta, ctx) => { /* runtime executor */ }
  }
- `defaultMeta` defines the default shape for `meta` when the node is inserted.
- `execute` is invoked at runtime by the dispatcher or publish executor; for triggers it typically returns an object like `{ portId: 'out', output: { /* payload */ } }`.

5) Register node
- Add an import in `web-app/src/containers/node/nodeRegistry.tsx`:
  import { getNodeEntry as getMyTriggerEntry } from './MyTriggerNode'
- Add `getMyTriggerEntry()` to the registry array.

6) Dispatcher (runtime)
- Triggers require an event that fires outside the board runtime. For thread-created triggers you must:
  - Emit an application event when the thing is created. Example (threads): `getServiceHub().events().emit('thread:created', createdThread)` from `useThreads.createThread`.
  - Extend the dispatcher (`web-app/src/lib/messageTriggerDispatcher.ts`) to listen for that event and, for each published builder, parse the board JSON and find elements whose `el.meta._nodeId` equals your node id (e.g. `'thread_created'`).
  - For each matching element, check `el.meta` for allowed folders/projects or other filter criteria and call `runAndPropagate` with the element id, node id, entry.execute, input payload (e.g. `{ thread }`), `el.meta`, and helper functions to resolve outgoing connections and targets.

7) Matching semantics and best practices
- Treat empty arrays of `folders` as wildcard (match any project).
- Use the thread payload or service hub to resolve project id when the event payload doesn't contain it directly.
- Limit dispatcher work by only loading published builders (using `services/publish` helpers) and short-circuit if none are published.
- Add robust logging so it is easy to debug why a trigger was or wasn't executed.

8) Example
- See `web-app/src/containers/node/ThreadCreatedTrigger.tsx` for a working example.
- See `web-app/src/lib/messageTriggerDispatcher.ts` for how created threads are dispatched and how matches are computed.

9) Testing
- Add or publish a builder that contains your trigger and a downstream action (for example a simple log node or HTTP request node).
- Create or simulate the event (create the thread in the UI) and watch console logs for dispatcher activity.

If you want, I can also add an example test harness that programmatically emits `getServiceHub().events().emit('thread:created', sampleThread)` and asserts that `runAndPropagate` was invoked (unit test)."}