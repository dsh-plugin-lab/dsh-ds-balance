import { describe, expect, it } from 'vitest'
import { accountStatusOf, keyStatusOf } from '../src/client/settings/source-status.ts'
import { zh } from '../src/client/locales.ts'
import type { AccountSourceInfo, KeySourceInfo } from '../src/client/data.ts'

/**
 * 「连接」组两行的**展示判定**。
 *
 * 这套判定原先写在卡片组件里，而组件引 `ui-primitives` —— 测试环境渲不出来
 * （见 [vitest.config.ts](../vitest.config.ts)：CSS 解析不了），所以那一段最容易错的逻辑
 * 一行覆盖都没有。抽成纯函数之后就能直接断言了。
 *
 * 用真词典（`zh`）而不是替身：这几句话是**用户唯一能看到的解释**，措辞漂了这里就该红。
 */

/** 词典读取器：直接读真词典。 */
const t = (key: keyof typeof zh): string => zh[key]

/** 造一份 Key 状态；只覆写关心的字段。 */
function key(patch: Partial<KeySourceInfo> = {}): KeySourceInfo {
  return {
    ref: 'DEEPSEEK_API_KEY',
    configured: true,
    source: 'file',
    masked: 'sk-cf08d*****3b84',
    tag8: '3f9a2c71',
    ...patch,
  }
}

/** 造一份账号状态；只覆写关心的字段。 */
function account(patch: Partial<AccountSourceInfo> = {}): AccountSourceInfo {
  return { available: true, signedIn: false, name: null, avatarUrl: null, contact: null, ...patch }
}

describe('keyStatusOf', () => {
  it('已配置：绿档 + 「已配置密钥。」+ 来源层与掩码', () => {
    const status = keyStatusOf(key(), t)
    expect(status.tone).toBe('ok')
    expect(status.badge).toBe('已配置密钥。')
    expect(status.detail).toContain('已保存的凭据')
    expect(status.detail).toContain('sk-cf08d*****3b84')
    expect(status.detail).toContain('3f9a2c71')
  })

  it('未配置：红档 + 「未配置密钥。」', () => {
    const status = keyStatusOf(key({ configured: false, masked: '', tag8: '' }), t)
    expect(status.tone).toBe('missing')
    expect(status.badge).toBe('未配置密钥。')
  })

  it('来源层三档各有各的说法：file / env / 未知', () => {
    expect(keyStatusOf(key({ source: 'file' }), t).detail).toContain('已保存的凭据')
    // 环境变量那档把变量名印出来 —— 这是用户最需要的一条信息。
    expect(keyStatusOf(key({ source: 'env' }), t).detail).toContain('环境变量 DEEPSEEK_API_KEY')
    expect(keyStatusOf(key({ source: null }), t).detail).toContain('状态未确认')
  })

  it('**事实行不留空段**：掩码与账本标识缺席时不留下多余的分隔符', () => {
    const status = keyStatusOf(key({ masked: '', tag8: '' }), t)
    expect(status.detail).toBe('已保存的凭据')
    expect(status.detail).not.toContain('·')
  })

  it('**没有明文时不给掩码**（不编一个出来）', () => {
    const status = keyStatusOf(key({ configured: false, masked: '', tag8: '' }), t)
    expect(status.detail).not.toContain('*')
  })

  it('说明行只讲这条途径是什么，不重复徽标', () => {
    const status = keyStatusOf(key(), t)
    expect(status.hint).not.toContain('已配置')
    expect(status.hint).not.toContain('未配置')
  })
})

describe('accountStatusOf', () => {
  it('宿主没装账号接缝：报「不可用」而不是让它消失', () => {
    const status = accountStatusOf(account({ available: false }), t)
    expect(status.tone).toBe('missing')
    expect(status.badge).toBe('账号资料暂不可用')
    expect(status.detail).toBe('')
    // 说明行要讲清是**部署**没有这个服务，用户做什么都没用。
    expect(status.hint).toContain('没有账号服务')
  })

  it('未登录：说得出下一步（不是只给一个「未配置」）', () => {
    const status = accountStatusOf(account({ signedIn: false }), t)
    expect(status.tone).toBe('missing')
    expect(status.badge).toBe('尚未登录')
    expect(status.hint).toBe('跟随宿主已登录的 DeepSeek 账号。')
  })

  it('已登录：绿档 + 名字与脱敏联系方式', () => {
    const status = accountStatusOf(
      account({ signedIn: true, name: '张三', contact: '138****5678' }),
      t,
    )
    expect(status.tone).toBe('ok')
    expect(status.badge).toBe('已登录 DeepSeek')
    expect(status.detail).toBe('张三 · 138****5678')
  })

  it('已登录但资料读不到：仍报已登录，只是没有补充行', () => {
    const status = accountStatusOf(account({ signedIn: true }), t)
    expect(status.tone).toBe('ok')
    expect(status.badge).toBe('已登录 DeepSeek')
    expect(status.detail).toBe('')
  })

  it('**服务缺席优先于未登录**：两者都为假时报「不可用」', () => {
    // 顺序要紧 —— 报「尚未登录」会让用户去登录，而那个服务根本不存在。
    const status = accountStatusOf(account({ available: false, signedIn: false }), t)
    expect(status.badge).toBe('账号资料暂不可用')
  })

  it('有名字没有联系方式时不留分隔符', () => {
    const status = accountStatusOf(account({ signedIn: true, name: '张三' }), t)
    expect(status.detail).toBe('张三')
  })
})
