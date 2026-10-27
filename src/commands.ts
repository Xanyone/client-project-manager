import * as vscode from 'vscode';
import { pathInspector } from './pathInspector.js';
import { asNodeRef, type ProjectActions } from './actions.js';
import { COMMANDS } from './constants.js';
import type { DashboardPanel } from './dashboardPanel.js';
import type { CatalogStore } from './store.js';
import type { ProjectTreeProvider } from './treeProvider.js';
import type { NodeRef } from './types.js';

export function registerCommands(
    actions: ProjectActions,
    dashboard: DashboardPanel,
    tree: ProjectTreeProvider,
    store: CatalogStore,
): vscode.Disposable[] {
    const bind = (handler: (ref?: NodeRef) => Promise<unknown>) => {
        return async (arg?: unknown) => {
            try {
                await handler(asNodeRef(arg));
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                void vscode.window.showErrorMessage(message);
            }
        };
    };

    return [
        vscode.commands.registerCommand(COMMANDS.exportCatalog, bind(() => actions.exportCatalog())),
        vscode.commands.registerCommand(COMMANDS.importCatalog, bind(() => actions.importCatalog())),
        vscode.commands.registerCommand(COMMANDS.openDashboard, async () => {
            dashboard.show();
        }),
        vscode.commands.registerCommand(COMMANDS.refresh, () => {
            pathInspector.clear();
            store.reload();
            tree.refresh();
            dashboard.update();
        }),
        vscode.commands.registerCommand(COMMANDS.addClient, bind(() => actions.addClient())),
        vscode.commands.registerCommand(COMMANDS.addProject, bind(ref => actions.addProject(ref?.type === 'client' ? ref.id : undefined))),
        vscode.commands.registerCommand(COMMANDS.addModule, bind(ref => actions.addModule(ref?.type === 'project' ? ref.id : undefined))),
        vscode.commands.registerCommand(COMMANDS.rename, bind(ref => actions.rename(ref))),
        vscode.commands.registerCommand(COMMANDS.setColor, bind(ref => actions.setColor(ref))),
        vscode.commands.registerCommand(COMMANDS.setKind, bind(ref => actions.setKind(ref))),
        vscode.commands.registerCommand(COMMANDS.manageFolderTypes, bind(() => actions.manageFolderTypes())),
        vscode.commands.registerCommand(COMMANDS.setPath, bind(ref => actions.setPath(ref))),
        vscode.commands.registerCommand(COMMANDS.setDescription, bind(ref => actions.setDescription(ref))),
        vscode.commands.registerCommand(COMMANDS.edit, bind(ref => actions.edit(ref))),
        vscode.commands.registerCommand(COMMANDS.remove, bind(ref => actions.remove(ref))),
        vscode.commands.registerCommand(COMMANDS.open, bind(ref => actions.open(ref))),
        vscode.commands.registerCommand(COMMANDS.openInNewWindow, bind(ref => actions.open(ref, { newWindow: true }))),
        vscode.commands.registerCommand(COMMANDS.openWorkspace, bind(ref => actions.openWorkspace(ref))),
        vscode.commands.registerCommand(COMMANDS.reveal, bind(ref => actions.reveal(ref))),
        vscode.commands.registerCommand(COMMANDS.copyPath, bind(ref => actions.copyPath(ref))),
        vscode.commands.registerCommand(COMMANDS.moveUp, bind(ref => actions.move(ref, 'up'))),
        vscode.commands.registerCommand(COMMANDS.moveDown, bind(ref => actions.move(ref, 'down'))),
    ];
}
