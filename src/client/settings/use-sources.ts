/**
 * 「连接」组的状态：**一处读、一处判**。
 *
 * 它替换了从前散在三处的逻辑：
 * - `use-credential-state.ts` 的 `useEffect([ref])`（只在引用名变时重读）；
 * - `BalanceSettingsCard.tsx` 的 `CREDENTIAL_BADGE` 四档映射；
 * - `data.ts` 里那份形状守卫。
 *
 * **判据现在住在后端**（`GET /api/v1/sources`）：只有后端同时持有 `credentials` 与
 * `deepseekAccount` 两个接缝，也只有它能订阅凭据变更事件。界面这边只做两件事 ——
 * 读、渲染。
 *
 * **读取时机有三个，覆盖全部真实流程**：
 * 1. 挂载（打开 Plugins 页）；
 * 2. 窗口重新获得焦点 —— 用户去官方模型页存了 key 再切回来，走的就是这条；
 * 3. 手动 `refresh()`（点 **Test** 按钮时顺带）。
 *
 * 不轮询：凭据是低频变化的东西，而卡片是低频界面，轮询只是白烧请求。
 * @module dsh-ds-balance/client/settings/use-sources
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { requestSources, unknownSources, type SourcesResponse } from '../data.ts'

/** 这个 hook 交出去的面。 */
export interface SourcesApi {
  /** 当前状态；首帧是保守快照（两条途径都「未确认」）。 */
  readonly sources: SourcesResponse
  /** 是否正在读。 */
  readonly loading: boolean
  /** 强制重读一次（绕过后端缓存）。 */
  refresh: () => Promise<void>
}

/**
 * 订阅两条取数途径的状态。
 *
 * @param enabled - 卡片可不可见。宿主没在服务这个命名空间时卡片什么都不渲染，
 *   那时**不该**发请求 —— 所以由调用方把 `available` 传进来。
 * @returns 状态与重读入口。
 */
export function useSources(enabled: boolean): SourcesApi {
  const [sources, setSources] = useState<SourcesResponse>(unknownSources)
  const [loading, setLoading] = useState(false)
  /** 组件卸载后不再 setState（切页很快，这一层必须有）。 */
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  /**
   * 读一次。
   *
   * 失败**不抛给调用方**：读不到状态时界面显示「未确认」，不是把卡片打挂。
   * 所以这里吞掉异常，只保留上一次的快照（首帧则是保守快照）。
   */
  const load = useCallback(async (force: boolean): Promise<void> => {
    setLoading(true)
    try {
      const next = await requestSources(force ? { refresh: true } : {})
      if (aliveRef.current) setSources(next)
    } catch {
      // 端点不可达：保持现状。**不写保守快照** —— 那会把已经读到的真实状态擦掉。
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [])

  // 挂载读一次；`enabled` 一变（宿主服务到位）也重读。
  useEffect(() => {
    if (!enabled) return
    void load(false)
  }, [enabled, load])

  /**
   * 窗口重新获得焦点时重读。
   *
   * **这是「去官方模型页换了 key 再回来」那条路径的落点**：卡片开着时唯一能改凭据的
   * 地方是另一个页面，所以一离开再回来必然触发 focus。靠它就不必订阅客户端事件，
   * 也就不必给客户端新增 `remote` 依赖。
   */
  useEffect(() => {
    if (!enabled) return
    const onFocus = (): void => {
      void load(true)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
    }
  }, [enabled, load])

  const refresh = useCallback(async (): Promise<void> => {
    await load(true)
  }, [load])

  return { sources, loading, refresh }
}
