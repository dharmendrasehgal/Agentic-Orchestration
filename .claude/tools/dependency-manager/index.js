#!/usr/bin/env node
'use strict'

const argv = process.argv.slice(2)
const cmd  = argv[0]

const { checkLockCLI }   = require('./check_lock')
const { runDryRun }      = require('./dry_run_runner')

const HELP = `
Dependency Manager CLI — Software Factory
Usage: depman <command> [options]

Commands:
  check-lock [local-lock] [canonical-lock]
      Compare local lockfile against canonical-lock.json.
      Exits non-zero on mismatch. Reads DEPMAN_LOCK and
      DEPMAN_CANONICAL_LOCK env vars if args are omitted.

  dry-run [--track backend|frontend|db|integration]
      Run lint, typecheck, and unit tests for the specified
      implementation track. Writes sandbox_report_{track}.json.
      Default track: backend (or DEPMAN_TRACK env var).

  propose-upgrade <package@version>
      (scaffold) Propose a dependency upgrade: runs sandbox
      tests, produces sandbox-report.json, opens upgrade PR.
      Integrate with your PR automation for full use.

  emergency-lock [--cve=CVE-ID]
      (scaffold) Produce an emergency canonical lockfile with
      the patched version and notify release_manager_agent.
      Integrate with your incident tracker for full use.
`

async function main() {
  try {
    switch (cmd) {
      case 'check-lock':
        await checkLockCLI(argv.slice(1))
        break

      case 'dry-run':
        await runDryRun(argv.slice(1))
        break

      case 'propose-upgrade': {
        const pkg = argv[1]
        if (!pkg) {
          console.error('Usage: depman propose-upgrade <package@version>')
          process.exit(1)
        }
        console.log(`propose-upgrade: ${pkg}`)
        console.log('  → Would run sandbox tests against the upgraded package.')
        console.log('  → Would open a PR: "chore: upgrade ' + pkg + '"')
        console.log('  → Would attach sandbox-report.json to the PR.')
        console.log('  Scaffold only. Wire to your PR automation for full use.')
        break
      }

      case 'emergency-lock': {
        const cveArg = argv.find(a => a.startsWith('--cve='))
        const cve    = cveArg ? cveArg.split('=')[1] : 'unknown'
        console.log(`emergency-lock: CVE=${cve}`)
        console.log('  → Would pin the affected package to the patched version.')
        console.log('  → Would produce an emergency canonical-lock.json.')
        console.log('  → Would notify release_manager_agent and open a fast-track PR.')
        console.log('  Scaffold only. Wire to your incident tracker for full use.')
        break
      }

      case '--version':
      case 'version': {
        const pkg = require('./package.json')
        console.log(`depman v${pkg.version}`)
        break
      }

      default:
        console.log(HELP)
        if (cmd) process.exit(1)
        break
    }
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(2)
  }
}

main()
