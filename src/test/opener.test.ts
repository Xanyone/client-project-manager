import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openFolders, toUri } from '../opener.js';
import { inspectPath, safeFileName } from '../paths.js';

suite('workspace opening', () => {
    test('generates distinct workspaces for equal titles with different folders', async () => {
        const sandbox = sinon.createSandbox();
        const directory = await mkdtemp(join(tmpdir(), 'project-dashboard-test-'));
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

    test('handles local paths, remote URIs and reserved Windows names', () => {
        assert.equal(toUri('D:/projects/a').scheme, 'file');
        assert.equal(toUri('vscode-remote://ssh-remote+host/home/a').scheme, 'vscode-remote');
        assert.equal(safeFileName('CON'), '_CON');
        assert.equal(safeFileName('project... '), 'project');
        assert.equal(inspectPath(__filename).exists, false);
    });
});
