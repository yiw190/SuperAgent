import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '@renderer/lib/auth-client'
import { Card, CardContent, CardHeader } from '@renderer/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Loader2 } from 'lucide-react'

function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const canSubmit = email.trim() && password

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await signIn.email({ email: email.trim(), password })
      if (result.error) {
        setError(result.error.message || 'Sign in failed')
      }
    } catch {
      setError('Sign in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input
          id="signin-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signin-password">Password</Label>
        <Input
          id="signin-password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign in'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{' '}
        <button type="button" onClick={onSwitchToSignUp} className="text-primary underline">
          Sign up
        </button>
      </p>
    </form>
  )
}

function SignUpForm({ onSwitchToSignIn }: { onSwitchToSignIn: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const passwordMismatch = confirmPassword && password !== confirmPassword
  const canSubmit = name.trim() && email.trim() && password.length >= 8 && password === confirmPassword

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const result = await signUp.email({ name: name.trim(), email: email.trim(), password })
      if (result.error) {
        setError(result.error.message || 'Sign up failed')
      }
    } catch {
      setError('Sign up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signup-name">Name</Label>
        <Input
          id="signup-name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-email">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-password">Password</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="signup-confirm">Confirm Password</Label>
        <Input
          id="signup-confirm"
          type="password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className={passwordMismatch ? 'border-destructive' : ''}
        />
        {passwordMismatch && (
          <p className="text-xs text-destructive">Passwords do not match</p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={!canSubmit || loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Creating account...
          </>
        ) : (
          'Sign up'
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToSignIn} className="text-primary underline">
          Sign in
        </button>
      </p>
    </form>
  )
}

export function AuthPage() {
  const [tab, setTab] = useState<string>('signin')

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <h1 className="text-2xl font-bold">SuperAgent</h1>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full mb-4">
              <TabsTrigger value="signin" className="flex-1">Sign In</TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm onSwitchToSignUp={() => setTab('signup')} />
            </TabsContent>
            <TabsContent value="signup">
              <SignUpForm onSwitchToSignIn={() => setTab('signin')} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
