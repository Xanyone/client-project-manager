import { t } from './i18n.js';
import * as vscode from 'vscode';
import { emptyCatalog, parseCatalog } from './catalog.js';
import { CONFIG_SECTION, GLOBAL_STATE_KEY } from './constants.js';
import type { Catalog } from './types.js';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { readSnapshot, transaction, writeSnapshot } from './persistence.js';

type StorageMode = 'globalState' | 'settings';

export class CatalogStore implements vscode.Disposable {
    private catalog: Catalog;
    private protect = false;
    private saving = false;
    private storageMode: StorageMode;
    private pending: Promise<unknown> = Promise.resolve();
    private readonly snapshotFile: string | undefined;
    private readonly timer: ReturnType<typeof setInterval> | undefined;
    private assertOwned: () => void = () => undefined;
    private disposed = false;
    private polling = false;
    private readonly emitter = new vscode.EventEmitter<Catalog>();
    private readonly configurationListener: vscode.Disposable;

    readonly onDidChange = this.emitter.event;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.snapshotFile = context.globalStorageUri?.scheme === 'file'
            ? join(context.globalStorageUri.fsPath, 'catalog.snapshot.json') : undefined;
        this.storageMode = this.mode();
        const loaded = this.read();
        this.catalog = loaded.catalog;
        this.protect = loaded.protect;
        this.configurationListener = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(`${CONFIG_SECTION}.storage`)) {
                void this.enqueue(() => this.changeStorage()).catch(error => {
                    void vscode.window.showErrorMessage(t("Failed to switch storage: {0}", String(error)));
                });
            } else if (!this.saving && event.affectsConfiguration(`${CONFIG_SECTION}.catalog`)) {
                const baseline = JSON.stringify(this.catalog);
                const incoming = this.readSettings();
                void this.enqueue(() => this.withLock(async () => {
                    await this.refreshSnapshot();
                    if (this.storageMode === 'settings' && baseline === JSON.stringify(this.catalog)) {
                        if (incoming.status === 'corrupt') { this.protect = true; return; }
                        const catalog = incoming.status === 'ok' ? incoming.catalog : emptyCatalog();
                        if (this.snapshotFile) {
                            this.assertOwned();
                            await writeSnapshot(this.snapshotFile, { mode: this.storageMode, catalog });
                        }
                        this.catalog = catalog;
                        this.protect = false;
                        this.emitter.fire(this.catalog);
                    }
                })).catch(error => this.report(error));
            }
        });
        if (this.snapshotFile) {
            void this.enqueue(() => this.withLock(async () => {
                await this.refreshSnapshot();
                await this.migrateStorage();
                // Settings Sync or manual edits can have happened while this host was stopped.
                if (this.storageMode === 'settings') {
                    const settings = this.readSettings();
                    if (settings.status === 'ok' && JSON.stringify(settings.catalog) !== JSON.stringify(this.catalog)) {
                        this.assertOwned();
                        await writeSnapshot(this.snapshotFile!, { mode: 'settings', catalog: settings.catalog });
                        this.catalog = settings.catalog;
                        this.emitter.fire(this.catalog);
                    }
                }
            })).catch(error => this.report(error));
            this.timer = setInterval(() => {
                if (!this.saving && !this.polling) {
                    this.polling = true;
                    void this.enqueue(() => this.withLock(() => this.refreshSnapshot()))
                        .catch(error => this.report(error)).finally(() => { this.polling = false; });
                }
            }, 2000);
            this.timer.unref();
        }
    }

    get(): Catalog {
        return this.catalog;
    }

    /** Export original bytes/data even when validation has put the store in protection mode. */
    backup(): Promise<string> {
        return this.enqueue(() => this.withLock(async () => {
            if (this.protect && this.storageMode === 'settings') {
                const settings = vscode.workspace.getConfiguration(CONFIG_SECTION).get('catalog');
                if (settings !== undefined && settings !== null) { return JSON.stringify(settings, null, 2); }
            }
            if (this.snapshotFile) {
                try {
                    const raw = await readFile(this.snapshotFile, 'utf8');
                    try {
                        const snapshot: unknown = JSON.parse(raw);
                        if (snapshot && typeof snapshot === 'object' && 'catalog' in snapshot) {
                            return JSON.stringify(snapshot.catalog, null, 2);
                        }
                    } catch { /* Preserve corrupt snapshot bytes for recovery. */ }
                    return raw;
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { throw error; }
                }
            }
            const local = this.context.globalState.get(GLOBAL_STATE_KEY);
            const settings = vscode.workspace.getConfiguration(CONFIG_SECTION).get('catalog');
            const value = this.storageMode === 'settings' ? settings ?? local : local ?? settings;
            return JSON.stringify(value ?? this.catalog, null, 2);
        }));
    }

    update(next: Catalog | ((current: Catalog) => Catalog)): Promise<boolean> {
        const baseline = JSON.stringify(this.catalog);
        return this.enqueue(() => this.withLock(async () => {
            await this.refreshSnapshot();
            if (typeof next !== 'function' && baseline !== JSON.stringify(this.catalog)) {
                throw new Error(t("The catalog changed in another operation. Please retry."));
            }
            if (this.protect) {
                const choice = await vscode.window.showWarningMessage(
                    t("The saved catalog cannot be read. Saving will overwrite the original data."),
                    { modal: true },
                    t("Overwrite"),
                );
                if (choice !== t("Overwrite")) {
                    return false;
                }
            }
            const catalog = parseCatalog(typeof next === 'function' ? next(this.catalog) : next);
            if (!this.protect && JSON.stringify(catalog) === JSON.stringify(this.catalog)) { return true; }
            await this.persist(catalog, this.storageMode);
            this.catalog = catalog;
            this.protect = false;
            this.emitter.fire(this.catalog);
            return true;
        }));
    }

    private enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const result = this.pending.then(operation);
        this.pending = result.catch(() => undefined);
        return result;
    }

    private async changeStorage(): Promise<void> {
        await this.withLock(() => this.migrateStorage());
    }

    private async migrateStorage(): Promise<void> {
        await this.refreshSnapshot();
        const mode = this.mode();
        if (mode === this.storageMode) {
            return;
        }
        if (this.protect) {
            throw new Error(t("The saved catalog cannot be read. Saving will overwrite the original data."));
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
        if (this.snapshotFile) {
            void this.enqueue(() => this.withLock(() => this.refreshSnapshot())).catch(error => this.report(error));
        } else { this.reloadFromExternal(); }
    }

    dispose(): void {
        this.disposed = true;
        if (this.timer) { clearInterval(this.timer); }
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
        const previous = mode === 'settings'
            ? vscode.workspace.getConfiguration(CONFIG_SECTION).get('catalog')
            : this.context.globalState.get(GLOBAL_STATE_KEY);
        try {
            this.assertOwned();
            if (mode === 'settings') {
                await vscode.workspace.getConfiguration(CONFIG_SECTION).update(
                    'catalog',
                    catalog,
                    vscode.ConfigurationTarget.Global,
                );
            } else {
                await this.context.globalState.update(GLOBAL_STATE_KEY, catalog);
            }
            if (this.snapshotFile) {
                try {
                    this.assertOwned();
                    await writeSnapshot(this.snapshotFile, { mode, catalog });
                } catch (error) {
                    if (mode === 'settings') {
                        await vscode.workspace.getConfiguration(CONFIG_SECTION).update('catalog', previous, vscode.ConfigurationTarget.Global);
                    } else { await this.context.globalState.update(GLOBAL_STATE_KEY, previous); }
                    throw error;
                }
            }
        } finally {
            this.saving = false;
        }
    }

    private withLock<T>(operation: () => Promise<T>): Promise<T> {
        return this.snapshotFile ? transaction(this.snapshotFile, async assertOwned => {
            this.assertOwned = assertOwned;
            try { return await operation(); } finally { this.assertOwned = () => undefined; }
        }) : operation();
    }

    private async refreshSnapshot(): Promise<void> {
        if (!this.snapshotFile) { this.reloadFromExternal(); return; }
        const snapshot = await readSnapshot(this.snapshotFile);
        if (!snapshot) {
            this.reloadFromExternal();
            if (!this.protect) {
                this.assertOwned();
                await writeSnapshot(this.snapshotFile, { mode: this.storageMode, catalog: this.catalog });
            }
            return;
        }
        const catalog = parseCatalog(snapshot.catalog);
        this.storageMode = snapshot.mode;
        this.protect = this.storageMode === 'settings' && this.readSettings().status === 'corrupt';
        if (JSON.stringify(catalog) !== JSON.stringify(this.catalog)) {
            this.catalog = catalog;
            this.emitter.fire(catalog);
        }
    }

    private report(error: unknown): void {
        if (this.disposed) { return; }
        void vscode.window.showErrorMessage(t("Unable to read catalog from {0}: {1}", t("Local storage"), String(error)));
    }

    private mode(): StorageMode {
        const value: unknown = vscode.workspace.getConfiguration(CONFIG_SECTION).get('storage', 'globalState');
        return value === 'settings' ? 'settings' : 'globalState';
    }

    private readGlobal(): ReadResult {
        return this.parseStored(this.context.globalState.get(GLOBAL_STATE_KEY), t("Local storage"));
    }

    private readSettings(): ReadResult {
        return this.parseStored(vscode.workspace.getConfiguration(CONFIG_SECTION).get('catalog'), t("Settings"));
    }

    private parseStored(value: unknown, source: string): ReadResult {
        if (value === undefined || value === null) {
            return { status: 'empty' };
        }
        try {
            return { status: 'ok', catalog: parseCatalog(value) };
        } catch (error) {
            const message = error instanceof Error ? error.message : t("Unable to read data");
            void vscode.window.showErrorMessage(t("Unable to read catalog from {0}: {1}", source, message));
            return { status: 'corrupt' };
        }
    }
}

type ReadResult =
    | { status: 'empty' }
    | { status: 'corrupt' }
    | { status: 'ok'; catalog: Catalog };
