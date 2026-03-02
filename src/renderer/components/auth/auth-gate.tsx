import { useUser } from '@renderer/context/user-context'
import { AuthPage } from './auth-page'
import { ForcePasswordChange } from './force-password-change'

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  )
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthMode, isAuthenticated, isPending, mustChangePassword } = useUser()

  if (!isAuthMode) return <>{children}</>
  if (isPending) return <LoadingScreen />
  if (!isAuthenticated) return <AuthPage />
  if (mustChangePassword) return <ForcePasswordChange />
  return <>{children}</>
}
