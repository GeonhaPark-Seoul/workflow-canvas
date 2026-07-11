import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { upsertMyProfile, saveMySettings } from '../lib/profiles'
import { listMyTokens, createToken, deleteToken } from '../lib/mcpTokens'

const MCP_CONNECTOR_URL = 'https://workflow-canvas-orpin.vercel.app/api/mcp?token='

const GLYPH_COLORS = ['#8b94a7', '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4']

// Selectable glyph options: '' = 기본 (bust icon, glyph null), then A–Z, then 0–9.
const GLYPH_OPTIONS = [
  '',
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 10 }, (_, i) => String(i)),
]

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
  onSettingsChange = () => {},
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

  // Unified canvas settings (theme, node fill, LOD threshold): persisted to
  // my profile row, debounced.
  const [settings, setSettings] = useState({ theme: 'dark', nodeFill: true, lodThreshold })
  const settingsTimerRef = useRef(null)
  const updateSettings = (patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      onSettingsChange(next)
      if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current)
      settingsTimerRef.current = setTimeout(() => {
        saveMySettings(next).catch((err) => console.error('[settings] save:', err.message))
      }, 400)
      return next
    })
  }

  // MCP token list state
  const [tokens, setTokens] = useState(null) // null = not loaded yet
  const [tokensLoading, setTokensLoading] = useState(false)
  const [tokensError, setTokensError] = useState(null)
  const [tokenCreating, setTokenCreating] = useState(false)
  const [copiedToken, setCopiedToken] = useState(null)

  const reset = () => { setError(null); setMessage(null) }

  const loadTokens = async () => {
    setTokensLoading(true)
    setTokensError(null)
    try {
      setTokens(await listMyTokens())
    } catch (err) {
      setTokensError(err.message)
    }
    setTokensLoading(false)
  }

  const handleCreateToken = async () => {
    setTokenCreating(true)
    try {
      const row = await createToken(`클로드 ${new Date().toLocaleDateString('ko-KR')}`)
      setTokens((prev) => [row, ...(prev ?? [])])
    } catch (err) {
      setTokensError(err.message)
    }
    setTokenCreating(false)
  }

  const handleDeleteToken = async (token) => {
    if (!window.confirm('이 토큰을 삭제할까요? 이 토큰을 사용하는 AI 연결이 즉시 끊어집니다.')) return
    try {
      await deleteToken(token)
      setTokens((prev) => (prev ?? []).filter((t) => t.token !== token))
    } catch (err) {
      setTokensError(err.message)
    }
  }

  const handleCopyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(MCP_CONNECTOR_URL + token)
      setCopiedToken(token)
      setTimeout(() => setCopiedToken((c) => (c === token ? null : c)), 1500)
    } catch (err) {
      console.error('[mcpTokens] copy:', err.message)
    }
  }

  // Close the popover on outside click / Escape.
  const panelRef = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Share-link login gate: App sets forceOpen when a logged-out visitor
  // follows a #share=<token> link.
  useEffect(() => { if (forceOpen) setOpen(true) }, [forceOpen])

  // Sync the editor fields whenever the popover opens or the loaded profile changes.
  useEffect(() => {
    setGlyphInput(myProfile?.glyph ?? '')
    setColorInput(myProfile?.color ?? GLYPH_COLORS[0])
    setNicknameInput(myProfile?.nickname ?? '')
  }, [myProfile, open])

  useEffect(() => {
    setSettings({
      theme: myProfile?.settings?.theme ?? 'dark',
      nodeFill: myProfile?.settings?.nodeFill ?? true,
      lodThreshold: myProfile?.settings?.lodThreshold ?? lodThreshold,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myProfile, open])

  // Lazily load MCP tokens the first time the popover opens.
  useEffect(() => {
    if (open && user && tokens === null && !tokensLoading) loadTokens()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user])

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
      ref={panelRef}
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
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', justifyItems: 'center',
                gap: 6, maxHeight: 150, overflowY: 'auto', marginBottom: 10, padding: 2,
              }}>
                {GLYPH_OPTIONS.map((g) => (
                  <button
                    key={g || '__default'}
                    type="button"
                    onClick={() => setGlyphInput(g)}
                    title={g || '기본'}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', flexShrink: 0, boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: '#12121a',
                      border: glyphInput === g ? '2px solid #fff' : '1px solid #ffffff22',
                      color: '#ccc', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: 0,
                    }}
                  >
                    {g ? g : (
                      <svg width={13} height={13} viewBox="0 0 24 24">
                        <circle cx="12" cy="8" r="4" fill="#ccc" />
                        <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" fill="#ccc" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

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

              <div style={{ fontSize: 11, color: '#555', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>설정</div>

              <div style={{ color: '#ccc', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>테마</div>
              <div style={{ display: 'flex', border: '1px solid #ffffff22', borderRadius: 6, overflow: 'hidden', marginBottom: 14 }}>
                <button type="button" onClick={() => updateSettings({ theme: 'dark' })} style={segBtn(settings.theme !== 'light')}>다크</button>
                <button type="button" onClick={() => updateSettings({ theme: 'light' })} style={segBtn(settings.theme === 'light')}>화이트</button>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.nodeFill}
                  onChange={(e) => updateSettings({ nodeFill: e.target.checked })}
                  style={{ accentColor: '#3b82f6', cursor: 'pointer' }}
                />
                <span style={{ color: '#ccc', fontSize: 12, fontWeight: 600 }}>노드 색 채움</span>
              </label>

              <div style={{ color: '#ccc', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>카드 내용 숨김 시점</div>
              <input
                type="range"
                min="0"
                max="0.9"
                step="0.05"
                value={settings.lodThreshold}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  onChangeLodThreshold?.(v)
                  updateSettings({ lodThreshold: v })
                }}
                style={{ width: '100%', accentColor: '#a855f7', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, marginBottom: 16 }}>
                <span style={{ color: '#555', fontSize: 10 }}>항상 표시</span>
                <span style={{ color: '#555', fontSize: 10 }}>빨리 숨김</span>
              </div>

              <div style={{ height: 1, background: '#ffffff18', margin: '14px 0' }} />

              <div style={{ fontSize: 11, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>🤖 MCP 연결</div>
              <div style={{ color: '#999', fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
                클로드 등 AI가 내 캔버스를 직접 읽고 편집할 수 있게 하는 개인 토큰입니다.<br />
                토큰은 비밀번호처럼 다루세요.
              </div>

              {tokensLoading && <div style={{ color: '#555', fontSize: 12, marginBottom: 8 }}>불러오는 중...</div>}
              {tokensError && (
                <div style={{ fontSize: 11, color: '#ef4444', lineHeight: 1.5, marginBottom: 8 }}>
                  토큰을 불러올 권한이 없습니다. supabase-mcp-schema.sql의 self-service 정책을 Supabase에서 실행했는지 확인하세요.
                </div>
              )}

              {!tokensLoading && tokens && tokens.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {tokens.map((t) => (
                    <div key={t.token} style={{
                      background: '#12121a', border: '1px solid #ffffff18', borderRadius: 6,
                      padding: '8px 10px', marginBottom: 6,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                        <span style={{ color: '#ddd', fontSize: 12, fontWeight: 600 }}>{t.label || '토큰'}</span>
                        <span style={{ color: '#555', fontSize: 10 }}>{formatDate(t.created_at)}</span>
                      </div>
                      <div style={{ color: '#777', fontSize: 11, fontFamily: 'monospace', marginBottom: 6 }}>
                        {t.token.slice(0, 6)}…
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleCopyToken(t.token)} style={smallBtn()}>
                          {copiedToken === t.token ? '복사됨!' : '복사'}
                        </button>
                        <button onClick={() => handleDeleteToken(t.token)} style={smallBtn('#ef4444')}>삭제</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!tokensLoading && tokens && tokens.length === 0 && !tokensError && (
                <div style={{ color: '#555', fontSize: 11, marginBottom: 10 }}>아직 만든 토큰이 없습니다.</div>
              )}

              <button onClick={handleCreateToken} disabled={tokenCreating} style={outlineBtn('#3b82f6')}>
                {tokenCreating ? '만드는 중...' : '+ 새 토큰 만들기'}
              </button>
              <div style={{ color: '#555', fontSize: 10, lineHeight: 1.5, marginTop: 8, marginBottom: 14 }}>
                복사한 URL을 claude.ai → 설정 → 커넥터 → 커스텀 커넥터 추가에 붙여넣으면 채팅에서 캔버스를 조작할 수 있습니다.
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

const segBtn = (active) => ({
  flex: 1, background: active ? '#3b82f622' : 'transparent', border: 'none',
  color: active ? '#3b82f6' : '#888', fontSize: 12, fontWeight: 600, padding: '7px 0',
  cursor: 'pointer', fontFamily: 'inherit',
})

const smallBtn = (color = '#8b94a7') => ({
  background: 'transparent', border: `1px solid ${color}55`, borderRadius: 4,
  color, fontSize: 11, fontWeight: 600, padding: '4px 8px',
  cursor: 'pointer', fontFamily: 'inherit',
})

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
