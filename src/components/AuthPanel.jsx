import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AuthPanel({ user, syncing, mobile }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const reset = () => { setError(null); setMessage(null) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    reset()
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else setOpen(false)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else { setMessage('확인 이메일을 전송했습니다. 이메일을 확인해주세요.'); setMode('login') }
    }
    setLoading(false)
  }

  const handleGoogle = async () => {
    // Google provider must be enabled in Supabase Dashboard → Authentication → Providers
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setOpen(false)
  }

  const displayName = user?.email?.split('@')[0] ?? '사용자'

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: mobile ? 56 : 20, right: 20, zIndex: 10 }}
    >
      {open && (
        <div style={{
          position: 'absolute', top: 46, right: 0,
          width: 272,
          background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 12,
          padding: '16px', boxShadow: '0 8px 32px #000c',
        }}>
          {user ? (
            <>
              <div style={{ fontSize: 11, color: '#555', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>로그인됨</div>
              <div style={{ fontSize: 13, color: '#ddd', fontWeight: 600, marginBottom: 4, wordBreak: 'break-all' }}>
                {user.email}
              </div>
              <div style={{ fontSize: 11, color: syncing ? '#f59e0b' : '#22c55e', marginBottom: 14 }}>
                {syncing ? '● 저장 중...' : '● 클라우드 동기화됨'}
              </div>
              <button onClick={handleLogout} style={outlineBtn('#ef4444')}>로그아웃</button>
            </>
          ) : (
            <>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
                {mode === 'login' ? '로그인' : '회원가입'}
              </div>
              {message && (
                <div style={{ fontSize: 12, color: '#22c55e', background: '#22c55e11', border: '1px solid #22c55e33', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                  {message}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <input
                  type="email" placeholder="이메일" value={email}
                  onChange={(e) => setEmail(e.target.value)} required
                  style={inputStyle}
                />
                <input
                  type="password" placeholder="비밀번호 (6자 이상)" value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={6}
                  style={inputStyle}
                />
                {error && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 8 }}>{error}</div>
                )}
                <button type="submit" disabled={loading} style={fillBtn('#3b82f6')}>
                  {loading ? '...' : (mode === 'login' ? '로그인' : '회원가입')}
                </button>
              </form>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#ffffff18' }} />
                <span style={{ fontSize: 11, color: '#444' }}>또는</span>
                <div style={{ flex: 1, height: 1, background: '#ffffff18' }} />
              </div>
              <button onClick={handleGoogle} style={fillBtn('#ffffff14', '#ddd')}>
                <span style={{ fontSize: 14 }}>G</span>  Google로 계속하기
              </button>
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => { setMode((m) => (m === 'login' ? 'signup' : 'login')); reset() }}
                  style={{ background: 'transparent', border: 'none', color: '#6ea8fe', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {mode === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#1a1a22', border: `1px solid ${user ? '#22c55e44' : '#ffffff18'}`,
          borderRadius: 20, padding: '7px 14px',
          color: user ? '#22c55e' : '#888',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 16px #0008', fontFamily: 'inherit',
          transition: 'border-color 0.2s, color 0.2s',
        }}
      >
        <span style={{ fontSize: 10 }}>{user ? '●' : '○'}</span>
        <span>{user ? displayName : '로그인'}</span>
      </button>
    </div>
  )
}

const inputStyle = {
  display: 'block', width: '100%', boxSizing: 'border-box',
  background: '#12121a', border: '1px solid #ffffff22', borderRadius: 6,
  color: '#f0f0f0', fontSize: 13, padding: '8px 10px',
  outline: 'none', fontFamily: 'inherit', marginBottom: 8,
}

const fillBtn = (bg, color = '#fff') => ({
  width: '100%', background: bg, border: 'none', borderRadius: 6,
  color, fontSize: 13, fontWeight: 600, padding: '9px 0',
  cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
  alignItems: 'center', justifyContent: 'center', gap: 8,
})

const outlineBtn = (color) => ({
  width: '100%', background: 'transparent', border: `1px solid ${color}55`,
  borderRadius: 6, color, fontSize: 13, fontWeight: 600, padding: '9px 0',
  cursor: 'pointer', fontFamily: 'inherit',
})
