README: Creating a Node (general)

This guide walks through creating a node for the Whiteboard/Builder editor. It covers component wiring, config, registry registration, runtime executor, and tips for testing.

1) File structure and exports
- Place the file under `web-app/src/containers/node/` and name it e.g. `MyNode.tsx`.
- Export these items:
  - default React component (the node visual in the whiteboard)
  - `NodeConfig` (optional) for side panel configuration
  - `getNodeEntry()` function that returns the node metadata for the registry

2) Node visual component (default export)
- Signature used across the repo:
  function Node({ id, meta, onMetaChange, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; onMetaChange?: (m: Record<string, any>) => void; selected?: boolean; activePortId?: string | null; activePortKind?: 'input' | 'output' | null })
- Use `NodeBase` to maintain consistent appearance and to declare inputs/outputs:
  <NodeBase id={id} title="My Node" inputs={[{ id: 'in', label: 'In' }]} outputs={[{ id: 'out', label: 'Out' }]}>
    {/* Controls and display */}
  </NodeBase>
- `meta` contains stored settings for this node instance. Use `onMetaChange` to update meta; call it with the full meta object.

3) NodeConfig component
- Export `NodeConfig({ meta, setMeta })`. The editor shows this when the node is selected.
- `setMeta` should be called with the full meta object; the editor persists it.

4) getNodeEntry()
- Implement `getNodeEntry()` returning the node entry object (NodeEntry type). Required fields:
  - id: unique string (used by boards and registry)
  - title: human readable
  - nodeType: NodeType (e.g., NodeType.Operator, NodeType.Trigger)
  - type: 'note' | 'shape' | 'other'
  - component: Node (component reference)
  - config: NodeConfig or null
  - defaultMeta: object with defaults for meta when inserted
  - display: optional { Icon, title, description }
  - execute: optional runtime executor function (input, meta, ctx) => { portId, output }
- Example minimal entry:
  export function getNodeEntry() {
    return {
      id: 'my_node',
      title: 'My Node',
      nodeType: NodeType.Operator,
      type: 'note',
      category: 'Logic',
      component: Node,
      config: NodeConfig,
      defaultMeta: { foo: 'bar' },
      display: { Icon: IconFoo, title: 'My Node', description: 'Does foo' },
      execute: async (input, meta, ctx) => {
        // perform action and return output mapped to a portId
        return { portId: 'out', output: { result: 'ok' } }
      }
    }
  }

5) Register node in the registry
- Edit `web-app/src/containers/node/nodeRegistry.tsx` and import your node entry factory:
  import { getNodeEntry as getMyNodeEntry } from './MyNode'
- Add `getMyNodeEntry()` to the registry array so builders and the whiteboard can use it.

6) Runtime execution notes
- The publish/executor system loads the board JSON and locates elements by `el.meta._nodeId` which should match the `id` returned by `getNodeEntry()`.
- When executing, helper functions are provided that resolve outgoing connections and target node executors; see `runAndPropagate` usage in `web-app/src/lib/publishExecutor.ts` and `messageTriggerDispatcher.ts` for patterns.
- `execute` receives three arguments: `input` (payload injected by caller), `meta` (element.meta), and `ctx` (optional runtime context). It should return a mapping in the form `{ portId: 'out', output: { ... } }`.

7) Tips and best practices
- Keep the node's `defaultMeta` minimal and stable; changes to meta shapes are harder to migrate in published builders.
- Use `NodeBase` for consistent styling and port layout.
- Avoid side-effects in the visual component; runtime side-effects belong in `execute` or in the dispatcher/publish executor.
- Add logging inside the executor to help debug runtime behavior when running published builders.
- Add unit tests for your node executor if the runtime logic is complex.

8) Example
- See existing nodes such as `ThreadMessageTrigger.tsx`, `HttpRequestNode.tsx`, and `CronTrigger.tsx` for practical examples of trigger nodes and operators.

9) Testing locally
- To exercise the runtime logic without publishing, you can simulate the event the dispatcher listens for. Example:

```ts
// in console or test harness after app boot:
getServiceHub().events().emit('thread:created', sampleThread)
```

- Check console logs for `runAndPropagate` activity and node executor logs.

If you'd like, I can also add a short example unit test file for a sample node to this folder.