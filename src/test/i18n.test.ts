import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { JSDOM } from 'jsdom';
import { countMessage, getLanguage, getMessages, setLanguage, t } from '../i18n.js';
import { dashboardHtml } from '../dashboardPanel.js';
import { ProjectActions } from '../actions.js';
import type { CatalogStore } from '../store.js';
import { addClient, addModule, addProject, emptyCatalog } from '../catalog.js';
import chinese from '../locales/zh-cn.json';

suite('internationalization', () => {
    teardown(() => setLanguage(vscode.env.language));

    test('falls back to English and formats Chinese and English counts', () => {
        setLanguage('de');
        assert.equal(getLanguage(), 'en');
        assert.equal(t('Add client'), 'Add client');
        assert.equal(countMessage('{0} folder', '{0} folders', 1), '1 folder');
        assert.equal(countMessage('{0} folder', '{0} folders', 2), '2 folders');
        setLanguage('zh-CN');
        assert.equal(t('Add client'), '添加客户');
        assert.equal(countMessage('{0} folder', '{0} folders', 1), '1 个目录');
        assert.equal(t('Path does not exist: {0}', 'D:/{1}/客户'), '路径不存在：D:/{1}/客户');
    });

    test('every manifest and Webview message has a complete translation', () => {
        const readJson = (name: string) => JSON.parse(readFileSync(resolve(__dirname, '../../', name), 'utf8')) as Record<string, string>;
        const manifest = readFileSync(resolve(__dirname, '../../package.json'), 'utf8');
        const english = readJson('package.nls.json');
        const translated = readJson('package.nls.zh-cn.json');
        assert.deepEqual(readJson('package.nls.zh.json'), translated);
        assert.equal(english['extension.displayName'], 'Client Project Manager');
        assert.equal(translated['extension.displayName'], '客户项目管理器');
        assert.equal(english['commands.category'], english['extension.displayName']);
        assert.equal(translated['commands.category'], translated['extension.displayName']);
        for (const match of manifest.matchAll(/%([^%]+)%/g)) {
            assert.ok(english[match[1]], `Missing English manifest message: ${match[1]}`);
            assert.ok(translated[match[1]], `Missing Chinese manifest message: ${match[1]}`);
        }
        const parsed = JSON.parse(manifest);
        assert.equal((parsed.contributes.viewsContainers.activitybar[0] as { when: string }).when, 'config.clientProjectDashboard.showSidebar');
        assert.equal(parsed.contributes.configuration.properties['clientProjectDashboard.showSidebar'].default, true);
        assert.equal(parsed.contributes.configuration.properties['clientProjectDashboard.openOnStartup'].default, 'emptyWindow');
        const script = readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8');
        for (const match of script.matchAll(/(?:\bt|countMessage)\("([^"]+)"/g)) {
            assert.ok(Object.hasOwn(chinese, match[1]), `Missing Webview message: ${match[1]}`);
        }
        for (const [source, target] of Object.entries(chinese)) {
            assert.deepEqual(source.match(/\{\d+\}/g)?.sort(), target.match(/\{\d+\}/g)?.sort(), `Placeholder mismatch: ${source}`);
        }
    });

    for (const language of ['en', 'zh-cn']) {
        test(`renders the full dashboard and preserves user content in ${language}`, () => {
            setLanguage(language);
            const webview = { cspSource: 'vscode-webview://test', asWebviewUri: (uri: vscode.Uri) => uri } as vscode.Webview;
            const html = dashboardHtml(webview, vscode.Uri.file(resolve(__dirname, '../../')));
            const dom = new JSDOM(html, { runScripts: 'outside-only' });
            try {
                const doc = dom.window.document;
                assert.equal(doc.documentElement.lang, getLanguage());
                assert.deepEqual(JSON.parse(doc.documentElement.dataset.messages!), getMessages());
                assert.equal(doc.querySelector('h1')?.textContent, language === 'en' ? 'Dashboard' : '仪表盘');
                assert.equal(doc.querySelector('#search')?.getAttribute('aria-label'), language === 'en' ? 'Search' : '搜索');
                assert.equal(doc.querySelector('[data-action=import]')?.textContent, language === 'en' ? 'Import' : '导入');
                Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState() {}, setState() {}, postMessage() {} }) });
                dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
                assert.equal(doc.querySelector('.empty h2')?.textContent, language === 'en' ? 'Start by adding a client' : '从添加客户开始');
                dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: {
                    type: 'render', model: { clients: [{ id: 'c', name: '客户 & Client', color: '#4c8dff', projects: [{ id: 'p', name: '项目', color: '#4c8dff', modules: [
                        { id: 'm', name: '<img src=x> 📦', path: 'D:/客户', exists: false, color: '#8b9bb4' },
                    ] }] }], showPath: true },
                } }));
                assert.equal(doc.querySelector('.client-name')?.textContent, '客户 & Client');
                assert.equal(doc.querySelector('.module-name')?.textContent, '<img src=x> 📦');
                assert.equal(doc.querySelectorAll('img').length, 0);
                assert.equal(doc.querySelector('.module-open')?.getAttribute('title'), language === 'en' ? 'Path does not exist: D:/客户' : '路径不存在：D:/客户');
                assert.equal(doc.querySelector('.module-name')?.textContent, '<img src=x> 📦');
                assert.equal(doc.querySelector('.project-count')?.textContent, language === 'en' ? '1 folder' : '1 个目录');
                assert.equal(doc.querySelector('[data-action=open-window]')?.textContent, language === 'en' ? 'Choose window' : '选择窗口');
            } finally {
                dom.window.close();
            }
        });

        test(`localizes native prompts and destructive action buttons in ${language}`, async () => {
            setLanguage(language);
            const sandbox = sinon.createSandbox();
            try {
                const client = addClient(emptyCatalog(), { name: '原始客户' });
                const project = addProject(client.catalog, client.client.id, { name: '原始项目' });
                const module = addModule(project.catalog, project.project.id, { name: '原始模块', path: 'D:/module' });
                const update = sandbox.stub().resolves(true);
                const store = { get: () => module.catalog, update } as unknown as CatalogStore;
                const actions = new ProjectActions({} as vscode.ExtensionContext, store);
                const warning: sinon.SinonStub = sandbox.stub(vscode.window, 'showWarningMessage');
                warning.resolves(t('Delete'));
                await actions.remove({ type: 'client', id: client.client.id });
                assert.equal(warning.firstCall.args[0], t('Delete "{0}" and all its projects and modules?', '原始客户'));
                assert.equal(warning.firstCall.args[2], language === 'en' ? 'Delete' : '删除');
                await actions.remove({ type: 'module', id: module.module.id });
                assert.equal(warning.secondCall.args[0], t('Delete folder "{0}"?', '原始模块'));
                assert.equal(update.callCount, 2);
            } finally {
                sandbox.restore();
            }
        });
    }
});
