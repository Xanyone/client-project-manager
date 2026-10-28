客户项目管理器 / Client Project Manager v0.4.4

- 扩展标识更新为 `Xanyone.client-project-manager`，与 GitHub 仓库名统一。
- 统一显示名称、命令分类、设置标题及中英文文档中的产品名称。
- 仓库主页、问题跟踪和 Release 下载链接更新到新仓库。
- 移除客户和项目标题的整块悬停背景，统一主题按钮样式并让编辑入口常显。
- 调整项目操作区和目录数量位置；空项目禁用打开并提示先添加目录，窄窗口布局更紧凑。
- 目录类型选择只使用内置类型和当前配置；新建自定义类型自动保存，未配置默认类型使用“其他”。
- 备份文件默认名称更新为 `client-project-manager-backup.json`。

Dashboard headings no longer paint a block on hover. Theme-aware actions, project controls and narrow layouts were refined. Folder type selection now uses built-ins and current configuration, and new custom types are saved automatically.

完整 VS Code 测试通过（68 项）；类型检查、ESLint 和 VSIX 生产打包通过。npm 依赖审计未发现漏洞。
