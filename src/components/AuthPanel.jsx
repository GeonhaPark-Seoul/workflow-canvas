import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { upsertMyProfile } from '../lib/profiles'

const GLYPH_COLORS = ['#8b94a7', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4']

// Small circular avatar: glyph letter (or a generic bust icon) inside a
// colored ring. `online === false` dims it (grayscale/40% opacity) — used
// for offline shared-user avatars and pending email invites.
export function Avatar({ profile, size = 26, online, opacityOffState = true }) {
  const color = profile?.color || '#8b94a7'
  const dim = online === false && opacityOffState
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1a1a22', border: `2px solid ${color}`,
    color, fontWeight: 700, fontSize: Math.max(9, size * 0.42), fontFamily: 'inherit', lineHeight: 1,
    filter: dim ? 'grayscale(1)' : 'none', opacity: dim ? 0.4 : 1,
    transition: 'opacity 0.15s, filter 0.15s',
  }
  if (profile?.glyph) return <div style={style}>{profile.glyph}</div>
  return (
    <div style={style}>
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4" fill={color} />
        <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" fill={color} />
      </svg>
    </div>
  )
}

export default function AuthPanel({
  user, syncing, mobile,
  forceOpen, notice,
  myProfile, onProfileSaved,
  lodThreshold = 0.55, onChangeLodThreshold,
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  // Profile editor local state
  const [glyphInput, setGlyphInput] = useState('')
  const [colorInput, setColorInput] = useState(GLYPH_COLORS[0])
  const [nicknameInput, setNicknameInput] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  const reset = () => { setError(null); setMessage(null) }

  // Share-link login gate: App sets forceOpen when a logged-out visitor
  // follows a #share=<token> link.
  useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])

  // Sync the editor fields whenever the popover opens or the loaded profile changes.
  useEffect(() => {
    setGlyphInput(myProfile?.glyph ?? '')
    setColorInput(myProfile?.color ?? GLYPH_COLORS[0])
    setNicknameInput(myProfile?.nickname ?? '')
  }, [myProfile, open])

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

  const handleSaveProfile = async () => {
    setProfileSaving(true)
    try {
      const saved = await upsertMyProfile({ nickname: nicknameInput.trim() || null, glyph: glyphInput, color: colorInput })
      onProfileSaved?.(saved)
    } catch (err) {
      console.error('[profile] save:', err.message)
    }
    setProfileSaving(false)
  }

  const emailLocalPart = user?.email?.split('@')[0] ?? ''
  const displayName = myProfile?.nickname || emailLocalPart || '사용자'

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: mobile ? 56 : 20, right: 20, zIndex: 10 }}
    >
      {open && (
        <div style={{
          position: 'absolute', top: 46, right: 0,
          width: 272, maxHeight: '80vh', overflowY: 'auto',
          background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 12,
          padding: '16px', boxShadow: '0 8px 32px #000c',
        }}>
          {user ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <Avatar profile={{ glyph: glyphInput || null, color: colorInput }} size={40} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: '#ddd', fontWeight: 600, wordBreak: 'break-all' }}>{user.email}</div>
                  <div style={{ fontSize: 11, color: syncing ? '#f59e0b' : '#22c55e' }}>
                    {syncing ? '● 저장 중...' : '● 클라우드 동기화됨'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>아바타 아이콘</div>
              <input
                value={glyphInput}
                onChange={(e) => {
                  const c = e.target.value.slice(-1).toUpperCase()
                  setGlyphInput(/^[A-Z0-9]$/.test(c) ? c : '')
                }}
                maxLength={1}
                placeholder="기본 아이콘"
                style={{ ...inputStyle, width: 64, textAlign: 'center', marginBottom: 10 }}
              />

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                {GLYPH_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColorInput(c)}
                    title={c}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: colorInput === c ? '2px solid #fff' : '2px solid transparent',
                      boxSizing: 'border-box', padding: 0,
                    }}
                  />
                ))}
              </div>

              <div style={{ fontSize: 11, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>닉네임</div>
              <input
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder={emailLocalPart}
                style={{ ...inputStyle, marginBottom: 10 }}
              />
              <button onClick={handleSaveProfile} disabled={profileSaving} style={fillBtn('#3b82f6')}>
                {profileSaving ? '...' : '저장'}
              </button>

              <div style={{ height: 1, background: '#ffffff18', margin: '14px 0' }} />

              <div style={{ fontSize: 11, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>캔버스 설정</div>
              <div style={{ color: '#ccc', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>카드 내용 숨김 시점</div>
              <input
                type="range"
                min="0"
                max="0.9"
                step="0.05"
                value={lodThreshold}
                onChange={(e) => onChangeLodThreshold?.(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, marginBottom: 16 }}>
                <span style={{ color: '#555', fontSize: 10 }}>항상 표시</span>
                <span style={{ color: '#555', fontSize: 10 }}>빨리 숨김</span>
              </div>

              <button onClick={handleLogout} style={outlineBtn('#ef4444')}>로그아웃</button>
            </>
          ) : (
            <>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
                {mode === 'login' ? '로그인' : '회원가입'}
              </div>
              {notice && (
                <div style={{ fontSize: 12, color: '#6ea8fe', background: '#3b82f611', border: '1px solid #3b82f633', borderRadius: 6, padding: '8px 10px', marginBottom: 10 }}>
                  {notice}
                </div>
              )}
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
          borderRadius: 20, padding: user ? '5px 12px 5px 5px' : '7px 14px',
          color: user ? '#22c55e' : '#888',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          boxShadow: '0 4px 16px #0008', fontFamily: 'inherit',
          transition: 'border-color 0.2s, color 0.2s',
        }}
      >
        {user ? (
          <>
            <Avatar profile={myProfile} size={22} />
            {!mobile && (
              <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: 10 }}>○</span>
            <span>로그인</span>
          </>
        )}
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
