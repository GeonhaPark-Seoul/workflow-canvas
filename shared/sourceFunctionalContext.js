import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'

export const SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION = 1
export const SOURCE_FUNCTIONAL_CONTEXT_MANIFEST_PATH = 'shared/sourceFunctionalContextManifest.js'

export const SOURCE_FUNCTIONAL_CONTEXT_LIMITS = Object.freeze({
  documents: 16,
  documentCharacters: 200_000,
  termsPerDocument: 16,
  vocabularyTerms: 64,
  evidencePerTerm: 6,
})

const SOURCE_KIND_PRIORITY = Object.freeze({
  'document-heading': 88,
  'document-list': 65,
  'document-table': 50,
  'feature-model': 84,
  'profile-area': 80,
  'profile-subsystem': 78,
  'ui-text': 76,
  'screen-path': 72,
  'api-route': 68,
  database: 64,
  'static-flow': 60,
  test: 56,
})

const GENERIC_TERMS = new Set([
  '목차', '개요', '소개', '현재 상태', '변경 이력', '용어 설명', '참고', '테스트',
  'contents', 'overview', 'introduction', 'current status', 'changelog', 'change history',
  'glossary', 'reference', 'references', 'tests',
])

const MARKDOWN_PATH_PATTERN = /(?:^|\/)[^/]+\.mdx?$/i
const PLANNING_PATH_PATTERN = /(?:^|\/)(?:project[_-]?master|master|plan|planning|prd|product|roadmap|spec|design|architecture|functional[_-]?context|기획)(?:[._-]|$)/i
const README_PATH_PATTERN = /(?:^|\/)readme(?:[._-][^/]*)?\.mdx?$/i
const AI_INSTRUCTION_PATH_PATTERN = /(?:^|\/)(?:agents|claude|ai[_-]?master)(?:[._-][^/]*)?\.mdx?$/i
const SENSITIVE_VALUE_PATTERN = /(?:\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,}|(?:sk|ghp|github_pat|xox[baprs])[-_A-Za-z0-9]{12,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,})/

function compareText(left, right) {
  const leftText = String(left ?? '')
  const rightText = String(right ?? '')
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function compactText(value, maximum = 160) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function cleanFunctionalPhrase(value, { allowPath = false } = {}) {
  let phrase = String(value ?? '')
    .replace(/!\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_~]/g, '')
    .replace(/^\s*(?:[-+*]|\d+[.)]|[A-Za-z][.)])\s+/, '')
    .replace(/^\s*\[[ xX]\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!phrase || SENSITIVE_VALUE_PATTERN.test(phrase)) return ''
  if (!allowPath && /^(?:https?:\/\/|[A-Za-z]:\\|\/{2})/.test(phrase)) return ''
  if (!allowPath && phrase.includes('=') && /[A-Za-z0-9+/=_-]{16,}/.test(phrase)) return ''
  if (phrase.length > 80) {
    const leading = phrase.split(/\s+(?:→|->|—|–)\s+|:\s+/)[0]?.trim()
    if (!leading || leading.length < 2 || leading.length > 80) return ''
    phrase = leading
  }
  if (
    phrase.length < 2
    || !/\p{L}/u.test(phrase)
    || /^(?:v?\d+(?:\.\d+){1,3}(?:-[\w.]+)?(?:\s*\([^)]*\))?|\d{4}-\d{2}-\d{2})$/i.test(phrase)
  ) return ''
  const normalized = normalizeFunctionalPhrase(phrase)
  if (!normalized || GENERIC_TERMS.has(normalized)) return ''
  return compactText(phrase, 120)
}

function normalizeFunctionalPhrase(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase()
}

function phraseTokens(value) {
  return new Set(normalizeFunctionalPhrase(value).split(' ').filter((item) => item.length >= 2))
}

function documentKind(path) {
  if (README_PATH_PATTERN.test(path)) return 'readme'
  if (PLANNING_PATH_PATTERN.test(path)) return 'planning'
  return 'markdown'
}

function markdownDocuments(files) {
  const entries = files instanceof Map ? [...files.entries()] : Object.entries(files ?? {})
  const candidates = entries
    .filter(([path]) => MARKDOWN_PATH_PATTERN.test(path) && !AI_INSTRUCTION_PATH_PATTERN.test(path))
  const preferred = candidates.filter(([path]) => preferredContextDocument(path))
  return (preferred.length ? preferred : candidates)
    .sort(([left], [right]) => {
      const priority = (path) => README_PATH_PATTERN.test(path)
        ? 0
        : PLANNING_PATH_PATTERN.test(path)
          ? 1
          : 2
      return priority(left) - priority(right) || compareText(left, right)
    })
    .slice(0, SOURCE_FUNCTIONAL_CONTEXT_LIMITS.documents)
}

function preferredContextDocument(path) {
  return ['readme', 'planning'].includes(documentKind(path))
}

function markdownPhrase(kind, path, line, label, fingerprint) {
  const safeLabel = cleanFunctionalPhrase(label)
  if (!safeLabel) return null
  return {
    label: safeLabel,
    normalized: normalizeFunctionalPhrase(safeLabel),
    sourceKind: kind,
    weight: SOURCE_KIND_PRIORITY[kind],
    evidence: [{
      ref: `source:${path}#L${line}`,
      kind,
      fingerprint,
    }],
  }
}

function extractMarkdownPhrases(path, content, fingerprint) {
  const phrases = []
  const seen = new Set()
  const lines = String(content ?? '').slice(0, 96_000).split(/\r?\n/)
  let fenced = false
  const add = (kind, line, value) => {
    const candidate = markdownPhrase(kind, path, line, value, fingerprint)
    if (!candidate || seen.has(candidate.normalized)) return
    seen.add(candidate.normalized)
    phrases.push(candidate)
  }
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]
    if (/^\s*```/.test(raw)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    const heading = raw.match(/^\s{0,3}#{1,4}\s+(.+?)\s*#*\s*$/)
    if (heading) add('document-heading', index + 1, heading[1])
    const list = raw.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/)
    if (list) {
      const label = list[1].split(/\s+(?:→|->|—|–)\s+|:\s+/)[0]
      add('document-list', index + 1, label)
    }
    if (/^\s*\|.*\|\s*$/.test(raw) && !/^\s*\|?(?:\s*:?-+:?\s*\|)+\s*$/.test(raw)) {
      for (const cell of raw.split('|').map((item) => item.trim()).filter(Boolean).slice(0, 3)) {
        add('document-table', index + 1, cell)
      }
    }
    if (phrases.length >= SOURCE_FUNCTIONAL_CONTEXT_LIMITS.termsPerDocument) break
  }
  return phrases
}

function sourceEvidenceFingerprint(manifest, flowCatalog) {
  const documentationIds = new Set((manifest?.entities ?? [])
    .filter((entity) => entity?.layer === 'documentation' || entity?.language === 'markdown')
    .map((entity) => entity.id))
  const entities = (manifest?.entities ?? [])
    .filter((entity) => !documentationIds.has(entity.id))
    .map((entity) => [entity.id, entity.fingerprint ?? '', entity.explanationFingerprint ?? ''])
  const relations = (manifest?.relations ?? [])
    .filter((relation) => !documentationIds.has(relation.source) && !documentationIds.has(relation.target))
    .map((relation) => [relation.id, relation.type, relation.source, relation.target])
  return digitalTwinReviewFingerprint({
    profile: manifest?.source?.profile ?? null,
    entities,
    relations,
    flows: flowCatalog?.flows ?? {},
  })
}

function evidenceRef(ref, kind, fingerprint = '') {
  const safeRef = compactText(ref, 360)
  const safeKind = compactText(kind, 60)
  if (!safeRef || !safeKind) return null
  return {
    ref: safeRef,
    kind: safeKind,
    fingerprint: compactText(fingerprint, 100),
  }
}

function addCandidate(target, {
  label,
  sourceKind,
  evidence = [],
  weight = SOURCE_KIND_PRIORITY[sourceKind] ?? 40,
  allowPath = false,
}) {
  const safeLabel = cleanFunctionalPhrase(label, { allowPath })
  const normalized = normalizeFunctionalPhrase(safeLabel)
  if (!safeLabel || !normalized) return
  const current = target.get(normalized) ?? {
    label: safeLabel,
    normalized,
    weight,
    sourceKinds: new Set(),
    evidence: new Map(),
  }
  if (weight > current.weight || weight === current.weight && safeLabel.length < current.label.length) {
    current.label = safeLabel
    current.weight = weight
  }
  current.sourceKinds.add(sourceKind)
  for (const item of evidence) {
    const normalizedEvidence = evidenceRef(item?.ref, item?.kind ?? sourceKind, item?.fingerprint)
    if (normalizedEvidence) current.evidence.set(`${normalizedEvidence.kind}:${normalizedEvidence.ref}`, normalizedEvidence)
  }
  target.set(normalized, current)
}

function humanizedIdentifier(value) {
  const text = String(value ?? '')
    .replace(/^\/+/, '')
    .replace(/^api\//i, '')
    .replace(/\.[^.]+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_/.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || value
}

function firstEntityEvidence(entity) {
  const reference = entity?.explanationBasis?.refs?.find((item) => String(item).startsWith('source:'))
    || (entity?.path
      ? `source:${entity.path}#L${Math.max(1, Number(entity.lineStart) || 1)}`
      : entity?.id)
  return evidenceRef(reference, entity?.kind ?? 'source', entity?.fingerprint)
}

function sourceCandidates(manifest, featureModel, flowCatalog) {
  const candidates = new Map()
  const profileRef = `profile:${manifest?.source?.profile?.id ?? 'unknown'}@${manifest?.source?.profile?.version ?? 'unknown'}`
  const profileCapabilities = new Set(manifest?.source?.profile?.capabilities ?? [])
  const profileDeclaresFunctionalVocabulary = profileCapabilities.has('feature-boundary-classification')
  if (profileDeclaresFunctionalVocabulary) {
    const activeAreas = new Set((manifest?.entities ?? []).map((entity) => entity.area).filter(Boolean))
    const activeSubsystems = new Set((manifest?.entities ?? []).map((entity) => entity.subsystem).filter(Boolean))
    for (const area of manifest?.areas ?? []) {
      if (!activeAreas.has(area.id)) continue
      addCandidate(candidates, {
        label: area.label || area.id,
        sourceKind: 'profile-area',
        evidence: [{ ref: profileRef, kind: 'profile-area', fingerprint: manifest?.source?.profile?.version }],
      })
    }
    for (const subsystem of manifest?.subsystems ?? []) {
      if (!activeSubsystems.has(subsystem.id)) continue
      addCandidate(candidates, {
        label: subsystem.label || subsystem.id,
        sourceKind: 'profile-subsystem',
        evidence: [{ ref: profileRef, kind: 'profile-subsystem', fingerprint: manifest?.source?.profile?.version }],
      })
    }
  }
  for (const feature of featureModel?.candidates ?? []) {
    if (!feature.eligible || !['feature-asset', 'capability'].includes(feature.classification)) continue
    addCandidate(candidates, {
      label: feature.label || feature.id,
      sourceKind: 'feature-model',
      evidence: (feature.evidence ?? []).slice(0, 4).map((item) => ({
        ref: `source:${item.path}#L1`,
        kind: 'feature-model',
        fingerprint: item.fingerprint,
      })),
    })
  }
  for (const entity of manifest?.entities ?? []) {
    const entityEvidence = firstEntityEvidence(entity)
    if (entity.kind === 'file' && entity.layer === 'frontend') {
      for (const item of entity.details?.uiTexts ?? []) {
        const text = typeof item === 'string' ? item : item?.text
        const line = typeof item === 'object' ? item?.line : entity.lineStart
        addCandidate(candidates, {
          label: text,
          sourceKind: 'ui-text',
          evidence: [{
            ref: `source:${entity.path}#L${Math.max(1, Number(line) || 1)}`,
            kind: 'ui-text',
            fingerprint: entity.fingerprint,
          }],
        })
      }
      for (const item of entity.details?.screenPaths ?? []) {
        const route = typeof item === 'string' ? item : item?.path
        const line = typeof item === 'object' ? item?.line : entity.lineStart
        addCandidate(candidates, {
          label: humanizedIdentifier(route),
          sourceKind: 'screen-path',
          evidence: [{
            ref: `source:${entity.path}#L${Math.max(1, Number(line) || 1)}`,
            kind: 'screen-path',
            fingerprint: entity.fingerprint,
          }],
        })
      }
    }
    if (entity.kind === 'api-route') {
      addCandidate(candidates, {
        label: humanizedIdentifier(entity.name || entity.label),
        sourceKind: 'api-route',
        evidence: [entityEvidence],
      })
    }
    if (['db-table', 'db-function', 'rls-policy'].includes(entity.kind)) {
      addCandidate(candidates, {
        label: humanizedIdentifier(entity.name || entity.label),
        sourceKind: 'database',
        evidence: [entityEvidence],
      })
    }
    if (entity.kind === 'file' && entity.layer === 'test') {
      addCandidate(candidates, {
        label: humanizedIdentifier(String(entity.path ?? '').split('/').pop()?.replace(/^test[-_.]?/i, '')),
        sourceKind: 'test',
        evidence: [entityEvidence],
      })
    }
  }
  for (const [id, row] of Object.entries(flowCatalog?.flows ?? {})) {
    if (!Array.isArray(row)) continue
    addCandidate(candidates, {
      label: String(row[1] ?? '').startsWith('/') ? humanizedIdentifier(row[1]) : row[1],
      sourceKind: 'static-flow',
      evidence: [{
        ref: row[3] || `flow:${id}`,
        kind: 'static-flow',
        fingerprint: digitalTwinReviewFingerprint(row),
      }],
    })
  }
  return candidates
}

function matchesSourceEvidence(documentCandidate, sourceCandidate) {
  const documentTokens = phraseTokens(documentCandidate.normalized)
  const sourceTokens = phraseTokens(sourceCandidate.normalized)
  if (documentCandidate.normalized === sourceCandidate.normalized) return true
  if (!documentTokens.size || !sourceTokens.size) return false
  let overlap = 0
  for (const token of documentTokens) if (sourceTokens.has(token)) overlap += 1
  const smallerSize = Math.min(documentTokens.size, sourceTokens.size)
  if (
    overlap >= 2
    && (
      documentCandidate.normalized.includes(sourceCandidate.normalized)
      || sourceCandidate.normalized.includes(documentCandidate.normalized)
    )
  ) return true
  return overlap >= 2 && overlap / smallerSize >= 0.67
}

function finalTerm(candidate, sourceMatches, previousById) {
  const mergedEvidence = new Map(candidate.evidence)
  const sourceKinds = new Set(candidate.sourceKinds)
  for (const source of sourceMatches) {
    for (const [key, item] of source.evidence) mergedEvidence.set(key, item)
    for (const kind of source.sourceKinds) sourceKinds.add(kind)
  }
  const evidence = [...mergedEvidence.values()]
    .sort((left, right) => compareText(`${left.kind}:${left.ref}`, `${right.kind}:${right.ref}`))
    .slice(0, SOURCE_FUNCTIONAL_CONTEXT_LIMITS.evidencePerTerm)
  const evidenceFingerprint = digitalTwinReviewFingerprint(evidence)
  const id = `functional-context:${digitalTwinReviewFingerprint(candidate.normalized)}`
  const verification = sourceMatches.length || !sourceKinds.has('document-heading')
    && !sourceKinds.has('document-list')
    && !sourceKinds.has('document-table')
    ? 'source-evidence'
    : 'document-evidence'
  const previous = previousById.get(id)
  return {
    id,
    label: candidate.label,
    normalized: candidate.normalized,
    confidence: verification === 'source-evidence' ? 'high' : 'medium',
    verification,
    sourceKinds: [...sourceKinds].sort(compareText),
    evidence,
    evidenceFingerprint,
    reusedFromPrevious: previous?.evidenceFingerprint === evidenceFingerprint
      && ['source-evidence', 'document-evidence'].includes(previous?.verification),
  }
}

function normalizedPreviousPack(value) {
  return plainObject(value) && value.schemaVersion === SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION
    ? value
    : null
}

export function buildFunctionalContextPack({
  files,
  manifest,
  featureModel = null,
  flowCatalog = null,
  previous = null,
} = {}) {
  const safePrevious = normalizedPreviousPack(previous)
  const previousDocuments = new Map((safePrevious?.documents ?? []).map((item) => [item.path, item]))
  const currentSourceFingerprint = sourceEvidenceFingerprint(manifest, flowCatalog)
  const sourceChanged = !!safePrevious?.sourceEvidenceFingerprint
    && safePrevious.sourceEvidenceFingerprint !== currentSourceFingerprint
  const documents = []
  const documentCandidates = new Map()
  const documentEntries = markdownDocuments(files)
  let processedCharacters = 0
  for (const [path, rawContent] of documentEntries) {
    const available = Math.max(0, SOURCE_FUNCTIONAL_CONTEXT_LIMITS.documentCharacters - processedCharacters)
    if (!available) break
    const content = String(rawContent ?? '').slice(0, available)
    processedCharacters += content.length
    const fingerprint = digitalTwinReviewFingerprint(content)
    const previousDocument = previousDocuments.get(path)
    const freshness = !safePrevious
      ? 'baseline'
      : !previousDocument
        ? 'new'
        : previousDocument.fingerprint !== fingerprint
          ? 'changed'
          : sourceChanged
            ? 'possibly-stale'
            : 'current'
    const phrases = extractMarkdownPhrases(path, content, fingerprint)
    const used = phrases.length > 0 && freshness !== 'possibly-stale'
    documents.push({
      path,
      kind: documentKind(path),
      fingerprint,
      freshness,
      extractedTerms: phrases.length,
      used,
    })
    if (used) {
      for (const phrase of phrases) {
        addCandidate(documentCandidates, {
          ...phrase,
          evidence: phrase.evidence,
        })
      }
    }
  }
  for (const [path, item] of previousDocuments) {
    if (!documents.some((document) => document.path === path)) {
      documents.push({
        path,
        kind: item.kind ?? documentKind(path),
        fingerprint: item.fingerprint ?? '',
        freshness: 'missing',
        extractedTerms: 0,
        used: false,
      })
    }
  }
  documents.sort((left, right) => compareText(left.path, right.path))

  const evidenceCandidates = sourceCandidates(manifest, featureModel, flowCatalog)
  const previousById = new Map((safePrevious?.vocabulary ?? []).map((item) => [item.id, item]))
  const useDocuments = documentCandidates.size > 0
  const selectedCandidates = useDocuments
    ? [
        ...documentCandidates.values(),
        ...[...evidenceCandidates.values()].filter((source) => (
          ![...documentCandidates.values()].some((document) => matchesSourceEvidence(document, source))
        )),
      ]
    : [...evidenceCandidates.values()]
  const vocabulary = selectedCandidates
    .sort((left, right) => right.weight - left.weight || compareText(left.normalized, right.normalized))
    .slice(0, SOURCE_FUNCTIONAL_CONTEXT_LIMITS.vocabularyTerms)
    .map((candidate) => {
      const matches = useDocuments
        ? [...evidenceCandidates.values()]
          .filter((source) => matchesSourceEvidence(candidate, source))
          .sort((left, right) => right.weight - left.weight || compareText(left.normalized, right.normalized))
          .slice(0, 6)
        : [candidate]
      return finalTerm(candidate, matches, previousById)
    })
    .sort((left, right) => compareText(left.normalized, right.normalized))

  const diagnostics = []
  if (!useDocuments) {
    diagnostics.push({
      code: 'functional-context-document-fallback',
      severity: 'info',
      message: '사용 가능한 최신 문서 기능 어휘가 없어 소스 근거에서 기능 어휘를 구성했습니다.',
    })
  }
  const possiblyStale = documents.filter((item) => item.freshness === 'possibly-stale')
  if (possiblyStale.length) {
    diagnostics.push({
      code: 'functional-context-documents-possibly-stale',
      severity: 'attention',
      message: '코드 근거가 바뀌었지만 그대로인 문서는 이번 기능 어휘 입력에서 제외했습니다.',
      paths: possiblyStale.map((item) => item.path),
    })
  }
  if (!vocabulary.length) {
    diagnostics.push({
      code: 'functional-context-vocabulary-empty',
      severity: 'attention',
      message: '문서와 지원되는 소스 근거에서 기능 어휘를 찾지 못했습니다.',
    })
  }

  const documentFingerprint = digitalTwinReviewFingerprint(documents
    .filter((item) => item.freshness !== 'missing')
    .map((item) => [item.path, item.fingerprint]))
  const content = {
    schemaVersion: SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION,
    type: 'FunctionalContextPack',
    strategy: useDocuments ? 'documents-with-source-validation' : 'source-evidence-fallback',
    source: {
      id: compactText(manifest?.source?.id, 180),
      profileId: compactText(manifest?.source?.profile?.id, 120),
      profileVersion: compactText(manifest?.source?.profile?.version, 80),
    },
    sourceEvidenceFingerprint: currentSourceFingerprint,
    documentFingerprint,
    documents,
    vocabulary,
    diagnostics,
    summary: {
      documents: documents.filter((item) => item.freshness !== 'missing').length,
      usedDocuments: documents.filter((item) => item.used).length,
      possiblyStaleDocuments: possiblyStale.length,
      vocabularyTerms: vocabulary.length,
      sourceVerifiedTerms: vocabulary.filter((item) => item.verification === 'source-evidence').length,
      reusedTerms: vocabulary.filter((item) => item.reusedFromPrevious).length,
    },
  }
  const result = {
    ...content,
    fingerprint: digitalTwinReviewFingerprint({
      schemaVersion: content.schemaVersion,
      strategy: content.strategy,
      source: content.source,
      sourceEvidenceFingerprint: content.sourceEvidenceFingerprint,
      documentFingerprint: content.documentFingerprint,
      vocabulary: content.vocabulary.map(({ reusedFromPrevious, ...item }) => item),
      diagnostics: content.diagnostics,
    }),
    reuse: {
      previousPackFingerprint: compactText(safePrevious?.fingerprint, 100),
      reusedTerms: content.summary.reusedTerms,
      invalidatedTerms: safePrevious
        ? Math.max(0, (safePrevious.vocabulary?.length ?? 0) - content.summary.reusedTerms)
        : 0,
    },
  }
  return validateFunctionalContextPack(deepFreeze(result))
}

export function validateFunctionalContextPack(value) {
  if (!plainObject(value) || value.schemaVersion !== SOURCE_FUNCTIONAL_CONTEXT_SCHEMA_VERSION) {
    throw new Error('지원하지 않는 Functional Context Pack 계약입니다.')
  }
  if (value.type !== 'FunctionalContextPack' || !Array.isArray(value.documents) || !Array.isArray(value.vocabulary)) {
    throw new Error('Functional Context Pack 구조가 불완전합니다.')
  }
  if (value.documents.length > SOURCE_FUNCTIONAL_CONTEXT_LIMITS.documents * 2) {
    throw new Error('Functional Context Pack 문서 진단 한도를 넘었습니다.')
  }
  if (value.vocabulary.length > SOURCE_FUNCTIONAL_CONTEXT_LIMITS.vocabularyTerms) {
    throw new Error('Functional Context Pack 어휘 한도를 넘었습니다.')
  }
  for (const term of value.vocabulary) {
    if (!term.id || !term.label || !term.normalized || !Array.isArray(term.evidence)) {
      throw new Error('Functional Context Pack 어휘 근거가 불완전합니다.')
    }
    if (term.evidence.length > SOURCE_FUNCTIONAL_CONTEXT_LIMITS.evidencePerTerm) {
      throw new Error('Functional Context Pack 어휘 근거 한도를 넘었습니다.')
    }
  }
  return value
}

export function parseGeneratedFunctionalContextPack(source) {
  const marker = 'Object.freeze('
  const start = String(source ?? '').indexOf(marker)
  const end = String(source ?? '').lastIndexOf('\n)')
  if (start < 0 || end < 0) return null
  try {
    return validateFunctionalContextPack(JSON.parse(String(source).slice(start + marker.length, end)))
  } catch {
    return null
  }
}

export function serializeFunctionalContextPack(value) {
  validateFunctionalContextPack(value)
  return [
    '// Generated by scripts/generate-source-twin.mjs. Do not edit by hand.',
    'export const SOURCE_FUNCTIONAL_CONTEXT_MANIFEST = Object.freeze(',
    JSON.stringify(value, null, 2),
    ')',
    '',
  ].join('\n')
}
