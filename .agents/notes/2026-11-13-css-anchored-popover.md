# 决策：浮层定位改用 CSS 锚点，不再用 JS 钩子（2026-11-13）

状态：生效

**类型**：决策。

## 问题

宿主 `0.2.2-rc.2` 删掉了 `@deepseek-ai/dsh-client-ui-primitives` 的
`useAnchoredPosition` 值导出与 `AnchoredPositionOptions` 类型（宿主提交
「position floating panels with CSS anchors」）。本仓左下角条目因此**整块不渲染**：

- 浏览器 console：`TypeError: (0 , import_…useAnchoredPosition) is not a function`；
- 随后 `slot entry crashed in 'sidebar.footer.action'`，宿主按 list 槽规矩把这一格
  abdicate 退役，DOM 里只剩 `<div data-slot="sidebar.footer.action"><div data-slot-error=…></div></div>`；
- 插件本身装载正常（`phase=active`、`entry=present`），配置卡片也不受影响 —— 只有这一条挂了。

**声明面拦不住这件事**：`engines.dsh` 与全部 `@deepseek-ai/dsh-*` 的
`… || ^0.2.2-rc.1` 在 npm 预发布语义下**包含 `0.2.2-rc.2`**，所以
`check:declaration` 是绿的、`tsc` 是绿的、571 条测试也是绿的。**同一个 minor 的 rc 之间
可以有破坏性符号删除**，版本区间判不出来。

## 决策

浮层定位整体搬到 **CSS Anchor Positioning**：

- 触发区根节点（`SidebarBalance.module.css` 的 `.root`）写 `anchor-name: --dsb-balance-anchor`；
- 面板（`BalancePopover.module.css` 的 `.panel`）写 `position-anchor: --dsb-balance-anchor`，
  `bottom: calc(anchor(top) + 8px)` 向上展开、`left: clamp(12px, anchor(left), …)` 钳进视口 12px，
  高度上限走 `100dvh` 与 `position-try-fallbacks` 回退；
- **JS 不再读矩形、不再跟踪滚动与视口**；`useDismissOnOutsidePointer` 保留（rc.2 仍有，
  `panelRef` 继续服务外部点击判定）；
- 判据：`test/artifacts.test.ts` 断言**产物**里不出现 `useAnchoredPosition`；
  `test/redlines.test.ts` 的「浮层定位（CSS 锚点）」一组守住两侧锚点名必须同名、
  `bottom` 必须是那一条算式、`!important` 不得被删。

锚点名用**固定字面量**而不是运行期生成：这个槽只渲染一个实例，写进 CSS 才能让
「两侧指同一个名字」变成可断言的样式事实。改名必须同批改两个文件，漏一边的表现是
面板飘到视口左上角。

## 替代方案（强制）

- **vendored 一份 `useAnchoredPosition` 进本仓**：老宿主与 rc.2 通吃、改动最小，
  但有三个代价：① 与「引官方 token/token 一律裸引、不写回落值」的既有纪律方向相反；
  ② 宿主删它正是为了换 CSS 锚点，那份副本会变成永久死代码；③ 移动端与缩放场景的重算逻辑
  要自己长期维护。**否决**。
- **抬声明下限到 rc.2 并只支持新法**：代码与现在同形，但会一刀切断
  `^0.1.7-rc.1 / ^0.2.0-rc.1 / ^0.2.1-rc.1` 三条旧族 —— 那是本仓明确承诺过的兼容面，
  为一个 API 迁移付这个代价不值。**否决**（下限另行决定，见 AGENTS.md 的待办）。
- **继续用钩子 + 运行期探测（`typeof fn === 'function'`）**：rc.2 上退化成「浮层打不开」，
  比现在更糟的是它**静默** —— 按钮在、点了没反应。**否决**。

## 影响

- 浏览器需支持 `anchor-name` / `position-anchor` / `anchor()`。宿主自己已经这么要求
  （官方 `ui-model-selection` 同款），所以插件侧**不再增加**额外门槛。
- 首帧不再需要「隐藏等测量」（原 `MEASURE_STYLE`），浮层打开即定位，已真机确认无跳位。
- **一个既有冲突被暴露出来**：邻居插件 `dsh-console-plugin`（本机 0.5.73）在 `apply` 时
  往 `document.head` 注入 `#dsh-console-narrow-css`，里面有
  `@media (max-width: 520px) { [role=dialog] { width: 100vw !important; height: 100vh !important; … } }`
  —— 它命中的是**页面上每一个** `[role="dialog"]`，不是它自己的对话框。≤520px 宽时把我们的浮层
  撑成整屏（实测 480×800：`rect = [12, -297, 480, 800]`）。处置：选择器写成 `section.panel`
  （特异性 (0,1,1) 压过 `[role="dialog"]` 的 (0,1,0)）并给尺寸四条加 `!important`；
  **不换掉 `role="dialog"`** —— 那是读屏需要的语义，为躲别家样式表牺牲语义不值。
  这是**别家的缺陷**（它假定页面上只有自己一个 dialog）；上游修好后这四行可以退回裸声明。
- 教训一句话：**「声明面罩得住」不等于「符号存在」**。跨 rc 的符号删除只能靠产物级判据拦，
  所以 `test/artifacts.test.ts` 那条断言是本仓此后唯一能防住同型事故的东西。

## 参考

- 宿主迁移指南：`deepseek-harness` 树内 `docs/upgrade-guide/v0.2.2-alpha.2/css-anchored-menus/guide.zh.md`
  （只在 rc.2 的树里，本地检出是旧 tag，要 `git show <tag>:<路径>` 现读）
- 官方同款实现：`packages/client/ui-model-selection/src/client/ModelSelect.module.css`
- 姊妹仓同一轮的同型修复：`dsh-workbuddy-bridge` 的
  `.agents/notes/2026-11-13-popover-placement-css-anchors.md`
