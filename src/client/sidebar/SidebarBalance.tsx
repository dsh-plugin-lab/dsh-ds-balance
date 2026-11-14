/**
 * 侧栏左下角的余额条目。
 *
 * 两个形态共用同一个状态圆环：展开态是「圆环 + 金额」，折叠态是轨道里居中一个圆环。
 * 点击条目弹出余额浮层，Escape 或点击外部关闭（刻意不做悬停即开：浮层向上展开，
 * 会盖住左邻条目；悬停时指针只是路过我们这一行，邻居的图标就被顶开了）。
 *
 * 数据默认走真实端点（`GET /api/v1/balance`，按 `clientPollSeconds` 轮询）；
 * 只有 URL 参数或 localStorage 明确选过场景时才切到 mock 旁路。
 * 颜色仍只由 `dotStateOf(severity)` 决定。弧长是唯一读阈值的去处，且只当刻度：
 * 由 `ringRatioOf` 算好交给圆环。组件内不做配色判断、不读 ctx。
 * @module dsh-ds-balance/client/sidebar/SidebarBalance
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconWarningOutlineRegular,
  Tooltip,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { BalanceResponse } from '../api-types.ts'
import { interpolate, type LocaleKey } from '../locales.ts'
import {
  cooldownSecondsOf,
  cooldownUntilOf,
  currentAgeMs,
  formatMoney,
  ringRatioOf,
  selectionOf,
  sourceIdentityOf,
  sourceLabelKeyOf,
  type RingMarker,
} from '../model.ts'
import {
  hoverTextOf,
  presentationOf,
  situationOfResponse,
  type Presentation,
} from '../situation.ts'
import { currentBalance, resolveScenario, subscribeScenario } from '../mock/index.ts'
import { pendingView, requestBalance, requestRefresh, unreachableView } from '../data.ts'
import { CONFIG_SLOT_WARNING, type ConfigSlotProbe, type ConfigSlotState } from '../config-slot.ts'
import type { RouteHint } from '../route-hint.ts'
import { BalancePopover, type PluginsAction } from './BalancePopover.tsx'
import { PercentRing, type RingState } from './PercentRing.tsx'
import css from './SidebarBalance.module.css'

/** 模拟一次刷新的耗时（毫秒）。 */
const REFRESH_SIMULATION_MS = 600

/** 一秒的毫秒数；相对时间与手动刷新冷却都按它换算。 */
const MS_PER_SECOND = 1000

/** 浮层打开时相对时间的刷新间隔。 */
const TICK_MS = MS_PER_SECOND

/**
 * 订阅配置槽的探测结果。
 *
 * 为什么要订阅而不是读一次：提示**必须可撤销** —— 槽若在提示出现之后才声明
 * （宿主将来改成延迟声明就是这种情形），提示要自己消失。三态见 [config-slot.ts](../config-slot.ts)。
 * @param probe - 探测结果。
 * @returns 当前态。
 */
function useConfigSlotState(probe: ConfigSlotProbe): ConfigSlotState {
  const [state, setState] = useState(() => probe.getSnapshot())
  useEffect(() => {
    setState(probe.getSnapshot())
    return probe.subscribe(() => {
      setState(probe.getSnapshot())
    })
  }, [probe])
  return state
}

/**
 * 「打开本插件配置」这个**可选**入口。宿主没提供 layout 服务时整条链不存在，
 * 浮层右上角的图标因此不渲染 —— 不留按不动的死按钮。
 * 形态与 `configSlotProbe` 一样是个可订阅的小对象：服务可能晚到，图标要能自己出现、也能自己消失。
 * 快照里带**落点**（见 BalancePopover 的 PluginsAction）：深链服务在不在，措辞跟着分档。
 */
export interface PluginsNavigation {
  /** 当前可用的动作与落点；宿主没有 layout 服务时是 undefined。 */
  getSnapshot: () => PluginsAction | undefined
  /**
   * 订阅它的出现与消失。
   * @param listener - 变化回调。
   * @returns 退订函数。
   */
  subscribe: (listener: () => void) => () => void
}

/**
 * 订阅「打开本插件配置」这个入口。
 * @param navigation - 父代理建好的入口；宿主缺 layout 服务时给 undefined。
 * @returns 当前可用的动作与落点，或 undefined。
 */
function usePluginsNavigation(
  navigation: PluginsNavigation | undefined,
): PluginsAction | undefined {
  // 惰性初值：这个箭头函数是 useState 的 initializer，交出去的才是状态值（快照对象本身）。
  const [action, setAction] = useState(() => navigation?.getSnapshot())
  useEffect(() => {
    if (navigation === undefined) {
      setAction(undefined)
      return
    }
    // 快照过去是**回调本身**，那时必须走 updater 形式才不会被 React 当成更新器调用；
    // 现在是对象，直接 set 即可。（旧注释与理由见 git 历史，别照着旧写法把函数塞回来。）
    setAction(navigation.getSnapshot())
    return navigation.subscribe(() => {
      setAction(navigation.getSnapshot())
    })
  }, [navigation])
  return action
}

/** 条目属性。 */
export interface SidebarBalanceProps {
  /** 侧栏是否展开（false = 56px 轨道）。 */
  wide: boolean
  /** 词典函数。 */
  t: (key: LocaleKey) => string
  /**
   * 配置表单的能力探测结果。宿主拿不出配置表单时（没有 `configForms` 客户端服务，
   * 或这个 profile 里没装 Plugins 页），浮层据此给一条英文 `[WARN]` 提示；
   * 探测本身不影响余额与刷新。
   */
  configSlotProbe: ConfigSlotProbe
  /**
   * 「打开本插件配置」的可选入口：有它才渲染浮层右上角那个图标按钮。
   * 宿主缺 layout 服务时整条链不存在，图标就不出现。
   */
  pluginsNavigation?: PluginsNavigation
  /**
   * 「当前会话在用哪条路由」这条提示；宿主没有相应客户端服务时给 `undefined`。
   *
   * 它只影响**取哪条数据来源**（后端据此选 Key 那条还是账号那条），不影响别的行为；
   * 缺席时后端回落到全局默认路由，界面照常。
   */
  routeHint?: RouteHint
  /**
   * 「改用 X」：把后端实际给的那个币种写进本插件那一行的设置命名空间（`displayCurrency`）。
   *
   * 成败由父代理的 `writeFieldValue` 直接给出（0.1.7 的 `ConfigForm.set` 返回宿主是否接受，
   * 不再需要读回 user 层猜）。本组件不做乐观更新：界面只跟设置快照走，
   * 没落盘就什么都不变，浮层的提示留着让用户重试。
   * @param currency - 后端实际给出的币种代码。
   * @returns 宿主是否接受这次写入。
   */
  onSelectCurrency: (currency: string) => Promise<boolean>
  /** 本组件消费的配置切片。 */
  config: {
    displayCurrency: string
    manualRefreshCooldownSeconds: number
    /** 浏览器来取缓存的节奏（秒）。 */
    clientPollSeconds: number
    /**
     * 配置指纹。任何一项设置改动都会换一个值，用来**立刻**重问一次后端缓存 ——
     * 改了阈值圆环要当场变，不该等下一轮轮询。
     */
    configSignature: string
    /**
     * 读某个币种的 warn 阈值。**只用来定弧长**，颜色不走这里。
     * 没配的币种给 `undefined`，由 `ringRatioOf` 退回按 severity 定性。
     */
    warnThresholdOf: (currency: string) => number | undefined
    /**
     * 设置存储是否接受写入。false 时写入入口（浮层的「改用 X」）disabled ——
     * 点了必被宿主拒绝，不该让用户以为能改。
     */
    writable: boolean
  }
}

/**
 * 把处境收敛成圆环的形态。
 *
 * 形态表（[../situation.ts](../situation.ts)）的 `ring` 类型与圆环的状态**同一个取值域**，
 * 所以这里不需要收窄 —— 从前 `ongoing` 是个到不了的值，得手动折成 `idle`；
 * 现在它是 `checking` 的真形态（转弧），收窄反而会把它抹掉。
 * @param presentation - 处境形态。
 * @returns 弧状态与中心符号。
 */
function ringSpecFor(presentation: Presentation): { state: RingState; marker: RingMarker | null } {
  return { state: presentation.ring, marker: presentation.marker }
}

/**
 * 订阅「当前会话在用哪条路由」。
 *
 * 与 `usePluginsNavigation` 同形：提示对象是可订阅的，宿主服务晚到也能自己出现、自己消失；
 * 缺席时回 `undefined`，请求里就不带这条提示。
 * @param hint - 父代理建好的提示；宿主没有相应服务时给 `undefined`。
 * @returns 当前会话的 provider id，或 `undefined`。
 */
function useRouteProvider(hint: RouteHint | undefined): string | undefined {
  const [provider, setProvider] = useState(() => hint?.getSnapshot())
  useEffect(() => {
    if (hint === undefined) {
      setProvider(undefined)
      return
    }
    setProvider(hint.getSnapshot())
    return hint.subscribe(() => {
      setProvider(hint.getSnapshot())
    })
  }, [hint])
  return provider
}

/**
 * 渲染侧栏左下角的余额条目。
 * @param props - 展开态、词典与配置切片。
 * @returns 条目元素。
 */
export function SidebarBalance({
  wide,
  t,
  config,
  configSlotProbe,
  onSelectCurrency,
  pluginsNavigation,
  routeHint,
}: SidebarBalanceProps): JSX.Element | null {
  /**
   * 余额视图与它的**年龄基准**。
   *
   * 两者是一件事，所以合成一份状态：后端给的是「这份快照到现在多久」（`ageMs`），
   * 要变成本地年龄就得记住「收到它的那一刻」。分开存必然出现「换了响应、没换基准」
   * 的中间态 —— 那正是自动轮询拨不回「刚刚」的成因。
   * 口径见 [sidebar/README.md](README.md) 的「时效」一节。
   */
  const [view, setView] = useState(() => {
    const response = resolveScenario() === null ? pendingView() : currentBalance()
    return { response, seenAt: Date.now(), seenAgeMs: response.ageMs }
  })
  const response = view.response
  /** 是否走 mock 旁路。默认否 —— 真机上必须显示真实余额。 */
  const [mock, setMock] = useState(() => resolveScenario() !== null)
  /** 是否至少成功取过一次。失败的轮询不该把已显示的数据换成错误态。 */
  const loadedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  // 当前会话的路由提示：一变就带着新提示重问一次后端（切会话、切模型能立刻换来源）。
  const provider = useRouteProvider(routeHint)

  const rootRef = useRef<HTMLDivElement>(null)
  /**
   * 面板在 portal 里，这个 ref 只服务外部点击判定（`useDismissOnOutsidePointer` 的第 4 个参数）——
   * 定位不再读它，坐标与尺寸上限全在 CSS 里（见本文件下方那段锚点注释）。
   */
  const panelRef = useRef<HTMLElement>(null)
  const refreshTimer = useRef<number | undefined>(undefined)
  const lastScenario = useRef<string | null>(null)

  /** 收到一份真实余额视图：视图与年龄基准一起换。 */
  const acceptBalance = useCallback((next: BalanceResponse): void => {
    setView({ response: next, seenAt: Date.now(), seenAgeMs: next.ageMs })
  }, [])

  /**
   * 端点不可达：只换视图，**不动年龄基准**。
   *
   * 这条路上没有新快照，说「刚刚」是假话；基准留在最后一份真实数据上，时间继续往上走才对。
   * @param error - 抛出物，取它的 message 当作给用户看的一句话。
   */
  const showUnreachable = useCallback((error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error)
    setView((current) => ({ ...current, response: unreachableView(message) }))
  }, [])

  /** mock 旁路的手动「刷新」：没有新响应可收，只能把年龄就地拨回零。 */
  const markFresh = useCallback((): void => {
    setView((current) => ({ ...current, seenAt: Date.now(), seenAgeMs: 0 }))
  }, [])

  // 币种只有一个真相源：设置作用域的 displayCurrency。「改用 X」直接写设置，
  // 本地不再存第二份偏好 —— 否则浮层与设置页会各说各话，组件重挂还会把本地那份弄丢。
  const preference = config.displayCurrency
  // 币种由后端选定，前端只做映射：见 model.ts 的 selectionOf。
  const selection = useMemo(() => selectionOf(response, preference), [response, preference])

  // 开发场景切换时换数据。subscribeScenario 会立刻回调一次，用 key 比对跳过它。
  // 每次回调都重判来源：`?dsb=live` 打开后会把 localStorage 里的场景清掉，
  // 于是这里从 mock 切回真实端点。
  useEffect(
    () =>
      subscribeScenario((key) => {
        const active = resolveScenario() !== null
        setMock(active)
        if (!active || lastScenario.current === key) return
        lastScenario.current = key
        acceptBalance(currentBalance())
        setRefreshing(false)
        setCooldownUntil(0)
        setOpen(false)
      }),
    [acceptBalance],
  )

  // 真实数据：首拉一次，然后按 clientPollSeconds 轮询。
  // 轮询正常时读的是后端缓存；**但缓存不可服务时（state 不是 ok）它会穿透到上游抓一次** ——
  // 这是恢复可见性的来源，是有意保留的已知边界，见 .agents/notes/2026-10-01-boundaries-left-as-is.md。
  useEffect(() => {
    if (mock) return
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const next = await requestBalance({ currency: preference, provider })
        if (cancelled) return
        loadedRef.current = true
        acceptBalance(next)
      } catch (error) {
        if (cancelled || loadedRef.current) return
        showUnreachable(error)
      }
    }
    void load()
    const id = window.setInterval(
      () => {
        void load()
      },
      Math.max(5, config.clientPollSeconds) * MS_PER_SECOND,
    )
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
    // 两个额外依赖都是有意的：
    // - preference：设置里换了币种（含浮层的「改用 X」）必须立刻按新币种重问一次后端。
    // - configSignature：改阈值要当场看到圆环变色，不能等下一轮轮询。
    // 两条都不穿透上游 —— 后端从缓存快照按新阈值重算，只有 state 不是 ok 时才会真去拉。
  }, [
    mock,
    preference,
    provider,
    config.clientPollSeconds,
    config.configSignature,
    acceptBalance,
    showUnreachable,
  ])

  useEffect(
    () => () => {
      if (refreshTimer.current !== undefined) window.clearTimeout(refreshTimer.current)
    },
    [],
  )

  const closeNow = useCallback((): void => {
    setOpen(false)
  }, [])

  // 点击触发按钮 toggle。处理器只挂在按钮上、不挂根 div ——
  // 否则浮层内部（刷新按钮、两个动作按钮）的点击会冒泡上来把浮层关掉。
  const toggleOpen = useCallback((): void => {
    setOpen((value) => !value)
  }, [])

  // 定位完全在 CSS 里（CSS Anchor Positioning），JS 不读矩形、不跟踪视口：
  // 触发区根节点带 `anchor-name: --dsb-balance-anchor`（SidebarBalance.module.css 的 .root），
  // 面板用 `position-anchor` 指同一个名字，`bottom: calc(anchor(top) + 8px)` 让它向上展开、
  // 左缘与行对齐并钳进视口 12px，尺寸上限也写在同一条规则里（BalancePopover.module.css 的 .panel）。
  // **为什么不再用钩子**：宿主 0.2.2-rc.2 删掉了 `useAnchoredPosition` 的值导出
  // （官方迁移指南 docs/upgrade-guide/v0.2.2-alpha.2/css-anchored-menus/guide.zh.md），
  // 那是**渲染期**才炸的 —— 条目整块被宿主当成坏槽退役，而编译与测试全绿。
  // 打开时它确实会盖住上方邻居那一格（与官方 cordis 面板同构，维护者已确认可接受）；
  // 关键是关闭时点邻居要落到邻居身上 —— 那由触发按钮不写 aria-haspopup 保证。

  // 相对时间与冷却秒数只在浮层打开时推进。**打开这一帧要先把「现在」拨正**：
  // 它是上次关闭时留下的旧值，直接拿它去算会让年龄与冷却闪一下旧数；
  // 用 layout 效果是为了赶在浏览器画之前改掉，普通效果会先画一帧。
  useLayoutEffect(() => {
    if (!open) return
    setNow(Date.now())
  }, [open])

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => {
      setNow(Date.now())
    }, TICK_MS)
    return () => {
      window.clearInterval(id)
    }
  }, [open])

  // 冷却到点那一刻精确解禁一次：每秒走钟只保证「不晚于 1 秒」，
  // 而按钮该在截止时刻就能按 —— 禁用判据不能比冷却本身长。
  useEffect(() => {
    if (cooldownUntil === 0) return
    const remaining = cooldownUntil - Date.now()
    if (remaining <= 0) return
    const id = window.setTimeout(() => {
      setNow(Date.now())
    }, remaining)
    return () => {
      window.clearTimeout(id)
    }
  }, [cooldownUntil])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeNow()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, closeNow])

  // 面板 portal 到了 body，不再是 rootRef 的 DOM 后代，
  // 所以要把它作为第 4 个参数传进去，否则点浮层内部会被当成「外部」而关掉。
  useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)

  const handleRefresh = useCallback((): void => {
    if (refreshing) return
    // 冷却中：不旋转，浮层里的就地文字已经在报剩余秒数。
    if (Date.now() < cooldownUntil) return
    setRefreshing(true)
    /**
     * 收尾：刷新态、冷却截止时刻、展示用的「现在」一起落。
     *
     * 时间基准由收到的响应决定（真实路径读回的 `ageMs` 已经归零，mock 路径由 markFresh 就地拨），
     * 这里只管冷却。**截止时刻与「现在」必须同一刻设**：拿上一秒留下的旧值去取整，
     * 5 秒的冷却会显示成 6 秒，而按钮的禁用判据也是那个值 —— 等于真的多禁一秒。
     * @param rejectedRemainingMs - 后端拒绝时给出的剩余毫秒；`null` 表示这次真的触发了。
     */
    const finish = (rejectedRemainingMs: number | null): void => {
      const at = Date.now()
      setRefreshing(false)
      setCooldownUntil(
        cooldownUntilOf(at, config.manualRefreshCooldownSeconds, rejectedRemainingMs),
      )
      setNow(at)
    }
    // mock 旁路没有上游可打，用一次短延迟模拟往返，让刷新态仍然可见。
    if (mock) {
      refreshTimer.current = window.setTimeout(() => {
        refreshTimer.current = undefined
        markFresh()
        finish(null)
      }, REFRESH_SIMULATION_MS)
      return
    }
    void (async () => {
      // 冷却是**后端**的权威：它说这次没触发，就按它给的剩余时间收尾，不自己编一段新的 ——
      // 否则后端只剩 1 秒，界面又从满格倒数一遍，越点越对不上。
      let rejectedRemainingMs: number | null = null
      try {
        // 先让后端穿透上游抓一次，再读回它刚写好的缓存。
        const result = await requestRefresh({ reason: 'manual', provider })
        if (!result.triggered) rejectedRemainingMs = Math.max(0, result.cooldownMs)
        // **读回必须带上同一个 provider**：后端按它选来源，漏了就会改用全局默认路由，
        // 于是刚刷的那条与读回的那条可能不是同一条 —— 数字与标签当场换成另一个钱包，
        // 下一轮轮询（≤clientPollSeconds）又自己跳回来。这与「展示/刷新/标签同一条」相冲。
        const next = await requestBalance({ currency: preference, provider })
        loadedRef.current = true
        acceptBalance(next)
      } catch (error) {
        if (!loadedRef.current) showUnreachable(error)
      } finally {
        finish(rejectedRemainingMs)
      }
    })()
  }, [
    cooldownUntil,
    config.manualRefreshCooldownSeconds,
    mock,
    preference,
    provider,
    refreshing,
    acceptBalance,
    showUnreachable,
    markFresh,
  ])

  // 「改用 X」的语义不变：写回的是后端实际给的那个币种。落盘判定在父代理那边读回 user 层，
  // 这里不做乐观更新 —— 没写进去就什么都不变，提示留着让用户直接重试。
  const handleUseShown = useCallback((): void => {
    const current = selection.shown
    if (current === null) return
    void onSelectCurrency(current.currency)
  }, [selection, onSelectCurrency])

  // 点右上角图标：先关浮层，再跳转。深链优先、失败退回列表，两笔 warn 都由父代理记 ——
  // 这里不吞成败，也不做降级动作：没地方可去时浮层已经关了，圆环与后端照常。
  const pluginsAction = usePluginsNavigation(pluginsNavigation)
  // 交给浮层的只有「动作 + 落点」；关浮层留在这里（浮层不知道自己的开合），
  // 且引用要稳：每次渲染换一个新对象会让浮层那条 Tooltip 白重挂一次。
  const popoverPluginsAction = useMemo(
    () =>
      pluginsAction === undefined
        ? undefined
        : {
            reachesConfig: pluginsAction.reachesConfig,
            open: (): void => {
              closeNow()
              pluginsAction.open()
            },
          },
    [closeNow, pluginsAction],
  )

  // 缺槽才提示；pending 与 available 都不提示（pending 期间不下结论）。
  const configSlotState = useConfigSlotState(configSlotProbe)

  const shown = selection.shown
  // **唯一的分支入口**：处境一次判出，环 / 文案 / 来源标签都从这里取。
  // 组件里不再出现 `response.state` / `response.severity` / `error.code` 的形态判断。
  const situation = situationOfResponse(response)
  const presentation = presentationOf(situation, response.severity)
  const ring = ringSpecFor(presentation)
  // 弧长：只在 gauge 族算（余额占该币种 warn 阈值的几分之几）；其余族没有刻度可画。
  const ringRatio =
    presentation.arc === 'gauge'
      ? ringRatioOf(
          shown === null ? null : shown.total,
          shown === null ? undefined : config.warnThresholdOf(shown.currency),
          response.severity,
        )
      : 0

  // 状态文案。正常时为 null —— 词典里没有「一切正常」这一条，也不该新增。
  const stateKey = presentation.textKey
  const stateText = stateKey === null ? null : t(stateKey)

  let markerLabel: string | null = null
  let markerHint = ''
  if (shown === null) {
    markerLabel = t(stateKey ?? 'situation.emptyWallet')
    markerHint = markerLabel
  } else if (!selection.matchesPreference) {
    markerLabel = t('sidebar.aria.mismatch')
    markerHint = interpolate(t('popover.mismatch'), { wanted: preference, shown: shown.currency })
  }

  // 按钮的 aria-label 会盖掉子树里的名字，圆环本身又是 aria-hidden，
  // 所以金额、状态与标记含义都必须并进来 —— 读屏用户在点开浮层之前就能听到余额。
  // 首段与可见标签逐字一致（sidebar.label），满足「无障碍名必须包含可见标签」。
  const ariaParts = [wide ? t('sidebar.label') : t('sidebar.aria.ring')]
  // 没有余额时不念占位符：紧随其后的状态文案已经说了「暂无余额」。
  if (shown !== null) ariaParts.push(formatMoney(shown.total, shown.currency))
  // 没有余额时状态文案与标记文案本就是同一条，去重避免念两遍。
  if (stateText !== null && stateText !== markerLabel) ariaParts.push(stateText)
  if (markerLabel !== null) ariaParts.push(markerLabel)
  const ariaLabel = ariaParts.join(' ')
  const cooldownSeconds = cooldownSecondsOf(cooldownUntil, now)
  // 来源标签：**判据是「这一份数字真的在屏幕上吗」**，不是一个写死在表里的开关。
  // 它说的是「这份数字从哪来」，所以没有数字就没有「从哪来」。
  //
  // 为什么不用处境表里的 `showSource`：那张表是**按处境**给的，而同一个处境下
  // 「有没有数字」还会变 —— `account-unavailable`（账户停用）上游可能给空的余额列表，
  // 那时 `shown === null`，按表标就会在一份没有数字的浮层里写「（API Key）」。
  // 用 `shown !== null` 判，这条路径自动正确，不需要为每个处境各想一遍。
  const sourceKey = shown === null ? null : sourceLabelKeyOf(response.source)
  // 标签优先报**哪一份凭据**（掩码 key / 账号名），报不出来才退回**哪条路**。
  // 两类问题不同：路名回答「官方端点还是账号」，身份回答「具体是哪一把」——
  // 后者才是用户换完 key 想确认的东西。身份来自同一份响应，所以不会和数字对不上。
  const sourceIdentity = shown === null ? null : sourceIdentityOf(response)
  const sourceLabel =
    shown === null
      ? null
      : sourceIdentity !== null
        ? interpolate(t('popover.source.identity'), { identity: sourceIdentity })
        : sourceKey === null
          ? null
          : t(sourceKey)
  // 年龄 = 收到那份响应时后端报的年龄 + 此后流逝的时间。基准随每次响应一起换，
  // 所以自动轮询带回来的新快照同样会把「多久之前」拨回「刚刚」。
  const ageMs = currentAgeMs(view.seenAt, view.seenAgeMs, now)

  // 悬停文案：**两态共用 `hoverTextOf` 算出来的这一份**，交付通道也只有一条。
  // 规则：**数字可信才显数字；这个处境有话说时，先说话**。
  //
  // 从前这里是两条路：`ringTitle`（只在有状态文案时才设）与 `hoverLabel`
  // （有数字就给数字）。后果有两个：收起态在 `ok` / `low` / `critical` 上
  // **什么都不显示**（`stateText` 是 `null` → `undefined` → 那个 `<svg>` 里连
  // `<title>` 都没有），而 `stale` 上两态**各说各的**（收起态说「数据已过期」、
  // 展开态报旧金额）。上一轮先把**文案**收敛到 `hoverTextOf`（见
  // [决策记录](../../../.agents/notes/2026-10-01-hover-tells-the-situation.md)）。
  //
  // **交付通道也收敛成一条（官方 `Tooltip` 原语，两态都挂）**，因为「说什么」
  // 一致还不够 —— **命中区**也得一致。收起态从前挂的是 24px 的 SVG 原生 `<title>`，
  // 而原生 title 的命中面**就是那个 `<svg>`**：36×36 按钮边缘那圈有悬浮灰底、
  // 却什么都不弹，于是同一块悬浮区「内圈有、外圈没有」。原语的锚是**整条按钮**，
  // 悬浮灰底覆盖到哪里就弹到哪里 —— 展开态 44px 整行一直如此，收起态现在同构。
  // 取这条通道还有两个附带的理由：底色跟着主题走（自绘黑底会跟主题脱节），
  // 且两态只差一个 `side`，不再存在第二套「怎么显示」的实现。
  // 另外**来源（API Key / 账号登录）不进悬停**：它属于浮层标题那一行 ——
  // 两句拼一起会长得离谱，气泡还有半视口宽的上限。
  const hoverText = hoverTextOf(shown, stateText)

  // 刻意不写 aria-haspopup="dialog"：
  // 已装的 dsh-usage-statistics-panel 用 button[aria-haspopup="dialog"] 从它自己的
  // 按钮往上逐层 querySelector 去找设置触发按钮（SidebarEntry.tsx:35-60）。我们和它
  // 同在一个槽容器里、注册得又比它晚，那个选择器会在容器这一层先命中我们，
  // 于是点它反而打开了我们的浮层。
  // aria-expanded 表达的是同一个事实（这里会展开一个弹层），且不会被那个启发式命中。
  // 浮层面板自己的 role="dialog" 保留不变。
  // 存史（2026-09-20）：上面写的成因是**当时**邻居插件自己的 DOM 遍历实现 —— 它不是我们的
  // 依赖，也不属本工作区。官方设置触发按钮本身也带该属性（apps/web/tests/settings-chrome.e2e.ts），
  // 所以按属性找并非无据，"假设整条只有一个"才是问题。留这段是为了解释这行代码为什么长这样；
  // 完整事故见 docs/postmortem/2026-09-17-aria-haspopup-neighbour-collision.md。
  const trigger = (
    <button
      type="button"
      className={css.trigger}
      aria-label={ariaLabel}
      aria-expanded={open}
      onClick={toggleOpen}
    >
      {wide ? (
        <>
          <span className={css.icon}>
            {/* 环径 = 官方账号行头像的边长（24）：两行的图标列同宽，标签左缘才会对齐。
                环径由 CSS 的 `.icon` 定窝、这里给同一个数，改一处必须同改另一处（红线钉着）。 */}
            <PercentRing state={ring.state} marker={ring.marker} ratio={ringRatio} size={24} />
          </span>
          <span className={css.label}>{t('sidebar.label')}</span>
          {markerLabel === null ? null : (
            <Tooltip label={markerHint} side="bottom" delayMs={500}>
              <span className={css.marker} role="img" aria-label={markerLabel}>
                <IconWarningOutlineRegular size={12} />
              </span>
            </Tooltip>
          )}
        </>
      ) : (
        <PercentRing
          state={ring.state}
          marker={ring.marker}
          ratio={ringRatio}
          // 与展开态同一个环径：官方折叠态的头像也是 24px，两态只差命中区（36×36）。
          // **不再传 title**：悬停由外面那条 `Tooltip` 承担，锚是整条按钮 ——
          // 环只是它内部的一个 24px 图形，命中面不该由图形自己划。
          size={24}
        />
      )}
    </button>
  )

  // 悬停交付：**两态同一个原语，锚是整条按钮**。
  // 两态只差 `side`（都对——条目贴着视口左缘，气泡往右让开）；`disabled={open}`
  // 两态都要：浮层已经打开时面板里就有这份数据，再飘一个气泡是重复，
  // 而且点开浮层后指针通常还停在条目上，两个面会同时挂在视口里。
  // 展开态里标记（感叹号）自己那层 Tooltip 嵌在这条里面：原语用 TooltipSuppression
  // 上下文，内层可见时会通知祖先把自己压掉，所以指针停在感叹号上只有一个气泡。
  // `hoverText` 为 null 时不包这一层 —— 不留空气泡。
  const hoverableTrigger =
    hoverText === null ? (
      trigger
    ) : (
      <Tooltip label={hoverText} side="right" delayMs={500} disabled={open}>
        {trigger}
      </Tooltip>
    )

  return (
    <div ref={rootRef} className={css.root} data-mode={wide ? 'wide' : 'rail'} tabIndex={-1}>
      {hoverableTrigger}

      {/* 关闭时整个浮层卸载：DOM 里不留任何可命中区域。
          浮层向上展开、正压在左邻条目上，所以只有点击才会打开它 —— 悬停打开会让
          指针只是路过我们这一行时就把邻居的图标顶掉。 */}
      {open
        ? createPortal(
            <BalancePopover
              t={t}
              selection={selection}
              displayCurrency={preference}
              ageMs={ageMs}
              sourceLabel={sourceLabel}
              refreshing={refreshing}
              cooldownSeconds={cooldownSeconds}
              configSlotWarning={configSlotState === 'missing' ? CONFIG_SLOT_WARNING : null}
              panelRef={panelRef}
              onRefresh={handleRefresh}
              onUseShown={handleUseShown}
              useShownDisabled={!config.writable}
              pluginsAction={popoverPluginsAction}
            />,
            document.body,
          )
        : null}
    </div>
  )
}
