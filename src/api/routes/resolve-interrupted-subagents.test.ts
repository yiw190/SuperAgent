import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TransformedItem, TransformedMessage } from '@shared/lib/utils/message-transform'

// ============================================================================
// Mocks — must be declared before import
// ============================================================================

const mockReaddir = vi.fn()
const mockStat = vi.fn()

vi.mock('fs', () => ({
  default: { promises: { readdir: (...args: unknown[]) => mockReaddir(...args), stat: (...args: unknown[]) => mockStat(...args) } },
  promises: { readdir: (...args: unknown[]) => mockReaddir(...args), stat: (...args: unknown[]) => mockStat(...args) },
}))

vi.mock('@shared/lib/utils/file-storage', () => ({
  getAgentSessionsDir: () => '/mock/sessions',
  // Stub other exports that agents.ts pulls in
  getSessionJsonlPath: vi.fn(),
  readFileOrNull: vi.fn(),
  readJsonlFile: vi.fn(),
  getAgentWorkspaceDir: vi.fn(),
}))

// Stub every heavy dependency that `agents.ts` imports so the module loads
// without side-effects.  Only the function under test matters.
vi.mock('@shared/lib/services/agent-service', () => ({
  listAgentsWithStatus: vi.fn(), createAgent: vi.fn(), getAgentWithStatus: vi.fn(),
  getAgent: vi.fn(), updateAgent: vi.fn(), deleteAgent: vi.fn(), agentExists: vi.fn(),
}))
vi.mock('@shared/lib/container/container-manager', () => ({ containerManager: {} }))
vi.mock('@shared/lib/container/message-persister', () => ({ messagePersister: {} }))
vi.mock('@shared/lib/services/session-service', () => ({
  listSessions: vi.fn(), updateSessionName: vi.fn(), registerSession: vi.fn(),
  getSessionMessagesWithCompact: vi.fn(), getSession: vi.fn(),
  getSessionMetadata: vi.fn(), updateSessionMetadata: vi.fn(),
  deleteSession: vi.fn(), removeMessage: vi.fn(), removeToolCall: vi.fn(),
}))
vi.mock('@shared/lib/services/secrets-service', () => ({
  listSecrets: vi.fn(), getSecret: vi.fn(), setSecret: vi.fn(),
  deleteSecret: vi.fn(), keyToEnvVar: vi.fn(), getSecretEnvVars: vi.fn(),
}))
vi.mock('@shared/lib/services/scheduled-task-service', () => ({
  listScheduledTasks: vi.fn(), listPendingScheduledTasks: vi.fn(),
}))
vi.mock('@shared/lib/db', () => ({
  db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn(), update: vi.fn() },
}))
vi.mock('@shared/lib/db/schema', () => ({
  connectedAccounts: {}, agentConnectedAccounts: {}, proxyAuditLog: {},
  remoteMcpServers: {}, agentRemoteMcps: {}, mcpAuditLog: {},
  agentAcl: {}, user: {},
}))
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(), and: vi.fn(), inArray: vi.fn(), desc: vi.fn(),
  count: vi.fn(), like: vi.fn(), or: vi.fn(),
}))
vi.mock('@shared/lib/auth/mode', () => ({ isAuthMode: vi.fn(() => false) }))
vi.mock('@shared/lib/auth/config', () => ({ getCurrentUserId: vi.fn() }))
vi.mock('@shared/lib/composio/providers', () => ({ getProvider: vi.fn() }))
vi.mock('@shared/lib/config/settings', () => ({
  getEffectiveAnthropicApiKey: vi.fn(), getEffectiveModels: vi.fn(),
  getEffectiveAgentLimits: vi.fn(), getCustomEnvVars: vi.fn(), getSettings: vi.fn(),
}))
vi.mock('@shared/lib/proxy/token-store', () => ({ revokeProxyToken: vi.fn() }))
vi.mock('@shared/lib/services/skillset-service', () => ({
  getAgentSkillsWithStatus: vi.fn(), getDiscoverableSkills: vi.fn(),
  installSkillFromSkillset: vi.fn(), updateSkillFromSkillset: vi.fn(),
  createSkillPR: vi.fn(), getSkillPRInfo: vi.fn(), getSkillPublishInfo: vi.fn(),
  publishSkillToSkillset: vi.fn(), refreshAgentSkills: vi.fn(),
}))
vi.mock('@shared/lib/services/agent-template-service', () => ({
  listAgentTemplates: vi.fn(), getAgentTemplate: vi.fn(),
  createAgentFromTemplate: vi.fn(),
}))
vi.mock('@shared/lib/utils/retry', () => ({ withRetry: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: vi.fn() }))
vi.mock('hono/streaming', () => ({ streamSSE: vi.fn() }))
vi.mock('@shared/lib/utils/message-transform', () => ({
  transformMessages: vi.fn(() => []),
  // Re-export types (they're erased at runtime, but the mock needs the shape)
}))
vi.mock('../middleware/auth', () => ({
  Authenticated: () => vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  AgentRead: () => vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  AgentUser: () => vi.fn((_c: unknown, next: () => Promise<void>) => next()),
  AgentAdmin: () => vi.fn((_c: unknown, next: () => Promise<void>) => next()),
}))

// Import after mocks
import { resolveInterruptedSubagents } from './agents'

// ============================================================================
// Test Fixtures
// ============================================================================

function makeAssistantMsg(toolCalls: TransformedMessage['toolCalls'], id = 'msg-1'): TransformedMessage {
  return {
    id,
    type: 'assistant',
    content: { text: '' },
    toolCalls,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function makeTaskToolCall(
  id: string,
  opts: { subagent?: TransformedMessage['toolCalls'][number]['subagent']; result?: string } = {}
): TransformedMessage['toolCalls'][number] {
  return {
    id,
    name: 'Task',
    input: { prompt: 'do something', description: 'test' },
    result: opts.result,
    subagent: opts.subagent,
  }
}

function makeRegularToolCall(id: string): TransformedMessage['toolCalls'][number] {
  return { id, name: 'Bash', input: { command: 'ls' }, result: 'file.txt' }
}

/** Helper to set up mockStat to return different mtimes by filename */
function setupStatMtimes(mtimeByFile: Record<string, number>) {
  mockStat.mockImplementation((filePath: string) => {
    for (const [name, mtime] of Object.entries(mtimeByFile)) {
      if (filePath.endsWith(name)) {
        return Promise.resolve({ mtimeMs: mtime })
      }
    }
    return Promise.reject(new Error('ENOENT'))
  })
}

// ============================================================================
// Tests
// ============================================================================

describe('resolveInterruptedSubagents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // --------------------------------------------------------------------------
  // No-op cases
  // --------------------------------------------------------------------------

  it('does nothing when there are no Task tool calls', async () => {
    const items: TransformedItem[] = [
      makeAssistantMsg([makeRegularToolCall('tool-1')]),
    ]

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    // Should not even read the filesystem
    expect(mockReaddir).not.toHaveBeenCalled()
    // Tool call unchanged
    expect((items[0] as TransformedMessage).toolCalls[0].subagent).toBeUndefined()
  })

  it('does nothing when all Task tool calls already have subagent info', async () => {
    const items: TransformedItem[] = [
      makeAssistantMsg([
        makeTaskToolCall('tool-1', {
          result: 'done',
          subagent: { agentId: 'agent-abc', status: 'completed' },
        }),
      ]),
    ]

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(mockReaddir).not.toHaveBeenCalled()
  })

  it('does nothing when there are no messages at all', async () => {
    await resolveInterruptedSubagents([], 'my-agent', 'session-1')
    expect(mockReaddir).not.toHaveBeenCalled()
  })

  it('does nothing when items only contain user messages and compact boundaries', async () => {
    const items: TransformedItem[] = [
      { id: 'u1', type: 'user', content: { text: 'hello' }, toolCalls: [], createdAt: new Date() },
      { id: 'b1', type: 'compact_boundary', summary: 'summary', trigger: 'auto', createdAt: new Date() },
    ]

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')
    expect(mockReaddir).not.toHaveBeenCalled()
  })

  // --------------------------------------------------------------------------
  // Subagents directory missing
  // --------------------------------------------------------------------------

  it('gracefully handles missing subagents directory', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockRejectedValue(new Error('ENOENT'))

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    // Should not crash, and tool call stays unresolved
    expect(tc.subagent).toBeUndefined()
  })

  // --------------------------------------------------------------------------
  // Single interrupted subagent — the core bug scenario
  // --------------------------------------------------------------------------

  it('resolves a single interrupted Task tool call to the subagent file', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue(['agent-abc123.jsonl'])
    setupStatMtimes({ 'agent-abc123.jsonl': 1000 })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(tc.subagent).toEqual({
      agentId: 'abc123',
      status: 'cancelled',
    })
  })

  it('uses correct directory path based on agentSlug and sessionId', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue(['agent-xyz.jsonl'])
    setupStatMtimes({ 'agent-xyz.jsonl': 1000 })

    await resolveInterruptedSubagents(items, 'my-agent', 'sess-42')

    // getAgentSessionsDir returns '/mock/sessions', so the path should be:
    expect(mockReaddir).toHaveBeenCalledWith('/mock/sessions/sess-42/subagents')
  })

  // --------------------------------------------------------------------------
  // Multiple subagents — ordering
  // --------------------------------------------------------------------------

  it('matches multiple interrupted Task calls to subagent files by mtime order', async () => {
    const tc1 = makeTaskToolCall('tool-1')
    const tc2 = makeTaskToolCall('tool-2')
    const items: TransformedItem[] = [
      makeAssistantMsg([tc1], 'msg-1'),
      makeAssistantMsg([tc2], 'msg-2'),
    ]

    mockReaddir.mockResolvedValue(['agent-second.jsonl', 'agent-first.jsonl'])
    setupStatMtimes({
      'agent-first.jsonl': 1000,   // created first
      'agent-second.jsonl': 2000,  // created second
    })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    // tc1 (first unresolved) → agent-first (earliest mtime)
    expect(tc1.subagent).toEqual({ agentId: 'first', status: 'cancelled' })
    // tc2 (second unresolved) → agent-second (later mtime)
    expect(tc2.subagent).toEqual({ agentId: 'second', status: 'cancelled' })
  })

  // --------------------------------------------------------------------------
  // Mix of resolved and unresolved
  // --------------------------------------------------------------------------

  it('skips already-resolved Task calls and only resolves unresolved ones', async () => {
    const resolvedTc = makeTaskToolCall('tool-1', {
      result: 'done',
      subagent: { agentId: 'already-resolved', status: 'completed' },
    })
    const unresolvedTc = makeTaskToolCall('tool-2')
    const items: TransformedItem[] = [
      makeAssistantMsg([resolvedTc], 'msg-1'),
      makeAssistantMsg([unresolvedTc], 'msg-2'),
    ]

    mockReaddir.mockResolvedValue([
      'agent-already-resolved.jsonl',
      'agent-new-one.jsonl',
    ])
    setupStatMtimes({
      'agent-already-resolved.jsonl': 1000,
      'agent-new-one.jsonl': 2000,
    })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    // Resolved one stays unchanged
    expect(resolvedTc.subagent).toEqual({ agentId: 'already-resolved', status: 'completed' })
    // Unresolved one gets the unmatched file (already-resolved is excluded)
    expect(unresolvedTc.subagent).toEqual({ agentId: 'new-one', status: 'cancelled' })
  })

  // --------------------------------------------------------------------------
  // Edge: more unresolved calls than files
  // --------------------------------------------------------------------------

  it('leaves extra unresolved calls untouched when fewer files than calls', async () => {
    const tc1 = makeTaskToolCall('tool-1')
    const tc2 = makeTaskToolCall('tool-2')
    const tc3 = makeTaskToolCall('tool-3')
    const items: TransformedItem[] = [
      makeAssistantMsg([tc1, tc2, tc3]),
    ]

    mockReaddir.mockResolvedValue(['agent-only-one.jsonl'])
    setupStatMtimes({ 'agent-only-one.jsonl': 1000 })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(tc1.subagent).toEqual({ agentId: 'only-one', status: 'cancelled' })
    expect(tc2.subagent).toBeUndefined()
    expect(tc3.subagent).toBeUndefined()
  })

  // --------------------------------------------------------------------------
  // Edge: more files than unresolved calls
  // --------------------------------------------------------------------------

  it('only uses as many files as needed when more files than unresolved calls', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue([
      'agent-aaa.jsonl',
      'agent-bbb.jsonl',
      'agent-ccc.jsonl',
    ])
    setupStatMtimes({
      'agent-aaa.jsonl': 3000,
      'agent-bbb.jsonl': 1000,  // earliest
      'agent-ccc.jsonl': 2000,
    })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    // Should pick the earliest one (bbb, mtime 1000)
    expect(tc.subagent).toEqual({ agentId: 'bbb', status: 'cancelled' })
  })

  // --------------------------------------------------------------------------
  // Non-agent files in subagents directory
  // --------------------------------------------------------------------------

  it('ignores non-agent files in the subagents directory', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue([
      'README.md',
      '.DS_Store',
      'not-agent-file.jsonl',
      'something-agent-fake.jsonl',
      'agent-real-one.jsonl',
    ])
    setupStatMtimes({
      'agent-real-one.jsonl': 1000,
    })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    // Should only match agent-*.jsonl files
    expect(tc.subagent?.agentId).toBe('real-one')
  })

  // --------------------------------------------------------------------------
  // Stat failure for a file
  // --------------------------------------------------------------------------

  it('skips files whose stat() call fails', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue(['agent-broken.jsonl', 'agent-good.jsonl'])
    mockStat.mockImplementation((filePath: string) => {
      if (filePath.endsWith('agent-broken.jsonl')) {
        return Promise.reject(new Error('EACCES'))
      }
      return Promise.resolve({ mtimeMs: 1000 })
    })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(tc.subagent).toEqual({ agentId: 'good', status: 'cancelled' })
  })

  // --------------------------------------------------------------------------
  // Non-Task tool calls are not affected
  // --------------------------------------------------------------------------

  it('does not modify non-Task tool calls', async () => {
    const bashTc = makeRegularToolCall('bash-1')
    const taskTc = makeTaskToolCall('task-1')
    const items: TransformedItem[] = [
      makeAssistantMsg([bashTc, taskTc]),
    ]

    mockReaddir.mockResolvedValue(['agent-sub1.jsonl'])
    setupStatMtimes({ 'agent-sub1.jsonl': 1000 })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(bashTc.subagent).toBeUndefined()
    expect(taskTc.subagent).toEqual({ agentId: 'sub1', status: 'cancelled' })
  })

  // --------------------------------------------------------------------------
  // Task tool call with result but no subagent (edge case)
  // --------------------------------------------------------------------------

  it('resolves Task calls that have a result but no subagent info', async () => {
    // This could happen if the tool result was written but without the agentId metadata
    const tc = makeTaskToolCall('tool-1', { result: 'some result' })
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue(['agent-discovered.jsonl'])
    setupStatMtimes({ 'agent-discovered.jsonl': 1000 })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(tc.subagent).toEqual({ agentId: 'discovered', status: 'cancelled' })
  })

  // --------------------------------------------------------------------------
  // Empty subagents directory
  // --------------------------------------------------------------------------

  it('does nothing when subagents directory is empty', async () => {
    const tc = makeTaskToolCall('tool-1')
    const items: TransformedItem[] = [makeAssistantMsg([tc])]

    mockReaddir.mockResolvedValue([])

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(tc.subagent).toBeUndefined()
  })

  // --------------------------------------------------------------------------
  // Multiple tool calls in a single message
  // --------------------------------------------------------------------------

  it('resolves multiple Task calls within a single assistant message', async () => {
    const tc1 = makeTaskToolCall('tool-1')
    const tc2 = makeTaskToolCall('tool-2')
    const items: TransformedItem[] = [
      makeAssistantMsg([makeRegularToolCall('bash-1'), tc1, makeRegularToolCall('bash-2'), tc2]),
    ]

    mockReaddir.mockResolvedValue(['agent-first.jsonl', 'agent-second.jsonl'])
    setupStatMtimes({
      'agent-first.jsonl': 1000,
      'agent-second.jsonl': 2000,
    })

    await resolveInterruptedSubagents(items, 'my-agent', 'session-1')

    expect(tc1.subagent).toEqual({ agentId: 'first', status: 'cancelled' })
    expect(tc2.subagent).toEqual({ agentId: 'second', status: 'cancelled' })
  })
})
