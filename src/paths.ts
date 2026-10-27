import { t } from './i18n.js';
import { posix, win32 } from 'node:path';
import type { ModuleKind } from './types.js';

const DRIVE_PATH = /^[a-zA-Z]:[\\/]/;

export function nameKey(value: string): string {
    return value.trim().normalize('NFC').toLowerCase();
}

/** Compare Windows spellings on every OS; preserve case in POSIX and remote paths. */
export function locationKey(location: string): string {
    const value = location.trim();
    if (/^file:/i.test(value)) {
        const url = new URL(value);
        if (url.search || url.hash || url.username || url.password) { throw new Error('Invalid file URI'); }
        if (url.hostname && url.hostname !== 'localhost') {
            return locationKey(`\\\\${url.hostname}${decodeURIComponent(url.pathname).replace(/\//g, '\\')}`);
        }
        const pathname = decodeURIComponent(url.pathname);
        return locationKey(/^\/[a-z]:[\/]/i.test(pathname) ? pathname.slice(1) : pathname);
    }
    if (DRIVE_PATH.test(value) || value.startsWith('\\\\') || value.startsWith('//')) {
        return `file:${win32.normalize(value).replace(/[\\/]+$/, '').toLowerCase()}`;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
        const uri = new URL(value);
        uri.pathname = posix.normalize(uri.pathname).replace(/\/+$/, '') || '/';
        return uri.toString();
    }
    const normalized = posix.normalize(value).replace(/\/+$/, '') || '/';
    return `file:${normalized}`;
}

export function sameLocation(left: string, right: string): boolean {
    return locationKey(left) === locationKey(right);
}

export function isFilePath(value: string): boolean {
    return DRIVE_PATH.test(value) || value.startsWith('/') || value.startsWith('\\\\');
}

export function guessKind(name: string): ModuleKind {
    const value = name.toLowerCase();
    if (includesAny(value, ['front-end', 'frontend', 'front_end', '前端', '网页'])) {
        return 'frontend';
    }
    if (includesAny(value, ['back-end', 'backend', 'back_end', 'server', '后端'])) {
        return 'backend';
    }
    if (includesAny(value, ['mobile', 'android', 'ios', '小程序', '移动端'])) {
        return 'mobile';
    }
    if (includesAny(value, ['admin', 'console', '管理端', '后台'])) {
        return 'admin';
    }
    if (includesAny(value, ['infra', 'deploy', 'devops', 'docker', 'k8s', '运维'])) {
        return 'infra';
    }
    if (includesAny(value, ['docs', 'wiki', '文档']) || hasToken(value, 'doc')) {
        return 'docs';
    }
    return 'other';
}

export function uniqueName(existing: readonly string[], desired: string): string {
    const names = new Set(existing.map(nameKey));
    const base = desired.trim() || t("Untitled");
    if (!names.has(nameKey(base))) {
        return base;
    }
    let index = 2;
    while (names.has(nameKey(`${base} (${index})`))) {
        index += 1;
    }
    return `${base} (${index})`;
}

export function safeFileName(name: string): string {
    const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim();
    const base = (cleaned || 'workspace').slice(0, 40).replace(/[. ]+$/, '') || 'workspace';
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base) ? `_${base}` : base;
}

function includesAny(value: string, keys: readonly string[]): boolean {
    return keys.some(key => value.includes(key));
}

function hasToken(value: string, token: string): boolean {
    return value === token
        || value.startsWith(`${token}-`)
        || value.startsWith(`${token}_`)
        || value.endsWith(`-${token}`)
        || value.endsWith(`_${token}`)
        || value.includes(`-${token}-`)
        || value.includes(`_${token}_`);
}
