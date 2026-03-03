/**
 * Pre-server setup script for E2E tests.
 *
 * Runs BEFORE the Vite dev server starts (called from the webServer command
 * in playwright configs) so that settings.json is on disk before the first
 * call to getSettings(), which caches the result for the lifetime of the process.
 *
 * Usage:
 *   SUPERAGENT_DATA_DIR=.e2e-data node e2e/setup-e2e-data.js
 *   SUPERAGENT_DATA_DIR=.e2e-data-auth AUTH_MODE=true node e2e/setup-e2e-data.js
 */
const fs = require('fs')
const path = require('path')

const dataDir = process.env.SUPERAGENT_DATA_DIR
if (!dataDir) {
  console.error('[E2E Setup] SUPERAGENT_DATA_DIR not set')
  process.exit(1)
}

const resolvedDir = path.resolve(dataDir)

// Create directory
fs.mkdirSync(resolvedDir, { recursive: true })

// Remove DB files
for (const file of ['superagent.db', 'superagent.db-wal', 'superagent.db-shm']) {
  try { fs.unlinkSync(path.join(resolvedDir, file)) } catch {}
}

// Remove agents directory
try { fs.rmSync(path.join(resolvedDir, 'agents'), { recursive: true }) } catch {}

// Build settings
const settings = {
  container: {
    containerRunner: 'docker',
    agentImage: 'ghcr.io/skillfulagents/superagent-agent-container-base:latest',
    resourceLimits: { cpu: 1, memory: '512m' },
  },
  app: { setupCompleted: true },
}

if (process.env.AUTH_MODE === 'true') {
  settings.apiKeys = { anthropicApiKey: 'sk-ant-e2e-mock-key' }
  settings.auth = {
    signupMode: 'open',
    passwordRequireComplexity: false,
    requireAdminApproval: false,
    passwordMinLength: 8,
  }
}

fs.writeFileSync(path.join(resolvedDir, 'settings.json'), JSON.stringify(settings, null, 2))
console.log(`[E2E Setup] Data dir prepared: ${resolvedDir}`)
