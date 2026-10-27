import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { shouldOpenDashboard } from '../extension.js';

suite('extension host', () => {
    test('honors explicit startup preferences in empty and folder windows', () => {
        for (const hasFolder of [false, true]) {
            assert.equal(shouldOpenDashboard('never', hasFolder), false);
            assert.equal(shouldOpenDashboard('always', hasFolder), true);
            assert.equal(shouldOpenDashboard('emptyWindow', hasFolder), !hasFolder);
        }
    });
    test('activates the extension and registers every contributed command', async () => {
        const extension = vscode.extensions.getExtension('Xanyone.client-project-dashboard');
        assert.ok(extension);
        await extension.activate();
        assert.equal(extension.isActive, true);
        const registered = new Set(await vscode.commands.getCommands(true));
        const manifest = extension.packageJSON as { contributes: { commands: Array<{ command: string }> } };
        for (const command of manifest.contributes.commands) {
            assert.ok(registered.has(command.command), `Missing command: ${command.command}`);
        }
    });

    test('opens the dashboard by default and keeps the sidebar opt-in', async () => {
        const extension = vscode.extensions.getExtension('Xanyone.client-project-dashboard')!;
        await extension.activate();
        const configuration = vscode.workspace.getConfiguration('clientProjectDashboard');
        assert.equal(configuration.inspect('openOnStartup')?.defaultValue, 'always');
        assert.equal(configuration.inspect('showSidebar')?.defaultValue, false);
        const view = extension.packageJSON.contributes.views.clientProjectDashboard[0];
        assert.equal(view.when, 'config.clientProjectDashboard.showSidebar');
        const container = extension.packageJSON.contributes.viewsContainers.activitybar[0];
        assert.equal(container.when, 'config.clientProjectDashboard.showSidebar');
        assert.ok(vscode.window.tabGroups.all.some(group => group.tabs.some(tab =>
            tab.input instanceof vscode.TabInputWebview && tab.input.viewType.includes('clientProjectDashboard.panel'),
        )), 'Expected the dashboard tab to be opened by activation');
    });
});
