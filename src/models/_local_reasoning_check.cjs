'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const root = path.resolve(__dirname, '../..')
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reasoning-check-'))
let failed = 0

function build(entry, outfile) {
  const result = spawnSync(
    'npx',
    ['esbuild', entry, '--bundle', '--format=cjs', '--platform=node', `--outfile=${outfile}`],
    { cwd: root, encoding: 'utf8', shell: true },
  )
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    process.exit(1)
  }
}

function assert(cond, message) {
  if (!cond) {
    console.error('FAIL', message)
    failed += 1
  } else {
    console.log('ok', message)
  }
}

const modeOut = path.join(outDir, 'reasoning-mode.cjs')
build(path.join(__dirname, 'reasoning-mode.ts'), modeOut)
const {
  applyOptionalReasoning,
  isUnmapped,
  OPENAI_OPTIONAL_EFFORTS,
  QWEN_OPTIONAL_EFFORTS,
} = require(modeOut)

const catalogDict = {
  reasoningEfforts: { high: 'high', max: 'max' },
  compat: { thinkingFormat: 'deepseek' },
}

assert(applyOptionalReasoning(catalogDict, 'none', 'openai') === undefined, 'none is a no-op')
assert(applyOptionalReasoning(catalogDict, 'always', 'openai') === undefined, 'always is a no-op')
assert(applyOptionalReasoning(undefined, undefined, 'openai') === undefined, 'missing mode is a no-op')

const kept = applyOptionalReasoning(catalogDict, 'optional', 'qwen')
assert(kept && !isUnmapped(kept) && kept.reasoningEfforts.off === null, 'optional+dict adds off')
assert(kept && !isUnmapped(kept) && kept.reasoningEfforts.high === 'high' && kept.reasoningEfforts.max === 'max', 'optional+dict keeps catalog levels')
assert(kept && !isUnmapped(kept) && kept.compat && kept.compat.thinkingFormat === 'deepseek', 'optional+dict keeps catalog compat')

const openai = applyOptionalReasoning(undefined, 'optional', 'openai')
assert(openai && !isUnmapped(openai) && JSON.stringify(openai.reasoningEfforts) === JSON.stringify({ ...OPENAI_OPTIONAL_EFFORTS }), 'unknown+openai writes default dict')
assert(openai && !isUnmapped(openai) && openai.compat === undefined, 'unknown+openai writes no compat')

const qwen = applyOptionalReasoning({ reasoningEfforts: undefined }, 'optional', 'qwen')
assert(qwen && !isUnmapped(qwen) && JSON.stringify(qwen.reasoningEfforts) === JSON.stringify({ ...QWEN_OPTIONAL_EFFORTS }), 'no-dict+qwen writes two-level dict')
assert(qwen && !isUnmapped(qwen) && qwen.compat && qwen.compat.thinkingFormat === 'qwen', 'no-dict+qwen sets thinkingFormat')

const unmapped = applyOptionalReasoning(undefined, 'optional', undefined)
assert(isUnmapped(unmapped), 'optional without catalog dict or format is unmapped')
assert(isUnmapped(applyOptionalReasoning(undefined, 'optional', 'zai')), 'unknown format is unmapped')

const profilesOut = path.join(outDir, 'profiles.cjs')
build(path.join(__dirname, 'profiles.ts'), profilesOut)
const { snapshotFromCapabilities } = require(profilesOut)

const off = snapshotFromCapabilities({ rollout: { enabled: false }, items: [{ model_name: 'x', input: ['text'] }] })
assert(off.enabled === false && off.overrides.size === 0, 'rollout off → empty')

const reasoningOnly = snapshotFromCapabilities({
  rollout: { enabled: true },
  items: [{ model_name: 'haiku', provider_scope: 'yunwu', category: 'chat', reasoning: { mode: 'optional', format: 'openai' } }],
})
assert(reasoningOnly.enabled === true && reasoningOnly.overrides.get('haiku')?.reasoning?.mode === 'optional', 'reasoning-only row is kept')
assert(reasoningOnly.overrides.get('haiku')?.input === undefined, 'reasoning-only row has no input')
assert(reasoningOnly.overrides.get('haiku')?.reasoning?.format === 'openai', 'format is parsed')

const badMode = snapshotFromCapabilities({
  rollout: { enabled: true },
  items: [{ model_name: 'x', provider_scope: 'yunwu', reasoning: { mode: 'maybe', format: 'openai' } }],
})
assert(!badMode.overrides.has('x'), 'unknown mode drops the reasoning-only row')

const badFormat = snapshotFromCapabilities({
  rollout: { enabled: true },
  items: [{ model_name: 'x', provider_scope: 'yunwu', reasoning: { mode: 'optional', format: 'zai' } }],
})
assert(badFormat.overrides.get('x')?.reasoning?.mode === 'optional', 'unknown format keeps mode')
assert(badFormat.overrides.get('x')?.reasoning?.format === undefined, 'unknown format is omitted')

fs.rmSync(outDir, { recursive: true, force: true })
if (failed > 0) process.exit(1)
console.log('all local checks passed')
