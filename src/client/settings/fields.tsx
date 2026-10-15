/**
 * 手写字段控件：一行一个字段，控件只报告用户输入，写入统一由卡片的保存完成。
 * 结构对齐官方 ui-settings-plugins/fields.tsx，取值全部走 --dsw-alias-* 语义令牌。
 * @module dsh-ds-balance/client/settings/fields
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { Button, DisclosureRow, Input, Menu, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TagTone } from '@deepseek-ai/dsh-client-ui-primitives'
import { SELECTOR_ICON } from '../icons.ts'
import css from './fields.module.css'

/** 一个配置分组的属性。展开状态由调用方持有：DisclosureRow 是完全受控组件。 */
export interface FieldGroupProps {
  /** 折叠头左侧的图标；展开后会被原语自己的 chevron 取代。 */
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
 * 折叠头用原语 DisclosureRow（不自己画），展开体由原语在 open 时条件渲染、无动画。
 * 各组独立展开，不做手风琴：官方 PluginCard 的注释写明多项同时展开是刻意的。
 * @param props - 图标、标题、可选说明、受控展开状态与字段。
 * @returns 分组元素。
 */
export function FieldGroup(props: FieldGroupProps) {
  return (
    <DisclosureRow
      className={clsx(css.group, props.last === true && css.groupLast)}
      icon={props.icon}
      title={props.title}
      open={props.open}
      expandable
      expandOnRowClick
      onToggle={props.onToggle}
    >
      {props.note === undefined ? null : <p className={css.groupNote}>{props.note}</p>}
      <div className={css.fields}>{props.children}</div>
    </DisclosureRow>
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

/** 一条取数途径的状态：徽标、补充行与说明行。 */
export interface SourceStatus {
  /** 左侧状态点与徽标的档位：`ok` 绿、`missing` 红。 */
  readonly tone: 'ok' | 'missing'
  /** 右侧徽标文案（如「已配置密钥。」）。 */
  readonly badge: string
  /** 徽标下方那行事实：来源层 · 掩码 · 账本标识（可为空串）。 */
  readonly detail: string
  /** 一句说明这条途径是什么。 */
  readonly hint: string
}

/** 一条取数途径的状态行。 */
export interface SourceRowProps {
  /** 途径名（「API Key」/「账号登录」）。 */
  label: string
  status: SourceStatus
  /** 测试结果；未测过时为 null。 */
  result: SourceResult | null
  /** 行首的头像等元素；账号那行给头像，Key 那行不给。 */
  leading?: ReactNode
}

/**
 * 一次测试的结果。
 *
 * **成败是一个字段，不从文案里猜**：曾经用「文案是不是以 ✓ 开头」判成败，
 * 而那个前缀没有任何地方在加 —— 于是失败样式恒定生效、成功也画成红的。
 * 文案是给人看的，成败是给代码看的，两者不该共用一个字符串。
 */
export interface SourceResult {
  readonly ok: boolean
  readonly text: string
}

/**
 * 渲染一条取数途径的状态行。
 *
 * **这是只读展示，不是表单字段**：它不接 `form`，也没有草稿与撤销。
 * 结构照官方 Models 页的 provider 行 —— 左状态点 + 名称 + 右侧徽标，
 * 下面跟一行事实与一句说明。状态点逐值抄官方 `.credentialDot`
 * （8×8、`border-radius:50%`、`corner-shape:round`、成功绿 / 缺失红）。
 * @param props - 名称、状态、测试结果与可选的行首元素。
 * @returns 状态行元素。
 */
export function SourceRow(props: SourceRowProps) {
  const dotClass = props.status.tone === 'ok' ? css.dotOk : css.dotMissing
  return (
    <div className={css.source}>
      <div className={css.sourceHead}>
        {props.leading === undefined ? (
          <span className={clsx(css.dot, dotClass)} aria-hidden="true" />
        ) : (
          props.leading
        )}
        <span className={css.sourceName}>{props.label}</span>
        <span className={css.badges}>
          <Tag tone={props.status.tone === 'ok' ? 'neutral' : 'quiet'}>{props.status.badge}</Tag>
        </span>
      </div>
      {props.status.detail === '' ? null : (
        <p className={css.sourceDetail}>{props.status.detail}</p>
      )}
      <p className={css.hint}>{props.status.hint}</p>
      {props.result === null ? null : (
        // 成功只是通报，用 polite 的 status；失败需要用户处理，按 06 §6.7 用 alert。
        <p
          className={props.result.ok ? css.resultOk : css.sourceResult}
          role={props.result.ok ? 'status' : 'alert'}
        >
          {props.result.text}
        </p>
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

/** 动作行与它的结果行。 */
export interface ActionRowProps {
  label: string
  disabled: boolean
  /** 结果文案；无结果时为 null，此时不渲染结果行。 */
  result: { readonly ok: boolean; readonly text: string } | null
  onClick: () => void
}

/**
 * 渲染一个动作按钮与它的状态结果行。
 * @param props - 按钮文案、禁用态、结果与回调。
 * @returns 动作行元素。
 */
export function ActionRow(props: ActionRowProps) {
  return (
    <>
      <div className={css.actions}>
        <Button type="button" variant="outline" disabled={props.disabled} onClick={props.onClick}>
          {props.label}
        </Button>
      </div>
      {props.result === null ? null : (
        // 成功只是通报，用 polite 的 status；失败需要用户处理，按 06 §6.7 的「行内错误」用 alert。
        <p
          className={props.result.ok ? css.resultOk : css.resultFail}
          role={props.result.ok ? 'status' : 'alert'}
        >
          {props.result.text}
        </p>
      )}
    </>
  )
}
