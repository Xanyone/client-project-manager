import { getLanguage, getMessages, t } from './i18n.js';
import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import type { ProjectActions } from './actions.js';
import { DEFAULT_KIND_COLOR, CONFIG_SECTION, colorAt } from './constants.js';
import { inspectPath } from './paths.js';
import type { CatalogStore } from './store.js';
import {
    type DashboardModel,
    type NodeRef,
    isNodeType,
} from './types.js';

export class DashboardPanel implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private readonly configurationListener: vscode.Disposable;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly store: CatalogStore,
        private readonly actions: ProjectActions,
    ) {
        this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(CONFIG_SECTION)) {
                this.update();
            }
        });
    }

    show(): void {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Active);
            this.update();
            return;
        }
        this.panel = vscode.window.createWebviewPanel(
            'clientProjectDashboard.panel',
            t("Client Project Dashboard"),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
            },
        );
        this.panel.webview.html = dashboardHtml(this.panel.webview, this.context.extensionUri);
        const messageListener = this.panel.webview.onDidReceiveMessage(message => {
            void this.onMessage(message);
        });
        this.panel.onDidDispose(() => {
            messageListener.dispose();
            this.panel = undefined;
        });
        this.update();
    }

    update(): void {
        if (this.panel) {
            void this.panel.webview.postMessage({ type: 'render', model: this.model() });
        }
    }

    dispose(): void {
        this.panel?.dispose();
        this.configurationListener.dispose();
    }

    private model(): DashboardModel {
        const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
        const kinds = [...new Set(this.store.get().clients.flatMap(client =>
            client.projects.flatMap(project => project.modules.map(module => module.kind)),
        ))];
        return {
            openInNewWindow: config.get<boolean>('openInNewWindow', false),
            showPath: config.get<boolean>('showPath', true),
            kinds: kinds.map(kind => ({
                id: kind,
                label: kind,
                color: DEFAULT_KIND_COLOR,
            })),
            clients: this.store.get().clients.map((client, clientIndex) => ({
                id: client.id,
                name: client.name,
                description: client.description ?? '',
                color: client.color ?? colorAt(clientIndex),
                projects: client.projects.map((project, projectIndex) => ({
                    id: project.id,
                    name: project.name,
                    description: project.description ?? '',
                    color: project.color ?? colorAt(projectIndex + 1),
                    modules: project.modules.map(module => {
                        const inspected = inspectPath(module.path);
                        return {
                            id: module.id,
                            name: module.name,
                            kind: module.kind,
                            kindLabel: module.kind,
                            path: module.path,
                            description: module.description ?? '',
                            color: module.color ?? DEFAULT_KIND_COLOR,
                            exists: inspected.exists,
                            git: inspected.git,
                        };
                    }),
                })),
            })),
        };
    }

    private async onMessage(message: unknown): Promise<void> {
        if (!message || typeof message !== 'object') {
            return;
        }
        const record = message as Record<string, unknown>;
        const ref = readRef(record);
        try {
            switch (record.type) {
                case 'ready':
                    this.update();
                    break;
                case 'export':
                    await this.actions.exportCatalog();
                    break;
                case 'import':
                    await this.actions.importCatalog();
                    break;
                case 'open':
                    if (ref && ref.type !== 'module') {
                        await this.actions.openWorkspace(ref, { invert: record.invert === true, ask: false });
                    } else {
                        await this.actions.open(ref, { invert: record.invert === true });
                    }
                    break;
                case 'open-new':
                    await this.actions.open(ref, { newWindow: true });
                    break;
                case 'add-client':
                    await this.actions.addClient();
                    break;
                case 'add-project':
                    await this.actions.addProject(ref?.type === 'client' ? ref.id : undefined);
                    break;
                case 'add-module':
                    await this.actions.addModule(ref?.type === 'project' ? ref.id : undefined);
                    break;
                case 'edit':
                    await this.actions.edit(ref);
                    break;
                case 'remove':
                    await this.actions.remove(ref);
                    break;
                case 'reveal':
                    await this.actions.reveal(ref);
                    break;
                case 'workspace':
                    await this.actions.openWorkspace(ref);
                    break;
                case 'move':
                    if (record.direction === 'up' || record.direction === 'down') {
                        await this.actions.move(ref, record.direction);
                    }
                    break;
                default:
                    break;
            }
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(text);
        }
    }
}

function readRef(record: Record<string, unknown>): NodeRef | undefined {
    if (typeof record.id !== 'string' || !record.id || !isNodeType(record.nodeType)) {
        return undefined;
    }
    return { type: record.nodeType, id: record.id };
}

export function dashboardHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const nonce = createNonce();
    const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.css'));
    const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'dashboard.js'));
    const csp = [
        "default-src 'none'",
        `style-src ${webview.cspSource}`,
        `script-src 'nonce-${nonce}' ${webview.cspSource}`,
        `img-src ${webview.cspSource} data:`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="${getLanguage()}" data-messages="${escapeHtml(JSON.stringify(getMessages()))}">
<head>
	<meta charset="UTF-8">
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<link rel="stylesheet" href="${css}">
	<title>${escapeHtml(t("Client Project Dashboard"))}</title>
</head>
<body>
	<div class="app">
		<header class="topbar">
			<div class="topbar-main">
				<div class="brand">
					<span class="logo" aria-hidden="true">
						<svg viewBox="0 0 16 16" width="16" height="16">
							<rect x="1" y="1" width="14" height="4.5" rx="0.5"></rect>
							<rect x="1" y="7.25" width="6.25" height="7.75" rx="0.5"></rect>
							<rect x="8.75" y="7.25" width="6.25" height="7.75" rx="0.5"></rect>
						</svg>
					</span>
					<h1>${escapeHtml(t("Dashboard"))}</h1>
					<p class="brand-path">${escapeHtml(t("Client"))}<span class="slash" aria-hidden="true">/</span>${escapeHtml(t("Project"))}<span class="slash" aria-hidden="true">/</span>${escapeHtml(t("Folder"))}</p>
				</div>
				<div class="search-field">
					<svg class="search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
						<path fill="none" stroke="currentColor" stroke-width="1.4" d="M10.2 10.2 13 13"></path>
					</svg>
					<input id="search" type="search" placeholder="${escapeHtml(t("Search clients, projects, or folders"))}" aria-label="${escapeHtml(t("Search"))}" title="${escapeHtml(t("Ctrl/Cmd+F to focus search"))}">
				</div>
			</div>
			<div id="metrics" class="metrics" aria-label="${escapeHtml(t("Catalog statistics"))}"></div>
		</header>
		<div class="shell" id="stage">
			<div class="stage-tools">
				<div id="filters" class="filters" role="toolbar" aria-label="${escapeHtml(t("Filter by type"))}"></div>
                <div class="fold-actions">
                    <button type="button" class="text-action" data-action="add-client">${escapeHtml(t("Add client"))}</button>
                    <button type="button" class="text-action" data-action="import">${escapeHtml(t("Import"))}</button>
                    <button type="button" class="text-action" data-action="export">${escapeHtml(t("Back up"))}</button>
                </div>
			</div>
			<div id="list" class="stage-body"></div>
		</div>
	</div>
	<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}

function createNonce(): string {
    return randomBytes(24).toString('base64');
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]!);
}
