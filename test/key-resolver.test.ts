import { describe, expect, it, vi } from 'vitest'
import { CREDENTIAL_REF_PATTERN, KeyResolver } from '../src/services/key-resolver.ts'
import { NoKeyError } from '../src/domain/errors.ts'
import type { Credentials } from '../src/ports/credentials.ts'

const base = { apiKeyRef: 'DEEPSEEK_API_KEY' }

describe('解析链优先级', () => {
  it('**第一档就是凭据服务**（配置覆盖那档已随 apiKey 字段删除）', async () => {
    const credentials: Credentials = {
      resolve: vi.fn().mockResolvedValue({ value: 'sk-from-store', source: 'file' }),
      describe: vi.fn(),
    }
    const resolver = new KeyResolver({
      readConfig: () => base,
      credentials,
      env: { DEEPSEEK_API_KEY: 'sk-env' },
    })
    await expect(resolver.resolve()).resolves.toBe('sk-from-store')
    expect(credentials.resolve).toHaveBeenCalledTimes(1)
  })

  it('凭据空值继续走环境变量', async () => {
    const credentials: Credentials = {
      resolve: vi.fn().mockResolvedValue({ value: '   ', source: 'env' }),
      describe: vi.fn(),
    }
    const resolver = new KeyResolver({
      readConfig: () => base,
      credentials,
      env: { DEEPSEEK_API_KEY: 'sk-env' },
    })
    await expect(resolver.resolve()).resolves.toBe('sk-env')
  })

  it('凭据抛错时吞掉并回落环境变量', async () => {
    const credentials: Credentials = {
      resolve: vi.fn().mockRejectedValue(new Error('no credentials seam')),
      describe: vi.fn(),
    }
    const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const resolver = new KeyResolver({
      readConfig: () => base,
      credentials,
      env: { DEEPSEEK_API_KEY: 'sk-env' },
      logger,
    })
    await expect(resolver.resolve()).resolves.toBe('sk-env')
    expect(logger.debug).toHaveBeenCalledTimes(1)
  })

  it('完全没有 credentials 服务时不报错，直接走环境变量', async () => {
    const resolver = new KeyResolver({
      readConfig: () => base,
      env: { DEEPSEEK_API_KEY: 'sk-env' },
    })
    await expect(resolver.resolve()).resolves.toBe('sk-env')
  })
})

describe('失败路径', () => {
  it('整条链都没取到时抛 NoKeyError', async () => {
    const resolver = new KeyResolver({ readConfig: () => base, env: {} })
    await expect(resolver.resolve()).rejects.toBeInstanceOf(NoKeyError)
  })

  it('引用名是空串时抛 NoKeyError（不再有「两端都空」这一说）', async () => {
    const resolver = new KeyResolver({
      readConfig: () => ({ apiKeyRef: '  ' }),
      env: {},
    })
    await expect(resolver.resolve()).rejects.toBeInstanceOf(NoKeyError)
  })

  it('引用名非法直接抛错，不去查凭据', async () => {
    const credentials: Credentials = { resolve: vi.fn(), describe: vi.fn() }
    const resolver = new KeyResolver({
      readConfig: () => ({ apiKeyRef: 'deepseek-api-key' }),
      credentials,
      env: { 'deepseek-api-key': 'sk-x' },
    })
    await expect(resolver.resolve()).rejects.toBeInstanceOf(NoKeyError)
    expect(credentials.resolve).not.toHaveBeenCalled()
  })

  it('引用名正则是契约里那一条', () => {
    expect(CREDENTIAL_REF_PATTERN.test('DEEPSEEK_API_KEY')).toBe(true)
    expect(CREDENTIAL_REF_PATTERN.test('deepseek-api-key')).toBe(false)
    expect(CREDENTIAL_REF_PATTERN.test('1BAD')).toBe(false)
  })
})

describe('每次调用现读配置', () => {
  it('引用名改了立刻生效，不需要重建 resolver', async () => {
    let current = { apiKeyRef: 'FIRST_KEY' }
    const resolver = new KeyResolver({
      readConfig: () => current,
      env: { FIRST_KEY: 'sk-first', SECOND_KEY: 'sk-second' },
    })
    await expect(resolver.resolve()).resolves.toBe('sk-first')
    current = { apiKeyRef: 'SECOND_KEY' }
    await expect(resolver.resolve()).resolves.toBe('sk-second')
  })

  it('describeRef 现读引用名（展示路径也走它，免得另读一份配置）', () => {
    const resolver = new KeyResolver({ readConfig: () => ({ apiKeyRef: '  MY_KEY  ' }), env: {} })
    expect(resolver.describeRef()).toBe('MY_KEY')
  })
})
