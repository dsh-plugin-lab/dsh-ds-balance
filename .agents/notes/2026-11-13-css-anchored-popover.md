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
- **`anchor()` 不能进 `max-height`**（Chromium 实测：写进去整条声明被算成 `none`，
  只有 `anchor-size()` 在那里有效）。所以高度上限走 `100dvh`，
  「面板比触发行以上空间还高」这种极端情形交给 `position-try-fallbacks` 回退
  （官方 `stat-dialog` 的 `--dsh-stat-window` 是同一手法）。
- **材质层不能在滚动容器里**：`.panel::before` 是 `position: absolute; inset: 0`，
  放进滚动容器就会跟着内容滚走，滚动后下半截没有填充也没有磨砂（实测）。
  所以面板自己不滚，滚动落在内部的 `<section class="body">` 上 —— 官方 `Menu` 同一结构
  （卡片不滚、内部 `.viewport` 滚）。
- 首帧不再需要「隐藏等测量」（原 `MEASURE_STYLE`），浮层打开即定位，已真机确认无跳位。
- **一个既有冲突被暴露出来**：profile 里另装的一个第三方插件会在 `apply` 时往 `document.head`
  注入一张 `@media (max-width: 520px)` 的「手机版」样式表，**它用的选择器是全局的
  `[role="dialog"]` 与 `[role="dialog"] > div`，不是它自己的对话框**。`role="dialog"` 是无障碍
  语义，凡是能被读屏识别的第三方弹层都会用它 —— 于是那条规则命中的是页面上的每一个对话框。
  **怎么认出它**：在 DevTools 里逐个 `<style data-plugin=…>` 找「带 `@media (max-width: 520px)`
  且选择器写着 `[role="dialog"]`」的那张；判据是**选择器形状**，不是插件名。
  逐条处置：

  | 那张样式表写了什么 | 后果（实测） | 我们的处置 |
  |---|---|---|
  | `[role="dialog"] { width:100vw !important; height:100vh !important; max-*: none !important; padding:0 !important; border-radius:0 !important }` | 480×800 下浮层被撑成整屏、锚点定位整块顶出视口（`rect = [12, -297, 480, 800]`） | 选择器抬到 `section.panel`（(0,1,1) 压过 (0,1,0)）＋ 尺寸 / `padding` / `border-radius` 自己带 `!important` |
  | `[role="dialog"] > div { overflow:hidden !important; … }`、`> div:last-child { overflow-y:auto !important }` | 滚动容器 `.body` 变成 `overflow:hidden`、`.footer` 被迫自己去滚 | 滚动容器用 **`<section class="body">` 而不是 `<div>`** —— 后代选择器一条都落不到它身上（改结构的代价比再打一轮 `!important` 战争小） |
  | 同一条媒体查询里的抽屉：`div[class*="_sidebarCol"] { position: fixed; z-index: 1310 !important }` | ≤520px 下侧栏抽屉（宿主原本只是 `z-index: 71`）**盖住**我们 `z-index: 1100` 的浮层 —— 几何正确但看不见 | **不处置**：1100 是官方浮层那一档（宿主 `stat-dialog` / `Menu.portal` 同值），为一个邻居的抽屉抬到更高会连带压过宿主的其它浮层 |

  **不换掉 `role="dialog"`**：那是读屏需要的语义，为躲别家样式表牺牲语义不值。
  那张样式表把选择器收窄回它自己的对话框之后，上面那些 `!important` 与 `<section>` 都可以
  退回裸声明与 `<div>`（红线钉着现在的形状，改回时要同批改那条断言）。
  **这一条是别家的缺陷，不是本仓的**：已按「全局 `[role="dialog"]` 选择器会命中别人的对话框」
  向那个插件的仓库报了一条 issue（2026-11-13，本轮）。**仓内不记对方的名字与地址** ——
  它会换、也不是我们的依赖；认识它靠上面那条「怎么认出它」的选择器判据。
- 宿主的 `useAnchoredPosition` 在本仓 devDeps 那一档**还在**（装的是更早的 rc），
  所以 `tsc` 与全量测试都看不见这次删除 —— 这也是为什么判据只能盯**产物**。
  devDeps 与在跑宿主之间的这条错位本身是既有活跃坑（见根 `AGENTS.md` 的「活跃坑」），
  抬 devDeps 要连同 `engines.dsh` 一起决定，不在本次改动范围内。
- 教训一句话：**「声明面罩得住」不等于「符号存在」**。跨 rc 的符号删除只能靠产物级判据拦，
  所以 `test/artifacts.test.ts` 那条断言是本仓此后唯一能防住同型事故的东西。

## 参考

- 宿主迁移指南：`deepseek-harness` 树内 `docs/upgrade-guide/v0.2.2-alpha.2/css-anchored-menus/guide.zh.md`
  （只在 rc.2 的树里，本地检出是旧 tag，要 `git show <tag>:<路径>` 现读）
- 官方同款实现：`packages/client/ui-model-selection/src/client/ModelSelect.module.css`
- 姊妹仓同一轮的同型修复：`dsh-workbuddy-bridge` 的
  `.agents/notes/2026-11-13-popover-placement-css-anchors.md`
