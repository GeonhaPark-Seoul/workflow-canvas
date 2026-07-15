import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'))
}

function fail(message) {
  throw new Error(`Governance check failed: ${message}`)
}

const [pkg, lock, registry, notices] = await Promise.all([
  readJson('package.json'),
  readJson('package-lock.json'),
  readJson('docs/architecture/dependency-registry.json'),
  fs.readFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), 'utf8'),
])

if (registry.schemaVersion !== 1 || !Array.isArray(registry.dependencies)) {
  fail('unsupported dependency registry schema')
}

const declared = [
  ...Object.entries(pkg.dependencies ?? {}).map(([name, requestedRange]) => ({ name, requestedRange, scope: 'runtime' })),
  ...Object.entries(pkg.devDependencies ?? {}).map(([name, requestedRange]) => ({ name, requestedRange, scope: 'development' })),
]
const registered = new Map()
for (const entry of registry.dependencies) {
  if (!entry?.name || registered.has(entry.name)) fail(`missing or duplicate registry entry: ${entry?.name ?? '(empty)'}`)
  registered.set(entry.name, entry)
}

for (const dependency of declared) {
  const entry = registered.get(dependency.name)
  if (!entry) fail(`direct dependency is not registered: ${dependency.name}`)
  if (entry.status !== 'approved-existing') fail(`direct dependency is not approved: ${dependency.name}`)
  if (entry.scope !== dependency.scope) fail(`scope mismatch for ${dependency.name}`)
  if (entry.requestedRange !== dependency.requestedRange) fail(`requested range mismatch for ${dependency.name}`)

  const locked = lock.packages?.[`node_modules/${dependency.name}`]
  if (!locked?.version) fail(`locked package metadata is missing for ${dependency.name}`)
  if (entry.lockedVersion !== locked.version) fail(`locked version mismatch for ${dependency.name}`)
  if (entry.license !== locked.license) fail(`locked license mismatch for ${dependency.name}`)
  if (!registry.allowedLicenses?.includes(entry.license)) fail(`license is not allowlisted for ${dependency.name}: ${entry.license}`)

  const noticeRowStart = `| \`${dependency.name}\` | \`${entry.lockedVersion}\` |`
  if (!notices.includes(noticeRowStart)) fail(`third-party notice is missing for ${dependency.name}`)
}

const declaredNames = new Set(declared.map((item) => item.name))
for (const name of registered.keys()) {
  if (!declaredNames.has(name)) fail(`registry contains a dependency that package.json does not declare: ${name}`)
}

if (!pkg.scripts?.test?.includes('governance:check')) fail('npm test does not enforce governance:check')
if (!pkg.scripts?.build?.includes('governance:check')) fail('npm run build does not enforce governance:check')

console.log(`Governance check passed (${declared.length} direct dependencies, ${registry.exceptions?.length ?? 0} exceptions).`)
