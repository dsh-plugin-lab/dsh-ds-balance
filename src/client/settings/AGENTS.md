# settings/ — 规则层

继承根规则，见 [../../../AGENTS.md](../../../AGENTS.md)（仓库根）；直接上层是 [../AGENTS.md](../AGENTS.md)（src/client 规则层）。

settings/ 特有约束：

- 卡片**只做配置与来源状态**：不许出现任何额度信息、金额、图表、快照列表或估算明细。
  （3.0 起加了「两条取数途径的只读状态」—— 那是**配置事实**，不是额度信息；
  测试结果**只回成败与延迟，绝不回余额预览**，虽然后端 `test-connection` 给得出。）
- 数值一律按字符串处理；阈值**只存不判**，界面不得依据阈值给任何东西上色 —— 颜色只由后端 `severity` 决定。
  - 唯一的读阈值处是圆环弧长（`../model.ts` 的 `ringRatioOf`），且只读 `warn`。
- 不许 import 官方 `ui-settings-plugins` 的内部构件（bundle-purity gate 会拒），只能照抄模式。
- 数字字段用 `type="text"` + `inputMode="numeric"`，不用 `type="number"`（[fields.tsx](fields.tsx) 的 `TextControl`）。
- 新增字段必须**同批改四处**，漏一处就漂：宿主 schema（[../../config.ts](../../config.ts) 的 `Config`）· `CONFIG_FIELDS`（[use-config-form.ts](use-config-form.ts)）· 两份词典（[../locales.ts](../locales.ts) 的 `en` / `zh`，键集必须逐字相同）· 根门面 [README.md](../../../README.md) / [README_zh.md](../../../README_zh.md) 里点名该字段的地方（两侧同改，红线钉着逐字一致）。
- **跨字段约束宿主侧已经拦不住**：登记用的 `ctx.settings.register` 连同它的 `validate` 选项一起被删，
  schemastery 也没有 refine 这类跨字段钩子，而官方文档承诺的 `.check()` 在实现里根本不存在。
  现在只剩两处：**消费侧** `../../config.ts` 的 `resolveThresholdPairs`（违规即回落默认值 + 一次 warn），
  与**我们自己的写路径**（`POST /api/v1/config` 在 mutate 之前先跑 `validateThresholds`，违反回 422）。
  前端这道只管体验（失焦提示 + 置灰保存），**判据不许另抄一份** —— 只有 [use-config-form.ts](use-config-form.ts) 的 `thresholdsOk`。
- **保存是原子的，所以没有写入顺序这回事**：一次 `form.mutate(ops, revision)` 提交全部草稿，
  共享一道修订栅栏与一次宿主校验。历史上那条「成对写入必须排序」（`orderPairWrites`）随逐字段写入一起退役，
  **不要再把它加回来** —— 它现在只会给出「这个约束还在被强制执行」的假信号。
- 纵向间距只有两个所有者：`.group` 的顶部 12px 与 `.groupLast` 的尾部 12px（[fields.module.css](fields.module.css)）；新加元素不许在旁边叠 margin。
- **分组折叠头是自绘的**（[fields.tsx](fields.tsx) 的 `FieldGroup`），**不要退回原语 `DisclosureRow`**。
  **本仓 2026-10-15 前的规则写的是相反的话，而且带着一句错的断言**（「常态图标、悬浮换箭头、展开收起都保持
  —— 这是原语自带的」）：原语在**展开**时无条件把图标换成上箭头
  （`DisclosureRow.tsx` 里 `const leading = open ? <IconChevronUpOutlineRegular/> : collapsedLeading`），
  它那个 `previewChevron` 只管**收起**那一支。于是组图标（「这是哪一组」唯一的视觉线索）
  恰恰在最需要它的展开态消失 —— 这就是自绘的原因。
  代价是那套取值得自己维护：**逐条照抄**官方 `ui-primitives/src/DisclosureRow.module.css`，
  由 [test/redlines.test.ts](../../../test/redlines.test.ts) 与**装好的**官方 CSS 逐值比对；
  无障碍面（`role="button"` / `tabIndex` / `aria-expanded` / Enter/Space）也照原语保留。
  图标只在 [../icons.ts](../icons.ts) 选，不在 JSX 里硬编码（两个箭头是 `HEADER_CHEVRONS`，**都常驻 DOM**，靠 CSS 换）。
- **连接组是只读状态展示**（3.0）：两条途径各一行（`SourceRow`），配一个**真打上游**的测试按钮。
  这里从前是一列输入框，全被删掉了 —— 理由见
  [决策记录](../../../.agents/notes/2026-10-15-drop-apikey-field.md)：
  接口地址只服务官方（等于没有第二个取值）、密钥框根本不能填（跟随官方）、
  引用名 99% 的人不需要改（默认即官方那个）。
  **二级「自定义设置」折叠连同它一起删了**，不要再加回来。
- **一行只放三样东西，且一个事实只说一遍**（维护者 2026-10-15 定的，别再退回四层平铺）：
  左侧**灯**（这条途径能不能用）· 行尾**右槽**（是哪一份凭据：掩码 key / 账号名）·
  第二行**来历**（从哪一层取到的 / 脱敏联系方式）。**没有状态徽章** ——
  「已配置密钥。」与左边那盏灯是同义重复，整套删了。
  没有身份可报时右槽**留空**，不补一句「未配置」；唯一的例外是「本部署没有账号服务」，
  那句必须说出来（整行空会被读成插件坏了）。
- **测试结果借右槽显示几秒**（`RESULT_TTL_MS`，成败都走），然后让位回凭据身份。
  **绝对不许单开一行**：那会把行高顶起来、还会永久留在屏幕上 —— 这两件事正是本轮否掉的。
  右槽的子项必须 `nowrap` + 省略号（结果长短不一，换行就是行高跳一下）。
  成败**不用颜色**（成败靠 ✓ / ✗ 与文字）。
- 凭据状态**判据住在后端**：[../../http/handlers.ts](../../http/handlers.ts) 的 `handleSources`
  （由 [../../services/sources-service.ts](../../services/sources-service.ts) 组装）。
  客户端这边只渲染，**不许在组件里另写一份分支** —— 判定在 [source-status.ts](source-status.ts)，
  它是纯函数（组件引 `ui-primitives`，测试环境渲不出来，所以判定不能留在组件里）。
- **掩码是首尾片段**（`sk-cf08d*****3b84`），形态与平台控制台 `platform.deepseek.com/api_keys` 一致；
  **完整密钥永不跨线**，后端解析出明文后立刻折成掩码再丢掉。
  星号个数固定 5 个 —— 真实长度本身也是信息。见 [../../domain/credential.ts](../../domain/credential.ts)。
  **账本标识（`tag8`）不上界面**：它回答不了用户的任何问题（掩码已经说明是哪把 key），
  留在 `GET /api/v1/sources` 与日志里当诊断出口。
- **读宿主新增字段必须先过形状守卫**：客户端半边由 HMR 立刻换新，宿主半边要重启才换。
  见 [../data.ts](../data.ts) 的 `readKeySource` / `readAccountSource`。
- 错误文本用 `var(--dsw-alias-state-error-primary)`；官方 `--dsw-alias-label-error` 从未定义，照抄会静默失效。
- 选择器触发 pill 没有公共组件，取值照抄 `packages/client/locale/src/client/LanguageRow.module.css:28-51`。
- `set` / `unset` / `mutate` 的返回值不许丢弃：它就是**宿主是否接受**（`Promise<boolean>`），
  判成败只能用它 —— 不要再去读回 `user` 层猜（那条路已经删了）。
- **`available` 为假时卡片什么都不渲染**：宿主没在服务这个命名空间时，空控件比不渲染更坏。
- 组件拿不到 `ctx`：数据只能走 props，或用注册项的 `inject` 工厂（见 [../index.tsx](../index.tsx)）。
- 文案一律走词典，键集真源是 [../locales.ts](../locales.ts)；组件里不写死字符串。
- **字段说明只回答「为什么关心」**：一句、一行，不重复标签和分组说明已经说过的信息（[../locales.ts](../locales.ts) 的 `settings.hint.*`）。空话（「请填写兼容的地址」）不算说明。
- 相对导入保留 `.ts` / `.tsx` 后缀。
