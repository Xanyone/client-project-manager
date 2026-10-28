# 客户项目管理器

[English](README.md)

按 **客户 → 项目 → 目录** 整理本地项目，方便快速查找和打开。

## 功能

- 在仪表盘或侧边栏按客户、项目和目录分组管理
- 搜索名称、类型、说明和路径，并按目录类型或缺失路径筛选
- 打开单个目录，或将项目、客户下的目录作为多根工作区打开
- 拖拽调整顺序，也可将文件夹拖入侧边栏
- 为条目设置颜色和说明，为目录设置内置或自定义类型
- 导入和导出目录清单，方便备份或迁移

## 使用

添加客户，在客户下添加项目，再把本地文件夹添加为目录。单击目录卡片可打开该目录；项目或客户的“以工作区打开”操作可一次打开其中的多个目录。仪表盘支持搜索、筛选和折叠分组。

仪表盘默认在空窗口启动。也可按 `Ctrl+Alt+G`（macOS 为 `Cmd+Alt+G`），或从命令面板执行“客户项目管理器: 打开仪表盘”。

## VS Code 设置

在设置中搜索 `Client Project Manager`：

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `clientProjectDashboard.openOnStartup` | `emptyWindow` | `never` 不自动打开，`emptyWindow` 仅在空窗口打开，`always` 每次启动都打开 |
| `clientProjectDashboard.showSidebar` | `true` | 显示分组侧栏 |
| `clientProjectDashboard.openInNewWindow` | `false` | 打开目录时使用新窗口；按住 `Ctrl` / `Cmd` 可反向切换 |
| `clientProjectDashboard.showPath` | `true` | 在目录卡片上显示路径 |
| `clientProjectDashboard.storage` | `globalState` | 使用 `settings` 将目录清单保存在用户设置中，以便同步 |
| `clientProjectDashboard.folderTypes` | `[]` | 常用自定义目录类型，由扩展自动维护 |
| `clientProjectDashboard.defaultFolderType` | `builtin:other` | 添加目录时优先选中的类型 |

从 [GitHub Releases](https://github.com/Xanyone/client-project-manager/releases/latest) 下载 `.vsix`，然后在 VS Code 扩展面板中选择“从 VSIX 安装”。需要 VS Code 1.140.0 或更新版本。
