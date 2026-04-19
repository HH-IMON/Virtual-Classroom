/**
 * Virtual Classroom – Productivity Module
 * To-do list, bookmarks, and organizational tools.
 */
const ProductivityView = {
    // ── To-Do List ─────────────────────────────────────
    async renderTodos() {
        const content = document.getElementById('content-area');
        content.innerHTML = `<div class="page-header animate-in"><h1><i data-lucide="check-square" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-emerald)"></i>To-Do List</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="App.openModal('modal-add-todo')"><i data-lucide="plus"></i> Add Task</button></div></div><div class="spinner"></div>`;
        try {
            const data = await App.api('/api/todos');
            this.renderTodoList(data.todos);
        } catch (e) { content.innerHTML += `<div class="empty-state"><p>${e.message}</p></div>`; }
    },

    renderTodoList(todos) {
        const content = document.getElementById('content-area');
        const pending = todos.filter(t => !t.is_done);
        const done = todos.filter(t => t.is_done);

        let html = `<div class="page-header animate-in"><h1><i data-lucide="check-square" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-emerald)"></i>To-Do List</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="App.openModal('modal-add-todo')"><i data-lucide="plus"></i> Add Task</button></div></div>`;

        if (!todos.length) {
            html += `<div class="empty-state animate-in"><i data-lucide="check-square"></i><h3>All Clear!</h3><p>No tasks yet. Add one to get organized.</p></div>`;
        } else {
            if (pending.length) {
                html += `<div class="section-title animate-in stagger-1"><i data-lucide="circle"></i> Pending (${pending.length})</div>`;
                html += `<div class="todo-list animate-in stagger-2">`;
                pending.forEach(t => { html += this.renderTodoItem(t); });
                html += `</div>`;
            }
            if (done.length) {
                html += `<div class="section-title animate-in stagger-3" style="margin-top:var(--space-xl)"><i data-lucide="check-circle"></i> Completed (${done.length})</div>`;
                html += `<div class="todo-list animate-in stagger-4">`;
                done.forEach(t => { html += this.renderTodoItem(t); });
                html += `</div>`;
            }
        }

        content.innerHTML = html;
        lucide.createIcons();
    },

    renderTodoItem(t) {
        return `<div class="todo-item ${t.is_done ? 'done' : ''}">
            <div class="todo-checkbox ${t.is_done ? 'checked' : ''}" onclick="ProductivityView.toggleTodo(${t.id}, ${!t.is_done})"></div>
            <div class="todo-text">${App.escapeHtml(t.text)}</div>
            <span class="todo-priority ${t.priority}">${t.priority}</span>
            ${t.due_date ? `<span class="todo-due">${App.formatDate(t.due_date)}</span>` : ''}
            <button class="todo-delete" onclick="ProductivityView.deleteTodo(${t.id})"><i data-lucide="trash-2"></i></button>
        </div>`;
    },

    async createTodo() {
        const text = document.getElementById('todo-text').value.trim();
        if (!text) { App.toast('Enter a task', 'warning'); return; }
        const priority = document.getElementById('todo-priority').value;
        const due = document.getElementById('todo-due').value;
        try {
            await App.api('/api/todos', 'POST', { text, priority, due_date: due || null });
            App.closeModal('modal-add-todo');
            document.getElementById('todo-text').value = '';
            App.toast('Task added!', 'success');
            this.renderTodos();
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async toggleTodo(id, done) {
        try {
            await App.api(`/api/todos/${id}`, 'PUT', { is_done: done });
            if (done) App.toast('Task completed! +5 XP', 'success');
            this.renderTodos();
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async deleteTodo(id) {
        try {
            await App.api(`/api/todos/${id}`, 'DELETE');
            this.renderTodos();
        } catch (e) { App.toast(e.message, 'error'); }
    },

    // ── Bookmarks ─────────────────────────────────────
    async renderBookmarks() {
        const content = document.getElementById('content-area');
        content.innerHTML = `<div class="page-header animate-in"><h1><i data-lucide="bookmark" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i>Bookmarks</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="App.openModal('modal-add-bookmark')"><i data-lucide="plus"></i> Add Bookmark</button></div></div><div class="spinner"></div>`;
        try {
            const data = await App.api('/api/bookmarks');
            this.renderBookmarkList(data.bookmarks);
        } catch (e) { content.innerHTML += `<div class="empty-state"><p>${e.message}</p></div>`; }
    },

    renderBookmarkList(bookmarks) {
        const content = document.getElementById('content-area');
        let html = `<div class="page-header animate-in"><h1><i data-lucide="bookmark" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i>Bookmarks</h1><div class="page-header-actions"><button class="btn btn-primary" onclick="App.openModal('modal-add-bookmark')"><i data-lucide="plus"></i> Add Bookmark</button></div></div>`;

        if (!bookmarks.length) {
            html += `<div class="empty-state animate-in"><i data-lucide="bookmark"></i><h3>No Bookmarks</h3><p>Save important lectures, resources, and links here.</p></div>`;
        } else {
            html += `<div class="bookmark-list animate-in stagger-1">`;
            bookmarks.forEach(b => {
                html += `<div class="bookmark-card" onclick="if('${b.link}')window.location.hash='${b.link}'">
                    <div class="bookmark-icon ${b.bookmark_type}"><i data-lucide="${{lecture:'video',resource:'file',assignment:'file-text',other:'link'}[b.bookmark_type]||'bookmark'}"></i></div>
                    <div class="bookmark-title">${App.escapeHtml(b.title)}<br><small style="color:var(--text-tertiary)">${App.timeAgo(b.created_at)}</small></div>
                    <button class="bookmark-delete" onclick="event.stopPropagation();ProductivityView.deleteBookmark(${b.id})"><i data-lucide="trash-2"></i></button>
                </div>`;
            });
            html += `</div>`;
        }

        content.innerHTML = html;
        lucide.createIcons();
    },

    async createBookmark() {
        const title = document.getElementById('bm-title').value.trim();
        if (!title) { App.toast('Enter a title', 'warning'); return; }
        const link = document.getElementById('bm-link').value.trim();
        const type = document.getElementById('bm-type').value;
        try {
            await App.api('/api/bookmarks', 'POST', { title, link, type });
            App.closeModal('modal-add-bookmark');
            document.getElementById('bm-title').value = '';
            document.getElementById('bm-link').value = '';
            App.toast('Bookmark saved!', 'success');
            this.renderBookmarks();
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async deleteBookmark(id) {
        try {
            await App.api(`/api/bookmarks/${id}`, 'DELETE');
            this.renderBookmarks();
        } catch (e) { App.toast(e.message, 'error'); }
    }
};
