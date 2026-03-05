/**
 * Manage Scheduled Tasks Tool
 *
 * Allows agents to list, pause, resume, and cancel their own scheduled tasks.
 *
 * - list: reads from host app API (needs HOST_APP_URL + PROXY_TOKEN).
 * - pause/resume/cancel: pure validation only — the actual DB mutation is
 *   performed by the host-side message-persister which intercepts the tool
 *   call, matching the same pattern used by schedule_task.
 *
 * TODO: "list" still requires HTTP access to the host app, which exposes
 * HOST_APP_URL to the container. Safe in local/Electron mode, but should
 * be revisited for remote/shared container execution.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

function hostFetch(path: string, method = 'GET'): Promise<Response> {
  const base = process.env.HOST_APP_URL
  if (!base) throw new Error('HOST_APP_URL not configured')
  const headers: Record<string, string> = {}
  if (process.env.PROXY_TOKEN) headers['Authorization'] = `Bearer ${process.env.PROXY_TOKEN}`
  return fetch(`${base}${path}`, { method, headers })
}

export const manageScheduledTasksTool = tool(
  'manage_scheduled_tasks',
  `Manage your scheduled tasks. You can list all active tasks, pause a running task, resume a paused task, or cancel a task entirely.

Actions:
- "list" — List all active (pending + paused) scheduled tasks for this agent. No taskId needed.
- "pause" — Pause a pending task so it stops executing until resumed. Requires taskId.
- "resume" — Resume a paused task so it starts executing again. Requires taskId.
- "cancel" — Cancel a task permanently. Requires taskId.

Use "list" first to see available tasks and their IDs before performing other actions.`,
  {
    action: z
      .enum(['list', 'pause', 'resume', 'cancel'])
      .describe('The action to perform on scheduled tasks'),
    taskId: z
      .string()
      .optional()
      .describe('The ID of the task to act on. Required for pause, resume, and cancel actions.'),
  },
  async (args) => {
    const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
    const fail = (t: string) => ({ content: [{ type: 'text' as const, text: t }], isError: true as const })

    if (args.action !== 'list' && !args.taskId) {
      return fail(`Action "${args.action}" requires a taskId. Use "list" first.`)
    }

    const agentId = process.env.AGENT_ID
    if (!agentId) return fail('AGENT_ID not configured.')

    if (args.action === 'list') {
      try {
        const res = await hostFetch(`/api/agents/${agentId}/scheduled-tasks?status=active`)
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          return fail(`Failed to list tasks: ${body || res.statusText}`)
        }

        interface TaskSummary {
          id: string; name: string; scheduleType: string
          scheduleExpression: string; status: string
          executionCount: number; nextExecutionAt: string | null
        }
        const tasks = await res.json() as TaskSummary[]
        if (tasks.length === 0) return text('No active scheduled tasks.')

        const lines = tasks.map(t =>
          `- ${t.name} (ID: ${t.id}) [${t.status}] ` +
          `${t.scheduleType}="${t.scheduleExpression}" executions=${t.executionCount}` +
          (t.nextExecutionAt ? ` next=${t.nextExecutionAt}` : '')
        )
        return text(lines.join('\n'))
      } catch (err) {
        return fail(`Error: ${err instanceof Error ? err.message : err}`)
      }
    }

    // pause/resume/cancel — return confirmation text only.
    // The host-side message-persister intercepts this tool call and performs
    // the actual DB operation + SSE broadcast.
    const pastTense = args.action === 'cancel' ? 'cancelled' : `${args.action}d`
    return text(`Successfully ${pastTense} task ${args.taskId}.`)
  }
)
