/**
 * Virtual Classroom – Main Application Controller (Enhanced)
 * Routing, state, API, theme, utilities, global views (calendar, files, settings)
 */
const App = {
    state: { user:null, token:null, theme:'dark', currentPage:'dashboard', currentClassId:null, socket:null, notifications:[], unreadNotifs:0 },

    init() {
        this.loadTheme();
        const token = localStorage.getItem('vc_token'), user = localStorage.getItem('vc_user');
        if (token && user) {
            this.state.token = token; this.state.user = JSON.parse(user);
            this.showApp(); this.connectSocket(); this.handleRoute();
        } else { this.showAuth(); }
        window.addEventListener('hashchange', () => this.handleRoute());
        document.addEventListener('click', e => {
            if (!e.target.closest('#notification-btn') && !e.target.closest('#notification-panel')) document.getElementById('notification-panel')?.classList.add('hidden');
            if (!e.target.closest('#user-menu-trigger') && !e.target.closest('#user-dropdown')) document.getElementById('user-dropdown')?.classList.add('hidden');
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') { this.closeAllModals(); this.closeDropdowns(); } });
        lucide.createIcons();
    },

    showAuth() { document.getElementById('auth-screen').classList.remove('hidden'); document.getElementById('app-screen').classList.add('hidden'); document.getElementById('video-screen').classList.add('hidden'); lucide.createIcons(); },
    showApp() { document.getElementById('auth-screen').classList.add('hidden'); document.getElementById('app-screen').classList.remove('hidden'); this.updateTopbar(); this.loadNotifications(); lucide.createIcons(); },

    handleRoute() {
        const hash = window.location.hash || '#/dashboard';
        const parts = hash.replace('#/', '').split('/');
        const page = parts[0] || 'dashboard', param = parts[1] || null;
        this.state.currentPage = page;
        document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === page));
        switch (page) {
            case 'dashboard': Dashboard.render(); break;
            case 'classes': ClassroomView.renderList(); break;
            case 'classroom': if (param) { this.state.currentClassId = parseInt(param); ClassroomView.renderDetail(parseInt(param)); } break;
            case 'chat': ChatView.render(); break;
            case 'calendar': this.renderCalendar(); break;
            case 'files': this.renderFiles(); break;
            case 'ai': AIView.render(); break;
            case 'whiteboard': Whiteboard.open(); break;
            case 'gamification': GamificationView.render(); break;
            case 'analytics': GamificationView.renderAnalytics(); break;
            case 'todos': ProductivityView.renderTodos(); break;
            case 'bookmarks': ProductivityView.renderBookmarks(); break;
            case 'settings': case 'profile': this.renderSettings(); break;
            default: Dashboard.render();
        }
        document.getElementById('sidebar')?.classList.remove('open');
    },

    loadTheme() { const s=localStorage.getItem('vc_theme')||'dark'; this.state.theme=s; document.documentElement.setAttribute('data-theme',s); this.updateThemeIcon(); },
    toggleTheme() { this.state.theme = this.state.theme==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme', this.state.theme); localStorage.setItem('vc_theme', this.state.theme); this.updateThemeIcon(); },
    updateThemeIcon() { const d=document.getElementById('theme-icon-dark'),l=document.getElementById('theme-icon-light'); if(this.state.theme==='dark'){d?.classList.remove('hidden');l?.classList.add('hidden');}else{d?.classList.add('hidden');l?.classList.remove('hidden');} },
    toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); },

    updateTopbar() {
        const u = this.state.user; if (!u) return;
        const initial = (u.first_name?.[0]||u.username[0]).toUpperCase();
        document.getElementById('topbar-avatar-text').textContent = initial;
        document.getElementById('topbar-username').textContent = u.first_name || u.username;
        document.getElementById('dropdown-avatar-text').textContent = initial;
        document.getElementById('dropdown-name').textContent = (u.first_name&&u.last_name)?`${u.first_name} ${u.last_name}`:u.username;
        document.getElementById('dropdown-email').textContent = u.email;
        document.getElementById('dropdown-role').textContent = u.role;
    },

    async loadNotifications() { try { const d=await this.api('/api/notifications'); this.state.notifications=d.notifications||[]; this.state.unreadNotifs=d.unread_count||0; this.updateNotifBadge(); } catch(e){} },
    updateNotifBadge() { const b=document.getElementById('notif-badge'); if(this.state.unreadNotifs>0){b.textContent=this.state.unreadNotifs;b.classList.remove('hidden');}else{b.classList.add('hidden');} },
    toggleNotifications() { const p=document.getElementById('notification-panel'); p.classList.toggle('hidden'); document.getElementById('user-dropdown')?.classList.add('hidden'); if(!p.classList.contains('hidden'))this.renderNotifications(); },
    renderNotifications() {
        const list=document.getElementById('notification-list');
        if(!this.state.notifications.length){list.innerHTML=`<div class="empty-state small"><i data-lucide="bell-off"></i><p>No notifications</p></div>`;lucide.createIcons();return;}
        list.innerHTML=this.state.notifications.map(n=>`<div class="notif-item ${n.is_read?'':'unread'}" onclick="App.handleNotifClick('${n.link}',${n.id})"><div class="notif-icon ${n.notification_type}"><i data-lucide="${{assignment:'file-text',grade:'award',announcement:'megaphone',message:'message-circle',info:'info'}[n.notification_type]||'bell'}"></i></div><div class="notif-content"><div class="notif-title">${this.escapeHtml(n.title)}</div><div class="notif-text">${this.escapeHtml(n.content)}</div><div class="notif-time">${this.timeAgo(n.created_at)}</div></div></div>`).join('');
        lucide.createIcons();
    },
    async handleNotifClick(link,id){if(link)window.location.hash=link;try{await this.api(`/api/notifications/${id}/read`,'PUT');this.loadNotifications();}catch(e){}document.getElementById('notification-panel')?.classList.add('hidden');},
    async markAllNotificationsRead(){try{await this.api('/api/notifications/read','PUT');this.loadNotifications();}catch(e){}},
    toggleUserMenu(){document.getElementById('user-dropdown')?.classList.toggle('hidden');document.getElementById('notification-panel')?.classList.add('hidden');},
    closeDropdowns(){document.getElementById('user-dropdown')?.classList.add('hidden');document.getElementById('notification-panel')?.classList.add('hidden');},
    openModal(id){document.getElementById(id)?.classList.remove('hidden');lucide.createIcons();},
    closeModal(id){document.getElementById(id)?.classList.add('hidden');},
    closeAllModals(){document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden'));},
    handleSearch(q){/* Future: global search */},

    connectSocket() {
        if(this.state.socket)return;
        const socket = io({transports:['websocket','polling']}); this.state.socket=socket;
        socket.on('connect',()=>{socket.emit('authenticate',{token:this.state.token});});
        socket.on('authenticated',()=>{});
        socket.on('new_message',msg=>ChatView.onNewMessage(msg));
        socket.on('new_private_message',msg=>ChatView.onNewPrivateMessage(msg));
        socket.on('user_typing',d=>ChatView.onTyping(d));
        socket.on('user_stop_typing',d=>ChatView.onStopTyping(d));
        socket.on('video_room_state',d=>VideoCall.onRoomState(d));
        socket.on('participant_joined',d=>VideoCall.onParticipantJoined(d));
        socket.on('participant_left',d=>VideoCall.onParticipantLeft(d));
        socket.on('webrtc_offer',d=>VideoCall.onOffer(d));
        socket.on('webrtc_answer',d=>VideoCall.onAnswer(d));
        socket.on('webrtc_ice_candidate',d=>VideoCall.onIceCandidate(d));
        socket.on('audio_toggled',d=>VideoCall.onAudioToggled(d));
        socket.on('video_toggled',d=>VideoCall.onVideoToggled(d));
        socket.on('hand_raised',d=>VideoCall.onHandRaised(d));
        socket.on('whiteboard_draw',d=>Whiteboard.onRemoteDraw(d));
        socket.on('whiteboard_clear',()=>Whiteboard.onRemoteClear());
        socket.on('quiz_question',d=>VideoCall.showQuizQuestion(d));
        socket.on('quiz_result',d=>VideoCall.showQuizResult(d));
    },

    async api(url, method='GET', body=null) {
        const headers={'Content-Type':'application/json'};
        if(this.state.token)headers['Authorization']=`Bearer ${this.state.token}`;
        const opts={method,headers}; if(body)opts.body=JSON.stringify(body);
        const r=await fetch(url,opts); const d=await r.json();
        if(r.status === 401) {
            Auth.logout();
            throw new Error('Session expired. Please log in again.');
        }
        if(!r.ok)throw new Error(d.error||'Request failed'); return d;
    },
    async apiUpload(url, formData) {
        const headers={}; if(this.state.token)headers['Authorization']=`Bearer ${this.state.token}`;
        const r=await fetch(url,{method:'POST',headers,body:formData}); const d=await r.json();
        if(r.status === 401) {
            Auth.logout();
            throw new Error('Session expired. Please log in again.');
        }
        if(!r.ok)throw new Error(d.error||'Upload failed'); return d;
    },

    toast(message, type='info') {
        const container=document.getElementById('toast-container');
        const icons={success:'check-circle',error:'x-circle',info:'info',warning:'alert-triangle'};
        const t=document.createElement('div'); t.className=`toast ${type}`;
        t.innerHTML=`<i data-lucide="${icons[type]}"></i><span>${message}</span><button class="toast-close" onclick="this.parentElement.remove()"><i data-lucide="x"></i></button>`;
        container.appendChild(t); lucide.createIcons();
        setTimeout(()=>{t.style.opacity='0';t.style.transform='translateX(100%)';t.style.transition='all 0.3s ease';setTimeout(()=>t.remove(),300);},4000);
    },

    // Calendar
    calendarDate: new Date(),
    async renderCalendar() {
        const content=document.getElementById('content-area'), date=this.calendarDate;
        const year=date.getFullYear(), month=date.getMonth();
        const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
        const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate(), today=new Date();
        let daysHtml='';
        dayNames.forEach(d=>{daysHtml+=`<div class="calendar-day-header">${d}</div>`;});
        const prevDays=new Date(year,month,0).getDate();
        for(let i=firstDay-1;i>=0;i--)daysHtml+=`<div class="calendar-day outside"><span class="calendar-day-number">${prevDays-i}</span></div>`;
        for(let d=1;d<=daysInMonth;d++){const isToday=d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();daysHtml+=`<div class="calendar-day ${isToday?'today':''}"><span class="calendar-day-number">${d}</span></div>`;}
        const totalCells=firstDay+daysInMonth,remaining=7-(totalCells%7);
        if(remaining<7)for(let i=1;i<=remaining;i++)daysHtml+=`<div class="calendar-day outside"><span class="calendar-day-number">${i}</span></div>`;

        let schedHtml = '';
        try {
            const sd = await this.api('/api/schedules/upcoming');
            if (sd.schedules.length) {
                schedHtml = `<div class="section-title animate-in stagger-2"><i data-lucide="video"></i> Upcoming Live Classes</div><div class="schedule-list animate-in stagger-3">`;
                sd.schedules.forEach(s => {
                    const st = new Date(s.start_time);
                    schedHtml += `<div class="schedule-card" onclick="VideoCall.startCall('${s.classroom_id}','${this.escapeHtml(s.classroom_name)}')"><div class="schedule-time"><div class="time">${st.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div><div class="day">${st.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div></div><div class="schedule-info"><div class="schedule-title">${this.escapeHtml(s.title)}</div><div class="schedule-class">${this.escapeHtml(s.classroom_name)}</div></div><button class="btn btn-primary btn-sm"><i data-lucide="video"></i> Join</button></div>`;
                });
                schedHtml += `</div>`;
            }
        } catch(e) {}

        content.innerHTML=`<div class="page-header animate-in"><h1><i data-lucide="calendar" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-primary)"></i>Calendar</h1></div><div class="calendar-container animate-in stagger-1"><div class="calendar-header"><button class="btn btn-ghost" onclick="App.calendarDate.setMonth(App.calendarDate.getMonth()-1);App.renderCalendar()"><i data-lucide="chevron-left"></i></button><h2>${monthNames[month]} ${year}</h2><button class="btn btn-ghost" onclick="App.calendarDate.setMonth(App.calendarDate.getMonth()+1);App.renderCalendar()"><i data-lucide="chevron-right"></i></button></div><div class="calendar-grid">${daysHtml}</div></div>${schedHtml}`;
        lucide.createIcons();
    },

    // Files
    async renderFiles() {
        const content=document.getElementById('content-area');
        content.innerHTML=`<div class="page-header animate-in"><h1><i data-lucide="folder" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-amber)"></i>Files & Resources</h1></div><p class="animate-in stagger-1" style="color:var(--text-secondary);margin-bottom:var(--space-xl)">Access files from your classrooms.</p>`;
        try {
            const data=await this.api('/api/classrooms'); const classes=data.classrooms||[];
            if(!classes.length){content.innerHTML+=`<div class="empty-state"><i data-lucide="folder-open"></i><h3>No Files</h3><p>Join a class to access shared files.</p></div>`;}
            else{const g=document.createElement('div');g.className='class-grid animate-in stagger-2';g.innerHTML=classes.map(c=>`<div class="file-card" onclick="App.renderClassFiles(${c.id},'${this.escapeHtml(c.name)}')"><div class="file-icon document"><i data-lucide="folder"></i></div><div class="file-name">${this.escapeHtml(c.name)}</div><div class="file-meta">${c.member_count} members</div></div>`).join('');content.appendChild(g);}
        } catch(e){content.innerHTML+=`<div class="empty-state"><p>${e.message}</p></div>`;}
        lucide.createIcons();
    },
    async renderClassFiles(classId,className) {
        const content=document.getElementById('content-area');
        content.innerHTML=`<div class="spinner"></div>`;
        try {
            const data=await this.api(`/api/classrooms/${classId}/resources`); const resources=data.resources||[];
            let html=`<div class="page-header animate-in"><div><button class="btn btn-ghost btn-sm" onclick="App.renderFiles()" style="margin-bottom:8px"><i data-lucide="arrow-left"></i> Back</button><h1>${this.escapeHtml(className)} - Files</h1></div></div>`;
            if(!resources.length){html+=`<div class="empty-state"><i data-lucide="file-x"></i><h3>No Files</h3><p>No resources uploaded yet.</p></div>`;}
            else{html+=`<div class="files-grid animate-in stagger-1">`;resources.forEach(r=>{html+=`<a href="${r.file_path}" target="_blank" class="file-card" style="text-decoration:none"><div class="file-icon ${r.file_type||'other'}"><i data-lucide="file"></i></div><div class="file-name">${this.escapeHtml(r.title)}</div><div class="file-meta">${this.formatFileSize(r.file_size)}</div></a>`;});html+=`</div>`;}
            content.innerHTML=html;
        } catch(e){content.innerHTML=`<div class="empty-state"><p>${e.message}</p></div>`;}
        lucide.createIcons();
    },

    // Settings
    renderSettings() {
        const u=this.state.user, initial=(u.first_name?.[0]||u.username[0]).toUpperCase();
        document.getElementById('content-area').innerHTML=`
<div class="settings-layout"><div class="page-header animate-in"><h1>Settings & Profile</h1></div>
<div class="settings-section animate-in stagger-1"><div class="profile-header"><div class="profile-avatar-large">${initial}</div><div class="profile-info"><h2>${this.escapeHtml(u.first_name&&u.last_name?`${u.first_name} ${u.last_name}`:u.username)}</h2><p>${this.escapeHtml(u.email)}</p><span class="profile-role-badge"><i data-lucide="${u.role==='teacher'?'presentation':'book-open'}" style="width:14px;height:14px"></i>${u.role}</span></div></div>
<h3>Profile Settings</h3>
<div class="form-row"><div class="form-group"><label>First Name</label><input type="text" id="settings-firstname" value="${this.escapeHtml(u.first_name||'')}"></div><div class="form-group"><label>Last Name</label><input type="text" id="settings-lastname" value="${this.escapeHtml(u.last_name||'')}"></div></div>
<div class="form-group"><label>Bio</label><textarea id="settings-bio" rows="3">${this.escapeHtml(u.bio||'')}</textarea></div>
<button class="btn btn-primary" onclick="App.saveProfile()"><i data-lucide="save"></i> Save Changes</button></div>
<div class="settings-section animate-in stagger-2"><h3>Change Password</h3>
<div class="form-group"><label>Current Password</label><input type="password" id="settings-current-pw" placeholder="Current password"></div>
<div class="form-group"><label>New Password</label><input type="password" id="settings-new-pw" placeholder="Min 6 characters"></div>
<button class="btn btn-secondary" onclick="App.changePassword()"><i data-lucide="lock"></i> Change Password</button></div>
<div class="settings-section animate-in stagger-3"><h3>Appearance</h3>
<div style="display:flex;align-items:center;justify-content:space-between"><div><strong>Theme</strong><p style="font-size:0.85rem;color:var(--text-secondary)">Choose dark or light mode</p></div>
<button class="btn btn-outline" onclick="App.toggleTheme()"><i data-lucide="${this.state.theme==='dark'?'sun':'moon'}"></i>Switch to ${this.state.theme==='dark'?'Light':'Dark'}</button></div></div>
<div class="settings-section animate-in stagger-4"><h3>Database</h3><p style="font-size:0.85rem;color:var(--text-secondary)">Currently using SQLite. To use MySQL, set the DATABASE_URL environment variable:<br><code style="color:var(--accent-cyan)">mysql+mysqlconnector://user:pass@localhost/virtual_classroom</code></p></div></div>`;
        lucide.createIcons();
    },
    async saveProfile() {
        try { const d=await this.api('/api/auth/profile','PUT',{first_name:document.getElementById('settings-firstname').value,last_name:document.getElementById('settings-lastname').value,bio:document.getElementById('settings-bio').value}); this.state.user=d.user; localStorage.setItem('vc_user',JSON.stringify(d.user)); this.updateTopbar(); this.toast('Profile updated!','success'); } catch(e){this.toast(e.message,'error');}
    },
    async changePassword() {
        const c=document.getElementById('settings-current-pw').value,n=document.getElementById('settings-new-pw').value;
        if(!c||!n){this.toast('Fill both fields','warning');return;}
        try{await this.api('/api/auth/password','PUT',{current_password:c,new_password:n});this.toast('Password changed!','success');document.getElementById('settings-current-pw').value='';document.getElementById('settings-new-pw').value='';}catch(e){this.toast(e.message,'error');}
    },

    // Utilities
    escapeHtml(t){if(!t)return '';const e=document.createElement('div');e.textContent=t;return e.innerHTML;},
    timeAgo(d){if(!d)return '';const s=Math.floor((new Date()-new Date(d))/1000);if(s<60)return 'Just now';if(s<3600)return `${Math.floor(s/60)}m ago`;if(s<86400)return `${Math.floor(s/3600)}h ago`;if(s<604800)return `${Math.floor(s/86400)}d ago`;return new Date(d).toLocaleDateString();},
    formatDate(d){if(!d)return 'No date';return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});},
    formatTime(d){if(!d)return '';return new Date(d).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});},
    formatDateTime(d){if(!d)return 'No date';return new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});},
    formatFileSize(b){if(!b)return '0 B';const k=1024,s=['B','KB','MB','GB'],i=Math.floor(Math.log(b)/Math.log(k));return parseFloat((b/Math.pow(k,i)).toFixed(1))+' '+s[i];},
    getColorClass(id){const c=['color-1','color-2','color-3','color-4','color-5','color-6','color-7','color-8'];return c[(id||0)%c.length];},
    getInitial(n){return n?n.charAt(0).toUpperCase():'?';}
};
