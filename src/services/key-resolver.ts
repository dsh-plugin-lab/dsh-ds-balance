/**
 * 密钥解析。
 *
 * 解析链（优先级从高到低）：`credentials.resolve(apiKeyRef)` →
 * `process.env[apiKeyRef]` → 抛 {@link NoKeyError}。
 *
 * **第一档「配置 `apiKey`」已删（3.0）**：它让手改 `settings.yaml` 的人可以静默压过
 * 官方那份凭据，而界面读的 `credentials.describe()` 看不见它 —— 于是「凭据来源」展示
 * 会说假话。删掉后这条链就是「跟随官方」的字面实现。见
 * [决策记录](../../.agents/notes/2026-10-15-drop-apikey-field.md)。
 *
 * **无 credentials seam 时不抛错**：吞掉后继续往下走，让 env 层有机会接手。
 * @module dsh-ds-balance/services/key-resolver
 */

import { NoKeyError, describeError } from '../domain/errors.js'
import type { Credentials } from '../ports/credentials.js'
import type { Logger } from '../ports/logger.js'

/** 每次解析时现读的配置切片。 */
export interface KeyResolverConfig {
  apiKeyRef: string
}

/** 构造参数。 */
export interface KeyResolverOptions {
  /** 现读配置。**不许缓存** —— 用户改了要立刻生效。 */
  readConfig: () => KeyResolverConfig
  /** 凭据服务；装配里可能没有。 */
  credentials?: Credentials | undefined
  /** 环境变量表；默认 `process.env`。 */
  env?: Record<string, string | undefined>
  logger?: Logger | undefined
  /** 引用名合法性校验；默认用契约里的正则。 */
  isValidRef?: (ref: string) => boolean
}

/** 契约要求的引用名形状。 */
export const CREDENTIAL_REF_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 环境变量那一档在 `describe()` 口径下的来源名（官方也用 `env`）。 */
export const ENV_SOURCE = 'env'

/** 解析结果：明文值，以及它**从哪一档来的**。 */
export interface ResolvedKey {
  /** 明文密钥。**调用方负责不把它写进日志或消息。** */
  readonly value: string
  /** 来源层：凭据服务给的那个（`file` / `env` / …），或 `env`（我们自己的环境变量那一档）。 */
  readonly source: string
}

/** 解析当前可用的明文密钥。 */
export class KeyResolver {
  private readonly options: KeyResolverOptions

  constructor(options: KeyResolverOptions) {
    this.options = options
  }

  /**
   * 现读生效的凭据引用名（已 trim）。
   *
   * 「连接」组的 Key 那行要显示它，所以读引用名也走这里 —— 免得展示路径另读一份配置。
   * @returns 引用名；配置读不到时回空串。
   */
  describeRef(): string {
    try {
      return this.options.readConfig().apiKeyRef.trim()
    } catch {
      return ''
    }
  }

  /**
   * 走完整条解析链，并**一并回报值是从哪一档来的**。
   *
   * 为什么要回报来源：界面要展示「这把 key 是已保存的凭据还是环境变量」。
   * 判据只能有一份 —— 就是这条链本身。让消费方自己再读一遍环境变量是**第二份判据**，
   * 两者迟早会漂（本仓有一条注释说得很清楚：判据不许另抄一份）。
   * @returns 明文值与来源层。
   * @throws {NoKeyError} 整条链都没取到值。
   */
  async resolveWithSource(): Promise<ResolvedKey> {
    const ref = this.describeRef()
    if (ref === '') throw new NoKeyError('no API key: apiKeyRef is empty')

    const isValid =
      this.options.isValidRef ?? ((value: string): boolean => CREDENTIAL_REF_PATTERN.test(value))
    if (!isValid(ref)) {
      throw new NoKeyError(
        `no API key: apiKeyRef ${JSON.stringify(ref)} is not a valid credential reference`,
      )
    }

    if (this.options.credentials !== undefined) {
      try {
        const resolved = await this.options.credentials.resolve(ref)
        const value = (resolved?.value ?? '').trim()
        if (value !== '') return { value, source: resolved.source ?? 'credentials' }
      } catch (error) {
        // 没有 seam、引用名不存在、远程拒绝 —— 都只是「这一档没取到」，继续往下走。
        this.options.logger?.debug(
          'ds-balance: credentials.resolve did not yield a key, falling back to env',
          {
            ref,
            error: describeError(error),
          },
        )
      }
    }

    const env = this.options.env ?? process.env
    const fromEnv = (env[ref] ?? '').trim()
    if (fromEnv !== '') return { value: fromEnv, source: ENV_SOURCE }

    throw new NoKeyError(`no API key: ${ref} is not configured`)
  }

  /**
   * 走完整条解析链，只要值。
   * @returns 明文密钥。**调用方负责不把它写进日志或消息。**
   * @throws {NoKeyError} 整条链都没取到值。
   */
  async resolve(): Promise<string> {
    return (await this.resolveWithSource()).value
  }
}
