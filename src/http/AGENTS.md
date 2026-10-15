# http/ — 规则层

继承根规则，见 [../../AGENTS.md](../../AGENTS.md)。

http/ 特有约束：

- **handler 不许把异常抛出去**：抛出去会被宿主包成 `500`，前端拿不到 `error` 结构。
  余额端点的业务错误一律 `200 + state: error`。
- **每次请求现读配置**，不许在闭包里捕获旧值。
- `path` 写死精确值、**不带尾随斜杠**：实现是 Map 精确键匹配。
- 方法只能用 `GET` / `HEAD` / `POST` —— `ConnectionFetchMethod` 就这三档，PUT 注册即抛。
- **完整密钥永不进响应体；能出的只有首尾片段掩码**。
  掩码由 [../domain/credential.ts](../domain/credential.ts) 的 `maskKey` 生成
  （前 8 + 固定 5 星 + 后 4），形态与平台控制台 `platform.deepseek.com/api_keys` 一致，
  只在 `GET /api/v1/sources` 的 `key.masked` 里出现。
  **3.0 放宽过**：从前一个片段都不许出（固定长度 `********`）。理由、代价与先例见
  [决策记录](../../.agents/notes/2026-10-15-drop-apikey-field.md) 的替代方案第 4 条。
  放宽的是**片段**，不是**完整值** —— 后者仍然一条都不许出，`test/http-handlers.test.ts`
  与 `test/sources-service.test.ts` 各有断言钉着。
  掩码是手动的：`redactSecrets` 是显式开关，我们这套响应自己构造，不走 settings 读取。
- 只有 `routes.ts` 碰 `ctx`；`handlers.ts` 与 `wire.ts` 必须能脱离宿主直接测。
- 新增或改路径必须同步 [docs/BACKEND-CONTRACTS.md](../../docs/BACKEND-CONTRACTS.md) §8 与
  `test/http-routes.test.ts` 的端点表断言。
