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
import { useServiceHub, getServiceHub } from '@/hooks/useServiceHub'
import { useTools } from '@/hooks/useTools'
import { useToolAvailable } from '@/hooks/useToolAvailable'
import SmartInput from '@/containers/SmartInput'
import { McpExtensionToolLoader } from '@/containers/McpExtensionToolLoader'
import {
  sendCompletion,
  newAssistantThreadContent,
  isCompletionResponse,
  postMessageProcessing,
} from '@/lib/completion'
import { CompletionMessagesBuilder } from '@/lib/messages'
// import { extractReasoningFromMessage } from '@/utils/reasoning'
import { useToolApproval } from '@/hooks/useToolApproval'
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
        outputs={[{ id: 'success', label: 'Success', kind: portEnum.Output, showLabel: true }, { id: 'error', label: 'Error', kind: portEnum.Output, showLabel: true }]}
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
  const [outputFormat, _setOutputFormat] = useState(meta?.outputFormat || 'text')
  const [toolsRaw, setToolsRaw] = useState((meta?.tools || []).join(', '))
  const [context, setContext] = useState(meta?.context || '')
  const [threadVisible, _setThreadVisible] = useState<boolean>(meta?.threadVisible ?? true)
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
  const { setDefaultDisabledTools, getDefaultDisabledTools } = useToolAvailable()
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
    // Only write if computed meta actually differs to avoid infinite save loops / excessive writes
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

    const newMeta = {
      ...(meta || {}),
      assistantId: assistantId || undefined,
      assistantName: assistantName || undefined,
      model: model || undefined,
      modelProvider: provider || undefined,
      modelId: modelId || undefined,
      outputFormat,
      tools,
      context,
      threadVisible,
    }

    try {
      const same = JSON.stringify(newMeta) === JSON.stringify(meta || {})
      if (!same) {
        setMeta(newMeta)
      }
    } catch (e) {
      // If serialization fails for any reason, fallback to setting meta (safe)
      try { setMeta(newMeta) } catch {}
    }
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
                            initialMessage={true}
                            onOpenChange={() => {}}
                            isToolCheckedOverride={(toolName: string) => {
                              try {
                                // First prefer explicit per-node tool selection in meta.tools
                                const selectedTools = meta?.tools || []
                                if (selectedTools && selectedTools.length > 0) {
                                  return selectedTools.includes(toolName)
                                }
                                // Fallback to server-level permission if no per-node selection
                                const allowed = meta?.allowedMcpServers || []
                                const found = tools.find((t: any) => t.name === toolName)
                                if (!found) return true
                                return allowed.includes(found.server)
                              } catch (e) {
                                return true
                              }
                            }}
                            onToolToggleOverride={(toolName: string, checked: boolean) => {
                              // Toggle should add/remove toolName in meta.tools
                              try {
                                console.log('[AgentNode] onToolToggleOverride ->', toolName, checked)
                                const currentTools = Array.isArray(meta?.tools) ? [...meta.tools] : []
                                const exists = currentTools.includes(toolName)
                                let updatedTools: string[]
                                if (checked && !exists) {
                                  updatedTools = [...currentTools, toolName]
                                } else if (!checked && exists) {
                                  updatedTools = currentTools.filter((t: string) => t !== toolName)
                                } else {
                                  updatedTools = currentTools
                                }
                                setMeta({ ...(meta || {}), tools: updatedTools })
                              } catch (e) {
                                // ignore
                              }
                            }}
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
                              const updated = enabled
                                ? Array.from(new Set([...currentServers, serverName]))
                                : currentServers.filter((s: string) => s !== serverName)
                              try {
                                // Update meta.allowedMcpServers and also update meta.tools to include/remove all tools for this server
                                const serverTools = tools.filter((t: any) => t.server === serverName).map((t: any) => t.name)
                                const currentTools = Array.isArray(meta?.tools) ? [...meta.tools] : []
                                let nextTools: string[]
                                if (enabled) {
                                  // add all server tool names
                                  nextTools = Array.from(new Set([...currentTools, ...serverTools]))
                                } else {
                                  // remove all server tool names
                                  nextTools = currentTools.filter((n: string) => !serverTools.includes(n))
                                }
                                setMeta({ ...(meta || {}), allowedMcpServers: updated, tools: nextTools })
                              } catch (e) {
                                // fallback: still update allowedMcpServers
                                setMeta({ ...(meta || {}), allowedMcpServers: updated })
                              }
                              // Update in-memory defaults for immediate UI feedback (meta remains source of truth)
                              try {
                                const serverTools = tools.filter((t: any) => t.server === serverName)
                                if (serverTools.length > 0) {
                                  const currentDefaults = getDefaultDisabledTools()
                                  if (enabled) {
                                    const next = currentDefaults.filter((name: string) => !serverTools.some((st: any) => st.name === name))
                                    setDefaultDisabledTools(next)
                                  } else {
                                    const toAdd = serverTools.map((st: any) => st.name).filter((n: string) => !currentDefaults.includes(n))
                                    setDefaultDisabledTools([...currentDefaults, ...toAdd])
                                  }
                                }
                              } catch (e) {
                                // ignore
                              }
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
        <label className="text-sm font-medium">Instructions</label>
        <div className="mt-1">
          <SmartInput
            multiline
            rows={4}
            value={context}
            onChange={(v) => setContext(v)}
            className="w-full"
            placeholder="Context / instructions for the agent"
            sample={{}}
            meta={{}}
          />
        </div>
      </div>
    </div>
  )
}

// Runtime executor: returns configured agent payload on 'out' port
export async function execute(_input?: any, meta?: Record<string, any>, _context?: { [k: string]: any; signal?: AbortSignal }) {
  try {
    // Build a minimal thread object shaped like app threads so sendCompletion can work
    const threadId = meta?.threadId || `agent-node-${Date.now()}`
    const thread: any = {
      id: threadId,
      title: meta?.assistantName || meta?.assistantId || 'Agent Node',
      model: {
        id: meta?.modelId || (meta?.model || '*'),
        provider: meta?.modelProvider || undefined,
      },
    }

  const serviceHub = getServiceHub()

    const abortController = new AbortController()
    // Allow caller to abort via context.signal
    if (_context && _context.signal) {
      _context.signal.addEventListener('abort', () => abortController.abort())
    }

    // Build messages array: include provided context/instructions if present
    const messages = []
    if (meta?.context) {
      messages.push({ role: 'system', content: meta.context })
    }

    const inputText = typeof _input === 'string' ? _input : JSON.stringify(_input ?? {})
    messages.push({ role: 'user', content: inputText })

    // Determine provider object from configured provider name (if available)
    // First try the local model-provider store (this is what ChatInput/useChat uses)
    // then fall back to serviceHub.providers().getProviders() if not found.
    let providerObj: any = undefined
    try {
      if (meta?.modelProvider) {
        try {
          const local = useModelProvider.getState().getProviderByName(
            meta.modelProvider
          )
          if (local) providerObj = local
        } catch (e) {
          // ignore local lookup failures and continue to service hub
        }
      }

      if (!providerObj && serviceHub && typeof serviceHub.providers === 'function') {
        const providers = await serviceHub.providers().getProviders()
        // Prefer exact provider match by known keys, fall back to common heuristics
        providerObj = providers?.find(
          (p: any) =>
            p.provider === meta?.modelProvider ||
            p.name === meta?.modelProvider ||
            p.id === meta?.modelProvider ||
            (meta?.modelProvider && p.base_url && p.base_url.includes(meta.modelProvider))
        )
      }
    } catch (e) {
      // ignore and continue
    }

    try {
      const apiKeyFromProvider = providerObj?.api_key
      const appToken = await serviceHub.core().getAppToken().catch(() => undefined)
      const resolvedApiKey = apiKeyFromProvider ?? appToken
      if (!resolvedApiKey) {
        const providerName = providerObj?.provider || meta?.modelProvider || 'unknown'
        const msg = `No API key found for provider '${providerName}'. Please configure the provider API key in Settings (or set an app token). This node cannot call ${providerName} without credentials.`
        console.error('[AgentNode] execute error - missing API key for provider', providerName)
        return { portId: 'error', output: { error: 'missing_api_key', message: msg, provider: providerName } }
      }
    } catch (e) {
     
    }
    const globalTools = await serviceHub.mcp().getTools()

    console.log('Global tools: ', globalTools)
    const allowedServers = Array.isArray(meta?.allowedMcpServers) ? meta!.allowedMcpServers : []
    const resolvedTools = (meta?.tools || [])
      .map((t: any) => {
        if (!t) return null

        // Helper to check server permission
        const isServerAllowed = (toolObj: any) => {
          if (!toolObj || !toolObj.server) return allowedServers.length === 0
          return allowedServers.length === 0 || allowedServers.includes(toolObj.server)
        }

        // If it's already a full tool object with a name, prefer the global tool entry
        if (typeof t === 'object' && t.name) {
          const found = globalTools.find((g: any) => g.name === t.name || g.id === t.name)
          if (found) {
            if (isServerAllowed(found)) return found
            console.warn('[AgentNode] tool exists but server not allowed, skipping:', found.name, found.server)
            return null
          }
          // No global match but object has name: include only if no server restriction
          if (allowedServers.length === 0) return t
          console.warn('[AgentNode] tool not found in registry, skipping due to server restrictions:', t.name)
          return null
        }

        // If it's a function wrapper (from some other shape), try extract name
        if (typeof t === 'object' && t.function && typeof t.function === 'object') {
          const fname = t.function.name
          if (!fname) {
            console.warn('[AgentNode] dropping malformed tool (function missing name):', t)
            return null
          }
          const found = globalTools.find((g: any) => g.name === fname || g.id === fname)
          if (found) {
            if (isServerAllowed(found)) return found
            console.warn('[AgentNode] tool exists but server not allowed, skipping:', found.name, found.server)
            return null
          }
          console.warn('[AgentNode] function tool name not found in registry, skipping:', fname)
          return null
        }

        // If it's a string, resolve by name/id
        if (typeof t === 'string') {
          const found = globalTools.find((g: any) => g.name === t || g.id === t)
          if (found) {
            if (isServerAllowed(found)) return found
            console.warn('[AgentNode] tool exists but server not allowed, skipping:', found.name, found.server)
            return null
          }
          console.warn('[AgentNode] unknown tool name in meta.tools, skipping:', t)
          return null
        }

        console.warn('[AgentNode] unsupported tool shape in meta.tools, skipping:', t)
        return null
      })
      .filter(Boolean)
    // Call sendCompletion (stream=false) to get a single response
    const completion = await sendCompletion(
      thread,
      providerObj,
      messages as any,
      abortController,
      resolvedTools,
      false,
      {}
    )

    if (!completion) {
      return { portId: 'error', output: { error: 'no completion', input: _input, meta } }
    }

    // If response is non-streaming completion (object with choices)
    if (isCompletionResponse(completion)) {
      const message = completion.choices?.[0]?.message as any
      let accumulatedText = (message?.content as string) || ''

      const toolCalls = message?.tool_calls || []

      // Create assistant content object
      const finalContent = newAssistantThreadContent(thread.id, accumulatedText, {
        assistant: meta?.assistantName,
      })

      // Process any tool calls (this will call MCP tools if needed)
  if (toolCalls && toolCalls.length > 0) {
    const builder = new CompletionMessagesBuilder([], meta?.context)
    try {
      const prior = (messages as any[]) || []
      for (const m of prior) {
        if (!m || !m.role) continue
        // Normalize content to a string
        let contentText = ''
        if (typeof m.content === 'string') contentText = m.content
        else if (Array.isArray(m.content)) {
          // join text parts
          contentText = m.content
            .map((c: any) => (typeof c === 'string' ? c : c?.text?.value || ''))
            .join('\n')
        } else if (m.content && typeof m.content === 'object') {
          contentText = m.content.text || m.content?.text?.value || ''
        }

        if (m.role === 'user') {
          try { builder.addUserMessage(contentText) } catch (e) { /* ignore */ }
        } else if (m.role === 'assistant') {
          try { builder.addAssistantMessage(contentText, undefined, m.tool_calls || []) } catch (e) { /* ignore */ }
        }
        // system messages already passed via meta?.context
      }
    } catch (e) {
      // ignore and proceed with empty builder
    }
    // Add the latest assistant message (which contains tool_calls)
    builder.addAssistantMessage(accumulatedText, undefined, toolCalls)
    const processed = await postMessageProcessing(
      toolCalls,
      builder,
      finalContent,
      abortController,
      useToolApproval.getState ? useToolApproval.getState().approvedTools : {},
      undefined,
      false
    )

    console.log('Processed tool calls: ', processed)

    // After tools run, ask the model again so it can incorporate tool outputs.
    // Small loop to allow multiple tool->model cycles (bounded to avoid infinite loops).
    let finalText = accumulatedText
    const MAX_FOLLOWUPS = 3
    for (let i = 0; i < MAX_FOLLOWUPS && !abortController.signal.aborted; i++) {
      const followUp = await sendCompletion(
        thread,
        providerObj,
        builder.getMessages(),
        abortController,
        resolvedTools,
        false,
        {}
      )

      if (!followUp) break

      if (isCompletionResponse(followUp)) {
        const fm = followUp.choices?.[0]?.message as any
        const fText = (fm?.content as string) || ''
        finalText = fText || finalText

        const nextToolCalls = fm?.tool_calls || []
        if (nextToolCalls && nextToolCalls.length > 0) {
          // attach assistant message and run tools
          builder.addAssistantMessage(finalText, undefined, nextToolCalls)
          const followContent = newAssistantThreadContent(thread.id, finalText, { assistant: meta?.assistantName })
          await postMessageProcessing(
            nextToolCalls,
            builder,
            followContent,
            abortController,
            useToolApproval.getState ? useToolApproval.getState().approvedTools : {},
            undefined,
            false
          )
          // continue loop to ask the model again
          continue
        }

        // no more tool calls -> we have final assistant response
        break
      }

      // If followUp is a stream/iterable, gather text then break
      if (Symbol.asyncIterator in Object(followUp)) {
        let acc = ''
        for await (const part of followUp as AsyncIterable<any>) {
          if (part.choices?.[0]?.delta?.content) acc += part.choices[0].delta.content
        }
        finalText = acc || finalText
        break
      }
    }

    console.log('Final assistant text after tools:', finalText)
    return { portId: 'success', output: { text: finalText, meta, raw: completion } }
  }
      console.log("Processing tool calls: ", resolvedTools)
      console.log("Response : " , accumulatedText, completion)
      return { portId: 'success', output: { text: accumulatedText, meta, raw: completion } }
    }

    // Fallback for streaming/iterable responses: collect text
    let acc = ''
    // If it's async iterable
    if (Symbol.asyncIterator in Object(completion)) {
      for await (const part of completion as AsyncIterable<any>) {
        if (part.choices?.[0]?.delta?.content) acc += part.choices[0].delta.content
      }
      console.log("Response : " , acc, completion)
      return { portId: 'success', output: { text: acc, meta, raw: completion } }
    }
    return { portId: 'error', output: { error: 'unknown completion type', meta } }
  } catch (e: any) {
    console.error('[AgentNode] execute error', e)
    return { portId: 'error', output: { error: true, message: String(e) } }
  }
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
