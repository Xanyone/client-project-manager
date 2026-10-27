import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { PathInspector } from '../pathInspector.js';

suite('asynchronous path inspection', () => {

    test('coalesces equivalent paths and respects cache invalidation', async () => {
        const stat = sinon.stub().resolves({ type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 });
        const pathInspector = new PathInspector(stat);
        const [first, second] = await Promise.all([pathInspector.inspect('C:/Work/API'), pathInspector.inspect('c:/work/api/')]);
        assert.deepEqual(first, { exists: true, git: true });
        assert.deepEqual(second, first);
        assert.equal(stat.callCount, 2);
        pathInspector.clear();
        await pathInspector.inspect('C:/Work/API');
        assert.equal(stat.callCount, 4);
    });

    test('limits concurrent filesystem calls and checks remote directory status', async () => {
        let active = 0; let maximum = 0;
        const pathInspector = new PathInspector(async uri => {
            active++; maximum = Math.max(active, maximum);
            await new Promise(resolve => setTimeout(resolve, 2));
            active--;
            if (uri.path.endsWith('/.git')) { throw vscode.FileSystemError.FileNotFound(); }
            return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
        });
        const results = await Promise.all(Array.from({ length: 64 }, (_, i) => pathInspector.inspect(`vscode-remote://ssh-remote+host/home/project${i}`)));
        assert.ok(maximum <= 16);
        assert.ok(results.every(result => result.exists && !result.git));
    });

    test('reports missing paths and ordinary files correctly', async () => {
        const stat = sinon.stub();
        const pathInspector = new PathInspector(stat);
        stat.onFirstCall().rejects(vscode.FileSystemError.FileNotFound());
        stat.onSecondCall().resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 });
        assert.deepEqual(await pathInspector.inspect('C:/missing'), { exists: false, git: false });
        assert.deepEqual(await pathInspector.inspect('C:/file'), { exists: false, git: false });
    });
});
