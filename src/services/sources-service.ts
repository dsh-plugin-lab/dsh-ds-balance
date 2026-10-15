/**
 * 取数途径的状态服务。
 *
 * **这是「连接」组唯一的事实出口**：两条途径（API Key / 账号登录）的只读状态都从这里出去，
 * 界面不再自己拼判据、也不再跨端点拼两半。
 *
 * 为什么值得单独一层：
 * - 判据本来散在三处（客户端的 `use-credential-state`、卡片的徽章映射、`data.ts` 的形状守卫），
 *   每处都能各自漂；收敛到这里之后只剩一进一出。
 * - 只有后端同时持有 `credentials` 与 `deepseekAccount` 两个接缝，所以只有它能一次答完。
 * - `revision` 是**凭据世代**：凭据库变了或账号登录态变了就 +1。界面拿它当「有没有东西换了」
 *   的判据 —— 这样密钥本身永远不必进 React 的依赖串（那是既有决策，
 *   见 [边界记录](../../.agents/notes/2026-10-01-boundaries-left-as-is.md) 第 3 条）。
 *
 * **明文密钥只在本文件的生命周期内出现一次**：解析 → 折成掩码与账本标识 → 丢掉。
 * 掩码之外的任何形态都不出这个函数，见 [domain/credential.ts](../domain/credential.ts)。
 *
 * **判据只有一份**：值、来源层、配没配，全部由解析链（[key-resolver.ts](key-resolver.ts)）
 * 与官方 `describe()` 回答。本文件不自己再读一遍环境变量或配置。
 * @module dsh-ds-balance/services/sources-service
 */

import { maskKey } from '../domain/credential.js'
import type { BalanceSource } from '../domain/balance.js'
import type { Credentials } from '../ports/credentials.js'
import type { AccountIdentity, AccountSource } from '../ports/account.js'
import type { Logger } from '../ports/logger.js'
import { ACCOUNT_SOURCE, HTTP_SOURCE } from './source-selector.js'
import type { KeyResolver } from './key-resolver.js'
import { computeAccountTag } from './account-tag.js'

/** 一条途径的只读状态。形状与线上 `WireKeySource` / `WireAccountSource` 逐字相同。 */
export interface KeySourceState {
  readonly ref: string
  readonly configured: boolean
  readonly source: string | null
  readonly masked: string
  readonly tag8: string
}

/** 账号那条途径的只读状态。 */
export interface AccountSourceState {
  readonly available: boolean
  readonly signedIn: boolean
  readonly name: string | null
  readonly avatarUrl: string | null
  readonly contact: string | null
}

/** 一次读取给出的完整状态。 */
export interface SourcesSnapshot {
  readonly revision: number
  readonly key: KeySourceState
  readonly account: AccountSourceState
}

/** 构造参数。 */
export interface SourcesServiceOptions {
  /** 解析链；拿明文只为算掩码与账本标识。 */
  keys: KeyResolver
  /** 凭据服务；缺席时只用环境变量判。 */
  credentials?: Credentials | undefined
  /** 取当前账号端口实现；服务可能晚到，所以是函数而不是实例。 */
  account: () => AccountSource | undefined
  /** 服务端盐（算账本标识用）。 */
  salt: string
  logger?: Logger | undefined
}

/**
 * 两条途径的状态。
 *
 * 缓存策略是「按需重建」而不是定时刷新：`snapshot()` 在没有缓存时读一次，
 * `refresh()` 强制重读。**账号身份是一次真上游请求**（宿主 `getProfile` 每次打 Platform），
 * 所以它必须被缓存 —— 渲染一次问一次是不行的。
 */
export class SourcesService {
  private readonly options: SourcesServiceOptions
  /** 当前缓存；`undefined` 表示还没读过。 */
  private cache: SourcesSnapshot | undefined
  /** 凭据世代。凭据或登录态一变就 +1，界面据此知道「有东西换了」。 */
  private generation = 0

  constructor(options: SourcesServiceOptions) {
    this.options = options
  }

  /**
   * 当前快照；没有缓存时先读一次。
   *
   * 读失败**不抛**：界面读不到状态时应当显示「未确认」而不是整张卡片消失。
   * 所以失败会退化成一份保守快照（两条途径都「读不到」），并记一笔 debug。
   * @returns 快照。
   */
  async snapshot(): Promise<SourcesSnapshot> {
    if (this.cache !== undefined) return this.cache
    return await this.refresh()
  }

  /**
   * 强制重读一次并换掉缓存。
   *
   * 调用时机：卡片打开、窗口重新获得焦点、点 **Test**、以及凭据变更事件之后。
   * @returns 新快照。
   */
  async refresh(): Promise<SourcesSnapshot> {
    const key = await this.readKey()
    const account = await this.readAccount()
    const snapshot: SourcesSnapshot = { revision: this.generation, key, account }
    this.cache = snapshot
    return snapshot
  }

  /**
   * 现读生效的凭据引用名。
   *
   * 订阅方拿它判「这条事件是不是与我有关」：事件只给引用名，不给值。
   * @returns 引用名；读不到时回空串。
   */
  keyRef(): string {
    return this.currentRef()
  }

  /**
   * **这条取数路用的是哪一份凭据** —— 给余额响应标注来路的那个事实。
   *
   * 它跟数字一起走（`GET /api/v1/balance` 的 `sourceIdentity`），而不是让界面另外去读一次
   * `/api/v1/sources`：两个缓存各自刷新时，**标签会先跳、数字还停在旧的**，
   * 那就是在标错来源 —— 比不标更糟。
   *
   * 回的是**不可逆的掩码**（首尾片段）或账号名，不是密钥本身。
   * 认不出这条路、或这条路没有身份时回 `null`（界面据此退回「（API Key）」那种路名标签）。
   * @param source - 这一份数字来自哪条路。
   * @returns 掩码 key / 账号名；没有则 null。
   */
  async identityOf(source: BalanceSource): Promise<string | null> {
    try {
      const snapshot = await this.snapshot()
      if (source === HTTP_SOURCE) return snapshot.key.masked === '' ? null : snapshot.key.masked
      if (source === ACCOUNT_SOURCE) return snapshot.account.name
      return null
    } catch {
      // 读不到身份只是少一个标签，绝不能连累余额响应本身。
      return null
    }
  }

  /**
   * 作废缓存并把世代 +1。
   *
   * 宿主侧订阅到凭据变更（或账号登出）时调它。**下一次读取会拿到新世代**，
   * 所以界面靠「世代变了」就能知道该重读，不必把密钥放进依赖串。
   * @returns 新的世代号。
   */
  invalidate(): number {
    this.generation += 1
    this.cache = undefined
    return this.generation
  }

  /**
   * 读 Key 那条途径。
   *
   * **判据只有一份：解析链自己**（`resolveWithSource()` 一并回报值与来源层）。
   * 这里不自己再读一遍环境变量 —— 那是第二份判据，两者迟早会漂。
   *
   * 掩码与账本标识取自链拿到的明文；解析失败只表示「这条路此刻没凭据」，不是错误。
   * @returns 状态。
   */
  private async readKey(): Promise<KeySourceState> {
    const ref = this.currentRef()
    let plain = ''
    let source: string | null = null
    try {
      const resolved = await this.options.keys.resolveWithSource()
      plain = resolved.value
      source = resolved.source
    } catch {
      // 解析链没取到值就是「这条路没凭据」；来源层留 null（界面显示「状态未确认」）。
    }
    // 链给不出值时，仍问一次 describe 判「配没配」：凭据存储里可能有值，
    // 只是解析链因为别的原因没走到（例如引用名形状被判非法）。
    const described = plain === '' ? await this.describe(ref) : null
    return {
      ref,
      configured: plain !== '' || described?.configured === true,
      source: source ?? described?.source ?? null,
      masked: maskKey(plain),
      tag8: plain === '' ? '' : computeAccountTag(this.options.salt, plain).slice(0, 8),
    }
  }

  /** 现读生效的引用名；配置读不到时回落 schema 默认值。 */
  private currentRef(): string {
    try {
      const ref = this.options.keys.describeRef()
      return ref === '' ? '' : ref
    } catch {
      return ''
    }
  }

  /**
   * 问官方凭据服务要来源层。
   *
   * 失败一律回 `null`（端口缺席、引用名非法、远程拒绝）：界面据此退化成
   * 「未确认」，而不是把整张卡片打挂。
   * @param ref - 生效的引用名。
   * @returns 来源层与可写性，或 `null`。
   */
  private async describe(
    ref: string,
  ): Promise<{ configured: boolean; source: string | null } | null> {
    const credentials = this.options.credentials
    if (credentials === undefined || ref === '') return null
    try {
      const described = await credentials.describe(ref)
      return { configured: described.configured === true, source: described.source ?? null }
    } catch (error) {
      this.options.logger?.debug('ds-balance: credential describe failed', {
        ref,
        error: String(error),
      })
      return null
    }
  }

  /**
   * 读账号那条途径。
   *
   * `signedIn()` 是**本地读**（宿主只读一次存储记录，不打网络）；`profile()` 才是上游请求。
   * 所以未登录时**不问身份** —— 省掉一次注定失败的 Platform 调用。
   * @returns 状态。
   */
  private async readAccount(): Promise<AccountSourceState> {
    const account = this.options.account()
    if (account === undefined) {
      // 宿主没装账号接缝：整条途径不存在。界面据此显示「不可用」而不是让它消失 ——
      // 消失会让人以为是 bug。
      return { available: false, signedIn: false, name: null, avatarUrl: null, contact: null }
    }
    // `signedIn()` 抛错时当未登录：这条路读不到就是「此刻用不上」，
    // 不是「整个端点坏掉」—— 端点还得把 Key 那条途径报出去。
    const signedIn = await account.signedIn().catch(() => false)
    if (!signedIn) {
      return { available: true, signedIn: false, name: null, avatarUrl: null, contact: null }
    }
    const identity: AccountIdentity | null = await account.profile().catch(() => null)
    return {
      available: true,
      signedIn: true,
      name: identity?.name ?? null,
      avatarUrl: identity?.avatarUrl ?? null,
      contact: identity?.contact ?? null,
    }
  }
}
