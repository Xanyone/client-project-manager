# Catalog invariants and transaction contract

## Scope and triggers

These rules apply to commands, Webview messages, sidebar drag/drop, imports, storage migrations and extension-host writes. Local path identity is lexical: symlinks and junctions are not resolved. Existing conflicts are protected; no automatic destructive migration runs on startup.

## Signatures

- `nameKey(value: string): string`: trim, Unicode NFC, lowercase.
- `locationKey(location: string): string`: Windows absolute paths and UNC are case-insensitive, separator-normalized; equivalent file URIs share their identity. POSIX and remote paths preserve case. Remote authority remains part of identity.
- `parseCatalog(input: unknown, options?: { allowDuplicates?: boolean }): Catalog`: validates structure, version, global IDs, names and paths. Only import may allow duplicate names/paths before merging. Missing IDs are generated; duplicate explicit IDs are rejected.
- `CatalogStore.update(next: Catalog | ((current: Catalog) => Catalog)): Promise<boolean>`: all production callers use the functional form. `false` means the user cancelled overwriting protected legacy data. Errors reject the promise.
- `CatalogStore.backup(): Promise<string>`: exports original stored contents even when the displayed catalog is protected/empty. Corrupt snapshot bytes are preserved for recovery.
- `transaction<T>(file, operation(assertOwned)): Promise<T>`: cross-process heartbeat lock; release in `finally`; assert ownership before committing.
- `PathInspector.inspect(location): Promise<{ exists: boolean; git: boolean }>`: at most 16 concurrent checks, shared five-second cache, remote checks through VS Code filesystem providers.

## Data and persistence

Catalog format remains `{ version: 1, clients: [...] }`. Names are unique among siblings. Module paths are unique within their project; other projects may reuse them. Client workspace collection deduplicates paths.

`catalog.snapshot.json` in `globalStorageUri` contains `{ mode: 'globalState' | 'settings', catalog }`. All participating extension hosts lock the same snapshot path, read the latest snapshot, validate the derived catalog, persist the selected backing store, atomically rename a temporary snapshot, then publish memory and change events. Snapshot failure rolls back the backing store where possible and rejects. A corrupt snapshot blocks writes instead of being replaced by empty data.

The selected backing store remains compatible with older data. A new host restores settings changes and storage-mode changes made while it was stopped. The initial valid catalog is captured in a snapshot even when the first update is unchanged. Other hosts poll the snapshot about every two seconds. A stale nonfunctional replacement is rejected. Subsequent unchanged updates skip persistence. Migration backs up its destination before copying and switches the active mode only on success; protected corrupt data blocks migration. External settings updates publish state only after the snapshot succeeds, and valid repaired settings clear protection. Folder dialogs preserve remote URI authorities.

Manual settings edits, Settings Sync and older extension versions do not participate in this file lock. This is local coordination within one storage directory, not distributed synchronization. Concurrent external settings edits require user review; last-writer behavior of the external system cannot be made transactional by this extension.

## Validation and error matrix

| Input/operation | Result |
| --- | --- |
| Duplicate sibling name on add/rename/move | Reject; retain source catalog |
| Equivalent module path in one project | Reject |
| Same module path in another project | Allow; deduplicate workspace folders |
| Repeated import | Merge groups by name, skip paths; no growth |
| Imported same module name, different path | Generate next unique numbered name |
| Missing root clients, malformed nested arrays, unsupported version | Reject and protect saved contents |
| Duplicate explicit ID | Reject |
| Relative path, command/HTTP URI, malformed file URI | Reject |
| Persistence failure | Reject; do not publish uncommitted state |
| Corrupt snapshot | Reject writes, preserve raw backup |
| Invalid drag target | Reject without removing source |
| Unknown active-window state during workspace cleanup | Skip deletion |

## Examples and anti-patterns

Use `store.update(current => addModule(current, projectId, input).catalog)`. Never compute a full replacement from `store.get()` before waiting in the transaction queue. Never implement a separate UI-only uniqueness rule or offer to bypass a conflict. Do not lowercase POSIX/remote paths. Do not delete old workspace files unless window state is available and the generated file is old and inactive.

## Folder type contract

`ModuleEntry.kind` remains a nonempty string in catalog version 1; importing and exporting preserve it exactly. New built-ins use reserved `builtin:*` IDs defined in `src/folderTypes.ts`. Only known reserved IDs receive translated labels and preset colors. Historical strings (including `Frontend`, `frontend`, and unknown IDs) retain their original display and identity; no automatic migration or case folding occurs.

`folderTypeOptions(catalog, saved, defaultId, current?)` combines built-ins, validated saved custom types, catalog types, and the default/current IDs. It deduplicates by exact ID, preserving current-first/default-second ordering. Labels and colors resolve through shared helpers in the native picker, sidebar, dashboard cards and filter model. Search uses the display label and stored ID; filters use the stored ID.

The application-scoped user settings `folderTypes` and `defaultFolderType` affect choices and initial ordering only. Type assignments still go through functional `store.update` operations. Cancelled or unchanged edits never write. Custom UI input is trimmed, nonempty, at most 80 UTF-16 code units, and cannot start with `builtin:`. Invalid manual preferences fall back safely; legacy catalog types remain selectable when editing. Removing a saved type retains catalog assignments; removing the saved default resets it to `builtin:other` before removing its saved choice. Preference write failures propagate to the existing command/Webview error handlers.

`folderTypes.test.ts` covers normalization, legacy identity, locale labels, stable IDs and JSON round trips; `folderTypeActions.test.ts` covers defaults, custom reuse, cancellation, management, failed settings writes and consistency between the native sidebar and Webview model.

## Regression gates

- `uniqueness.test.ts`: scoped names, Unicode, paths, import idempotence, edit/drop conflicts, validation.
- `concurrency.test.ts`: real action double submission, isolated Memento caches, stale replacement, corrupt recovery, three independent OS processes sharing a lock.
- `store.test.ts`: failed save/migration, cancellation, no-op writes, original-data backup.
- `pathInspector.test.ts`: cache coalescing/invalidation, bounded concurrency, remote checks, missing/file status.
- `opener.test.ts`: workspace names, path deduplication, optional-command failure and safe cleanup.
- `dashboard.test.ts` / `i18n.test.ts`: escaped text, filters, empty import, compact persisted state and both languages.

Run `npm test`, `npm run test:unit`, `npm run package:vsix`, and `git diff --check`. CI runs minimum 1.140.0 and pinned 1.143.1 on Windows, Linux and macOS.
