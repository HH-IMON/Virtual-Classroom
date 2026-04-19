/**
 * Virtual Classroom – Enhanced Chat Module
 * Group chat, private messages, pinned messages, reactions, file sharing via drag-drop.
 */
const ChatView = {
    currentChatType: 'group', currentChatId: null, currentChatName: '',

    render() {
        const content = document.getElementById('content-area');
        content.innerHTML = `
<div class="page-header animate-in"><h1><i data-lucide="message-circle" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-cyan)"></i>Messages</h1></div>
<div class="chat-layout animate-in stagger-1">
    <div class="chat-sidebar">
        <div class="chat-sidebar-header">
            <h3>Conversations</h3>
            <div class="chat-tabs">
                <button class="chat-tab active" onclick="ChatView.switchChatType('group',this)">Groups</button>
                <button class="chat-tab" onclick="ChatView.switchChatType('private',this)">Direct</button>
            </div>
        </div>
        <div class="chat-list" id="chat-list"></div>
    </div>
    <div class="chat-main">
        <div class="chat-main-header" id="chat-header">
            <div class="user-avatar" style="background:var(--gradient-accent)"><i data-lucide="message-circle" style="width:16px;height:16px"></i></div>
            <h3 id="chat-active-name">Select a conversation</h3>
            <div class="chat-header-actions" id="chat-header-actions"></div>
        </div>
        <div class="chat-messages" id="chat-messages">
            <div class="chat-empty"><i data-lucide="message-circle"></i><h3>Start a conversation</h3><p>Select a group or person to chat.</p></div>
        </div>
        <div class="typing-indicator hidden" id="typing-indicator"><div class="typing-dots"><span></span><span></span><span></span></div><span id="typing-user"></span></div>
        <div class="chat-input-area hidden" id="chat-input-area">
            <div class="chat-input-wrapper" id="chat-input-wrapper"
                ondragover="event.preventDefault();this.style.borderColor='var(--accent-primary)'"
                ondragleave="this.style.borderColor=''"
                ondrop="event.preventDefault();this.style.borderColor='';ChatView.handleFileDrop(event)">
                <textarea id="chat-input" placeholder="Type a message..." rows="1"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ChatView.sendMessage()}"
                    oninput="ChatView.onTyping();this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
                <div class="chat-input-actions">
                    <label class="btn-icon" title="Attach file"><i data-lucide="paperclip"></i><input type="file" style="display:none" onchange="ChatView.sendFile(this.files[0])"></label>
                    <button class="btn-icon" onclick="ChatView.sendMessage()" title="Send"><i data-lucide="send"></i></button>
                </div>
            </div>
        </div>
    </div>
</div>`;
        lucide.createIcons();
        this.loadChatList('group');
    },

    async switchChatType(type, btn) {
        this.currentChatType = type;
        document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
        btn?.classList.add('active');
        this.loadChatList(type);
    },

    async loadChatList(type) {
        const list = document.getElementById('chat-list');
        if (!list) return;
        list.innerHTML = '<div class="spinner"></div>';
        try {
            if (type === 'group') {
                const data = await App.api('/api/classrooms');
                const classes = data.classrooms || [];
                if (!classes.length) { list.innerHTML = '<div class="empty-state small"><p>No classes joined yet.</p></div>'; return; }
                list.innerHTML = classes.map(c => `<div class="chat-list-item ${this.currentChatId === c.id && this.currentChatType === 'group' ? 'active' : ''}" onclick="ChatView.openGroupChat(${c.id},'${App.escapeHtml(c.name)}')"><div class="user-avatar" style="background:var(--gradient-primary)">${App.getInitial(c.name)}</div><div class="chat-list-info"><div class="chat-list-name">${App.escapeHtml(c.name)}</div><div class="chat-list-preview">${c.member_count} members</div></div></div>`).join('');
            } else {
                const data = await App.api('/api/messages/conversations');
                const convos = data.conversations || [];
                if (!convos.length) { list.innerHTML = '<div class="empty-state small"><p>No conversations yet.</p></div>'; return; }
                list.innerHTML = convos.map(c => `<div class="chat-list-item ${this.currentChatId === c.user.id && this.currentChatType === 'private' ? 'active' : ''}" onclick="ChatView.openPrivateChat(${c.user.id},'${App.escapeHtml(c.user.first_name || c.user.username)}')"><div class="user-avatar">${App.getInitial(c.user.first_name || c.user.username)}</div><div class="chat-list-info"><div class="chat-list-name">${App.escapeHtml(c.user.first_name || c.user.username)}</div><div class="chat-list-preview">${c.last_message ? App.escapeHtml(c.last_message.content).substring(0, 40) : ''}</div></div>${c.unread_count ? `<div class="chat-unread-badge">${c.unread_count}</div>` : ''}<div class="chat-list-time">${c.last_message ? App.timeAgo(c.last_message.created_at) : ''}</div></div>`).join('');
            }
        } catch (e) { list.innerHTML = `<div class="empty-state small"><p>${e.message}</p></div>`; }
    },

    async openGroupChat(classId, name) {
        this.currentChatType = 'group'; this.currentChatId = classId; this.currentChatName = name;
        document.getElementById('chat-active-name').textContent = name;
        document.getElementById('chat-input-area').classList.remove('hidden');
        document.getElementById('chat-header-actions').innerHTML = `<button class="btn-icon" onclick="ChatView.showPinned(${classId})" title="Pinned"><i data-lucide="pin"></i></button>`;
        lucide.createIcons();
        // Mark active
        document.querySelectorAll('.chat-list-item').forEach(i => i.classList.remove('active'));
        event?.target.closest('.chat-list-item')?.classList.add('active');
        // Join socket room
        App.state.socket?.emit('join_room', { classroom_id: classId });
        await this.loadMessages();
    },

    async openPrivateChat(userId, name) {
        this.currentChatType = 'private'; this.currentChatId = userId; this.currentChatName = name;
        document.getElementById('chat-active-name').textContent = name;
        document.getElementById('chat-input-area').classList.remove('hidden');
        document.getElementById('chat-header-actions').innerHTML = '';
        document.querySelectorAll('.chat-list-item').forEach(i => i.classList.remove('active'));
        event?.target.closest('.chat-list-item')?.classList.add('active');
        await this.loadMessages();
    },

    async loadMessages() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '<div class="spinner"></div>';
        try {
            let msgs;
            if (this.currentChatType === 'group') {
                const data = await App.api(`/api/classrooms/${this.currentChatId}/messages`);
                msgs = data.messages || [];
            } else {
                const data = await App.api(`/api/messages/private/${this.currentChatId}`);
                msgs = data.messages || [];
            }
            if (!msgs.length) { container.innerHTML = '<div class="chat-empty"><i data-lucide="message-circle"></i><p>No messages yet. Say hello!</p></div>'; lucide.createIcons(); return; }
            container.innerHTML = msgs.map(m => this.renderMessage(m)).join('');
            lucide.createIcons();
            container.scrollTop = container.scrollHeight;
        } catch (e) { container.innerHTML = `<div class="chat-empty"><p>${e.message}</p></div>`; }
    },

    renderMessage(m) {
        const isSelf = m.sender_id === App.state.user.id;
        const reactions = m.reactions && Object.keys(m.reactions).length ? `<div class="message-reactions">${Object.entries(m.reactions).map(([emoji, users]) => `<span class="message-reaction" onclick="ChatView.react(${m.id},'${emoji}')">${emoji} ${users.length}</span>`).join('')}</div>` : '';
        const pin = m.is_pinned ? `<div class="message-pin-indicator"><i data-lucide="pin" style="width:10px;height:10px"></i> Pinned</div>` : '';
        const file = m.file_path ? `<a href="${m.file_path}" target="_blank" class="assignment-file-link"><i data-lucide="paperclip"></i> ${App.escapeHtml(m.file_name || 'File')}</a>` : '';

        return `<div class="message-bubble ${isSelf ? 'self' : ''}" oncontextmenu="event.preventDefault();ChatView.showMessageActions(event,${m.id})"><div class="message-avatar"><div class="user-avatar" style="width:30px;height:30px;font-size:0.7rem">${App.getInitial(m.sender_name)}</div></div><div class="message-body">${pin}<div class="message-sender">${App.escapeHtml(m.sender_name)}</div><div class="message-text">${App.escapeHtml(m.content)}</div>${file}${reactions}<div class="message-time">${App.formatTime(m.created_at)}</div></div></div>`;
    },

    async sendMessage() {
        const input = document.getElementById('chat-input');
        const text = input.value.trim();
        if (!text || !this.currentChatId) return;
        input.value = ''; input.style.height = 'auto';
        try {
            if (this.currentChatType === 'group') {
                App.state.socket?.emit('send_message', { classroom_id: this.currentChatId, content: text });
            } else {
                App.state.socket?.emit('send_private_message', { receiver_id: this.currentChatId, content: text });
            }
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async sendFile(file) {
        if (!file || !this.currentChatId) return;
        try {
            const fd = new FormData(); fd.append('file', file);
            if (this.currentChatType === 'group') fd.append('classroom_id', this.currentChatId);
            const data = await App.apiUpload('/api/upload', fd);
            if (this.currentChatType === 'group') {
                App.state.socket?.emit('send_message', { classroom_id: this.currentChatId, content: `Shared file: ${file.name}`, file_path: data.file_path, file_name: file.name });
            }
            App.toast('File sent!', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    handleFileDrop(event) {
        const files = event.dataTransfer.files;
        if (files.length) this.sendFile(files[0]);
    },

    async react(msgId, emoji) {
        try { await App.api(`/api/messages/${msgId}/react`, 'PUT', { emoji }); this.loadMessages(); } catch (e) {}
    },

    async showPinned(classId) {
        try {
            const data = await App.api(`/api/classrooms/${classId}/messages/pinned`);
            const msgs = data.messages || [];
            const container = document.getElementById('chat-messages');
            if (!msgs.length) { App.toast('No pinned messages', 'info'); return; }
            container.innerHTML = `<div style="padding:var(--space-md)"><h3 style="margin-bottom:var(--space-md)">Pinned Messages</h3><button class="btn btn-ghost btn-sm" onclick="ChatView.loadMessages()" style="margin-bottom:var(--space-md)"><i data-lucide="arrow-left"></i> Back</button>${msgs.map(m => this.renderMessage(m)).join('')}</div>`;
            lucide.createIcons();
        } catch (e) { App.toast(e.message, 'error'); }
    },

    showMessageActions(event, msgId) {
        // Simple context actions
        const options = ['Pin/Unpin', 'React ❤️', 'React 👍', 'React 😂'];
        const choice = prompt(`Actions for message:\n1. Pin/Unpin\n2. React ❤️\n3. React 👍\n4. React 😂\nEnter number:`);
        if (choice === '1') this.togglePin(msgId);
        else if (choice === '2') this.react(msgId, '❤️');
        else if (choice === '3') this.react(msgId, '👍');
        else if (choice === '4') this.react(msgId, '😂');
    },

    async togglePin(msgId) {
        try { await App.api(`/api/messages/${msgId}/pin`, 'PUT'); this.loadMessages(); App.toast('Toggled pin', 'success'); } catch (e) {}
    },

    typingTimeout: null,
    onTyping() {
        if (this.currentChatType !== 'group') return;
        App.state.socket?.emit('typing', { classroom_id: this.currentChatId, username: App.state.user.username });
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            App.state.socket?.emit('stop_typing', { classroom_id: this.currentChatId, username: App.state.user.username });
        }, 2000);
    },

    onNewMessage(msg) {
        if (this.currentChatType === 'group' && msg.classroom_id === this.currentChatId) {
            const container = document.getElementById('chat-messages');
            const isEmpty = container?.querySelector('.chat-empty');
            if (isEmpty) container.innerHTML = '';
            container?.insertAdjacentHTML('beforeend', this.renderMessage(msg));
            lucide.createIcons();
            container.scrollTop = container.scrollHeight;
        }
        if (msg.sender_id !== App.state.user?.id) App.loadNotifications();
    },

    onNewPrivateMessage(msg) {
        if (this.currentChatType === 'private' && (msg.sender_id === this.currentChatId || msg.receiver_id === this.currentChatId)) {
            this.loadMessages();
        }
        if (msg.sender_id !== App.state.user?.id) App.loadNotifications();
    },

    onTyping(data) {
        if (data.username === App.state.user?.username) return;
        const indicator = document.getElementById('typing-indicator');
        const userEl = document.getElementById('typing-user');
        if (indicator) { indicator.classList.remove('hidden'); userEl.textContent = `${data.username} is typing...`; }
    },

    onStopTyping() {
        document.getElementById('typing-indicator')?.classList.add('hidden');
    }
};
