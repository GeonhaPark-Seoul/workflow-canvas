import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')
const [cloud, app, shares, store, shareAccess, summaries, viteConfig] = await Promise.all([
  read('src/lib/cloudStorage.js'),
  read('src/App.jsx'),
  read('src/lib/shares.js'),
  read('mcp/store.js'),
  read('mcp/shareAccess.js'),
  read('mcp/canvasSummaries.js'),
  read('vite.config.js'),
])

assert.match(cloud, /function loadCanvasSummaries\(userId\)/)
assert.match(cloud, /select\('canvas_id, name, updated_at'\)/)
assert.match(cloud, /\.range\(from, from \+ pageSize - 1\)/)
assert.doesNotMatch(cloud, /function loadAllCanvases/)

assert.match(app, /cloudLoadCanvasSummaries\(userId\)/)
assert.match(app, /const activeRow = await cloudLoadCanvasRow\(userId, activeId\)/)
assert.doesNotMatch(app, /rows\.forEach\(\(r\) => saveCanvasData/)
assert.match(app, /Inactive canvases stay metadata-only/)
assert.match(app, /loadId !== canvasLoadRequestRef\.current/)

assert.match(shares, /\.range\(from, from \+ pageSize - 1\)/)
assert.match(shares, /offset < shareIds\.length; offset \+= 150/)
assert.match(shares, /function listOwnedSharedCanvasIds\(\)/)
assert.match(app, /listOwnedSharedCanvasIds\(\)/)
assert.doesNotMatch(app, /from\('canvas_shares'\)/)
assert.match(shareAccess, /Resolve the viewer's membership IDs/)
assert.match(shareAccess, /\.range\(from, from \+ pageSize - 1\)/)
assert.doesNotMatch(store, /async function mySharesFor/)
assert.doesNotMatch(store, /select\('canvas_id, name, nodes, edges, updated_at'\)/)
assert.match(summaries, /get_canvas_summaries/)
assert.match(summaries, /metadata-only fallback/)
assert.match(viteConfig, /globIgnores:\s*\['\*\*\/workflowSystemTwinAdapter-\*\.js'\]/)
assert.doesNotMatch(viteConfig, /maximumFileSizeToCacheInBytes/)

console.log('Performance boundary checks passed')
