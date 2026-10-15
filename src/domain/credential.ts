/**
 * 凭据的**展示形态**：把明文密钥折成首尾片段掩码。
 *
 * **完整密钥永不跨这条线**：调用方解析出明文、当场折成掩码、立刻丢掉明文。
 * 这是 [http/AGENTS.md](../http/AGENTS.md) 那条红线的落点 —— 放宽到「只回首尾掩码」，
 * 而不是「回固定长度的星号」。
 *
 * 形态与 DeepSeek 平台控制台 `platform.deepseek.com/api_keys` 一致：
 * `sk-cf08d*****3b84`。选它的理由是**辨识度**：用户要能一眼看出「我现在用的是哪一把
 * key」——固定长度的 `********` 回答不了这个问题，而「换 key 之后余额不对」正是这个
 * 插件最容易遇到的困惑。
 *
 * **星号个数是固定的 5 个**：真实长度不进掩码，否则等于把密钥长度也送出去。
 * @module dsh-ds-balance/domain/credential
 */

/** 掩码里保留的头部长字符数。`sk-cf08d` 正好是 8 个字符，与平台控制台同形。 */
export const MASK_HEAD = 8

/** 掩码里保留的尾部字符数。 */
export const MASK_TAIL = 4

/** 中间固定的星号个数。**不随密钥长度变化** —— 长度本身也是信息。 */
export const MASK_STARS = '*****'

/** 能安全露首尾的最短长度：头 + 尾。再短就只能整串打码。 */
const MASK_MIN_LENGTH = MASK_HEAD + MASK_TAIL

/**
 * 把明文密钥折成首尾片段掩码。
 *
 * 长度不足以同时露首尾时**整串打码**：`sk-abc` 这种短值露 8 个头就等于露了全串。
 * 空值回空串 —— 调用方据此显示「未配置」而不是显示一串星号。
 * @param value - 明文密钥；调用方负责在此之后不再使用它。
 * @returns `sk-cf08d*****3b84` 形态的掩码，或空串。
 */
export function maskKey(value: string): string {
  const text = value.trim()
  if (text === '') return ''
  if (text.length < MASK_MIN_LENGTH) return MASK_STARS
  return text.slice(0, MASK_HEAD) + MASK_STARS + text.slice(-MASK_TAIL)
}

/**
 * 生效值的来源层是否算「已保存的凭据」。
 *
 * 判据只有一处（这里），界面与后端都用它 —— 来源层的取值来自官方
 * `credentialProvider.describe()` 的 `source`，本仓见
 * [ports/credentials.ts](../ports/credentials.ts)。
 * @param source - `describe()` 给的来源层；未知或读不到时传 `null`。
 * @returns 是否来自凭据存储（`.credentials.yaml`）。
 */
export function isSavedSource(source: string | null): boolean {
  return source === 'file'
}
