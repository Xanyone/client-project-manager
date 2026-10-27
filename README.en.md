# Client Project Dashboard

[简体中文](README.md)

Organize local work by **client → project → folder** and quickly find and open it in VS Code.

## Features

- Manage clients, projects, and folders in the dashboard or sidebar
- Search names, types, descriptions, and paths; filter by folder type or missing paths
- Open an individual folder or open a client's or project's folders as a multi-root workspace
- Reorder items by dragging, or drag folders into the sidebar
- Add colors and descriptions, and assign built-in or custom folder types
- Import and export catalogs for backup or migration

## Use

Add a client, create a project under it, then add local folders to that project. Select a folder card to open it. Use **Open as workspace** on a client or project to open multiple folders together. Search, filter, and collapse groups in the dashboard.

The dashboard opens automatically in an empty window. You can also press `Ctrl+Alt+G` (`Cmd+Alt+G` on macOS) or run **Client Projects: Open dashboard** from the Command Palette.

## VS Code settings

Search for `Client Project Dashboard` in Settings:

| Setting | Default | Description |
| --- | --- | --- |
| `clientProjectDashboard.openOnStartup` | `emptyWindow` | `never`, `emptyWindow`, or `always` |
| `clientProjectDashboard.showSidebar` | `true` | Show the grouping sidebar |
| `clientProjectDashboard.openInNewWindow` | `false` | Open folders in a new window; hold Ctrl/Cmd to invert |
| `clientProjectDashboard.showPath` | `true` | Show paths on folder cards |
| `clientProjectDashboard.storage` | `globalState` | Use `settings` to save the catalog in user settings for sync |
| `clientProjectDashboard.folderTypes` | `[]` | Saved custom folder types, managed by the extension |
| `clientProjectDashboard.defaultFolderType` | `builtin:other` | Type selected first when adding a folder |

Download a `.vsix` from [GitHub Releases](https://github.com/Xanyone/project-dashboard/releases/latest), then choose **Install from VSIX** in VS Code's Extensions view. Requires VS Code 1.140.0 or later.
