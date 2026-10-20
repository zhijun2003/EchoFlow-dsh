# openlux-plugin-account

DeepSeek Harness (DSH) 插件包，来自 OpenLux Desktop 1.0.6（`api.echoflowai.cc` 分发的安装包）。

## 这是什么

OpenLux Desktop 唯一自研的 DSH 插件包，负责三块官方 DSH 没有的能力：

| 目录 | 能力 |
| --- | --- |
| `src/account/` | OpenLux 账户：登录/注册、验证码、Token、余额、免费额度、设备认证、反馈 |
| `src/media/` | 图片生成（Gemini / 可灵 / Midjourney / OpenAI / Vidu）与视频生成（可灵 / 豆包 / Grok / MiniMax / Vidu / 百炼） |
| `src/market/` | 插件市场：从 OpenLux 控制台拉取 connector / 技能目录并安装 |
| `src/web/search/` | 联网搜索：Claude 原生搜索、Gemini grounding、OpenAI annotations 三级降级 |
| `src/models/` | 模型池：可用模型、免费行、价格、能力/推理本地探测 |
| `src/client/` | Web UI：登录引导、账户区、市场浮层、自动化（Automation）页、图片工具卡片等 80+ 组件 |

源码 161 个文件，`src/` 下是完整 TypeScript，不是反编译产物。

## 已验证

```bash
pnpm install          # 44 个 @deepseek-ai/* 官方包 + 工具链，全部解析成功
pnpm run typecheck    # tsc 通过（修复了上游 2 个类型窄化问题，见下）
pnpm run build        # tsdown 打包成功
```

重新构建的 `lib/index.js` 与安装包内附带的官方产物**字节级一致**，说明源码完整、构建环境可复现。

## 我做的修改

上游源码有 2 处类型错误，会让 `pnpm run typecheck` 失败（但不影响打包运行）。已在 `src/client/MarketSection.tsx` 修正：

- 第 930 行附近、第 1014 行附近：`RpcResult<T>` 是 `{ok:true,value} | {ok:false,error}` 联合，原来的 `started.value.message` / `result.value.message` 在类型上没有窄化到具体分支。改为显式判断 `started.ok` / `result.ok`。
- `devDependencies` 里补了 `electron`（`tsdown.config.ts` 把它标记为 external，但源码 `src/market/connector-install.ts` 会 import 它做类型）。

## 依赖的官方包

peerDependencies 列出了 44 个 `@deepseek-ai/*` 包（cordis、dsh-agent、dsh-tools、dsh-web、dsh-client-ui-* 等），版本锁 `0.1.1-rc.2`。这些都能从 npm 正常安装，不需要私有 registry。

## 怎么接入你自己的 DSH

1. 这个包是 cordis 插件，需要在你的 cordis 组合里加一行（OpenLux 的做法在 `cordis.patch.yml`）：

   ```yaml
   - id: openlux-account
     name: openlux-plugin-account
   ```

   app-boot 会把依赖闭包里的包软链到 `$DSH_HOME/profiles/node_modules`，Node 从 profile 向上走时能找到。

2. 它自带 Web 客户端部分，`package.json` 的 `dsh.client.inject` 声明了注入的官方客户端模块，`tsdown.config.ts` 的 client 那一路会以 `openlux-plugin-account` 为 id 注册到 shell 的模块加载器。

3. **去掉 OpenLux 依赖需要改的地方**：所有 `src/account/http.ts` / `token-wire.ts` / `models/sync.ts` 里的请求都指向 `https://api.openlux.ai`（或 `process.env.OPENLUX_BASE_URL`）。要做成独立的，把这一层换成自己的服务即可；媒体生成和市场那两层相对独立，可以只保留你想要的部分。

## 注意

- 包声明 MIT license，但源码来自商业产品的安装包，二次分发前建议自行确认授权。
- `version` 是 `0.1.0`、`private: true`，是编译进安装包的内部包，没有单独发布。
