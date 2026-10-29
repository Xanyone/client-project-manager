import * as assert from 'node:assert/strict';
import {
    addClient,
    addModule,
    addProject,
    collectFolders,
    emptyCatalog,
    hasSiblingName,
    mergeCatalog,
    moveNode,
    normalizeColor,
    parseCatalog,
    relocate,
    removeNode,
} from '../catalog.js';
import { uniqueName } from '../paths.js';

suite('catalog', () => {
    test('rejects malformed nested arrays instead of erasing them', () => {
        for (const value of [null, 'invalid', {}, 1]) {
            assert.throws(() => parseCatalog({ clients: [{ name: 'customer', projects: value }] }), /projects/);
            assert.throws(() => parseCatalog({ clients: [{ name: 'customer', projects: [{ name: 'project', modules: value }] }] }), /modules/);
        }
    });

    test('rejects a stale drag target without changing the catalog', () => {
        const seeded = seed();
        const result = relocate(seeded.catalog, { type: 'module', id: seeded.backend }, { type: 'project', id: 'missing' });
        assert.equal(result.moved, false);
        assert.equal(result.catalog, seeded.catalog);
    });
    test('builds a client, project, and front-end/back-end hierarchy', () => {
        const client = addClient(emptyCatalog(), { name: 'A客户', color: '#4C8DFF' });
        const projectB = addProject(client.catalog, client.client.id, { name: 'B项目' });
        const withFront = addModule(projectB.catalog, projectB.project.id, {
            name: 'front-end',
            path: 'D:/customers/a/b/front-end',
        });
        const withBack = addModule(withFront.catalog, projectB.project.id, {
            name: 'back-end',
            path: 'D:/customers/a/b/back-end',
        });
        const projectC = addProject(withBack.catalog, client.client.id, { name: 'C项目' });

        assert.equal(projectC.catalog.clients.length, 1);
        assert.equal(projectC.catalog.clients[0].projects.length, 2);
        assert.equal(projectC.catalog.clients[0].color, '#4c8dff');
    });

    test('removes a project together with its modules', () => {
        const seeded = seed();
        const next = removeNode(seeded.catalog, { type: 'project', id: seeded.projectB });
        assert.equal(next.clients[0].projects.length, 1);
        assert.equal(next.clients[0].projects[0].name, 'C项目');
    });

    test('rejects deleting a missing item or an ID with the wrong node type', () => {
        const seeded = seed();
        for (const ref of [
            { type: 'client' as const, id: 'missing' },
            { type: 'client' as const, id: seeded.projectB },
            { type: 'project' as const, id: seeded.backend },
            { type: 'module' as const, id: seeded.clientId },
        ]) {
            assert.throws(() => removeNode(seeded.catalog, ref), /Item to edit not found|找不到要编辑的项目/);
        }
    });

    test('does not move the first client upward', () => {
        const seeded = seed();
        const next = moveNode(seeded.catalog, { type: 'client', id: seeded.clientId }, 'up');
        assert.equal(next.clients[0].id, seeded.clientId);
        assert.throws(() => moveNode(seeded.catalog, { type: 'client', id: 'missing' }, 'up'), /Item to edit not found|找不到要编辑的项目/);
    });

    test('moves a module into another project', () => {
        const seeded = seed();
        const moved = relocate(
            seeded.catalog,
            { type: 'module', id: seeded.backend },
            { type: 'project', id: seeded.projectC },
        );
        assert.equal(moved.moved, true);
        assert.equal(moved.catalog.clients[0].projects[0].modules.length, 1);
        assert.equal(moved.catalog.clients[0].projects[1].modules[0].id, seeded.backend);
    });

    test('rejects dropping a client onto a project', () => {
        const seeded = seed();
        const moved = relocate(
            seeded.catalog,
            { type: 'client', id: seeded.clientId },
            { type: 'project', id: seeded.projectB },
        );
        assert.equal(moved.moved, false);
        assert.equal(moved.catalog.clients.length, 1);
    });

    test('parses hand-written catalogs and rejects unknown versions', () => {
        const parsed = parseCatalog({
            clients: [
                {
                    name: 'A客户',
                    projects: [
                        {
                            name: 'B项目',
                            modules: [
                                { name: 'front-end', path: 'D:/front' },
                            ],
                        },
                    ],
                },
            ],
        });
        assert.equal(parsed.version, 1);
        assert.ok(parsed.clients[0].id);
        assert.throws(() => parseCatalog({ version: 2, clients: [] }), /Unsupported catalog version|不支持的数据版本/);
    });

    test('merges same client and skips a duplicated module path', () => {
        const seeded = seed();
        const incoming = parseCatalog({
            clients: [
                {
                    name: 'a客户',
                    projects: [
                        {
                            name: 'B项目',
                            modules: [
                                { name: 'front-end', path: 'D:/customers/a/b/front-end' },
                                { name: 'admin', path: 'D:/customers/a/b/admin' },
                            ],
                        },
                    ],
                },
            ],
        });
        const merged = mergeCatalog(seeded.catalog, incoming);
        const modules = merged.clients[0].projects[0].modules;
        assert.equal(merged.clients.length, 1);
        assert.equal(modules.length, 3);
        assert.equal(modules.filter(module => module.path.endsWith('front-end')).length, 1);
    });

    test('detects sibling names and generates unique names', () => {
        const seeded = seed();
        assert.equal(hasSiblingName(seeded.catalog, { type: 'project', id: seeded.projectB }, 'front-end'), true);
        assert.equal(hasSiblingName(seeded.catalog, { type: 'project', id: seeded.projectB }, 'docs'), false);
        assert.equal(uniqueName(['front-end', 'front-end (2)'], 'front-end'), 'front-end (3)');
        assert.equal(normalizeColor('#abc'), '#aabbcc');
        assert.equal(normalizeColor('red'), undefined);
    });

    test('collects every module under a client', () => {
        const seeded = seed();
        const folders = collectFolders(seeded.catalog, { type: 'client', id: seeded.clientId });
        assert.equal(folders.length, 2);
        assert.equal(folders[0].name, 'B项目 - front-end');
    });
});

function seed() {
    const client = addClient(emptyCatalog(), { name: 'A客户' });
    const projectB = addProject(client.catalog, client.client.id, { name: 'B项目' });
    const front = addModule(projectB.catalog, projectB.project.id, {
        name: 'front-end',
        path: 'D:/customers/a/b/front-end',
    });
    const back = addModule(front.catalog, projectB.project.id, {
        name: 'back-end',
        path: 'D:/customers/a/b/back-end',
    });
    const projectC = addProject(back.catalog, client.client.id, { name: 'C项目' });
    return {
        catalog: projectC.catalog,
        clientId: client.client.id,
        projectB: projectB.project.id,
        projectC: projectC.project.id,
        backend: back.module.id,
    };
}
