/*
 * compile-server.mjs - Cross-platform C compilation helper
 * Usage: node scripts/compile-server.mjs
 */

import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const srcFile = path.join(__dirname, '..', 'server', 'server.c')
const outDir = path.join(__dirname, '..', 'server')
const isWin = process.platform === 'win32'
const binaryName = isWin ? 'dashboard-server.exe' : 'dashboard-server'
const outFile = path.join(outDir, binaryName)

if (!existsSync(srcFile)) {
  console.error(`Source file not found: ${srcFile}`)
  process.exit(1)
}

// Try compilers in order of preference
const compilers = isWin
  ? [
      { cmd: 'gcc', args: ['-O2', '-Wall', '-o', outFile, srcFile, '-lws2_32'] },
      { cmd: 'clang', args: ['-O2', '-Wall', '-o', outFile, srcFile, '-lws2_32'] },
      { cmd: 'cl', args: ['/O2', '/Fe:' + outFile, srcFile, 'ws2_32.lib'] },
    ]
  : [
      { cmd: 'cc', args: ['-O2', '-Wall', '-o', outFile, srcFile, '-lpthread'] },
      { cmd: 'gcc', args: ['-O2', '-Wall', '-o', outFile, srcFile, '-lpthread'] },
      { cmd: 'clang', args: ['-O2', '-Wall', '-o', outFile, srcFile, '-lpthread'] },
    ]

for (const { cmd, args } of compilers) {
  try {
    const fullCmd = `${cmd} ${args.join(' ')}`
    console.log(`Trying: ${fullCmd}`)
    execSync(fullCmd, { stdio: 'inherit' })
    console.log(`✓ Compiled: ${outFile}`)
    process.exit(0)
  } catch {
    console.log(`  ${cmd} not available or failed`)
  }
}

console.error('No C compiler found. Install gcc, clang, or MSVC.')
process.exit(1)
