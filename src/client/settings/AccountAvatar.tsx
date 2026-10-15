/**
 * 账号头像。
 *
 * 规格逐值照官方 `ui-settings-account/AccountAvatar.module.css` 与
 * `AccountSection.module.css` 的 `.avatar`：32×32、`border-radius: 50%`、
 * `corner-shape: round`（**必须是真的圆**，不能继承宿主的 superellipse）、
 * `object-fit: cover`、底色 `--dsw-alias-bg-skeleton`。
 *
 * `referrerPolicy="no-referrer"` 与官方一致：头像 URL 由 Platform 给出，
 * 请求它时不该把本页地址带出去。
 *
 * **加载失败回落成空圆底**，不显示碎图 —— 头像缺失是常态（平台可以没配），
 * 而一个破图图标比一个安静的圆底难看得多。失败后**不再重试**（同一个 URL 重试也是失败）。
 * @module dsh-ds-balance/client/settings/AccountAvatar
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import css from './AccountAvatar.module.css'

/** 属性。 */
export interface AccountAvatarProps {
  /** 头像 URL；`null` 表示平台没给头像。 */
  url: string | null
}

/**
 * 渲染账号头像。
 * @param props - 头像 URL。
 * @returns 头像元素；没有 URL 或加载失败时是一个空圆底。
 */
export function AccountAvatar({ url }: AccountAvatarProps): ReactNode {
  const [failed, setFailed] = useState(false)
  // URL 换了（换账号）就把失败标记清掉，否则新账号的头像会被上一次的失败挡住。
  useEffect(() => {
    setFailed(false)
  }, [url])

  return (
    <span className={css.avatar}>
      {url === null || failed ? null : (
        <img
          className={css.image}
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => {
            setFailed(true)
          }}
        />
      )}
    </span>
  )
}
