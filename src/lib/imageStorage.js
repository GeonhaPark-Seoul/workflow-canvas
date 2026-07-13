import { supabase } from './supabase'

const BUCKET = 'canvas-images'

function safeSegment(value, label) {
  if (typeof value !== 'string' || !value || value.includes('/')) {
    throw new Error(`${label}이 올바르지 않습니다.`)
  }
  return value
}

export async function getCanvasImageUrl(storagePath, expiresIn = 300) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresIn)
  if (error) throw new Error(`사진을 불러오지 못했습니다: ${error.message}`)
  return data.signedUrl
}

export async function uploadCanvasImage({ ownerId, canvasId, nodeId, blob, previousPath }) {
  const owner = safeSegment(ownerId, '소유자 ID')
  const canvas = safeSegment(canvasId, '캔버스 ID')
  const node = safeSegment(nodeId, '노드 ID')
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) throw new Error('이미지 파일만 업로드할 수 있습니다.')

  const extension = blob.type === 'image/png' ? 'png'
    : blob.type === 'image/webp' ? 'webp'
    : blob.type === 'image/gif' ? 'gif'
    : 'jpg'
  const path = `${owner}/${canvas}/${node}/${crypto.randomUUID()}.${extension}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw new Error(`사진을 저장하지 못했습니다: ${error.message}`)

  if (previousPath && previousPath !== path) {
    supabase.storage.from(BUCKET).remove([previousPath])
      .then(({ error: removeError }) => {
        if (removeError) console.warn('[images] old image cleanup:', removeError.message)
      })
  }
  return { storagePath: path, signedUrl: await getCanvasImageUrl(path) }
}

export function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([a-z0-9+/=]+)$/i.exec(dataUrl ?? '')
  if (!match) throw new Error('이전 사진 데이터 형식을 읽을 수 없습니다.')
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: match[1] })
}
