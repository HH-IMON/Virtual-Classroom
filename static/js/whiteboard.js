/**
 * Virtual Classroom – Collaborative Whiteboard
 * HTML5 Canvas-based drawing with tools, sticky notes, and socket sync.
 */
const Whiteboard = {
    canvas: null, ctx: null, isDrawing: false, tool: 'pen',
    color: '#6366f1', size: 3, history: [], historyIndex: -1,
    startX: 0, startY: 0, stickyCount: 0,

    open() {
        document.getElementById('whiteboard-screen').classList.remove('hidden');
        this.canvas = document.getElementById('whiteboard-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.canvas.addEventListener('mousedown', e => this.startDraw(e));
        this.canvas.addEventListener('mousemove', e => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.endDraw());
        this.canvas.addEventListener('mouseleave', () => this.endDraw());
        this.canvas.addEventListener('touchstart', e => { e.preventDefault(); this.startDraw(e.touches[0]); });
        this.canvas.addEventListener('touchmove', e => { e.preventDefault(); this.draw(e.touches[0]); });
        this.canvas.addEventListener('touchend', () => this.endDraw());
        this.saveState();
        lucide.createIcons();
    },

    close() {
        document.getElementById('whiteboard-screen').classList.add('hidden');
        window.location.hash = '#/dashboard';
    },

    resize() {
        if (!this.canvas) return;
        const wrapper = this.canvas.parentElement;
        this.canvas.width = wrapper.clientWidth;
        this.canvas.height = wrapper.clientHeight;
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (this.history.length > 0 && this.historyIndex >= 0) {
            const img = new Image();
            img.onload = () => this.ctx.drawImage(img, 0, 0);
            img.src = this.history[this.historyIndex];
        }
    },

    setTool(tool) {
        this.tool = tool;
        document.querySelectorAll('.wb-tool[data-tool]').forEach(t => t.classList.toggle('active', t.dataset.tool === tool));
        this.canvas.style.cursor = tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair';
    },

    setColor(c) { this.color = c; },
    setSize(s) { this.size = parseInt(s); },

    startDraw(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.startX = e.clientX - rect.left;
        this.startY = e.clientY - rect.top;

        if (this.tool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                this.ctx.font = `${this.size * 5}px Inter, sans-serif`;
                this.ctx.fillStyle = this.color;
                this.ctx.fillText(text, this.startX, this.startY);
                this.saveState();
                this.emitDraw({ type: 'text', x: this.startX, y: this.startY, text, color: this.color, size: this.size });
            }
            return;
        }

        this.isDrawing = true;
        if (this.tool === 'pen' || this.tool === 'eraser') {
            this.ctx.beginPath();
            this.ctx.moveTo(this.startX, this.startY);
        }
    },

    draw(e) {
        if (!this.isDrawing) return;
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left, y = e.clientY - rect.top;

        if (this.tool === 'pen') {
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            this.ctx.lineTo(x, y);
            this.ctx.stroke();
            this.emitDraw({ type: 'pen', x, y, color: this.color, size: this.size });
        } else if (this.tool === 'eraser') {
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = this.size * 4;
            this.ctx.lineCap = 'round';
            this.ctx.lineTo(x, y);
            this.ctx.stroke();
        }
    },

    endDraw() {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.tool === 'rect') {
            const rect = this.canvas.getBoundingClientRect();
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
            const w = this.lastX - this.startX, h = this.lastY - this.startY;
            this.ctx.strokeRect(this.startX, this.startY, w || 100, h || 60);
        } else if (this.tool === 'circle') {
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.size;
            this.ctx.beginPath();
            this.ctx.arc(this.startX, this.startY, 50, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        this.saveState();
    },

    addSticky() {
        this.stickyCount++;
        const colors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#f5d0fe', '#fed7aa'];
        const color = colors[this.stickyCount % colors.length];
        const container = document.getElementById('sticky-container');
        const note = document.createElement('div');
        note.className = 'sticky-note';
        note.style.background = color;
        note.style.left = (100 + Math.random() * 200) + 'px';
        note.style.top = (100 + Math.random() * 200) + 'px';
        note.innerHTML = `<button class="sticky-delete" onclick="this.parentElement.remove()">&times;</button><textarea placeholder="Type here..."></textarea>`;
        note.draggable = false;

        let isDragging = false, offsetX, offsetY;
        note.addEventListener('mousedown', e => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
            isDragging = true; offsetX = e.offsetX; offsetY = e.offsetY;
        });
        document.addEventListener('mousemove', e => {
            if (!isDragging) return;
            const wrapper = container.getBoundingClientRect();
            note.style.left = (e.clientX - wrapper.left - offsetX) + 'px';
            note.style.top = (e.clientY - wrapper.top - offsetY) + 'px';
        });
        document.addEventListener('mouseup', () => isDragging = false);

        container.appendChild(note);
    },

    saveState() {
        if (!this.canvas) return;
        this.historyIndex++;
        this.history = this.history.slice(0, this.historyIndex);
        this.history.push(this.canvas.toDataURL());
    },

    undo() {
        if (this.historyIndex <= 0) return;
        this.historyIndex--;
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = this.history[this.historyIndex];
    },

    clearAll() {
        if (!confirm('Clear the entire whiteboard?')) return;
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        document.getElementById('sticky-container').innerHTML = '';
        this.saveState();
        App.state.socket?.emit('whiteboard_clear', {});
    },

    download() {
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = this.canvas.toDataURL();
        link.click();
    },

    emitDraw(data) {
        App.state.socket?.emit('whiteboard_draw', data);
    },

    onRemoteDraw(data) {
        if (!this.ctx) return;
        if (data.type === 'pen') {
            this.ctx.strokeStyle = data.color;
            this.ctx.lineWidth = data.size;
            this.ctx.lineCap = 'round';
            this.ctx.lineTo(data.x, data.y);
            this.ctx.stroke();
        } else if (data.type === 'text') {
            this.ctx.font = `${data.size * 5}px Inter, sans-serif`;
            this.ctx.fillStyle = data.color;
            this.ctx.fillText(data.text, data.x, data.y);
        }
    },

    onRemoteClear() {
        if (!this.ctx) return;
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
};
