import { useState } from 'react'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Loader2, Copy, Check } from 'lucide-react'
import { apiFetch } from '@renderer/lib/api'

const inviteSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Please enter a valid email'),
})

function generateTempPassword(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24)
}

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvited: () => void
}

export function InviteUserDialog({ open, onOpenChange, onInvited }: InviteUserDialogProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetState() {
    setName('')
    setEmail('')
    setRole('user')
    setTempPassword(null)
    setCopied(false)
    setServerError(null)
    setFieldErrors({})
    setIsSubmitting(false)
  }

  function handleClose() {
    resetState()
    onOpenChange(false)
  }

  async function handleInvite() {
    setServerError(null)
    setFieldErrors({})

    const result = inviteSchema.safeParse({ name: name.trim(), email: email.trim() })
    if (!result.success) {
      const errors: Record<string, string> = {}
      for (const issue of result.error.issues) {
        errors[issue.path[0] as string] = issue.message
      }
      setFieldErrors(errors)
      return
    }

    setIsSubmitting(true)
    const password = generateTempPassword()

    try {
      const res = await apiFetch('/api/admin/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.data.name, email: result.data.email, password, role }),
      })

      if (!res.ok) {
        const err = await res.json()
        setServerError(err.error || 'Failed to invite user')
        return
      }

      setTempPassword(password)
      onInvited()
    } catch {
      setServerError('Failed to invite user')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCopy() {
    if (tempPassword) {
      await navigator.clipboard.writeText(tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tempPassword ? 'User Invited' : 'Invite User'}</DialogTitle>
          <DialogDescription>
            {tempPassword
              ? 'Share the temporary password with the new user.'
              : 'Create a new user account with a temporary password.'}
          </DialogDescription>
        </DialogHeader>

        {tempPassword ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Temporary Password</Label>
              <div className="flex gap-2">
                <Input value={tempPassword} readOnly className="font-mono" />
                <Button variant="outline" size="icon" onClick={handleCopy} title="Copy password">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The user will be prompted to change this password on first login.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-name">Name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="User's name"
                className={fieldErrors.name ? 'border-destructive' : ''}
                autoFocus
              />
              {fieldErrors.name && (
                <p className="text-xs text-destructive">{fieldErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className={fieldErrors.email ? 'border-destructive' : ''}
              />
              {fieldErrors.email && (
                <p className="text-xs text-destructive">{fieldErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as 'user' | 'admin')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertDescription>{serverError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleInvite} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Invite'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
