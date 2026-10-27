import { t, type Message } from './i18n.js';
import { DEFAULT_KIND_COLOR } from './constants.js';
import type { Catalog } from './types.js';

// Reserved IDs keep translated built-ins distinct from historical user-entered names.
const BUILT_INS: ReadonlyArray<{ id: string; label: Message; color: string }> = [
    { id: 'builtin:frontend', label: 'Frontend', color: '#4c8dff' },
    { id: 'builtin:backend', label: 'Backend', color: '#3ddc97' },
    { id: 'builtin:api', label: 'API', color: '#2dd4bf' },
    { id: 'builtin:config', label: 'Config', color: '#f5a524' },
    { id: 'builtin:docs', label: 'Docs', color: '#c792ea' },
    { id: 'builtin:tests', label: 'Tests', color: '#ff6b9d' },
    { id: 'builtin:scripts', label: 'Scripts', color: '#ff8a4c' },
    { id: 'builtin:other', label: 'Other', color: DEFAULT_KIND_COLOR },
];

export const DEFAULT_FOLDER_TYPE = 'builtin:other';

export interface FolderTypeOption {
    id: string;
    label: string;
    color: string;
    source: 'builtin' | 'saved' | 'used';
}

export function folderTypeLabel(id: string): string {
    const preset = BUILT_INS.find(item => item.id === id);
    return preset ? t(preset.label) : id;
}

export function folderTypeColor(id: string): string {
    return BUILT_INS.find(item => item.id === id)?.color ?? DEFAULT_KIND_COLOR;
}

export function customTypeError(value: string): string | undefined {
    if (!value.trim()) { return t('Type cannot be empty'); }
    if (value.trim().startsWith('builtin:')) { return t('The builtin: prefix is reserved for built-in types'); }
    if (value.trim().length > 80) { return t('Type must be 80 characters or fewer'); }
    return undefined;
}

export function customFolderTypes(value: unknown): string[] {
    if (!Array.isArray(value)) { return []; }
    return [...new Set(value.filter((item): item is string => typeof item === 'string')
        .map(item => item.trim()).filter(item => !customTypeError(item)))];
}

export function defaultFolderType(value: unknown): string {
    if (typeof value !== 'string' || !value.trim()) { return DEFAULT_FOLDER_TYPE; }
    const id = value.trim();
    return BUILT_INS.some(item => item.id === id) || !customTypeError(id) ? id : DEFAULT_FOLDER_TYPE;
}

export function folderTypeOptions(catalog: Catalog, saved: unknown, defaultId: string, current?: string): FolderTypeOption[] {
    const options = new Map<string, FolderTypeOption>();
    for (const item of BUILT_INS) {
        options.set(item.id, { ...item, label: t(item.label), source: 'builtin' });
    }
    for (const id of customFolderTypes(saved)) {
        options.set(id, { id, label: id, color: DEFAULT_KIND_COLOR, source: 'saved' });
    }
    const used = catalog.clients.flatMap(client => client.projects.flatMap(project => project.modules.map(module => module.kind)));
    for (const id of [...used, defaultId, ...(current ? [current] : [])]) {
        if (!options.has(id)) {
            options.set(id, { id, label: id, color: DEFAULT_KIND_COLOR, source: 'used' });
        }
    }
    const priority = (id: string) => id === current ? 0 : id === defaultId ? 1 : 2;
    return [...options.values()].sort((left, right) => priority(left.id) - priority(right.id));
}
