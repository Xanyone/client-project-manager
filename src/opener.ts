import { t } from './i18n.js';
import { createHash, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { isFilePath, locationKey, safeFileName, uniqueName } from './paths.js';
import { deduplicateFolders } from './catalog.js';
import type { FolderLocation } from './types.js';

interface StoredWindow {
    folder?: unknown;
    folderUri?: unknown;
}

interface WindowsState {
    lastActiveWindow?: StoredWindow;
    lastPluginDevelopmentHostWindow?: StoredWindow;
    openedWindows?: StoredWindow[];
}

function containsWorkspaceUri(value: unknown, workspace: vscode.Uri): boolean {
    if (typeof value === 'string') {
        if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) { return false; }
        try { return vscode.Uri.parse(value).toString() === workspace.toString(); }
        catch { return false; }
    }
    if (Array.isArray(value)) { return value.some(item => containsWorkspaceUri(item, workspace)); }
    if (value && typeof value === 'object') {
        return Object.values(value).some(item => containsWorkspaceUri(item, workspace));
    }
    return false;
}

export function toUri(location: string): vscode.Uri {
    if (!isFilePath(location) && /^[a-z][a-z0-9+.-]*:/i.test(location)) {
        return vscode.Uri.parse(location);
    }
    return vscode.Uri.file(location);
}

export async function openPath(
    context: vscode.ExtensionContext,
    title: string,
    location: string,
    newWindow: boolean,
): Promise<void> {
    await openFolders(context, title, [{ name: title, location }], newWindow);
}

export async function revealPath(location: string): Promise<void> {
    await vscode.commands.executeCommand('revealFileInOS', toUri(location));
}

export async function openFolders(
    context: vscode.ExtensionContext,
    title: string,
    folders: readonly FolderLocation[],
    newWindow: boolean,
): Promise<void> {
    const available = deduplicateFolders(folders.filter(folder => folder.location));
    if (available.length === 0) {
        throw new Error(t("No folders to open"));
    }

    const single = available.length === 1 ? available[0] : undefined;
    if (single) {
        await openUri(toUri(single.location), newWindow);
        return;
    }

    await rememberFolders(available);
    await openGeneratedWorkspace(context, title, available, newWindow);
}

async function openUri(uri: vscode.Uri, newWindow: boolean, noRecentEntry = false): Promise<void> {
    const options: { forceNewWindow: boolean; forceReuseWindow: boolean; noRecentEntry?: boolean } = newWindow
        ? { forceNewWindow: true, forceReuseWindow: false }
        : { forceNewWindow: false, forceReuseWindow: true };
    if (noRecentEntry) {
        options.noRecentEntry = true;
    }
    if (newWindow) {
        await new Promise(resolve => setTimeout(resolve, 80));
    }
    await vscode.commands.executeCommand('vscode.openFolder', uri, options);
}

async function openGeneratedWorkspace(
    context: vscode.ExtensionContext,
    title: string,
    folders: readonly FolderLocation[],
    newWindow: boolean,
): Promise<void> {
    await ensureDirectory(context.globalStorageUri);
    const directory = vscode.Uri.joinPath(context.globalStorageUri, 'workspaces');
    await ensureDirectory(directory);
    await cleanupWorkspaces(context, directory);
    const stamp = newWindow
        ? `-${randomUUID()}`
        : `-${createHash('sha256').update(JSON.stringify(folders.map(folder => ({ name: folder.name, location: locationKey(folder.location) })))).digest('hex').slice(0, 16)}`;
    const file = vscode.Uri.joinPath(directory, `${safeFileName(title)}${stamp}.code-workspace`);
    const names: string[] = [];
    const content = {
        folders: folders.map(folder => {
            const name = uniqueName(names, folder.name);
            names.push(name);
            return toWorkspaceFolder(name, folder.location);
        }),
        settings: {},
        // Keeps this generated file out of Open Recent. The real directories are recorded separately.
        transient: true,
    };
    await vscode.workspace.fs.writeFile(file, Buffer.from(JSON.stringify(content, null, 2), 'utf8'));
    await openUri(file, newWindow, true);
    if (newWindow) {
        await removeRecent(file);
    }
}

async function rememberFolders(folders: readonly FolderLocation[]): Promise<void> {
    await Promise.all(folders.map(async folder => {
        try {
            await vscode.commands.executeCommand('_workbench.addToRecentlyOpened', {
                type: 'folder',
                uri: toUri(folder.location),
            });
        } catch {
            // Opening still proceeds when the recent-list command is unavailable.
        }
    }));
}

async function removeRecent(file: vscode.Uri): Promise<void> {
    try { await vscode.commands.executeCommand('vscode.removeFromRecentlyOpened', file); }
    catch { /* Optional recent-list maintenance must not block opening. */ }
}

function toWorkspaceFolder(name: string, location: string): { name: string; path?: string; uri?: string } {
    const uri = toUri(location);
    if (uri.scheme === 'file') {
        return { name, path: uri.fsPath };
    }
    return { name, uri: uri.toString() };
}

async function ensureDirectory(uri: vscode.Uri): Promise<void> {
    try {
        await vscode.workspace.fs.createDirectory(uri);
    } catch (error) {
        if (error instanceof vscode.FileSystemError && error.code === 'FileExists') {
            return;
        }
        throw error;
    }
}

async function cleanupWorkspaces(context: vscode.ExtensionContext, directory: vscode.Uri): Promise<void> {
    try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(context.globalStorageUri, '..', 'storage.json'));
        const state = JSON.parse(Buffer.from(bytes).toString('utf8')) as { windowsState?: WindowsState };
        if (!state.windowsState || !Array.isArray(state.windowsState.openedWindows)) { return; }
        const windowsState = state.windowsState;
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        for (const [name, type] of await vscode.workspace.fs.readDirectory(directory)) {
            if (type !== vscode.FileType.File || !/-(?:[a-f0-9]{12,16}(?:-[a-f0-9-]{36})?|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.code-workspace$/.test(name)) { continue; }
            const file = vscode.Uri.joinPath(directory, name);
            if (containsWorkspaceUri(windowsState, file) || vscode.workspace.workspaceFile?.toString() === file.toString()) { continue; }
            const stat = await vscode.workspace.fs.stat(file);
            if (stat.mtime >= cutoff) { continue; }
            await removeRecent(file);
            await vscode.workspace.fs.delete(file);
        }
    } catch { /* Unknown window state means no deletion; opening still proceeds. */ }
}
