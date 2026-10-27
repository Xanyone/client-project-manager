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
- 在当前窗口或新窗口打开；目录卡片可选择窗口，项目栏的“以工作区打开”用于多根工作区；按住 `Ctrl` / `Cmd` 使用相反行为
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

- 单击项目标题展开或折叠；单击「打开项目」直接打开项目。只有一个目录时打开文件夹，有多个目录时打开多根工作区
- 单击目录卡片：只打开那一个目录
- `Ctrl` / `Cmd` + 单击：使用相反的窗口
- 侧边栏或卡片菜单里的「以工作区打开」：先选择当前窗口或新窗口

## 数据

默认保存在 VS Code 的扩展 globalState 中，并在扩展存储目录保留事务快照，用于多个窗口间协调写入。

可通过仪表盘「备份」导出 JSON，通过「导入」合并已有备份；相同客户和项目按名称合并，同项目下等价路径不重复添加；同名不同路径的模块自动添加编号。重复导入相同备份不会重复增加条目。空目录也可导入。导出文件包含本地目录路径和说明，请妥善保管。

切换存储方式时将当前数据迁移到新位置，并在本机扩展存储中保留目标位置的迁移前副本。存储配置为应用级，不受工作区设置覆盖。Settings Sync 同步目录后，不同电脑的本地路径可能需要重新设置。

### 唯一性规则

- 客户名称在目录内唯一；项目名称在所属客户内唯一；模块名称在所属项目内唯一。名称比较忽略首尾空格、大小写，并统一 Unicode NFC。
- 同一项目不能重复添加等价目录路径，包括 Windows 大小写、斜杠、尾部分隔符和 file URI 的不同写法。不同项目可以引用同一目录。
- 新增、重命名、修改路径和跨组拖拽使用相同约束；拒绝冲突，不提供继续重复添加。
- 打开客户工作区时对跨项目复用的路径去重。目录身份按路径比较，不解析符号链接或目录联接。
- 旧数据如有重复，不自动删除或覆盖。先导出备份，再将备份导入空目录，可按合并规则整理重复项。共享事务快照损坏时停止写入，保留原文件。
- 同一扩展存储目录的写入通过跨进程锁串行执行，其他窗口约两秒刷新。手工编辑设置和 Settings Sync 不参与文件锁，并发冲突后需检查最新目录。

设置项：

| 设置 | 默认 | 作用 |
| --- | --- | --- |
| `clientProjectDashboard.openOnStartup` | `emptyWindow` | `never` / `emptyWindow` / `always` |
| `clientProjectDashboard.showSidebar` | `true` | 显示客户项目分组侧栏 |
| `clientProjectDashboard.openInNewWindow` | `false` | 单击是否新开窗口 |
| `clientProjectDashboard.showPath` | `true` | 目录卡片上是否显示路径末段 |
| `clientProjectDashboard.storage` | `globalState` | 改为 `settings` 后写入用户设置 |
| `clientProjectDashboard.folderTypes` | `[]` | 保存常用自定义目录类型 |
| `clientProjectDashboard.defaultFolderType` | `builtin:other` | 添加目录时优先显示的类型，默认“其他” |

### 目录类型

添加目录或在目录的编辑菜单中选择“设置类型”时，可选内置的前端、后端、API、配置、文档、测试、脚本、其他，也可选择“自定义类型…”输入名称。已有目录使用过的类型会自动加入选项，无需重复输入；名称区分大小写，保留用户原文。

点击仪表盘上的“目录类型”、侧栏更多菜单中的“管理目录类型”，或执行 **客户项目：管理目录类型** 命令，可以保存常用类型、设置默认类型、移除常用类型。新建目录时默认类型排在首位，修改目录时当前类型排在首位；按 Esc 可取消，不会修改目录。内置类型随 VS Code 语言显示，自定义类型不翻译。

移除常用选项不会修改已有目录；已有目录仍在使用的类型会继续提供。若移除的常用类型也是默认类型，默认值恢复为“其他”。类型偏好保存到用户设置；目录备份包含每个目录的类型，不包含常用列表和默认偏好。内置类型使用 `builtin:frontend`、`builtin:backend`、`builtin:api`、`builtin:config`、`builtin:docs`、`builtin:tests`、`builtin:scripts`、`builtin:other` 稳定标识，切换语言不影响筛选或备份；历史类型原样保留。

## 开发

```bash
npm install
npm run compile
npm run watch
```

`npm test` 默认使用固定的 VS Code 1.143.1 测试宿主，可通过 `VSCODE_TEST_VERSION` 指定版本。`npm run test:unit` 无需启动宿主，验证目录、唯一性和仪表盘交互。CI 配置覆盖 Windows、Linux、macOS 和最低版本 1.140.0。

扩展清单文案使用 `package.nls.json`（英文）和 `package.nls.zh*.json`（简体中文）；运行时文案通过 `src/i18n.ts` 共用 `src/locales/zh-cn.json`。新增文案使用英文原文作为键，并补充中文译文和完整占位符。用户输入的名称、类型、路径和说明不参与翻译。

发布前把 `package.json` 里的 `publisher` 改成你的 Marketplace 发布者 ID。

运行 `npm run package:vsix` 生成可安装扩展包。推送 `v*` 标签时，GitHub Actions 会运行完整测试并发布带 VSIX 的 GitHub Release。Marketplace 发布需要单独注册并验证发布者，GitHub Release 不依赖 Marketplace 凭据。
