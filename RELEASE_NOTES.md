客户项目仪表盘 / Client Project Dashboard v0.3.4

- 支持中英文国际化，语言跟随 VS Code，覆盖仪表盘、命令、设置和原生弹窗。
- 默认在空窗口自动打开仪表盘，分组侧栏默认开启；使用 `clientProjectDashboard.showSidebar` 可控制侧栏。
- 将 `clientProjectDashboard.openOnStartup` 设为 `never` 可关闭自动打开；已有显式设置会保留。
- 优化窄窗口英文布局，处理数量单复数并增加双语回归验证。
- 修复安装后活动栏图标不显示；启用侧栏设置并重新加载窗口即可显示。
- `clientProjectDashboard.showSidebar` 默认开启。
- 空窗口启动时自动打开仪表盘，已有工作区不会强行切换。
- 首次空目录只显示一个添加客户入口，导入和备份在已有数据后显示。
- 将“选择窗口”移动到目录卡片；项目栏的操作改为“以工作区打开”。
- 添加客户后立即刷新侧栏，目录级按钮仅在悬停或聚焦时显示。
- 仪表盘客户图标与左侧列表的组织图标保持一致。

The dashboard, commands, settings, dialogs, and errors follow VS Code's display language (English and Simplified Chinese). The dashboard opens in empty windows by default, with the grouping sidebar enabled. Use `clientProjectDashboard.showSidebar` to control the sidebar, or set `clientProjectDashboard.openOnStartup` to `never` to disable auto-open. Existing explicit startup settings are preserved. English layouts wrap correctly in narrow windows.

安装方式：下载 Assets 中的 .vsix，在 VS Code 扩展面板菜单中选择“从 VSIX 安装”。

Install: download the .vsix asset and choose **Install from VSIX** in VS Code's Extensions menu.
