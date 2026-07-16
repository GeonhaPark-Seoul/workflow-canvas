import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (name) => readFile(new URL(name, root), 'utf8')

const vercel = JSON.parse(await read('vercel.json'))
const globalRule = vercel.headers?.find((rule) => rule.source === '/(.*)')
assert.ok(globalRule, 'Vercel must apply security headers to every route')
const headers = new Map(globalRule.headers.map(({ key, value }) => [key.toLowerCase(), value]))
const csp = headers.get('content-security-policy') ?? ''
for (const directive of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'none'"]) {
  assert.ok(csp.includes(directive), `CSP directive missing: ${directive}`)
}
assert.equal(headers.get('x-frame-options'), 'DENY')
assert.equal(headers.get('x-content-type-options'), 'nosniff')
assert.equal(headers.get('referrer-policy'), 'no-referrer')
assert.match(headers.get('strict-transport-security') ?? '', /max-age=\d+/)

const mcpServer = await read('mcp/server.js')
assert.match(mcpServer, /Cache-Control', 'no-store, max-age=0'/)
assert.match(mcpServer, /Referrer-Policy', 'no-referrer'/)

const profileClient = await read('src/lib/profiles.js')
assert.match(profileClient, /rpc\('upsert_my_profile'/)
assert.match(profileClient, /rpc\('touch_my_profile'/)
assert.doesNotMatch(profileClient, /from\('profiles'\)\s*\.update/s)

const shareClient = await read('src/lib/shares.js')
assert.doesNotMatch(shareClient, /from\('canvas_shares'\)\.insert/)
assert.doesNotMatch(shareClient, /from\('share_members'\)\s*\.update/s)

const hardening = await read('supabase-security-hardening.sql')
assert.match(hardening, /revoke insert, update, delete on public\.canvas_shares from authenticated/i)
assert.match(hardening, /revoke update, delete on public\.share_members from authenticated/i)

const srcFiles = []
async function collect(url) {
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url)
    if (entry.isDirectory()) await collect(child)
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) srcFiles.push(child)
  }
}
await collect(new URL('src/', root))
for (const file of srcFiles) {
  const source = await readFile(file, 'utf8')
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/, `browser source references a service-role secret: ${file.pathname}`)
}

console.log('Security boundary checks passed')
