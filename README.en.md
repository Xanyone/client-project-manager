# Client Project Dashboard

[简体中文](README.md)

Organize local folders by **client → project → module**, then open them from a dashboard.

## Install and use

Download a `.vsix` from [GitHub Releases](https://github.com/Xanyone/project-dashboard/releases/latest) and choose **Install from VSIX** in VS Code's Extensions menu. Requires VS Code 1.140.0 or later.

The dashboard opens automatically in an empty window by default. Existing workspaces are not forced to switch views. Press `Ctrl+Alt+G` (`Cmd+Alt+G` on macOS) or run **Client Projects: Open dashboard** to open it again.

Add a client, add a project, then select a folder to add a module. Give each module a custom type, such as Frontend, API, or Config. Search by name, type, description, or path; filter by type or missing paths. Click a folder to open it, choose a window from its card, or open an entire project as a multi-root workspace. Hold Ctrl/Cmd to invert the configured window behavior.

The grouping sidebar is enabled by default. If its activity bar icon is hidden, enable `clientProjectDashboard.showSidebar` and reload the window.

The interface follows VS Code's display language. Chinese locales use Simplified Chinese; other locales use English. User names, descriptions, paths, and custom module types remain unchanged.

## Settings

| Setting | Default | Purpose |
| --- | --- | --- |
| `clientProjectDashboard.openOnStartup` | `emptyWindow` | `never`, `emptyWindow`, or `always`; existing explicit settings are preserved |
| `clientProjectDashboard.showSidebar` | `true` | Show the grouping sidebar |
| `clientProjectDashboard.openInNewWindow` | `false` | Open modules in a new window |
| `clientProjectDashboard.showPath` | `true` | Show paths on folder cards |
| `clientProjectDashboard.storage` | `globalState` | Use `settings` to store the catalog in user settings for Settings Sync |

Data stays in local extension storage by default. **Back up** exports JSON; **Import** merges a backup by client/project name and skips duplicate module paths. Backups contain your local paths and descriptions. Switching storage migrates the current catalog and keeps a local backup of the destination's previous contents. Paths may need updating when syncing to another computer.

## Uniqueness and concurrent edits

Client names are unique within the catalog, project names within a client, and module names within a project. Names are trimmed, case-insensitive and NFC-normalized. Equivalent paths cannot be added twice to one project; Windows spelling variants and file URIs share an identity. Different projects may reference the same folder, which is deduplicated when opening a client workspace. Symbolic links and junctions are not resolved.

Add, rename, path changes and drag moves enforce the same rules. Repeated imports are idempotent; conflicting module names receive numbered names. Existing conflicting data is protected, never silently deleted. Export a backup before repairing it; importing into an empty catalog merges duplicate groups and paths. Shared-snapshot corruption stops writes and preserves the file.

Local extension storage also contains a transaction snapshot. Extension writes use a cross-process lock; other windows refresh approximately every two seconds. Manual settings edits and Settings Sync do not participate in this lock and need review when concurrent edits occur.

Tests use VS Code 1.143.1 by default (override with VSCODE_TEST_VERSION). The host-independent suites run with npm run test:unit. CI is configured for Windows, Linux and macOS with minimum VS Code 1.140.0 and the pinned version.

## Development

Run `npm install` and `npm run compile`, then press F5 to launch the Extension Development Host. `npm run watch` rebuilds changes. `npm test` runs catalog, storage, dashboard, localization, and extension-host tests; `npm run package:vsix` creates an installable extension.

Manifest messages live in `package.nls.json` and `package.nls.zh*.json`. Native dialogs and the Webview share English message keys and `src/locales/zh-cn.json` through `src/i18n.ts`. Preserve placeholders when adding translations.

This extension has an independently implemented three-level grouping model, with dashboard inspiration from [Project Dashboard](https://github.com/Kruemelkatze/vscode-dashboard).
