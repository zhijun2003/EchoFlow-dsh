# EchoFlowSiHub Desktop

把 EchoFlow 的账户、媒体生成和市场能力装进 DeepSeek Harness 桌面版。

两个产物，一个仓库：

| 产物 | 给谁 | 怎么产出 |
| --- | --- | --- |
| `echoflowai-tools` npm 包 | 已经在用 DSH 的人 | `./build-tarball.sh` → `npm publish` |
| `EchoFlowSiHub-Setup-*.exe` | 普通用户，装完即用 | `./desktop/scripts/build-desktop.sh win:x64` |

版本号保持一致：桌面版里塞的插件版本，就是 npm 上那个版本。

## 上游关系

**上游是构建输入，不是 fork。** `desktop/scripts/build-desktop.sh` 按固定 tag
clone [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)，
打上我们的 overlay，再跑上游自己的打包入口。升级上游 = 改 `DSH_UPSTREAM_TAG`
重跑，上游的改动不会被我们的分支挡住。

Overlay 只有三处，都不碰上游源码文件：

1. `apps/desktop/package.json` 加一个 `file:` 依赖 —— 上游的
   `prepare-package-set.ts` 会把它打进包集合
2. `apps/desktop/cordis.patch.yml` —— 把插件挂进 desktop profile 的插件树
3. `resources/` 下的品牌文件 —— 图标和欢迎页

## 目录

仓库根就是插件包本身（`package.json` 在根上），所以所有路径相对仓库根。

```
desktop/
├── brand/                    品牌资产（EchoFlow logo + 生成的各平台 icon）
├── scripts/
│   ├── build-desktop.sh      构建入口：clone → overlay → 打包 → 收产物
│   └── make-icons.py         logo → 1104/1024 PNG（纯 Python，无图像库）
└── .github/workflows/
    ├── desktop-package.yml   Win + Linux 打包（改自上游 windows-package.yml）
    └── npm-publish.yml       npm 发布（改自上游 release-publish.yml）
```

## 本地构建

```bash
# Windows 安装包（必须在 Windows 上，官方强制）
./desktop/scripts/build-desktop.sh win:x64

# 换上游版本
DSH_UPSTREAM_TAG=dsh-v0.2.1-rc.1 ./desktop/scripts/build-desktop.sh win:x64
```

产物在 `.desktop-build/artifacts/<target>/`（已在 `.gitignore` 中）。

**平台约束**：上游要求 Windows 包必须在 Windows 上打
（`win-x64 requires a Windows x64 build host`，跨平台被明确拒绝）。本地没有
Windows 工具链时，直接推 tag 让 Action 在 `windows-latest` 上打。

**未签名**：我们没有代码签名证书，所以默认走上游的 `--unsigned` 路径
（上游文档里给本地和 CI 无凭据构建用的就是这条）。Windows 用户会看到
SmartScreen 提示，需要点「仍要运行」。Linux 的 AppImage/deb 同样未签名。

## macOS 与 Linux

**这一版只有 Windows。**

- **macOS**：磁盘镜像必须在 macOS 上构建。加一个 `macos-latest` job、步骤抄
  上游的 `macos-package.yml` 就能出；签名和公证另需 Apple Developer 凭据。
- **Linux**：上游的构建系统只支持 Windows 和 macOS
  （`SUPPORTED_TARGETS = mac-arm64 / mac-x64 / win-x64`），而且不只是没配
  target——`prepare-dsh.ts` 里 Electron 可执行文件的路径只分 win32 和
  darwin，LibreOffice 引擎和原生模块也按这两个平台选。加 Linux 是一次移植，
  不是改配置。

## GitHub Actions

两个 workflow 都是从上游拉过来改的：

| 上游 | 我们改了什么 |
| --- | --- |
| `windows-package.yml` | 自托管 runner（EV 签名）→ `windows-latest` + 未签名 |
| `release-publish.yml` | 去掉 native addon 和 Python wheel 部分，只留 npm 发布 |

触发方式：

```bash
git tag desktop-v1.0.0 && git push --tags   # 打 Windows 包并挂到 Release
git tag plugin-v1.0.0  && git push --tags   # 发 npm 包
```

需要的 secret：`NPM_TOKEN`（npm 自动化 token）。

## 已知限制

- **未签名** —— Windows 用户会看到 SmartScreen 提示，需点「仍要运行」
- **无自动更新** —— 上游的更新 feed 指向 deepseek.com，我们还没搭自己的。
  第一版可以让用户手动下载新版
- **macOS / Linux 未支持** —— 见上
- 上游 0.2.1 公开版的 `dsh-client-connection` 有个 `webServer` bug，插件侧
  的补丁在 `patch-dsh-connection-webserver.py`。桌面版用的是上游自带的内核
  （cordis 4.0.5），没有这个问题
