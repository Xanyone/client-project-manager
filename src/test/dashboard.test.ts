import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

suite('dashboard interactions', () => {
    test('does not render folder types', () => {
        const dom = new JSDOM('<body><input id=search><div id=metrics></div><div class=stage-tools><div id=filters></div></div><div id=list></div></body>', { runScripts: 'outside-only' });
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState() {}, setState() {}, postMessage() {} }) });
        try {
            dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
            dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', model: {
                clients: [{ id: 'c', name: 'Client', projects: [{ id: 'p', name: 'Project', modules: [
                    { id: 'folder', name: 'Folder', path: 'C:/folder', exists: true },
                    { id: 'plain', name: 'Plain folder', path: 'C:/plain', exists: true },
                ] }] }],
            } } }));
            const doc = dom.window.document;
            assert.equal(doc.querySelectorAll('.module-card').length, 2);
            assert.equal(doc.querySelectorAll('[data-action=filter-kind]').length, 0);
            assert.equal(doc.querySelectorAll('[data-action=manage-types]').length, 0);
            assert.equal(doc.querySelector('.module-kind'), null);
            assert.equal(doc.querySelector('.module-card .tick'), null);
        } finally { dom.window.close(); }
    });

    test('filters missing paths and sends open modifiers', () => {
        const dom = new JSDOM('<body><input id=search><div id=metrics></div><div class=stage-tools><div id=filters></div></div><div id=list></div></body>', { runScripts: 'outside-only' });
        const messages: unknown[] = [];
        let saved: unknown;
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState: () => undefined, setState: (value: unknown) => { saved = value; }, postMessage: (message: unknown) => messages.push(message) }) });
        dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
        const module = (id: string, exists: boolean) => ({ id, name: id, path: `D:/${id}`, exists, color: '#4c8dff' });
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', model: { clients: [{ id: 'c', name: 'customer', color: '#4c8dff', projects: [{ id: 'p', name: 'project', color: '#4c8dff', modules: [module('present', true), module('missing', false)] }] }], showPath: true } } }));
        const doc = dom.window.document;
        assert.equal(doc.querySelectorAll('.module-card').length, 2);
        assert.equal(doc.querySelectorAll('.client-icon').length, 1);
        assert.equal(doc.querySelector('.client-icon path')?.getAttribute('d'), 'M8 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z');
        (doc.querySelector('[data-action=filter-missing]') as HTMLElement).click();
        assert.equal(doc.querySelectorAll('.module-card').length, 1);
        assert.equal(doc.querySelector('.module-name')?.textContent, 'missing');
        assert.equal(doc.querySelectorAll('[data-action=open-window]').length, 1);
        assert.equal((doc.querySelector('[data-action=open-window]') as HTMLElement)?.dataset.nodeType, 'module');
        doc.querySelector('.module-open')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, ctrlKey: true }));
        const last = messages.at(-1) as { type: string; id: string; invert: boolean };
        assert.equal(last.type, 'open');
        assert.equal(last.id, 'missing');
        assert.equal(last.invert, true);
        assert.equal((saved as { missingOnly: boolean }).missingOnly, true);
        dom.window.close();
    });

    test('renders user labels as text and supports an empty catalog', () => {
        const dom = new JSDOM('<body><input id=search><div id=metrics></div><div class=stage-tools><div id=filters></div></div><div id=list></div></body>', { runScripts: 'outside-only' });
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState: () => undefined, setState() {}, postMessage() {} }) });
        dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
        assert.ok(dom.window.document.querySelector('[data-action=add-client]'));
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', model: { clients: [{ id: 'c', name: '<img src=x onerror=alert(1)>', projects: [], color: '#fff000' }] } } }));
        assert.equal(dom.window.document.querySelectorAll('img').length, 0);
        assert.equal(dom.window.document.querySelector('.client-name')?.textContent, '<img src=x onerror=alert(1)>');
        dom.window.close();
    });

    test('keeps import available in an empty catalog and persists only view preferences', () => {
        const dom = new JSDOM('<body><input id=search><div id=metrics></div><div class=stage-tools><div id=filters></div><button data-action=add-client></button><button data-action=import></button><button data-action=export></button></div><div id=list></div></body>', { runScripts: 'outside-only' });
        let saved: Record<string, unknown> | undefined;
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState() { return { model: { clients: [{ id: 'old', name: 'Old cached client' }] } }; }, setState(value: Record<string, unknown>) { saved = value; }, postMessage() {} }) });
        dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
        const doc = dom.window.document;
        assert.equal(doc.querySelectorAll('.client-card').length, 0);
        assert.equal((doc.querySelector('.stage-tools') as HTMLElement).hidden, false);
        assert.equal((doc.querySelector('[data-action=import]') as HTMLElement).hidden, false);
        assert.equal((doc.querySelector('.stage-tools [data-action=add-client]') as HTMLElement).hidden, true);
        assert.equal((doc.querySelector('[data-action=export]') as HTMLElement).hidden, true);
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', model: { clients: [] } } }));
        assert.ok(saved);
        assert.equal(Object.hasOwn(saved, 'model'), false);
        dom.window.close();
    });

    test('keeps project actions separate from folding without an open-project button', () => {
        const dom = new JSDOM('<body><input id=search><div id=metrics></div><div class=stage-tools><div id=filters></div></div><div id=list></div></body>', { runScripts: 'outside-only' });
        const messages: Array<{ type: string; id: string; nodeType: string }> = [];
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState() {}, setState() {}, postMessage(message: { type: string; id: string; nodeType: string }) { messages.push(message); } }) });
        try {
            dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
            dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', model: { clients: [{ id: 'c', name: 'Client', projects: [
                { id: 'empty', name: 'Empty', modules: [] },
                { id: 'full', name: 'Full', modules: [{ id: 'm', name: 'Folder', path: 'C:/folder', exists: true }] },
            ] }] } } }));
            const doc = dom.window.document;
            assert.equal(doc.querySelector('[data-action=open][data-node-type=project]'), null);
            assert.equal(doc.querySelectorAll('.project-card > .fold-head [data-action=add-module]').length, 2);
            assert.equal(doc.querySelectorAll('.project-card > .fold-head [data-action=edit]').length, 2);
            assert.equal(doc.querySelectorAll('.project-card.open').length, 2);
            assert.equal(doc.querySelectorAll('.project-card [data-action=workspace]').length, 0);
            (doc.querySelector('[data-action=add-module][data-id=empty]') as HTMLElement).click();
            assert.equal(messages.at(-1)?.type, 'add-module');
            assert.equal(messages.at(-1)?.id, 'empty');
            (doc.querySelector('[data-action=toggle-fold][data-id=empty]') as HTMLElement).click();
            assert.equal(doc.querySelectorAll('.project-card.open').length, 1);
        } finally { dom.window.close(); }
    });
});
