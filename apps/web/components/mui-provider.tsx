'use client'

import { useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme } from '@/lib/theme'
import { CacheProvider } from '@emotion/react'
import createCache from '@emotion/cache'

// Client-side emotion cache
const createEmotionCache = () => {
  return createCache({ key: 'mui', prepend: true })
}

export function MuiProvider({ children }: { children: React.ReactNode }) {
  const [emotionCache] = useState(() => createEmotionCache())

  return (
    <CacheProvider value={emotionCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </CacheProvider>
  )
}
