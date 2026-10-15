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
 * 也在没有 seam 时退到解析链判过），本函数只决定「显示什么」。
 *
 * 右槽给**凭据身份**（首尾片段掩码，与平台控制台同形、不可逆）；
 * 第二行给**来历**（这把凭据从哪一层取到的）。
 * 没有凭据时两个都留空 —— 左边的红灯已经说了「这条途径现在没在用」，
 * 再补一句「未配置」只是把同一个事实说两遍，还把行撑高。
 * @param key - 后端给的 Key 状态。
 * @param t - 词典读取器。
 * @returns 灯色、右槽身份与第二行来历。
 */
export function keyStatusOf(key: KeySourceInfo, t: Translate): SourceStatus {
  if (!key.configured) return { tone: 'missing', identity: '', detail: '' }
  return {
    tone: 'ok',
    identity: key.masked,
    detail: sourceLabelOf(key, t),
  }
}

/**
 * 「这把凭据从哪来」那句话。
 *
 * 三档，且**只有这三档**：官方凭据库存的那份、环境变量、或者读不到来源层时的「未确认」。
 * 官方 `describe()` 自己也会回 `env`（它内部同样读环境变量），所以「非 file 即环境变量」
 * 在这条链上是准确的，不是猜的。
 * @param key - 后端给的 Key 状态。
 * @param t - 词典读取器。
 * @returns 一句话；第二行为空串时不渲染。
 */
function sourceLabelOf(key: KeySourceInfo, t: Translate): string {
  if (key.source === 'file') return t('settings.sources.sourceSaved')
  if (key.source === null) return t('settings.sources.sourceUnknown')
  return t('settings.sources.sourceEnv').replace('{name}', () => key.ref)
}

/**
 * 账号那条途径的展示状态。
 *
 * **三档，与 Key 那条有意不对称**：账号未登录是**正常状态**（很多人只用 API Key），
 * 所以它和「没配 key」一样只留一盏红灯、右槽与第二行都留空；
 * 但**「本部署没有账号服务」必须说出来** —— 那一行整空会读成「这插件坏了」，
 * 而它其实是部署事实，用户做什么都没用。
 * @param account - 后端给的账号状态。
 * @param t - 词典读取器。
 * @returns 灯色、右槽身份（账号名）与第二行（脱敏联系方式）。
 */
export function accountStatusOf(account: AccountSourceInfo, t: Translate): SourceStatus {
  if (!account.available) {
    return { tone: 'missing', identity: '', detail: t('settings.sources.accountNoService') }
  }
  if (!account.signedIn) return { tone: 'missing', identity: '', detail: '' }
  return {
    tone: 'ok',
    identity: account.name ?? '',
    detail: account.contact ?? '',
  }
}
