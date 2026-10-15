/**
 * 本插件用到的**全部图标，一处定义**。
 *
 * 为什么要有一张表：图标从前散在四处（卡片 JSX、`fields.tsx` 的 `icon={null}`、
 * 选择器的 chevron、浮层的两个按钮），同一个概念在不同文件里各写一份，
 * 改一处必漏一处 —— 而且「哪个组用哪个图标」这件事本身没有地方可查。
 *
 * 取值规则（本仓规则层定的）：
 * 1. **官方图标集里有语义对得上的就用官方的**（`@deepseek-ai/dsh-client-ui-primitives`
 *    的 `Icon*OutlineRegular`）—— 本文件只做「选哪个」，不重新画；
 * 2. 官方没有对应语义时**自绘**，且规格逐条照官方
 *    （`viewBox="0 0 16 16"`、`strokeWidth={1}`、`stroke="currentColor"`、
 *    `aria-hidden="true"`、`size` 默认 14），见 [./icons/CURRENCY_ARTWORK]。
 * 3. 笔画粗细一律用 `Regular`（1px），与配置页其余图标同档；`Medium` 是给大字号场景的。
 *
 * **尺寸**：`DisclosureRow` 的 `.leading svg` 会用自己的 CSS 覆盖 svg 的 width/height
 * （见官方 `DisclosureRow.module.css`），所以传不传 `size` 都不影响分组头；
 * 传它是为了浮层这类直接渲染的地方。
 * @module dsh-ds-balance/client/icons
 */

import type { ComponentType } from 'react'
import {
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconCloseOutlineRegular,
  IconLinkOutlineRegular,
  IconPluginPinwheelOutlineRegular,
  IconRefreshOutlineRegular,
  IconWarningOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import { CurrencyOutlineIcon } from './icons/currency.tsx'

/** 本插件用到的图标组件形状。 */
export type AppIcon = ComponentType<IconProps>

/**
 * 四个配置分组的图标。
 *
 * **连接用链条**（`IconLinkOutlineRegular`）：这一组讲的是「接通官方」，
 * 而它从前用的是 `IconApiOutlineRegular`（`</>`）—— 那个字形讲的是「写代码」，
 * 语义对不上。
 *
 * **展示用自绘货币图标**：官方图标集里**没有**货币语义的字形
 * （逐个核对过 `ui-primitives/src/icons/index.tsx` 的全部导出：无 Coin / Money /
 * Currency / Wallet / Yuan / Dollar），而这一组讲的正是「显示币种」。
 * 仪表盘（`IconGaugeOutlineRegular`）语义偏「量程」，不选。
 */
export const GROUP_ICONS = {
  connection: IconLinkOutlineRegular,
  display: CurrencyOutlineIcon,
  thresholds: IconWarningOutlineRegular,
  refresh: IconRefreshOutlineRegular,
} as const satisfies Record<string, AppIcon>

/** 分组键，与 `BalanceSettingsCard` 的分组顺序一致。 */
export type GroupIconKey = keyof typeof GROUP_ICONS

/**
 * 测试结果的成败图标。
 *
 * **用图形而不是 `✓` / `✗` 字符**：字符的基线、字重、间距都跟着字体走，
 * 与旁边那行等宽掩码并排时会歪，粗细也完全不受我们控制。
 * 用官方那一对**同族的纯字形**（对勾 / 叉）：形状本身就说清了成与败，
 * 所以不需要颜色去补（测试结果**不上色**）。取 `Regular` 档，与配置页其余图标同档。
 *
 * **这一对的选择被「声明下限」约束过**：更顺眼的 `IconCloseCircleOutlineRegular`
 * （带圆圈的叉）在宿主更新的一档里才有，**本仓声明的那一档没有**
 * （那一档只有 `IconCloseCircleFillRegular`，与对勾的 outline 不是一个画风）。
 * 引官方符号前先在声明下限那一档确认它存在 —— 这条规则就是这么生效的。
 */
export const RESULT_ICONS = {
  ok: IconCheckOutlineRegular,
  fail: IconCloseOutlineRegular,
} as const satisfies Record<string, AppIcon>

/**
 * 分组折叠头的两个箭头。
 *
 * **两个都常驻 DOM**，靠 CSS 的透明度互换（收起显下箭头、展开显上箭头）。
 * 不按 `open` 条件渲染：那样悬浮换箭头时元素会被替换，过渡会闪一下、还会让
 * `overflow: hidden` 那一行抖动。
 *
 * 为什么这一对要放在表里而不是写在 `fields.tsx` 里：本文件是「哪个图标用在哪儿」
 * 的唯一出处，`fields.tsx` 只该消费它。
 */
export const HEADER_CHEVRONS = {
  closed: IconChevronDownOutlineRegular,
  open: IconChevronUpOutlineRegular,
} as const satisfies Record<string, AppIcon>

/**
 * 选择器 pill 右端的 chevron。
 *
 * 与 `Menu` 原语配套：pill 是自绘的，所以箭头也得自己放。
 */
export const SELECTOR_ICON: AppIcon = IconChevronDownOutlineRegular

/**
 * 浮层里的图标。
 *
 * `plugins` 与宿主侧栏 Plugins 条目同字形（跨插件只走服务，但图标是平台模块，
 * 可以照引）；`refresh` 与分组头的刷新同源。
 */
export const POPOVER_ICONS = {
  plugins: IconPluginPinwheelOutlineRegular,
  refresh: IconRefreshOutlineRegular,
} as const satisfies Record<string, AppIcon>
