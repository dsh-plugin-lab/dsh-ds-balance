/**
 * 「DeepSeek 余额」在 bundle 详情页里的配置卡片：标题与描述由页面画，卡内只有控件与保存。
 * 只做配置与**来源状态**：不展示任何额度信息，也不按阈值给任何东西上色。
 * 分组按使用频率排序：刷新三项有合理默认值，放最后。
 *
 * **「连接」组在 3.0 重做成只读状态展示**：从前它是一列输入框（一个继承官方的只读
 * 凭据框 + 可编辑的接口地址 + 二级「自定义设置」里的引用名），但那些输入要么是假的
 * （接口地址只服务官方、密钥框根本不能填），要么没有使用场景。现在它只回答一件事：
 * **两条取数途径各自通不通**，以及一个真打上游的测试按钮。
 *
 * 判据住在后端（`GET /api/v1/sources`），本文件只渲染 —— 见 [use-sources.ts](use-sources.ts)。
 * @module dsh-ds-balance/client/settings/BalanceSettingsCard
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { interpolate } from '../locales.ts'
import type { LocaleKey } from '../locales.ts'
import { GROUP_ICONS } from '../icons.ts'
import { AccountAvatar } from './AccountAvatar.tsx'
import {
  ActionRow,
  FieldFrame,
  FieldGroup,
  SelectorControl,
  SourceRow,
  TextControl,
} from './fields.tsx'
import type { SelectorOption, SourceLive } from './fields.tsx'
import { AUTO_CURRENCY, currencyCodes, THRESHOLD_PAIRS, useConfigForm } from './use-config-form.ts'
import type { ConfigFormOf } from './use-config-form.ts'
import { useSources } from './use-sources.ts'
import { accountStatusOf, keyStatusOf } from './source-status.ts'
import { requestTest } from '../data.ts'
import css from './BalanceSettingsCard.module.css'
import fieldCss from './fields.module.css'

export type { ConfigFormOf } from './use-config-form.ts'

/**
 * 测试结果的**停留时长**。
 *
 * 它借右槽显示，几秒后自己让位回「凭据身份」—— 既有反馈，又不会像从前那样
 * 在屏幕上留一行永久的、还把行高顶起来的结果（维护者 2026-10-15 明确要求）。
 */
const RESULT_TTL_MS = 4000

/** 一次测试的结果：哪一行、成败与那句话。 */
interface TestOutcome {
  readonly ok: boolean
  readonly text: string
}

/** 卡片要求的属性。t 由框架按注册时声明的字典命名空间注入。 */
export interface BalanceSettingsCardProps {
  /** 词典读取器，键域来自本插件的命名空间。 */
  t: (key: LocaleKey) => string
  /** 该条目的配置表单，来自 `ctx.configForms.get(ENTRY_ID)`。 */
  form: ConfigFormOf
}

/** 四个配置分组的键。 */
type GroupKey = 'connection' | 'display' | 'thresholds' | 'refresh'

/**
 * 分组的默认展开状态。
 *
 * **连接组默认展开**：它是这张卡片的第一件事 —— 用户点进来看的就是「现在通不通」，
 * 而它只有两行状态加一个按钮，收起来只会让人多点一次。
 * 其余三组默认收起（进页面先看到提纲，需要哪组点开哪组）。
 */
const DEFAULT_GROUP_OPEN: Readonly<Record<GroupKey, boolean>> = {
  connection: true,
  display: false,
  thresholds: false,
  refresh: false,
}

/** 每组包含哪些字段；用来判断「这一组里有没有需要用户看见的非法草稿」。 */
const GROUP_FIELDS = {
  connection: [],
  display: ['displayCurrency'],
  thresholds: ['cnyWarn', 'cnyCritical', 'usdWarn', 'usdCritical'],
  refresh: ['serverRefreshSeconds', 'clientPollSeconds', 'manualRefreshCooldownSeconds'],
} as const satisfies Record<GroupKey, readonly string[]>

/** 字段名到控件 id 的映射。 */
const FIELD_IDS: Record<string, string> = {
  serverRefreshSeconds: 'ds-balance-server-refresh-seconds',
  clientPollSeconds: 'ds-balance-client-poll-seconds',
  manualRefreshCooldownSeconds: 'ds-balance-manual-refresh-cooldown-seconds',
  displayCurrency: 'ds-balance-display-currency',
  cnyWarn: 'ds-balance-cny-warn',
  cnyCritical: 'ds-balance-cny-critical',
  usdWarn: 'ds-balance-usd-warn',
  usdCritical: 'ds-balance-usd-critical',
}

/**
 * 渲染配置卡片。
 * @param props - 词典读取器与配置表单。
 * @returns 卡片元素；宿主没在服务这个命名空间时**什么都不渲染**。
 */
export function BalanceSettingsCard({ t, form: scopedForm }: BalanceSettingsCardProps) {
  const form = useConfigForm(scopedForm)
  const [groupOpen, setGroupOpen] =
    useState<Readonly<Record<GroupKey, boolean>>>(DEFAULT_GROUP_OPEN)

  const { available, writable, dirty, invalid, saving, failed } = form.state
  const disabled = !writable || saving

  // 状态与测试结果。`enabled` 传 available：宿主没服务这个命名空间时不发请求。
  const { sources, loading, refresh } = useSources(available)
  const [testing, setTesting] = useState(false)
  // 刚落定的测试结果，按途径存；几秒后自己清掉（见 RESULT_TTL_MS）。
  const [outcomes, setOutcomes] = useState<ReadonlyMap<string, TestOutcome> | null>(null)
  const outcomeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸载时收掉那个计时器：它跨越了组件生命周期（结果比一次渲染活得久）。
  useEffect(
    () => () => {
      if (outcomeTimer.current !== null) clearTimeout(outcomeTimer.current)
      outcomeTimer.current = null
    },
    [],
  )

  // 各组独立展开，不做手风琴：多项同时展开是刻意的（官方 PluginCard.tsx:8-9 的注释）。
  const toggleGroup = (key: GroupKey): void => {
    setGroupOpen((current) => ({ ...current, [key]: !current[key] }))
  }

  // 组里有非法草稿时该组强制展开：非法会禁用保存，用户必须看得见那个标红的字段，
  // 否则 footer 的「请检查标红的字段」会指向一个收起来的组。改好后即可自行收起。
  const groupOpenNow = (key: GroupKey): boolean =>
    groupOpen[key] ||
    GROUP_FIELDS[key].some((name) => form.field(name).invalid) ||
    // 成对校验不是字段级 invalid，得单独问一次：否则收起的阈值组会挡住「保存为什么是灰的」。
    (key === 'thresholds' && THRESHOLD_PAIRS.some((pair) => !form.thresholdPairOk(pair.currency)))

  // 数字字段：只有 inputMode 提示数字键盘，接受范围由宿主 schema 决定。
  // 给了 hintKey 的字段常态出说明，非法时换成 settings.invalidNumber —— 两句不同的话，
  // 而不是同一句话换个颜色。没给的（阈值四行）常态不出说明，由分组说明承担常驻提示。
  const numberRow = (name: string, labelKey: LocaleKey, hintKey?: LocaleKey, note?: ReactNode) => {
    const state = form.field(name)
    return (
      <FieldFrame
        id={FIELD_IDS[name] ?? name}
        label={t(labelKey)}
        pending={state.dirty}
        resettable={state.overridden || state.dirty}
        pendingLabel={t('settings.unsaved')}
        resetLabel={t('settings.reset')}
        invalid={state.invalid}
        invalidNote={t('settings.invalidNumber')}
        hint={hintKey === undefined ? undefined : t(hintKey)}
        disabled={disabled}
        onReset={() => {
          form.resetField(name)
        }}
      >
        <TextControl
          id={FIELD_IDS[name] ?? name}
          text={state.text}
          numeric
          invalid={state.invalid}
          disabled={disabled}
          onBlur={() => {
            form.touch(name)
          }}
          onEdit={(text) => {
            form.edit(name, text)
          }}
        />
        {note ?? null}
      </FieldFrame>
    )
  }

  /**
   * 阈值成对的校验提示。它被放进那一对**最后一个字段的字段体**里，因此紧贴输入框下方，
   * 也不会在 `.fields` 的分隔线节奏里多出一条线。
   *
   * **打字时不出现**：只在其中一个失焦过、或这一对本来就非法（例如从旧版本带过来的值）时才显示。
   * 保存按钮不按这条走 —— 它有非法项就置灰，判据在 use-config-form 的 `state.invalid`。
   */
  const pairNote = (currency: string): ReactNode => {
    const pair = THRESHOLD_PAIRS.find((item) => item.currency === currency)
    if (pair === undefined || form.thresholdPairOk(currency)) return null
    const drafting = form.field(pair.warn).dirty || form.field(pair.critical).dirty
    if (drafting && !form.touched(pair.warn) && !form.touched(pair.critical)) return null
    return (
      <p className={fieldCss.pairNote} role="alert">
        {t('settings.hint.thresholdPair')}
      </p>
    )
  }

  const currency = form.field('displayCurrency')
  const currencyId =
    typeof currency.value === 'string' && currency.value !== '' ? currency.value : AUTO_CURRENCY
  const currencyOptions: SelectorOption[] = [
    { id: AUTO_CURRENCY, label: t('settings.currency.auto') },
    ...currencyCodes(currency.value, currency.effective).map((code) => ({ id: code, label: code })),
  ]
  // 「显示币种」是整行选择型：左文字、右 pill，结构照官方 General 行。
  const currencyRow = (
    <div className={fieldCss.row}>
      <div className={fieldCss.rowText}>
        <div className={fieldCss.rowTitleLine}>
          <span className={fieldCss.rowTitle}>{t('settings.field.displayCurrency')}</span>
        </div>
        <p className={fieldCss.hint}>{t('settings.hint.displayCurrency')}</p>
      </div>
      <SelectorControl
        id={FIELD_IDS.displayCurrency ?? 'displayCurrency'}
        label={t('settings.field.displayCurrency')}
        options={currencyOptions}
        selectedId={currencyId}
        disabled={disabled}
        onSelect={(id) => {
          form.setValue('displayCurrency', id)
        }}
      />
    </div>
  )

  /**
   * 测试两条途径。
   *
   * **真打上游**（`POST /api/v1/test-connection`），不是本地字符串检查 ——
   * 这里替换掉的正是从前那个「检查字符串 + 等 800ms + 说连接正常」的假按钮。
   *
   * 结果**借用每行的右槽**显示几秒，然后让位回「凭据身份」；顺带重读一次状态
   * （测试往往紧跟着「刚改完凭据」）。**结果绝不能单开一行**：那会把行高顶起来。
   */
  const runTest = (): void => {
    if (testing) return
    setTesting(true)
    setOutcomes(null)
    if (outcomeTimer.current !== null) clearTimeout(outcomeTimer.current)
    void (async () => {
      const [keyResult, accountResult] = await Promise.all([
        runOne('deepseek-http'),
        runOne('deepseek-account'),
      ])
      setOutcomes(
        new Map([
          ['key', keyResult],
          ['account', accountResult],
        ]),
      )
      setTesting(false)
      // 成败都只停 RESULT_TTL_MS：失败也不留下（维护者：不要一个东西一直在那）。
      // 于是「刚测过」这件事只活在这几秒里 —— 常态下右侧恒是凭据身份。
      outcomeTimer.current = setTimeout(() => {
        outcomeTimer.current = null
        setOutcomes(null)
      }, RESULT_TTL_MS)
      await refresh()
    })()
  }

  /** 测一条途径并折成一句结果文案。 */
  const runOne = async (source: 'deepseek-http' | 'deepseek-account'): Promise<TestOutcome> => {
    try {
      const result = await requestTest(source)
      if (result.ok) {
        return {
          ok: true,
          text: t('settings.test.ok').replace('{ms}', () => String(result.latencyMs)),
        }
      }
      // 两个错误码有专门的话（它们不是「失败」，是「还没配」）。
      if (result.code === 'NO_KEY') {
        return {
          ok: false,
          text:
            source === 'deepseek-account'
              ? t('settings.test.notSignedIn')
              : t('settings.test.noKey'),
        }
      }
      return {
        ok: false,
        text: interpolate(t('settings.test.fail'), {
          message: result.message ?? result.code ?? '',
        }),
      }
    } catch {
      return { ok: false, text: interpolate(t('settings.test.fail'), { message: 'unreachable' }) }
    }
  }

  /**
   * 组装一行右槽的临时内容。
   *
   * 优先级：正在测 > 刚测完 > 常态。前三者**共用同一个槽**，所以行高不随它们变化 ——
   * 这正是本轮把「结果行」拆掉换来的东西。
   * @param row - 途径键（`key` / `account`）。
   * @returns 交给 SourceRow 的 live；没有临时内容时 null。
   */
  const liveOf = (row: string): SourceLive | null => {
    if (testing) return { kind: 'busy' }
    const outcome = outcomes?.get(row)
    if (outcome === undefined) return null
    return { kind: 'result', ok: outcome.ok, text: outcome.text }
  }

  const footerNote = failed
    ? { text: t('settings.failed'), className: css.failed }
    : invalid
      ? { text: t('settings.invalid'), className: css.notice }
      : null

  // 宿主没在服务这个命名空间（错的 ENTRY_ID、陌生宿主、或远程页面停在 memory 模式）时
  // **什么都不渲染**：空控件配一个能点的保存按钮，比不渲染更坏。官方每张卡片都这么处理。
  // 放在所有 hook 之后 —— 提前 return 会换掉 hook 顺序。
  if (!available) return null

  const keyStatus = keyStatusOf(sources.key, t)
  const accountStatus = accountStatusOf(sources.account, t)

  return (
    // 页面把这一格渲染在自己的 <section> 里：无外框的一列控件，所以根节点是 div、不是 li。
    <div className={css.form}>
      {writable ? null : (
        <p className={css.readOnly} role="status">
          {t('settings.readOnly')}
        </p>
      )}

      {/* ── 连接：两条取数途径的只读状态 + 一个真测试按钮 ───────────── */}
      <FieldGroup
        icon={<GROUP_ICONS.connection size={14} />}
        title={t('settings.group.connection')}
        // 组级一句替代原来每行各一句的近义说明（那两句本身也是重复）。
        note={t('settings.sources.groupNote')}
        open={groupOpenNow('connection')}
        onToggle={() => {
          toggleGroup('connection')
        }}
      >
        <div className={fieldCss.fields}>
          <SourceRow
            label={t('settings.sources.key')}
            status={keyStatus}
            live={liveOf('key')}
            monoIdentity
          />
          <SourceRow
            label={t('settings.sources.account')}
            status={accountStatus}
            live={liveOf('account')}
            // 账号那行**已登录就给头像**（有头像就是身份本身，比灯更有信息）；
            // 没登录则连头像都不给，落回与 Key 那行同形的红灯。
            {...(sources.account.signedIn
              ? { leading: <AccountAvatar url={sources.account.avatarUrl} /> }
              : {})}
          />
          <div className={fieldCss.field}>
            <ActionRow
              label={testing ? t('settings.testing') : t('settings.test')}
              disabled={disabled || testing || loading}
              onClick={runTest}
            />
          </div>
        </div>
      </FieldGroup>

      <FieldGroup
        icon={<GROUP_ICONS.display size={14} />}
        title={t('settings.group.display')}
        open={groupOpenNow('display')}
        onToggle={() => {
          toggleGroup('display')
        }}
      >
        {currencyRow}
      </FieldGroup>

      <FieldGroup
        icon={<GROUP_ICONS.thresholds size={14} />}
        title={t('settings.group.thresholds')}
        note={t('settings.hint.threshold')}
        open={groupOpenNow('thresholds')}
        onToggle={() => {
          toggleGroup('thresholds')
        }}
      >
        {numberRow('cnyWarn', 'settings.field.cnyWarn')}
        {numberRow('cnyCritical', 'settings.field.cnyCritical', undefined, pairNote('CNY'))}
        {numberRow('usdWarn', 'settings.field.usdWarn')}
        {numberRow('usdCritical', 'settings.field.usdCritical', undefined, pairNote('USD'))}
      </FieldGroup>

      {/* 刷新三项都有合理默认值，属于装了就不用动的那一档，因此排在最后。 */}
      <FieldGroup
        icon={<GROUP_ICONS.refresh size={14} />}
        title={t('settings.group.refresh')}
        note={t('settings.hint.refreshAdvanced')}
        open={groupOpenNow('refresh')}
        onToggle={() => {
          toggleGroup('refresh')
        }}
        last
      >
        {numberRow(
          'serverRefreshSeconds',
          'settings.field.serverRefreshSeconds',
          'settings.hint.serverRefreshSeconds',
        )}
        {numberRow(
          'clientPollSeconds',
          'settings.field.clientPollSeconds',
          'settings.hint.clientPollSeconds',
        )}
        {numberRow(
          'manualRefreshCooldownSeconds',
          'settings.field.manualRefreshCooldownSeconds',
          'settings.hint.manualRefreshCooldownSeconds',
        )}
      </FieldGroup>

      <div className={css.footer}>
        {footerNote === null ? null : (
          <p className={footerNote.className} role="status">
            {footerNote.text}
          </p>
        )}
        <button
          type="button"
          className={css.save}
          disabled={!dirty || invalid || saving || !writable}
          onClick={() => {
            void form.save()
          }}
        >
          {saving ? t('settings.saving') : t('settings.save')}
        </button>
      </div>
    </div>
  )
}
