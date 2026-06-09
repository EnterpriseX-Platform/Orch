'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/lib/api'
import { AuthResponse } from '@/types'
import { Layers, AlertCircle, Eye, EyeOff, ArrowRight, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'

const FONT = "'Prompt', sans-serif";

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
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .login-input:focus {
          border-color: #3B82F6 !important;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12) !important;
        }
        .login-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(59,130,246,0.35) !important;
        }
        .login-btn:active:not(:disabled) {
          transform: translateY(0);
        }
      `}</style>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        style={{
          position: 'fixed',
          top: 20,
          right: 20,
          width: 38,
          height: 38,
          borderRadius: 10,
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          color: 'var(--t-text-secondary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          zIndex: 10,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--t-panel-hover)'
          e.currentTarget.style.color = 'var(--t-text)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--t-panel)'
          e.currentTarget.style.color = 'var(--t-text-secondary)'
        }}
        title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {mode === 'dark'
          ? <Sun style={{ width: 18, height: 18 }} />
          : <Moon style={{ width: 18, height: 18 }} />
        }
      </button>

      <div style={{ position: 'relative', width: '100%', maxWidth: 400, animation: 'slideUp 0.5s ease-out' }}>
        {/* Logo Section - outside card */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              background: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
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
            <span
              style={{
                padding: '2px 7px',
                fontSize: 9,
                background: 'rgba(59,130,246,0.1)',
                color: '#60A5FA',
                borderRadius: 5,
                fontWeight: 600,
                border: '1px solid rgba(59,130,246,0.2)',
              }}
            >
              BETA
            </span>
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 10,
                marginBottom: 20,
              }}
            >
              <AlertCircle style={{ width: 16, height: 16, color: '#F87171', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#F87171' }}>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit}>
            {/* Username Field */}
            <div style={{ marginBottom: 16 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--t-text-secondary)',
                  marginBottom: 6,
                  fontWeight: 500,
                }}
              >
                Username
              </label>
              <input
                className="login-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'var(--t-input)',
                  border: '1px solid var(--t-border)',
                  borderRadius: 8,
                  fontSize: 14,
                  color: 'var(--t-text)',
                  fontFamily: FONT,
                  outline: 'none',
                  transition: 'all 0.2s ease',
                }}
                required
              />
            </div>

            {/* Password Field */}
            <div style={{ marginBottom: 24 }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--t-text-secondary)',
                  marginBottom: 6,
                  fontWeight: 500,
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  className="login-input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  style={{
                    width: '100%',
                    padding: '10px 40px 10px 14px',
                    background: 'var(--t-input)',
                    border: '1px solid var(--t-border)',
                    borderRadius: 8,
                    fontSize: 14,
                    color: 'var(--t-text)',
                    fontFamily: FONT,
                    outline: 'none',
                    transition: 'all 0.2s ease',
                  }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 2,
                    color: 'var(--t-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--t-text-secondary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--t-text-muted)' }}
                >
                  {showPassword
                    ? <EyeOff style={{ width: 16, height: 16 }} />
                    : <Eye style={{ width: 16, height: 16 }} />
                  }
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              className="login-btn"
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '11px 0',
                background: isLoading
                  ? 'rgba(59,130,246,0.5)'
                  : 'linear-gradient(135deg, #3B82F6, #2563EB)',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: '#FFFFFF',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontFamily: FONT,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 14px rgba(59,130,246,0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isLoading ? 'Signing in...' : (
                <>
                  Sign In
                  <ArrowRight style={{ width: 16, height: 16 }} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* removed footer hint */}
      </div>
    </div>
  )
}
