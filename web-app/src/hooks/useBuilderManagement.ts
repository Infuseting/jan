import { create } from 'zustand'
import { ulid } from 'ulidx'
import { useEffect } from 'react'
import { localStorageKey } from '@/constants/localStorage'

export type Builder = {
  id: string
  name: string
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

const loadFromStorage = (): Builder[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return parsed?.builders || []
  } catch (err) {
    console.error('Error loading builders from storage', err)
    return []
  }
}

const saveToStorage = (builders: Builder[]) => {
  try {
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
    saveToStorage(updated)
    return newBuilder
  },

  updateBuilder: async (id, name) => {
    const updated = get().builders.map((b) =>
      b.id === id ? { ...b, name, updated_at: Date.now() } : b
    )
    set({ builders: updated })
    saveToStorage(updated)
  },

  deleteBuilder: async (id) => {
    const updated = get().builders.filter((b) => b.id !== id)
    set({ builders: updated })
    saveToStorage(updated)
  },

  deleteBuilderWithThreads: async (id) => {
    const updated = get().builders.filter((b) => b.id !== id)
    set({ builders: updated })
    saveToStorage(updated)
  },

  getBuilderById: (id) => get().builders.find((b) => b.id === id),
}))

export const useBuilderManagement = () => {
  const store = useBuilderStore()

  // Load builders from localStorage on mount
  useEffect(() => {
    const projects = loadFromStorage()
    if (projects && projects.length > 0) {
      useBuilderStore.setState({ builders: projects })
    }
  }, [])

  return store
}

export default useBuilderManagement
