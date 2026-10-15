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
 *
 * **本轮真正守的是三条设计约束**（维护者 2026-10-15 定的）：
 * ① 一个事实不说两遍 —— 状态由灯表达，文字只报灯报不了的东西（身份、来历）；
 * ② 没有身份可报时右槽留空，**不补一句「未配置」**；
 * ③ 「本部署没有账号服务」是例外，**必须说出来**（整空会被读成插件坏了）。
 */

/** 词典读取器：直接读真词典。 */
const t = (key: keyof typeof zh): string => zh[key]

/** 造一份 Key 状态；只覆写关心的字段。 */
function key(patch: Partial<KeySourceInfo> = {}): KeySourceInfo {
  return {
    ref: 'DEEPSEEK_API_KEY',
    configured: true,
    source: 'file',
    masked: 'sk-c08d*****3b84',
    tag8: '3f9a2c71',
    ...patch,
  }
}

/** 造一份账号状态；只覆写关心的字段。 */
function account(patch: Partial<AccountSourceInfo> = {}): AccountSourceInfo {
  return { available: true, signedIn: false, name: null, avatarUrl: null, contact: null, ...patch }
}

describe('keyStatusOf', () => {
  it('已配置：绿灯 + 右槽给掩码 + 第二行给来历', () => {
    const status = keyStatusOf(key(), t)
    expect(status.tone).toBe('ok')
    expect(status.identity).toBe('sk-c08d*****3b84')
    expect(status.detail).toBe('取自官方模型页保存的凭据')
  })

  it('**未配置：右槽与第二行都留空** —— 不在灯之外再把状态说一遍', () => {
    const status = keyStatusOf(key({ configured: false, masked: '', tag8: '' }), t)
    expect(status.tone).toBe('missing')
    // 这一条是本轮的设计约束②：从前这里有「未配置密钥。」徽章 + 说明行，三处说同一件事。
    expect(status.identity).toBe('')
    expect(status.detail).toBe('')
  })

  it('来历三档各有各的说法：file / env / 未知', () => {
    expect(keyStatusOf(key({ source: 'file' }), t).detail).toBe('取自官方模型页保存的凭据')
    // 环境变量那档把变量名印出来 —— 用户最需要的一条信息（「我配的那个变量到底生效了没」）。
    expect(keyStatusOf(key({ source: 'env' }), t).detail).toBe('取自启动环境变量 DEEPSEEK_API_KEY')
    expect(keyStatusOf(key({ source: null }), t).detail).toBe('来源未确认')
  })

  it('**来源层不说谎**：认不出的来源按环境变量报，不声称「已保存的凭据」', () => {
    // 官方 describe() 自己也会回 env（它内部同样读环境变量），所以这是准确的一档。
    expect(keyStatusOf(key({ source: 'keyring' }), t).detail).toContain('环境变量')
  })

  it('**没有明文时不给掩码**（不编一个出来）', () => {
    // configured 为真但掩码为空是可能的：解析链没取到明文、而 describe 说配过。
    const status = keyStatusOf(key({ masked: '' }), t)
    expect(status.tone).toBe('ok')
    expect(status.identity).toBe('')
    // 但来历仍要说 —— 那是另一件事，不算重复。
    expect(status.detail).not.toBe('')
  })

  it('掩码只出现在右槽，**第二行不重复它**', () => {
    const status = keyStatusOf(key(), t)
    expect(status.detail).not.toContain('*')
  })
})

describe('accountStatusOf', () => {
  it('宿主没装账号接缝：**第二行把部署事实说出来**（整行空会被读成坏了）', () => {
    const status = accountStatusOf(account({ available: false }), t)
    expect(status.tone).toBe('missing')
    expect(status.identity).toBe('')
    expect(status.detail).toBe('本部署没有账号服务，这条途径不可用。')
  })

  it('未登录：红灯，右槽与第二行**都留空**（那是正常状态，不是错误）', () => {
    const status = accountStatusOf(account({ signedIn: false }), t)
    expect(status.tone).toBe('missing')
    expect(status.identity).toBe('')
    expect(status.detail).toBe('')
  })

  it('已登录：绿灯 + 右槽给账号名 + 第二行给脱敏联系方式', () => {
    const status = accountStatusOf(
      account({ signedIn: true, name: '张三', contact: '138****5678' }),
      t,
    )
    expect(status.tone).toBe('ok')
    expect(status.identity).toBe('张三')
    expect(status.detail).toBe('138****5678')
  })

  it('已登录但名字读不到：右槽留空，**不编一个名字**', () => {
    const status = accountStatusOf(account({ signedIn: true }), t)
    expect(status.tone).toBe('ok')
    expect(status.identity).toBe('')
    expect(status.detail).toBe('')
  })

  it('**服务缺席优先于未登录**：两者都为假时报部署事实', () => {
    // 顺序要紧 —— 报「未登录」会让用户去登录，而那个服务根本不存在。
    const status = accountStatusOf(account({ available: false, signedIn: false }), t)
    expect(status.tone).toBe('missing')
    expect(status.detail).toBe('本部署没有账号服务，这条途径不可用。')
  })

  it('有名字没有联系方式时第二行留空，不留半截分隔符', () => {
    const status = accountStatusOf(account({ signedIn: true, name: '张三' }), t)
    expect(status.identity).toBe('张三')
    expect(status.detail).toBe('')
  })
})
