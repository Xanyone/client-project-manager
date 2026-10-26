import * as vscode from 'vscode';
import { emptyCatalog, parseCatalog } from './catalog.js';
import { CONFIG_SECTION, GLOBAL_STATE_KEY } from './constants.js';
import type { Catalog } from './types.js';

type StorageMode = 'globalState' | 'settings';

export class CatalogStore implements vscode.Disposable {
    private catalog: Catalog;
    private protect = false;
    private saving = false;
    private storageMode: StorageMode;
    private pending: Promise<unknown> = Promise.resolve();
    private readonly emitter = new vscode.EventEmitter<Catalog>();
    private readonly configurationListener: vscode.Disposable;

    readonly onDidChange = this.emitter.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.storageMode = this.mode();
        const loaded = this.read();
        this.catalog = loaded.catalog;
        this.protect = loaded.protect;
        this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(`${CONFIG_SECTION}.storage`)) {
                void this.enqueue(() => this.changeStorage()).catch(error => {
                    void vscode.window.showErrorMessage(`切换存储失败：${String(error)}`);
                });
            } else if (!this.saving && event.affectsConfiguration(`${CONFIG_SECTION}.catalog`)) {
                this.reloadFromExternal();
            }
        });
    }

    get(): Catalog {
        return this.catalog;
    }

    update(next: Catalog | ((current: Catalog) => Catalog)): Promise<boolean> {
        return this.enqueue(async () => {
            if (this.protect) {
                const choice = await vscode.window.showWarningMessage(
                    '当前保存的分组数据无法解析。继续保存会覆盖原数据。',
                    { modal: true },
                    '覆盖保存',
                );
                if (choice !== '覆盖保存') {
                    return false;
                }
            }
            const catalog = parseCatalog(typeof next === 'function' ? next(this.catalog) : next);
            await this.persist(catalog, this.storageMode);
            this.catalog = catalog;
            this.protect = false;
            this.emitter.fire(this.catalog);
            return true;
        });
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation);
        this.pending = result.catch(() => undefined);
        return result;
    }

    private async changeStorage(): Promise<void> {
        const mode = this.mode();
        if (mode === this.storageMode) {
            return;
        }
        if (this.protect) {
            this.storageMode = mode;
            this.reloadFromExternal();
            return;
        }
        const destination = mode === 'settings'
            ? vscode.workspace.getConfiguration(CONFIG_SECTION).get('catalog')
            : this.context.globalState.get(GLOBAL_STATE_KEY);
        await this.context.globalState.update(`${GLOBAL_STATE_KEY}.backup.${mode}`, destination);
        await this.persist(this.catalog, mode);
        this.storageMode = mode;
        this.emitter.fire(this.catalog);
    }

    reload(): void {
        this.reloadFromExternal();
    }

    dispose(): void {
        this.configurationListener.dispose();
        this.emitter.dispose();
    }

    private reloadFromExternal(): void {
        const loaded = this.read();
        this.protect = loaded.protect;
        if (JSON.stringify(loaded.catalog) === JSON.stringify(this.catalog)) {
            return;
        }
        this.catalog = loaded.catalog;
        this.emitter.fire(this.catalog);
    }

    private read(): { catalog: Catalog; protect: boolean } {
        const mode = this.storageMode;
        const primary = mode === 'settings' ? this.readSettings() : this.readGlobal();
        if (primary.status === 'ok') {
            return { catalog: primary.catalog, protect: false };
        }
        if (primary.status === 'corrupt') {
            return { catalog: emptyCatalog(), protect: true };
        }
        const secondary = mode === 'settings' ? this.readGlobal() : this.readSettings();
        if (secondary.status === 'ok') {
            return { catalog: secondary.catalog, protect: false };
        }
        if (secondary.status === 'corrupt') {
            return { catalog: emptyCatalog(), protect: true };
        }
        return { catalog: emptyCatalog(), protect: false };
    }

    private async persist(catalog: Catalog, mode: StorageMode): Promise<void> {
        this.saving = true;
        try {
            if (mode === 'settings') {
                await vscode.workspace.getConfiguration(CONFIG_SECTION).update(
                    'catalog',
                    catalog,
                    vscode.ConfigurationTarget.Global,
                );
                return;
            }
            await this.context.globalState.update(GLOBAL_STATE_KEY, catalog);
        } finally {
            this.saving = false;
        }
    }

    private mode(): StorageMode {
        return vscode.workspace.getConfiguration(CONFIG_SECTION).get<StorageMode>('storage', 'globalState');
    }

    private readGlobal(): ReadResult {
        return this.parseStored(this.context.globalState.get(GLOBAL_STATE_KEY), '本机存储');
    }

    private readSettings(): ReadResult {
        return this.parseStored(vscode.workspace.getConfiguration(CONFIG_SECTION).get('catalog'), '设置');
    }

    private parseStored(value: unknown, source: string): ReadResult {
        if (value === undefined || value === null) {
            return { status: 'empty' };
        }
        try {
            return { status: 'ok', catalog: parseCatalog(value) };
        } catch (error) {
            const message = error instanceof Error ? error.message : '数据无法读取';
            void vscode.window.showErrorMessage(`${source}中的客户项目数据无法读取：${message}`);
            return { status: 'corrupt' };
        }
    }
}

type ReadResult =
    | { status: 'empty' }
    | { status: 'corrupt' }
    | { status: 'ok'; catalog: Catalog };
