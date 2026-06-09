import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark'

interface ThemeState {
  mode: ThemeMode
  toggle: () => void
  setMode: (mode: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      toggle: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'theme-storage',
      partialize: (state) => ({ mode: state.mode }),
    }
  )
)

// Theme color definitions
export const themes = {
  dark: {
    bg: '#0F1117',
    panel: '#1A1D28',
    panelHover: '#1E2132',
    border: '#232736',
    borderLight: '#1D2130',
    text: { primary: '#E2E8F0', secondary: '#8B92A5', muted: '#5A6178' },
    accent: '#3B82F6',
    accentHover: '#2563EB',
    accentLight: '#60A5FA',
    input: '#151821',
    header: '#12141D',
    sidebar: '#0B0D14',
    cardHover: '#252836',
  },
  light: {
    bg: '#F5F7FA',
    panel: '#FFFFFF',
    panelHover: '#F8FAFC',
    border: '#E2E8F0',
    borderLight: '#EEF2F7',
    text: { primary: '#1E293B', secondary: '#64748B', muted: '#94A3B8' },
    accent: '#3B82F6',
    accentHover: '#2563EB',
    accentLight: '#60A5FA',
    input: '#F1F5F9',
    header: '#FFFFFF',
    sidebar: '#FAFBFC',
    cardHover: '#F1F5F9',
  },
} as const

export type ThemeColors = (typeof themes)[keyof typeof themes]

export function useThemeColors(): ThemeColors {
  const mode = useThemeStore((s) => s.mode)
  return themes[mode]
}
