/**
 * 本地契约测试（不入库，见 .git/info/exclude）：控制台唯一信源（v4）的解析与应用。
 *
 * 跑法（在 OpenLux-Agent 根目录）：
 *   npx esbuild echoflowai-tools/src/models/_local_capability_check.ts --bundle
 *     --format=cjs --platform=node
 *     --outfile=echoflowai-tools/src/models/_local_capability_check.cjs
 *   node echoflowai-tools/src/models/_local_capability_check.cjs
 *
 * 覆盖两层：profiles.ts 的 wire 解析（逐格失效只丢格不丢行）、sync.ts 端到端。
 * v4（docs/desktop-model-console-only-plan.md）后没有目录层，端到端跑三轮：
 *   1. 控制台可达：逐格替换、思考组原子应用、可达但没点名的行删思考声明、
 *      用户条目手敲值保留；
 *   2. 控制台不可达：一切保持上一轮写的值（unknown ≠ empty），无写入；
 *   3. 控制台删行：受管条目回落裸行（OVERRIDDEN_FIELDS 重置 + 思考剥除）。
 * 三路网络（model-delivery / desktop-config / v1/models + pricing）全部走全局
 * fetch，按 URL 伪造。
 */

import assert from 'node:assert/strict'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { Context } from '@deepseek-ai/cordis'
import type { ConsoleAccess } from '../market/console.ts'
import { MANAGED_FLAG, type ModelEntry } from './delivery.ts'
import { fetchModelOverrides } from './profiles.ts'
import { syncModels } from './sync.ts'

const PI_AI_NS = settingsNamespace('llm-pi-ai')
const DEFAULT_NS = settingsNamespace('agent-default-model')

// ---- 伪造的三路响应 --------------------------------------------------------

const QWEN_OPTIONAL = { efforts: { off: null, high: 'high' }, format: 'qwen' }

const capabilityItems = [
  {
    model_name: 'm-think', provider_scope: 'yunwu', category: 'chat',
    input: ['text', 'image'], thinking: QWEN_OPTIONAL,
    name: 'Thinker', context_window: 200000, max_output_tokens: 16384, updated_at: 1,
  },
  // 思考 JSON 坏（未知档位）：丢那一格，收图声明照收。
  {
    model_name: 'm-badlevel', provider_scope: 'yunwu', category: 'chat',
    input: ['text'], thinking: { efforts: { turbo: 'turbo' } }, updated_at: 2,
  },
  // 明确不思考。
  { model_name: 'deepseek-v4-flash', provider_scope: 'yunwu', category: 'chat', thinking: { efforts: {} }, updated_at: 3 },
  // 只剩 off 不成立 → 整行没有可用声明 → 不进 map。
  { model_name: 'm-offonly', provider_scope: 'yunwu', category: 'chat', thinking: { efforts: { off: null } }, updated_at: 4 },
  // 方言不在内核分支里 → 丢格 → 整行空 → 不进 map。
  { model_name: 'm-badformat', provider_scope: 'yunwu', category: 'chat', thinking: { efforts: { high: 'high' }, format: 'klingon' }, updated_at: 5 },
  // 三个手填格全非法 → 全丢 → 不进 map。
  { model_name: 'm-badnumbers', provider_scope: 'yunwu', category: 'chat', name: '   ', context_window: 0, max_output_tokens: 8.5, updated_at: 6 },
  // 别人的作用域 / 非对话类：整行跳过。
  { model_name: 'm-foreign', provider_scope: 'cm-abc', category: 'chat', input: ['text'], updated_at: 7 },
  { model_name: 'm-image', provider_scope: 'yunwu', category: 'image', input: ['text'], updated_at: 8 },
  // 用户手加的行也吃控制台声明（保存即同步修的就是这个症状）。
  { model_name: 'user-y', provider_scope: 'yunwu', category: 'chat', thinking: QWEN_OPTIONAL, updated_at: 9 },
]

const chatIds = ['m-think', 'm-plain', 'deepseek-v4-flash']
const poolIds = [...chatIds, 'user-x', 'user-y']

/** 各轮可拨的旋钮：profiles 路由是否可达、表里还有哪些行。 */
const state = {
  configFail: false,
  items: capabilityItems as readonly unknown[],
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
  const url = String(input)
  if (url.includes('/api/desktop-config/model-delivery')) {
    return jsonResponse({ success: true, data: { configured: true, revision: 9, chat_models: chatIds, search_models: [] } })
  }
  if (url.includes('/api/desktop-config')) {
    if (state.configFail) return new Response('boom', { status: 500 })
    return jsonResponse({ success: true, data: { modelCapabilities: { rollout: { enabled: true }, items: state.items } } })
  }
  if (url.includes('/v1/models')) {
    return jsonResponse({ data: poolIds.map(id => ({ id })) })
  }
  if (url.includes('/api/pricing')) {
    return jsonResponse({ data: poolIds.map(id => ({ model_name: id })) })
  }
  throw new Error(`unexpected fetch: ${url}`)
}) as typeof fetch

// ---- 伪造的 settings / ctx --------------------------------------------------

interface StubDocs {
  piai: { providers?: Record<string, { models?: ModelEntry[] }> }
  def: { provider?: string; model?: string; reasoningEffort?: string }
}

const docs: StubDocs = {
  piai: {
    providers: {
      openlux: {
        models: [
          // user-x 带着 v3 目录时代写上的陈旧思考声明：控制台可达且没点名它，
          // 声明必须被剥掉；手敲的窗口值必须留下。
          {
            id: 'user-x', contextWindow: 4096,
            reasoningEfforts: { high: 'high' }, compat: { thinkingFormat: 'openai' },
          } as unknown as ModelEntry,
          { id: 'user-y' },
        ],
      },
    },
  },
  def: {},
}

const settings = {
  get(ns: unknown): unknown {
    return ns === PI_AI_NS ? docs.piai : ns === DEFAULT_NS ? docs.def : undefined
  },
  describe(): { ns: string; user?: unknown; revision: number }[] {
    return [
      { ns: PI_AI_NS as unknown as string, user: docs.piai, revision: 1 },
      { ns: DEFAULT_NS as unknown as string, user: docs.def, revision: 1 },
    ]
  },
  async mutate(ns: unknown, ops: readonly { op: string; path: readonly string[]; value?: unknown }[]): Promise<void> {
    for (const op of ops) {
      if (ns === PI_AI_NS && op.op === 'set' && op.path.join('.') === 'providers.openlux.models') {
        docs.piai = { providers: { openlux: { models: op.value as ModelEntry[] } } }
      } else if (ns === DEFAULT_NS) {
        if (op.op === 'set') (docs.def as Record<string, unknown>)[op.path[0]!] = op.value
        else delete (docs.def as Record<string, unknown>)[op.path[0]!]
      }
    }
  },
}

const ctx = {
  get: (name: string) => (name === 'settings' ? settings : undefined),
  logger: { debug() {}, info() {}, warn() {}, error() {} },
} as unknown as Context

const access: ConsoleAccess = {
  baseUrl: 'http://stub.local',
  apiKey: async () => 'sk-test',
} as unknown as ConsoleAccess

function modelsById(): Map<string, Record<string, unknown>> {
  const models = docs.piai.providers?.['openlux']?.models ?? []
  return new Map(models.map(entry => [entry.id, entry as Record<string, unknown>]))
}

// ---- 断言 -------------------------------------------------------------------

async function main(): Promise<void> {
  // 1) wire 解析。
  const snapshot = await fetchModelOverrides(access)
  assert.equal(snapshot.enabled, true)
  const o = snapshot.overrides
  assert.deepEqual(o.get('m-think'), {
    input: ['text', 'image'],
    thinking: { efforts: { off: null, high: 'high' }, format: 'qwen' },
    name: 'Thinker', contextWindow: 200000, maxTokens: 16384,
  })
  assert.deepEqual(o.get('m-badlevel'), { input: ['text'] }, '坏思考格只丢格，收图格照收')
  assert.deepEqual(o.get('deepseek-v4-flash'), { thinking: { efforts: {} } })
  assert.deepEqual(o.get('user-y'), { thinking: { efforts: { off: null, high: 'high' }, format: 'qwen' } })
  assert.equal(o.has('m-offonly'), false, '只剩 off 的声明整格丢弃')
  assert.equal(o.has('m-badformat'), false, '未知方言整格丢弃')
  assert.equal(o.has('m-badnumbers'), false, '三个手填格全非法则整行无声明')
  assert.equal(o.has('m-foreign'), false)
  assert.equal(o.has('m-image'), false)

  // 2) 第一轮：控制台可达，应用到 settings 文档。
  const outcome = await syncModels(ctx, { model: access, config: access })
  assert.equal(outcome.changed, true)
  let byId = modelsById()
  assert.deepEqual([...byId.keys()], ['m-think', 'm-plain', 'deepseek-v4-flash', 'user-x', 'user-y'])

  const think = byId.get('m-think')!
  assert.deepEqual(think['reasoningEfforts'], { off: null, high: 'high' })
  assert.deepEqual(think['compat'], { thinkingFormat: 'qwen' })
  assert.equal(think['name'], 'Thinker')
  assert.equal(think['contextWindow'], 200000)
  assert.equal(think['maxTokens'], 16384)
  assert.deepEqual(think['input'], ['text', 'image'])
  assert.equal(think[MANAGED_FLAG], true)

  // 控制台明确「不思考」：没有档位与方言。
  const flash = byId.get('deepseek-v4-flash')!
  assert.equal(flash['reasoningEfforts'], undefined, '{"efforts":{}} 删声明')
  assert.equal(flash['compat'], undefined)

  // 没有控制台行的受管条目：裸行（v4 没有目录可回落）。
  const plain = byId.get('m-plain')!
  assert.equal(plain['reasoningEfforts'], undefined)
  assert.equal(plain['name'], undefined)
  assert.equal(plain['contextWindow'], undefined)

  // 用户自己的条目：手敲的窗口保留；控制台可达却没点名它 → 陈旧思考声明剥除。
  const userX = byId.get('user-x')!
  assert.equal(userX['contextWindow'], 4096)
  assert.equal(userX['reasoningEfforts'], undefined, '目录时代的陈旧声明被可达控制台剥掉')
  assert.equal(userX['compat'], undefined)
  assert.equal(userX[MANAGED_FLAG], undefined)

  // 用户手加的行吃到控制台声明 —— 不用重启（保存即同步补的就是这条路）。
  const userY = byId.get('user-y')!
  assert.deepEqual(userY['reasoningEfforts'], { off: null, high: 'high' })
  assert.deepEqual(userY['compat'], { thinkingFormat: 'qwen' })
  assert.equal(userY[MANAGED_FLAG], undefined)

  // 装机默认被播种成第一条受管条目。
  assert.equal(docs.def.provider, 'openlux')
  assert.equal(docs.def.model, 'm-think')

  // 3) 第二轮：profiles 路由 500 → unknown ≠ empty，一切保持原样，无写入。
  state.configFail = true
  const outcome2 = await syncModels(ctx, { model: access, config: access })
  assert.equal(outcome2.changed, false, '不可达轮不写')
  assert.equal(outcome2.skipped, 'unchanged')
  byId = modelsById()
  assert.deepEqual(byId.get('m-think')!['reasoningEfforts'], { off: null, high: 'high' }, '声明保持上一轮的值')
  assert.equal(byId.get('m-think')!['name'], 'Thinker')
  assert.deepEqual(byId.get('user-y')!['reasoningEfforts'], { off: null, high: 'high' })

  // 4) 第三轮：控制台删掉 m-think 与 user-y 的行 → 受管条目回落裸行，
  //    用户条目剥思考但手敲字段仍在。
  state.configFail = false
  state.items = capabilityItems.filter(item =>
    (item as { model_name: string }).model_name !== 'm-think'
    && (item as { model_name: string }).model_name !== 'user-y')
  const outcome3 = await syncModels(ctx, { model: access, config: access })
  assert.equal(outcome3.changed, true)
  byId = modelsById()
  const thinkBare = byId.get('m-think')!
  assert.equal(thinkBare['reasoningEfforts'], undefined, '删行后思考声明剥除')
  assert.equal(thinkBare['compat'], undefined)
  assert.equal(thinkBare['name'], undefined, '删行后 OVERRIDDEN_FIELDS 重置')
  assert.equal(thinkBare['contextWindow'], undefined)
  assert.equal(thinkBare['maxTokens'], undefined)
  assert.equal(thinkBare['input'], undefined)
  assert.equal(thinkBare[MANAGED_FLAG], true)
  const userYBare = byId.get('user-y')!
  assert.equal(userYBare['reasoningEfforts'], undefined)
  assert.equal(byId.get('user-x')!['contextWindow'], 4096, '用户手敲值不随控制台行走')

  console.log('capability check: all assertions passed')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
