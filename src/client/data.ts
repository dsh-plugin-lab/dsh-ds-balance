/**
 * 数据层：向后端要余额。
 *
 * 端点由宿主半边的 `ctx.connection.fetch` 注册，物理载体**已做完信任与浏览器
 * 鉴权**，所以浏览器这边只是同源 `fetch`，不带任何自己的凭据。
 *
 * **本模块不缓存、不合并、不排程**：节奏归调用方（`SidebarBalance` 的轮询与
 * 手动刷新），这里只负责一次往返与两件事 —— 把 `displayCurrency` 作为查询参数
 * 传过去、把失败翻成可展示的错误态。
 * @module dsh-ds-balance/client/data
 */

import type { BalanceResponse, BalanceState } from './api-types.ts'

/** 余额端点。路径与宿主半边逐字一致，不带尾随斜杠。 */
export const BALANCE_PATH = '/api/v1/balance'

/** 手动刷新端点。 */
export const REFRESH_PATH = '/api/v1/balance/refresh'

/** 配置读端点。界面只从这里取「凭据可不可写」这一件事。 */
export const CONFIG_PATH = '/api/v1/config'

/** 两条取数途径的状态端点。「连接」组的唯一事实出口。 */
export const SOURCES_PATH = '/api/v1/sources'

/** 测连接端点。**真打上游**，不是本地模拟。 */
export const TEST_PATH = '/api/v1/test-connection'

/** 可替换的 fetch，便于测试注入。 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

/**
 * 凭据的只读描述。
 *
 * 与宿主的线上形状同构，也逐字对齐官方 `describe()`：**没有装值的槽**。
 */
export interface CredentialInfo {
  ref: string
  configured: boolean
  source: string | null
  writable: boolean
}

/** `GET /api/v1/config` 里本插件消费的那部分。 */
export interface ConfigResponse {
  config: Record<string, unknown>
  /** 已配置时是固定长度的星号串；**不含密钥的任何片段**。 */
  apiKeyMasked: string
  /** 凭据端口缺席或读失败时是 `null`。 */
  credential: CredentialInfo | null
  timeoutMs: number
}

/** `POST /api/v1/balance/refresh` 的响应。 */
export interface RefreshResult {
  triggered: boolean
  joined: boolean
  cooldownMs: number
  state: BalanceState
}

/** 一条取数途径的只读状态。与后端 `WireKeySource` 同形。 */
export interface KeySourceInfo {
  ref: string
  configured: boolean
  source: string | null
  /** 首尾片段掩码，如 `sk-cf08d*****3b84`；未配置时是空串。 */
  masked: string
  /** 账本标识前 8 位；未配置时是空串。 */
  tag8: string
}

/** 账号那条途径的只读状态。与后端 `WireAccountSource` 同形。 */
export interface AccountSourceInfo {
  available: boolean
  signedIn: boolean
  name: string | null
  avatarUrl: string | null
  contact: string | null
}

/** `GET /api/v1/sources` 的响应里本插件消费的那部分。 */
export interface SourcesResponse {
  /** 凭据世代；变了就说明有东西换了。`-1` 表示这份快照不可信。 */
  revision: number
  key: KeySourceInfo
  account: AccountSourceInfo
}

/** 一次测连接的结果。 */
export interface TestResult {
  source: 'deepseek-http' | 'deepseek-account'
  ok: boolean
  latencyMs: number
  code?: string
  message?: string
}

/**
 * 「读不到状态」时的保守快照。
 *
 * 两条途径都说「读不到」，世代 `-1` 让界面认得出这份不可信。
 * **不抛错、不返回 null**：卡片读不到状态时该显示「未确认」，
 * 而不是让整张卡片消失（与 `credential` 段同一策略）。
 * @returns 保守快照。
 */
export function unknownSources(): SourcesResponse {
  return {
    revision: -1,
    key: { ref: '', configured: false, source: null, masked: '', tag8: '' },
    account: { available: false, signedIn: false, name: null, avatarUrl: null, contact: null },
  }
}

/** 端点拿不到、或回的不是 JSON 时用的错误码。 */
export const UNREACHABLE_CODE = 'PLUGIN_UNREACHABLE'

/**
 * 「还没拿到数据」的占位视图。
 *
 * 处境是 `checking`：首帧**不该**先闪一下「尚未配置」—— 那是「没接入」的说法，
 * 而我们此刻只是还没问到。
 * @returns 契约形状的响应。
 */
export function pendingView(): BalanceResponse {
  return {
    requestId: '',
    schemaVersion: 1,
    // 占位视图没有取数路可言；处境为 checking / offline 时界面都不渲染来源标签。
    source: 'deepseek-http',
    // 占位视图也就没有「哪一份凭据」可言；界面同样不渲染标签。
    sourceIdentity: null,
    situation: 'checking',
    state: 'empty',
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
    error: null,
  }
}

/**
 * 「拿不到数据」的视图。
 *
 * 处境是 `offline` —— **插件自己的端点不可达**，这与「接入了但上游读不到」
 * （`fetch-failed`）是两件不同的事：后者我们至少知道自己问了谁。
 * 只在**一次都没成功过**的时候用；已经有数据时宁可继续显示旧值 ——
 * 后端自己的 `state: stale` 才是「数据过期」的权威表达。
 * @param message - 面向用户的一句话。
 * @returns 契约形状的响应。
 */
export function unreachableView(message: string): BalanceResponse {
  return {
    ...pendingView(),
    situation: 'offline',
    state: 'error',
    error: { code: UNREACHABLE_CODE, message },
  }
}

/** 读一个 JSON 响应；非 2xx 或不是 JSON 都抛错。 */
async function readJson<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) throw new Error(`${path} responded ${response.status}`)
  try {
    return (await response.json()) as T
  } catch {
    throw new Error(`${path} did not return JSON`)
  }
}

/**
 * 读一次余额。
 *
 * `displayCurrency` **总是**作为查询参数传出去，包括 `auto` —— 后端的挑选规则
 * 把 `auto` 当作「不指定」，所以传它不等于替后端做决定。
 *
 * `provider` 是**当前会话在用的路由**这条提示：后端据此选数据来源。读不到会话时
 * 干脆不传，后端回落到全局默认路由 —— 提示缺席不该让界面失去来源。
 * @param options - 显示币种、会话路由提示、可注入的 fetch 与取消信号。
 * @returns 后端响应。
 * @throws 端点不可达、非 2xx 或响应不是 JSON。
 */
export async function requestBalance(options: {
  currency: string
  provider?: string | undefined
  fetchImpl?: FetchLike
  signal?: AbortSignal
}): Promise<BalanceResponse> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const query = new URLSearchParams({ currency: options.currency })
  if (options.provider !== undefined && options.provider !== '') {
    query.set('provider', options.provider)
  }
  const url = `${BALANCE_PATH}?${query.toString()}`
  const response = await fetchImpl(url, {
    headers: { accept: 'application/json' },
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  })
  return await readJson<BalanceResponse>(response, BALANCE_PATH)
}

/**
 * 只认形状对得上的凭据描述。
 *
 * **宿主可能是旧版本**（客户端由 HMR 立刻换新，宿主模块要重启才换），那时响应里
 * 根本没有这个字段。这里把它规整成 `null`，而不是让 `undefined` 漏到组件里去。
 * @param value - 响应里的原始值。
 * @returns 规整后的描述，或 `null`。
 */
function readCredential(value: unknown): CredentialInfo | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (typeof record.ref !== 'string' || record.ref === '') return null
  return {
    ref: record.ref,
    configured: record.configured === true,
    source: typeof record.source === 'string' ? record.source : null,
    writable: record.writable === true,
  }
}

/**
 * 读一次插件配置。
 *
 * 只为拿 `credential`：界面靠 `writable` 决定凭据字段是「可编辑」还是
 * 「由启动环境提供（只读）」。**响应里没有密钥**，掩码是固定长度的星号串。
 * @param options - 可注入的 fetch。
 * @returns 配置响应里本插件消费的那部分。
 * @throws 端点不可达、非 2xx 或响应不是 JSON。
 */
export async function requestConfig(
  options: { fetchImpl?: FetchLike } = {},
): Promise<ConfigResponse> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const response = await fetchImpl(CONFIG_PATH, { headers: { accept: 'application/json' } })
  const body = await readJson<ConfigResponse>(response, CONFIG_PATH)
  return { ...body, credential: readCredential(body?.credential) }
}

/**
 * 触发一次手动刷新。
 *
 * 后端的冷却还没过时它回 `triggered: false`，那是正常结果而不是错误。
 * `provider` 与读取余额时给的是同一条提示：刷新要刷**你正在看的那个来源**。
 * @param options - 刷新原因、会话路由提示与可注入的 fetch。
 * @returns 后端的刷新结果。
 * @throws 端点不可达、非 2xx 或响应不是 JSON。
 */
export async function requestRefresh(
  options: { reason?: string; provider?: string | undefined; fetchImpl?: FetchLike } = {},
): Promise<RefreshResult> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const response = await fetchImpl(REFRESH_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      reason: options.reason ?? 'manual',
      ...(options.provider === undefined || options.provider === ''
        ? {}
        : { provider: options.provider }),
    }),
  })
  return await readJson<RefreshResult>(response, REFRESH_PATH)
}

/** 把一个值读成非空字符串，否则 `null`。 */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * 只认形状对得上的 Key 状态。
 *
 * **宿主可能是旧版本**（客户端由 HMR 立刻换新，宿主模块要重启才换），那时响应里
 * 根本没有这个字段。这里把它规整成保守值，而不是让 `undefined` 漏到组件里去 ——
 * 这条纪律来自一次真实事故（见 docs/postmortem/2026-09-17-client-host-version-skew.md）。
 * @param value - 响应里的原始值。
 * @returns 规整后的状态。
 */
function readKeySource(value: unknown): KeySourceInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return unknownSources().key
  }
  const record = value as Record<string, unknown>
  return {
    ref: typeof record.ref === 'string' ? record.ref : '',
    configured: record.configured === true,
    source: stringOrNull(record.source),
    masked: typeof record.masked === 'string' ? record.masked : '',
    tag8: typeof record.tag8 === 'string' ? record.tag8 : '',
  }
}

/** 只认形状对得上的账号状态；形状不对时当「不可用」。 */
function readAccountSource(value: unknown): AccountSourceInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return unknownSources().account
  }
  const record = value as Record<string, unknown>
  return {
    available: record.available === true,
    signedIn: record.signedIn === true,
    name: stringOrNull(record.name),
    avatarUrl: stringOrNull(record.avatarUrl),
    contact: stringOrNull(record.contact),
  }
}

/**
 * 读一次两条途径的状态。
 *
 * `refresh` 为真时让后端强制重读（绕过它的缓存）—— 卡片打开、窗口重新获得焦点、
 * 点 **Test** 时都用它。这正是修掉「在官方页换了 key，这里还显示旧的那把」的那一环。
 * @param options - 是否强制重读，以及可注入的 fetch。
 * @returns 两条途径的状态；形状不对时退化成保守快照。
 * @throws 端点不可达、非 2xx 或响应不是 JSON。
 */
export async function requestSources(
  options: { refresh?: boolean; fetchImpl?: FetchLike } = {},
): Promise<SourcesResponse> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const url = options.refresh === true ? `${SOURCES_PATH}?refresh=1` : SOURCES_PATH
  const response = await fetchImpl(url, { headers: { accept: 'application/json' } })
  const body = await readJson<Partial<SourcesResponse>>(response, SOURCES_PATH)
  return {
    revision: typeof body?.revision === 'number' ? body.revision : -1,
    key: readKeySource(body?.key),
    account: readAccountSource(body?.account),
  }
}

/**
 * 测一条途径的连接。**真打上游。**
 *
 * 这是对从前那个「本地字符串检查 + 800ms 假延迟」的替换：界面上那个按钮
 * 现在读的是后端已经写好、也已经测过的真端点。
 * @param source - 测哪条途径。
 * @param options - 可注入的 fetch。
 * @returns 结果；失败也是一份合法结果（`ok: false` + `code`）。
 * @throws 端点不可达、非 2xx 或响应不是 JSON。
 */
export async function requestTest(
  source: 'deepseek-http' | 'deepseek-account',
  options: { fetchImpl?: FetchLike } = {},
): Promise<TestResult> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const response = await fetchImpl(TEST_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ source }),
  })
  const body = await readJson<TestResult>(response, TEST_PATH)
  return { ...body, source }
}
