import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

suite('dashboard interactions', () => {
    test('filters missing paths and sends open modifiers', () => {
        const dom = new JSDOM('<body><input id=search><div id=metrics></div><div class=stage-tools><div id=filters></div></div><div id=list></div></body>', { runScripts: 'outside-only' });
        const messages: unknown[] = [];
        let saved: unknown;
        Object.assign(dom.window, { acquireVsCodeApi: () => ({ getState: () => undefined, setState: (value: unknown) => { saved = value; }, postMessage: (message: unknown) => messages.push(message) }) });
        dom.window.eval(readFileSync(resolve(__dirname, '../../media/dashboard.js'), 'utf8'));
        const module = (id: string, exists: boolean) => ({ id, name: id, kind: 'frontend', kindLabel: '前端', path: `D:/${id}`, exists, color: '#4c8dff' });
        dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'render', model: { clients: [{ id: 'c', name: 'customer', color: '#4c8dff', projects: [{ id: 'p', name: 'project', color: '#4c8dff', modules: [module('present', true), module('missing', false)] }] }], showPath: true } } }));
        const doc = dom.window.document;
        assert.equal(doc.querySelectorAll('.module-card').length, 2);
        (doc.querySelector('[data-action=filter-missing]') as HTMLElement).click();
        assert.equal(doc.querySelectorAll('.module-card').length, 1);
        assert.equal(doc.querySelector('.module-name')?.textContent, 'missing');
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
});
