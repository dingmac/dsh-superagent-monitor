/**
 * Host half of the Superagent monitor bundle.
 *
 * Reads (read-only) the launchd job that supervises the standalone
 * dsh-superagent process, its management API (`/orchestrator/api/*`), and the
 * tail of the process logs — and, on explicit same-origin POST requests:
 *
 *   - starts, stops, or restarts the service through the repository's own
 *     `scripts/dsh-superagent` control script (never by signalling a PID);
 *   - lists the plugins installed in this dashboard's profile and syncs the
 *     selected ones into the superagent profile through `dsh plugin add`;
 *   - follows each synced plugin's state in superagent (dependency, bundle,
 *     installed contents, and whether the running service picked it up);
 *   - keeps an "auto sync" switch: a newly installed dashboard plugin is
 *     copied to superagent automatically on the next poll.
 *
 * The browser half polls `POST /_dsh/superagent-monitor/snapshot` on the same
 * origin and issues the mutations with POST as well.
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, open, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { homedir } from 'node:os'
import path from 'node:path'

export const ROUTE_PREFIX = '/_dsh/superagent-monitor'

/** Loopback-only API: a configured non-loopback URL is refused rather than contacted. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
const CACHE_MS = 4000
const MAX_TAIL_BYTES = 96 * 1024
const OPERATION_LOG_LIMIT = 120
const OUTPUT_TAIL_LIMIT = 64 * 1024
const BACKUP_KEEP = 5
const AUTO_SYNC_INTERVAL_MS = 5000
const SERVICE_START_TIMEOUT_MS = 150000
const SERVICE_STOP_TIMEOUT_MS = 330000
const PLUGIN_INSTALL_TIMEOUT_MS = 300000
const MAX_BODY_BYTES = 64 * 1024
const MAX_SYNC_NAMES = 50
const MAX_NAME_LENGTH = 160
const BASE_PATH = '/opt/homebrew/bin:/usr/local/bin:/opt/homebrew/sbin:/usr/bin:/bin:/usr/sbin:/sbin'
const HOST_VERSION = '1.4.0'

const expandHome = (value) =>
  value.startsWith('~/') ? path.join(homedir(), value.slice(2)) : value

const pickText = (value, fallback) =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback

/** Resolve the row config with the same defaults the panel describes in its footer. */
export function normalizeConfig(config) {
  const raw = config && typeof config === 'object' ? config : {}
  const dshHome = expandHome(pickText(raw.sourceHome, process.env.DSH_HOME || '~/.dsh'))
  return {
    root: expandHome(pickText(raw.root, '~/src/dsh-superagent')),
    profile: pickText(raw.profile, 'superagent'),
    url: pickText(raw.url, 'http://127.0.0.1:3082').replace(/\/+$/, ''),
    stateDir: expandHome(pickText(raw.stateDir, '~/.dsh-superagent')),
    launchdLabel: pickText(raw.launchdLabel, ''),
    launchAgentsDir: expandHome(pickText(raw.launchAgentsDir, '~/Library/LaunchAgents')),
    sourceHome: dshHome,
    sourceProfile: pickText(raw.sourceProfile, ''),
    stateFile: expandHome(pickText(raw.stateFile, path.join(dshHome, 'state', 'superagent-monitor', 'state.json'))),
    dshBin: pickText(raw.dshBin, ''),
    python: pickText(raw.python, 'python3'),
    restartAfterSync: raw.restartAfterSync === true,
    chatThread: pickText(raw.chatThread, 'main'),
    chatFileRoots: chatFileRoots(raw.chatFileRoots, expandHome(pickText(raw.root, '~/src/dsh-superagent'))),
  }
}

/** Roots a conversation file link may read; the defaults are the superagent state and work areas. */
function chatFileRoots(value, repoRoot) {
  const fallback = [
    path.join(homedir(), '.dsh', 'state', 'superagent'),
    '/Volumes/NASData/dingmac/superagent-work',
    '/Volumes/NASData/dingmac/DSH产出',
    repoRoot,
    path.join(homedir(), 'Desktop'),
    path.join(homedir(), 'Downloads'),
    path.join(homedir(), 'Documents'),
  ]
  const list = Array.isArray(value) ? value : fallback
  const roots = list
    .filter((entry) => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => expandHome(entry.trim()))
  return roots.length > 0 ? roots : fallback
}

function run(command, args, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let child
    try {
      child = execFile(command, args, { timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
        resolve({
          ok: error === null || error === undefined,
          code: error && typeof error.code === 'number' ? error.code : 0,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
        })
      })
    } catch (error) {
      resolve({ ok: false, code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error) })
      return
    }
    child.on('error', (error) => {
      /* execFile also calls back; resolve twice is harmless. */
      resolve({ ok: false, code: -1, stdout: '', stderr: error instanceof Error ? error.message : String(error) })
    })
  })
}

function respond(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/** GET a JSON document from the local superagent, bounded by a timeout. */
function getJson(target, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let url
    try {
      url = new URL(target)
    } catch (error) {
      finish({ ok: false, error: `Invalid URL: ${error.message}` })
      return
    }
    if (!LOOPBACK.has(url.hostname)) {
      finish({ ok: false, error: `Refused non-loopback host ${url.hostname}` })
      return
    }
    const request = http.request(
      url,
      { method: 'GET', headers: { accept: 'application/json', 'x-orchestrator-request': '1' } },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            finish({ ok: false, status: response.statusCode, error: text.slice(0, 400) || `HTTP ${response.statusCode}` })
            return
          }
          try {
            finish({ ok: true, status: response.statusCode, value: text ? JSON.parse(text) : {} })
          } catch {
            finish({ ok: false, status: response.statusCode, error: 'The API answer was not JSON' })
          }
        })
      },
    )
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timed out')))
    request.on('error', (error) => finish({ ok: false, error: error.message }))
    request.end()
  })
}

const SECRET_PATTERNS = [
  [/([?&]token=)[A-Za-z0-9._~-]+/g, '$1***'],
  [/(github_pat_)[A-Za-z0-9_]+/g, '$1***'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, 'sk-***'],
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1***'],
]

function redactLine(line) {
  let value = line
  for (const [pattern, replacement] of SECRET_PATTERNS) value = value.replace(pattern, replacement)
  return value
}

/** Read at most the last `lines` lines without loading a very large log into memory. */
async function tailFile(file, lines) {
  try {
    const info = await stat(file)
    if (!info.isFile()) return { path: file, lines: [], error: 'Not a regular file' }
    let text
    if (info.size > MAX_TAIL_BYTES) {
      const handle = await open(file, 'r')
      try {
        const buffer = Buffer.alloc(MAX_TAIL_BYTES)
        await handle.read(buffer, 0, MAX_TAIL_BYTES, info.size - MAX_TAIL_BYTES)
        text = buffer.toString('utf8')
        text = text.slice(text.indexOf('\n') + 1)
      } finally {
        await handle.close()
      }
    } else {
      text = await readFile(file, 'utf8')
    }
    const rows = text.split(/\r?\n/)
    if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop()
    return { path: file, lines: rows.slice(-lines).map(redactLine), size: info.size, mtime: info.mtime.toISOString() }
  } catch (error) {
    return { path: file, lines: [], error: error instanceof Error ? error.message : String(error) }
  }
}

function plistString(document, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(document)
  return match ? match[1] : undefined
}

/** Find the launchd job: an explicit label, or the first LaunchAgent that runs dsh-superagent. */
async function detectLabel(config) {
  if (config.launchdLabel) {
    return {
      label: config.launchdLabel,
      detected: false,
      plistPath: path.join(config.launchAgentsDir, `${config.launchdLabel}.plist`),
    }
  }
  try {
    for (const name of (await readdir(config.launchAgentsDir)).sort()) {
      if (!name.endsWith('.plist')) continue
      const file = path.join(config.launchAgentsDir, name)
      let document = ''
      try {
        document = await readFile(file, 'utf8')
      } catch {
        continue
      }
      if (!document.includes('dsh-superagent')) continue
      const label = plistString(document, 'Label')
      if (label) return { label, detected: true, plistPath: file }
    }
  } catch {
    /* A missing LaunchAgents directory means "no job found", not a failure. */
  }
  return { label: '', detected: false, plistPath: undefined }
}

async function serviceStatus(config, labelInfo) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 501
  const target = labelInfo.label ? `gui/${uid}/${labelInfo.label}` : ''
  const printed = target ? await run('/bin/launchctl', ['print', target]) : { stdout: '' }
  const output = printed.stdout
  const number = (pattern) => {
    const match = pattern.exec(output)
    return match ? Number(match[1]) : null
  }
  let document = ''
  if (labelInfo.plistPath) {
    try {
      document = await readFile(labelInfo.plistPath, 'utf8')
    } catch {
      /* The job can stay loaded while its plist is missing; keep the launchctl facts. */
    }
  }
  const state = /^\s*state = (.+)$/m.exec(output)?.[1]?.trim() ?? null
  const stdoutPath = document ? plistString(document, 'StandardOutPath') ?? null : null
  const stderrPath = document ? plistString(document, 'StandardErrorPath') ?? null : null
  const printedStdout = /^\s*stdout path = (.+)$/m.exec(output)?.[1]?.trim() ?? null
  const printedStderr = /^\s*stderr path = (.+)$/m.exec(output)?.[1]?.trim() ?? null
  const interval = /<key>StartInterval<\/key>\s*<integer>(\d+)<\/integer>/.exec(document)
  const [stdoutTail, stderrTail] = await Promise.all([
    stdoutPath || printedStdout ? tailFile(stdoutPath ?? printedStdout, 12) : null,
    stderrPath || printedStderr ? tailFile(stderrPath ?? printedStderr, 8) : null,
  ])
  return {
    label: labelInfo.label || null,
    detected: labelInfo.detected,
    loaded: Boolean(labelInfo.label) && state !== null,
    state,
    running: state === 'running',
    pid: number(/^\s*pid = (\d+)$/m),
    runs: number(/^\s*runs = (\d+)$/m),
    lastExitCode: number(/^\s*last exit code = (-?\d+)$/m),
    intervalSeconds: interval ? Number(interval[1]) : null,
    plistPath: labelInfo.plistPath ?? null,
    stdoutPath: stdoutPath ?? printedStdout,
    stderrPath: stderrPath ?? printedStderr,
    stdoutTail,
    stderrTail,
    message: labelInfo.label ? null : 'No launchd job declares dsh-superagent',
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

/** Start time of a process, in epoch milliseconds; null when ps cannot tell. */
async function processStartedAt(pid) {
  if (!pid) return null
  const printed = await run('/bin/ps', ['-p', String(pid), '-o', 'lstart='])
  const text = printed.stdout.trim()
  if (!printed.ok || text === '') return null
  const value = Date.parse(text)
  return Number.isNaN(value) ? null : value
}

async function latestLog(config) {
  const directory = path.join(config.root, '.artifacts')
  const prefix = `dsh-superagent-${config.profile}-`
  try {
    let newest = null
    for (const name of await readdir(directory)) {
      if (!name.startsWith(prefix) || !name.endsWith('.log')) continue
      const file = path.join(directory, name)
      const info = await stat(file)
      if (newest === null || info.mtimeMs > newest.mtimeMs) newest = { file, mtimeMs: info.mtimeMs }
    }
    return newest ? tailFile(newest.file, 40) : null
  } catch {
    return null
  }
}

function pickTicket(ticket) {
  return {
    id: ticket.id,
    title: ticket.title,
    state: ticket.state,
    stage: ticket.stage,
    action: ticket.action ?? null,
    attention: ticket.attention?.question ?? null,
    summary: ticket.summary ?? '',
    assignments: ticket.assignments ?? 0,
    createdAt: ticket.createdAt ?? null,
    updatedAt: ticket.updatedAt ?? null,
  }
}

async function probeSuperagent(config) {
  const controlDir = path.join(config.root, '.artifacts', 'control', 'profiles', config.profile)
  let pid = null
  try {
    const raw = (await readFile(path.join(controlDir, 'service.pid'), 'utf8')).trim()
    pid = Number(raw) || null
  } catch {
    /* No recorded pid; the API answer still describes the running instance. */
  }
  const manuallyStopped = existsSync(path.join(controlDir, 'manually-stopped'))
  const state = await getJson(`${config.url}/orchestrator/api/state`)
  const startedAt = pid !== null && isAlive(pid) ? await processStartedAt(pid) : null
  const base = {
    url: config.url,
    root: config.root,
    profile: config.profile,
    stateDir: config.stateDir,
    reachable: state.ok,
    error: state.ok ? null : state.error ?? 'Unreachable',
    pid,
    pidAlive: pid !== null ? isAlive(pid) : false,
    startedAt,
    manuallyStopped,
  }
  if (!state.ok) {
    return {
      ...base,
      health: [],
      errors: [],
      paused: null,
      load: null,
      setup: null,
      overview: null,
      overviewError: null,
      tickets: [],
      ticketsTotal: null,
      ticketsError: null,
      log: await latestLog(config),
    }
  }
  const value = state.value ?? {}
  const health = Object.entries(value.health ?? {}).map(([name, entry]) => ({
    name,
    state: entry?.state ?? 'unknown',
    at: entry?.at ?? null,
    detail: entry?.detail ?? '',
  }))
  health.sort((a, b) => {
    if (a.name === 'runtime') return -1
    if (b.name === 'runtime') return 1
    return a.name.localeCompare(b.name)
  })
  const [overview, tickets, log] = await Promise.all([
    getJson(`${config.url}/orchestrator/api/overview`),
    getJson(`${config.url}/orchestrator/api/tickets?state=open&limit=8`),
    latestLog(config),
  ])
  const problems = (overview.ok ? overview.value.problems ?? [] : []).map((problem) => ({
    kind: problem.kind,
    name: problem.name ?? null,
    detail: problem.detail ?? null,
    source: problem.source ? { id: problem.source.id, title: problem.source.title } : null,
    thread: problem.thread ? { title: problem.thread.title, source: problem.thread.source } : null,
  }))
  return {
    ...base,
    paused: value.paused ?? null,
    load: value.load ?? null,
    setup: value.setup ?? null,
    health,
    errors: health.filter((entry) => entry.state === 'error'),
    overview: overview.ok
      ? {
          flow: overview.value.flow ?? null,
          executor: overview.value.executor ?? null,
          policyVersion: overview.value.policyVersion ?? null,
          problems,
          person: (overview.value.person ?? []).map(pickTicket),
        }
      : null,
    overviewError: overview.ok ? null : overview.error ?? 'Unreachable',
    tickets: tickets.ok ? (tickets.value.items ?? []).map(pickTicket) : [],
    ticketsTotal: tickets.ok ? tickets.value.total ?? null : null,
    ticketsError: tickets.ok ? null : tickets.error ?? 'Unreachable',
    log,
  }
}

/* -------------------------------------------------------------------------- */
/* Profiles: the dashboard (source) and superagent (target)                    */
/* -------------------------------------------------------------------------- */

function argvProfile() {
  const argv = process.argv.slice(2)
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--profile' && argv[index + 1]) return argv[index + 1]
    const match = /^--profile=(.+)$/.exec(argument)
    if (match) return match[1]
  }
  return ''
}

/** Which profile this plugin itself runs in: config, env, argv, then the desktop default. */
function resolveSource(config) {
  const home = config.sourceHome
  let profile = config.sourceProfile
  if (!profile) profile = pickText(process.env.DSH_PROFILE, '')
  if (!profile) profile = argvProfile()
  if (!profile) {
    for (const candidate of ['desktop', 'web', 'tui']) {
      if (existsSync(path.join(home, 'profiles', candidate, 'package.json'))) {
        profile = candidate
        break
      }
    }
  }
  if (!profile) profile = 'desktop'
  const dir = path.join(home, 'profiles', profile)
  return { home, profile, dir, packageFile: path.join(dir, 'package.json') }
}

function resolveTarget(config) {
  const home = config.stateDir
  const profile = config.profile
  const dir = path.join(home, 'profiles', profile)
  return { home, profile, dir, packageFile: path.join(dir, 'package.json') }
}

/** True when the monitor runs inside the superagent instance itself (nothing to sync). */
function sameProfile(source, target) {
  return path.resolve(source.dir) === path.resolve(target.dir)
}

/** Read a profile manifest plus its mtime; a missing or broken file is a fact, not a crash. */
async function readProfile(target) {
  try {
    const [text, info] = await Promise.all([readFile(target.packageFile, 'utf8'), stat(target.packageFile)])
    try {
      return { ok: true, manifest: JSON.parse(text), mtimeMs: info.mtimeMs, error: null }
    } catch (error) {
      return { ok: false, manifest: null, mtimeMs: info.mtimeMs, error: `package.json 不是合法 JSON：${error.message}` }
    }
  } catch (error) {
    return { ok: false, manifest: null, mtimeMs: 0, error: `无法读取 ${target.packageFile}：${error.message}` }
  }
}

function manifestDependencies(manifest) {
  return manifest && typeof manifest.dependencies === 'object' && manifest.dependencies !== null ? manifest.dependencies : {}
}

function manifestBundles(manifest) {
  const bundles = manifest?.dsh?.profile?.bundles
  return Array.isArray(bundles) ? bundles.filter((name) => typeof name === 'string') : []
}

/** Installed version and install timestamp of `name` in a profile's node_modules. */
async function readInstalled(target, name) {
  const file = path.join(target.dir, 'node_modules', name, 'package.json')
  try {
    const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
    let version = null
    try {
      version = JSON.parse(text).version ?? null
    } catch {
      version = null
    }
    return { installed: true, version, mtimeMs: info.mtimeMs }
  } catch {
    return { installed: false, version: null, mtimeMs: 0 }
  }
}

/** Whether `file` exists and carries an executable bit (the control script contract). */
async function isExecutable(file) {
  try {
    const info = await stat(file)
    return info.isFile() && (info.mode & 0o111) !== 0
  } catch {
    return false
  }
}

/** Every plugin installed in the dashboard profile, with its bundle selection. */
async function readCatalog(config, source) {
  const profile = await readProfile(source)
  if (!profile.ok) throw new Error(profile.error)
  const dependencies = manifestDependencies(profile.manifest)
  const bundles = manifestBundles(profile.manifest)
  const bundleSet = new Set(bundles)
  const items = []
  for (const [name, spec] of Object.entries(dependencies)) {
    if (name.startsWith('@deepseek-ai/')) continue
    const installed = await readInstalled(source, name)
    items.push({
      name,
      spec: String(spec),
      version: installed.version,
      enabled: bundleSet.has(name),
    })
  }
  items.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name))
  return { items, bundles }
}

/* -------------------------------------------------------------------------- */
/* Persistent monitor state (auto-sync switch, sync bookkeeping)              */
/* -------------------------------------------------------------------------- */

const EMPTY_STATE = Object.freeze({
  autoSync: false,
  restartAfterSync: false,
  known: [],
  ignored: [],
  managed: {},
  lastSyncAt: null,
  lastError: null,
})

async function readState(config) {
  try {
    const value = JSON.parse(await readFile(config.stateFile, 'utf8'))
    if (!value || typeof value !== 'object') return { ...EMPTY_STATE, known: [], managed: {} }
    return {
      ...EMPTY_STATE,
      ...value,
      autoSync: value.autoSync === true,
      restartAfterSync: value.restartAfterSync === true,
      known: Array.isArray(value.known) ? value.known.filter((name) => typeof name === 'string') : [],
      ignored: Array.isArray(value.ignored) ? value.ignored.filter((name) => typeof name === 'string') : [],
      managed: value.managed && typeof value.managed === 'object' && !Array.isArray(value.managed) ? value.managed : {},
      lastSyncAt: typeof value.lastSyncAt === 'string' ? value.lastSyncAt : null,
      lastError: typeof value.lastError === 'string' ? value.lastError : null,
    }
  } catch {
    return { ...EMPTY_STATE, known: [], managed: {} }
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  await writeFile(temporary, JSON.stringify(value, undefined, 2) + '\n', { mode: 0o600 })
  await rename(temporary, file)
}

async function writeState(config, state) {
  await writeJsonAtomic(config.stateFile, state)
}

/** Leave a load mark so a restart of the host half can be confirmed without browser access. */
async function markHostLoaded(config) {
  try {
    const file = path.join(path.dirname(config.stateFile), 'host.json')
    await writeJsonAtomic(file, {
      version: HOST_VERSION,
      loadedAt: new Date().toISOString(),
      pid: process.pid,
      sourceHome: config.sourceHome,
      sourceProfile: config.sourceProfile || null,
      targetProfile: config.profile,
    })
  } catch {
    /* A marker is diagnostics, never a startup requirement. */
  }
}

/** Append a bounded host-side error record for later inspection. */
async function recordHostError(config, scope, error) {
  try {
    const directory = path.dirname(config.stateFile)
    await mkdir(directory, { recursive: true })
    const file = path.join(directory, 'host-errors.log')
    const line = `${new Date().toISOString()} ${scope}: ${error instanceof Error ? error.message : String(error)}\n`
    const previous = await readFile(file, 'utf8').catch(() => '')
    await writeFile(file, (previous + line).slice(-64 * 1024), { mode: 0o600 })
  } catch {
    /* Diagnostics only. */
  }
}

async function backupFile(file) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = `${file}.bak.${stamp}`
    await copyFile(file, backup)
    const directory = path.dirname(file)
    const base = path.basename(file) + '.bak.'
    const names = (await readdir(directory)).filter((name) => name.startsWith(base)).sort()
    for (const name of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
      await unlink(path.join(directory, name)).catch(() => {})
    }
  } catch {
    /* A backup is a courtesy; the atomic write is the guarantee. */
  }
}

/* -------------------------------------------------------------------------- */
/* Child processes                                                            */
/* -------------------------------------------------------------------------- */

function runEnvironment(config) {
  return {
    ...process.env,
    DSH_HOME: config.stateDir,
    PATH: `${BASE_PATH}:${process.env.PATH ?? ''}`,
  }
}

/** Stop a detached child and everything it started, escalating to SIGKILL. */
function killTree(child, signal) {
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* Already gone. */
    }
  }
}

/** Run a command, streaming redacted lines to `onLine`; never rejects. */
function execStreaming(command, args, options, onLine) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      })
    } catch (error) {
      resolve({ ok: false, code: -1, output: String(error?.message ?? error), timedOut: false })
      return
    }
    let output = ''
    let settled = false
    let timedOut = false
    let killTimer = null
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child, 'SIGTERM')
      killTimer = setTimeout(() => killTree(child, 'SIGKILL'), 5000)
      if (typeof killTimer.unref === 'function') killTimer.unref()
    }, options.timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()

    const consume = (stream, prefix) => {
      stream.setEncoding('utf8')
      let buffer = ''
      stream.on('data', (chunk) => {
        buffer += chunk
        let index = buffer.indexOf('\n')
        while (index >= 0) {
          const line = buffer.slice(0, index)
          buffer = buffer.slice(index + 1)
          output = (output + line + '\n').slice(-OUTPUT_TAIL_LIMIT)
          onLine?.(prefix + redactLine(line))
          index = buffer.indexOf('\n')
        }
      })
      stream.on('end', () => {
        if (buffer !== '') {
          output = (output + buffer + '\n').slice(-OUTPUT_TAIL_LIMIT)
          onLine?.(prefix + redactLine(buffer))
        }
      })
    }
    consume(child.stdout, '')
    consume(child.stderr, '[stderr] ')

    const finish = (code, error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer !== null) clearTimeout(killTimer)
      resolve({
        ok: !timedOut && error === undefined && code === 0,
        code: timedOut ? 124 : code ?? -1,
        output,
        timedOut,
        error: error?.message ?? null,
      })
    }
    child.on('error', (error) => finish(-1, error))
    child.on('close', (code) => finish(code ?? -1))
  })
}

/** Resolve a relative link/file spec against the profile that recorded it. */
function absoluteSpec(spec, baseDir) {
  const value = String(spec ?? '').trim()
  const match = /^(link|file|portal):(\.{1,2}[\\/].*)$/.exec(value)
  if (match === null) return value
  return `${match[1]}:${path.resolve(baseDir, match[2])}`
}

/** Turn a manifest dependency spec into what `dsh plugin add` accepts. */
function installSpec(name, spec) {
  const value = String(spec ?? '').trim()
  if (/^(?:link|file|portal|workspace):/.test(value)) return value
  if (/^(?:git\+|git:|github:|https?:)/.test(value)) return value
  if (/^npm:/.test(value)) return `${name}@${value}`
  if (value === '' || value === '*') return name
  return `${name}@${value}`
}

/** The `dsh` executable: configured, in PATH, then the two Homebrew locations. */
function resolveDsh(config) {
  if (config.dshBin && existsSync(config.dshBin)) return config.dshBin
  const env = runEnvironment(config)
  for (const directory of env.PATH.split(':')) {
    if (!directory) continue
    const candidate = path.join(directory, 'dsh')
    if (existsSync(candidate)) return candidate
  }
  return 'dsh'
}

/* -------------------------------------------------------------------------- */
/* Operations: one background job at a time, reported through the snapshot     */
/* -------------------------------------------------------------------------- */

let operation = null
const pendingAuto = new Set()
let autoTimer = null
let autoTickRunning = false

function pushLog(op, line) {
  if (typeof line !== 'string') return
  const clean = line.length > 2000 ? `${line.slice(0, 2000)}…` : line
  op.log.push(clean)
  if (op.log.length > OPERATION_LOG_LIMIT) op.log.splice(0, op.log.length - OPERATION_LOG_LIMIT)
}

function tailText(text, limit = 1200) {
  const value = String(text ?? '').trim()
  return value.length > limit ? `…${value.slice(-limit)}` : value
}

function beginOperation(rawConfig, spec) {
  if (operation !== null && operation.status === 'running') return null
  const config = normalizeConfig(rawConfig)
  const op = {
    id: `op-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    kind: spec.kind,
    action: spec.action,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    message: spec.message ?? '正在执行…',
    log: [],
    names: spec.names ?? [],
    exitCode: null,
  }
  operation = op
  void runOperation(config, op).catch((error) => {
    finishOperation(op, 'error', error instanceof Error ? error.message : String(error), null)
  })
  return op
}

function finishOperation(op, status, message, exitCode = null) {
  op.status = status
  op.finishedAt = new Date().toISOString()
  op.message = message
  op.exitCode = exitCode
  if (op.log.length === 0 || op.log[op.log.length - 1] !== message) pushLog(op, message)
  cacheInvalidate()
  setTimeout(() => {
    void drainAutoSync()
  }, 50).unref?.()
}

async function runOperation(config, op) {
  if (op.kind === 'service') {
    const message = await executeService(config, op)
    finishOperation(op, 'ok', message, 0)
    return
  }
  if (op.kind === 'sync') {
    await executeSync(config, op)
    return
  }
  if (op.kind === 'unsync') {
    await executeUnsync(config, op)
    return
  }
  throw new Error(`未知操作类型：${op.kind}`)
}

async function executeService(config, op) {
  const script = path.join(config.root, 'scripts', 'dsh-superagent')
  if (!(await isExecutable(script))) throw new Error(`找不到服务控制脚本（或不可执行）：${script}`)
  const action = op.action === 'restart' ? 'restart' : op.action === 'stop' ? 'stop' : 'start'
  const timeoutMs = action === 'start' ? SERVICE_START_TIMEOUT_MS : SERVICE_STOP_TIMEOUT_MS
  pushLog(op, `$ ${config.python} ${script} ${action} --profile ${config.profile} --url ${config.url}`)
  const result = await execStreaming(
    config.python,
    [script, action, '--profile', config.profile, '--url', config.url],
    { timeoutMs, cwd: config.root, env: runEnvironment(config) },
    (line) => pushLog(op, line),
  )
  if (result.timedOut) throw new Error(`服务 ${action} 超时（${Math.round(timeoutMs / 1000)} 秒），请查看日志`)
  if (!result.ok) {
    throw new Error(`服务 ${action} 失败（退出码 ${result.code}）：${tailText(result.output)}`)
  }
  return action === 'start' ? '服务已启动' : action === 'stop' ? '服务已停止' : '服务已重启'
}

/** Install any selected plugin missing from the target, then mirror its bundle selection. */
async function executeSync(config, op) {
  const source = resolveSource(config)
  const target = resolveTarget(config)
  if (sameProfile(source, target)) throw new Error('当前看板就是 superagent 本身，无需同步插件')
  const catalog = await readCatalog(config, source)
  const byName = new Map(catalog.items.map((item) => [item.name, item]))
  let names = [...new Set(op.names)]
  if (names.length === 0) throw new Error('没有选择插件')
  if (op.action === 'auto-sync') {
    const snapshotState = await readState(config)
    const ignored = new Set(snapshotState.ignored)
    const kept = names.filter((name) => !ignored.has(name))
    if (kept.length !== names.length) pushLog(op, '已跳过忽略的插件')
    names = kept
    if (names.length === 0) {
      finishOperation(op, 'ok', '忽略的插件已跳过', 0)
      return
    }
  }
  const unknown = names.filter((name) => !byName.has(name))
  if (unknown.length > 0) throw new Error(`不是主看板已安装的插件：${unknown.join('、')}`)

  const targetProfile = await readProfile(target)
  if (!targetProfile.ok) throw new Error(`superagent profile 不可用：${targetProfile.error}`)
  const targetDependencies = manifestDependencies(targetProfile.manifest)
  const installed = new Map()
  for (const name of names) installed.set(name, await readInstalled(target, name))

  const needInstall = names.filter((name) => {
    const entry = byName.get(name)
    const spec = targetDependencies[name]
    return spec === undefined || String(spec) !== entry.spec || !installed.get(name)?.installed
  })

  if (needInstall.length > 0) {
    const args = ['plugin', '--profile', config.profile, 'add']
    for (const name of needInstall) {
      args.push(installSpec(name, absoluteSpec(byName.get(name).spec, source.dir)))
    }
    const dsh = resolveDsh(config)
    pushLog(op, `$ ${dsh} ${args.join(' ')}`)
    const result = await execStreaming(
      dsh,
      args,
      { timeoutMs: PLUGIN_INSTALL_TIMEOUT_MS, cwd: config.root, env: runEnvironment(config) },
      (line) => pushLog(op, line),
    )
    if (result.timedOut) {
      await recordFailure(config, names, `安装超时（${Math.round(PLUGIN_INSTALL_TIMEOUT_MS / 1000)} 秒）`)
      throw new Error('安装超时，请查看操作日志')
    }
    if (!result.ok) {
      const detail = tailText(result.output)
      const message = `安装失败（退出码 ${result.code}）：${detail}`
      await recordFailure(config, names, message)
      throw new Error(message)
    }
  }

  if (needInstall.length > 0) {
    const after = await readProfile(target)
    const afterDependencies = after.ok ? manifestDependencies(after.manifest) : {}
    const missing = needInstall.filter((name) => afterDependencies[name] === undefined)
    if (missing.length > 0) {
      const message = `安装命令完成但 superagent 依赖中缺少：${missing.join('、')}`
      await recordFailure(config, names, message)
      throw new Error(message)
    }
  }

  const bundleChanged = await reconcileBundles(config, target, byName, names)
  if (bundleChanged) pushLog(op, '已同步 superagent 的 bundle 选择')

  const state = await readState(config)
  const stamp = new Date().toISOString()
  const known = new Set(state.known)
  for (const name of names) {
    const entry = byName.get(name)
    known.add(name)
    state.managed[name] = {
      syncedAt: stamp,
      spec: entry.spec,
      enabled: entry.enabled,
      error: null,
      lastAttemptAt: stamp,
    }
  }
  state.known = [...known]
  state.lastSyncAt = stamp
  state.lastError = null
  await writeState(config, state)

  const summary = needInstall.length > 0
    ? `已同步 ${names.length} 个插件，其中新安装 ${needInstall.length} 个`
    : `已同步 ${names.length} 个插件的启用状态`
  pushLog(op, summary)

  if (state.restartAfterSync || config.restartAfterSync) {
    pushLog(op, '安装后自动重启 superagent…')
    const restarted = await executeService(config, { ...op, action: 'restart' })
    finishOperation(op, 'ok', `${summary}；${restarted}`, 0)
    return
  }
  finishOperation(op, 'ok', `${summary}；重启服务后生效`, 0)
}

async function executeUnsync(config, op) {
  const names = [...new Set(op.names)]
  if (names.length === 0) throw new Error('没有选择插件')
  const source = resolveSource(config)
  if (sameProfile(source, resolveTarget(config))) throw new Error('当前看板就是 superagent 本身，无需取消同步')
  const catalog = await readCatalog(config, source)
  const known = new Set(catalog.items.map((item) => item.name))
  const unknown = names.filter((name) => !known.has(name))
  if (unknown.length > 0) throw new Error(`不是主看板已安装的插件：${unknown.join('、')}`)
  const dsh = resolveDsh(config)
  const args = ['plugin', '--profile', config.profile, 'remove', ...names]
  pushLog(op, `$ ${dsh} ${args.join(' ')}`)
  const result = await execStreaming(
    dsh,
    args,
    { timeoutMs: PLUGIN_INSTALL_TIMEOUT_MS, cwd: config.root, env: runEnvironment(config) },
    (line) => pushLog(op, line),
  )
  if (!result.ok) {
    await recordFailure(config, names, `取消同步失败：${tailText(result.output)}`)
    throw new Error(`取消同步失败（退出码 ${result.code}）：${tailText(result.output)}`)
  }
  const state = await readState(config)
  for (const name of names) delete state.managed[name]
  await writeState(config, state)
  finishOperation(op, 'ok', `已取消同步 ${names.length} 个插件`, 0)
}

/** Mirror the source bundle selection for the synced names, preserving every other bundle. */
async function reconcileBundles(config, target, byName, names) {
  const profile = await readProfile(target)
  if (!profile.ok) throw new Error(profile.error)
  const manifest = profile.manifest
  const current = manifestBundles(manifest)
  const next = new Set(current)
  let changed = false
  for (const name of names) {
    const entry = byName.get(name)
    if (!entry) continue
    if (entry.enabled && !next.has(name)) {
      next.add(name)
      changed = true
    } else if (!entry.enabled && next.has(name)) {
      next.delete(name)
      changed = true
    }
  }
  if (!changed) return false
  manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...next] } }
  await backupFile(target.packageFile)
  await writeJsonAtomic(target.packageFile, manifest)
  return true
}

async function recordFailure(config, names, message) {
  try {
    const state = await readState(config)
    const stamp = new Date().toISOString()
    const known = new Set(state.known)
    for (const name of names) {
      const previous = state.managed[name] ?? {}
      known.add(name)
      state.managed[name] = { ...previous, error: message, lastAttemptAt: stamp }
    }
    state.known = [...known]
    state.lastError = message
    await writeState(config, state)
  } catch {
    /* The operation error already reaches the UI; bookkeeping is best effort. */
  }
}

/* -------------------------------------------------------------------------- */
/* Auto-sync watcher                                                          */
/* -------------------------------------------------------------------------- */

async function autoTick(config) {
  if (autoTickRunning) return
  autoTickRunning = true
  try {
    const state = await readState(config)
    if (!state.autoSync) return
    const source = resolveSource(config)
    if (sameProfile(source, resolveTarget(config))) return
    const catalog = await readCatalog(config, source)
    const ignored = new Set(state.ignored)
    const trackable = catalog.items.map((item) => item.name).filter((name) => !ignored.has(name))
    const names = new Set(trackable)
    if (state.known.length === 0 && names.size > 0) {
      state.known = [...names]
      await writeState(config, state)
      return
    }
    const removed = state.known.filter((name) => !names.has(name))
    if (removed.length > 0) {
      state.known = state.known.filter((name) => names.has(name))
      await writeState(config, state)
    }
    const fresh = trackable.filter((name) => !state.known.includes(name))
    if (fresh.length === 0) return
    if (operation !== null && operation.status === 'running') {
      for (const name of fresh) pendingAuto.add(name)
      return
    }
    const started = beginOperation(config, {
      kind: 'sync',
      action: 'auto-sync',
      names: fresh,
      message: `检测到 ${fresh.length} 个新插件，正在自动同步…`,
    })
    if (started === null) for (const name of fresh) pendingAuto.add(name)
  } catch {
    /* A dashboard profile that cannot be read yet is not worth an error banner every 5s. */
  } finally {
    autoTickRunning = false
  }
}

async function drainAutoSync() {
  if (pendingAuto.size === 0) return
  if (operation !== null && operation.status === 'running') return
  const config = autoDrainConfig
  if (config === null) {
    pendingAuto.clear()
    return
  }
  const state = await readState(config).catch(() => null)
  if (!state || !state.autoSync) {
    pendingAuto.clear()
    return
  }
  const ignored = new Set(state.ignored)
  const names = [...pendingAuto].filter((name) => !state.known.includes(name) && !ignored.has(name))
  pendingAuto.clear()
  if (names.length === 0) return
  beginOperation(config, {
    kind: 'sync',
    action: 'auto-sync',
    names,
    message: `检测到 ${names.length} 个新插件，正在自动同步…`,
  })
}

let autoDrainConfig = null

function startAutoLoop(config) {
  autoDrainConfig = config
  if (autoTimer !== null) clearInterval(autoTimer)
  autoTimer = setInterval(() => {
    void autoTick(config)
  }, AUTO_SYNC_INTERVAL_MS)
  autoTimer.unref?.()
  return autoTimer
}

function stopAutoLoop(timer) {
  if (timer !== null) clearInterval(timer)
  if (autoTimer === timer) autoTimer = null
  if (autoDrainConfig !== null && autoTimer === null) autoDrainConfig = null
  pendingAuto.clear()
}

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

let cache = { key: '', at: 0, value: undefined }

function cacheInvalidate() {
  cache = { key: '', at: 0, value: undefined }
}

const EMPTY_PLUGIN_SECTION = (source, target) => ({
  available: false,
  error: null,
  source: { home: source.home, profile: source.profile, dir: source.dir },
  target: { home: target.home, profile: target.profile, dir: target.dir },
  autoSync: false,
  restartAfterSync: false,
  items: [],
  summary: { total: 0, enabled: 0, synced: 0, active: 0, pendingRestart: 0, failed: 0, ignored: 0 },
  lastSyncAt: null,
  lastError: null,
})

function classify(entry, facts) {
  if (facts.error) return 'error'
  if (!facts.dependency) return 'not-synced'
  if (!facts.installed || !facts.bundle) return 'synced'
  /* Without a trustworthy process start time, do not claim the plugin is live. */
  if (!facts.serviceRunning || facts.startedAt === null) return 'pending-restart'
  return facts.startedAt >= facts.installedAt - 2000 ? 'active' : 'pending-restart'
}

async function pluginSection(config, agent, service) {
  const source = resolveSource(config)
  const target = resolveTarget(config)
  const section = EMPTY_PLUGIN_SECTION(source, target)
  section.sameProfile = sameProfile(source, target)
  try {
    const [catalog, targetProfile, state] = await Promise.all([
      readCatalog(config, source),
      readProfile(target),
      readState(config),
    ])
    section.available = true
    section.autoSync = state.autoSync
    section.restartAfterSync = state.restartAfterSync
    section.lastSyncAt = state.lastSyncAt
    section.lastError = state.lastError
    if (!targetProfile.ok) {
      section.available = false
      section.error = targetProfile.error
      return section
    }
    const dependencies = manifestDependencies(targetProfile.manifest)
    const bundles = new Set(manifestBundles(targetProfile.manifest))
    const startedAt = agent?.startedAt ?? null
    const serviceRunning = Boolean(agent?.reachable) || Boolean(service?.running)
    const ignoredSet = new Set(state.ignored)
    const items = []
    for (const entry of catalog.items) {
      const targetInstalled = await readInstalled(target, entry.name)
      const managed = state.managed[entry.name] ?? null
      const syncedAt = typeof managed?.syncedAt === 'string' ? managed.syncedAt : null
      const error = typeof managed?.error === 'string' ? managed.error : null
      const installedAt = Math.max(syncedAt ? Date.parse(syncedAt) || 0 : 0, targetInstalled.mtimeMs || 0)
      const facts = {
        dependency: dependencies[entry.name] !== undefined,
        bundle: bundles.has(entry.name),
        installed: targetInstalled.installed,
        installedAt,
        serviceRunning,
        startedAt,
        error,
      }
      const pluginState = classify(entry, facts)
      items.push({
        name: entry.name,
        spec: entry.spec,
        version: entry.version,
        enabled: entry.enabled,
        ignored: ignoredSet.has(entry.name),
        target: {
          dependency: facts.dependency,
          specMatch: dependencies[entry.name] !== undefined && String(dependencies[entry.name]) === entry.spec,
          bundle: facts.bundle,
          installed: facts.installed,
          version: targetInstalled.version,
          state: pluginState,
          pendingRestart: pluginState === 'pending-restart',
          syncedAt,
          error,
        },
      })
    }
    section.items = items
    const activeItems = items.filter((item) => !item.ignored)
    section.summary = {
      total: activeItems.length,
      enabled: activeItems.filter((item) => item.enabled).length,
      synced: activeItems.filter((item) => item.target.dependency).length,
      active: activeItems.filter((item) => item.target.state === 'active').length,
      pendingRestart: activeItems.filter((item) => item.target.state === 'pending-restart').length,
      failed: activeItems.filter((item) => item.target.state === 'error').length,
      ignored: items.filter((item) => item.ignored).length,
    }
    return section
  } catch (error) {
    section.available = false
    section.error = error instanceof Error ? error.message : String(error)
    return section
  }
}

/** One monitor snapshot; `fresh` skips the short-lived cache after a manual refresh. */
export async function snapshot(config, options = {}) {
  const resolved = normalizeConfig(config)
  const key = JSON.stringify(resolved)
  const now = Date.now()
  const busy = operation !== null && operation.status === 'running'
  if (!options.fresh && !busy && cache.value !== undefined && cache.key === key && now - cache.at < CACHE_MS) {
    return cache.value
  }
  const labelInfo = await detectLabel(resolved)
  const [service, superagent] = await Promise.all([
    serviceStatus(resolved, labelInfo),
    probeSuperagent(resolved),
  ])
  const source = resolveSource(resolved)
  const target = resolveTarget(resolved)
  const serviceControllable = await isExecutable(path.join(resolved.root, 'scripts', 'dsh-superagent'))
  const plugins = await pluginSection(resolved, superagent, service)
  const value = {
    generatedAt: new Date().toISOString(),
    config: {
      root: resolved.root,
      profile: resolved.profile,
      url: resolved.url,
      stateDir: resolved.stateDir,
      launchdLabel: resolved.launchdLabel || null,
      launchAgentsDir: resolved.launchAgentsDir,
      sourceHome: source.home,
      sourceProfile: source.profile,
      sourceDir: source.dir,
      targetDir: target.dir,
      stateFile: resolved.stateFile,
      restartAfterSync: plugins.restartAfterSync || resolved.restartAfterSync,
      controllable: serviceControllable,
      hostVersion: HOST_VERSION,
    },
    service: { ...service, controllable: serviceControllable },
    superagent,
    plugins,
    operation,
  }
  cache = { key, at: now, value }
  return value
}

/* -------------------------------------------------------------------------- */
/* HTTP route                                                                 */
/* -------------------------------------------------------------------------- */

function parseNames(body) {
  if (!Array.isArray(body?.names)) return null
  if (body.names.length === 0 || body.names.length > MAX_SYNC_NAMES) return null
  const names = []
  for (const value of body.names) {
    if (typeof value !== 'string') return null
    const name = value.trim()
    if (name === '' || name.length > MAX_NAME_LENGTH) return null
    names.push(name)
  }
  return [...new Set(names)]
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) {
      const error = new Error('请求体过大')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('请求体不是合法 JSON')
    error.status = 400
    throw error
  }
}

/* Chat: the Superagent conversation tab ------------------------------------ */

const CHAT_TEXT_MAX = 16 * 1024
const CHAT_TIMEOUT_MS = 2500
const CHAT_THREAD_ID = /^[a-zA-Z0-9_-]{1,64}$/
const CHAT_TARGET_KEY = /^(feishu|github):[A-Za-z0-9_.:-]{1,200}$/
const CHAT_TICKET_ID = /^[A-Za-z0-9_-]{1,120}$/
const CHAT_MESSAGE_ID = /^[A-Za-z0-9_.:-]{1,160}$/

/** One bounded JSON request to the local superagent; `headers` carries the API's own marker. */
function requestJson(target, { method = 'GET', headers = {}, body = null, timeoutMs = CHAT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let url
    try {
      url = new URL(target)
    } catch (error) {
      finish({ ok: false, status: 0, error: `Invalid URL: ${error.message}` })
      return
    }
    if (!LOOPBACK.has(url.hostname)) {
      finish({ ok: false, status: 0, error: `Refused non-loopback host ${url.hostname}` })
      return
    }
    const payload = body === null ? null : Buffer.from(JSON.stringify(body), 'utf8')
    const request = http.request(
      url,
      {
        method,
        headers: {
          accept: 'application/json',
          ...(payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let value
          try {
            value = text ? JSON.parse(text) : {}
          } catch {
            value = text.slice(0, 4000)
          }
          const status = response.statusCode ?? 0
          const ok = status >= 200 && status < 300
          finish(
            ok
              ? { ok: true, status, value }
              : {
                  ok: false,
                  status,
                  value,
                  error:
                    value && typeof value === 'object' && typeof value.error === 'string'
                      ? value.error
                      : text.slice(0, 400) || `HTTP ${status}`,
                },
          )
        })
      },
    )
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timed out')))
    request.on('error', (error) => finish({ ok: false, status: 0, error: error.message }))
    if (payload) request.write(payload)
    request.end()
  })
}

const chatDesktop = (config, apiPath, options = {}) =>
  requestJson(`${config.url}${apiPath}`, {
    ...options,
    headers: { 'x-superagent-desktop': '1', ...(options.headers ?? {}) },
  })

const chatAdmin = (config, apiPath, options = {}) =>
  requestJson(`${config.url}${apiPath}`, {
    ...options,
    headers: { 'x-orchestrator-request': '1', ...(options.headers ?? {}) },
  })

/** Validates a conversation thread id, falling back to the configured default. */
function chatThreadId(value, config) {
  if (typeof value === 'string' && CHAT_THREAD_ID.test(value)) return value
  return normalizeConfig(config).chatThread
}

/** Validates a message body: a non-empty text of bounded length. */
function chatText(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '' || value.length > CHAT_TEXT_MAX) return null
  return text
}

/** Maps the superagent ticket list into the few fields the conversation tab reads. */
function chatTicketRow(item) {
  if (!item || typeof item !== 'object') return null
  const thread = Array.isArray(item.threads) ? item.threads[0] : undefined
  return {
    id: typeof item.id === 'string' ? item.id : '',
    title: typeof item.title === 'string' ? item.title : '',
    stage: typeof item.stage === 'string' ? item.stage : '',
    action: typeof item.action === 'string' ? item.action : '',
    state: typeof item.state === 'string' ? item.state : '',
    source: thread && typeof thread.source === 'string' ? thread.source : '',
    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    url: (item.reply && item.reply.url) || (thread && thread.url) || '',
    attention: Boolean(item.attention),
    question: item.attention && typeof item.attention.question === 'string' ? item.attention.question : '',
    note: item.note && typeof item.note.text === 'string' ? item.note.text : '',
    summary: typeof item.summary === 'string' ? item.summary : '',
  }
}

/** Maps the superagent thread list into the conversation tab's thread entries. */
function chatThreadRow(item) {
  if (!item || typeof item !== 'object') return null
  return {
    key: typeof item.key === 'string' ? item.key : '',
    source: typeof item.source === 'string' ? item.source : '',
    title: typeof item.title === 'string' ? item.title : '',
    stage: typeof item.stage === 'string' ? item.stage : '',
    lastAt: typeof item.lastAt === 'string' ? item.lastAt : '',
    url: typeof item.url === 'string' ? item.url : '',
    subscriptions: Number(item.subscriptions) || 0,
    latest: item.latest && typeof item.latest === 'object'
      ? { preview: typeof item.latest.preview === 'string' ? item.latest.preview : '', at: item.latest.at || '' }
      : null,
  }
}

/** Maps a decision into a compact row for the recent-assessment panel. */
function chatDecisionRow(item) {
  if (!item || typeof item !== 'object') return null
  const reason = Array.isArray(item.reason)
    ? item.reason.map((entry) => (entry && typeof entry.code === 'string' ? entry.code : '')).filter(Boolean).slice(0, 6)
    : []
  return {
    id: typeof item.id === 'string' ? item.id : '',
    kind: typeof item.kind === 'string' ? item.kind : '',
    outcome: typeof item.outcome === 'string' ? item.outcome : '',
    at: typeof item.at === 'string' ? item.at : '',
    thread: typeof item.thread === 'string' ? item.thread : '',
    threadTitle: typeof item.threadTitle === 'string' ? item.threadTitle : '',
    ticketId: typeof item.ticketId === 'string' ? item.ticketId : '',
    ticketTitle: typeof item.ticketTitle === 'string' ? item.ticketTitle : '',
    preview: typeof item.preview === 'string' ? item.preview : '',
    strength: typeof item.strength === 'string' ? item.strength : '',
    reason,
  }
}

/**
 * One conversation snapshot: the desktop plugin's own state plus the superagent
 * management API's service, ticket, thread and decision views. A failed part is
 * reported in `errors` while the rest stays usable.
 */
async function chatOverview(config, options = {}) {
  const resolved = normalizeConfig(config)
  const thread = chatThreadId(options.thread, resolved)
  const [desktopRaw, stateRaw, ticketsRaw, threadsRaw, decisionsRaw] = await Promise.all([
    chatDesktop(resolved, `/superagent-desktop/api/state?thread=${encodeURIComponent(thread)}&limit=200`),
    chatAdmin(resolved, '/orchestrator/api/state'),
    chatAdmin(resolved, '/orchestrator/api/tickets?state=open&limit=20'),
    chatAdmin(resolved, '/orchestrator/api/threads?filter=subscribed&limit=30'),
    chatAdmin(resolved, '/orchestrator/api/decisions?limit=20'),
  ])
  const errors = []
  const desktopValue = desktopRaw.ok && desktopRaw.value && typeof desktopRaw.value === 'object' ? desktopRaw.value : null
  const desktop = desktopValue
    ? {
        available: true,
        health: desktopValue.health && typeof desktopValue.health.state === 'string' ? desktopValue.health.state : 'ready',
        thread: typeof desktopValue.thread === 'string' ? desktopValue.thread : thread,
        threads: Array.isArray(desktopValue.threads) ? desktopValue.threads : [],
        messages: Array.isArray(desktopValue.messages) ? desktopValue.messages : [],
        tickets: Array.isArray(desktopValue.tickets) ? desktopValue.tickets : [],
        error: typeof desktopValue.error === 'string' ? desktopValue.error : null,
      }
    : { available: false, health: 'unavailable', thread, threads: [], messages: [], tickets: [], error: desktopRaw.error || 'desktop conversation unavailable' }
  if (!desktopRaw.ok) errors.push(`desktop: ${desktopRaw.error || 'unavailable'}`)

  const state = stateRaw.ok && stateRaw.value && typeof stateRaw.value === 'object' ? stateRaw.value : null
  if (!stateRaw.ok) errors.push(`service: ${stateRaw.error || 'unavailable'}`)
  const load = state && state.load && typeof state.load === 'object' ? state.load : {}
  const paused = Boolean(state && state.paused)
  const runtimeHealth = state && state.health && state.health.runtime ? state.health.runtime : null
  const serviceState = !state
    ? 'unreachable'
    : paused
      ? 'paused'
      : runtimeHealth && runtimeHealth.state === 'error'
        ? 'error'
        : runtimeHealth && runtimeHealth.state === 'ready'
          ? 'running'
          : 'setup'
  const service = {
    state: serviceState,
    running: Number(load.running) || 0,
    queued: Number(load.queued) || 0,
    maxWorkers: Number(load.maxWorkers) || Number(load.max_workers) || 0,
    paused,
  }

  const tickets = ticketsRaw.ok && ticketsRaw.value && Array.isArray(ticketsRaw.value.items)
    ? ticketsRaw.value.items.map(chatTicketRow).filter(Boolean)
    : []
  if (!ticketsRaw.ok) errors.push(`tickets: ${ticketsRaw.error || 'unavailable'}`)

  const threads = threadsRaw.ok && threadsRaw.value && Array.isArray(threadsRaw.value.items)
    ? threadsRaw.value.items.map(chatThreadRow).filter(Boolean)
    : []
  if (!threadsRaw.ok) errors.push(`threads: ${threadsRaw.error || 'unavailable'}`)

  const decisions = decisionsRaw.ok && decisionsRaw.value && Array.isArray(decisionsRaw.value.items)
    ? decisionsRaw.value.items.map(chatDecisionRow).filter(Boolean)
    : []
  if (!decisionsRaw.ok) errors.push(`decisions: ${decisionsRaw.error || 'unavailable'}`)

  const sources = desktopValue && desktopValue.sources && typeof desktopValue.sources === 'object' ? desktopValue.sources : {}
  const feishuSource = sources.feishu && typeof sources.feishu === 'object' ? sources.feishu : {}
  const feishuEnabled = Boolean(feishuSource.enabled)
  const feishuThreads = threads.filter((item) => item.source === 'feishu').length
  const feishu = {
    installed: feishuSource.installed !== false,
    enabled: feishuEnabled,
    threads: feishuThreads,
    hint: feishuSource.installed === false ? '飞书 Source 未安装' : feishuEnabled ? '' : '飞书未配置机器人',
  }
  const accounts = state && state.setup && state.setup.accounts && typeof state.setup.accounts === 'object' ? state.setup.accounts : {}
  const github = {
    installed: !(sources.github && sources.github.installed === false),
    enabled: !(sources.github && sources.github.enabled === false),
    repository: typeof accounts.repository === 'string' ? accounts.repository : '',
    agent: typeof accounts.agent === 'string' ? accounts.agent : '',
    threads: threads.filter((item) => item.source === 'github').length,
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    online: Boolean(state),
    service,
    desktop,
    tickets,
    threads,
    decisions,
    feishu,
    github,
    errors,
  }
}

/** Forwards a validated conversation request to the desktop plugin and returns its body. */
async function chatForward(config, apiPath, options) {
  const resolved = normalizeConfig(config)
  return chatDesktop(resolved, apiPath, options)
}

/** Writes an upstream JSON result: its own status when it failed, 502 for a transport failure. */
function forwardResult(res, result) {
  if (result.ok) return respond(res, 200, result.value)
  const status = result.status >= 400 && result.status < 600 ? result.status : 502
  const body = result.value && typeof result.value === 'object'
    ? result.value
    : { ok: false, error: result.error || 'superagent unavailable' }
  return respond(res, status, body)
}

/** Exposes the validators for the test surface. */
const CHAT_ATTACHMENT_ID = /^att-[a-z0-9-]{1,80}$/

const chatValidation = {
  textMax: CHAT_TEXT_MAX,
  threadId: CHAT_THREAD_ID,
  targetKey: CHAT_TARGET_KEY,
  ticketId: CHAT_TICKET_ID,
  messageId: CHAT_MESSAGE_ID,
  attachmentId: CHAT_ATTACHMENT_ID,
}

/* Attachments and multi-conversation (CONTRACT-CHAT v2) --------------------- */

const CHAT_UPLOAD_MAX = 14 * 1024 * 1024
const CHAT_FILE_MAX = 50 * 1024 * 1024
const CHAT_FILE_TYPES = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
}

function fileTypeOf(name) {
  return CHAT_FILE_TYPES[path.extname(String(name)).toLowerCase()] ?? 'application/octet-stream'
}

/** Reads a request body up to `maxBytes`; oversize answers 413 (upload only). */
async function readBodyLimit(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) {
      const error = new Error('请求体过大')
      error.status = 413
      throw error
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    const error = new Error('请求体不是合法 JSON')
    error.status = 400
    throw error
  }
}

/** GETs a binary document from the local superagent, bounded by a timeout and size cap. */
function requestBinary(target, { headers = {}, timeoutMs = CHAT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    let url
    try {
      url = new URL(target)
    } catch (error) {
      finish({ ok: false, status: 0, error: `Invalid URL: ${error.message}` })
      return
    }
    if (!LOOPBACK.has(url.hostname)) {
      finish({ ok: false, status: 0, error: `Refused non-loopback host ${url.hostname}` })
      return
    }
    let overflow = false
    const request = http.request(url, { method: 'GET', headers: { accept: '*/*', ...headers } }, (response) => {
      const chunks = []
      let size = 0
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > CHAT_FILE_MAX) {
          overflow = true
          request.destroy(new Error('File too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (overflow) return finish({ ok: false, status: 413, error: '文件超过 50 MiB' })
        const status = response.statusCode ?? 0
        const ok = status >= 200 && status < 300
        finish({
          ok,
          status,
          body: Buffer.concat(chunks),
          headers: response.headers,
          ...(ok ? {} : { error: `HTTP ${status}` }),
        })
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error('Request timed out')))
    request.on('error', (error) =>
      finish(
        overflow
          ? { ok: false, status: 413, error: '文件超过 50 MiB' }
          : { ok: false, status: 0, error: error.message },
      ),
    )
    request.end()
  })
}

/** Writes a binary answer with the headers a download needs. */
function respondBuffer(res, status, buffer, headers = {}) {
  res.writeHead(status, {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-length': buffer.length,
    ...headers,
  })
  res.end(buffer)
}

/** Validates the conversation attachment list (≤3, id/name/size/type). */
function chatAttachments(value) {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > 3) return null
  const list = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
    if (typeof entry.id !== 'string' || !CHAT_ATTACHMENT_ID.test(entry.id)) return null
    if (typeof entry.name !== 'string' || entry.name.trim() === '' || entry.name.length > 200) return null
    if (typeof entry.size !== 'number' || !Number.isFinite(entry.size) || entry.size < 0) return null
    if (entry.type !== undefined && (typeof entry.type !== 'string' || entry.type.length > 100)) return null
    list.push({ id: entry.id, name: entry.name, size: entry.size, ...(entry.type ? { type: entry.type } : {}) })
  }
  return list
}

async function chatUpload(config, body) {
  const resolved = normalizeConfig(config)
  return chatDesktop(resolved, '/superagent-desktop/api/upload', { method: 'POST', body, timeoutMs: 15000 })
}

async function chatThreads(config, title) {
  const resolved = normalizeConfig(config)
  return chatDesktop(resolved, '/superagent-desktop/api/threads', { method: 'POST', body: title ? { title } : {} })
}

/** Fetches one uploaded attachment from the desktop plugin as a binary response. */
async function chatAttachmentFile(config, id) {
  const resolved = normalizeConfig(config)
  return requestBinary(`${resolved.url}/superagent-desktop/api/attachment?id=${encodeURIComponent(id)}`, {
    headers: { 'x-superagent-desktop': '1' },
  })
}

/** Serves a local file the agent referenced, only under `chatFileRoots`. */
async function chatLocalFile(config, requested) {
  if (typeof requested !== 'string' || requested.trim() === '' || !path.isAbsolute(requested)) {
    return { ok: false, status: 400, error: 'path 必须是绝对路径' }
  }
  let target
  try {
    target = await realpath(requested)
  } catch {
    return { ok: false, status: 404, error: '文件不存在' }
  }
  let info
  try {
    info = await stat(target)
  } catch {
    return { ok: false, status: 404, error: '文件不存在' }
  }
  if (!info.isFile()) return { ok: false, status: 404, error: '不是普通文件' }
  if (info.size > CHAT_FILE_MAX) return { ok: false, status: 413, error: '文件超过 50 MiB' }
  const roots = normalizeConfig(config).chatFileRoots
  let allowed = false
  for (const root of roots) {
    let realRoot
    try {
      realRoot = await realpath(root)
    } catch {
      continue
    }
    if (target === realRoot || target.startsWith(realRoot + path.sep)) {
      allowed = true
      break
    }
  }
  if (!allowed) return { ok: false, status: 403, error: '文件不在允许的目录内' }
  const buffer = await readFile(target)
  const name = path.basename(target)
  return { ok: true, buffer, name, size: info.size, type: fileTypeOf(name) }
}

function downloadHeaders(name, type) {
  return {
    'content-type': type || 'application/octet-stream',
    'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  }
}

async function handle(config, req, res, requestUrl) {
  const rest = decodeURIComponent(requestUrl.pathname.slice(ROUTE_PREFIX.length + 1))
  const isPost = req.method === 'POST'
  const isGet = req.method === 'GET'

  if (rest === 'snapshot') {
    if (!isGet && !isPost) return respond(res, 405, { ok: false, error: 'GET or POST required' })
    const fresh = requestUrl.searchParams.get('fresh') === '1'
    return respond(res, 200, await snapshot(config, { fresh, busy: true }))
  }

  const serviceMatch = /^service\/(start|stop|restart)$/.exec(rest)
  if (serviceMatch) {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const resolved = normalizeConfig(config)
    if (!(await isExecutable(path.join(resolved.root, 'scripts', 'dsh-superagent')))) {
      return respond(res, 409, { ok: false, error: '找不到服务控制脚本（或不可执行）' })
    }
    const action = serviceMatch[1]
    const started = beginOperation(resolved, {
      kind: 'service',
      action,
      names: [],
      message: action === 'start' ? '正在启动服务…' : action === 'stop' ? '正在停止服务…' : '正在重启服务…',
    })
    if (started === null) return respond(res, 409, { ok: false, error: '另一个操作正在进行，请稍后再试' })
    return respond(res, 202, { ok: true, operation: started })
  }

  if (rest === 'plugins/sync') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const resolved = normalizeConfig(config)
    const body = await readBody(req)
    const names = parseNames(body)
    if (names === null) return respond(res, 400, { ok: false, error: 'names 必须是非空的插件名数组' })
    const started = beginOperation(resolved, {
      kind: 'sync',
      action: 'sync',
      names,
      message: `正在同步 ${names.length} 个插件到 superagent…`,
    })
    if (started === null) return respond(res, 409, { ok: false, error: '另一个操作正在进行，请稍后再试' })
    return respond(res, 202, { ok: true, operation: started })
  }

  if (rest === 'plugins/unsync') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const resolved = normalizeConfig(config)
    const body = await readBody(req)
    const names = parseNames(body)
    if (names === null) return respond(res, 400, { ok: false, error: 'names 必须是非空的插件名数组' })
    const started = beginOperation(resolved, {
      kind: 'unsync',
      action: 'unsync',
      names,
      message: `正在取消同步 ${names.length} 个插件…`,
    })
    if (started === null) return respond(res, 409, { ok: false, error: '另一个操作正在进行，请稍后再试' })
    return respond(res, 202, { ok: true, operation: started })
  }

  if (rest === 'plugins/ignore') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const resolved = normalizeConfig(config)
    const body = await readBody(req)
    const names = parseNames(body)
    if (names === null) return respond(res, 400, { ok: false, error: 'names 必须是非空的插件名数组' })
    if (typeof body.ignored !== 'boolean') {
      return respond(res, 400, { ok: false, error: 'ignored 必须是布尔值' })
    }
    const source = resolveSource(resolved)
    const catalog = await readCatalog(resolved, source)
    const available = new Set(catalog.items.map((item) => item.name))
    const unknown = names.filter((name) => !available.has(name))
    if (unknown.length > 0) {
      return respond(res, 400, { ok: false, error: `不是主看板已安装的插件：${unknown.join('、')}` })
    }
    const state = await readState(resolved)
    const next = new Set(state.ignored)
    for (const name of names) {
      if (body.ignored) next.add(name)
      else next.delete(name)
    }
    state.ignored = [...next].sort()
    await writeState(resolved, state)
    cacheInvalidate()
    return respond(res, 200, { ok: true, ignored: state.ignored })
  }

  if (rest === 'plugins/auto-sync') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const resolved = normalizeConfig(config)
    const body = await readBody(req)
    if (typeof body.enabled !== 'boolean') {
      return respond(res, 400, { ok: false, error: 'enabled 必须是布尔值' })
    }
    const state = await readState(resolved)
    state.autoSync = body.enabled
    if (typeof body.restartAfterSync === 'boolean') state.restartAfterSync = body.restartAfterSync
    if (body.enabled) {
      const source = resolveSource(resolved)
      const catalog = await readCatalog(resolved, source).catch(() => null)
      const ignored = new Set(state.ignored)
      state.known = catalog
        ? catalog.items.map((item) => item.name).filter((name) => !ignored.has(name))
        : state.known
    } else {
      pendingAuto.clear()
    }
    await writeState(resolved, state)
    cacheInvalidate()
    return respond(res, 200, {
      ok: true,
      autoSync: state.autoSync,
      restartAfterSync: state.restartAfterSync,
      baseline: state.known.length,
    })
  }

  if (rest === 'chat/overview') {
    if (!isGet) return respond(res, 405, { ok: false, error: 'GET required' })
    return respond(res, 200, await chatOverview(config, { thread: requestUrl.searchParams.get('thread') ?? '' }))
  }

  if (rest === 'chat/messages') {
    if (!isGet) return respond(res, 405, { ok: false, error: 'GET required' })
    const thread = requestUrl.searchParams.get('thread') ?? ''
    const after = requestUrl.searchParams.get('after') ?? ''
    if (!CHAT_THREAD_ID.test(thread)) return respond(res, 400, { ok: false, error: 'thread 不合法' })
    if (after !== '' && !CHAT_MESSAGE_ID.test(after)) return respond(res, 400, { ok: false, error: 'after 不合法' })
    const query = `thread=${encodeURIComponent(thread)}${after ? `&after=${encodeURIComponent(after)}` : ''}`
    return forwardResult(res, await chatForward(config, `/superagent-desktop/api/messages?${query}`))
  }

  if (rest === 'chat/upload') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const body = await readBodyLimit(req, CHAT_UPLOAD_MAX)
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return respond(res, 400, { ok: false, error: '上传请求必须是 JSON 对象' })
    }
    return forwardResult(res, await chatUpload(config, body))
  }

  if (rest === 'chat/threads') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const body = await readBody(req)
    const title = body.title
    if (title !== undefined && (typeof title !== 'string' || title.trim() === '' || title.length > 80)) {
      return respond(res, 400, { ok: false, error: 'title 必须是 1–80 字符的字符串' })
    }
    return forwardResult(res, await chatThreads(config, title ? title.trim() : undefined))
  }

  if (rest === 'chat/file') {
    if (!isGet) return respond(res, 405, { ok: false, error: 'GET required' })
    const attachment = requestUrl.searchParams.get('attachment') ?? ''
    const filePath = requestUrl.searchParams.get('path') ?? ''
    if (attachment !== '') {
      if (!CHAT_ATTACHMENT_ID.test(attachment)) return respond(res, 400, { ok: false, error: '附件 id 不合法' })
      const result = await chatAttachmentFile(config, attachment)
      if (!result.ok) {
        return respond(res, result.status >= 400 && result.status < 600 ? result.status : 502, {
          ok: false,
          error: result.error || '附件下载失败',
        })
      }
      return respondBuffer(
        res,
        200,
        result.body,
        {
          'content-type': result.headers['content-type'] || 'application/octet-stream',
          'content-disposition':
            result.headers['content-disposition'] || `attachment; filename*=UTF-8''${encodeURIComponent(attachment)}`,
        },
      )
    }
    if (filePath !== '') {
      const result = await chatLocalFile(config, filePath)
      if (!result.ok) {
        return respond(res, result.status >= 400 && result.status < 600 ? result.status : 502, {
          ok: false,
          error: result.error || '文件读取失败',
        })
      }
      return respondBuffer(res, 200, result.buffer, downloadHeaders(result.name, result.type))
    }
    return respond(res, 400, { ok: false, error: '需要 attachment 或 path 参数' })
  }

  if (rest === 'chat/send') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const body = await readBody(req)
    const attachments = chatAttachments(body.attachments)
    if (attachments === null) {
      return respond(res, 400, { ok: false, error: 'attachments 必须是最多 3 个合法附件' })
    }
    let text = ''
    if (body.text !== undefined) {
      if (typeof body.text !== 'string') return respond(res, 400, { ok: false, error: 'text 必须是字符串' })
      text = body.text.trim()
      if (text.length > CHAT_TEXT_MAX) return respond(res, 400, { ok: false, error: 'text 不能超过 16 KiB' })
    }
    if (text === '' && attachments.length === 0) {
      return respond(res, 400, { ok: false, error: 'text 不能为空（没有附件时）' })
    }
    if (body.thread !== undefined && (typeof body.thread !== 'string' || !CHAT_THREAD_ID.test(body.thread))) {
      return respond(res, 400, { ok: false, error: 'thread 不合法' })
    }
    const request = {
      text,
      ...(body.thread ? { thread: body.thread } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    }
    return forwardResult(res, await chatForward(config, '/superagent-desktop/api/send', { method: 'POST', body: request }))
  }

  if (rest === 'chat/relay') {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const body = await readBody(req)
    const text = chatText(body.text)
    if (text === null) return respond(res, 400, { ok: false, error: 'text 必须是非空字符串且不超过 16 KiB' })
    if (typeof body.target !== 'string' || !CHAT_TARGET_KEY.test(body.target)) {
      return respond(res, 400, { ok: false, error: 'target 必须是 feishu:<id> 或 github:<n>' })
    }
    return forwardResult(
      res,
      await chatForward(config, '/superagent-desktop/api/relay', { method: 'POST', body: { target: body.target, text } }),
    )
  }

  if (rest === 'chat/thread') {
    if (!isGet) return respond(res, 405, { ok: false, error: 'GET required' })
    const key = requestUrl.searchParams.get('key') ?? ''
    if (!CHAT_TARGET_KEY.test(key)) return respond(res, 400, { ok: false, error: 'key 不合法' })
    return forwardResult(res, await chatAdmin(config, `/orchestrator/api/threads/${encodeURIComponent(key)}`))
  }

  if (rest === 'chat/ticket') {
    if (!isGet) return respond(res, 405, { ok: false, error: 'GET required' })
    const id = requestUrl.searchParams.get('id') ?? ''
    if (!CHAT_TICKET_ID.test(id)) return respond(res, 400, { ok: false, error: 'id 不合法' })
    return forwardResult(res, await chatAdmin(config, `/orchestrator/api/tickets/${encodeURIComponent(id)}`))
  }

  const chatAction = /^chat\/ticket\/([^/]+)\/(stop|retry)$/.exec(rest)
  if (chatAction) {
    if (!isPost) return respond(res, 405, { ok: false, error: 'POST required' })
    const id = chatAction[1]
    if (!CHAT_TICKET_ID.test(id)) return respond(res, 400, { ok: false, error: 'id 不合法' })
    return forwardResult(
      res,
      await chatAdmin(config, `/orchestrator/api/tickets/${encodeURIComponent(id)}/${chatAction[2]}`, { method: 'POST', body: {} }),
    )
  }

  return respond(res, 404, { ok: false, error: `Unknown method: ${rest}` })
}

/** Register the same-origin route the Client half polls. */
export function apply(ctx, config) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const dispose = webCtx.webServer.register({
        kind: 'prefix',
        path: ROUTE_PREFIX,
        handler: async (req, res) => {
          try {
            const connection = webCtx.get('connection')
            if (connection && typeof connection.requestRejection === 'function') {
              const rejection = connection.requestRejection(req)
              if (rejection !== undefined && rejection !== null && rejection !== false) {
                respond(res, typeof rejection === 'number' ? rejection : 403, { error: 'Request rejected' })
                return
              }
            }
            const url = new URL(req.url ?? '/', 'http://localhost')
            if (!url.pathname.startsWith(`${ROUTE_PREFIX}/`)) {
              respond(res, 404, { error: 'Not found' })
              return
            }
            await handle(config, req, res, url)
          } catch (error) {
            const status = typeof error?.status === 'number' ? error.status : 500
            void recordHostError(normalizeConfig(config), `${req.method ?? '?'} ${req.url ?? '?'}`, error)
            respond(res, status, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        },
      })
      const timer = startAutoLoop(normalizeConfig(config))
      void markHostLoaded(normalizeConfig(config))
      return () => {
        stopAutoLoop(timer)
        dispose()
      }
    })
  })
}

/** Test surface for the verification harness; not part of the HTTP contract. */
export const internals = {
  normalizeConfig,
  resolveSource,
  resolveTarget,
  readProfile,
  readCatalog,
  readState,
  writeState,
  readInstalled,
  reconcileBundles,
  processStartedAt,
  classify,
  parseNames,
  handle,
  installSpec,
  isExecutable,
  redactLine,
  execStreaming,
  executeService,
  beginOperation,
  finishOperation,
  startAutoLoop,
  stopAutoLoop,
  autoTick,
  drainAutoSync,
  chatOverview,
  chatForward,
  chatProxy: chatForward,
  chatUpload,
  chatThreads,
  chatAttachmentFile,
  chatLocalFile,
  chatAttachments,
  readBodyLimit,
  chatValidation,
  chatText,
  chatThreadId,
  getOperation: () => operation,
  resetOperation: () => {
    operation = null
  },
  clearPendingAuto: () => pendingAuto.clear(),
  pendingAuto,
}
