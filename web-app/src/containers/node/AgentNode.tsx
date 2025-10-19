import { useState, useEffect } from 'react'
import NodeBase from '@/containers/NodeBase'
import { portEnum } from '@/containers/whiteboard/portTypes'
import { NodeType } from '@/lib/node'
import DropdownModelProvider from '@/containers/DropdownModelProvider'
import { useModelProvider } from '@/hooks/useModelProvider'
import { IconRobot } from '@tabler/icons-react'
import DropdownAssistant from '@/containers/DropdownAssistant'
import { useAssistant } from '@/hooks/useAssistant'
import DropdownToolsAvailable from '@/containers/DropdownToolsAvailable'
import { IconTool } from '@tabler/icons-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppState } from '@/hooks/useAppState'
import { useServiceHub } from '@/hooks/useServiceHub'
import { useTools } from '@/hooks/useTools'
import { McpExtensionToolLoader } from '@/containers/McpExtensionToolLoader'
import { ExtensionTypeEnum, MCPExtension } from '@janhq/core'
import { ExtensionManager } from '@/lib/extension'

// Visual component for the Agent node
export default function Node({ id, meta, selected, activePortId, activePortKind }: { id: string; meta?: Record<string, any>; selected?: boolean; activePortId?: string | null; activePortKind?: import('@/containers/whiteboard/portTypes').portEnum | null }) {
  const assistantName = meta?.assistantName || meta?.assistantId || '—'
  const model = meta?.model || 'auto'

  return (
    <NodeBase
      id={id}
      selected={selected}
      title={`Agent: ${assistantName}`}
      inputs={[{ id: 'in', label: 'Trigger', kind: portEnum.Input, showLabel: true }]}
      outputs={[{ id: 'out', label: 'Response', kind: portEnum.Output, showLabel: true }]}
      activePortId={activePortId}
      activePortKind={activePortKind}
      className="max-w-xs"
    >
      <div className="text-xs text-main-view-fg/70 mt-2">
        <div>Model: <span className="font-medium">{model}</span></div>
        <div className="mt-1">Format: <span className="font-medium">{meta?.outputFormat || 'text'}</span></div>
      </div>
    </NodeBase>
  )
}

// Configuration panel shown when the node is selected
export function NodeConfig({ meta, setMeta }: { meta?: Record<string, any>; setMeta: (m: Record<string, any>) => void }) {
  const [assistantId, _setAssistantId] = useState(meta?.assistantId || '')
  const [assistantName, _setAssistantName] = useState(meta?.assistantName || '')
  const [model, _setModel] = useState(meta?.model || '')
  const [outputFormat, setOutputFormat] = useState(meta?.outputFormat || 'text')
  const [toolsRaw, setToolsRaw] = useState((meta?.tools || []).join(', '))
  const [context, setContext] = useState(meta?.context || '')
  const [threadVisible, setThreadVisible] = useState<boolean>(meta?.threadVisible ?? true)
  const { currentAssistant } = useAssistant()

  // When the global currentAssistant is changed via the shared dropdown, allow user to apply it to this node
  useEffect(() => {
    if (!currentAssistant) return
    // do not auto-apply; user must click the button to confirm
  }, [currentAssistant])

  const selectedProvider = useModelProvider((s) => s.selectedProvider)
  const selectedModel = useModelProvider((s) => s.selectedModel)
  const serviceHub = useServiceHub()
  useTools()
  const tools = useAppState((s) => s.tools)
  const [connectedServers, setConnectedServers] = useState<string[]>([])

  useEffect(() => {
    let mounted = true
    const checkConnected = async () => {
      try {
        const servers = await serviceHub.mcp().getConnectedServers()
        if (mounted) setConnectedServers(servers)
      } catch (e) {
        if (mounted) setConnectedServers([])
      }
    }
    checkConnected()
    const id = setInterval(checkConnected, 3000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [serviceHub])

  const hasActiveMCPServers = connectedServers.length > 0 || tools.length > 0

  const extensionManager = ExtensionManager.getInstance()
  const mcpExtension = extensionManager.get<MCPExtension>(ExtensionTypeEnum.MCP)
  const MCPToolComponent = mcpExtension?.getToolComponent?.()

  useEffect(() => {
    // When any field changes, write full meta back to node storage
    const tools = toolsRaw
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean)

    let provider = meta?.modelProvider
    let modelId = meta?.modelId
    if (!provider || !modelId) {
      if (model && model.includes(':')) {
        const [p, id] = model.split(':', 2)
        provider = provider || p
        modelId = modelId || id
      }
    }

    setMeta({
      ...meta,
      assistantId: assistantId || undefined,
      assistantName: assistantName || undefined,
      model: model || undefined,
      modelProvider: provider || undefined,
      modelId: modelId || undefined,
      outputFormat,
      tools,
      context,
      threadVisible,
    })
  }, [assistantId, assistantName, model, outputFormat, toolsRaw, context, threadVisible])
 useEffect(() => {
    if (meta?.modelProvider && meta?.modelId) {
      const select = useModelProvider.getState().selectModelProvider
      try {
        select(meta.modelProvider, meta.modelId)
      } catch (e) {
      }
    }
  }, [])    
  useEffect(() => {
    if (!selectedProvider || !selectedModel) return
    const modelMeta = `${selectedProvider}:${selectedModel.id}`
    if (meta?.modelProvider === selectedProvider && meta?.modelId === selectedModel.id && meta?.model === modelMeta) return
    setMeta({ ...(meta || {}), model: modelMeta, modelProvider: selectedProvider, modelId: selectedModel.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProvider, selectedModel])
  return (
    <div>
      <div className="mb-3">
        <label className="text-sm font-medium">Agent</label>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1">
            <DropdownAssistant />
          </div>
        </div>
      </div>
      

      <div className="mb-3">
        <label className="text-sm font-medium">Model</label>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex-1">
              <DropdownModelProvider useLastUsedModel={false} />
          </div>
          <div className="flex gap-2">
              {selectedModel?.capabilities?.includes('tools') && hasActiveMCPServers && (
                MCPToolComponent ? (
                  <McpExtensionToolLoader
                    tools={tools}
                    hasActiveMCPServers={hasActiveMCPServers}
                    selectedModelHasTools={selectedModel?.capabilities?.includes('tools') ?? false}
                    initialMessage={false}
                    MCPToolComponent={MCPToolComponent}
                  />
                ) : (
                  <TooltipProvider>
                    <Tooltip open={false} onOpenChange={() => {}}>
                      <TooltipTrigger asChild>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownToolsAvailable
                            initialMessage={false}
                            onOpenChange={() => {}}
                            onPick={(toolName) => {
                              const current = toolsRaw.split(',').map((t: string) => t.trim()).filter(Boolean)
                              if (!current.includes(toolName)) {
                                const next = [...current, toolName].join(', ')
                                setToolsRaw(next)
                                // also persist to meta immediately
                                setMeta({ ...(meta || {}), tools: [...(meta?.tools || []), toolName] })
                              }
                            }}
                            onToggleServer={(serverName, enabled) => {
                              const currentServers = meta?.allowedMcpServers || []
                              const updated = enabled ? Array.from(new Set([...currentServers, serverName])) : currentServers.filter((s: string) => s !== serverName)
                              setMeta({ ...(meta || {}), allowedMcpServers: updated })
                            }}
                          >
                            {(isOpen, _toolsCount) => (
                              <div className={"h-7 p-1 flex items-center justify-center rounded-sm hover:bg-main-view-fg/10 transition-all duration-200 ease-in-out gap-1 cursor-pointer relative " + (isOpen ? 'bg-main-view-fg/10' : '')}>
                                <IconTool size={18} className="text-main-view-fg/50" />
                              </div>
                            )}
                          </DropdownToolsAvailable>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Tools</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )
              )}
            </div>
        </div>
      </div>
      <div className="mb-3">
        <label className="text-sm font-medium">Output format</label>
        <select value={outputFormat} onChange={(e) => setOutputFormat(e.target.value)} className="w-full mt-1">
          <option value="text">Text</option>
          <option value="json">JSON</option>
          <option value="rich">Rich (structured)</option>
        </select>
      </div>
      <div className="mb-3">
        <label className="text-sm font-medium">Context</label>
        <textarea value={context} onChange={(e) => setContext(e.target.value)} className="w-full mt-1 p-2 text-sm" rows={4} />
      </div>

      <div className="mb-3 flex items-center gap-3">
        <input id="threadVisible" type="checkbox" checked={threadVisible} onChange={(e) => setThreadVisible(e.target.checked)} />
        <label htmlFor="threadVisible" className="text-sm">Show agent threads in the thread list</label>
      </div>
    </div>
  )
}

// Runtime executor: returns configured agent payload on 'out' port
export async function execute(_input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  // Non-destructive runtime: return the agent configuration and input as the response.
  // Integrations that actually run the agent can read the meta and perform calls externally.
  const response = {
    agent: meta || {},
    input: _input ?? null,
    timestamp: Date.now(),
  }

  return { portId: 'out', output: response }
}

export function getNodeEntry() {
  return {
    id: 'agent',
    title: 'AI Agent',
    nodeType: NodeType.Node,
    type: 'note' as const,
    category: 'AI',
    component: Node,
    config: NodeConfig,
    execute: execute,
    defaultMeta: {
      model: '*',
      allowMCP: true,
      outputFormat: 'text',
      tools: [],
      context: '',
      threadVisible: false,
    },
    display: { Icon: IconRobot, title: 'AI Agent', description: 'Configure an AI agent (assistant, model, tools, context) to respond' },
  }
}
