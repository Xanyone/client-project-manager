import * as assert from 'node:assert/strict';
import { addClient, addProject, addModule, emptyCatalog, renameNode, setModulePath, relocate, mergeCatalog, parseCatalog, collectFolders } from '../catalog.js';
import { locationKey, sameLocation } from '../paths.js';

suite('catalog uniqueness', () => {
    function seed() {
        const c = addClient(emptyCatalog(), { name: 'Client' });
        const p = addProject(c.catalog, c.client.id, { name: 'Project' });
        const m = addModule(p.catalog, p.project.id, { name: 'API', path: 'C:/Work/API' });
        return { catalog: m.catalog, client: c.client.id, project: p.project.id, module: m.module.id };
    }

    test('rejects duplicate names in their own scope and permits reuse in other scopes', () => {
        const s = seed();
        assert.throws(() => addClient(s.catalog, { name: ' client ' }));
        assert.throws(() => addProject(s.catalog, s.client, { name: 'PROJECT' }));
        assert.throws(() => addModule(s.catalog, s.project, { name: ' api ', path: 'C:/other' }));
        const other = addClient(s.catalog, { name: 'Other' });
        const project = addProject(other.catalog, other.client.id, { name: 'Project' });
        assert.doesNotThrow(() => addModule(project.catalog, project.project.id, { name: 'API', path: 'C:/Work/API' }));
        const unicode = addClient(emptyCatalog(), { name: 'Café' });
        assert.throws(() => addClient(unicode.catalog, { name: 'Cafe\u0301' }));
    });

    test('uses the same Windows path identity for add, edit and import', () => {
        const s = seed();
        for (const path of ['c:/work/api/', 'C:\\Work\\API', 'file:///C:/Work/API', 'C:/Work/Temp/../API']) {
            assert.throws(() => addModule(s.catalog, s.project, { name: 'Other', path }));
        }
        const other = addModule(s.catalog, s.project, { name: 'Other', path: 'C:/other' });
        assert.throws(() => setModulePath(other.catalog, { type: 'module', id: other.module.id }, 'c:/work/api/'));
        assert.throws(() => renameNode(other.catalog, { type: 'module', id: other.module.id }, 'API'));
        assert.doesNotThrow(() => renameNode(s.catalog, { type: 'module', id: s.module }, 'api'));
        const incoming = parseCatalog({ clients: [{ name: 'client', projects: [{ name: 'project', modules: [
            { name: 'renamed API', path: 'c:/WORK/api/' },
            { name: 'API', path: 'C:/new' },
        ] }] }] });
        const merged = mergeCatalog(s.catalog, incoming);
        assert.equal(merged.clients[0].projects[0].modules.length, 2);
        assert.equal(merged.clients[0].projects[0].modules[1].name, 'API (2)');
        assert.deepEqual(mergeCatalog(merged, incoming), merged);
    });

    test('rejects conflicting drag destinations without mutating the source', () => {
        const s = seed();
        const other = addProject(s.catalog, s.client, { name: 'Other' });
        const m = addModule(other.catalog, other.project.id, { name: 'Different name', path: 'c:/work/api/' });
        const before = JSON.stringify(m.catalog);
        assert.throws(() => relocate(m.catalog, { type: 'module', id: m.module.id }, { type: 'project', id: s.project }));
        assert.equal(JSON.stringify(m.catalog), before);
        assert.equal(collectFolders(m.catalog, { type: 'client', id: s.client }).length, 1);
        assert.equal(relocate(s.catalog, { type: 'module', id: s.module }, { type: 'project', id: s.project }).moved, true);
    });

    test('normalizes URI paths without conflating remote case or authorities', () => {
        assert.ok(sameLocation('file:///C:/Work/API', 'c:/work/api/'));
        assert.ok(sameLocation('\\\\server\\share\\api', 'file://server/share/api'));
        assert.ok(sameLocation('vscode-remote://ssh-remote+one/home/a/../api/', 'vscode-remote://ssh-remote+one/home/api'));
        assert.notEqual(locationKey('vscode-remote://ssh-remote+one/home/API'), locationKey('vscode-remote://ssh-remote+one/home/api'));
        assert.notEqual(locationKey('vscode-remote://ssh-remote+one/home/api'), locationKey('vscode-remote://ssh-remote+two/home/api'));
        assert.ok(!sameLocation('/home/API', '/home/api'));
        assert.ok(sameLocation('file:///home/api', '/home/api'));
    });

    test('rejects malformed roots, duplicate IDs and unsafe or relative paths', () => {
        assert.throws(() => parseCatalog({ clietns: [] }));
        assert.throws(() => parseCatalog({ clients: [{ id: 'same', name: 'A' }, { id: 'same', name: 'B' }] }));
        assert.throws(() => parseCatalog({ clients: [{ name: 'A' }, { name: ' a ' }] }));
        const legacy = parseCatalog({ clients: [{ name: 'A' }, { name: ' a ' }] }, { allowDuplicates: true });
        assert.equal(mergeCatalog(emptyCatalog(), legacy).clients.length, 1);
        const s = seed();
        for (const path of ['relative/api', 'command:workbench.action.closeWindow', 'https://example.com', 'file:///%xx']) {
            assert.throws(() => addModule(s.catalog, s.project, { name: 'Other', path }));
        }
    });
});
