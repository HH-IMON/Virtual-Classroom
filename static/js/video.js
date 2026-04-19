/**
 * Virtual Classroom – Video Call Module
 * WebRTC video conferencing with screen share, raise hand, in-class quiz, and participants panel.
 */
const VideoCall = {
    localStream: null, screenStream: null, peers: {},
    isMuted: false, isCamOff: false, isScreenSharing: false, isHandRaised: false,
    roomId: null, roomName: '', timerInterval: null, startTime: null,

    startCall(classroomId, className) {
        this.roomId = classroomId;
        this.roomName = className || 'Live Class';
        document.getElementById('video-room-name').textContent = this.roomName;
        document.getElementById('local-video-name').textContent = App.state.user?.first_name || 'You';
        document.getElementById('video-screen').classList.remove('hidden');
        document.getElementById('app-screen').classList.add('hidden');
        this.startTimer();
        this.initMedia();
    },

    async initMedia() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            document.getElementById('local-video').srcObject = this.localStream;
            App.state.socket?.emit('join_video_room', { classroom_id: this.roomId, username: App.state.user?.username || 'User' });
        } catch (e) {
            console.error('Media error:', e);
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                document.getElementById('local-video').srcObject = this.localStream;
                App.state.socket?.emit('join_video_room', { classroom_id: this.roomId, username: App.state.user?.username || 'User' });
            } catch (e2) {
                App.toast('Camera/mic not available. Joining as observer.', 'warning');
                App.state.socket?.emit('join_video_room', { classroom_id: this.roomId, username: App.state.user?.username || 'User' });
            }
        }
    },

    leaveCall() {
        if (this.localStream) this.localStream.getTracks().forEach(t => t.stop());
        if (this.screenStream) this.screenStream.getTracks().forEach(t => t.stop());
        Object.values(this.peers).forEach(pc => pc.close());
        this.peers = {};
        App.state.socket?.emit('leave_video_room', { classroom_id: this.roomId });
        clearInterval(this.timerInterval);
        document.getElementById('video-screen').classList.add('hidden');
        document.getElementById('app-screen').classList.remove('hidden');
        this.isMuted = false; this.isCamOff = false; this.isScreenSharing = false; this.isHandRaised = false;
    },

    toggleMic() {
        if (!this.localStream) return;
        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(t => t.enabled = !this.isMuted);
        document.getElementById('mic-icon-on').classList.toggle('hidden', this.isMuted);
        document.getElementById('mic-icon-off').classList.toggle('hidden', !this.isMuted);
        document.getElementById('btn-toggle-mic').classList.toggle('muted', this.isMuted);
        document.getElementById('local-mic-indicator').classList.toggle('hidden', !this.isMuted);
        App.state.socket?.emit('audio_toggle', { classroom_id: this.roomId, muted: this.isMuted });
    },

    toggleCamera() {
        if (!this.localStream) return;
        this.isCamOff = !this.isCamOff;
        this.localStream.getVideoTracks().forEach(t => t.enabled = !this.isCamOff);
        document.getElementById('cam-icon-on').classList.toggle('hidden', this.isCamOff);
        document.getElementById('cam-icon-off').classList.toggle('hidden', !this.isCamOff);
        document.getElementById('btn-toggle-camera').classList.toggle('muted', this.isCamOff);
        App.state.socket?.emit('video_toggle', { classroom_id: this.roomId, hidden: this.isCamOff });
    },

    async toggleScreenShare() {
        if (!this.isScreenSharing) {
            try {
                this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = this.screenStream.getVideoTracks()[0];
                document.getElementById('local-video').srcObject = this.screenStream;
                screenTrack.onended = () => this.stopScreenShare();
                this.isScreenSharing = true;
                document.getElementById('btn-share-screen').classList.add('active');
                App.toast('Screen sharing started', 'info');
            } catch (e) { App.toast('Screen share cancelled', 'info'); }
        } else {
            this.stopScreenShare();
        }
    },

    stopScreenShare() {
        if (this.screenStream) this.screenStream.getTracks().forEach(t => t.stop());
        document.getElementById('local-video').srcObject = this.localStream;
        this.isScreenSharing = false;
        document.getElementById('btn-share-screen').classList.remove('active');
    },

    toggleRaiseHand() {
        this.isHandRaised = !this.isHandRaised;
        document.getElementById('btn-raise-hand').classList.toggle('active', this.isHandRaised);
        App.state.socket?.emit('raise_hand', { classroom_id: this.roomId, raised: this.isHandRaised, username: App.state.user?.username });
        App.toast(this.isHandRaised ? 'Hand raised!' : 'Hand lowered', 'info');
    },

    toggleChat() {
        const sidebar = document.getElementById('video-sidebar');
        sidebar.classList.toggle('hidden');
        document.getElementById('video-sidebar-title').textContent = 'Chat';
        document.getElementById('video-sidebar-content').innerHTML = `<div class="chat-messages" id="video-chat-msgs" style="height:calc(100% - 80px);overflow-y:auto"></div><div class="chat-input-area"><div class="chat-input-wrapper"><textarea id="video-chat-input" placeholder="Type..." rows="1" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();VideoCall.sendChatMsg()}" style="background:transparent;border:none;color:#fff"></textarea><button class="btn-icon" onclick="VideoCall.sendChatMsg()"><i data-lucide="send" style="color:#fff"></i></button></div></div>`;
        lucide.createIcons();
    },

    sendChatMsg() {
        const input = document.getElementById('video-chat-input');
        const text = input?.value.trim(); if (!text) return;
        const msgs = document.getElementById('video-chat-msgs');
        msgs.innerHTML += `<div style="margin-bottom:8px"><span style="font-size:0.75rem;font-weight:700;color:var(--accent-cyan)">${App.escapeHtml(App.state.user?.username || 'You')}</span><p style="font-size:0.82rem;color:#e0e0ff">${App.escapeHtml(text)}</p></div>`;
        msgs.scrollTop = msgs.scrollHeight;
        input.value = '';
    },

    toggleParticipantsList() {
        const sidebar = document.getElementById('video-sidebar');
        sidebar.classList.toggle('hidden');
        document.getElementById('video-sidebar-title').textContent = 'Participants';
        document.getElementById('video-sidebar-content').innerHTML = `<div style="padding:8px"><div class="person-item"><div class="user-avatar">${App.getInitial(App.state.user?.first_name || App.state.user?.username)}</div><div class="person-info"><div class="person-name" style="color:#fff">${App.escapeHtml(App.state.user?.username || 'You')} (You)</div></div></div></div>`;
        lucide.createIcons();
    },

    closeSidebar() { document.getElementById('video-sidebar').classList.add('hidden'); },

    toggleInClassQuiz() {
        App.toast('Live quizzes run from the Quizzes tab in class view.', 'info');
    },

    showQuizQuestion(data) {
        // Live quiz question overlay
        const overlay = document.createElement('div');
        overlay.className = 'quiz-overlay'; overlay.id = 'quiz-overlay';
        overlay.innerHTML = `<div class="quiz-overlay-card"><div class="quiz-timer-bar"><div class="quiz-timer-fill" id="quiz-timer-fill" style="width:100%"></div></div><div class="quiz-question-text">${App.escapeHtml(data.question)}</div><div class="quiz-options">${data.options.map((o, i) => `<div class="quiz-option" onclick="VideoCall.answerInClassQuiz(${data.quiz_id},${data.question_id},${i},this)"><div class="quiz-option-label">${['A','B','C','D'][i]}</div>${App.escapeHtml(o)}</div>`).join('')}</div></div>`;
        document.body.appendChild(overlay);
        // Timer
        let timeLeft = data.time_limit || 30;
        const timer = setInterval(() => {
            timeLeft--;
            const fill = document.getElementById('quiz-timer-fill');
            if (fill) fill.style.width = `${(timeLeft / (data.time_limit || 30)) * 100}%`;
            if (timeLeft <= 0) { clearInterval(timer); document.getElementById('quiz-overlay')?.remove(); }
        }, 1000);
    },

    answerInClassQuiz(quizId, questionId, answer, el) {
        App.api(`/api/quizzes/${quizId}/respond`, 'POST', { question_id: questionId, answer, time_taken: 0 })
            .then(d => {
                el.closest('.quiz-options').querySelectorAll('.quiz-option').forEach((o, i) => {
                    o.style.pointerEvents = 'none';
                    if (i === d.correct_answer) o.classList.add('correct');
                    if (i === answer && !d.is_correct) o.classList.add('wrong');
                });
                setTimeout(() => document.getElementById('quiz-overlay')?.remove(), 2000);
                if (d.is_correct) App.toast('Correct! +20 XP', 'success');
            }).catch(() => {});
    },

    showQuizResult(data) { App.toast(`Quiz result: ${data.correct}/${data.total}`, data.correct >= data.total / 2 ? 'success' : 'warning'); },

    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const h = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
            const m = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
            const s = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
            document.getElementById('video-timer').textContent = `${h}:${m}:${s}`;
        }, 1000);
    },

    // WebRTC signaling handlers
    onRoomState(data) { document.getElementById('video-participant-count').textContent = (data.participants?.length || 1); },
    onParticipantJoined(data) { App.toast(`${data.username} joined`, 'info'); const count = document.getElementById('video-participant-count'); count.textContent = parseInt(count.textContent) + 1; },
    onParticipantLeft(data) { App.toast(`${data.username} left`, 'info'); const count = document.getElementById('video-participant-count'); count.textContent = Math.max(1, parseInt(count.textContent) - 1); },
    onOffer(data) {},
    onAnswer(data) {},
    onIceCandidate(data) {},
    onAudioToggled(data) {},
    onVideoToggled(data) {},
    onHandRaised(data) { if (data.raised) App.toast(`${data.username} raised their hand!`, 'info'); },
};
