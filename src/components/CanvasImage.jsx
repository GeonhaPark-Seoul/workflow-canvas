import { useEffect, useState } from 'react'
import { getCanvasImageUrl } from '../lib/imageStorage'

export default function CanvasImage({ storagePath, legacySrc, alt = '', style }) {
  const [src, setSrc] = useState(legacySrc ?? null)

  useEffect(() => {
    if (!storagePath) {
      setSrc(legacySrc ?? null)
      return undefined
    }
    let cancelled = false
    let refreshTimer
    const refresh = () => {
      getCanvasImageUrl(storagePath)
        .then((url) => { if (!cancelled) setSrc(url) })
        .catch((error) => {
          if (!cancelled) {
            setSrc(null)
            console.error('[images] signed URL:', error.message)
          }
        })
    }
    refresh()
    refreshTimer = setInterval(refresh, 4 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(refreshTimer)
    }
  }, [storagePath, legacySrc])

  return src ? <img src={src} alt={alt} style={style} /> : null
}
