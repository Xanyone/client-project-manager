import * as vscode from 'vscode';
import { locationKey } from './paths.js';
import { toUri } from './opener.js';

export interface PathStatus { exists: boolean; git: boolean }

/** Shared bounded cache and concurrency limit for tree and dashboard rendering. */
export class PathInspector {
    private cache = new Map<string, { expires: number; result: Promise<PathStatus> }>();
    private active = 0;
    private waiting: Array<() => void> = [];

    constructor(private readonly stat: (uri: vscode.Uri) => Thenable<vscode.FileStat> = uri => vscode.workspace.fs.stat(uri)) {}

    clear(): void { this.cache.clear(); }

    inspect(location: string): Promise<PathStatus> {
        const key = locationKey(location);
        const cached = this.cache.get(key);
        if (cached && cached.expires > Date.now()) { return cached.result; }
        if (this.cache.size >= 2000) { this.cache.delete(this.cache.keys().next().value!); }
        const entry = { expires: Infinity, result: Promise.resolve({ exists: false, git: false }) };
        entry.result = this.check(location).then(status => { entry.expires = Date.now() + 5000; return status; });
        const result = entry.result;
        this.cache.set(key, entry);
        return result;
    }

    private async check(location: string): Promise<PathStatus> {
        if (this.active >= 16) { await new Promise<void>(resolve => this.waiting.push(resolve)); }
        else { this.active++; }
        try {
            const uri = toUri(location);
            const status = await this.stat(uri);
            if ((status.type & vscode.FileType.Directory) === 0) { return { exists: false, git: false }; }
            let git = false;
            try { await this.stat(vscode.Uri.joinPath(uri, '.git')); git = true; } catch { /* Not a repository. */ }
            return { exists: true, git };
        } catch { return { exists: false, git: false }; }
        finally {
            const next = this.waiting.shift();
            if (next) { next(); } else { this.active--; }
        }
    }
}

export const pathInspector = new PathInspector();
