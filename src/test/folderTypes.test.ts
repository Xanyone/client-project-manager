import * as assert from 'node:assert/strict';
import { addClient, addModule, addProject, emptyCatalog, parseCatalog, setModuleKind } from '../catalog.js';
import { customFolderTypes, customTypeError, defaultFolderType, DEFAULT_FOLDER_TYPE, folderTypeColor, folderTypeLabel, folderTypeOptions } from '../folderTypes.js';
import { setLanguage } from '../i18n.js';

suite('folder type contracts', () => {
    teardown(() => setLanguage('en'));

    test('translates built-ins and displays custom names literally', () => {
        setLanguage('zh-cn');
        assert.equal(folderTypeLabel('builtin:frontend'), '前端');
        assert.equal(folderTypeLabel('Frontend'), 'Frontend');
        assert.equal(folderTypeLabel('前端 ✨'), '前端 ✨');
        assert.equal(folderTypeLabel('builtin:future'), 'builtin:future');
        setLanguage('en');
        assert.equal(folderTypeLabel('builtin:frontend'), 'Frontend');
        assert.notEqual(folderTypeColor('builtin:frontend'), folderTypeColor('builtin:backend'));
    });

    test('validates manual settings and accepts only configured custom defaults', () => {
        assert.deepEqual(customFolderTypes([' Worker ', '', 'Worker', 42, 'builtin:api', 'x'.repeat(81), '__proto__']), ['Worker', '__proto__']);
        assert.deepEqual(customFolderTypes({ types: ['API'] }), []);
        for (const invalid of [null, 12, '', '  ', 'builtin:typo', 'x'.repeat(81)]) {
            assert.equal(defaultFolderType(invalid), DEFAULT_FOLDER_TYPE);
        }
        assert.equal(defaultFolderType('Worker'), DEFAULT_FOLDER_TYPE);
        assert.equal(defaultFolderType(' Worker ', ['Worker']), 'Worker');
        assert.equal(defaultFolderType('builtin:api'), 'builtin:api');
        assert.ok(customTypeError('builtin:api'));
        assert.ok(customTypeError('  '));
    });

    test('uses only the current configured types and prioritizes current and default types', () => {
        const client = addClient(emptyCatalog(), { name: 'Client' });
        const project = addProject(client.catalog, client.client.id, { name: 'Project' });
        const module = addModule(project.catalog, project.project.id, { name: 'API', kind: 'Worker', path: 'C:/api' });
        const catalog = module.catalog;
        const before = JSON.stringify(catalog);
        const options = folderTypeOptions(['Worker', 'Service', 'Worker'], 'builtin:api', 'Service');
        assert.deepEqual(options.slice(0, 2).map(item => item.id), ['Service', 'builtin:api']);
        assert.equal(options.filter(item => item.id === 'Worker').length, 1);
        assert.equal(options.find(item => item.id === 'Worker')?.source, 'saved');
        assert.ok(!folderTypeOptions([], DEFAULT_FOLDER_TYPE, 'Worker').some(item => item.id === 'Worker'));
        assert.ok(!folderTypeOptions([], 'Standalone').some(item => item.id === 'Standalone'));
        assert.equal(JSON.stringify(catalog), before);
        const changed = setModuleKind(catalog, { type: 'module', id: module.module.id }, 'builtin:api');
        assert.deepEqual(parseCatalog(JSON.parse(JSON.stringify(changed))), changed);
    });
});
