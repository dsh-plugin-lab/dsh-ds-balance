#!/usr/bin/env node
/**
 * 声明面检查：只读 `package.json` 的声明区间 + 问 npm，回答「我们声明的范围还罩不罩得住」。
 *
 * 判据：**声明的区间必须能覆盖我们告诉用户去装的那条线**（README 的「版本兼容」章节点名的那条
 * dist-tag 线，本文件用 TRACKED_LINE 记着）。覆盖不到就是红。
 *
 * 除了受管面（`@deepseek-ai/dsh-*`），本脚本还判一条**共用依赖**：本仓钉成精确版的那个包，
 * 必须仍落在宿主声明的那一份里 —— 见 SHARED_PINS。它不在受管面内，主判据看不见它；
 * 而它一旦错位就是「装出两份、类型互不兼容」，报错信息只指着两份 `.pnpm/<包>@<版本>`，
 * 不指着该改哪一行。判在这里，红的时候就能直接说出该把它改成什么。
 *
 * 为什么单独成一步：它只读文件与 registry，几十秒出结果；与「换到那条线上还构不构得出来」
 * 是两件事，混在一起会互相遮蔽。所以本脚本**不装任何依赖**，只问 npm。
 *
 * 为什么要问 npm 而不是自己算：区间是否成立的权威是 npm 自己的 semver 实现，
 * 尤其是预发布段的规则 —— 一个 caret 区间罩得住同一个 major.minor.patch 里的预发布版本，
 * 却罩不住下一个补丁位的预发布版本。自己写一套等于制造假绿。
 * 问法是 `npm view <pkg>@<range> version --json`：它回的是该区间**全部**匹配版本，
 * 于是「那条线的版本在不在列表里」就是精确判定。
 *
 * 用法：
 *   node scripts/check-declaration.mjs                 # 用 TRACKED_LINE
 *   node scripts/check-declaration.mjs --line next     # 换一条线判
 *
 * 退出码：0 = 声明罩得住 / 1 = 有罩不住的 / 2 = 用法或前置条件缺失（网络、npm 找不到）
 *
 * 输出全英文、前缀 [INFO] / [WARN] / [NOTE]（见 SPEC 的硬约束）。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 我们告诉用户去装的那条 dist-tag 线。README 的「版本兼容」章节与它对齐。
 * 这是一条**线名**不是版本号 —— 会漂的是版本，现查即可，所以不写在这里。
 *
 * **2026-10-01 从 `alpha` 换到 `next`**：`next` 就是 RC 线（npm 上**没有 `rc` 这个 tag**，
 * RC 版本全挂在 `next` 上）。换线的连带面见 `.agents/notes/2026-10-01-track-rc-line.md`。
 */
export const TRACKED_LINE = 'next'

/**
 * 巡检要判的**全部目标线**：声明面承诺了哪几族，这里就得判哪几族。
 *
 * 为什么不是只判一条：声明面是**四族并集**（0.1.7-rc / 0.2.0-rc / 0.2.1-rc / 0.2.2-rc），
 * 只判其中一条等于「声明了却没验」—— 另外两族烂掉也没有任何判据会红，
 * 那正是姊妹仓 2026-10-19 修掉的「假绿」同类问题。
 *
 * 前一条是 dist-tag（`next` 指向当前承诺线）；后两条用**版本前缀**定位族 ——
 * 实测没有任何 dist-tag 指向 0.1.7-rc / 0.2.0-rc（现查 `npm view <包> dist-tags`）。
 *
 * @type {{ line: string, kind: 'tag' | 'prefix' }[]}
 */
export const TRACKED_LINES = [{ line: 'next', kind: 'tag' }]

/** 声明面里的宿主本体：`engines.dsh` 描述的就是它。 */
const HOST_PACKAGE = '@deepseek-ai/dsh'

/** 受管的平台包前缀；与 compat-swap.mjs 同一条边界。 */
const MANAGED_PREFIX = '@deepseek-ai/dsh-'

/** 声明区间可能出现的位置。 */
const MANIFEST_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies']

/** 用于上下文对照的三条线。 */
const LINES = ['alpha', 'next', 'latest']

/**
 * 共用依赖：本仓把它的精确版钉死，而宿主那边也声明了同一个包 —— 两边必须是**同一份**。
 *
 * 判据是「本仓的精确版**满足**宿主声明的那份范围」，不是「两处字符串相等」：
 * 宿主在不同族上写法不同（有的写 `^` 区间、有的写精确版），字符串比会假红。
 * 之所以要求满足而不是「随便满足就行」：本仓钉的是**精确版**，包管理器会把它解析成
 * 恰好那一个；宿主声明若已经越过它，两边就会各装一份。
 *
 * 为什么只有这一条：`via` 指的是**我们把对象交给它**的那个宿主包 ——
 * `src/adapters/domain-core-store.ts` 把本仓的 schema 传给它的 `domainTable()`，
 * 跨过这条边界的值必须来自同一个实例。宿主其它包内部有几份 zod 是上游自己的事。
 *
 * 加新条目要先问：我们是否把该类型的值交给了宿主？是才加。
 *
 * @type {{ name: string, via: string }[]}
 */
export const SHARED_PINS = [{ name: 'zod', via: '@deepseek-ai/dsh-storage-domain' }]

const USAGE = `usage:
  node scripts/check-declaration.mjs                 # judge every declared line (${TRACKED_LINES.map((target) => target.line).join(' / ')})
  node scripts/check-declaration.mjs --line next     # judge one dist-tag line only

exit codes: 0 = every declared range covers every target line / 1 = it does not / 2 = usage or precondition error`

const tagsCache = new Map()

/** packument 缓存：同一个包在一次运行里只读一遍 registry。 */
const packuments = new Map()

/** 某个包的版本号清单缓存（由 packument 派生）。 */
const versionsCache = new Map()

/**
 * 找 npm 的 CLI 入口，直接用当前 node 跑它。
 * 不走 shell：区间里的 `^` 与 `>` 是 shell 元字符，经 shell 传参会改义（Windows 上 \`^\` 是转义符）。
 * @returns npm-cli.js 的绝对路径。
 */
function npmCli() {
  const execDir = dirname(process.execPath)
  const candidates = [
    process.env.npm_execpath,
    join(execDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(execDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter((value) => typeof value === 'string' && value.length > 0)
  const found = candidates.find((value) => existsSync(value))
  if (!found) {
    throw new Error(
      'cannot locate the npm CLI entry (npm-cli.js) next to node; run inside a node install that ships npm',
    )
  }
  return found
}

/**
 * 问 npm：这个区间匹配哪些版本。
 * @param name - 包名。
 * @param range - 声明区间。
 * @returns 匹配到的版本列表；npm 明确回答「区间内没有版本」时返回空数组。
 */
function matchingVersions(name, range) {
  const result = spawnSync(
    process.execPath,
    [npmCli(), 'view', `${name}@${range}`, 'version', '--json'],
    {
      encoding: 'utf8',
    },
  )
  if (result.error) throw result.error
  const stderr = result.stderr ?? ''
  // npm 对「区间内没有任何版本」用的是 E404 + 这句；别的失败（网络、registry）必须炸出来，
  // 不能伪装成「罩不住」—— 那会把基础设施故障读成声明问题。
  if (result.status !== 0) {
    if (stderr.includes('No match found for version')) return []
    throw new Error(
      `npm view ${name}@${range} failed: ${stderr.trim().split('\n').slice(0, 3).join(' ')}`,
    )
  }
  const parsed = JSON.parse(result.stdout)
  return Array.isArray(parsed) ? parsed : [parsed]
}

/**
 * 从 registry 读一个包的 dist-tags（不调 npm view：这里是纯 HTTP，也更快）。
 * @param name - 包名。
 * @returns dist-tag 到版本的表。
 */
async function distTags(name) {
  if (tagsCache.has(name)) return tagsCache.get(name)
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  if (!response.ok) throw new Error(`registry answered ${response.status} for ${name}`)
  const tags = (await response.json())['dist-tags'] ?? {}
  tagsCache.set(name, tags)
  return tags
}

/**
 * 清单里的声明面：宿主本体的 `engines.dsh`，加上三个依赖段里每个受管平台包的区间。
 * @param manifest - 解析后的 package.json。
 * @returns 逐条声明，`where` 指明它写在哪儿。
 */
function declarations(manifest) {
  const found = []
  const enginesDsh = manifest.engines?.dsh
  if (typeof enginesDsh === 'string') {
    found.push({ where: 'engines.dsh', name: HOST_PACKAGE, range: enginesDsh })
  }
  for (const field of MANIFEST_FIELDS) {
    for (const [name, range] of Object.entries(manifest[field] ?? {})) {
      if (!name.startsWith(MANAGED_PREFIX)) continue
      if (typeof range !== 'string') continue
      found.push({ where: field, name, range })
    }
  }
  return found
}

/**
 * 从 registry 读一个包的完整 packument（缩写格式，已够用：每个版本都带 `dependencies`）。
 * @param name - 包名。
 * @returns packument。
 */
async function packument(name) {
  if (packuments.has(name)) return packuments.get(name)
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  if (!response.ok) throw new Error(`registry answered ${response.status} for ${name}`)
  const body = await response.json()
  packuments.set(name, body)
  return body
}

/**
 * 从 registry 读一个包的全部已发布版本（用来按**版本前缀**定位一族）。
 * @param name - 包名。
 * @returns 版本号列表。
 */
async function publishedVersions(name) {
  if (versionsCache.has(name)) return versionsCache.get(name)
  const versions = Object.keys((await packument(name)).versions ?? {})
  versionsCache.set(name, versions)
  return versions
}

/**
 * 把一条「目标线」解析成某个包在该线上的版本。
 *   - dist-tag：读该 tag 指向的版本；
 *   - 版本前缀：取该前缀下**最高的**已发布版本（没有 dist-tag 指向那些族）。
 * @param name - 包名。
 * @param target - 目标线。
 * @returns 版本；取不到时抛错（声明了那条线却拿不到版本，是前置条件问题，不是「罩不住」）。
 */
async function resolveTargetVersion(name, target) {
  if (target.kind === 'tag') {
    const version = (await distTags(name))[target.line]
    if (typeof version !== 'string') throw new Error(`${name} has no ${target.line} dist-tag`)
    return version
  }
  const versions = await publishedVersions(name)
  const matching = versions.filter((version) => version.startsWith(target.line)).sort()
  if (matching.length === 0)
    throw new Error(`${name} has no published version starting with ${target.line}`)
  return matching[matching.length - 1]
}

/**
 * 判共用依赖：本仓钉的精确版，必须仍落在宿主在每条目标线上声明的那份范围里。
 *
 * 红的时候要直接说出该改成什么 —— 这条检查存在的全部理由，就是别让人再从
 * 「两份 `.pnpm/<包>@<版本>`、TS2345」里反推该动哪一行。
 *
 * @param manifest - 解析后的 package.json。
 * @param targets - 要判的目标线。
 * @returns 失败记录（供退出码汇总）；空数组表示全部成立。
 */
async function checkSharedPins(manifest, targets) {
  const failures = []
  for (const pin of SHARED_PINS) {
    const ours = manifest.dependencies?.[pin.name] ?? manifest.peerDependencies?.[pin.name]
    if (typeof ours !== 'string') {
      throw new Error(`package.json does not declare ${pin.name}, which SHARED_PINS expects`)
    }
    console.log(`[INFO] shared pin: ${pin.name}=${ours} must stay satisfiable by ${pin.via}`)

    for (const target of targets) {
      const hostVersion = await resolveTargetVersion(pin.via, target)
      const declared = (await packument(pin.via)).versions?.[hostVersion]?.dependencies?.[pin.name]

      // 宿主不再声明它 → 那条边界没了，这个判据失去对象。是前置条件变化，不是「罩不住」。
      if (typeof declared !== 'string') {
        throw new Error(
          `${pin.via}@${hostVersion} no longer declares ${pin.name}; SHARED_PINS needs revisiting`,
        )
      }

      const matches = matchingVersions(pin.name, declared)
      if (matches.includes(ours)) {
        console.log(
          `[NOTE] ${pin.name}=${ours} satisfies ${pin.via}@${hostVersion} (${declared}) on ${target.line}`,
        )
        continue
      }

      const suggestion = matches[matches.length - 1]
      console.log(
        `[WARN] ${pin.name}=${ours} is OUTSIDE ${pin.via}@${hostVersion}'s ${declared} (${target.line})` +
          (suggestion === undefined
            ? ' — that range matches no published version'
            : ` — set dependencies.${pin.name} to ${suggestion}`),
      )
      failures.push({
        target: target.line,
        sharedPins: [{ pin, hostVersion, declared, suggestion }],
      })
    }
  }
  return failures
}

/**
 * 跑一次检查。
 * @param only - 只判这一条 dist-tag 线（`--line`）；省略时判 `TRACKED_LINES` 里的全部目标线。
 * @returns 进程退出码。
 */
async function check(only) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  const decls = declarations(manifest)
  if (decls.length === 0) throw new Error('package.json declares no dsh compatibility range at all')

  const targets = only === undefined ? TRACKED_LINES : [{ line: only, kind: 'tag' }]
  console.log(
    `[INFO] target lines: ${targets.map((target) => `${target.line} (${target.kind})`).join(' / ')}`,
  )

  // 上下文：三条 dist-tag 现在各指向什么。
  const names = [...new Set(decls.map((entry) => entry.name))].sort()
  for (const name of names) {
    const tags = await distTags(name)
    const cells = LINES.map((candidate) => `${candidate}=${tags[candidate] ?? '-'}`).join('  ')
    console.log(`[INFO] ${name}  ${cells}`)
  }

  const failures = []
  for (const target of targets) {
    const lineVersions = new Map()
    for (const name of names) lineVersions.set(name, await resolveTargetVersion(name, target))

    const uncovered = []
    for (const entry of decls) {
      const version = lineVersions.get(entry.name)
      const matches = matchingVersions(entry.name, entry.range)
      if (matches.includes(version)) continue
      uncovered.push(entry)
      console.log(
        `[WARN] ${entry.where} declares ${entry.range} for ${entry.name} — does NOT cover ${version} (${target.line})`,
      )
    }
    const covered = decls.length - uncovered.length
    console.log(`[NOTE] line ${target.line}: ${covered}/${decls.length} declared ranges cover it`)
    if (uncovered.length > 0) failures.push({ target: target.line, uncovered })
  }

  failures.push(...(await checkSharedPins(manifest, targets)))

  // 判据落在被跟的线上，而不是 `latest`：宿主 `latest` 指向的版本比被跟的线还旧
  // （README 的安装一节因此要求显式点名版本线）。
  const hostTags = await distTags(HOST_PACKAGE)
  const primary = targets[0].line
  if (hostTags.latest !== undefined && hostTags.latest !== hostTags[primary]) {
    console.log(
      `[NOTE] ${HOST_PACKAGE} latest=${hostTags.latest} differs from next=${hostTags.next}; the judgement is on the declared lines.`,
    )
  }

  if (failures.length === 0) {
    console.log(
      `[NOTE] declaration check passed: all ${decls.length} declared ranges cover every target line (${targets.map((target) => target.line).join(', ')}), and every shared pin stays satisfiable`,
    )
    return 0
  }
  for (const failure of failures) {
    // 两种失败共用一个退出码，但说法不同：一种是我们的区间罩不住那条线，
    // 另一种是宿主把共用依赖抬走了、我们钉的那个精确版已经落在外面。
    if (failure.sharedPins) {
      for (const { pin, hostVersion, declared, suggestion } of failure.sharedPins) {
        console.log(
          `[WARN] declaration check failed: ${pin.name} is pinned to a version ${pin.via}@${hostVersion} no longer accepts (${declared}) on the ${failure.target} line` +
            (suggestion === undefined ? '' : ` — set dependencies.${pin.name} to ${suggestion}`),
        )
      }
      continue
    }
    console.log(
      `[WARN] declaration check failed: ${failure.uncovered.length} of ${decls.length} declared ranges do not cover the ${failure.target} line`,
    )
  }
  console.log(
    '[NOTE] update package.json to what the tracked lines actually serve, or move the tracked line.',
  )
  return 1
}

function usageError(message) {
  if (message) console.error(`[WARN] ${message}`)
  console.error(USAGE)
  process.exit(2)
}

/**
 * 解析 `--line`：省略时返回 `undefined`（判全部目标线）。
 * @param argv - 命令行参数。
 * @returns 要判的 dist-tag 线，或 `undefined`。
 */
function parseLine(argv) {
  const index = argv.indexOf('--line')
  if (index === -1) return undefined
  const line = argv[index + 1]
  if (!line) usageError('--line needs a dist-tag after it')
  if (!LINES.includes(line)) usageError(`unknown dist-tag: ${line}`)
  return line
}

/** 只有被当命令跑时才执行；被 import 时只暴露 TRACKED_LINE。 */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) usageError('')
  let code
  try {
    code = await check(parseLine(argv))
  } catch (error) {
    console.error(`[WARN] ${error.message}`)
    code = 2
  }
  process.exit(code)
}
