/**
 * Long Pause Tool - Allows agents to pause the current conversation and resume later.
 *
 * The agent calls this tool to sleep for a specified duration (e.g., "1 hour").
 * The tool blocks via InputManager until the host process resolves it when the
 * pause duration expires. The conversation resumes seamlessly in the same thread.
 */

import { tool } from '@anthropic-ai/claude-agent-sdk'
import { z } from 'zod'
import { inputManager } from '../input-manager'

export const longPauseTool = tool(
  'long_pause',
  `Pause the current conversation for a specified duration, then automatically resume.

Use this when you need to wait for something to happen before continuing:
- "Post to Slack, wait 1 hour for people to comment, then summarize"
- "Send an email, wait 30 minutes for a reply"
- "Deploy the change, wait 2 hours then check monitoring"

The conversation will resume in the same thread after the pause expires.
During the pause, resources are freed — the container may sleep and will be woken up automatically.

Duration format (use "at" syntax):
- "at now + 1 hour"
- "at now + 30 minutes"
- "at now + 2 days"
- "at tomorrow 9am"
- "at next monday 10am"`,
  {
    duration: z
      .string()
      .describe(
        'When to resume, using "at" syntax. Examples: "at now + 1 hour", "at now + 30 minutes", "at tomorrow 9am"'
      ),
    reason: z
      .string()
      .optional()
      .describe('Why the agent is pausing (shown to the user in the UI)'),
  },
  async (args) => {
    console.log(`[long_pause] Pausing: ${args.duration}, reason: ${args.reason || 'none'}`)

    const toolUseId = inputManager.consumeCurrentToolUseId()

    if (!toolUseId) {
      console.error('[long_pause] No toolUseId available')
      return {
        content: [
          {
            type: 'text' as const,
            text: 'Unable to pause — no tool use ID available.',
          },
        ],
        isError: true,
      }
    }

    console.log(`[long_pause] Blocking on toolUseId: ${toolUseId}`)

    try {
      const resumeInfo = await inputManager.createPendingWithType<string>(
        toolUseId,
        'long_pause',
        { duration: args.duration, reason: args.reason }
      )

      console.log(`[long_pause] Resumed after pause`)

      return {
        content: [
          {
            type: 'text' as const,
            text: resumeInfo || `Resumed after pause. The wait period (${args.duration}) has elapsed. Continue with the task.`,
          },
        ],
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log(`[long_pause] Pause cancelled: ${errorMessage}`)

      return {
        content: [
          {
            type: 'text' as const,
            text: `Pause was cancelled: ${errorMessage}`,
          },
        ],
        isError: true,
      }
    }
  }
)
