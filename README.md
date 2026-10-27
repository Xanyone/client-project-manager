# 客户项目仪表盘

[English](README.en.md)

按 **客户 → 项目 → 模块** 管理本地目录，并从仪表盘或侧边栏快速打开。

## 安装

在 [GitHub Releases](https://github.com/Xanyone/project-dashboard/releases/latest) 下载 `.vsix` 文件，在 VS Code 扩展面板右上角菜单选择「从 VSIX 安装」。需要 VS Code 1.140.0 或更新版本。

适合这种结构：

```text
A客户
  B项目
    web
    api
  C项目
    app
```

界面思路参考了 [Project Dashboard](https://github.com/Kruemelkatze/vscode-dashboard) 的速度拨号，但分组模型是三层的，代码是独立实现，不是那个仓库的拷贝。

## 功能

- 默认在空窗口启动时打开仪表盘，分组侧栏默认开启
- 中英文界面跟随 VS Code 的显示语言，其他语言回退英文；中文环境使用简体中文
- 可选侧边栏树：客户、项目、模块三级
- 仪表盘：折叠查看客户、项目和目录，可搜索、按模块类型筛选，也可只看路径缺失的目录
- 模块就是项目下的目录，类型由客户自定义输入，仪表盘会按已使用的类型筛选
- 在当前窗口或新窗口打开；按住 `Ctrl` / `Cmd` 使用相反行为
- 把一个项目或客户下的全部模块打开成多根工作区
- 拖拽调整顺序，或把文件夹拖进树里
- 搜索、颜色、说明
- 数据默认存在本机；也可以改成用户设置，方便 Settings Sync

## 运行

用 VS Code 打开本目录，按 `F5`。扩展开发主机会自动打开仪表盘。

空窗口启动时会自动打开仪表盘；已有工作区不会被强行切换。`clientProjectDashboard.showSidebar` 默认开启，若隐藏了活动栏图标，可在设置中重新启用并重新加载窗口。将 `clientProjectDashboard.openOnStartup` 设为 `never` 可关闭自动打开；也可设为 `always` 让每次启动都打开。

也可以：

- `Ctrl+Alt+G`（macOS 为 `Cmd+Alt+G`）打开仪表盘
- 命令面板执行「客户项目: 打开仪表盘」

## 添加

1. 添加客户，例如 `A客户`
2. 在这个客户下添加项目，例如 `B项目`
3. 在项目上添加模块，一次只选择一个目录

名称默认使用文件夹名。添加目录时可输入自定义类型，之后也可以在编辑菜单中修改。

## 打开方式

- 单击项目标题或「打开项目」：直接打开该项目。只有一个目录时打开那个文件夹，有多个目录时打开多根工作区
- 单击目录卡片：只打开那一个目录
- `Ctrl` / `Cmd` + 单击：使用相反的窗口
- 侧边栏或卡片菜单里的「以工作区打开」：先选择当前窗口或新窗口

## 数据

默认保存在 VS Code 的扩展 globalState 中。

可通过仪表盘「备份」导出 JSON，通过「导入」合并已有备份；相同客户和项目按名称合并，同项目下相同路径不重复添加。导出文件包含本地目录路径和说明，请妥善保管。

切换存储方式时将当前数据迁移到新位置，并在本机扩展存储中保留目标位置的迁移前副本。存储配置为应用级，不受工作区设置覆盖。Settings Sync 同步目录后，不同电脑的本地路径可能需要重新设置。

设置项：

| 设置 | 默认 | 作用 |
| --- | --- | --- |
| `clientProjectDashboard.openOnStartup` | `emptyWindow` | `never` / `emptyWindow` / `always` |
| `clientProjectDashboard.showSidebar` | `true` | 显示客户项目分组侧栏 |
| `clientProjectDashboard.openInNewWindow` | `false` | 单击是否新开窗口 |
| `clientProjectDashboard.showPath` | `true` | 目录卡片上是否显示路径末段 |
| `clientProjectDashboard.storage` | `globalState` | 改为 `settings` 后写入用户设置 |

## 开发

```bash
npm install
npm run compile
npm run watch
```

`npm test` 会启动 VS Code 测试宿主。分组逻辑的单测在 `src/test/catalog.test.ts`。

扩展清单文案使用 `package.nls.json`（英文）和 `package.nls.zh*.json`（简体中文）；运行时文案通过 `src/i18n.ts` 共用 `src/locales/zh-cn.json`。新增文案使用英文原文作为键，并补充中文译文和完整占位符。用户输入的名称、类型、路径和说明不参与翻译。

发布前把 `package.json` 里的 `publisher` 改成你的 Marketplace 发布者 ID。

运行 `npm run package:vsix` 生成可安装扩展包。推送 `v*` 标签时，GitHub Actions 会运行完整测试并发布带 VSIX 的 GitHub Release。Marketplace 发布需要单独注册并验证发布者，GitHub Release 不依赖 Marketplace 凭据。
