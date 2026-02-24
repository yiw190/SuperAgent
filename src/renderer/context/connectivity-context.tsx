
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

const ConnectivityContext = createContext<boolean>(true)

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return (
    <ConnectivityContext.Provider value={isOnline}>
      {children}
    </ConnectivityContext.Provider>
  )
}

export function useIsOnline(): boolean {
  return useContext(ConnectivityContext)
}
