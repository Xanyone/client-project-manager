import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { lock } from 'proper-lockfile';
import type { Catalog } from './types.js';

export interface CatalogSnapshot {
    mode: 'globalState' | 'settings';
    catalog: Catalog;
}

/** The same heartbeat lock is used by every extension host for this profile. */
export async function transaction<T>(file: string, operation: (assertOwned: () => void) => Promise<T>): Promise<T> {
    await mkdir(dirname(file), { recursive: true });
    let compromised: Error | undefined;
    const release = await lock(file, {
        realpath: false,
        retries: { retries: 30, minTimeout: 50, maxTimeout: 200 },
        stale: 30000,
        onCompromised: error => { compromised = error; },
    });
    try {
        const assertOwned = () => { if (compromised) { throw compromised; } };
        assertOwned();
        const result = await operation(assertOwned);
        assertOwned();
        return result;
    } finally {
        if (!compromised) { await release(); }
    }
}

export async function readSnapshot(file: string): Promise<CatalogSnapshot | undefined> {
    try {
        const value: unknown = JSON.parse(await readFile(file, 'utf8'));
        if (!value || typeof value !== 'object' || !('mode' in value)
            || (value.mode !== 'globalState' && value.mode !== 'settings') || !('catalog' in value)) {
            throw new Error('Invalid catalog snapshot');
        }
        return value as CatalogSnapshot;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') { return undefined; }
        throw error;
    }
}

export async function writeSnapshot(file: string, snapshot: CatalogSnapshot): Promise<void> {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
        await writeFile(temporary, JSON.stringify(snapshot), { flag: 'wx' });
        await rename(temporary, file);
    } finally {
        await unlink(temporary).catch(() => undefined);
    }
}
