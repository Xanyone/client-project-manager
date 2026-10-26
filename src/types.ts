export const CATALOG_VERSION = 1;

export const MODULE_KINDS = ['frontend', 'backend', 'mobile', 'admin', 'docs', 'infra', 'other'] as const;

export type ModuleKind = typeof MODULE_KINDS[number];
export type NodeType = 'client' | 'project' | 'module';

export interface NodeRef {
    type: NodeType;
    id: string;
}

export interface ModuleEntry {
    id: string;
    name: string;
    kind: ModuleKind;
    path: string;
    color?: string;
    description?: string;
}

export interface ProjectEntry {
    id: string;
    name: string;
    color?: string;
    description?: string;
    modules: ModuleEntry[];
}

export interface ClientEntry {
    id: string;
    name: string;
    color?: string;
    description?: string;
    projects: ProjectEntry[];
}

export interface Catalog {
    version: number;
    clients: ClientEntry[];
}

export interface NamedInput {
    name: string;
    description?: string;
    color?: string;
}

export interface ModuleInput extends NamedInput {
    kind: ModuleKind;
    path: string;
}

export type Located =
    | { type: 'client'; client: ClientEntry }
    | { type: 'project'; client: ClientEntry; project: ProjectEntry }
    | { type: 'module'; client: ClientEntry; project: ProjectEntry; module: ModuleEntry };

export interface FolderLocation {
    name: string;
    location: string;
}

export interface DashboardModule {
    id: string;
    name: string;
    kind: ModuleKind;
    kindLabel: string;
    path: string;
    description: string;
    color: string;
    exists: boolean;
    git: boolean;
}

export interface DashboardProject {
    id: string;
    name: string;
    description: string;
    color: string;
    modules: DashboardModule[];
}

export interface DashboardClient {
    id: string;
    name: string;
    description: string;
    color: string;
    projects: DashboardProject[];
}

export interface DashboardKind {
    id: ModuleKind;
    label: string;
    color: string;
}

export interface DashboardModel {
    openInNewWindow: boolean;
    showPath: boolean;
    kinds: DashboardKind[];
    clients: DashboardClient[];
}

export function isModuleKind(value: unknown): value is ModuleKind {
    return typeof value === 'string' && (MODULE_KINDS as readonly string[]).includes(value);
}

export function isNodeType(value: unknown): value is NodeType {
    return value === 'client' || value === 'project' || value === 'module';
}

export function isNodeRef(value: unknown): value is NodeRef {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as { type?: unknown; id?: unknown };
    return isNodeType(record.type) && typeof record.id === 'string' && record.id.length > 0;
}
