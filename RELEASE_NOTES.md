Client Project Manager v0.4.7

- 修复设置同步并发导致的目录数据覆盖，并统一远程路径 URI 比较。
- 修复清理任务误删其他窗口仍在使用的工作区文件，去重损坏目录错误提示。

Fixes catalog overwrites during concurrent settings sync, remote path URI comparison, cleanup of active workspace files, and repeated corrupt catalog warnings.

Full VS Code tests, type checking, ESLint and production VSIX packaging passed.
