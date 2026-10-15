/**
 * 账号登录态端口。
 *
 * 宿主提供这条接缝（`ctx.deepseekAccount`）时才装配；**缺席时账号那条取数路整条不存在**，
 * 插件退回只看 API Key —— 与没有这条接缝之前逐字相同。
 * @module dsh-ds-balance/ports/account
 */

import type { AccountBalance } from '../domain/account.js'

/**
 * 账号的显示身份。
 *
 * **只有账号那条路有身份**：API Key 是一串没有身份的字符串，官方 `AccountProfile`
 * 也只存在于账号侧。所以「连接」组的两行不是对称的 —— 账号那行有头像与名字，
 * Key 那行只有引用名与掩码。
 *
 * `contact` 由**服务端脱敏**后给出（如 `138****5678`），本插件不再加工。
 */
export interface AccountIdentity {
  /** 显示名；平台没给时为 `null`。 */
  readonly name: string | null
  /** 头像 URL；没有头像时为 `null`。 */
  readonly avatarUrl: string | null
  /** 已脱敏的联系方式；没有时为 `null`。 */
  readonly contact: string | null
}

/** 账号来源的只读面。没有写入口：余额只是读。 */
export interface AccountSource {
  /** 本地存着登录凭据（宿主原文：存储态，不代表服务端验过）。 */
  signedIn(): Promise<boolean>
  /**
   * 稳定账号 id：作为账号账本的派生输入。
   *
   * 拿不到时回 `null`（宿主本次进程还没读过 profile），调用方按「未知账号」处理。
   */
  accountId(): Promise<string | null>
  /**
   * 读一次账号身份（名字 / 头像 / 脱敏联系方式）。
   *
   * **这是一次真上游请求**（宿主 `getProfile` 每次都打 Platform，只有上一次失败时才用
   * 同一 grant 的缓存兜底），所以调用方必须缓存它，不许每次渲染都问。
   * 未登录或资料读不到时回 `null`。
   */
  profile(): Promise<AccountIdentity | null>
  /**
   * 读一次钱包。
   *
   * `null` 表示**此刻没有可用账号**（未登录，或凭据在查询途中被换掉）——
   * 调用方据此回落另一条路，而不是把它当成零余额。
   */
  readBalance(): Promise<AccountBalance | null>
}
