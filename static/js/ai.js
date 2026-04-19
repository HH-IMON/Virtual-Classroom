/**
 * Virtual Classroom – AI Teaching Assistant Module
 * Smart chatbot with auto-answers, summarization, notes generation.
 */
const AIView = {
    messages: [],

    render() {
        const content = document.getElementById('content-area');
        content.innerHTML = `
<div class="page-header animate-in"><h1><i data-lucide="bot" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-secondary)"></i>AI Teaching Assistant</h1></div>
<div class="ai-layout animate-in stagger-1">
    <div class="ai-chat">
        <div class="ai-chat-header">
            <div class="ai-avatar"><i data-lucide="bot"></i></div>
            <div><strong>AI Teaching Assistant</strong><br><small style="color:var(--text-tertiary)">Powered by smart algorithms</small></div>
        </div>
        <div class="ai-messages" id="ai-messages">
            <div class="ai-message bot">
                <div class="ai-avatar" style="width:32px;height:32px;flex-shrink:0"><i data-lucide="bot" style="width:16px;height:16px"></i></div>
                <div class="message-body">
                    <div class="ai-message-text">Hello! I'm your AI Teaching Assistant. I can help you with:\n\n- **Explaining concepts** - Ask me anything!\n- **Summarizing lectures** - Get quick recaps\n- **Generating notes** - Auto-create study notes\n- **Practice quizzes** - Test your knowledge\n- **Study tips** - Personalized advice\n\nHow can I help you today?</div>
                </div>
            </div>
        </div>
        <div class="chat-input-area">
            <div id="ai-file-preview" style="font-size:0.75rem;color:var(--accent-primary);margin-bottom:4px;display:none;align-items:center;gap:4px;">
                <i data-lucide="file" style="width:14px;height:14px"></i> <span id="ai-file-name"></span>
                <button class="btn-icon" onclick="document.getElementById('ai-file-btn').value='';document.getElementById('ai-file-preview').style.display='none'" style="width:16px;height:16px;margin-left:4px"><i data-lucide="x" style="width:12px;height:12px"></i></button>
            </div>
            <div class="chat-input-wrapper">
                <textarea id="ai-input" placeholder="Ask me anything or attach a file..." rows="1"
                    onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();AIView.send()}"
                    oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"></textarea>
                <div class="chat-input-actions">
                    <label class="btn-icon" style="cursor:pointer" title="Attach File">
                        <i data-lucide="paperclip"></i>
                        <input type="file" id="ai-file-btn" hidden onchange="document.getElementById('ai-file-name').textContent=this.files[0]?.name||'';document.getElementById('ai-file-preview').style.display=this.files[0]?'flex':'none'">
                    </label>
                    <button class="btn-icon" onclick="AIView.send()" title="Send"><i data-lucide="send"></i></button>
                </div>
            </div>
        </div>
    </div>
    <div class="ai-sidebar-panel">
        <div class="gam-card">
            <h3><i data-lucide="zap" style="width:16px;height:16px;color:var(--accent-amber)"></i> Quick Actions</h3>
            <div class="ai-quick-actions">
                <button class="ai-action-btn" onclick="AIView.quickAsk('Explain the key concepts from my latest class')">
                    <i data-lucide="lightbulb"></i> Explain Concepts
                </button>
                <button class="ai-action-btn" onclick="AIView.quickAsk('Summarize my recent lecture content')">
                    <i data-lucide="file-text"></i> Summarize Lecture
                </button>
                <button class="ai-action-btn" onclick="AIView.quickAsk('Generate a practice quiz for me')">
                    <i data-lucide="help-circle"></i> Practice Quiz
                </button>
                <button class="ai-action-btn" onclick="AIView.quickAsk('Give me study tips for exam preparation')">
                    <i data-lucide="target"></i> Study Tips
                </button>
                <button class="ai-action-btn" onclick="AIView.quickAsk('What are my weak areas based on my performance?')">
                    <i data-lucide="bar-chart-3"></i> Performance Analysis
                </button>
                <button class="ai-action-btn" onclick="AIView.quickAsk('Suggest a personalized learning path for me')">
                    <i data-lucide="map"></i> Learning Path
                </button>
            </div>
        </div>
        <div class="gam-card">
            <h3><i data-lucide="book-open" style="width:16px;height:16px;color:var(--accent-cyan)"></i> Auto Notes</h3>
            <div class="form-group"><label>Topic</label><input type="text" id="ai-notes-topic" placeholder="Enter topic..."></div>
            <button class="btn btn-primary btn-full btn-sm" onclick="AIView.generateNotes()"><i data-lucide="file-plus"></i> Generate Notes</button>
            <div id="ai-notes-list" style="margin-top:var(--space-md)"></div>
        </div>
    </div>
</div>`;
        lucide.createIcons();
        this.loadNotes();
    },

    async send() {
        const input = document.getElementById('ai-input');
        const fileInput = document.getElementById('ai-file-btn');
        const question = input.value.trim();
        const file = fileInput.files[0];

        if (!question && !file) return;

        let displayMsg = question;
        if (file) displayMsg += ` (Attached: ${file.name})`;
        if (!question && file) displayMsg = `Attached File: ${file.name}`;

        this.addMessage('user', displayMsg);
        input.value = '';
        input.style.height = 'auto';
        fileInput.value = '';
        document.getElementById('ai-file-preview').style.display = 'none';

        // Show typing indicator
        const msgs = document.getElementById('ai-messages');
        const typing = document.createElement('div');
        typing.className = 'ai-message bot'; typing.id = 'ai-typing';
        typing.innerHTML = `<div class="ai-avatar" style="width:32px;height:32px;flex-shrink:0"><i data-lucide="bot" style="width:16px;height:16px"></i></div><div class="message-body"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
        msgs.appendChild(typing);
        lucide.createIcons();
        msgs.scrollTop = msgs.scrollHeight;

        try {
            const formData = new FormData();
            if (question) formData.append('question', question);
            if (file) formData.append('file', file);

            const data = await App.apiUpload('/api/ai/ask', formData);
            document.getElementById('ai-typing')?.remove();
            this.addMessage('bot', data.response);
        } catch (e) {
            document.getElementById('ai-typing')?.remove();
            this.addMessage('bot', 'Sorry, I encountered an error. Please try again or check your API Key locally. Error: ' + e.message);
        }
    },

    quickAsk(question) {
        document.getElementById('ai-input').value = question;
        this.send();
    },

    addMessage(role, text) {
        const msgs = document.getElementById('ai-messages');
        if (!msgs) return;
        const div = document.createElement('div');
        div.className = `ai-message ${role}`;
        if (role === 'bot') {
            div.innerHTML = `<div class="ai-avatar" style="width:32px;height:32px;flex-shrink:0"><i data-lucide="bot" style="width:16px;height:16px"></i></div><div class="message-body"><div class="ai-message-text">${this.formatText(text)}</div></div>`;
        } else {
            div.innerHTML = `<div class="message-body"><div class="ai-message-text">${App.escapeHtml(text)}</div></div>`;
        }
        msgs.appendChild(div);
        lucide.createIcons();
        msgs.scrollTop = msgs.scrollHeight;
    },

    formatText(text) {
        return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                   .replace(/\n/g, '<br>');
    },

    async generateNotes() {
        const topic = document.getElementById('ai-notes-topic').value.trim();
        if (!topic) { App.toast('Enter a topic', 'warning'); return; }
        try {
            const data = await App.api('/api/ai/notes', 'POST', { topic, classroom_id: App.state.currentClassId });
            App.toast('Notes generated!', 'success');
            document.getElementById('ai-notes-topic').value = '';
            this.loadNotes();
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async loadNotes() {
        try {
            const data = await App.api('/api/ai/notes');
            const list = document.getElementById('ai-notes-list');
            if (!list) return;
            if (!data.notes.length) { list.innerHTML = '<p style="font-size:0.75rem;color:var(--text-tertiary)">No notes generated yet.</p>'; return; }
            list.innerHTML = data.notes.slice(0, 5).map(n => `<div class="bookmark-card" onclick="AIView.viewNote(${n.id})" style="margin-bottom:8px"><div class="bookmark-icon lecture"><i data-lucide="file-text"></i></div><div class="bookmark-title" style="font-size:0.8rem">${App.escapeHtml(n.title)}<br><small style="color:var(--text-tertiary)">${App.timeAgo(n.created_at)}</small></div></div>`).join('');
            lucide.createIcons();
        } catch (e) {}
    },

    viewNote(id) {
        App.toast('Opening note...', 'info');
    }
};
