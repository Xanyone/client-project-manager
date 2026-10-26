import { countMessage, t } from './i18n.js';
import * as vscode from 'vscode';
import type { ProjectActions } from './actions.js';
import { findNode, parentOf } from './catalog.js';
import { TREE_MIME } from './constants.js';
import { inspectPath } from './paths.js';
import type { CatalogStore } from './store.js';
import { type NodeRef, isNodeRef } from './types.js';

export class ProjectTreeItem extends vscode.TreeItem {
    constructor(
        public readonly ref: NodeRef,
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
    ) {
        super(label, collapsibleState);
        this.id = ref.id;
        this.contextValue = ref.type;
    }
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem>, vscode.TreeDragAndDropController<ProjectTreeItem> {
    private readonly emitter = new vscode.EventEmitter<ProjectTreeItem | undefined | void>();
    readonly onDidChangeTreeData = this.emitter.event;
    readonly dropMimeTypes = [TREE_MIME, 'text/uri-list', 'application/vnd.code.uri-list'];
    readonly dragMimeTypes = [TREE_MIME];

    constructor(
        private readonly store: CatalogStore,
        private readonly actions: ProjectActions,
    ) {}

    dispose(): void {
        this.emitter.dispose();
    }

    refresh(): void {
        this.emitter.fire();
    }

    getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ProjectTreeItem): ProjectTreeItem[] {
        const catalog = this.store.get();
        if (!element) {
            return catalog.clients.map(client => this.createItem({ type: 'client', id: client.id }));
        }
        const located = findNode(catalog, element.ref);
        if (located?.type === 'client') {
            return located.client.projects.map(project => this.createItem({ type: 'project', id: project.id }));
        }
        if (located?.type === 'project') {
            return located.project.modules.map(module => this.createItem({ type: 'module', id: module.id }));
        }
        return [];
    }

    getParent(element: ProjectTreeItem): ProjectTreeItem | undefined {
        const parent = parentOf(this.store.get(), element.ref);
        return parent ? this.createItem(parent) : undefined;
    }

    handleDrag(source: readonly ProjectTreeItem[], dataTransfer: vscode.DataTransfer): void {
        dataTransfer.set(TREE_MIME, new vscode.DataTransferItem(JSON.stringify(source.map(item => item.ref))));
    }

    async handleDrop(target: ProjectTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const dragged = await readDraggedRef(dataTransfer);
        if (dragged) {
            if (!target) {
                void vscode.window.showWarningMessage(t("Drop onto another client, project, or module."));
                return;
            }
            await this.actions.moveByDrop(dragged, target.ref);
            return;
        }
        const uris = await readDroppedUris(dataTransfer);
        if (uris.length > 0) {
            await this.actions.addDroppedFolders(target?.ref, uris);
        }
    }

    private createItem(ref: NodeRef): ProjectTreeItem {
        const located = findNode(this.store.get(), ref);
        if (located?.type === 'client') {
            const item = new ProjectTreeItem(ref, located.client.name, vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('organization');
            item.description = located.client.description ?? countMessage("{0} project", "{0} projects", located.client.projects.length);
            item.tooltip = tooltip(located.client.name, located.client.description, countMessage("{0} project", "{0} projects", located.client.projects.length));
            return item;
        }
        if (located?.type === 'project') {
            const item = new ProjectTreeItem(ref, located.project.name, vscode.TreeItemCollapsibleState.Expanded);
            item.iconPath = new vscode.ThemeIcon('repo');
            item.description = located.project.description ?? countMessage("{0} module", "{0} modules", located.project.modules.length);
            item.tooltip = tooltip(
                `${located.client.name} / ${located.project.name}`,
                located.project.description,
                countMessage("{0} module", "{0} modules", located.project.modules.length),
            );
            return item;
        }
        if (located?.type === 'module') {
            const item = new ProjectTreeItem(ref, located.module.name, vscode.TreeItemCollapsibleState.None);
            item.iconPath = new vscode.ThemeIcon('folder');
            const inspected = inspectPath(located.module.path);
            item.description = inspected.exists
                ? located.module.kind
                : t("{0} · Path does not exist", located.module.kind);
            item.tooltip = tooltip(
                located.module.name,
                `${located.module.kind}${inspected.git ? ' · Git' : ''}`,
                located.module.path,
            );
            item.command = {
                command: 'clientProjectDashboard.open',
                title: t("Open"),
                arguments: [ref],
            };
            return item;
        }
        return new ProjectTreeItem(ref, t("Unknown item"), vscode.TreeItemCollapsibleState.None);
    }
}

async function readDraggedRef(dataTransfer: vscode.DataTransfer): Promise<NodeRef | undefined> {
    const item = dataTransfer.get(TREE_MIME);
    if (!item) {
        return undefined;
    }
    try {
        const raw = typeof item.value === 'string' ? item.value : await item.asString();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0 || !isNodeRef(parsed[0])) {
            return undefined;
        }
        if (parsed.length > 1) {
            void vscode.window.showWarningMessage(t("Drag one item at a time."));
            return undefined;
        }
        return parsed[0];
    } catch {
        return undefined;
    }
}

async function readDroppedUris(dataTransfer: vscode.DataTransfer): Promise<vscode.Uri[]> {
    const item = dataTransfer.get('text/uri-list') ?? dataTransfer.get('application/vnd.code.uri-list');
    if (!item) {
        return [];
    }
    const raw = typeof item.value === 'string' ? item.value : await item.asString();
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((entry): entry is string => typeof entry === 'string')
                    .map(entry => vscode.Uri.parse(entry));
            }
        } catch {
            return [];
        }
    }
    return trimmed
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => vscode.Uri.parse(line));
}

function tooltip(title: string, ...lines: Array<string | undefined>): vscode.MarkdownString {
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendText(title);
    for (const line of lines) {
        if (!line) {
            continue;
        }
        markdown.appendMarkdown('\n\n');
        markdown.appendText(line);
    }
    return markdown;
}
