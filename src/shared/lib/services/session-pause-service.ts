/**
 * Session Pause Service
 *
 * Database operations for agent-initiated conversation pauses.
 * When an agent calls the long_pause tool, a record is created here.
 * The task scheduler polls for due pauses and resolves them.
 */

import { db } from '@shared/lib/db'
import { sessionPauses, type SessionPause, type NewSessionPause } from '@shared/lib/db/schema'
import { eq, and, lte } from 'drizzle-orm'
import { parseAtSyntax } from './schedule-parser'

export type { SessionPause, NewSessionPause }

export interface CreateSessionPauseParams {
  sessionId: string
  agentSlug: string
  toolUseId: string
  duration: string
  reason?: string
}

export async function createSessionPause(
  params: CreateSessionPauseParams
): Promise<{ id: string; resumeAt: Date }> {
  const id = crypto.randomUUID()
  const resumeAt = parseAtSyntax(params.duration)

  await db.insert(sessionPauses).values({
    id,
    sessionId: params.sessionId,
    agentSlug: params.agentSlug,
    toolUseId: params.toolUseId,
    duration: params.duration,
    reason: params.reason,
    resumeAt,
    status: 'pending',
    createdAt: new Date(),
  } satisfies NewSessionPause)

  return { id, resumeAt }
}

export async function getDuePauses(): Promise<SessionPause[]> {
  return db
    .select()
    .from(sessionPauses)
    .where(
      and(
        eq(sessionPauses.status, 'pending'),
        lte(sessionPauses.resumeAt, new Date())
      )
    )
}

export async function markPauseCompleted(pauseId: string): Promise<void> {
  await db
    .update(sessionPauses)
    .set({ status: 'completed', completedAt: new Date() })
    .where(eq(sessionPauses.id, pauseId))
}

