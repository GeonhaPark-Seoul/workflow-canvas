const LOCK_PREFIX = 'workflow-canvas-share-v1:'
const FALLBACK_TTL_MS = 15 * 60 * 1000

export function shareTokenFingerprint(token) {
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (const char of String(token ?? '')) {
    const code = char.charCodeAt(0)
    left = Math.imul(left ^ code, 0x01000193) >>> 0
    right = Math.imul(right ^ code, 0x85ebca6b) >>> 0
  }
  return `${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`
}

export function claimShareLaunchFallback(token, {
  storage = globalThis.localStorage,
  now = Date.now(),
  ownerId = globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random()}`,
  ttlMs = FALLBACK_TTL_MS,
} = {}) {
  if (!storage) return { release() {} }
  const key = `${LOCK_PREFIX}${shareTokenFingerprint(token)}`
  try {
    const current = JSON.parse(storage.getItem(key) || 'null')
    if (current?.ownerId && current.ownerId !== ownerId && current.expiresAt > now) return null
    storage.setItem(key, JSON.stringify({ ownerId, expiresAt: now + ttlMs }))
    const claimed = JSON.parse(storage.getItem(key) || 'null')
    if (claimed?.ownerId !== ownerId) return null
    return {
      release() {
        try {
          const latest = JSON.parse(storage.getItem(key) || 'null')
          if (latest?.ownerId === ownerId) storage.removeItem(key)
        } catch {
          // Storage can disappear in private browsing; expiry remains the fallback.
        }
      },
    }
  } catch {
    return { release() {} }
  }
}

export async function claimShareLaunch(token, options = {}) {
  const locks = options.locks ?? globalThis.navigator?.locks
  if (!locks?.request) return claimShareLaunchFallback(token, options)
  const name = `${LOCK_PREFIX}${shareTokenFingerprint(token)}`
  return new Promise((resolve) => {
    let settled = false
    locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) {
        settled = true
        resolve(null)
        return
      }
      let releaseLock
      const released = new Promise((release) => { releaseLock = release })
      settled = true
      resolve({ release: releaseLock })
      await released
    }).catch(() => {
      if (!settled) resolve(claimShareLaunchFallback(token, options))
    })
  })
}
