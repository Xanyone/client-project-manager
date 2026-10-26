import { t } from './i18n.js';
import { normalize } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import * as vscode from 'vscode';
import { isFilePath, safeFileName, uniqueName } from './paths.js';
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
    const available = folders.filter(folder => folder.location);
    if (available.length === 0) {
        throw new Error(t("No folders to open"));
    }

    await forgetGeneratedWorkspaces(context);

    const single = available.length === 1 ? available[0] : undefined;
    const alreadyOpen = single !== undefined && newWindow
        ? await isFolderWindowOpen(context, single.location)
        : false;
    if (single && !alreadyOpen) {
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
    const stamp = newWindow
        ? `-${randomUUID()}`
        : `-${createHash('sha256').update(JSON.stringify(folders)).digest('hex').slice(0, 12)}`;
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
        await vscode.commands.executeCommand('vscode.removeFromRecentlyOpened', file);
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

async function forgetGeneratedWorkspaces(context: vscode.ExtensionContext): Promise<void> {
    const directory = vscode.Uri.joinPath(context.globalStorageUri, 'workspaces');
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(directory);
    } catch {
        return;
    }
    await Promise.all(entries.map(async ([name]) => {
        if (!name.endsWith('.code-workspace')) {
            return;
        }
        await vscode.commands.executeCommand(
            'vscode.removeFromRecentlyOpened',
            vscode.Uri.joinPath(directory, name),
        );
    }));
}

async function isFolderWindowOpen(context: vscode.ExtensionContext, location: string): Promise<boolean> {
    try {
        const storage = vscode.Uri.joinPath(context.globalStorageUri, '..', 'storage.json');
        const bytes = await vscode.workspace.fs.readFile(storage);
        const json = JSON.parse(Buffer.from(bytes).toString('utf8')) as { windowsState?: WindowsState };
        const state = json.windowsState;
        if (!state) {
            return false;
        }
        const windows = [
            state.lastActiveWindow,
            state.lastPluginDevelopmentHostWindow,
            ...(state.openedWindows ?? []),
        ];
        return windows.some(win => {
            const folder = win?.folder ?? win?.folderUri;
            return typeof folder === 'string' && sameFolder(folder, location);
        });
    } catch {
        return false;
    }
}

function sameFolder(stored: string, location: string): boolean {
    try {
        const storedUri = stored.includes('://') ? vscode.Uri.parse(stored) : vscode.Uri.file(stored);
        const target = toUri(location);
        if (storedUri.scheme !== target.scheme) {
            return false;
        }
        if (storedUri.scheme === 'file') {
            return normalize(storedUri.fsPath).replace(/[\\/]+$/, '').toLowerCase()
                === normalize(target.fsPath).replace(/[\\/]+$/, '').toLowerCase();
        }
        return storedUri.toString().toLowerCase() === target.toString().toLowerCase();
    } catch {
        return false;
    }
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
