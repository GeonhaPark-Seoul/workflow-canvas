import { useState, useEffect } from 'react'

// Tracks document.body.dataset.theme ('light' | 'dark') reactively via a
// MutationObserver, since the theme is toggled by App (which nodes can't import from).
export function useTheme() {
  const [theme, setTheme] = useState(() => document.body.dataset.theme || 'dark')

  useEffect(() => {
    const update = () => setTheme(document.body.dataset.theme || 'dark')
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
