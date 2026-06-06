'use strict'

const fs     = require('fs')
const crypto = require('crypto')

function sha256OfFile(filePath) {
  const data = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(data).digest('hex')
}

async function checkLockCLI(argv) {
  const lockPath = argv[0] || process.env.DEPMAN_LOCK     || 'package-lock.json'
  const canonical = argv[1] || process.env.DEPMAN_CANONICAL_LOCK || './canonical-lock.json'

  if (!fs.existsSync(lockPath)) {
    console.error(`Lockfile not found: ${lockPath}`)
    console.error('  → Run "npm install" to generate it, then commit it.')
    process.exit(3)
  }

  if (!fs.existsSync(canonical)) {
    console.error(`Canonical lockfile not found: ${canonical}`)
    console.error('  → Create it: cp package-lock.json canonical-lock.json && git add canonical-lock.json')
    console.error('  → Or ask dependency_manager_agent to initialise the canonical lock.')
    process.exit(4)
  }

  const localSha     = sha256OfFile(lockPath)
  const canonicalSha = sha256OfFile(canonical)

  console.log(`  local lock     sha256: ${localSha}`)
  console.log(`  canonical lock sha256: ${canonicalSha}`)

  if (localSha === canonicalSha) {
    console.log('  OK: lockfile matches canonical lockfile.')
    process.exit(0)
  } else {
    console.error('  MISMATCH: lockfile differs from canonical.')
    console.error('  → If you added/changed a dependency, request dependency_manager_agent review.')
    console.error('  → If canonical is stale, dependency_manager_agent updates it after approval.')
    process.exit(5)
  }
}

module.exports = { checkLockCLI, sha256OfFile }
