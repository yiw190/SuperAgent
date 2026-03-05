/**
 * Manage Scheduled Tasks Tool
 *
 * Allows agents to list, pause, resume, and cancel their own scheduled tasks.
 * Like schedule_task, this tool only validates input — the actual DB operations
 * are handled by the API server's message-persister which intercepts the tool call.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'

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
    if (args.action !== 'list' && !args.taskId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Action "${args.action}" requires a taskId. Use action "list" first to see available tasks and their IDs.`,
          },
        ],
        isError: true,
      }
    }

    console.log(`[manage_scheduled_tasks] ${args.action}${args.taskId ? ` task ${args.taskId}` : ''}`)

    return {
      content: [
        {
          type: 'text' as const,
          text: `Task management action "${args.action}" is being processed.${args.taskId ? ` Task ID: ${args.taskId}` : ''}`,
        },
      ],
    }
  }
)
