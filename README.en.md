# Client Project Dashboard

[简体中文](README.md)

Organize local folders by **client → project → module**, then open them from a dashboard.

## Install and use

Download a `.vsix` from [GitHub Releases](https://github.com/Xanyone/project-dashboard/releases/latest) and choose **Install from VSIX** in VS Code's Extensions menu. Requires VS Code 1.140.0 or later.

The dashboard opens on startup by default. Press `Ctrl+Alt+G` (`Cmd+Alt+G` on macOS) or run **Client Projects: Open dashboard** to open it again.

Add a client, add a project, then select a folder to add a module. Give each module a custom type, such as Frontend, API, or Config. Search by name, type, description, or path; filter by type or missing paths. Click a folder to open it, or open an entire project as a multi-root workspace. Hold Ctrl/Cmd to invert the configured window behavior.

The grouping sidebar is optional. Enable `clientProjectDashboard.showSidebar` and reload the window to display its activity bar icon and use its tree and drag-and-drop controls.

The interface follows VS Code's display language. Chinese locales use Simplified Chinese; other locales use English. User names, descriptions, paths, and custom module types remain unchanged.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `clientProjectDashboard.openOnStartup` | `always` | `never`, `emptyWindow`, or `always`; existing explicit settings are preserved |
| `clientProjectDashboard.showSidebar` | `false` | Show the grouping sidebar |
| `clientProjectDashboard.openInNewWindow` | `false` | Open modules in a new window |
| `clientProjectDashboard.showPath` | `true` | Show paths on folder cards |
| `clientProjectDashboard.storage` | `globalState` | Use `settings` to store the catalog in user settings for Settings Sync |

Data stays in local extension storage by default. **Back up** exports JSON; **Import** merges a backup by client/project name and skips duplicate module paths. Backups contain your local paths and descriptions. Switching storage migrates the current catalog and keeps a local backup of the destination's previous contents. Paths may need updating when syncing to another computer.

## Development

Run `npm install` and `npm run compile`, then press F5 to launch the Extension Development Host. `npm run watch` rebuilds changes. `npm test` runs catalog, storage, dashboard, localization, and extension-host tests; `npm run package:vsix` creates an installable extension.

Manifest messages live in `package.nls.json` and `package.nls.zh*.json`. Native dialogs and the Webview share English message keys and `src/locales/zh-cn.json` through `src/i18n.ts`. Preserve placeholders when adding translations.

This extension has an independently implemented three-level grouping model, with dashboard inspiration from [Project Dashboard](https://github.com/Kruemelkatze/vscode-dashboard).
