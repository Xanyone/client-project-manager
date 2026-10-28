客户项目管理 / Client Project Management v0.4.2

- 移除客户和项目标题的整块悬停背景，保留文字反馈和键盘焦点。
- “打开项目”使用主按钮，“添加目录”等操作使用主题次按钮；编辑入口常显，操作边界清晰。
- 项目目录数量移至标题区域，“以工作区打开”保留在编辑菜单，空项目禁用打开并提示先添加目录。
- 优化窄窗口操作换行；目录卡片保留三列、两列和一列自适应布局。
- 清理历史目录类型自动补入和旧仪表盘模型缓存回退。类型选择统一使用内置类型和当前常用配置，新建自定义类型自动保存。
- 未配置的默认类型使用“其他”，相同默认值不重复写入；设置保存失败时不会给目录指派未保存的新类型。

Dashboard actions now have theme-aware primary and secondary button styles, visible edit controls and disabled opening for empty projects. Project headings no longer paint a block on hover. Workspace options remain in the edit menu. Folder types come only from built-ins and current custom configuration, and new custom types are saved automatically. Old catalog type inference and cached-model restoration have been removed.

验证：68 项完整测试通过；中英文、深浅主题、四种宽度共 16 种布局组合验证通过。
