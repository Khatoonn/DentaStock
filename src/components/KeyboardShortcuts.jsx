import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const SHORTCUTS = [
  { key: '1', path: '/dashboard' },
  { key: '2', path: '/reception' },
  { key: '3', path: '/consommation' },
  { key: '4', path: '/produits' },
  { key: '5', path: '/fournisseurs' },
  { key: '6', path: '/praticiens' },
  { key: '7', path: '/documents' },
  { key: '8', path: '/statistiques' },
  { key: '9', path: '/parametres' },
  { key: '0', path: '/journal' },
]

export default function KeyboardShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => {
      // Skip if typing in an input/textarea/select
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        const shortcut = SHORTCUTS.find(s => s.key === e.key)
        if (shortcut) {
          e.preventDefault()
          navigate(shortcut.path)
        }
      }

      // Ctrl+N = new product (navigate to produits)
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        navigate('/produits')
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        navigate('/journal')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  return null
}
