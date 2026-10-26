import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('extension host', () => {
    test('command API is available', () => {
        assert.ok(vscode.commands);
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
});
