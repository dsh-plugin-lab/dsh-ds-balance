import { describe, expect, it, vi } from 'vitest'
import { SourcesService } from '../src/services/sources-service.ts'
import { KeyResolver } from '../src/services/key-resolver.ts'
import type { Credentials } from '../src/ports/credentials.ts'
import type { AccountSource } from '../src/ports/account.ts'

const SALT = 'test-salt'
const KEY = 'sk-cf08d1234567890abcd3b84'

/**
 * 一个凭据替身。
 *
 * `resolve` 与 `describe` **必须一起给**：解析链的第一档就是 `resolve`，
 * 它给了值，来源层就由它回的那个 `source` 决定 —— 这正是「判据只有一份」的落点。
 */
function credentialsOf(patch: {
  configured?: boolean
  source?: string
  value?: string
  failDescribe?: boolean
}): Credentials {
  const source = patch.source ?? 'file'
  const value = patch.value ?? KEY
  return {
    resolve: vi.fn().mockResolvedValue({ value, source }),
    describe: patch.failDescribe
      ? vi.fn().mockRejectedValue(new Error('describe exploded'))
      : vi.fn().mockResolvedValue({
          configured: patch.configured ?? true,
          source,
          writable: true,
        }),
  }
}

/** 一个账号替身；默认未登录。 */
function accountOf(patch: Partial<AccountSource> = {}): AccountSource {
  return {
    signedIn: async () => false,
    accountId: async () => null,
    profile: async () => null,
    readBalance: async () => null,
    ...patch,
  }
}

/** 搭一套服务；`env` 决定环境变量那一档有没有值。 */
function harness(
  options: {
    key?: string
    env?: Record<string, string>
    credentials?: Credentials
    account?: AccountSource | undefined
  } = {},
) {
  const keys = new KeyResolver({
    readConfig: () => ({ apiKeyRef: 'DEEPSEEK_API_KEY' }),
    // 凭据替身必须同时给解析链：链的第一档就是它，来源层也由它回。
    credentials: options.credentials,
    env: options.env ?? (options.key === undefined ? {} : { DEEPSEEK_API_KEY: options.key }),
  })
  return new SourcesService({
    keys,
    credentials: options.credentials,
    account: () => options.account,
    salt: SALT,
  })
}

describe('SourcesService · Key 那条途径', () => {
  it('已配置时给掩码与账本标识，来源层取自 describe', async () => {
    const service = harness({
      key: KEY,
      credentials: credentialsOf({ configured: true, source: 'file' }),
    })
    const { key } = await service.snapshot()
    expect(key.ref).toBe('DEEPSEEK_API_KEY')
    expect(key.configured).toBe(true)
    expect(key.source).toBe('file')
    expect(key.masked).toBe('sk-cf08d*****3b84')
    expect(key.tag8).toHaveLength(8)
  })

  it('**掩码里不出现完整密钥**（这条是安全边界）', async () => {
    const service = harness({
      key: KEY,
      credentials: credentialsOf({ configured: true, source: 'file' }),
    })
    const { key } = await service.snapshot()
    expect(key.masked).not.toBe(KEY)
    expect(JSON.stringify(key)).not.toContain('1234567890abcd')
  })

  it('没有凭据时 configured 为假、掩码为空串，且**不抛错**', async () => {
    const credentials = credentialsOf({ configured: false, value: '' })
    const service = harness({ env: {}, credentials })
    const { key } = await service.snapshot()
    expect(key.configured).toBe(false)
    expect(key.masked).toBe('')
    expect(key.tag8).toBe('')
  })

  it('凭据端口缺席时退到环境变量那一档判', async () => {
    const service = harness({ key: KEY })
    const { key } = await service.snapshot()
    expect(key.configured).toBe(true)
    expect(key.source).toBe('env')
  })

  it('describe 抛错也只是一份保守状态，不把卡片打挂', async () => {
    // `resolve` 仍拿得到值 → 来源层由它给（解析链是主判据，describe 是补判据）。
    const service = harness({ key: KEY, credentials: credentialsOf({ failDescribe: true }) })
    const { key } = await service.snapshot()
    expect(key.configured).toBe(true)
    expect(key.source).toBe('file')
  })

  it('解析链取不到值、但 describe 说配过 → 仍报已配置（补判据生效）', async () => {
    const credentials = credentialsOf({ configured: true, value: '' })
    const service = harness({ env: {}, credentials })
    const { key } = await service.snapshot()
    expect(key.configured).toBe(true)
    expect(key.source).toBe('file')
    // 没有明文就没有掩码与账本标识 —— 不编一个出来。
    expect(key.masked).toBe('')
    expect(key.tag8).toBe('')
  })
})

describe('SourcesService · 账号那条途径', () => {
  it('宿主没装账号接缝时 available 为假（界面显示「不可用」而不是让它消失）', async () => {
    const service = harness({ key: KEY, account: undefined })
    const { account } = await service.snapshot()
    expect(account.available).toBe(false)
    expect(account.signedIn).toBe(false)
  })

  it('未登录时**不问身份**（省掉一次注定失败的 Platform 调用）', async () => {
    const profile = vi.fn()
    const service = harness({
      key: KEY,
      account: accountOf({ signedIn: async () => false, profile }),
    })
    const { account } = await service.snapshot()
    expect(account.available).toBe(true)
    expect(account.signedIn).toBe(false)
    expect(profile).not.toHaveBeenCalled()
  })

  it('已登录时带出名字、头像与脱敏联系方式', async () => {
    const service = harness({
      key: KEY,
      account: accountOf({
        signedIn: async () => true,
        profile: async () => ({
          name: '张三',
          avatarUrl: 'https://example.test/a.png',
          contact: '138****5678',
        }),
      }),
    })
    const { account } = await service.snapshot()
    expect(account.signedIn).toBe(true)
    expect(account.name).toBe('张三')
    expect(account.avatarUrl).toBe('https://example.test/a.png')
    expect(account.contact).toBe('138****5678')
  })

  it('身份读不到时仍报「已登录」，只是没有名字与头像', async () => {
    const service = harness({
      key: KEY,
      account: accountOf({ signedIn: async () => true, profile: async () => null }),
    })
    const { account } = await service.snapshot()
    expect(account.signedIn).toBe(true)
    expect(account.name).toBeNull()
    expect(account.avatarUrl).toBeNull()
  })

  it('signedIn 抛错时当未登录，不把整个端点打挂', async () => {
    const service = harness({
      key: KEY,
      account: accountOf({
        signedIn: async () => {
          throw new Error('boom')
        },
      }),
    })
    const { account } = await service.snapshot()
    expect(account.signedIn).toBe(false)
  })
})

describe('SourcesService · 缓存与世代', () => {
  it('snapshot 命中缓存：第二次不再解析（省掉一次凭据读取）', async () => {
    const credentials = credentialsOf({})
    const service = harness({ key: KEY, credentials })
    await service.snapshot()
    await service.snapshot()
    expect(credentials.resolve).toHaveBeenCalledTimes(1)
  })

  it('refresh 强制重读', async () => {
    const credentials = credentialsOf({})
    const service = harness({ key: KEY, credentials })
    await service.snapshot()
    await service.refresh()
    expect(credentials.resolve).toHaveBeenCalledTimes(2)
  })

  it('invalidate 之后下一次读到新世代，且缓存被丢掉', async () => {
    const credentials = credentialsOf({})
    const service = harness({ key: KEY, credentials })
    const first = await service.snapshot()
    const generation = service.invalidate()
    const second = await service.snapshot()
    expect(generation).toBe(first.revision + 1)
    expect(second.revision).toBe(first.revision + 1)
    // 缓存作废 → 又解析了一次。
    expect(credentials.resolve).toHaveBeenCalledTimes(2)
  })

  it('keyRef 现读引用名，供订阅方判「这条事件与不与我有关」', () => {
    const service = harness({ key: KEY })
    expect(service.keyRef()).toBe('DEEPSEEK_API_KEY')
  })
})
