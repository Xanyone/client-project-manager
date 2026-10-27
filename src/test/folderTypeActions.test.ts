import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { addClient, addModule, addProject, emptyCatalog } from '../catalog.js';
import { ProjectActions } from '../actions.js';
import type { CatalogStore } from '../store.js';
import type { Catalog } from '../types.js';
import { setLanguage } from '../i18n.js';
import { pathInspector } from '../pathInspector.js';
import { ProjectTreeProvider } from '../treeProvider.js';
import { DashboardPanel } from '../dashboardPanel.js';

suite('folder type workflows', () => {
    let sandbox: sinon.SinonSandbox;
    let catalog: Catalog;
    let actions: ProjectActions;
    let store: CatalogStore;
    let projectId: string;
    let moduleId: string;
    let settings: Map<string, unknown>;
    let pick: sinon.SinonStub;
    let input: sinon.SinonStub;
    let update: sinon.SinonStub;
    let configUpdate: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        setLanguage('en');
        const client = addClient(emptyCatalog(), { name: 'Client' });
        const project = addProject(client.catalog, client.client.id, { name: 'Project' });
        projectId = project.project.id;
        const module = addModule(project.catalog, projectId, { name: 'Legacy', kind: 'Legacy', path: 'C:/legacy' });
        catalog = module.catalog;
        moduleId = module.module.id;
        settings = new Map([['defaultFolderType', 'builtin:api']]);
        configUpdate = sandbox.stub().callsFake(async (key: string, value: unknown) => { settings.set(key, value); });
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: (key: string, fallback: unknown) => settings.get(key) ?? fallback,
            update: configUpdate,
        } as unknown as vscode.WorkspaceConfiguration);
        update = sandbox.stub().callsFake(async (mutate: (current: Catalog) => Catalog) => { catalog = mutate(catalog); return true; });
        store = { get: () => catalog, update } as unknown as CatalogStore;
        actions = new ProjectActions({} as vscode.ExtensionContext, store);
        pick = sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
        input = sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
    });

    teardown(() => { sandbox.restore(); setLanguage(vscode.env.language); });

    test('offers the configured default first when adding and saves its stable ID', async () => {
        sandbox.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file('C:/new')]);
        input.resolves('New folder');
        pick.resolves({ id: 'builtin:api', action: 'select' });
        await actions.addModule(projectId);
        assert.equal(pick.firstCall.args[0][0].id, 'builtin:api');
        assert.equal(catalog.clients[0].projects[0].modules.at(-1)?.kind, 'builtin:api');
        assert.equal(configUpdate.callCount, 0);
    });

    test('reuses a new custom type and keeps cancelled or unchanged edits free of writes', async () => {
        pick.onCall(0).resolves({ action: 'custom' });
        input.resolves('  Worker ✨  ');
        await actions.setKind({ type: 'module', id: moduleId });
        assert.equal(catalog.clients[0].projects[0].modules[0].kind, 'Worker ✨');
        pick.onCall(1).resolves({ id: 'Worker ✨', action: 'select' });
        await actions.setKind({ type: 'module', id: moduleId });
        assert.equal(pick.secondCall.args[0][0].id, 'Worker ✨');
        pick.onCall(2).resolves(undefined);
        await actions.setKind({ type: 'module', id: moduleId });
        pick.onCall(3).resolves({ action: 'custom' });
        input.resolves(undefined);
        await actions.setKind({ type: 'module', id: moduleId });
        assert.equal(update.callCount, 1);
        assert.equal(configUpdate.callCount, 0);
    });

    test('sets a custom default without changing existing folders and avoids nested management', async () => {
        const before = JSON.stringify(catalog);
        pick.onCall(0).resolves({ action: 'default' });
        pick.onCall(1).resolves({ action: 'custom' });
        input.resolves('Worker');
        await actions.manageFolderTypes();
        assert.equal(settings.get('defaultFolderType'), 'Worker');
        assert.ok(!pick.secondCall.args[0].some((item: { action: string }) => item.action === 'manage'));
        assert.equal(configUpdate.firstCall.args[2], vscode.ConfigurationTarget.Global);
        assert.equal(JSON.stringify(catalog), before);
        assert.equal(update.callCount, 0);
    });

    test('saves custom choices once, and removing a default resets it without modifying folders', async () => {
        pick.resolves({ action: 'add' });
        input.resolves(' Worker ');
        await actions.manageFolderTypes();
        await actions.manageFolderTypes();
        assert.equal(configUpdate.callCount, 1);
        assert.deepEqual(settings.get('folderTypes'), ['Worker']);
        settings.set('defaultFolderType', 'Worker');
        pick.onCall(2).resolves({ action: 'remove' });
        pick.onCall(3).resolves({ id: 'Worker' });
        await actions.manageFolderTypes();
        assert.equal(settings.get('defaultFolderType'), 'builtin:other');
        assert.deepEqual(settings.get('folderTypes'), []);
        assert.equal(update.callCount, 0);
    });

    test('returns to folder selection after management and propagates settings failures', async () => {
        pick.onCall(0).resolves({ action: 'manage' });
        pick.onCall(1).resolves(undefined);
        pick.onCall(2).resolves({ action: 'select', id: 'builtin:docs' });
        await actions.setKind({ type: 'module', id: moduleId });
        assert.equal(catalog.clients[0].projects[0].modules[0].kind, 'builtin:docs');
        configUpdate.rejects(new Error('Settings write failed'));
        pick.onCall(3).resolves({ action: 'add' });
        input.resolves('Worker');
        await assert.rejects(actions.manageFolderTypes(), /Settings write failed/);
        assert.equal(update.callCount, 1);
    });

    test('renders built-ins consistently in the dashboard and sidebar while preserving custom text', async () => {
        catalog.clients[0].projects[0].modules[0].kind = 'builtin:frontend';
        sandbox.stub(pathInspector, 'inspect').resolves({ exists: true, git: false });
        sandbox.stub(vscode.workspace, 'onDidChangeConfiguration').returns({ dispose() {} });
        const post = sandbox.stub().resolves(true);
        sandbox.stub(vscode.window, 'createWebviewPanel').returns({
            webview: { asWebviewUri: (uri: vscode.Uri) => uri, cspSource: 'test', postMessage: post, onDidReceiveMessage: () => ({ dispose() {} }) },
            onDidDispose() {}, dispose() {}, reveal() {},
        } as unknown as vscode.WebviewPanel);
        const dashboard = new DashboardPanel({ extensionUri: vscode.Uri.file('C:/extension') } as vscode.ExtensionContext, store, actions);
        const tree = new ProjectTreeProvider(store, actions);
        try {
            for (const [language, expected] of [['zh-cn', '前端'], ['en', 'Frontend']]) {
                setLanguage(language);
                dashboard.show();
                // Wait for the asynchronous path inspection/model update to reach the Webview.
                await new Promise(resolve => setImmediate(resolve));
                const model = post.lastCall.args[0].model;
                assert.equal(model.kinds[0].id, 'builtin:frontend');
                assert.equal(model.kinds[0].label, expected);
                assert.equal(model.clients[0].projects[0].modules[0].kindLabel, expected);
                const roots = await tree.getChildren();
                const projects = await tree.getChildren(roots[0]);
                const modules = await tree.getChildren(projects[0]);
                assert.equal(modules[0].description, expected);
            }
        } finally { dashboard.dispose(); tree.dispose(); }
    });
});
