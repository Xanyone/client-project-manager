(function () {
    const messages = JSON.parse(document.documentElement.dataset.messages || '{}');
    function t(message, ...args) {
        const text = Object.prototype.hasOwnProperty.call(messages, message) ? messages[message] : message;
        return text.replace(/\{(\d+)\}/g, function (match, index) {
            return args[index] === undefined ? match : String(args[index]);
        });
    }

    const locale = document.documentElement.lang || 'en';
    const numbers = new Intl.NumberFormat(locale);
    const plurals = new Intl.PluralRules(locale);
    function countMessage(singular, plural, count) {
        return t(plurals.select(count) === 'one' ? singular : plural, numbers.format(count));
    }
    const vscode = acquireVsCodeApi();
    const previous = vscode.getState() || {};
    let model = previous.model || { clients: [], kinds: [], openInNewWindow: false, showPath: true };
    let query = previous.query || '';
    let kindFilter = previous.kindFilter || '';
    let missingOnly = previous.missingOnly === true;
    let folded = previous.folded && typeof previous.folded === 'object' ? previous.folded : {};

    const search = document.getElementById('search');
    const list = document.getElementById('list');
    const metrics = document.getElementById('metrics');
    const filters = document.getElementById('filters');
    const tools = document.querySelector('.stage-tools');

    search.value = query;
    search.addEventListener('input', function () {
        query = search.value;
        persist();
        render();
    });
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('keydown', onKeydown);
    window.addEventListener('message', function (event) {
        const message = event.data;
        if (!message || message.type !== 'render') {
            return;
        }
        model = message.model || model;
        if (kindFilter && !kindsOf(model).some(function (kind) { return kind.id === kindFilter; })) {
            kindFilter = '';
        }
        persist();
        render();
    });

    render();
    post({ type: 'ready' });

    function post(message) {
        vscode.postMessage(message);
    }

    function persist() {
        vscode.setState({
            model: model,
            query: query,
            kindFilter: kindFilter,
            missingOnly: missingOnly,
            folded: folded,
        });
    }

    function render() {
        const clients = model.clients || [];
        const searched = filterClients(clients, query);
        const view = applyFilters(searched);
        const listScroll = list.scrollTop;

        renderMetrics(count(clients));
        renderFilters(kindsOf(model), kindCounts(searched));
        filters.hidden = clients.length === 0;
        if (tools) {
            tools.hidden = false;
        }
        list.replaceChildren();
        renderList(clients, searched, view);
        list.scrollTop = listScroll;
    }

    function renderMetrics(total) {
        const missing = metric(total.missing, t("Missing"));
        if (total.missing > 0) {
            missing.classList.add('has-missing');
        }
        metrics.replaceChildren(
            metric(total.clients, t("Client")),
            metric(total.projects, t("Project")),
            metric(total.modules, t("Folder")),
            missing,
        );
    }

    function renderFilters(kinds, counts) {
        filters.replaceChildren(filterChip(null, !kindFilter, counts));
        kinds.forEach(function (kind) {
            const chip = filterChip(kind, kindFilter === kind.id, counts);
            if (chip) {
                filters.append(chip);
            }
        });
        const missing = actionButton(t("Missing only"), missingOnly ? 'chip active' : 'chip', 'filter-missing', '', '');
        missing.setAttribute('aria-pressed', String(missingOnly));
        filters.append(missing);
    }

    function renderList(clients, searched, view) {
        if (clients.length === 0) {
            list.append(emptyState());
            return;
        }
        if (query.trim() && searched.length === 0) {
            list.append(noMatch());
            return;
        }
        if ((kindFilter || missingOnly) && view.length === 0) {
            list.append(filterEmpty());
            return;
        }
        view.forEach(function (client) {
            list.append(renderClient(client));
        });
    }

    function renderClient(client) {
        const open = isOpen('client', client.id);
        const section = el('section', open ? 'fold-card client-card open' : 'fold-card client-card');
        section.style.setProperty('--tone', safeColor(client.color));
        const line = el('div', 'fold-head');
        const toggle = foldToggle('client', client.id, open, client.description || (countMessage("{0} project", "{0} projects", client.projects.length)));
        toggle.append(
            chevron(),
            clientIcon(),
            el('span', 'client-name', client.name),
            roleTag(t("Client")),
            el('span', 'client-meta', countMessage("{0} project", "{0} projects", client.projects.length)),
        );
        const actions = el('div', 'fold-actions');
        if (!isFiltering()) {
            actions.append(actionButton(t("Add project"), 'text-action', 'add-project', client.id, 'client'));
        }
        actions.append(menuButton(t("Edit client"), 'edit', client.id, 'client'));
        line.append(toggle, actions);
        section.append(line);
        if (!open) {
            return section;
        }
        const projects = el('div', 'fold-body');
        if (client.projects.length === 0) {
            projects.append(el('p', 'project-empty', t("No projects yet")));
        } else {
            client.projects.forEach(function (project) {
                projects.append(renderProject(project));
            });
        }
        section.append(projects);
        return section;
    }

    function renderProject(project) {
        const open = isOpen('project', project.id);
        const block = el('article', open ? 'fold-card project-card open' : 'fold-card project-card');
        block.style.setProperty('--tone', safeColor(project.color));
        const line = el('div', 'fold-head');
        const toggle = foldToggle('project', project.id, open, project.description || project.name);
        toggle.append(chevron(), projectIcon(), el('span', 'project-name', project.name), roleTag(t("Project")));
        if (project.description) {
            toggle.append(el('span', 'project-description', project.description));
        }
        const missing = project.modules.filter(function (module) { return !module.exists; }).length;
        if (missing > 0) {
            const dot = el('span', 'alert-dot');
            dot.title = countMessage("{0} missing path", "{0} missing paths", missing);
            dot.setAttribute('role', 'img');
            dot.setAttribute('aria-label', dot.title);
            toggle.append(dot);
        }
        const actions = el('div', 'fold-actions');
        actions.append(
            el('span', 'project-count', countMessage("{0} folder", "{0} folders", project.modules.length)),
            actionButton(t("Open project"), 'text-action', 'open', project.id, 'project'),
            actionButton(t("Choose window"), 'text-action', 'workspace', project.id, 'project'),
            actionButton(t("Add folder"), 'text-action', 'add-module', project.id, 'project'),
            menuButton(t("Edit project"), 'edit', project.id, 'project'),
        );
        line.append(toggle, actions);
        block.append(line);
        if (!open) {
            return block;
        }
        const board = el('div', 'fold-body module-board');
        if (project.modules.length === 0) {
            board.append(el('p', 'module-empty', t("No folders yet")));
        } else {
            project.modules.forEach(function (module) {
                board.append(renderModule(module));
            });
        }
        block.append(board);
        return block;
    }

    function foldToggle(nodeType, id, open, title) {
        const button = el('button', 'fold-toggle');
        button.type = 'button';
        button.dataset.action = 'toggle-fold';
        button.dataset.id = id;
        button.dataset.nodeType = nodeType;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.title = title;
        return button;
    }

    function renderModule(module) {
        const card = el('article', module.exists ? 'module-card' : 'module-card missing');
        card.style.setProperty('--tone', safeColor(module.color));
        const open = el('button', 'module-open');
        open.type = 'button';
        open.dataset.action = 'open';
        open.dataset.id = module.id;
        open.dataset.nodeType = 'module';
        open.title = module.exists ? module.path : t("Path does not exist: {0}", module.path);
        const heading = el('span', 'module-heading');
        heading.append(el('span', 'module-name', module.name));
        const tags = el('span', 'module-tags');
        const kind = el('span', 'module-kind');
        kind.append(tick(module.color), document.createTextNode(module.kindLabel || t("Folder")));
        tags.append(kind, roleTag(t("Module")), roleTag(t("Folder")));
        if (module.git) {
            tags.append(el('span', 'tag', 'Git'));
        }
        if (!module.exists) {
            tags.append(el('span', 'tag warn', t("Missing")));
        }
        open.append(heading, tags);
        if (model.showPath) {
            open.append(el('span', 'module-path', module.path || ''));
        }
        card.append(open, menuButton(t("Edit folder"), 'edit', module.id, 'module'));
        return card;
    }

    function actionButton(label, className, action, id, nodeType) {
        const button = el('button', className, label);
        button.type = 'button';
        button.dataset.action = action;
        button.dataset.id = id;
        button.dataset.nodeType = nodeType;
        return button;
    }

    function menuButton(label, action, id, nodeType) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu';
        button.title = label;
        button.setAttribute('aria-label', label);
        button.dataset.action = action;
        button.dataset.id = id;
        button.dataset.nodeType = nodeType;
        button.append(menuIcon());
        return button;
    }

    function menuIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('aria-hidden', 'true');
        ['3.2', '8', '12.8'].forEach(function (cy) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', '8');
            circle.setAttribute('cy', cy);
            circle.setAttribute('r', '1.15');
            circle.setAttribute('fill', 'currentColor');
            svg.append(circle);
        });
        return svg;
    }

    function clientIcon() {
        const svg = iconSvg('client-icon');
        iconPath(svg, 'M8 3.2a2.15 2.15 0 1 1 0 4.3 2.15 2.15 0 0 1 0-4.3z');
        iconPath(svg, 'M3.3 13.2c.55-2.35 2.25-3.6 4.7-3.6s4.15 1.25 4.7 3.6');
        return svg;
    }

    function projectIcon() {
        const svg = iconSvg('project-icon');
        ['M2.2 5.8 8 2.8l5.8 3L8 8.8 2.2 5.8z', 'M2.2 8.5 8 11.5l5.8-3', 'M2.2 11 8 14l5.8-3'].forEach(function (d) {
            iconPath(svg, d);
        });
        return svg;
    }

    function iconSvg(className) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '14');
        svg.setAttribute('height', '14');
        svg.setAttribute('class', className);
        svg.setAttribute('aria-hidden', 'true');
        return svg;
    }

    function iconPath(svg, d) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.3');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('d', d);
        svg.append(path);
    }

    function chevron() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('width', '12');
        svg.setAttribute('height', '12');
        svg.setAttribute('class', 'chevron');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.6');
        path.setAttribute('d', 'M6 3.5 10.5 8 6 12.5');
        svg.append(path);
        return svg;
    }

    function roleTag(label) {
        return el('span', 'role-tag', label);
    }

    function tick(color) {
        const node = el('span', 'tick');
        node.setAttribute('aria-hidden', 'true');
        if (color) {
            node.style.background = safeColor(color);
        }
        return node;
    }

    function filterChip(kind, pressed, counts) {
        const button = el('button', pressed ? 'chip active' : 'chip');
        button.type = 'button';
        button.dataset.action = 'filter-kind';
        button.dataset.kind = kind ? kind.id : '';
        button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        if (!kind) {
            const total = Object.keys(counts).reduce(function (sum, key) {
                return sum + counts[key];
            }, 0);
            button.append(document.createTextNode(t("All")), el('span', 'chip-count', numbers.format(total)));
            return button;
        }
        const countForKind = counts[kind.id] || 0;
        if (countForKind === 0 && kindFilter !== kind.id) {
            return null;
        }
        const swatch = el('span', 'swatch');
        swatch.style.background = safeColor(kind.color);
        button.append(swatch, document.createTextNode(kind.label), el('span', 'chip-count', numbers.format(countForKind)));
        return button;
    }

    function metric(value, label) {
        const node = el('span', 'metric');
        node.append(el('span', 'metric-label', label), el('strong', null, numbers.format(value)));
        return node;
    }

    function emptyState() {
        const box = el('div', 'empty');
        box.append(el('h2', null, t("Start by adding a client")));
        box.append(el('p', null, t("Add a client, create a project, then add folders to the project.")));
        box.append(actionButton(t("Add client"), 'primary', 'add-client', '', ''));
        return box;
    }

    function noMatch() {
        const box = el('div', 'no-match');
        box.append(el('h2', null, t("No results found")));
        box.append(el('p', null, t("Try another keyword or clear the search.")));
        const clear = el('button', 'ghost', t("Clear search"));
        clear.type = 'button';
        clear.dataset.action = 'clear-query';
        box.append(clear);
        return box;
    }

    function filterEmpty() {
        const box = el('div', 'filter-empty');
        box.append(el('h2', null, t("No folders match the filters")));
        box.append(el('p', null, t("Choose another type or clear the filters.")));
        const clear = el('button', 'ghost', t("Clear filters"));
        clear.type = 'button';
        clear.dataset.action = 'clear-filters';
        box.append(clear);
        return box;
    }

    function onClick(event) {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }
        const actionEl = target.closest('[data-action]');
        if (!actionEl || actionEl.disabled) {
            return;
        }
        const action = actionEl.dataset.action;
        if (action === 'filter-missing') {
            missingOnly = !missingOnly;
            persist();
            render();
            return;
        }
        if (action === 'toggle-fold') {
            const key = (actionEl.dataset.nodeType || '') + ':' + (actionEl.dataset.id || '');
            if (folded[key]) {
                delete folded[key];
            } else {
                folded[key] = true;
            }
            persist();
            render();
            return;
        }
        if (action === 'filter-kind') {
            const next = actionEl.dataset.kind || '';
            kindFilter = kindFilter === next ? '' : next;
            persist();
            render();
            return;
        }
        if (action === 'clear-query') {
            query = '';
            search.value = '';
            persist();
            render();
            search.focus();
            return;
        }
        if (action === 'clear-filters') {
            kindFilter = '';
            missingOnly = false;
            persist();
            render();
            return;
        }
        post({
            type: action,
            id: actionEl.dataset.id || '',
            nodeType: actionEl.dataset.nodeType || '',
            kind: actionEl.dataset.kind || '',
            direction: actionEl.dataset.direction || '',
            invert: event.ctrlKey || event.metaKey,
        });
    }

    function onKeydown(event) {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            search.focus();
            search.select();
            return;
        }
        if (event.key === 'Escape' && document.activeElement === search && search.value) {
            search.value = '';
            query = '';
            persist();
            render();
            return;
        }
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        const target = event.target;
        if (!(target instanceof Element) || target.matches('input, textarea, button')) {
            return;
        }
        const actionEl = target.closest('[data-action]');
        if (!actionEl) {
            return;
        }
        event.preventDefault();
        actionEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    function isOpen(nodeType, id) {
        if (query.trim() || kindFilter || missingOnly) {
            return true;
        }
        return !folded[nodeType + ':' + id];
    }

    function isFiltering() {
        return query.trim().length > 0 || kindFilter.length > 0 || missingOnly;
    }

    function applyFilters(clients) {
        if (!kindFilter && !missingOnly) {
            return clients;
        }
        return clients.reduce(function (result, client) {
            const projects = client.projects.reduce(function (matched, project) {
                const modules = project.modules.filter(function (module) {
                    return (!kindFilter || module.kind === kindFilter) && (!missingOnly || !module.exists);
                });
                if (modules.length > 0) {
                    matched.push(Object.assign({}, project, { modules: modules }));
                }
                return matched;
            }, []);
            if (projects.length > 0) {
                result.push(Object.assign({}, client, { projects: projects }));
            }
            return result;
        }, []);
    }

    function filterClients(clients, rawQuery) {
        const needle = rawQuery.trim().toLowerCase();
        if (!needle) {
            return clients;
        }
        return clients.reduce(function (result, client) {
            if (includes(client.name, needle) || includes(client.description, needle)) {
                result.push(client);
                return result;
            }
            const projects = client.projects.reduce(function (matched, project) {
                if (includes(project.name, needle) || includes(project.description, needle)) {
                    matched.push(project);
                    return matched;
                }
                const modules = project.modules.filter(function (module) {
                    return includes(module.name, needle)
                        || includes(module.path, needle)
                        || includes(module.description, needle)
                        || includes(module.kindLabel, needle)
                        || includes(module.kind, needle);
                });
                if (modules.length > 0) {
                    matched.push(Object.assign({}, project, { modules: modules }));
                }
                return matched;
            }, []);
            if (projects.length > 0) {
                result.push(Object.assign({}, client, { projects: projects }));
            }
            return result;
        }, []);
    }

    function count(clients) {
        return clients.reduce(function (total, client) {
            total.clients += 1;
            total.projects += client.projects.length;
            client.projects.forEach(function (project) {
                total.modules += project.modules.length;
                project.modules.forEach(function (module) {
                    if (!module.exists) {
                        total.missing += 1;
                    }
                });
            });
            return total;
        }, { clients: 0, projects: 0, modules: 0, missing: 0 });
    }

    function kindCounts(clients) {
        const counts = Object.create(null);
        clients.forEach(function (client) {
            client.projects.forEach(function (project) {
                project.modules.forEach(function (module) {
                    counts[module.kind] = (counts[module.kind] || 0) + 1;
                });
            });
        });
        return counts;
    }

    function kindsOf(current) {
        if (current.kinds && current.kinds.length) {
            return current.kinds;
        }
        const kinds = [];
        const seen = new Set();
        (current.clients || []).forEach(function (client) {
            (client.projects || []).forEach(function (project) {
                (project.modules || []).forEach(function (module) {
                    const id = module.kind || module.kindLabel || t("Other");
                    if (!seen.has(id)) {
                        seen.add(id);
                        kinds.push({ id: id, label: module.kindLabel || id, color: module.color || '#8b9bb4' });
                    }
                });
            });
        });
        return kinds;
    }

    function includes(value, needle) {
        return String(value || '').toLowerCase().includes(needle);
    }

    function safeColor(value) {
        return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#4c8dff';
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text !== undefined && text !== null) {
            node.textContent = text;
        }
        return node;
    }
}());
