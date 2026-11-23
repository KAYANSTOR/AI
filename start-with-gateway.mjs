import { spawn } from 'node:child_process'

const root = process.cwd()
const port = String(process.env.PORT || '8080')
const children = new Map()
let stopping = false

function launch(name, args, cwd = root, env = process.env) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    stdio: 'inherit',
  })
  children.set(name, child)
  child.once('error', error => {
    console.error(name + '_process_start_failed', error.message)
    stop(1)
  })
  child.once('exit', (code, signal) => {
    if (!stopping) {
      console.error(name + '_process_exited', { code, signal })
      stop(code && code !== 0 ? code : 1)
    }
  })
  return child
}

function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
  }
  const forceExit = setTimeout(() => {
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }
    process.exit(code)
  }, 8000)
  forceExit.unref()
  process.exitCode = code
}

process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))

launch('whatsapp_gateway', ['apps/whatsapp-gateway/src/server.js'])

const ownerConsoleEnv = {
  ...process.env,
  PORT: String(process.env.OWNER_CONSOLE_PORT || '8090'),
  KAYAN_OWNER_DB_PATH: process.env.OWNER_CONSOLE_DB_PATH || '/data/kayan_owner.db',
  CREDENTIAL_ENCRYPTION_KEY: process.env.OWNER_CONSOLE_CREDENTIAL_ENCRYPTION_KEY || '',
  OWNER_EMAIL: process.env.OWNER_CONSOLE_OWNER_EMAIL || 'jarallhalkboudi@gmail.com',
  OWNER_PASSCODE: process.env.OWNER_CONSOLE_OWNER_PASSCODE || '',
}
// The owner console keeps its own SQLite store for owner sessions and audit logs,
// while its platform data adapter uses the same canonical Railway PostgreSQL URL.
launch('owner_console', ['--import', 'tsx', 'server.ts'], `${root}/apps/owner-console`, ownerConsoleEnv)

launch('kayan_web', [`${root}/node_modules/next/dist/bin/next`, 'start', '-H', '0.0.0.0', '-p', port], `${root}/apps/web`)
