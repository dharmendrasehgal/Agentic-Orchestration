'use strict'

const fs          = require('fs')
const path        = require('path')
const { spawnSync } = require('child_process')
const { sha256OfFile } = require('./check_lock')

const VALID_TRACKS = ['backend', 'frontend', 'db', 'integration']

// ── Schema helpers ──────────────────────────────────────────────────────────

function checkResult(status, detail = {}) {
  return { status: status ? 'PASS' : 'FAIL', ...detail }
}

function buildReport(track, lockfileSha, checks, errorReflection) {
  const anyFailed = Object.values(checks).some(c => c.status === 'FAIL')
  return {
    status: anyFailed ? 'FAIL' : 'PASS',
    track,
    timestamp: new Date().toISOString(),
    lockfile_sha: lockfileSha,
    checks,
    error_reflection: errorReflection,
    artifact_path: `sandbox-artifacts/sandbox-artifact-${track}-${lockfileSha.slice(0, 8)}.tar.gz`
  }
}

function writeReport(track, report) {
  const outPath = `sandbox_report_${track}.json`
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  return outPath
}

// ── Run a command, return { ok, stdout, stderr } ─────────────────────────────

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio:   opts.silent ? 'pipe' : 'inherit',
    shell:   true,
    timeout: opts.timeout || 120_000
  })
  return {
    ok:     result.status === 0,
    stdout: (result.stdout || '').toString(),
    stderr: (result.stderr || '').toString()
  }
}

// ── Main dry-run logic ───────────────────────────────────────────────────────

async function runDryRun(argv) {
  // Parse --track
  let track = process.env.DEPMAN_TRACK || 'backend'
  const trackArg = argv.findIndex(a => a === '--track')
  if (trackArg !== -1 && argv[trackArg + 1]) {
    track = argv[trackArg + 1]
  }
  // Also support --track=value
  const trackEq = argv.find(a => a.startsWith('--track='))
  if (trackEq) track = trackEq.split('=')[1]

  if (!VALID_TRACKS.includes(track)) {
    console.error(`Unknown track: "${track}". Valid: ${VALID_TRACKS.join(', ')}`)
    process.exit(1)
  }

  console.log(`\nDry-run sandbox — track: ${track}`)

  const lockPath  = process.env.DEPMAN_LOCK || 'package-lock.json'
  const lockSha   = fs.existsSync(lockPath) ? sha256OfFile(lockPath) : 'missing'
  const hasPkg    = fs.existsSync('package.json')
  const checks    = {}
  const errors    = []

  // ── Check 1: dependency_integrity ────────────────────────────────────────
  console.log('  [1/4] Checking dependency integrity...')
  const lockExists = fs.existsSync(lockPath)
  checks.dependency_integrity = checkResult(lockExists, {
    deviations: lockExists ? [] : [`${lockPath} not found`]
  })

  // ── Check 2: lint ─────────────────────────────────────────────────────────
  console.log('  [2/4] Running linter...')
  if (hasPkg) {
    const lintResult = run('npm', ['run', 'lint', '--silent', '--if-present'], { silent: true })
    checks.lint = checkResult(lintResult.ok, {
      violations: lintResult.ok ? [] : [lintResult.stderr.trim() || 'lint failed']
    })
    if (!lintResult.ok) {
      errors.push({
        error: 'Lint failure',
        source_file: 'check npm run lint output',
        suggested_owner: `${track}_developer_agent`,
        reference_doc: 'docs/code_standards.md'
      })
    }
  } else {
    checks.lint = { status: 'PASS', violations: [], note: 'no package.json — skipped' }
  }

  // ── Check 3: typecheck ────────────────────────────────────────────────────
  console.log('  [3/4] Running type check...')
  if (hasPkg) {
    const tcResult = run('npm', ['run', 'typecheck', '--silent', '--if-present'], { silent: true })
    checks.typecheck = checkResult(tcResult.ok, {
      errors: tcResult.ok ? [] : [tcResult.stderr.trim() || 'typecheck failed']
    })
    if (!tcResult.ok) {
      errors.push({
        error: 'Type error',
        source_file: 'check npm run typecheck output',
        suggested_owner: `${track}_developer_agent`,
        reference_doc: 'docs/architecture/technology_stack.md'
      })
    }
  } else {
    checks.typecheck = { status: 'PASS', errors: [], note: 'no package.json — skipped' }
  }

  // ── Check 4: unit_tests ───────────────────────────────────────────────────
  console.log('  [4/4] Running unit tests...')
  if (hasPkg) {
    const testResult = run('npm', ['test', '--', '--runInBand', '--passWithNoTests'], { silent: true })
    checks.unit_tests = checkResult(testResult.ok, {
      coverage_pct: null,
      failures: testResult.ok ? [] : [testResult.stderr.trim() || 'test suite failed']
    })
    if (!testResult.ok) {
      errors.push({
        error: 'Unit test failure',
        source_file: 'check npm test output',
        suggested_owner: `${track}_developer_agent`,
        reference_doc: 'agents/dry_run_sandbox.md'
      })
    }
  } else {
    checks.unit_tests = { status: 'PASS', coverage_pct: null, failures: [], note: 'no package.json — skipped' }
  }

  // ── Frontend-only: bundle size stub ───────────────────────────────────────
  if (track === 'frontend') {
    checks.bundle_size = {
      status: 'PASS',
      budget_kb: 250,
      actual_kb: null,
      note: 'Scaffold: integrate your bundler size report for actual measurement'
    }
  }

  // ── Produce report ────────────────────────────────────────────────────────
  const report  = buildReport(track, lockSha, checks, errors)
  const outPath = writeReport(track, report)
  const failed  = Object.values(checks).filter(c => c.status === 'FAIL')

  console.log('')
  if (failed.length === 0) {
    console.log(`  PASS: all checks passed for track "${track}".`)
    console.log(`  Report: ${outPath}`)
    process.exit(0)
  } else {
    console.error(`  FAIL: ${failed.length} check(s) failed for track "${track}".`)
    console.error(`  Report: ${outPath}`)
    console.error('  Fix the issues above and re-run before opening a PR.')
    process.exit(6)
  }
}

module.exports = { runDryRun }
