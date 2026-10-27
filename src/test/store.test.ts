import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { CatalogStore } from '../store.js';
import { addClient, emptyCatalog } from '../catalog.js';
import { CONFIG_SECTION, GLOBAL_STATE_KEY } from '../constants.js';

suite('catalog storage', () => {
    let sandbox: sinon.SinonSandbox;
    let store: CatalogStore;
    let values: Map<string, unknown>;
    let mode: string;
    let settings: unknown;
    let change: (event: vscode.ConfigurationChangeEvent) => unknown;
    let write: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        values = new Map([[GLOBAL_STATE_KEY, emptyCatalog()]]);
        mode = 'globalState';
        settings = null;
        write = sandbox.stub().callsFake(async (key: string, value: unknown) => { values.set(key, value); });
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: (key: string, fallback: unknown) => key === 'storage' ? mode : key === 'catalog' ? settings : fallback,
            update: async (_key: string, value: unknown) => { settings = value; },
        } as unknown as vscode.WorkspaceConfiguration);
        sandbox.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake(listener => {
            change = listener;
            return { dispose() {} };
        });
        sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);
        sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);
        store = createStore();
    });

    teardown(() => { store.dispose(); sandbox.restore(); });

    function createStore(): CatalogStore {
        return new CatalogStore({ globalState: { get: (key: string) => values.get(key), update: write } } as unknown as vscode.ExtensionContext);
    }

    test('commits only after persistence succeeds and recovers after a failed save', async () => {
        const next = addClient(emptyCatalog(), { name: 'customer' }).catalog;
        write.onFirstCall().rejects(new Error('disk full'));
        await assert.rejects(store.update(next), /disk full/);
        assert.equal(store.get().clients.length, 0);
        assert.equal(await store.update(next), true);
        assert.equal(store.get().clients.length, 1);
    });

    test('cancelling corrupt-data overwrite returns false without writing', async () => {
        store.dispose();
        values.set(GLOBAL_STATE_KEY, { version: 999 });
        store = createStore();
        assert.equal(await store.update(emptyCatalog()), false);
        assert.equal(write.callCount, 0);
        assert.deepEqual(values.get(GLOBAL_STATE_KEY), { version: 999 });
    });

    test('serializes concurrent functional updates', async () => {
        await Promise.all([
            store.update(current => addClient(current, { name: 'first' }).catalog),
            store.update(current => addClient(current, { name: 'second' }).catalog),
        ]);
        assert.deepEqual(store.get().clients.map(client => client.name), ['first', 'second']);
    });

    test('migrates the current catalog when switching storage in either direction', async () => {
        await store.update(current => addClient(current, { name: 'first' }).catalog);
        mode = 'settings';
        change({ affectsConfiguration: key => key === `${CONFIG_SECTION}.storage` } as vscode.ConfigurationChangeEvent);
        await store.update(current => addClient(current, { name: 'second' }).catalog);
        mode = 'globalState';
        change({ affectsConfiguration: key => key === `${CONFIG_SECTION}.storage` } as vscode.ConfigurationChangeEvent);
        await store.update(current => current);
        assert.deepEqual(store.get().clients.map(client => client.name), ['first', 'second']);
        assert.ok(values.get(`${GLOBAL_STATE_KEY}.backup.globalState`));
        store.reload();
        assert.equal(store.get().clients.length, 2);
    });

    test('keeps the original storage usable after a migration backup failure', async () => {
        await store.update(current => addClient(current, { name: 'first' }).catalog);
        write.onCall(write.callCount).rejects(new Error('backup failed'));
        mode = 'settings';
        change({ affectsConfiguration: key => key === `${CONFIG_SECTION}.storage` } as vscode.ConfigurationChangeEvent);
        await store.update(current => addClient(current, { name: 'second' }).catalog);
        assert.equal(settings, null);
        assert.equal((values.get(GLOBAL_STATE_KEY) as { clients: unknown[] }).clients.length, 2);
    });

    test('does not persist an unchanged catalog', async () => {
        await store.update(current => current);
        assert.equal(write.callCount, 0);
    });

    test('keeps corrupt data protected when changing storage mode', async () => {
        store.dispose();
        const original = { version: 999 };
        values.set(GLOBAL_STATE_KEY, original);
        store = createStore();
        mode = 'settings';
        change({ affectsConfiguration: key => key === `${CONFIG_SECTION}.storage` } as vscode.ConfigurationChangeEvent);
        assert.equal(await store.update(emptyCatalog()), false);
        assert.equal(write.callCount, 0);
        assert.deepEqual(values.get(GLOBAL_STATE_KEY), original);
    });

    test('treats an invalid configured storage mode as globalState', async () => {
        (vscode.workspace.getConfiguration as sinon.SinonStub).returns({
            get: (key: string, fallback: unknown) => key === 'storage' ? 'invalid-mode' : key === 'catalog' ? settings : fallback,
            update: async (_key: string, value: unknown) => { settings = value; },
        });
        store.dispose();
        store = createStore();
        await store.update(current => addClient(current, { name: 'Client' }).catalog);
        assert.equal((values.get(GLOBAL_STATE_KEY) as { clients: unknown[] }).clients.length, 1);
        assert.equal(settings, null);
    });

    test('exports original duplicate data instead of the protected empty view', async () => {
        store.dispose();
        const original = { version: 1, clients: [{ id: 'a', name: 'Client' }, { id: 'b', name: 'client' }] };
        values.set(GLOBAL_STATE_KEY, original);
        store = createStore();
        assert.equal(store.get().clients.length, 0);
        assert.deepEqual(JSON.parse(await store.backup()), original);
        assert.equal(await store.update(emptyCatalog()), false);
    });
});
