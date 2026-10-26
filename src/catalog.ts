import { randomUUID } from 'node:crypto';
import { uniqueName } from './paths.js';
import {
    CATALOG_VERSION,
    type Catalog,
    type ClientEntry,
    type FolderLocation,
    type Located,
    type ModuleEntry,
    type ModuleInput,
    type ModuleKind,
    type NamedInput,
    type NodeRef,
    type ProjectEntry,
} from './types.js';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function emptyCatalog(): Catalog {
    return { version: CATALOG_VERSION, clients: [] };
}

export function normalizeColor(value: unknown): string | undefined {
    if (typeof value !== 'string' || !HEX_COLOR.test(value.trim())) {
        return undefined;
    }
    let hex = value.trim().toLowerCase();
    if (hex.length === 4) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    return hex;
}

export function parseCatalog(input: unknown): Catalog {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('目录必须是 JSON 对象');
    }
    const record = input as { version?: unknown; clients?: unknown };
    if (record.version !== undefined && record.version !== CATALOG_VERSION) {
        throw new Error(`不支持的数据版本：${String(record.version)}`);
    }
    if (record.clients === undefined) {
        return emptyCatalog();
    }
    if (!Array.isArray(record.clients)) {
        throw new Error('clients 必须是数组');
    }

    const seen = new Set<string>();
    const clients = record.clients.map(client => parseClient(client, seen));
    return { version: CATALOG_VERSION, clients };
}

export function addClient(catalog: Catalog, input: NamedInput): { catalog: Catalog; client: ClientEntry } {
    const client: ClientEntry = {
        id: randomUUID(),
        name: requireName(input.name),
        color: normalizeColor(input.color),
        description: cleanText(input.description),
        projects: [],
    };
    return {
        catalog: { ...catalog, clients: [...catalog.clients, client] },
        client,
    };
}

export function addProject(
    catalog: Catalog,
    clientId: string,
    input: NamedInput,
): { catalog: Catalog; project: ProjectEntry } {
    const project: ProjectEntry = {
        id: randomUUID(),
        name: requireName(input.name),
        color: normalizeColor(input.color),
        description: cleanText(input.description),
        modules: [],
    };
    let found = false;
    const clients = catalog.clients.map(client => {
        if (client.id !== clientId) {
            return client;
        }
        found = true;
        return { ...client, projects: [...client.projects, project] };
    });
    if (!found) {
        throw new Error('找不到对应的客户');
    }
    return { catalog: { ...catalog, clients }, project };
}

export function addModule(
    catalog: Catalog,
    projectId: string,
    input: ModuleInput,
): { catalog: Catalog; module: ModuleEntry } {
    const module: ModuleEntry = {
        id: randomUUID(),
        name: requireName(input.name),
        kind: requireKind(input.kind),
        path: requirePath(input.path),
        color: normalizeColor(input.color),
        description: cleanText(input.description),
    };
    let found = false;
    const clients = catalog.clients.map(client => ({
        ...client,
        projects: client.projects.map(project => {
            if (project.id !== projectId) {
                return project;
            }
            found = true;
            return { ...project, modules: [...project.modules, module] };
        }),
    }));
    if (!found) {
        throw new Error('找不到对应的项目');
    }
    return { catalog: { ...catalog, clients }, module };
}

export function renameNode(catalog: Catalog, ref: NodeRef, name: string): Catalog {
    const nextName = requireName(name);
    return mapNode(catalog, ref, node => ({ ...node, name: nextName }));
}

export function setColor(catalog: Catalog, ref: NodeRef, color: string | undefined): Catalog {
    const nextColor = color === undefined ? undefined : normalizeColor(color);
    if (color !== undefined && !nextColor) {
        throw new Error('颜色格式无效，请使用 #RGB 或 #RRGGBB');
    }
    return mapNode(catalog, ref, node => ({ ...node, color: nextColor }));
}

export function setDescription(catalog: Catalog, ref: NodeRef, description: string | undefined): Catalog {
    return mapNode(catalog, ref, node => ({ ...node, description: cleanText(description) }));
}

export function setModulePath(catalog: Catalog, ref: NodeRef, modulePath: string): Catalog {
    if (ref.type !== 'module') {
        throw new Error('只有模块可以设置路径');
    }
    const path = requirePath(modulePath);
    return mapNode(catalog, ref, node => ({ ...node, path }));
}

export function setModuleKind(catalog: Catalog, ref: NodeRef, kind: ModuleKind): Catalog {
    if (ref.type !== 'module') {
        throw new Error('只有模块可以设置类型');
    }
    return mapNode(catalog, ref, node => ({ ...node, kind: requireKind(kind) }));
}

export function removeNode(catalog: Catalog, ref: NodeRef): Catalog {
    if (ref.type === 'client') {
        return { ...catalog, clients: catalog.clients.filter(client => client.id !== ref.id) };
    }
    if (ref.type === 'project') {
        return {
            ...catalog,
            clients: catalog.clients.map(client => ({
                ...client,
                projects: client.projects.filter(project => project.id !== ref.id),
            })),
        };
    }
    return {
        ...catalog,
        clients: catalog.clients.map(client => ({
            ...client,
            projects: client.projects.map(project => ({
                ...project,
                modules: project.modules.filter(module => module.id !== ref.id),
            })),
        })),
    };
}

export function moveNode(catalog: Catalog, ref: NodeRef, direction: 'up' | 'down'): Catalog {
    if (ref.type === 'client') {
        return { ...catalog, clients: moveBy(catalog.clients, ref.id, direction) };
    }
    if (ref.type === 'project') {
        return {
            ...catalog,
            clients: catalog.clients.map(client => ({
                ...client,
                projects: client.projects.some(project => project.id === ref.id)
                    ? moveBy(client.projects, ref.id, direction)
                    : client.projects,
            })),
        };
    }
    return {
        ...catalog,
        clients: catalog.clients.map(client => ({
            ...client,
            projects: client.projects.map(project => ({
                ...project,
                modules: project.modules.some(module => module.id === ref.id)
                    ? moveBy(project.modules, ref.id, direction)
                    : project.modules,
            })),
        })),
    };
}

export function relocate(
    catalog: Catalog,
    source: NodeRef,
    target: NodeRef,
): { catalog: Catalog; moved: boolean } {
    if (!findNode(catalog, source) || !findNode(catalog, target)) {
        return { catalog, moved: false };
    }
    if (source.id === target.id && source.type === target.type) {
        return { catalog, moved: false };
    }
    if (source.type === 'client') {
        if (target.type !== 'client') {
            return { catalog, moved: false };
        }
        return { catalog: { ...catalog, clients: moveBefore(catalog.clients, source.id, target.id) }, moved: true };
    }
    if (source.type === 'project') {
        const extracted = extractProject(catalog, source.id);
        if (!extracted.project) {
            return { catalog, moved: false };
        }
        if (target.type === 'client') {
            return { catalog: insertProject(extracted.catalog, target.id, extracted.project), moved: true };
        }
        if (target.type === 'project') {
            const located = findNode(extracted.catalog, target);
            if (located?.type !== 'project') {
                return { catalog, moved: false };
            }
            return {
                catalog: insertProject(extracted.catalog, located.client.id, extracted.project, target.id),
                moved: true,
            };
        }
        return { catalog, moved: false };
    }

    const extracted = extractModule(catalog, source.id);
    if (!extracted.module) {
        return { catalog, moved: false };
    }
    if (target.type === 'project') {
        return { catalog: insertModule(extracted.catalog, target.id, extracted.module), moved: true };
    }
    if (target.type === 'module') {
        const located = findNode(extracted.catalog, target);
        if (located?.type !== 'module') {
            return { catalog, moved: false };
        }
        return {
            catalog: insertModule(extracted.catalog, located.project.id, extracted.module, target.id),
            moved: true,
        };
    }
    return { catalog, moved: false };
}

export function hasSiblingName(
    catalog: Catalog,
    parent: NodeRef | undefined,
    name: string,
    ignoreId?: string,
): boolean {
    const target = name.trim().toLowerCase();
    if (!target) {
        return false;
    }
    if (!parent) {
        return catalog.clients.some(client => client.id !== ignoreId && client.name.trim().toLowerCase() === target);
    }
    if (parent.type === 'client') {
        const client = catalog.clients.find(item => item.id === parent.id);
        return Boolean(client?.projects.some(project => project.id !== ignoreId && project.name.trim().toLowerCase() === target));
    }
    if (parent.type === 'project') {
        const located = findNode(catalog, parent);
        return Boolean(
            located?.type === 'project'
            && located.project.modules.some(module => module.id !== ignoreId && module.name.trim().toLowerCase() === target),
        );
    }
    return false;
}

export function findNode(catalog: Catalog, ref: NodeRef): Located | undefined {
    for (const client of catalog.clients) {
        if (ref.type === 'client' && client.id === ref.id) {
            return { type: 'client', client };
        }
        for (const project of client.projects) {
            if (ref.type === 'project' && project.id === ref.id) {
                return { type: 'project', client, project };
            }
            for (const module of project.modules) {
                if (ref.type === 'module' && module.id === ref.id) {
                    return { type: 'module', client, project, module };
                }
            }
        }
    }
    return undefined;
}

export function parentOf(catalog: Catalog, ref: NodeRef): NodeRef | undefined {
    const located = findNode(catalog, ref);
    if (located?.type === 'project') {
        return { type: 'client', id: located.client.id };
    }
    if (located?.type === 'module') {
        return { type: 'project', id: located.project.id };
    }
    return undefined;
}

export function collectFolders(catalog: Catalog, ref: NodeRef): FolderLocation[] {
    const located = findNode(catalog, ref);
    if (!located) {
        return [];
    }
    if (located.type === 'module') {
        return located.module.path ? [{ name: located.module.name, location: located.module.path }] : [];
    }
    if (located.type === 'project') {
        return located.project.modules
            .filter(module => module.path)
            .map(module => ({ name: module.name, location: module.path }));
    }
    const folders: FolderLocation[] = [];
    for (const project of located.client.projects) {
        for (const module of project.modules) {
            if (!module.path) {
                continue;
            }
            folders.push({ name: `${project.name} - ${module.name}`, location: module.path });
        }
    }
    return folders;
}

export function mergeCatalog(base: Catalog, incoming: Catalog): Catalog {
    const clients = base.clients.map(cloneClient);
    for (const incomingClient of incoming.clients) {
        let client = clients.find(item => sameName(item.name, incomingClient.name));
        if (!client) {
            client = {
                id: randomUUID(),
                name: incomingClient.name,
                color: incomingClient.color,
                description: incomingClient.description,
                projects: [],
            };
            clients.push(client);
        }
        for (const incomingProject of incomingClient.projects) {
            let project = client.projects.find(item => sameName(item.name, incomingProject.name));
            if (!project) {
                project = {
                    id: randomUUID(),
                    name: incomingProject.name,
                    color: incomingProject.color,
                    description: incomingProject.description,
                    modules: [],
                };
                client.projects.push(project);
            }
            for (const incomingModule of incomingProject.modules) {
                const duplicated = incomingModule.path
                    && project.modules.some(module => module.path === incomingModule.path);
                if (duplicated) {
                    continue;
                }
                project.modules.push({
                    id: randomUUID(),
                    name: uniqueName(project.modules.map(module => module.name), incomingModule.name),
                    kind: incomingModule.kind,
                    path: incomingModule.path,
                    color: incomingModule.color,
                    description: incomingModule.description,
                });
            }
        }
    }
    return { version: CATALOG_VERSION, clients };
}

export function nodeLabel(catalog: Catalog, ref: NodeRef): string {
    const located = findNode(catalog, ref);
    if (!located) {
        return '未知项';
    }
    if (located.type === 'client') {
        return located.client.name;
    }
    if (located.type === 'project') {
        return located.project.name;
    }
    return located.module.name;
}

function parseClient(input: unknown, seen: Set<string>): ClientEntry {
    const record = asRecord(input, '客户');
    const projects = optionalArray(record.projects, 'projects').map(project => parseProject(project, seen));
    return {
        id: uniqueId(record.id, seen),
        name: requireName(typeof record.name === 'string' ? record.name : ''),
        color: normalizeColor(record.color),
        description: cleanText(typeof record.description === 'string' ? record.description : undefined),
        projects,
    };
}

function parseProject(input: unknown, seen: Set<string>): ProjectEntry {
    const record = asRecord(input, '项目');
    const modules = optionalArray(record.modules, 'modules').map(module => parseModule(module, seen));
    return {
        id: uniqueId(record.id, seen),
        name: requireName(typeof record.name === 'string' ? record.name : ''),
        color: normalizeColor(record.color),
        description: cleanText(typeof record.description === 'string' ? record.description : undefined),
        modules,
    };
}

function parseModule(input: unknown, seen: Set<string>): ModuleEntry {
    const record = asRecord(input, '模块');
    return {
        id: uniqueId(record.id, seen),
        name: requireName(typeof record.name === 'string' ? record.name : ''),
        kind: requireKind(typeof record.kind === 'string' ? record.kind : ''),
        path: requirePath(typeof record.path === 'string' ? record.path : ''),
        color: normalizeColor(record.color),
        description: cleanText(typeof record.description === 'string' ? record.description : undefined),
    };
}

function optionalArray(value: unknown, label: string): unknown[] {
    if (value === undefined) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new Error(`${label} 必须是数组`);
    }
    return value;
}

function asRecord(input: unknown, label: string): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(`${label}必须是对象`);
    }
    return input as Record<string, unknown>;
}

function uniqueId(value: unknown, seen: Set<string>): string {
    if (typeof value === 'string' && value.trim() && !seen.has(value)) {
        seen.add(value);
        return value;
    }
    const id = randomUUID();
    seen.add(id);
    return id;
}

function requireName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed) {
        throw new Error('名称不能为空');
    }
    return trimmed;
}

function requirePath(modulePath: string): string {
    const trimmed = modulePath.trim();
    if (!trimmed) {
        throw new Error('路径不能为空');
    }
    return trimmed;
}

function cleanText(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function requireKind(kind: string): ModuleKind {
    const trimmed = kind.trim();
    if (!trimmed) {
        throw new Error('类型不能为空');
    }
    return trimmed;
}

function sameName(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function cloneClient(client: ClientEntry): ClientEntry {
    return {
        ...client,
        projects: client.projects.map(project => ({
            ...project,
            modules: project.modules.map(module => ({ ...module })),
        })),
    };
}

function mapNode<T extends { id: string }>(
    catalog: Catalog,
    ref: NodeRef,
    update: (node: T) => T,
): Catalog {
    let found = false;
    const clients = catalog.clients.map(client => {
        if (ref.type === 'client' && client.id === ref.id) {
            found = true;
            return update(client as unknown as T) as unknown as ClientEntry;
        }
        return {
            ...client,
            projects: client.projects.map(project => {
                if (ref.type === 'project' && project.id === ref.id) {
                    found = true;
                    return update(project as unknown as T) as unknown as ProjectEntry;
                }
                return {
                    ...project,
                    modules: project.modules.map(module => {
                        if (ref.type === 'module' && module.id === ref.id) {
                            found = true;
                            return update(module as unknown as T) as unknown as ModuleEntry;
                        }
                        return module;
                    }),
                };
            }),
        };
    });
    if (!found) {
        throw new Error('找不到要修改的项');
    }
    return { ...catalog, clients };
}

function moveBy<T extends { id: string }>(items: T[], id: string, direction: 'up' | 'down'): T[] {
    const index = items.findIndex(item => item.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= items.length) {
        return items;
    }
    const next = items.slice();
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    return next;
}

function moveBefore<T extends { id: string }>(items: T[], sourceId: string, targetId: string): T[] {
    const sourceIndex = items.findIndex(item => item.id === sourceId);
    if (sourceIndex < 0 || !items.some(item => item.id === targetId)) {
        return items;
    }
    const next = items.slice();
    const [item] = next.splice(sourceIndex, 1);
    next.splice(next.findIndex(entry => entry.id === targetId), 0, item);
    return next;
}

function extractProject(catalog: Catalog, projectId: string): { catalog: Catalog; project?: ProjectEntry } {
    let project: ProjectEntry | undefined;
    const clients = catalog.clients.map(client => ({
        ...client,
        projects: client.projects.filter(item => {
            if (item.id !== projectId) {
                return true;
            }
            project = item;
            return false;
        }),
    }));
    return { catalog: { ...catalog, clients }, project };
}

function extractModule(catalog: Catalog, moduleId: string): { catalog: Catalog; module?: ModuleEntry } {
    let module: ModuleEntry | undefined;
    const clients = catalog.clients.map(client => ({
        ...client,
        projects: client.projects.map(project => ({
            ...project,
            modules: project.modules.filter(item => {
                if (item.id !== moduleId) {
                    return true;
                }
                module = item;
                return false;
            }),
        })),
    }));
    return { catalog: { ...catalog, clients }, module };
}

function insertProject(catalog: Catalog, clientId: string, project: ProjectEntry, beforeId?: string): Catalog {
    let found = false;
    const clients = catalog.clients.map(client => {
        if (client.id !== clientId) {
            return client;
        }
        found = true;
        const projects = client.projects.slice();
        const index = beforeId ? projects.findIndex(item => item.id === beforeId) : -1;
        projects.splice(index < 0 ? projects.length : index, 0, project);
        return { ...client, projects };
    });
    if (!found) {
        throw new Error('找不到目标客户');
    }
    return { ...catalog, clients };
}

function insertModule(catalog: Catalog, projectId: string, module: ModuleEntry, beforeId?: string): Catalog {
    let found = false;
    const clients = catalog.clients.map(client => ({
        ...client,
        projects: client.projects.map(project => {
            if (project.id !== projectId) {
                return project;
            }
            found = true;
            const modules = project.modules.slice();
            const index = beforeId ? modules.findIndex(item => item.id === beforeId) : -1;
            modules.splice(index < 0 ? modules.length : index, 0, module);
            return { ...project, modules };
        }),
    }));
    if (!found) {
        throw new Error('找不到目标项目');
    }
    return { ...catalog, clients };
}
