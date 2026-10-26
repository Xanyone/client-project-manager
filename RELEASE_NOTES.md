客户项目仪表盘 / Client Project Dashboard v0.3.0

- 支持中英文国际化，语言跟随 VS Code，覆盖仪表盘、命令、设置和原生弹窗。
- 默认自动打开仪表盘，分组侧栏默认隐藏；启用 `clientProjectDashboard.showSidebar` 可恢复侧栏。
- 将 `clientProjectDashboard.openOnStartup` 设为 `never` 可关闭自动打开；已有显式设置会保留。
- 优化窄窗口英文布局，处理数量单复数并增加双语回归验证。

The dashboard, commands, settings, dialogs, and errors now follow VS Code's display language (English and Simplified Chinese). The dashboard opens on startup by default, with the grouping sidebar hidden. Enable `clientProjectDashboard.showSidebar` to restore it, or set `clientProjectDashboard.openOnStartup` to `never` to disable auto-open. Existing explicit startup settings are preserved. English layouts now wrap correctly in narrow windows.

安装方式：下载 Assets 中的 .vsix，在 VS Code 扩展面板菜单中选择“从 VSIX 安装”。

Install: download the .vsix asset and choose **Install from VSIX** in VS Code's Extensions menu.
