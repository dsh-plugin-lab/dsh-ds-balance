/**
 * 自绘的货币图标（「展示」组用）。
 *
 * **为什么自绘**：官方图标集里没有任何货币语义的字形 —— 逐个核对过
 * `@deepseek-ai/dsh-client-ui-primitives` 的全部图标导出，无 Coin / Money / Currency /
 * Wallet / Yuan / Dollar。而「展示」这一组讲的正是**显示币种**，
 * 用 `IconDataOutlineRegular`（数据）或 `IconGaugeOutlineRegular`（量程）都是在将就。
 *
 * **规格逐条照官方** `ui-primitives/src/icons/index.tsx` 的写法（红线会逐值比对）：
 * - `viewBox="0 0 16 16"`（官方统一网格）
 * - `size` 默认 **14**（官方 `Icon*Artwork` 的默认值）
 * - `strokeWidth` 走 {@link ICON_REGULAR_STROKE}（= 1）
 * - `stroke="currentColor"` + `fill="none"`（颜色随上下文）
 * - `aria-hidden="true"`（装饰性字形，语义由所在行的标题承担）
 *
 * 字形取**双横杠的 ¥**：它在中日英三种语境下都是「货币」的第一读法，
 * 比 `$` 更少歧义（`$` 还会被读成 shell 变量或正则锚点）。
 * @module dsh-ds-balance/client/icons/currency
 */

import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { ICON_REGULAR_STROKE } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 渲染货币图标。
 * @param props - 尺寸与额外类名；颜色随 `currentColor`。
 * @returns 货币字形。
 */
export function CurrencyOutlineIcon({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      strokeWidth={ICON_REGULAR_STROKE}
    >
      {/* Y 的两臂：从上方两侧收到中心，再往下走一条竖干。 */}
      <path d="M4.6 3.4 8 7.6 11.4 3.4" stroke="currentColor" />
      <path d="M8 7.6V12.6" stroke="currentColor" />
      {/* 两道横杠：货币符号的识别特征，也是与普通「Y」区分开的那一笔。 */}
      <path d="M5.6 9.1H10.4" stroke="currentColor" />
      <path d="M5.6 11H10.4" stroke="currentColor" />
    </svg>
  )
}
