'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/lib/api'
import { AuthResponse } from '@/types'
import { Layers, ArrowRight, Sun, Moon } from 'lucide-react'
import { Button, TextInput, PasswordInput, InlineNotification, Tag } from '@carbon/react'
import { useThemeStore } from '@/stores/themeStore'

const FONT = '"IBM Plex Sans Thai", "IBM Plex Sans", "Sarabun", system-ui, sans-serif';

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuthStore()
  const { mode, toggle: toggleTheme } = useThemeStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const response = await authApi.login(username, password) as AuthResponse
      login(response)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Invalid username or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'var(--t-bg)',
        fontFamily: FONT,
      }}
    >
      {/* Background effects */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(ellipse at 30% 0%, rgba(59,130,246,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 100%, rgba(96,165,250,0.04) 0%, transparent 50%)',
          pointerEvents: 'none',
        }}
      />

      {/* Floating orbs for visual interest */}
      <div
        style={{
          position: 'fixed',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)',
          top: '-5%',
          left: '10%',
          filter: 'blur(40px)',
          pointerEvents: 'none',
          animation: 'float 8s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'fixed',
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(96,165,250,0.06) 0%, transparent 70%)',
          bottom: '10%',
          right: '15%',
          filter: 'blur(30px)',
          pointerEvents: 'none',
          animation: 'float 10s ease-in-out infinite reverse',
        }}
      />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Theme toggle */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 10 }}>
        <Button
          kind="ghost"
          size="md"
          hasIconOnly
          renderIcon={mode === 'dark' ? Sun : Moon}
          iconDescription={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          tooltipPosition="left"
          onClick={toggleTheme}
        />
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: 400, animation: 'slideUp 0.5s ease-out' }}>
        {/* Logo Section - outside card */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: 'linear-gradient(135deg, #0f62fe, #0f62fe)',
              borderRadius: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(59,130,246,0.25)',
            }}
          >
            <Layers style={{ width: 26, height: 26, color: '#FFFFFF' }} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>
              Orch
            </h1>
            <Tag type="blue" size="sm">BETA</Tag>
          </div>
          {/* removed tagline */}
        </div>

        {/* Main Card */}
        <div
          style={{
            background: 'var(--t-panel)',
            border: '1px solid var(--t-border)',
            borderRadius: 14,
            padding: '32px 28px',
            boxShadow: '0 4px 24px var(--t-shadow)',
          }}
        >
          {/* Error Message */}
          {error && (
            <InlineNotification
              kind="error"
              lowContrast
              hideCloseButton
              title={error}
              style={{ marginBottom: 20, maxWidth: '100%' }}
            />
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <TextInput
                id="login-username"
                labelText="Username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
                required
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <PasswordInput
                id="login-password"
                labelText="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onTogglePasswordVisibility={() => setShowPassword(!showPassword)}
                placeholder="Enter password"
                showPasswordLabel="Show password"
                hidePasswordLabel="Hide password"
                required
              />
            </div>

            <Button
              type="submit"
              kind="primary"
              size="lg"
              disabled={isLoading}
              renderIcon={isLoading ? undefined : ArrowRight}
              style={{ width: '100%', maxWidth: '100%' }}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </div>

        {/* removed footer hint */}
      </div>
    </div>
  )
}
