/**
 * 手写字段控件：一行一个字段，控件只报告用户输入，写入统一由卡片的保存完成。
 * 结构对齐官方 ui-settings-plugins/fields.tsx，取值全部走 --dsw-alias-* 语义令牌。
 * @module dsh-ds-balance/client/settings/fields
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button, Input, Menu, StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { HEADER_CHEVRONS, RESULT_ICONS, SELECTOR_ICON } from '../icons.ts'
import css from './fields.module.css'

/** 一个配置分组的属性。展开状态由调用方持有。 */
export interface FieldGroupProps {
  /** 折叠头左侧的图标。**常态一直显示**，只在悬浮（或键盘聚焦）时让位给箭头。 */
  icon: ReactNode
  /** 折叠头标题，收起态也显示。 */
  title: string
  /** 展开体开头的组级说明。 */
  note?: ReactNode
  open: boolean
  onToggle: () => void
  /** 卡片里的最后一组：由它自己补上尾部 12px，卡片 body 不再单独贡献尾距。 */
  last?: boolean
  children: ReactNode
}

/**
 * 一个可折叠的配置分组。
 *
 * **折叠头是自绘的，不是原语 `DisclosureRow`** —— 这一条与本仓规则层原先的写法相反，
 * 所以理由写在这里：原语在**展开**时无条件把图标换成上箭头（`DisclosureRow.tsx` 里是
 * `const leading = open ? <IconChevronUpOutlineRegular/> : collapsedLeading`），
 * 而它那个 `previewChevron` 只作用于**收起**那一支。于是「常态显示组图标、悬浮才换箭头」
 * 在展开态**无法表达**，而组图标正是「这是哪一组」唯一的视觉线索（收起态有、展开态没有，
 * 反而是最需要它的时候丢了）。
 *
 * 取值逐条照抄官方那份 CSS（24px 行高、16px 图标框、6px 间距、13px 标题、
 * tertiary → secondary、100ms 过渡，见 [fields.module.css](fields.module.css) 的注释），
 * 并由 [test/redlines.test.ts](../../../test/redlines.test.ts) 与官方文件**逐值比对**防漂。
 * 无障碍面照原语保留：`role="button"` + `tabIndex` + `aria-expanded` + Enter/Space。
 * @param props - 图标、标题、可选说明、受控展开状态与字段。
 * @returns 分组元素。
 */
export function FieldGroup(props: FieldGroupProps) {
  return (
    <div
      className={clsx(css.group, props.last === true && css.groupLast)}
      data-open={props.open || undefined}
    >
      <div
        className={css.groupHead}
        data-disclosure-row
        role="button"
        tabIndex={0}
        aria-expanded={props.open}
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          props.onToggle()
        }}
      >
        <span className={css.groupLeading}>
          <span className={css.groupIcon}>{props.icon}</span>
          {/* 两个箭头都在 DOM 里，靠 CSS 的透明度换 —— 这样悬浮态不会换元素、不会抖。 */}
          <HEADER_CHEVRONS.closed className={css.groupChevronClosed} />
          <HEADER_CHEVRONS.open className={css.groupChevronOpen} />
        </span>
        <span className={css.groupTitle}>{props.title}</span>
      </div>
      {props.open ? (
        <>
          {props.note === undefined ? null : <p className={css.groupNote}>{props.note}</p>}
          <div className={css.fields}>{props.children}</div>
        </>
      ) : null}
    </div>
  )
}

/** 标签行右侧的状态胶囊：文案与色调都由调用方决定。 */
export interface FieldStatus {
  readonly label: string
  readonly tone: TagTone
}

/** 标签行右侧的徽标区：状态胶囊、未保存标记与撤销入口。 */
export interface FieldBadgesProps {
  /** 常驻状态胶囊；为 null 或省略时不渲染。 */
  status?: FieldStatus | null
  /** 存在未保存的草稿。 */
  pending: boolean
  /** 存在可撤销的东西：草稿或已存的用户覆盖。 */
  resettable: boolean
  /** 「未保存」文案。 */
  pendingLabel: string
  /** 撤销入口文案。 */
  resetLabel: string
  disabled: boolean
  /** 暂存一次清除。 */
  onReset: () => void
}

/**
 * 渲染字段的徽标区。三者都不存在时不渲染任何东西。
 * 状态胶囊排在最前，因为它描述的是当前生效值，而后面两个描述的是待保存的改动。
 * @param props - 状态胶囊、两种改动状态与撤销回调。
 * @returns 徽标区元素或 null。
 */
export function FieldBadges(props: FieldBadgesProps) {
  const status = props.status ?? null
  if (status === null && !props.pending && !props.resettable) return null
  return (
    <span className={css.badges}>
      {status === null ? null : <Tag tone={status.tone}>{status.label}</Tag>}
      {props.pending ? <Tag tone="neutral">{props.pendingLabel}</Tag> : null}
      {props.resettable ? (
        <button
          type="button"
          className={css.reset}
          disabled={props.disabled}
          onClick={props.onReset}
        >
          {props.resetLabel}
        </button>
      ) : null}
    </span>
  )
}

/** 字段容器：标签行、控件、提示行。 */
export interface FieldFrameProps extends FieldBadgesProps {
  /** 关联 label 与控件的稳定 id。 */
  id: string
  /** 可见标签。 */
  label: string
  /** 是否为非法草稿；为真时提示行换成 invalidNote。 */
  invalid: boolean
  /** 常驻说明；省略或为空串时不渲染提示行。 */
  hint?: ReactNode
  /** 非法时替换说明的文案；省略时沿用 hint。 */
  invalidNote?: ReactNode
  /** 控件本体。 */
  children: ReactNode
}

/**
 * 渲染一个字段行。
 * @param props - 字段文案、状态与控件。
 * @returns 字段行元素。
 */
export function FieldFrame(props: FieldFrameProps) {
  const note = props.invalid ? (props.invalidNote ?? props.hint) : props.hint
  const hasNote = note !== undefined && note !== null && note !== ''
  return (
    <div className={css.field}>
      <div className={css.head}>
        <label className={css.label} htmlFor={props.id}>
          {props.label}
        </label>
        <FieldBadges
          status={props.status ?? null}
          pending={props.pending}
          resettable={props.resettable}
          pendingLabel={props.pendingLabel}
          resetLabel={props.resetLabel}
          disabled={props.disabled}
          onReset={props.onReset}
        />
      </div>
      {props.children}
      {hasNote ? <p className={props.invalid ? css.invalid : css.hint}>{note}</p> : null}
    </div>
  )
}

/** 文本 / 数字输入。numeric 只提示数字键盘，不改变接受范围。 */
export interface TextControlProps {
  id: string
  text: string
  /** 用 inputMode 的 numeric 值提示键盘；控件始终是 type 为 text。 */
  numeric: boolean
  invalid: boolean
  disabled: boolean
  /** 失焦回调；阈值字段用它触发成对校验。 */
  onBlur?: () => void
  onEdit: (text: string) => void
}

/**
 * 渲染单行文本框。
 * @param props - 草稿文本与编辑回调。
 * @returns 输入框元素。
 */
export function TextControl(props: TextControlProps) {
  return (
    <Input
      id={props.id}
      // 非法描边走 wrapper span：官方 Input 把 className 落在外壳上，内框样式归官方自管。
      className={props.invalid ? css.inputInvalid : undefined}
      type="text"
      {...(props.numeric ? { inputMode: 'numeric' as const } : {})}
      {...(props.invalid ? { 'aria-invalid': true } : {})}
      value={props.text}
      disabled={props.disabled}
      onBlur={props.onBlur}
      onChange={(event) => {
        props.onEdit(event.target.value)
      }}
    />
  )
}

/**
 * 一条取数途径的状态。
 *
 * **只有三样东西**，因为它们各自回答一个不同的问题，彼此不重复（这是本轮的设计约束）：
 * - `tone` → 左边那盏灯：**这条途径现在能不能用**（绿 / 红）；
 * - `identity` → 行右槽：**是哪一份凭据**（掩码 key / 账号名），没有就留空；
 * - `detail` → 第二行：**它是从哪来的**（凭据取自哪一层 / 脱敏联系方式），没有就不渲染这一行。
 */
export interface SourceStatus {
  /** 左侧状态灯：`ok` 绿、`missing` 红。 */
  readonly tone: 'ok' | 'missing'
  /** 右槽的凭据身份；空串表示这个槽留空（没有身份可报，灯已经说了状态）。 */
  readonly identity: string
  /** 第二行的来历；空串表示整个不渲染这一行。 */
  readonly detail: string
}

/**
 * 右槽的**临时**内容：正在测、或刚测完。
 *
 * 它出现在**凭据身份左侧**，几秒后自己消失 —— 身份**从头到尾都在**，
 * 不会被它顶掉。替换身份会让那一格闪一下，那正是要避免的突兀。
 * 因为与身份同处一行、都不换行，出现与消失也**不改变行高**。
 */
export type SourceLive =
  | { readonly kind: 'busy' }
  | { readonly kind: 'result'; readonly ok: boolean; readonly text: string }

/** 一条取数途径的状态行。 */
export interface SourceRowProps {
  /** 途径名（「API Key」/「账号登录」）。 */
  label: string
  status: SourceStatus
  /** 行首的灯或头像；省略时按 `status.tone` 画灯。 */
  leading?: ReactNode
  /** 右槽的临时内容；为 null 时显示 `status.identity`。 */
  live?: SourceLive | null
  /** 右槽是否用等宽字体（掩码 key 是标识符，账号名不是）。 */
  monoIdentity?: boolean
}

/**
 * 渲染一条取数途径的状态行。
 *
 * **这是只读展示，不是表单字段**：它不接 `form`，也没有草稿与撤销。
 * 行首是一盏灯（或账号那行的头像），行名后面**紧跟**凭据身份，第二行才写来历。
 * 灯 8×8 逐值抄官方 `ui-settings-models` 的 `.credentialDot`。
 *
 * **右槽是「临时内容 + 凭据身份」，不是「临时内容或身份」**：身份常驻，
 * 测试的转圈与结果排在它**左边**，几秒后自行消失。替换身份会让那一格闪一下。
 * 整槽**永远不换行**（`nowrap` + 省略号）：结果长短不一，一旦换行，行高就会在
 * 按下去的一瞬间跳一下。
 * @param props - 名称、状态、临时内容与可选的行首元素。
 * @returns 状态行元素。
 */
export function SourceRow(props: SourceRowProps) {
  const live = props.live ?? null
  const identity =
    props.status.identity === '' ? null : (
      <span
        className={clsx(css.sourceIdentity, props.monoIdentity === true && css.sourceIdentityMono)}
        title={props.status.identity}
      >
        {props.status.identity}
      </span>
    )
  return (
    <div className={css.source}>
      <div className={css.sourceHead}>
        {props.leading === undefined ? (
          <span
            className={clsx(css.dot, props.status.tone === 'ok' ? css.dotOk : css.dotMissing)}
            aria-hidden="true"
          />
        ) : (
          props.leading
        )}
        <span className={css.sourceName}>{props.label}</span>
        <span className={css.sourceSlot}>
          {live === null ? null : (
            // 成功只是通报（polite）；失败要用户处理（assertive）。**不上色**，成败靠图标形状。
            <span
              className={css.sourceLive}
              role={live.kind === 'busy' ? undefined : live.ok ? 'status' : 'alert'}
            >
              {live.kind === 'busy' ? (
                // 官方原语的转圈：`ongoing` 是它唯一带运动的档。
                <StateDot state="ongoing" size={14} />
              ) : (
                <>
                  {live.ok ? (
                    <RESULT_ICONS.ok className={css.sourceLiveIcon} />
                  ) : (
                    <RESULT_ICONS.fail className={css.sourceLiveIcon} />
                  )}
                  <span className={css.sourceLiveText} title={live.text}>
                    {live.text}
                  </span>
                </>
              )}
            </span>
          )}
          {identity}
        </span>
      </div>
      {props.status.detail === '' ? null : (
        <p className={css.sourceDetail}>{props.status.detail}</p>
      )}
    </div>
  )
}

/** 选择器的一个选项。 */
export interface SelectorOption {
  readonly id: string
  readonly label: string
}

/** 整行选择器：自绘 pill 触发按钮 + 原语 Menu 弹层。 */
export interface SelectorControlProps {
  /** 触发按钮的 id，供行容器或测试锚点定位。 */
  id: string
  /** 触发按钮的可访问名，也是弹层的 aria-label。 */
  label: string
  options: readonly SelectorOption[]
  selectedId: string
  disabled: boolean
  onSelect: (id: string) => void
}

/**
 * 渲染原生形态的整行选择器。
 * 官方设置页的「整行选择型」都是这一套：pill 按钮带 aria-haspopup，弹层由 Menu 自绘并 portal 出去。
 * 弹层本身（圆角、高程、勾选、键盘、外部点击关闭）全由 Menu 负责，这里只管触发器的外观。
 * @param props - 当前选中项、可选项与回调。
 * @returns 选择器元素。
 */
export function SelectorControl(props: SelectorControlProps) {
  const [open, setOpen] = useState(false)
  const selected = props.options.find((option) => option.id === props.selectedId)
  return (
    <Menu
      open={open}
      onClose={() => {
        setOpen(false)
      }}
      items={props.options.map((option) => ({ id: option.id, label: option.label }))}
      selectedId={props.selectedId}
      onSelect={(id) => {
        props.onSelect(id)
        setOpen(false)
      }}
      align="end"
      portal
      // 根 span 是整行里的 flex 项，给它不收缩的类，pill 才不会被左槽挤压。
      className={css.selectorAnchor}
      anchor={
        <button
          id={props.id}
          type="button"
          className={css.selector}
          aria-label={props.label}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={props.disabled}
          onClick={() => {
            setOpen((value) => !value)
          }}
        >
          {selected?.label ?? ''}
          <SELECTOR_ICON className={css.selectorChevron} />
        </button>
      }
    />
  )
}

/**
 * 动作行：一个按钮。
 *
 * **它不再带结果行，也不再自己出转圈**（3.0）：测试的动画与结果都发生在**每一行的右槽**里
 * （结果在那里停留 `RESULT_TTL_MS` 后自行消失）。按钮这边只换文案（「正在测试…」）——
 * 三处各转一个圈只会让这一小块变吵，而真正要盯的是那两行的右槽。
 */
export interface ActionRowProps {
  label: string
  disabled: boolean
  onClick: () => void
}

/**
 * 渲染一个动作按钮。
 * @param props - 按钮文案、禁用态与回调。
 * @returns 动作行元素。
 */
export function ActionRow(props: ActionRowProps) {
  return (
    <div className={css.actions}>
      <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </Button>
    </div>
  )
}
