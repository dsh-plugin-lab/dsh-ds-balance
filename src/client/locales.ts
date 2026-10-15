/**
 * 本地化词典。`zh` 是键集真源，`en` 用 `Record<LocaleKey, string>` 做编译期完整性检查。
 * @module dsh-ds-balance/client/locales
 */

/** 词典命名空间，必须与 slot 注册项的 `locale` 字段一致。 */
export const NS = 'ds-balance'

/** 中文词典（键集真源）。 */
export const zh = {
  'sidebar.label': 'DeepSeek 余额',
  'sidebar.aria.ring': 'DeepSeek 余额状态',
  'sidebar.aria.refresh': '刷新余额',
  'sidebar.aria.mismatch': '显示的币种与你选择的不一致',

  'popover.title': '账户余额',
  // 来源标签：跟着数据来源走。**括号属于词典** —— 中文全角、英文半角带前置空格，
  // 代码里只做拼接，绝不写死括号字符。
  'popover.source.key': '（API Key）',
  'popover.source.account': '（账号登录）',
  // 有身份时用它替掉上面那两句：括号里直接放「哪一把凭据」。括号照旧在词典里
  // （中文全角、英文半角带前置空格），`{identity}` 由 interpolate 填。
  'popover.source.identity': '（{identity}）',
  'popover.total': '余额',
  'popover.granted': '赠送',
  'popover.toppedUp': '充值',
  'popover.updated': '{value}前',
  'popover.updated.justNow': '刚刚更新',
  'popover.refreshing': '刷新中',
  'popover.cooldown': '{value} 秒后可再次刷新',
  'popover.mismatch': '未找到 {wanted} 余额，当前显示 {shown}',
  'popover.action.useShown': '改用 {shown}',
  // 右上角图标的两档措辞。落点由**宿主能力**决定（跨插件深链服务在不在），
  // 措辞就跟着落点分档：一句含糊的话盖不住两种落点。见 BalancePopover 的 PluginsAction。
  'popover.action.openPlugins': '打开插件页',
  'popover.action.openPluginConfig': '打开插件配置页',

  // 处境文案：**一个处境一句**，环 / 悬停 / 浮层都从这里取。
  // 键名前缀是 situation 而不是 state：后者是契约字段名，而「处境」是界面概念
  // （一个处境可能吃掉多个 state + severity + error 的组合）。
  //
  // **措辞是给用户看的，不是给开发者看的**。这七句会出现在两处，都必须能**单独读懂**：
  // - **悬停气泡**（收起态与展开态同一份，见 `client/situation.ts` 的 `hoverTextOf`）：
  //   数字**可信**时气泡显示金额本身（只有 `ok` / `low` / `critical` 三个处境，
  //   它们的 `textKey` 是 `null`）；其余八个处境显示下面这些句子 —— 包括
  //   `stale` 与 `account-unavailable`，它们**手里有数字也显文案**；
  // - 浮层与读屏的 `aria-label`。
  //
  // 所以每一句都要能单独回答「**这一格现在怎么了**」：
  //
  // - 不写「插件内部错误」：用户不知道也不关心是哪个组件坏了，他要的是「现在拿不到」。
  //   改「服务异常」—— 说的是同一件事，但主语是这个功能，不是我们的代码。
  // - `unavailable` 刻意**不带「暂时」**。它接住的是 `fetch-failed` 那一整片错误码，
  //   里面既有等一等就好的（网络 / 超时 / 429 / 5xx），也有**等不好的**：
  //   `UPSTREAM_401`（key 失效）与 `UPSTREAM_402`（欠费）。对后者说「暂时」是假话，
  //   而且是有害的假话 —— 用户该去改凭据、去充值，不是在原地等。
  //   宁可少说一层时间性，也不能说反。
  'situation.checking': '正在获取',
  'situation.unavailable': '读不到余额',
  'situation.internalError': '服务异常',
  'situation.noCredential': '尚未配置凭据',
  'situation.accountUnavailable': '账户不可用',
  'situation.stale': '数据已过期',
  'situation.emptyWallet': '暂无余额',

  'settings.group.connection': '连接',
  'settings.group.refresh': '刷新',
  'settings.group.display': '展示',
  'settings.group.thresholds': '阈值',
  'settings.field.serverRefreshSeconds': '服务端刷新频率（秒）',
  'settings.field.clientPollSeconds': '客户端轮询频率（秒）',
  'settings.field.manualRefreshCooldownSeconds': '手动刷新冷却（秒）',
  'settings.field.displayCurrency': '显示币种',
  'settings.field.cnyWarn': 'CNY 预警',
  'settings.field.cnyCritical': 'CNY 告急',
  'settings.field.usdWarn': 'USD 预警',
  'settings.field.usdCritical': 'USD 告急',

  // ── 「连接」组：两条取数途径的只读状态 ──────────────────────────
  // 措辞逐条对齐官方：账号那几句取自 ui-settings-account 的 signedIn / signedOut /
  // profileUnavailable；密钥那几句取自 ui-settings-models 的 apiKeySet / apiKeyUnset。
  // 官方那套词在 settings.account / settings.models 命名空间，别的插件拿不到，所以抄进来。
  //
  // **3.0 起这一段只剩两句话**：组级说明 + 每行第二行的「来历」。
  // 状态徽章（已配置密钥。/ 未配置密钥。…）整套删了 —— 它与左边那盏灯说同一件事，
  // 而「一个事实说两遍」正是本轮要消掉的东西。判据见 source-status.ts。
  'settings.sources.title': '取数途径',
  'settings.sources.key': 'API Key',
  'settings.sources.account': '账号登录',
  // 组级说明：一句替掉原来每行各一句的近义说明。
  'settings.sources.groupNote':
    '两条途径都跟随官方：密钥用官方模型页配好的那一份，账号用宿主已登录的那个。本插件不自己保存凭据。',
  // 第二行的「来历」：这把凭据是从哪一层取到的。取值来自官方 describe() 的 source。
  'settings.sources.sourceSaved': '取自官方模型页保存的凭据',
  'settings.sources.sourceEnv': '取自启动环境变量 {name}',
  'settings.sources.sourceUnknown': '来源未确认',
  // 账号那条唯一需要说出来的一句：那是**部署事实**，用户做什么都没用；
  // 而整行留空会被读成「插件坏了」。未登录不说 —— 它是正常状态。
  'settings.sources.accountNoService': '本部署没有账号服务，这条途径不可用。',
  // 测试。结果借每行右槽显示 4 秒（排在凭据身份**左边**，所以身份不会被顶掉），
  // 所以文案要短。成败由**官方那对圆圈图标**表达（check-circle / close-circle），
  // 不用 `✓` / `✗` 字符：字符的基线、字重、间距都跟着字体走，与旁边那行等宽掩码并排会歪。
  'settings.test': '测试',
  'settings.testing': '正在测试…',
  'settings.test.ok': '{ms}ms',
  'settings.test.noKey': '没有可用凭据',
  'settings.test.notSignedIn': '尚未登录',
  'settings.test.fail': '连接失败：{message}',

  'settings.hint.displayCurrency': '所选币种不存在时，回落到账户实际持有的币种。',
  'settings.hint.threshold': '后端判定；界面颜色跟随返回的严重度。',
  'settings.hint.thresholdPair': '告急值必须低于预警值',
  'settings.hint.serverRefreshSeconds': '访问官方接口的间隔。',
  'settings.hint.clientPollSeconds': '刷新显示的间隔；正常时只读缓存，读不到时才访问上游。',
  'settings.hint.manualRefreshCooldownSeconds': '两次手动刷新之间的最短间隔。',
  'settings.currency.auto': '自动（跟随账户）',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.failed': '保存失败，请重试。',
  'settings.readOnly': '当前配置只读，无法保存修改。',
  'settings.unsaved': '未保存',
  'settings.invalid': '请检查标红的字段。',
  'settings.configured': '已配置',
  'settings.notConfigured': '未配置',
  'settings.overridden': '已覆盖',
  'settings.reset': '重置',
  'settings.invalidNumber': '请填数字；留空表示使用默认值。',
  'settings.hint.refreshAdvanced': '不常改：默认值适用于大多数情况。',
  // 这里曾有一条 'settings.summary'（该行 Configure 子页的说明行）。回退到
  // plugins.bundle.config 之后没有任何渲染路径会问 summary 档，于是连同它一起删了 ——
  // 详见 src/client/index.tsx 的 SettingsSeat。
  // 本轮又删掉四条**孤儿键**（词典里有、全仓没人引用）：`sidebar.aria.balance`
  // （与 sidebar.label 逐字相同，rail 的 aria 走 aria.ring）、`settings.hint.apiKey`
  // （那一行用的是 settings.hint.credential）、`settings.hint.number`
  // （真正用的是 settings.invalidNumber，两者文案原本就重复）、
  // `settings.currencyMismatch`（出到屏幕的是 popover.mismatch）。
} as const

/** 词典键。 */
export type LocaleKey = keyof typeof zh

/** 英文词典。缺键会在编译期报错。 */
export const en: Record<LocaleKey, string> = {
  'sidebar.label': 'DeepSeek balance',
  'sidebar.aria.ring': 'DeepSeek balance status',
  'sidebar.aria.refresh': 'Refresh balance',
  'sidebar.aria.mismatch': 'Shown currency differs from your selection',

  'popover.title': 'Account balance',
  'popover.source.key': ' (API key)',
  'popover.source.account': ' (account sign-in)',
  'popover.source.identity': ' ({identity})',
  'popover.total': 'Balance',
  'popover.granted': 'Granted',
  'popover.toppedUp': 'Topped up',
  'popover.updated': '{value} ago',
  'popover.updated.justNow': 'Updated just now',
  'popover.refreshing': 'Refreshing',
  'popover.cooldown': 'Refresh available in {value}s',
  'popover.mismatch': 'No {wanted} balance found; showing {shown}',
  'popover.action.useShown': 'Use {shown}',
  'popover.action.openPlugins': 'Open the Plugins page',
  'popover.action.openPluginConfig': 'Open the plugin configuration page',

  // 与 zh 逐条对应，理由写在 zh 那一段。
  // `unavailable` 同样**不带 Temporarily**：它接住 401（key 失效）/ 402（欠费）这类
  // 「等不好」的错误，说「暂时」会把人劝去干等。
  'situation.checking': 'Loading',
  'situation.unavailable': 'Balance unavailable',
  'situation.internalError': 'Service error',
  'situation.noCredential': 'No credential configured',
  'situation.accountUnavailable': 'Account unavailable',
  'situation.stale': 'Data is stale',
  'situation.emptyWallet': 'No balance',

  'settings.group.connection': 'Connection',
  'settings.group.refresh': 'Refresh',
  'settings.group.display': 'Display',
  'settings.group.thresholds': 'Thresholds',
  'settings.field.serverRefreshSeconds': 'Server refresh (seconds)',
  'settings.field.clientPollSeconds': 'Client poll (seconds)',
  'settings.field.manualRefreshCooldownSeconds': 'Manual refresh cooldown (seconds)',
  'settings.field.displayCurrency': 'Display currency',
  'settings.field.cnyWarn': 'CNY warning',
  'settings.field.cnyCritical': 'CNY critical',
  'settings.field.usdWarn': 'USD warning',
  'settings.field.usdCritical': 'USD critical',

  // 与 zh 逐条对应，理由写在 zh 那一段。
  'settings.sources.title': 'Balance sources',
  'settings.sources.key': 'API key',
  'settings.sources.account': 'Account sign-in',
  'settings.sources.groupNote':
    'Both sources follow the official setup: the key comes from the official Models page, the account is the one signed in to the host. This plugin stores no credential of its own.',
  'settings.sources.sourceSaved': 'From the credential saved on the Models page',
  'settings.sources.sourceEnv': 'From the launch env var {name}',
  'settings.sources.sourceUnknown': 'Source unconfirmed',
  'settings.sources.accountNoService':
    'This deployment ships no account service, so this source is unavailable.',
  'settings.test': 'Test',
  'settings.testing': 'Testing…',
  'settings.test.ok': '{ms}ms',
  'settings.test.noKey': 'No credential available',
  'settings.test.notSignedIn': 'Not signed in',
  'settings.test.fail': 'Connection failed: {message}',

  'settings.hint.displayCurrency': 'Falls back to a currency the account actually holds.',
  'settings.hint.threshold': 'Decided on the server; the UI colour follows the returned severity.',
  'settings.hint.thresholdPair': 'Critical must be lower than warning',
  'settings.hint.serverRefreshSeconds': 'How often the official API is called.',
  'settings.hint.clientPollSeconds': 'How often the display refreshes; cache-only while healthy.',
  'settings.hint.manualRefreshCooldownSeconds': 'Minimum gap between two manual refreshes.',
  'settings.currency.auto': 'Automatic (follow account)',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.failed': 'Saving failed. Try again.',
  'settings.readOnly': 'This configuration is read-only.',
  'settings.unsaved': 'Unsaved',
  'settings.invalid': 'Check the highlighted fields.',
  'settings.configured': 'Configured',
  'settings.notConfigured': 'Not configured',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Reset',
  'settings.invalidNumber': 'Enter a number; leave empty to use the default.',
  'settings.hint.refreshAdvanced': 'Rarely changed: the defaults suit most setups.',
  // 与 zh 同批删掉四条孤儿键，以及 `dev.*`（见 zh 那段末尾的说明）。
}

/** 取词典。未知语言回落英文。 */
export function dictionaryFor(language: string): Record<LocaleKey, string> {
  return language.toLowerCase().startsWith('zh') ? zh : en
}

/** 极简插值：把 `{name}` 替换成实参。 */
export function interpolate(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? params[name] : whole,
  )
}
