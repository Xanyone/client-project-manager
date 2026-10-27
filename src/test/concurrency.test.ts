import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { CatalogStore } from '../store.js';
import { ProjectActions } from '../actions.js';
import { addClient, addProject, emptyCatalog } from '../catalog.js';
import { CONFIG_SECTION, GLOBAL_STATE_KEY } from '../constants.js';
import { transaction, writeSnapshot, readSnapshot } from '../persistence.js';
import * as persistence from '../persistence.js';

suite('concurrent catalog transactions', () => {
    let sandbox: sinon.SinonSandbox;
    let directory: string;
    const stores: CatalogStore[] = [];
    setup(async () => {
        sandbox = sinon.createSandbox();
        directory = await mkdtemp(join(tmpdir(), 'dashboard-concurrency-'));
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({ get: (_key: string, fallback: unknown) => fallback } as vscode.WorkspaceConfiguration);
        sandbox.stub(vscode.workspace, 'onDidChangeConfiguration').returns({ dispose() {} });
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
    });
    teardown(async () => {
        stores.splice(0).forEach(store => store.dispose());
        sandbox.restore();
        await rm(directory, { recursive: true, force: true });
    });
    function createStore(): CatalogStore {
        // Separate Memento caches deliberately simulate different extension hosts.
        const values = new Map<string, unknown>([[GLOBAL_STATE_KEY, emptyCatalog()]]);
        const context = { globalStorageUri: vscode.Uri.file(directory), globalState: {
            get: (key: string) => values.get(key),
            update: async (key: string, value: unknown) => { values.set(key, value); },
        } } as unknown as vscode.ExtensionContext;
        const store = new CatalogStore(context);
        stores.push(store);
        return store;
    }

    test('preserves concurrent real add actions and rejects double submission', async () => {
        const store = createStore();
        const actions = new ProjectActions({} as vscode.ExtensionContext, store);
        const input = sandbox.stub(vscode.window, 'showInputBox');
        input.onCall(0).resolves('First'); input.onCall(1).resolves('Second');
        await Promise.all([actions.addClient(), actions.addClient()]);
        assert.deepEqual(store.get().clients.map(client => client.name), ['First', 'Second']);
        input.resolves('Third');
        const result = await Promise.allSettled([actions.addClient(), actions.addClient()]);
        assert.equal(result.filter(item => item.status === 'rejected').length, 1);
        assert.equal(store.get().clients.filter(client => client.name === 'Third').length, 1);
    });

    test('merges functional writes across isolated caches and rejects stale replacement', async () => {
        const first = createStore(); const second = createStore();
        await Promise.all([
            first.update(current => addClient(current, { name: 'Window A' }).catalog),
            second.update(current => addClient(current, { name: 'Window B' }).catalog),
        ]);
        const snapshot = await readSnapshot(join(directory, 'catalog.snapshot.json'));
        assert.deepEqual(snapshot!.catalog.clients.map(client => client.name).sort(), ['Window A', 'Window B']);
        await first.update(current => current);
        await second.update(current => addClient(current, { name: 'Window C' }).catalog);
        await assert.rejects(first.update(emptyCatalog()));
        assert.equal((await readSnapshot(join(directory, 'catalog.snapshot.json')))!.catalog.clients.length, 3);
    });

    test('fails closed on corrupt shared data and releases the lock after errors', async () => {
        const file = join(directory, 'catalog.snapshot.json');
        await writeFile(file, '{bad json');
        const store = createStore();
        await assert.rejects(store.update(current => addClient(current, { name: 'Lost' }).catalog));
        assert.equal(await readFile(file, 'utf8'), '{bad json');
        assert.equal(await store.backup(), '{bad json');
        await transaction(file, () => writeSnapshot(file, { mode: 'globalState', catalog: emptyCatalog() }));
        await store.update(current => addClient(current, { name: 'Recovered' }).catalog);
        assert.equal(store.get().clients[0].name, 'Recovered');
    });

    test('restores settings changes made while the host was stopped', async () => {
        const old = addClient(emptyCatalog(), { name: 'Old' }).catalog;
        const incoming = addClient(emptyCatalog(), { name: 'Synced' }).catalog;
        const file = join(directory, 'catalog.snapshot.json');
        await writeSnapshot(file, { mode: 'settings', catalog: old });
        (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
            get: (key: string, fallback: unknown) => key === 'storage' ? 'settings' : key === 'catalog' ? incoming : fallback,
            update: async () => undefined,
        });
        const store = createStore();
        await store.update(current => current);
        assert.equal(store.get().clients[0].name, 'Synced');
        assert.equal((await readSnapshot(file))!.catalog.clients[0].name, 'Synced');
    });

    test('serializes independent OS processes using the same heartbeat lock', async function () {
        this.timeout(15000);
        const file = join(directory, 'counter.json');
        await writeFile(file, '0');
        const modulePath = require.resolve('../persistence.js');
        const code = `const {transaction}=require(process.argv[1]);const fs=require('node:fs/promises');
            (async()=>{for(let i=0;i<5;i++){await transaction(process.argv[2],async()=>{
                const n=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
                await new Promise(r=>setTimeout(r,10));await fs.writeFile(process.argv[2],JSON.stringify(n+1));
            });}})().catch(e=>{console.error(e);process.exitCode=1;});`;
        await Promise.all([1, 2, 3].map(() => new Promise<void>((resolve, reject) => {
            const child = spawn(process.execPath, ['-e', code, modulePath, file], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
            let output = ''; child.stderr.on('data', data => { output += String(data); });
            child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(output)));
        })));
        assert.equal(await readFile(file, 'utf8'), '15');
    });

    test('creates the shared snapshot even when the first update is unchanged', async () => {
        const store = createStore();
        await store.update(current => current);
        assert.deepEqual((await readSnapshot(join(directory, 'catalog.snapshot.json')))!.catalog, emptyCatalog());
    });

    test('rolls back the backing store when the atomic snapshot write fails', async () => {
        const store = createStore();
        await store.update(current => addClient(current, { name: 'Original' }).catalog);
        const original = JSON.stringify(store.get());
        sandbox.stub(persistence, 'writeSnapshot').rejects(new Error('snapshot failed'));
        await assert.rejects(store.update(current => addClient(current, { name: 'Uncommitted' }).catalog), /snapshot failed/);
        assert.equal(JSON.stringify(store.get()), original);
        assert.equal(JSON.stringify((await readSnapshot(join(directory, 'catalog.snapshot.json')))!.catalog), original);
        // Removing the snapshot forces a read of the backing store, proving rollback.
        await rm(join(directory, 'catalog.snapshot.json'));
        (persistence.writeSnapshot as sinon.SinonStub).restore();
        await store.update(current => current);
        assert.equal(JSON.stringify(store.get()), original);
    });

    test('preserves the remote authority when selecting a module folder', async () => {
        const store = createStore();
        let projectId = '';
        await store.update(current => {
            const client = addClient(current, { name: 'Client' });
            const project = addProject(client.catalog, client.client.id, { name: 'Project' });
            projectId = project.project.id;
            return project.catalog;
        });
        const uri = vscode.Uri.parse('vscode-remote://ssh-remote+server/home/work/api');
        sandbox.stub(vscode.window, 'showOpenDialog').resolves([uri]);
        const input = sandbox.stub(vscode.window, 'showInputBox');
        input.onCall(0).resolves('API'); input.onCall(1).resolves('backend');
        const actions = new ProjectActions({} as vscode.ExtensionContext, store);
        await actions.addModule(projectId);
        assert.equal(store.get().clients[0].projects[0].modules[0].path, uri.toString());
    });

    test('honors a storage mode changed while the host was stopped', async () => {
        const catalog = addClient(emptyCatalog(), { name: 'Preserved' }).catalog;
        const file = join(directory, 'catalog.snapshot.json');
        await writeSnapshot(file, { mode: 'globalState', catalog });
        let settings: unknown;
        (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
            get: (key: string, fallback: unknown) => key === 'storage' ? 'settings' : key === 'catalog' ? settings : fallback,
            update: async (_key: string, value: unknown) => { settings = value; },
        });
        const store = createStore();
        await store.update(current => current);
        assert.equal(JSON.stringify(settings), JSON.stringify(catalog));
        assert.equal((await readSnapshot(file))!.mode, 'settings');
    });

    test('accepts repaired settings after corrupt settings put the store in protection mode', async () => {
        let settings: unknown = addClient(emptyCatalog(), { name: 'Original' }).catalog;
        let changed!: (event: vscode.ConfigurationChangeEvent) => unknown;
        (vscode.workspace.onDidChangeConfiguration as sinon.SinonStub).callsFake(listener => { changed = listener; return { dispose() {} }; });
        (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
            get: (key: string, fallback: unknown) => key === 'storage' ? 'settings' : key === 'catalog' ? settings : fallback,
            update: async (_key: string, value: unknown) => { settings = value; },
        });
        const store = createStore();
        await store.update(current => current);
        settings = { version: 999 };
        changed({ affectsConfiguration: key => key === `${CONFIG_SECTION}.catalog` } as vscode.ConfigurationChangeEvent);
        await store.backup();
        const repaired = addClient(emptyCatalog(), { name: 'Repaired' }).catalog;
        settings = repaired;
        changed({ affectsConfiguration: key => key === `${CONFIG_SECTION}.catalog` } as vscode.ConfigurationChangeEvent);
        await store.backup();
        assert.deepEqual(store.get(), repaired);
        assert.equal(JSON.stringify((await readSnapshot(join(directory, 'catalog.snapshot.json')))!.catalog), JSON.stringify(repaired));
    });
});
