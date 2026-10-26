import { basename } from 'node:path';
import * as vscode from 'vscode';
import {
    addClient,
    addModule,
    addProject,
    collectFolders,
    findNode,
    hasSiblingName,
    mergeCatalog,
    parseCatalog,
    moveNode,
    nodeLabel,
    parentOf,
    relocate,
    removeNode,
    renameNode,
    setColor,
    setDescription,
    setModuleKind,
    setModulePath,
} from './catalog.js';
import { COLOR_PRESETS, CONFIG_SECTION, colorAt } from './constants.js';
import { openFolders, openPath, revealPath } from './opener.js';
import { inspectPath, isFilePath } from './paths.js';
import type { CatalogStore } from './store.js';
import {
    type NodeRef,
    isNodeRef,
} from './types.js';

export class ProjectActions {
    async exportCatalog(): Promise<void> {
        const uri = await vscode.window.showSaveDialog({
            title: '备份分组数据', filters: { JSON: ['json'] },
            defaultUri: vscode.Uri.file('project-dashboard-backup.json'),
        });
        if (!uri) { return; }
        await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(this.store.get(), null, 2), 'utf8'));
        void vscode.window.showInformationMessage('分组数据已导出');
    }

    async importCatalog(): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            title: '导入分组数据', filters: { JSON: ['json'] }, canSelectMany: false, canSelectFiles: true, canSelectFolders: false,
        });
        if (!uris?.[0]) { return; }
        const bytes = await vscode.workspace.fs.readFile(uris[0]);
        const incoming = parseCatalog(JSON.parse(Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '')));
        if (await this.store.update(current => mergeCatalog(current, incoming))) {
            void vscode.window.showInformationMessage('分组数据已合并导入');
        }
    }

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly store: CatalogStore,
    ) {}

    async addClient(): Promise<string | undefined> {
        const name = await askText('客户名称', '例如：A客户');
        if (!name) {
            return undefined;
        }
        if (await this.rejectDuplicate(undefined, name)) {
            return undefined;
        }
        const created = addClient(this.store.get(), {
            name,
            color: colorAt(this.store.get().clients.length),
        });
        if (!await this.store.update(created.catalog)) {
            return undefined;
        }
        void vscode.window.showInformationMessage(`已添加客户「${created.client.name}」`);
        return created.client.id;
    }

    async addProject(clientId?: string): Promise<void> {
        const resolvedClientId = clientId ?? await this.pickClient(true);
        if (!resolvedClientId) {
            return;
        }
        const name = await askText('项目名称', '例如：B项目');
        if (!name) {
            return;
        }
        if (await this.rejectDuplicate({ type: 'client', id: resolvedClientId }, name)) {
            return;
        }
        const created = addProject(this.store.get(), resolvedClientId, {
            name,
            color: colorAt(this.projectCount(resolvedClientId)),
        });
        if (!await this.store.update(created.catalog)) {
            return;
        }
        void vscode.window.showInformationMessage(`已添加项目「${created.project.name}」`);
    }

    async addModule(projectId?: string): Promise<void> {
        const resolvedProjectId = projectId ?? await this.pickProject();
        if (!resolvedProjectId) {
            return;
        }
        const uris = await vscode.window.showOpenDialog({
            title: '选择一个模块目录',
            openLabel: '添加',
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
        });
        if (!uris?.[0]) {
            return;
        }
        await this.addOneModule(resolvedProjectId, uris[0].fsPath);
    }

    async addDroppedFolders(target: NodeRef | undefined, uris: readonly vscode.Uri[]): Promise<void> {
        const folders: string[] = [];
        for (const uri of uris) {
            if (uri.scheme !== 'file') {
                continue;
            }
            try {
                const stat = await vscode.workspace.fs.stat(uri);
                if ((stat.type & vscode.FileType.Directory) === 0) {
                    continue;
                }
                folders.push(uri.fsPath);
            } catch {
                continue;
            }
        }
        if (folders.length === 0) {
            void vscode.window.showWarningMessage('请拖入一个本地文件夹。');
            return;
        }
        if (folders.length > 1) {
            void vscode.window.showWarningMessage('一次只能添加一个目录。');
            return;
        }
        const projectId = await this.projectIdForDrop(target, folders[0]);
        if (!projectId) {
            return;
        }
        await this.addOneModule(projectId, folders[0]);
    }

    async rename(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved) {
            return;
        }
        const current = nodeLabel(this.store.get(), resolved);
        const name = await askText('重命名', undefined, current);
        if (!name || name === current) {
            return;
        }
        if (await this.rejectDuplicate(parentOf(this.store.get(), resolved), name, resolved.id)) {
            return;
        }
        await this.store.update(current => renameNode(current, resolved, name));
    }

    async setColor(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved) {
            return;
        }
        const picked = await vscode.window.showQuickPick(
            [
                ...COLOR_PRESETS.map(preset => ({ label: preset.label, description: preset.hex, color: preset.hex })),
                { label: '自定义颜色', description: '#RRGGBB', color: '__custom__' },
                { label: '使用默认颜色', description: '清除自定义颜色', color: '' },
            ],
            { placeHolder: '选择颜色' },
        );
        if (!picked) {
            return;
        }
        let color: string | undefined;
        if (picked.color === '__custom__') {
            const custom = await askText('十六进制颜色', '#4C8DFF');
            if (!custom) {
                return;
            }
            color = custom;
        } else if (picked.color) {
            color = picked.color;
        }
        await this.store.update(current => setColor(current, resolved, color));
    }

    async setKind(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref, 'module');
        if (!resolved) {
            return;
        }
        const located = findNode(this.store.get(), resolved);
        const kind = located?.type === 'module'
            ? await askText('目录类型', '请输入自定义类型', located.module.kind)
            : undefined;
        if (!kind) {
            return;
        }
        await this.store.update(current => setModuleKind(current, resolved, kind));
    }

    async setPath(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref, 'module');
        if (!resolved) {
            return;
        }
        const located = findNode(this.store.get(), resolved);
        const current = located?.type === 'module' ? located.module.path : undefined;
        const folder = await this.pickFolder('选择新的模块目录', current);
        if (!folder) {
            return;
        }
        await this.store.update(current => setModulePath(current, resolved, folder));
    }

    async setDescription(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved) {
            return;
        }
        const located = findNode(this.store.get(), resolved);
        const current = located
            ? located.type === 'client'
                ? located.client.description
                : located.type === 'project'
                    ? located.project.description
                    : located.module.description
            : undefined;
        const description = await vscode.window.showInputBox({
            prompt: '说明，留空则清除',
            value: current ?? '',
        });
        if (description === undefined) {
            return;
        }
        await this.store.update(current => setDescription(current, resolved, description));
    }

    async edit(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved) {
            return;
        }
        const items = [
            { label: '重命名', action: 'rename' },
            { label: '设置颜色', action: 'color' },
            { label: '设置说明', action: 'description' },
            { label: '上移', action: 'up' },
            { label: '下移', action: 'down' },
        ];
        if (resolved.type === 'module') {
            items.splice(1, 0, { label: '设置路径', action: 'path' }, { label: '设置类型', action: 'kind' });
            items.push({ label: '复制路径', action: 'copy' }, { label: '在文件管理器中显示', action: 'reveal' });
        } else if (resolved.type === 'project') {
            items.splice(3, 0, { label: '添加模块', action: 'module' });
            items.push({ label: '以工作区打开', action: 'workspace' });
        } else {
            items.push({ label: '添加项目', action: 'project' }, { label: '以工作区打开', action: 'workspace' });
        }
        items.push({ label: '删除', action: 'remove' });
        const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择操作' });
        if (!picked) {
            return;
        }
        if (picked.action === 'rename') {
            await this.rename(resolved);
        } else if (picked.action === 'color') {
            await this.setColor(resolved);
        } else if (picked.action === 'description') {
            await this.setDescription(resolved);
        } else if (picked.action === 'path') {
            await this.setPath(resolved);
        } else if (picked.action === 'kind') {
            await this.setKind(resolved);
        } else if (picked.action === 'copy') {
            await this.copyPath(resolved);
        } else if (picked.action === 'reveal') {
            await this.reveal(resolved);
        } else if (picked.action === 'workspace') {
            await this.openWorkspace(resolved);
        } else if (picked.action === 'module') {
            await this.addModule(resolved.id);
        } else if (picked.action === 'project') {
            await this.addProject(resolved.id);
        } else if (picked.action === 'up' || picked.action === 'down') {
            await this.move(resolved, picked.action);
        } else if (picked.action === 'remove') {
            await this.remove(resolved);
        }
    }

    async remove(ref?: NodeRef): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved) {
            return;
        }
        const name = nodeLabel(this.store.get(), resolved);
        const choice = await vscode.window.showWarningMessage(
            `删除「${name}」？其下的项目和模块也会一并删除。`,
            { modal: true },
            '删除',
        );
        if (choice !== '删除') {
            return;
        }
        await this.store.update(current => removeNode(current, resolved));
    }

    async open(ref?: NodeRef, options?: { newWindow?: boolean; invert?: boolean }): Promise<void> {
        const resolved = await this.resolve(ref, 'module');
        if (!resolved) {
            return;
        }
        const located = findNode(this.store.get(), resolved);
        if (located?.type !== 'module') {
            return;
        }
        if (isFilePath(located.module.path) && !inspectPath(located.module.path).exists) {
            const choice = await vscode.window.showWarningMessage(
                `路径不存在：${located.module.path}`,
                '仍然打开',
                '修改路径',
            );
            if (choice === '修改路径') {
                await this.setPath(resolved);
                return;
            }
            if (choice !== '仍然打开') {
                return;
            }
        }
        const preferNew = vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('openInNewWindow', false);
        const newWindow = options?.newWindow ?? (options?.invert ? !preferNew : preferNew);
        await openPath(this.context, located.module.name, located.module.path, newWindow);
    }

    async openWorkspace(
        ref?: NodeRef,
        options?: { newWindow?: boolean; invert?: boolean; ask?: boolean },
    ): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved || resolved.type === 'module') {
            if (resolved?.type === 'module') {
                await this.open(resolved, options);
            }
            return;
        }
        const folders = collectFolders(this.store.get(), resolved);
        if (folders.length === 0) {
            void vscode.window.showWarningMessage('这个项目下还没有可打开的目录。');
            return;
        }
        const preferNew = vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>('openInNewWindow', false);
        let newWindow = preferNew;
        if (options?.newWindow !== undefined) {
            newWindow = options.newWindow;
        } else if (options?.ask === false) {
            newWindow = options.invert ? !preferNew : preferNew;
        } else {
            const picked = await vscode.window.showQuickPick(
                [
                    { label: '新窗口', description: `${folders.length} 个目录`, newWindow: true },
                    { label: '当前窗口', description: `${folders.length} 个目录`, newWindow: false },
                ],
                { placeHolder: `打开「${nodeLabel(this.store.get(), resolved)}」` },
            );
            if (!picked) {
                return;
            }
            newWindow = picked.newWindow;
        }
        await openFolders(this.context, nodeLabel(this.store.get(), resolved), folders, newWindow);
    }

    async reveal(ref?: NodeRef): Promise<void> {
        const located = await this.moduleOf(ref);
        if (!located) {
            return;
        }
        await revealPath(located.module.path);
    }

    async copyPath(ref?: NodeRef): Promise<void> {
        const located = await this.moduleOf(ref);
        if (!located) {
            return;
        }
        await vscode.env.clipboard.writeText(located.module.path);
        void vscode.window.showInformationMessage('已复制路径');
    }

    async move(ref: NodeRef | undefined, direction: 'up' | 'down'): Promise<void> {
        const resolved = await this.resolve(ref);
        if (!resolved) {
            return;
        }
        await this.store.update(current => moveNode(current, resolved, direction));
    }

    async moveByDrop(source: NodeRef, target: NodeRef): Promise<void> {
        const result = relocate(this.store.get(), source, target);
        if (!result.moved) {
            void vscode.window.showWarningMessage('不能放到这里。客户只能调整顺序，项目可拖到客户或其他项目，模块可拖到项目或其他模块。');
            return;
        }
        await this.store.update(result.catalog);
    }

    private async addOneModule(projectId: string, folder: string): Promise<void> {
        const name = await askText('目录名称', '请输入名称', basename(folder));
        if (!name) {
            return;
        }
        const kind = await askText('目录类型', '请输入自定义类型，例如：前端、API、配置');
        if (!kind) {
            return;
        }
        if (await this.rejectDuplicate({ type: 'project', id: projectId }, name)) {
            return;
        }
        const created = addModule(this.store.get(), projectId, { name, kind, path: folder });
        if (!await this.store.update(created.catalog)) {
            return;
        }
    }

    private async projectIdForDrop(target: NodeRef | undefined, firstFolder: string): Promise<string | undefined> {
        if (target?.type === 'project') {
            return target.id;
        }
        if (target?.type === 'module') {
            const located = findNode(this.store.get(), target);
            return located?.type === 'module' ? located.project.id : undefined;
        }
        const clientId = target?.type === 'client' ? target.id : await this.pickClient(true);
        if (!clientId) {
            return undefined;
        }
        return this.pickOrCreateProject(clientId, basename(firstFolder));
    }

    private async pickOrCreateProject(clientId: string, suggestedName: string): Promise<string | undefined> {
        const client = this.store.get().clients.find(item => item.id === clientId);
        if (!client) {
            return undefined;
        }
        if (client.projects.length === 0) {
            return this.createProject(clientId, suggestedName);
        }
        const picked = await vscode.window.showQuickPick(
            [
                { label: '$(add) 新建项目', id: '__new__' },
                ...client.projects.map(project => ({ label: project.name, id: project.id })),
            ],
            { placeHolder: '放到哪个项目？' },
        );
        if (!picked) {
            return undefined;
        }
        if (picked.id === '__new__') {
            return this.createProject(clientId, suggestedName);
        }
        return picked.id;
    }

    private async createProject(clientId: string, suggestedName: string): Promise<string | undefined> {
        const name = await askText('项目名称', undefined, suggestedName);
        if (!name) {
            return undefined;
        }
        if (await this.rejectDuplicate({ type: 'client', id: clientId }, name)) {
            return undefined;
        }
        const created = addProject(this.store.get(), clientId, {
            name,
            color: colorAt(this.projectCount(clientId)),
        });
        if (!await this.store.update(created.catalog)) {
            return undefined;
        }
        return created.project.id;
    }

    private async pickClient(allowCreate: boolean): Promise<string | undefined> {
        const clients = this.store.get().clients;
        if (clients.length === 0) {
            return allowCreate ? this.addClient() : undefined;
        }
        const picked = await vscode.window.showQuickPick(
            [
                ...(allowCreate ? [{ label: '$(add) 新建客户', id: '__new__' }] : []),
                ...clients.map(client => ({ label: client.name, description: client.description, id: client.id })),
            ],
            { placeHolder: '选择客户' },
        );
        if (!picked) {
            return undefined;
        }
        return picked.id === '__new__' ? this.addClient() : picked.id;
    }

    private async pickProject(): Promise<string | undefined> {
        const items = this.store.get().clients.flatMap(client => client.projects.map(project => ({
            label: project.name,
            description: client.name,
            id: project.id,
        })));
        if (items.length === 0) {
            const create = await vscode.window.showInformationMessage('还没有项目。', '添加项目');
            if (create === '添加项目') {
                await this.addProject();
            }
            return undefined;
        }
        const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择项目' });
        return picked?.id;
    }

    private async pickFolder(title: string, current?: string): Promise<string | undefined> {
        const uris = await vscode.window.showOpenDialog({
            title,
            openLabel: '选择文件夹',
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            defaultUri: current && isFilePath(current) ? vscode.Uri.file(current) : undefined,
        });
        return uris?.[0]?.fsPath;
    }

    private async resolve(ref?: NodeRef, expected?: NodeRef['type']): Promise<NodeRef | undefined> {
        if (ref && (!expected || ref.type === expected) && findNode(this.store.get(), ref)) {
            return ref;
        }
        return this.pickNode(expected);
    }

    private async pickNode(expected?: NodeRef['type']): Promise<NodeRef | undefined> {
        const items: Array<vscode.QuickPickItem & { ref: NodeRef }> = [];
        for (const client of this.store.get().clients) {
            if (!expected || expected === 'client') {
                items.push({ label: client.name, description: '客户', ref: { type: 'client', id: client.id } });
            }
            for (const project of client.projects) {
                if (!expected || expected === 'project') {
                    items.push({
                        label: `$(folder) ${project.name}`,
                        description: client.name,
                        ref: { type: 'project', id: project.id },
                    });
                }
                for (const module of project.modules) {
                    if (!expected || expected === 'module') {
                        items.push({
                            label: `$(folder) ${module.name}`,
                            description: `${client.name} / ${project.name}`,
                            ref: { type: 'module', id: module.id },
                        });
                    }
                }
            }
        }
        if (items.length === 0) {
            void vscode.window.showInformationMessage('还没有可选择的分组。');
            return undefined;
        }
        const picked = await vscode.window.showQuickPick(items, { placeHolder: '选择一项' });
        return picked?.ref;
    }

    private async moduleOf(ref?: NodeRef) {
        const resolved = await this.resolve(ref, 'module');
        if (!resolved) {
            return undefined;
        }
        const located = findNode(this.store.get(), resolved);
        return located?.type === 'module' ? located : undefined;
    }

    private async rejectDuplicate(parent: NodeRef | undefined, name: string, ignoreId?: string): Promise<boolean> {
        if (!hasSiblingName(this.store.get(), parent, name, ignoreId)) {
            return false;
        }
        const choice = await vscode.window.showWarningMessage(`同级已有名为「${name}」的项，仍然继续？`, { modal: true }, '继续');
        return choice !== '继续';
    }

    private projectCount(clientId: string): number {
        return this.store.get().clients.find(client => client.id === clientId)?.projects.length ?? 0;
    }
}

export function asNodeRef(value: unknown): NodeRef | undefined {
    if (isNodeRef(value)) {
        return value;
    }
    if (value && typeof value === 'object' && 'ref' in value) {
        const ref = (value as { ref?: unknown }).ref;
        return isNodeRef(ref) ? ref : undefined;
    }
    return undefined;
}

async function askText(prompt: string, placeHolder?: string, value?: string): Promise<string | undefined> {
    const text = await vscode.window.showInputBox({
        prompt,
        placeHolder,
        value,
        validateInput: input => input.trim() ? undefined : '不能为空',
    });
    return text?.trim();
}
