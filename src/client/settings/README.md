# settings/ — 设置卡片手册

- 职责：把本插件的配置渲染成 Plugins 页里该 bundle 详情页上的一张卡片；四组配置各自可折叠，编辑先落本地草稿，保存是草稿变成设置的唯一出口。
- 变更影响路由：改字段名 → 同步宿主 schema [src/index.ts](../../index.ts) 的 `Config`；改对外可见行为 → 同步 [docs/UI-HANDOFF.md](../../../docs/UI-HANDOFF.md) 的设置小节、根 [README.md](../../../README.md) 与 [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)。
- 使用约束与工作偏好 → 见 [AGENTS.md](AGENTS.md)。
- 回根 → [../../../AGENTS.md](../../../AGENTS.md)（仓库根）；直接上层是 [../AGENTS.md](../AGENTS.md)（src/client 规则层）。

本文件按**符号名**引用代码，不写行号 —— 行号每改一次代码就会漂，符号名不会。

## 文件

### BalanceSettingsCard.tsx

- 职责：卡片本体。持有分组展开一份局部状态；把 `useConfigForm` 的状态翻译成 JSX。
- 关键导出：`BalanceSettingsCard`、`BalanceSettingsCardProps`，并转发 `ConfigFormOf`（对官方 `ConfigForm<Record<string, unknown>>` 的收窄别名）。
- 分组：连接 → 展示 → 阈值 → 刷新。这是 UI 的排列顺序（按使用频率）；宿主 `Config` 的字段顺序是 连接 → 刷新 → 展示 → 阈值，**两者有意不同**，见 [docs/ARCHITECTURE.md](../../../docs/ARCHITECTURE.md) 的关键决策。
- 连接组是**只读状态展示**（3.0）：两条途径各一行（`SourceRow`）—— API Key 与账号登录 ——
  配一个**真打上游**的测试按钮。这里从前是一列输入框（只读凭据框 + Base URL + 二级折叠里的引用名），
  全被删掉了：接口地址只服务官方（等于没有第二个取值）、密钥框根本不能填（跟随官方）、
  引用名 99% 的人不需要改。**二级「自定义设置」折叠连同它一起删了**，不要再加回来。
  理由与替代方案 → [决策记录](../../../.agents/notes/2026-10-15-drop-apikey-field.md)。
- **连接组默认展开**（`DEFAULT_GROUP_OPEN.connection = true`）：它是这张卡片的第一件事 ——
  用户点进来看的就是「现在通不通」，而它只有两行状态加一个按钮。其余三组默认收起。
- **一行只放三样东西，一个事实只说一遍**（2026-10-15 定的）：左侧**灯** · 行尾**右槽**（凭据身份）·
  第二行**来历**。状态徽章整套删了（与灯同义重复）；没有身份时右槽留空。
- **测试结果排在凭据身份左边、4 秒后自己消失**（`RESULT_TTL_MS`，成败都走）：
  身份不被顶掉（替换它会让那一格闪一下），也**不单开一行**（会顶高行高、还会永久留着）。
  成败**不用颜色**，也不用 `✓` / `✗` 字符 —— 用官方那对纯字形图标（对勾 / 叉）。
- 组内有非法草稿时该组强制展开（`groupOpenNow`），否则 footer 的「请检查标红的字段」会指向一个收起来的组。
- 被谁依赖：`src/client/index.tsx` 的 `SettingsSeatComponent`。
- 改后必测：四组各自展开与收起；暂存与保存；非法数字禁用保存；两条途径的状态行与那 4 秒的测试结果。

### BalanceSettingsCard.module.css

- 职责：表单外壳（一列控件 + 保存行）的样式；取值逐条对齐官方 `ui-settings-plugins/PluginConfigForm.module.css` 与 `fields.module.css`。
- 关键规则：`.form`（flex 列；**无外框、无圆角、无底色、无内边距**，控件直接铺在宿主的 `<section data-plugin-config>` 里）、`.readOnly`（`margin: 0 0 12px`）、`.footer`（`padding-top: 16px` + `gap: 8px`；**无 border-top**）、`.save`。
- **保存按钮不右推**：官方没有 `margin-left:auto`，只有失败提示靠 `flex:1` 把按钮顶到右边；没有失败提示时按钮就在左边。
- 字段之间的分隔线不归这里，归 [fields.module.css](fields.module.css) 的 `.fields > * + *`。
- 被谁依赖：`BalanceSettingsCard.tsx`。
- 改后必测：`.form` 上不出现 border / border-radius / background / padding；`.footer` 不出现 border-top 与 `justify-content`；中性实线边框保持 0.5px。
- 错误文本用 `var(--dsw-alias-state-error-primary)`；官方 `--dsw-alias-label-error` 从未定义。

### fields.tsx

- 职责：字段行的容器与全部控件，以及分组的折叠头与取数途径的状态行。
- 关键导出：`FieldGroup`、`FieldFrame`、`FieldBadges`、`TextControl`、`SelectorControl`、`ActionRow`、`SourceRow`，以及类型 `FieldStatus`、`SourceStatus`、`SourceLive`、`SelectorOption`。
- **`FieldGroup` 的折叠头是自绘的，不是原语 `DisclosureRow`**（2026-10-15 定的，**这与本目录
  2026-10-15 前的规则相反**）：原语在**展开**时无条件把组图标换成上箭头，而我们要的是
  「常态图标、悬浮才换箭头、展开收起都保持」。取值逐条照抄官方那份 CSS，由
  [redlines](../../../test/redlines.test.ts) 与**装好的**官方 CSS 逐值比对；
  无障碍面（`role="button"` / `tabIndex` / `aria-expanded` / Enter/Space）照原语保留。
  两个箭头是 `HEADER_CHEVRONS`，**都常驻 DOM**，靠 CSS 换（按 `open` 条件渲染会在悬浮时闪）。
- `SourceRow` 是**只读状态行**（不是表单字段），**一行三样**：左侧灯（或头像）· 名称 + 行尾**右槽**
  （凭据身份，还可临时被测试结果占用）· 第二行**来历**。
  灯逐值抄官方 `ui-settings-models` 的 `.credentialDot`（8×8、`corner-shape: round`）。
  它不接 `form`，没有草稿也没有撤销；右槽子项 `nowrap` + 省略号（换行就是行高跳一下）。
- 类名拼接统一用官方 `clsx`（平台样式规则要求），不自备工具函数。
- 被谁依赖：`BalanceSettingsCard.tsx`。
- 改后必测：数字字段仍是 `type="text"` + `inputMode="numeric"`；选择器仍是 pill + `Menu`；`FieldFrame` 在没有 hint 时不渲染说明行；折叠头常态是组图标、悬浮与键盘聚焦才是箭头。

### fields.module.css

- 职责：字段行、行容器、控件与提示的样式；**纵向节奏的唯一所有者**。
- 关键规则：`.group`（flex 列 + 顶部 12px；前四行是原语 `.root` 原本提供的那一层）、`.groupLast`（尾部 12px）、`.groupNote`（margin-top 4px）、`.fields > * + *`（字段间 0.5px 分隔线）、`.field`（padding 12px 0）、`.row`（整行选择型，padding 12px 0）、`.input`（h34 r8）、`.selector`（h36 r18）。
- **折叠头那六个类**（`.groupHead` / `.groupLeading` / `.groupIcon` / `.groupChevronClosed` / `.groupChevronOpen` / `.groupTitle`）
  取值**逐条照抄**官方 `ui-primitives/DisclosureRow.module.css`，由 [redlines](../../../test/redlines.test.ts) 与装好的官方 CSS 逐值比对。
  改任何一个数都得同步改那边。焦点环不自己画（宿主全局 `:focus-visible` 已经在画）。
- 状态行：`.source` / `.sourceHead` / `.dot*` / `.sourceName` / `.sourceSlot` / `.sourceIdentity` / `.sourceLive` / `.sourceDetail`。
  **右槽子项必须 `nowrap` + 省略号** —— 测试结果长短不一，换行就是行高跳一下。
- 被谁依赖：`fields.tsx`；`BalanceSettingsCard.tsx` 另用它的 `.field` 包住测试连接那一行。
- 改后必测：新增元素的纵向间距必须落在 12px 这一档；中性实线边框 0.5px、状态色边框 1px；控件圆角走 `--dsw-radius-*`（**裸引，不写回落** —— 声明的那条线上它们一定存在）、**不写** `corner-shape`（继承宿主全局 superellipse）；只有必须是真的圆才成对写 `50%` + `corner-shape: round`。

### source-status.ts

- 职责：**两条途径的展示判定** —— 灯色、右槽的凭据身份、第二行的来历。
- 关键导出：`keyStatusOf`、`accountStatusOf`、类型 `Translate`。
- **它是一份纯函数，位置是刻意的**：判定原先写在卡片组件里，而组件引 `ui-primitives`、
  测试环境渲不出来（CSS 解析不了，见 [vitest.config.ts](../../../vitest.config.ts)），
  于是那段最容易错的逻辑一行覆盖都没有。抽出来之后 [test/source-status.test.ts](../../../test/source-status.test.ts) 能直接断言。
- 三条设计约束（维护者 2026-10-15 定）就守在这里：① 一个事实不说两遍；
  ② 没有身份可报时右槽**留空**，不补「未配置」；③ 「本部署没有账号服务」例外，**必须说出来**。
- 被谁依赖：`BalanceSettingsCard.tsx`。
- 改后必测：三档来历（file / env / 认不出的来源）；未配置与未登录两个槽都空；服务缺席时说部署事实。

### use-sources.ts

- 职责：订阅两条取数途径的状态（`GET /api/v1/sources`），**一处读、一处判**。
- 关键导出：`useSources(enabled)` → `{ sources, loading, refresh }`。
- **判据住在后端**：这个 hook 只负责读与转发，不做任何分档判断 ——
  分档在 [../../services/sources-service.ts](../../services/sources-service.ts)（后端），
  由 [../../http/handlers.ts](../../http/handlers.ts) 的 `handleSources` 出线。
  它替换了从前那个四档判定模块 `use-credential-state.ts`（已删）。
- **三个读取时机**：挂载 · 窗口重新获得焦点 · 手动 `refresh()`（点测试按钮时顺带）。
  **不轮询**：凭据是低频变化的东西，卡片是低频界面。
  焦点那条正是「去官方模型页换了 key 再回来」的落点 —— 靠它就不必给客户端加 `remote` 依赖。
- **读失败不抛**：保持上一次的快照（首帧是保守快照），界面显示「未确认」而不是让卡片消失。
- 被谁依赖：`BalanceSettingsCard.tsx`。
- 改后必测：`enabled` 为假时不发请求；失败时不清空已有状态；见 [test/client-data.test.ts](../../../test/client-data.test.ts) 的形状守卫用例。

### AccountAvatar.tsx

- 职责：账号头像。规格逐值照官方 `ui-settings-account` 的 `AccountAvatar.module.css`
  与 `AccountSection.module.css` 的 `.avatar`（32×32、`50%` + `corner-shape: round`、
  `object-fit: cover`、底色 `--dsw-alias-bg-skeleton`），`referrerPolicy="no-referrer"`。
- **加载失败回落成空圆底**，不显示碎图；URL 变了（换账号）会清掉失败标记。
- **只在账号那行、且已登录时渲染**：API Key 没有身份可言，不给它画占位头像；
  未登录时那一行落回与 Key 同形的红灯（头像会让人以为「有账号」）。
- 被谁依赖：`BalanceSettingsCard.tsx`。

### use-config-form.ts

- 职责：字段规格表、草稿状态机、保存与读回判定。
- 关键导出：`useConfigForm`、`writeFieldValue`、`ConfigFormOf`、`CONFIG_FIELDS`、`SPEC_BY_FIELD`、`FieldState`、`ConfigFormState`、`ConfigFormApi`、`textField` / `numberField` / `selectField`、`currencyCodes`、`AUTO_CURRENCY`、`KNOWN_CURRENCIES`、`THRESHOLD_PAIRS`、`thresholdsOk`。
- **成对校验**：`thresholdsOk` 判「同一币种内告急 < 预警」，草稿为空时按**默认值**算（不是旧值），
  所以 `THRESHOLD_PAIRS` 里存了一份默认值 —— 两个半体不许值导入，这份抄写由 [test/threshold-pairs.test.ts](../../../test/threshold-pairs.test.ts) 对着宿主 schema 对账。
- **保存是一次原子提交**：`form.mutate(ops, revision)` 把全部字段放进同一道修订栅栏、一次宿主校验、一次落盘决定，
  所以**没有中间态**，成对字段的写入顺序不需要排。原先那个 `orderPairWrites` 因此退役（见接缝迁移的决策记录）。
- **失焦才提示**：`touch` / `touched` 记「哪些字段失焦过」，卡片据此决定要不要显示成对提示，避免打字中途闪一下。
  保存按钮不按这条走 —— 它看 `state.invalid`，有非法项立刻置灰。
- `CONFIG_FIELDS` 是字段清单的唯一来源：`SPEC_BY_FIELD` 由它派生，卡片渲染的每个字段都必须在这里登记。
- 被谁依赖：`BalanceSettingsCard.tsx`、`src/client/index.tsx`（`writeFieldValue` 供浮层「改用 X」）。
- 改后必测：字段名与宿主 `Config` 一一对应；`set` 返回值的透传（见下）；`probeFailure` 的两条失败规则。

## 对外事实

### ConfigForm 是最小依赖面

- 依赖面就是**官方的 `ctx.configForms.get(ENTRY_ID)`**，没有自家适配层：`getSnapshot()`、`subscribe(listener)`、
  `mutate(ops, revision)`、`set(field, value)`、`unset(field)`。
- 卡片只取快照里的四片：`value`（可为 `undefined`，首帧如此）、`user`、`writable`、`status === 'ready'`（收成 `available`）。
- **`available` 为假时卡片什么都不渲染**：与官方每张卡片一致（`ui-primitives` 的 `SettingsFormModel` 同样按 `status === 'ready'` 判）。
  空控件配一个能点的保存按钮，比不渲染更坏。
- 表单对象在 `apply` 期建一次、引用稳定，所以订阅回调与 `getSnapshot` 都不会每帧换新。
- 快照必须**引用稳定**地交给 `useSyncExternalStore`：`useConfigForm` 里那层缓存就是为它准备的（`asRecord(undefined)` 每次都造新对象）。

### 保存成败由返回值直接给出

- `set` / `unset` / `mutate` 返回 `Promise<boolean>`：**true = 宿主接受，false = 拒绝或整批跳过**（传输失败才 reject）。
- 所以「写完读回 user 层猜成败」那一套（原 `settle` / `landedWrite`）已经删掉 —— 判据更少，也更准。
- 保存是**一次 `mutate`**：草稿全量折成 ops 一起提交，接受就清草稿、拒绝就保留草稿并出 `role="status"` 提示。

### 纵向间距只有两个所有者

- `.group` 出顶部 12px，`.groupLast` 出尾部 12px。
- `.body` 的 `padding-bottom` 是 0，卡片 body 不再贡献纵向节奏。
- 只有卡片里的最后一组（刷新）带 `last`，由 `FieldGroup` 拼上 `.groupLast`。
- 12px 是块间距单位：组间距、字段上下边距、footer 分割线的上下距、按钮到卡片下缘的留白。4px 只用于组级说明贴标题。
- 效果：最后一组到 footer 分割线的距离，收起时等于组间距、展开时等于「末字段到下一组」的距离。

## 依赖面

- 运行时只 `require` `react`、`react/jsx-runtime` 与 `@deepseek-ai/dsh-client-ui-primitives`，其余全部内联。
- 用到的原语：`Button`、`Input`、`Menu`、`StateDot`（测试中的转圈）、`Tag`，以及
  `HEADER_CHEVRONS.closed` / `.open`（**折叠头的两个箭头，都常驻 DOM**）与 `SELECTOR_ICON` ——
  图标一律从 [../icons.ts](../icons.ts) 取，不在 JSX 里硬编码；尺寸走 `size` prop
  （但折叠头里那个由 CSS 覆盖，传不传都一样）。
- 颜色只走 `--dsw-alias-*` 语义令牌；主题信号只有 CSS 变量，不写 `prefers-color-scheme` 或 `[data-ds-dark-theme]`。
- 类名拼接用 `clsx`（devDependency，构建期内联）。