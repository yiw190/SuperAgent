import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { Authenticated, IsAdmin } from '../middleware/auth'
import { db } from '@shared/lib/db'
import { user, authAccount } from '@shared/lib/db/schema'
import { hashPassword } from 'better-auth/crypto'

const adminUsersRouter = new Hono()
adminUsersRouter.use('*', Authenticated(), IsAdmin())

// POST /api/admin/users/invite - Create user with mustChangePassword=true
adminUsersRouter.post('/invite', async (c) => {
  const body = await c.req.json<{ name: string; email: string; password: string; role?: string }>()
  const { name, email, password, role } = body

  if (!name?.trim() || !email?.trim() || !password) {
    return c.json({ error: 'name, email, and password are required' }, 400)
  }

  const trimmedEmail = email.trim().toLowerCase()
  const trimmedName = name.trim()

  // Check if email already exists
  const existing = db.select({ id: user.id }).from(user).where(eq(user.email, trimmedEmail)).get()
  if (existing) {
    return c.json({ error: 'A user with this email already exists' }, 400)
  }

  try {
    const userId = crypto.randomUUID()
    const hashedPassword = await hashPassword(password)
    const now = new Date()

    // Create user with mustChangePassword flag
    db.insert(user).values({
      id: userId,
      name: trimmedName,
      email: trimmedEmail,
      role: role || 'user',
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    }).run()

    // Create credential account with hashed password
    db.insert(authAccount).values({
      id: crypto.randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    }).run()

    return c.json({ user: { id: userId, name: trimmedName, email: trimmedEmail } })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create user'
    return c.json({ error: message }, 400)
  }
})

export default adminUsersRouter
