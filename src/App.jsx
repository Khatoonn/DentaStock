import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Reception from './pages/Reception'
import Consommation from './pages/Consommation'
import Documents from './pages/Documents'
import Fournisseurs from './pages/Fournisseurs'
import Produits from './pages/Produits'
import Praticiens from './pages/Praticiens'
import Parametres from './pages/Parametres'
import Statistiques from './pages/Statistiques'
import Setup from './pages/Setup'
import KeyboardShortcuts from './components/KeyboardShortcuts'

const isElectron = typeof window !== 'undefined' && window.api !== undefined

export default function App() {
  const [setupDone, setSetupDone] = useState(null) // null = loading, true/false

  useEffect(() => {
    if (!isElectron) {
      setSetupDone(true)
      return
    }
    window.api.setupGetConfig().then(config => {
      setSetupDone(config !== null)
    })
  }, [])

  // Loading
  if (setupDone === null) {
    return (
      <div className="flex h-screen bg-slate-900 items-center justify-center">
        <div className="text-slate-400 text-sm">Chargement...</div>
      </div>
    )
  }

  // Setup screen
  if (!setupDone) {
    return <Setup onComplete={() => setSetupDone(true)} />
  }

  return (
    <div className="flex h-screen bg-slate-900 overflow-hidden">
      <KeyboardShortcuts />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-4 lg:p-6 min-w-0">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/reception" element={<Reception />} />
            <Route path="/commandes" element={<Navigate to="/reception" replace />} />
            <Route path="/stock" element={<Navigate to="/produits" replace />} />
            <Route path="/consommation" element={<Consommation />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/produits" element={<Produits />} />
            <Route path="/fournisseurs" element={<Fournisseurs />} />
            <Route path="/praticiens" element={<Praticiens />} />
            <Route path="/statistiques" element={<Statistiques />} />
            <Route path="/parametres" element={<Parametres />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
