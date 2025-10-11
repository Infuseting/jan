import { create } from 'zustand'
import { ulid } from 'ulidx'
import { useEffect } from 'react'
import { localStorageKey } from '@/constants/localStorage'
import { isPlatformTauri } from '@/lib/platform'
import { getServiceHub, isServiceHubInitialized } from '@/hooks/useServiceHub'

export type Builder = {
  id: string
  // name may be absent when coming from the backend; keep optional
  name?: string
  updated_at: number
}

type BuilderState = {
  builders: Builder[]
  setBuilders: (builders: Builder[]) => void
  addBuilder: (name: string) => Promise<Builder>
  updateBuilder: (id: string, name: string) => Promise<void>
  deleteBuilder: (id: string) => Promise<void>
  deleteBuilderWithThreads: (id: string) => Promise<void>
  getBuilderById: (id: string) => Builder | undefined
}

const STORAGE_KEY = localStorageKey.builderManagement || 'builder-management'

const loadFromStorage = async (): Promise<Builder[]> => {
  try {
    if (isPlatformTauri()) {
      const deadline = Date.now() + 5000
      while (!isServiceHubInitialized() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100))
      }
  const res = await getServiceHub().core().invoke('list_builders')
  const arr = Array.isArray(res) ? res as Array<{ id: string; name?: string; updated_at?: number }> : []
  return arr.map((b) => ({ id: b.id, name: b.name, updated_at: b.updated_at || 0 }))
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed?.builders || []
  } catch (err) {
    console.error('Error loading builders from storage', err)
    return []
  }
}

const saveToStorage = async (builders: Builder[]) => {
  try {
    if (isPlatformTauri()) {
      // call save for each builder metadata (best-effort)
      const deadline = Date.now() + 5000
      while (!isServiceHubInitialized() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100))
      }
      for (const b of builders) {
        try {
          await getServiceHub().core().invoke('client_invoke_log', { message: `save_builder_metadata builder=${b.id} name=${b.name || ''}` })
        } catch (err) {
          // non-fatal logging failure
          console.debug('client_invoke_log failed', err)
        }
        // only include the name in the payload when a non-empty name is present. This avoids
        // overwriting an existing name on the backend with the builder id when the name was
        // missing from the frontend's representation.
        const payload: { builder_id: string; updated_at: number; name?: string } = { builder_id: b.id, updated_at: b.updated_at }
        if (b.name) payload.name = b.name
        await getServiceHub().core().invoke('save_builder_metadata', { payload })
      }
      return
    }
    const data = { builders, version: 0 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (err) {
    console.error('Error saving builders to storage', err)
  }
}

const useBuilderStore = create<BuilderState>()((set, get) => ({
  builders: [],

  setBuilders: (builders) => set({ builders }),

  addBuilder: async (name) => {
    const newBuilder: Builder = {
      id: ulid(),
      name,
      updated_at: Date.now(),
    }
    const updated = [...get().builders, newBuilder]
  set({ builders: updated })
  await saveToStorage(updated)
    return newBuilder
  },

  updateBuilder: async (id, name) => {
    const updated = get().builders.map((b) =>
      b.id === id ? { ...b, name, updated_at: Date.now() } : b
    )
  set({ builders: updated })
  await saveToStorage(updated)
  },

  deleteBuilder: async (id) => {
    const updated = get().builders.filter((b) => b.id !== id)
  set({ builders: updated })
  await saveToStorage(updated)
  },

  deleteBuilderWithThreads: async (id) => {
    const updated = get().builders.filter((b) => b.id !== id)
  set({ builders: updated })
  await saveToStorage(updated)
  },

  getBuilderById: (id) => get().builders.find((b) => b.id === id),
}))

export const useBuilderManagement = () => {
  const store = useBuilderStore()

  // Load builders on mount (use backend when available)
  useEffect(() => {
    (async () => {
      const projects = await loadFromStorage()
      if (projects && projects.length > 0) {
        useBuilderStore.setState({ builders: projects })
      }
    })()
  }, [])

  return store
}

export default useBuilderManagement
