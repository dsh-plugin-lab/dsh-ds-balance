/**
 * 两条取数途径的**展示判定**：把后端给的状态翻成「这一行画什么」。
 *
 * **为什么单独成一个模块**：这套判定是「连接」组的心脏（哪句话、哪个色调、哪行事实），
 * 而它原先写在卡片组件里 —— 组件引 `ui-primitives`，测试环境渲不出来
 * （见 [vitest.config.ts](../../../vitest.config.ts) 的说明：CSS 解析不了），
 * 于是**这段最容易错的逻辑一行覆盖都没有**。抽成纯函数之后它可以被直接断言。
 *
 * 模块里没有 React、没有 `t` 之外的依赖，也不碰 `ctx`。
 * @module dsh-ds-balance/client/settings/source-status
 */

import type { LocaleKey } from '../locales.ts'
import type { AccountSourceInfo, KeySourceInfo } from '../data.ts'
import type { SourceStatus } from './fields.tsx'

/** 词典读取器。 */
export type Translate = (key: LocaleKey) => string

/**
 * Key 那条途径的展示状态。
 *
 * **判据只有这一处**：`configured` 来自后端（它已经问过官方 `describe()`，
 * 也在没有 seam 时退到解析链判过），本函数只决定「显示哪句话」。
 *
 * 事实行拼三段，各段都只在有值时出现：来源层 · 掩码 · 账本标识。
 * 掩码与账本标识都是**不可逆**的，露它们是有意的（辨识度），见
 * [domain/credential.ts](../../domain/credential.ts)。
 * @param key - 后端给的 Key 状态。
 * @param t - 词典读取器。
 * @returns 徽标、事实行、说明行与色调。
 */
export function keyStatusOf(key: KeySourceInfo, t: Translate): SourceStatus {
  const configured = key.configured
  // 来源层讲清这把 key 从哪来；读不到时说「未确认」而不是猜。
  const source =
    key.source === 'file'
      ? t('settings.sources.fromSaved')
      : key.source === null
        ? t('settings.sources.unknown')
        : t('settings.sources.fromEnv').replace('{name}', () => key.ref)
  return {
    tone: configured ? 'ok' : 'missing',
    badge: configured
      ? t('settings.sources.keyConfigured')
      : t('settings.sources.keyNotConfigured'),
    detail: [source, key.masked, key.tag8].filter((part) => part !== '').join(' · '),
    hint: t('settings.sources.keyHint'),
  }
}

/**
 * 账号那条途径的展示状态。
 *
 * 三档，与 Key 那条的两态**有意不同**：账号未登录时用户有下一步可做（去登录），
 * 所以那句话必须说出来，而不是只给一个「未配置」。
 *
 * 顺序要紧：**服务缺席优先于未登录** —— 前者用户做什么都没用。
 * @param account - 后端给的账号状态。
 * @param t - 词典读取器。
 * @returns 徽标、事实行、说明行与色调。
 */
export function accountStatusOf(account: AccountSourceInfo, t: Translate): SourceStatus {
  if (!account.available) {
    return {
      tone: 'missing',
      badge: t('settings.sources.accountUnavailable'),
      detail: '',
      hint: t('settings.sources.accountMissingHint'),
    }
  }
  if (!account.signedIn) {
    return {
      tone: 'missing',
      badge: t('settings.sources.accountSignedOut'),
      detail: '',
      hint: t('settings.sources.accountHint'),
    }
  }
  return {
    tone: 'ok',
    badge: t('settings.sources.accountSignedIn'),
    // 名字与脱敏联系方式；都读不到时只留徽标（不留一个空段落）。
    detail: [account.name, account.contact].filter((part) => part !== null).join(' · '),
    hint: t('settings.sources.accountHint'),
  }
}
