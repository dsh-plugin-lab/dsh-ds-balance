/**
 * 锚点定位（本地实现，替代宿主已移除的 `useAnchoredPosition`）。
 *
 * 背景：DSH 0.2.2-rc.2 从 `@deepseek-ai/dsh-client-ui-primitives` 的公开导出里删掉了
 * `useAnchoredPosition`（同一批改动换的是宿主自己的浮层定位接口）。插件这边一调用就是
 * `TypeError: useAnchoredPosition is not a function`，React 把整个 slot entry 判为崩溃，
 * 侧栏那一行直接不显示（控制台只有 `slot entry crashed in 'sidebar.footer.action'`）。
 *
 * 契约保持不变：入参 `{ open, anchorRef, panelRef, side, gap, margin }`，返回**直接可用的
 * `CSSProperties`**（`position: fixed`），首帧返回 `null`，调用方继续用 `MEASURE_STYLE`
 * （`visibility: hidden`）把浮层量一次尺寸。
 *
 * 与旧的官方实现对齐的三点：向上展开时按锚点顶边减面板高度；横向以锚点为中心再钳进视口；
 * 打开期间在 scroll（capture，覆盖嵌套滚动容器）、resize 与面板自身尺寸变化时重算。
 * @module dsh-ds-balance/client/sidebar/use-anchored-position
 */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

export interface AnchoredPositionOptions {
  /** 浮层是否打开；关着时返回 `null`，不再计算。 */
  open: boolean
  /** 锚点元素：浮层按它的盒子定位。 */
  anchorRef: RefObject<HTMLElement | null>
  /** 浮层自身：量宽度与高度；首帧尚未挂载时为 `null`，按 0 处理。 */
  panelRef: RefObject<HTMLElement | null>
  /** 展开方向，默认向上。 */
  side?: 'top' | 'bottom'
  /** 浮层与锚点之间的间距。 */
  gap?: number
  /** 浮层与视口边缘的最小距离。 */
  margin?: number
}

/** 没有 rAF 的环境（部分测试宿主）退回定时器，行为一致。 */
const requestFrame = (callback: () => void): number =>
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(callback, 16)

const cancelFrame = (handle: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(handle)
  else window.clearTimeout(handle)
}

/** 量锚点、按 `side` / `gap` 偏移、钳进视口；见模块头注释。 */
export function useAnchoredPosition({
  open,
  anchorRef,
  panelRef,
  side = 'top',
  gap = 8,
  margin = 12,
}: AnchoredPositionOptions): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }

    let frame = 0
    const place = (): void => {
      const anchor = anchorRef.current
      if (anchor === null) return

      const anchorRect = anchor.getBoundingClientRect()
      const panel = panelRef.current
      const panelRect = panel === null ? { width: 0, height: 0 } : panel.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      const width = Math.min(panelRect.width, viewportWidth - margin * 2)
      const left = Math.max(
        margin,
        Math.min(
          anchorRect.left + anchorRect.width / 2 - width / 2,
          viewportWidth - width - margin,
        ),
      )
      const top = Math.max(
        margin,
        Math.min(
          side === 'bottom' ? anchorRect.bottom + gap : anchorRect.top - gap - panelRect.height,
          viewportHeight - panelRect.height - margin,
        ),
      )

      setStyle((previous) =>
        previous !== null &&
        previous.left === left &&
        previous.top === top &&
        previous.width === (width || undefined)
          ? previous
          : { position: 'fixed', left, top, width: width || undefined, margin: 0 },
      )
    }

    place()
    frame = requestFrame(place)

    const observer =
      typeof ResizeObserver === 'undefined' || panelRef.current === null
        ? null
        : new ResizeObserver(place)
    observer?.observe(panelRef.current as Element)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)

    return () => {
      cancelFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, panelRef, side, gap, margin])

  return style
}
