/**
 * 六个端点的处理实现。
 *
 * 依赖全部构造注入、**不碰 `ctx`** —— 因此它能脱离宿主直接测。
 *
 * 铁律（见 docs/BACKEND-CONTRACTS.md §19 第 3、4 条）：
 * - **任何 handler 都不许把异常抛出去**。抛出去会被宿主包成 500，前端就拿不到
 *   `error` 结构了。余额端点的业务错误一律走 `200 + state: error`。
 * - **每次请求现读配置**，不许在闭包里捕获旧值。
 * @module dsh-ds-balance/http/handlers
 */

import type { BalanceSource, CacheState } from '../domain/balance.js'
import { classify, describeError } from '../domain/errors.js'
import { situationOf } from '../domain/situation.js'
import type { CoreStore } from '../ports/core-store.js'
import type { DeepSeekClient } from '../ports/deepseek-client.js'
import type { Credentials } from '../ports/credentials.js'
import type { Logger } from '../ports/logger.js'
import type { ReadableMetrics } from '../ports/metrics.js'
import type { BalanceService } from '../services/balance-service.js'
import type { ConfigService } from '../services/config-service.js'
import type { KeyResolver } from '../services/key-resolver.js'
import type { Scheduler } from '../services/scheduler.js'
import type { SourcesService } from '../services/sources-service.js'
import type { AccountSource } from '../ports/account.js'
import { CONFIG_FIELDS, ENDPOINT, validateThresholds, type Config } from '../config.js'
import { PLUGIN_VERSION, SCHEMA_VERSION } from '../version.js'
import {
  newRequestId,
  toWireBalanceView,
  toWireError,
  type WireBalanceResponse,
  type WireCredentialInfo,
} from './wire.js'

/** 一套 handler 需要的全部依赖。 */
export interface HttpDeps {
  service: BalanceService
  config: ConfigService
  keys: KeyResolver
  client: DeepSeekClient
  store: CoreStore
  scheduler: Scheduler
  logger?: Logger | undefined
  /** 可读出聚合值的指标；没接线时返回 `null` 而不是编一份空的。 */
  metrics?: ReadableMetrics | undefined
  /** 凭据端口。只用来读「配没配 / 可不可写」，**永远不读值**。 */
  credentials?: Credentials | undefined
  /** 两条取数途径的状态。`GET /api/v1/sources` 的唯一来源。 */
  sources: SourcesService
  /**
   * 取当前账号端口实现；服务可能晚到，所以是函数而不是实例。
   * `POST /api/v1/test-connection` 的 `source: 'deepseek-account'` 那条路用它。
   */
  account: () => AccountSource | undefined
}

/** `testConnection` 超时的可接受区间；越界一律回落默认值。 */
const TEST_TIMEOUT_RANGE = { min: 1000, max: 60_000 } as const

/** 未配置 API Key 时回给「测试连接」的错误文案。 */
const NO_KEY_MESSAGE = 'no API key configured'

/** 统一的 JSON 响应头。 */
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' } as const

/** 造一个 JSON 响应。 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** 是否是普通对象（数组与 `null` 都不算）。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读一个查询参数；URL 坏掉时返回 `null`。 */
function queryParam(request: Request, name: string): string | null {
  try {
    return new URL(request.url).searchParams.get(name)
  } catch {
    return null
  }
}

/** 读一个 JSON 对象请求体；不是对象、不是 JSON、没有体一律 `null`。 */
async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json()
    return isPlainObject(body) ? body : null
  } catch {
    return null
  }
}

/**
 * 空视图：任何 handler 在彻底失败时都回它，保证响应形状仍然合法。
 *
 * 处境固定 `internal-error`：走到这里说明**我们自己的代码抛了**（装配错误之类），
 * 那是「我们坏了」而不是「上游坏了」—— 两者在界面上是不同的处境，不能混。
 * @param requestId - 本次请求的标识。
 * @param error - 触发失败的异常。
 * @param state - 要报告的状态；余额端点固定 `error`。
 * @param source - 当时活跃的来源；取不到就按 Key 那条报（界面只拿它选来源标签）。
 * @returns 契约 §8.3 的响应体。
 */
function failureView(
  requestId: string,
  error: unknown,
  state: CacheState = 'error',
  source: BalanceSource = 'deepseek-http',
): WireBalanceResponse {
  return {
    requestId,
    schemaVersion: SCHEMA_VERSION,
    source,
    // 进程级失败时**不声称知道凭据身份**：那份身份是异步读的，而这里必须同步返回。
    // 界面据此退回路名标签，而路名仍然为真。
    sourceIdentity: null,
    situation: 'internal-error',
    state,
    stale: false,
    fetchedAt: 0,
    ageMs: 0,
    isAvailable: false,
    accountTag8: '',
    balances: [],
    selected: null,
    severity: 'unknown',
    thresholds: {},
    todayUsage: null,
    error: toWireError(classify(error)),
  }
}

/** `GET /api/v1/balance`。**状态码始终 200**，业务错误走 `state` + `error`。 */
export async function handleBalance(request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  try {
    const currency = queryParam(request, 'currency')
    const providerHint = queryParam(request, 'provider')
    const view = await deps.service.getView({
      ...(currency === null || currency === '' ? {} : { currency }),
      providerHint,
    })
    // 凭据身份跟着这份数字一起回去：界面拿它当标题里的来源标签（「是哪一把」而不是「哪条路」）。
    const sourceIdentity = await deps.sources.identityOf(view.source)
    return json(
      toWireBalanceView(view, deps.service.accountTag8() ?? '', sourceIdentity, requestId),
    )
  } catch (error) {
    deps.logger?.error('ds-balance: balance handler failed', {
      requestId,
      error: describeError(error),
    })
    return json(failureView(requestId, error, 'error', deps.service.activeSource()))
  }
}

/** `POST /api/v1/balance/refresh`。请求体 `{ reason, provider }`，都可省略。 */
export async function handleRefresh(request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  try {
    const body = await readJsonObject(request)
    const rawReason = body?.reason
    const reason = typeof rawReason === 'string' && rawReason !== '' ? rawReason : 'manual'
    const rawProvider = body?.provider
    const providerHint = typeof rawProvider === 'string' ? rawProvider : null
    const result = await deps.service.forceRefresh(reason, providerHint)
    return json({ requestId, schemaVersion: SCHEMA_VERSION, ...result, error: null })
  } catch (error) {
    deps.logger?.error('ds-balance: refresh handler failed', {
      requestId,
      error: describeError(error),
    })
    return json({
      requestId,
      schemaVersion: SCHEMA_VERSION,
      triggered: false,
      joined: false,
      cooldownMs: 0,
      state: 'error',
      error: toWireError(classify(error)),
    })
  }
}

/**
 * 读凭据的只读描述。
 *
 * 失败一律回 `null`：界面据此退化成「不知道，就先当只读」，而不是把整张卡片打挂。
 * @param deps - 注入的依赖。
 * @param ref - 当前生效的凭据引用名。
 * @returns 三个事实，或 `null`。
 */
async function credentialInfo(deps: HttpDeps, ref: string): Promise<WireCredentialInfo | null> {
  const credentials = deps.credentials
  if (credentials === undefined) return null
  try {
    const described = await credentials.describe(ref)
    return {
      ref,
      configured: described.configured === true,
      source: described.source ?? null,
      writable: described.writable === true,
    }
  } catch (error) {
    deps.logger?.debug('ds-balance: credential describe failed', {
      ref,
      error: describeError(error),
    })
    return null
  }
}

/**
 * 组装配置响应体。
 *
 * **配置整份回传**：9 个字段里没有一个是秘密（密钥在 3.0 随 `apiKey` 字段一起删了），
 * 所以不再需要从前那个「挑字段 + 手动掩码」的包装。掩码现在归 `GET /api/v1/sources`。
 */
async function configBody(requestId: string, deps: HttpDeps): Promise<Record<string, unknown>> {
  const config = deps.config.current()
  return {
    requestId,
    schemaVersion: SCHEMA_VERSION,
    config,
    credential: await credentialInfo(deps, config.apiKeyRef),
    timeoutMs: deps.config.timeoutMs(),
    error: null,
  }
}

/** `GET /api/v1/config`。 */
export async function handleConfigGet(_request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  try {
    return json(await configBody(requestId, deps))
  } catch (error) {
    deps.logger?.error('ds-balance: config read handler failed', {
      requestId,
      error: describeError(error),
    })
    return json({ requestId, schemaVersion: SCHEMA_VERSION, error: toWireError(classify(error)) })
  }
}

/**
 * `GET /api/v1/sources`。
 *
 * 「连接」组的唯一事实出口：两条途径的状态一次给全。`?refresh=1` 强制重读
 * （卡片打开 / 窗口重新获得焦点 / 点测试按钮时用），否则走缓存。
 *
 * **失败也回 200 + 一份保守快照**：界面读不到状态时该显示「未确认」，
 * 而不是让整张卡片消失（与 `credential` 段同一策略）。
 */
export async function handleSources(request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  const force = queryParam(request, 'refresh') === '1'
  try {
    const snapshot = force ? await deps.sources.refresh() : await deps.sources.snapshot()
    return json({
      requestId,
      schemaVersion: SCHEMA_VERSION,
      revision: snapshot.revision,
      key: snapshot.key,
      account: snapshot.account,
    })
  } catch (error) {
    deps.logger?.error('ds-balance: sources handler failed', {
      requestId,
      error: describeError(error),
    })
    // 保守快照：两条途径都说「读不到」。`revision: -1` 是一个界面认得出「这份不可信」的值。
    return json({
      requestId,
      schemaVersion: SCHEMA_VERSION,
      revision: -1,
      key: { ref: '', configured: false, source: null, masked: '', tag8: '' },
      account: { available: false, signedIn: false, name: null, avatarUrl: null, contact: null },
      error: toWireError(classify(error)),
    })
  }
}

/** `POST /api/v1/config`。请求是任意字段子集；形状不合法或校验失败一律 `422`。 */
export async function handleConfigUpdate(request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  let patch: Record<string, unknown>
  try {
    const body = await readJsonObject(request)
    if (body === null)
      return json(
        {
          requestId,
          error: { code: 'VALIDATION', message: 'body must be a JSON object', retryable: false },
        },
        422,
      )
    const unknown = Object.keys(body).filter((key) => !CONFIG_FIELDS.some((field) => field === key))
    if (unknown.length > 0) {
      return json(
        {
          requestId,
          error: {
            code: 'VALIDATION',
            message: `unknown config field: ${unknown.join(', ')}`,
            retryable: false,
          },
        },
        422,
      )
    }
    patch = body
    if (Object.keys(patch).length > 0) {
      // 跨字段先验：0.1.7 起宿主侧不再强制「告急严格低于预警」
      // （register 的 validate 被删、schema 没有跨字段钩子），所以这条端点成了
      // **唯一**还能在写入侧拦住非法组合的地方。理由是它比官方 Plugins 页那条写路径
      // 多一层我们的代码；官方那条是宿主直连的原子 mutate，只跑 schema，拦不住。
      // 违反 ⇒ 422 且什么都不写。判据与消费侧守卫共用同一个 validateThresholds。
      validateThresholds({ ...deps.config.current(), ...patch } as Config)
      await deps.config.update(patch)
    }
  } catch (error) {
    deps.logger?.warn('ds-balance: config write rejected', {
      requestId,
      error: describeError(error),
    })
    return json({ requestId, error: toWireError(classify(error)) }, 422)
  }
  // 写完立刻回读，让调用方看到落盘后的真实值（掩码同上）。
  try {
    return json(await configBody(requestId, deps))
  } catch (error) {
    deps.logger?.error('ds-balance: config readback failed', {
      requestId,
      error: describeError(error),
    })
    return json({ requestId, schemaVersion: SCHEMA_VERSION, error: toWireError(classify(error)) })
  }
}

/**
 * `POST /api/v1/test-connection`。**不动活动缓存。**
 *
 * 请求体 `{ source?, apiKey?, timeoutMs? }`。
 * - `source` 省略或 `deepseek-http`（默认）：走官方余额端点，行为与从前逐字相同；
 * - `source: 'deepseek-account'`：走账号那条路真读一次钱包。
 *
 * **真连一次上游**，回真实的 `latencyMs`。这正是它存在的意义 ——
 * 界面上的 **Test** 按钮读的就是这里，而不是本地字符串检查。
 *
 * **余额预览不在这里**：卡片按 [settings/AGENTS.md](../client/settings/AGENTS.md)
 * 不许出现任何额度信息，所以账号那条只回成败与延迟，不回钱包内容。
 */
export async function handleTestConnection(request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  try {
    const body = await readJsonObject(request)
    const rawSource = body?.source
    const source = rawSource === 'deepseek-account' ? 'deepseek-account' : 'deepseek-http'

    if (source === 'deepseek-account') {
      const account = deps.account()
      if (account === undefined) {
        return json({
          requestId,
          schemaVersion: SCHEMA_VERSION,
          source,
          ok: false,
          latencyMs: 0,
          code: 'NO_KEY',
          message: 'account service is not available',
        })
      }
      const startedAt = Date.now()
      try {
        const balance = await account.readBalance()
        const latencyMs = Date.now() - startedAt
        if (balance === null) {
          return json({
            requestId,
            schemaVersion: SCHEMA_VERSION,
            source,
            ok: false,
            latencyMs,
            code: 'NO_KEY',
            message: 'account is not signed in',
          })
        }
        return json({ requestId, schemaVersion: SCHEMA_VERSION, source, ok: true, latencyMs })
      } catch (error) {
        const latencyMs = Date.now() - startedAt
        const info = classify(error)
        return json({
          requestId,
          schemaVersion: SCHEMA_VERSION,
          source,
          ok: false,
          latencyMs,
          code: info.code,
          message: info.message,
        })
      }
    }

    const rawTimeout = Number(body?.timeoutMs)
    const timeoutMs =
      Number.isFinite(rawTimeout) &&
      rawTimeout >= TEST_TIMEOUT_RANGE.min &&
      rawTimeout <= TEST_TIMEOUT_RANGE.max
        ? Math.trunc(rawTimeout)
        : deps.config.timeoutMs()
    const rawApiKey = body?.apiKey
    const apiKey =
      typeof rawApiKey === 'string' && rawApiKey.trim() !== ''
        ? rawApiKey.trim()
        : await deps.keys.resolve().catch((): null => null)
    if (apiKey === null)
      return json({
        requestId,
        schemaVersion: SCHEMA_VERSION,
        source,
        ok: false,
        latencyMs: 0,
        code: 'NO_KEY',
        message: NO_KEY_MESSAGE,
      })
    const result = await deps.client.testConnection({ baseUrl: ENDPOINT, apiKey, timeoutMs })
    return json({ requestId, schemaVersion: SCHEMA_VERSION, source, ...result })
  } catch (error) {
    deps.logger?.warn('ds-balance: test-connection handler failed', {
      requestId,
      error: describeError(error),
    })
    const info = classify(error)
    return json({
      requestId,
      schemaVersion: SCHEMA_VERSION,
      source: 'deepseek-http',
      ok: false,
      latencyMs: 0,
      code: info.code,
      message: info.message,
    })
  }
}

/** `GET /api/v1/healthz`。 */
export async function handleHealthz(_request: Request, deps: HttpDeps): Promise<Response> {
  const requestId = newRequestId()
  const status = deps.service.status()
  let store: { ok: boolean; detail: string | null }
  try {
    const health = await deps.store.health()
    store = { ok: health.ok, detail: health.detail ?? null }
  } catch (error) {
    store = { ok: false, detail: describeError(error) }
  }
  return json({
    requestId,
    schemaVersion: SCHEMA_VERSION,
    version: PLUGIN_VERSION,
    // 当前活跃来源：两条路并存时，这是唯一能一眼看出「现在服务的是哪条」的地方。
    source: status.source,
    state: status.state,
    /** 活跃账本此刻会画成什么 —— 不开浏览器也能知道界面长什么样。 */
    situation: situationOf({
      hasSnapshot: status.hasSnapshot,
      stale: status.state === 'stale',
      isAvailable: status.isAvailable,
      hasSelected: status.hasSelected,
      severity: status.severity,
      errorCode: status.errorCode,
    }),
    lastSuccessAt: status.lastSuccessAt,
    consecutiveFailures: status.consecutiveFailures,
    scheduler: { running: deps.scheduler.isRunning(), nextRunAt: deps.scheduler.nextRunAt() },
    store,
    // 默认组合没有指标 sink，所以把聚合值挂在这里暴露；没接线时是 null。
    metrics: deps.metrics?.snapshot() ?? null,
  })
}
