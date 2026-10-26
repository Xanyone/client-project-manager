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

export const COLOR_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
    { label: '蓝色', hex: '#4c8dff' },
    { label: '青色', hex: '#2dd4bf' },
    { label: '绿色', hex: '#3ddc97' },
    { label: '黄色', hex: '#f5a524' },
    { label: '橙色', hex: '#ff8a4c' },
    { label: '红色', hex: '#f07178' },
    { label: '粉色', hex: '#ff6b9d' },
    { label: '紫色', hex: '#c792ea' },
];

export const DEFAULT_KIND_COLOR = '#8b9bb4';

export function colorAt(index: number): string {
    const safeIndex = ((index % COLOR_PRESETS.length) + COLOR_PRESETS.length) % COLOR_PRESETS.length;
    return COLOR_PRESETS[safeIndex].hex;
}
