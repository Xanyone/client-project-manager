import type { Message } from './i18n.js';

export const VIEW_ID = 'clientProjectDashboard.explorer';
export const CONFIG_SECTION = 'clientProjectDashboard';
export const GLOBAL_STATE_KEY = 'clientProjectDashboard.catalog';
export const TREE_MIME = 'application/vnd.code.tree.clientProjectDashboard';

export const COMMANDS = {
    exportCatalog: 'clientProjectDashboard.exportCatalog',
    importCatalog: 'clientProjectDashboard.importCatalog',
    openDashboard: 'clientProjectDashboard.openDashboard',
    addClient: 'clientProjectDashboard.addClient',
    addProject: 'clientProjectDashboard.addProject',
    addModule: 'clientProjectDashboard.addModule',
    rename: 'clientProjectDashboard.rename',
    setColor: 'clientProjectDashboard.setColor',
    setKind: 'clientProjectDashboard.setKind',
    manageFolderTypes: 'clientProjectDashboard.manageFolderTypes',
    setPath: 'clientProjectDashboard.setPath',
    setDescription: 'clientProjectDashboard.setDescription',
    edit: 'clientProjectDashboard.edit',
    remove: 'clientProjectDashboard.remove',
    open: 'clientProjectDashboard.open',
    openInNewWindow: 'clientProjectDashboard.openInNewWindow',
    openWorkspace: 'clientProjectDashboard.openWorkspace',
    reveal: 'clientProjectDashboard.reveal',
    copyPath: 'clientProjectDashboard.copyPath',
    moveUp: 'clientProjectDashboard.moveUp',
    moveDown: 'clientProjectDashboard.moveDown',
    refresh: 'clientProjectDashboard.refresh',
} as const;

export const COLOR_PRESETS: ReadonlyArray<{ label: Message; hex: string }> = [
    { label: "Blue", hex: '#4c8dff' },
    { label: "Teal", hex: '#2dd4bf' },
    { label: "Green", hex: '#3ddc97' },
    { label: "Yellow", hex: '#f5a524' },
    { label: "Orange", hex: '#ff8a4c' },
    { label: "Red", hex: '#f07178' },
    { label: "Pink", hex: '#ff6b9d' },
    { label: "Purple", hex: '#c792ea' },
];

export const DEFAULT_KIND_COLOR = '#8b9bb4';

export function colorAt(index: number): string {
    const safeIndex = ((index % COLOR_PRESETS.length) + COLOR_PRESETS.length) % COLOR_PRESETS.length;
    return COLOR_PRESETS[safeIndex].hex;
}
