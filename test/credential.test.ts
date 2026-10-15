import { describe, expect, it } from 'vitest'
import { MASK_HEAD, MASK_TAIL, maskKey } from '../src/domain/credential.ts'

/**
 * 掩码的形态与边界。
 *
 * 这条断言守的是**安全边界**：完整密钥永不跨线，而掩码里出现的片段是**有意**放出去的
 * （辨识度换来的），所以两边都得钉住 —— 既不许「多露」，也不许「该露的不露」。
 */
describe('maskKey', () => {
  it('前 8 + 固定 5 星 + 后 4，与平台控制台同形', () => {
    expect(maskKey('sk-cf08d1234567890abcd3b84')).toBe('sk-cf08d*****3b84')
  })

  it('星号个数固定 5 个 —— 真实长度本身也是信息', () => {
    const short = maskKey('sk-cf08d1111aaaa')
    const long = maskKey('sk-cf08d1111' + 'x'.repeat(200) + 'aaaa')
    expect(short.slice(MASK_HEAD, -MASK_TAIL)).toBe('*****')
    expect(long.slice(MASK_HEAD, -MASK_TAIL)).toBe('*****')
  })

  it('露出的就是头 8 与尾 4，中间一律不出现', () => {
    const secret = 'sk-cf08dMIDDLEPART3b84'
    const masked = maskKey(secret)
    expect(masked.startsWith(secret.slice(0, MASK_HEAD))).toBe(true)
    expect(masked.endsWith(secret.slice(-MASK_TAIL))).toBe(true)
    expect(masked).not.toContain('MIDDLEPART')
  })

  it('空值回空串（界面据此显示「未配置」而不是一串星号）', () => {
    expect(maskKey('')).toBe('')
    expect(maskKey('   ')).toBe('')
  })

  it('**太短就整串打码**：露 8 个头等于露了全串', () => {
    expect(maskKey('sk-abc')).toBe('*****')
    // 正好等于头+尾长度时不再有中间段，也走整串打码。
    expect(maskKey('a'.repeat(MASK_HEAD + MASK_TAIL - 1))).toBe('*****')
  })

  it('刚好够长时正常露首尾', () => {
    const exact = 'a'.repeat(MASK_HEAD) + 'b'.repeat(MASK_TAIL)
    expect(maskKey(exact)).toBe('a'.repeat(MASK_HEAD) + '*****' + 'b'.repeat(MASK_TAIL))
  })

  it('两端空白先去掉（用户粘贴时带空格是常态）', () => {
    expect(maskKey('  sk-cf08d1234567890abcd3b84  ')).toBe('sk-cf08d*****3b84')
  })
})
