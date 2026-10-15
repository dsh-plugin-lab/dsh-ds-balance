/**
 * 线上形状与序列化。
 *
 * 契约见 docs/BACKEND-CONTRACTS.md §8：**金额一律八位小数字符串**，
 * `bigint` 最小单位只活在进程内。本模块是纯函数，不碰 `ctx`、不发请求。
 * @module dsh-ds-balance/http/wire
 */

import { randomUUID } from 'node:crypto'
import type {
  BalanceSource,
  BalanceView,
  CacheState,
  Currency,
  Severity,
  ThresholdPair,
} from '../domain/balance.js'
import type { ErrorCode, ErrorInfo } from '../domain/errors.js'
import { formatMoney } from '../domain/money.js'
import type { Situation } from '../domain/situation.js'
import { SCHEMA_VERSION } from '../version.js'

/** 一个币种的余额，金额是八位小数字符串。 */
export interface WireBalance {
  currency: Currency
  total: string
  granted: string
  toppedUp: string
}

/** 一个币种的阈值，金额同样是字符串。 */
export interface WireThresholdPair {
  warn: string
  critical: string
}

/**
 * 线上的错误结构。
 *
 * `details` **不出去**：它可能带上游原文，属于内部诊断面。
 * `code` 取宿主闭集 {@link ErrorCode} —— 线上只出现这几种码。
 */
export interface WireError {
  code: ErrorCode
  message: string
  retryable: boolean
}

/**
 * 凭据的只读描述。
 *
 * 形状逐字对齐官方 `credentialProvider.describe()`：**只有三个事实，没有装值的槽**。
 * 界面靠它决定凭据字段是「可编辑」还是「由启动环境提供」。
 */
export interface WireCredentialInfo {
  ref: string
  configured: boolean
  source: string | null
  writable: boolean
}

/**
 * 一条取数途径的只读状态。
 *
 * **这是「连接」组唯一的事实出口**：界面不再自己拼四档判据，也不再跨端点拼两半。
 * 判据住在后端（它本来就持有 `credentials` 与 `deepseekAccount`），客户端只渲染。
 *
 * `masked` 是**首尾片段掩码**（`sk-cf08d*****3b84`），与平台控制台
 * `platform.deepseek.com/api_keys` 同形 —— **完整密钥永不跨这条线**，
 * 后端解析出明文后立刻算掩码并丢掉明文。见 [AGENTS.md](AGENTS.md) 的红线。
 */
export interface WireKeySource {
  /** 生效的凭据引用名。 */
  ref: string
  /** 解析链此刻能不能拿到值（`credentials` 或环境变量任一有）。 */
  configured: boolean
  /** 生效值的来源层：`file` / `env` / `project-env` / `user-env`；未知为 `null`。 */
  source: string | null
  /** 首尾片段掩码；未配置或拿不到明文时是空串。 */
  masked: string
  /** 账本标识前 8 位（`HMAC(salt, key)`）；未配置时是空串。 */
  tag8: string
}

/** 账号登录那条途径的只读状态。 */
export interface WireAccountSource {
  /** 宿主是否装了账号接缝。缺席时整条途径不存在，界面据此显示「不可用」而不是消失。 */
  available: boolean
  /** 本地存着登录凭据（存储态，不代表服务端验过）。 */
  signedIn: boolean
  /** 账号显示名；读不到时为 `null`。 */
  name: string | null
  /** 头像 URL；没有头像时为 `null`。 */
  avatarUrl: string | null
  /** 服务端已脱敏的联系方式；读不到时为 `null`。 */
  contact: string | null
}

/**
 * `GET /api/v1/sources` 的响应体。
 *
 * `revision` 是**凭据世代**：凭据库变了、或账号登录态变了，它就 +1。
 * 界面拿它当「有没有东西换了」的判据 —— 不必把密钥本身放进 React 的依赖串。
 */
export interface WireSourcesResponse {
  requestId: string
  schemaVersion: number
  revision: number
  key: WireKeySource
  account: WireAccountSource
}

/** `GET /api/v1/balance` 的响应体。 */
export interface WireBalanceResponse {
  requestId: string
  schemaVersion: number
  /** 这一份数字是哪条取数路给的；界面据此在标题里标来源。 */
  source: BalanceSource
  /**
   * 处境：界面**唯一**的分支入口。
   *
   * 环 / 文案 / 来源标签都由它派生。`state` 与 `severity` 仍留在契约里（旧客户端要活），
   * 但新界面不再读它们做形态判断 —— 见 [domain/situation.ts](../domain/situation.ts)。
   */
  situation: Situation
  state: CacheState
  stale: boolean
  fetchedAt: number
  ageMs: number
  isAvailable: boolean
  accountTag8: string
  balances: WireBalance[]
  selected: { currency: Currency; total: string } | null
  severity: Severity
  thresholds: Record<Currency, WireThresholdPair>
  /** 第一版不做「今日已用」；字段保留以维持契约完整。 */
  todayUsage: null
  error: WireError | null
}

/** 生成一个请求标识。只用于把响应与前端的日志对上，不含任何账户信息。 */
export function newRequestId(): string {
  return `req_${randomUUID().replaceAll('-', '').slice(0, 16)}`
}

/** 把错误折成线上形状。 */
export function toWireError(info: ErrorInfo): WireError {
  return { code: info.code, message: info.message, retryable: info.retryable }
}

/** 把 `bigint` 最小单位折成八位小数字符串。 */
function amount(units: bigint): string {
  return formatMoney(units)
}

/** 把一个币种的阈值折成线上形状。 */
function thresholdPair(pair: ThresholdPair): WireThresholdPair {
  return { warn: amount(pair.warn), critical: amount(pair.critical) }
}

/**
 * 把领域视图折成线上响应。
 *
 * 两处刻意的兜底，都是为了让响应仍能通过前端的字段类型：
 * - 没有快照时 `fetchedAt` / `ageMs` 记 0（前端把 0 读成「刚刚」，
 *   与 mock 在空态 / 错误态给的取值一致）；
 * - 没有快照时 `isAvailable` 记 `false`。
 * @param view - 服务层给出的视图。
 * @param accountTag8 - 当前账本标识前 8 位；没有快照时传空串。
 * @param requestId - 本次请求的标识。
 * @returns 契约 §8.3 的响应体。
 */
export function toWireBalanceView(
  view: BalanceView,
  accountTag8: string,
  requestId: string,
): WireBalanceResponse {
  const thresholds: Record<Currency, WireThresholdPair> = {}
  for (const [currency, pair] of Object.entries(view.thresholds)) {
    thresholds[currency] = thresholdPair(pair)
  }
  return {
    requestId,
    schemaVersion: SCHEMA_VERSION,
    source: view.source,
    situation: view.situation,
    state: view.state,
    stale: view.stale,
    fetchedAt: view.fetchedAt ?? 0,
    ageMs: view.ageMs ?? 0,
    isAvailable: view.isAvailable ?? false,
    accountTag8,
    balances: view.balances.map((item) => ({
      currency: item.currency,
      total: amount(item.total),
      granted: amount(item.granted),
      toppedUp: amount(item.toppedUp),
    })),
    selected:
      view.selected === null
        ? null
        : { currency: view.selected.currency, total: amount(view.selected.total) },
    severity: view.severity,
    thresholds,
    todayUsage: null,
    error: view.error === null ? null : toWireError(view.error),
  }
}
