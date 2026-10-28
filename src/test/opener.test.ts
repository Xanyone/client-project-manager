import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { mkdtemp, readFile, rm, mkdir, writeFile, utimes, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openFolders, toUri } from '../opener.js';
import { safeFileName } from '../paths.js';
import { pathInspector } from '../pathInspector.js';

suite('workspace opening', () => {
    test('generates distinct workspaces for equal titles with different folders', async () => {
        const sandbox = sinon.createSandbox();
        const directory = await mkdtemp(join(tmpdir(), 'client-project-manager-test-'));
        try {
            const execute = sandbox.stub(vscode.commands, 'executeCommand').resolves();
            const context = { globalStorageUri: vscode.Uri.file(directory) } as vscode.ExtensionContext;
            await openFolders(context, 'same title', [{ name: 'web', location: 'D:/one' }, { name: 'web', location: 'D:/two' }], false);
            await openFolders(context, 'same title', [{ name: 'web', location: 'D:/three' }, { name: 'web', location: 'D:/four' }], false);
            const opens = execute.getCalls().filter(call => call.args[0] === 'vscode.openFolder');
            const first = opens[0].args[1] as vscode.Uri;
            const second = opens[1].args[1] as vscode.Uri;
            assert.notEqual(first.toString(), second.toString());
            const content = JSON.parse(await readFile(first.fsPath, 'utf8'));
            assert.deepEqual(content.folders.map((folder: { name: string }) => folder.name), ['web', 'web (2)']);
            assert.ok(content.folders.every((folder: { path: string }) => folder.path));
        } finally { sandbox.restore(); await rm(directory, { recursive: true, force: true }); }
    });

    test('handles local paths, remote URIs and reserved Windows names', async () => {
        assert.equal(toUri('D:/projects/a').scheme, 'file');
        assert.equal(toUri('vscode-remote://ssh-remote+host/home/a').scheme, 'vscode-remote');
        assert.equal(safeFileName('CON'), '_CON');
        assert.equal(safeFileName('project... '), 'project');
        assert.equal((await pathInspector.inspect(__filename)).exists, false);
    });

    test('deduplicates folders and tolerates unavailable recent-list commands', async () => {
        const sandbox = sinon.createSandbox();
        const directory = await mkdtemp(join(tmpdir(), 'client-project-manager-open-'));
        try {
            const execute = sandbox.stub(vscode.commands, 'executeCommand').callsFake(async command => {
                if (command !== 'vscode.openFolder') { throw new Error('command unavailable'); }
                return undefined;
            });
            const context = { globalStorageUri: vscode.Uri.file(directory) } as vscode.ExtensionContext;
            await openFolders(context, 'Project', [{ name: 'A', location: 'C:/work/api' }, { name: 'B', location: 'c:/WORK/api/' }], false);
            const call = execute.getCalls().find(item => item.args[0] === 'vscode.openFolder')!;
            assert.equal((call.args[1] as vscode.Uri).scheme, 'file');
            assert.ok(!(call.args[1] as vscode.Uri).path.endsWith('.code-workspace'));
            await openFolders(context, 'Project', [{ name: 'A', location: 'C:/one' }, { name: 'B', location: 'C:/two' }], true);
        } finally { sandbox.restore(); await rm(directory, { recursive: true, force: true }); }
    });

    test('cleans only old generated workspaces when window state is known', async () => {
        const sandbox = sinon.createSandbox();
        const directory = await mkdtemp(join(tmpdir(), 'client-project-manager-clean-'));
        try {
            sandbox.stub(vscode.commands, 'executeCommand').resolves();
            const root = join(directory, 'extension');
            const workspaces = join(root, 'workspaces');
            await mkdir(workspaces, { recursive: true });
            const stale = join(workspaces, 'old-123456789abc.code-workspace');
            const staleNewWindow = join(workspaces, 'old-01234567-89ab-4cde-8fab-0123456789ab.code-workspace');
            const recentNewWindow = join(workspaces, 'recent-01234567-89ab-4cde-8fab-0123456789ab.code-workspace');
            const active = join(workspaces, 'active-123456789abc.code-workspace');
            const custom = join(workspaces, 'manual.code-workspace');
            for (const file of [stale, staleNewWindow, active, custom]) { await writeFile(file, '{}'); await utimes(file, 1, 1); }
            await writeFile(recentNewWindow, '{}');
            await writeFile(join(directory, 'storage.json'), JSON.stringify({ windowsState: { openedWindows: [{ workspace: { configPath: vscode.Uri.file(active).toString() } }] } }));
            const context = { globalStorageUri: vscode.Uri.file(root) } as vscode.ExtensionContext;
            await openFolders(context, 'Project', [{ name: 'A', location: 'C:/one' }, { name: 'B', location: 'C:/two' }], false);
            await assert.rejects(access(stale));
            await assert.rejects(access(staleNewWindow));
            await access(active); await access(custom); await access(recentNewWindow);
        } finally { sandbox.restore(); await rm(directory, { recursive: true, force: true }); }
    });
});
