import * as vscode from 'vscode';
import { setLanguage } from './i18n.js';
import { ProjectActions } from './actions.js';
import { CONFIG_SECTION, VIEW_ID } from './constants.js';
import { registerCommands } from './commands.js';
import { DashboardPanel } from './dashboardPanel.js';
import { CatalogStore } from './store.js';
import { ProjectTreeProvider } from './treeProvider.js';

export function activate(context: vscode.ExtensionContext): void {
    setLanguage(vscode.env.language);
    const store = new CatalogStore(context);
    const actions = new ProjectActions(context, store);
    const tree = new ProjectTreeProvider(store, actions);
    const dashboard = new DashboardPanel(context, store, actions);
    const treeView = vscode.window.createTreeView(VIEW_ID, {
        treeDataProvider: tree,
        dragAndDropController: tree,
        showCollapseAll: true,
    });

    context.subscriptions.push(
        store,
        tree,
        treeView,
        dashboard,
        ...registerCommands(actions, dashboard, tree, store),
        store.onDidChange(() => {
            tree.refresh();
            dashboard.update();
        }),
    );

    const startup = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>('openOnStartup', 'always');
    const hasFolder = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
    if (shouldOpenDashboard(startup, hasFolder)) {
        dashboard.show();
    }
}

export function deactivate(): void {}

export function shouldOpenDashboard(startup: string, hasFolder: boolean): boolean {
    return startup === 'always' || (startup === 'emptyWindow' && !hasFolder);
}
