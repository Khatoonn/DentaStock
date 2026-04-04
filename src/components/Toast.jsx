import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ToastContext = createContext()

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type, removing: false }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => (t.id === id ? { ...t, removing: true } : t)))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
    }, duration)
  }, [])

  const confirm = useCallback((message) => {
    return new Promise(resolve => {
      const id = ++idRef.current
      setToasts(prev => [...prev, { id, message, type: 'confirm', resolve, removing: false }])
    })
  }, [])

  const dismissConfirm = useCallback((id, result) => {
    setToasts(prev => {
      const t = prev.find(x => x.id === id)
      if (t?.resolve) t.resolve(result)
      return prev.map(x => (x.id === id ? { ...x, removing: true } : x))
    })
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast, confirm }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismissConfirm} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const ICONS = {
  success: (
    <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-sky-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  confirm: (
    <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
}

const BG = {
  success: 'bg-emerald-500/10 border-emerald-500/30',
  error: 'bg-red-500/10 border-red-500/30',
  info: 'bg-sky-500/10 border-sky-500/30',
  confirm: 'bg-amber-500/10 border-amber-500/30',
}

function ToastItem({ toast, onDismiss }) {
  return (
    <div className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-all duration-300
      ${toast.removing ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'}
      ${BG[toast.type] || BG.info}
      bg-slate-800 dark:bg-slate-800`}
    >
      <div className="flex items-start gap-3">
        {ICONS[toast.type] || ICONS.info}
        <p className="text-sm text-slate-200 flex-1">{toast.message}</p>
      </div>
      {toast.type === 'confirm' && (
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={() => onDismiss(toast.id, false)}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onDismiss(toast.id, true)}
            className="px-3 py-1.5 rounded-lg text-xs bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
          >
            Confirmer
          </button>
        </div>
      )}
    </div>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
