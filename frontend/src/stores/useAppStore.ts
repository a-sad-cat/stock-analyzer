/**
 * 全局状态管理（Zustand）
 */
import { create } from 'zustand'

interface AppState {
  // 侧边栏折叠状态
  collapsed: boolean
  toggleCollapsed: () => void

  // 暗色模式
  darkMode: boolean
  toggleDarkMode: () => void

  // 策略运行状态
  isRunning: boolean
  setIsRunning: (v: boolean) => void

  // 当前查看的股票
  currentStock: string | null
  setCurrentStock: (code: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  collapsed: false,
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),

  darkMode: false,
  toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),

  isRunning: false,
  setIsRunning: (v) => set({ isRunning: v }),

  currentStock: null,
  setCurrentStock: (code) => set({ currentStock: code }),
}))
