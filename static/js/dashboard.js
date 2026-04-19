/**
 * Virtual Classroom – Enhanced Dashboard
 * Stats, class cards, deadlines, announcements, upcoming schedules, gamification summary.
 */
const Dashboard = {
    async render() {
        const content = document.getElementById('content-area'), user = App.state.user;
        content.innerHTML = `<div class="page-header animate-in"><h1>Welcome back, ${App.escapeHtml(user.first_name || user.username)}!</h1></div><div class="stats-grid">${Array(4).fill('<div class="skeleton" style="height:80px;border-radius:var(--radius-lg)"></div>').join('')}</div>`;
        try {
            const data = await App.api('/api/dashboard');
            this.renderDashboard(data, user);
        } catch (e) { content.innerHTML += `<div class="empty-state"><p>${e.message}</p></div>`; }
    },

    renderDashboard(data, user) {
        const content = document.getElementById('content-area');
        const s = data.stats;
        const isTeacher = user.role === 'teacher';

        // Stats
        let statsHtml;
        if (isTeacher) {
            statsHtml = `
            <div class="stat-card animate-in stagger-1"><div class="stat-icon purple"><i data-lucide="book-open"></i></div><div><div class="stat-value">${s.total_classes}</div><div class="stat-label">My Classes</div></div></div>
            <div class="stat-card animate-in stagger-2"><div class="stat-icon emerald"><i data-lucide="users"></i></div><div><div class="stat-value">${s.total_students}</div><div class="stat-label">Students</div></div></div>
            <div class="stat-card animate-in stagger-3"><div class="stat-icon amber"><i data-lucide="file-text"></i></div><div><div class="stat-value">${s.total_assignments}</div><div class="stat-label">Assignments</div></div></div>
            <div class="stat-card animate-in stagger-4"><div class="stat-icon rose"><i data-lucide="inbox"></i></div><div><div class="stat-value">${s.pending_submissions}</div><div class="stat-label">Pending Reviews</div></div></div>`;
        } else {
            statsHtml = `
            <div class="stat-card animate-in stagger-1"><div class="stat-icon purple"><i data-lucide="book-open"></i></div><div><div class="stat-value">${s.total_classes}</div><div class="stat-label">Enrolled Classes</div></div></div>
            <div class="stat-card animate-in stagger-2"><div class="stat-icon cyan"><i data-lucide="file-text"></i></div><div><div class="stat-value">${s.total_assignments}</div><div class="stat-label">Assignments</div></div></div>
            <div class="stat-card animate-in stagger-3"><div class="stat-icon emerald"><i data-lucide="check-circle"></i></div><div><div class="stat-value">${s.submitted}</div><div class="stat-label">Submitted</div></div></div>
            <div class="stat-card animate-in stagger-4"><div class="stat-icon amber"><i data-lucide="award"></i></div><div><div class="stat-value">${s.graded}</div><div class="stat-label">Graded</div></div></div>`;
        }

        // XP bar
        const xpPercent = data.xp ? Math.min(100, (data.xp % 500) / 500 * 100) : 0;
        let xpHtml = `<div class="gam-card animate-in stagger-2" style="margin-bottom:var(--space-xl)">
            <div style="display:flex;align-items:center;gap:var(--space-md)">
                <div class="level-circle" style="width:50px;height:50px;font-size:0"><div class="level-number" style="font-size:1.3rem">${data.level||1}</div></div>
                <div style="flex:1"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:0.85rem;font-weight:700">${data.xp||0} XP</span><span style="font-size:0.75rem;color:var(--text-tertiary)">${data.streak_days||0} day streak &#128293;</span></div>
                <div class="xp-bar"><div class="xp-bar-fill" style="width:${xpPercent}%"></div></div></div>
            </div></div>`;

        // Classes
        let classesHtml = '';
        if (data.classrooms.length) {
            classesHtml = `<div class="section-title animate-in stagger-3"><i data-lucide="book-open"></i> Your Classes</div><div class="class-grid animate-in stagger-4">${data.classrooms.map(c => this.renderClassCard(c)).join('')}</div>`;
        }

        // Right sidebar: deadlines, schedules, announcements
        let sidebarHtml = '';

        // Upcoming Schedules
        if (data.upcoming_schedules && data.upcoming_schedules.length) {
            sidebarHtml += `<div class="gam-card animate-in stagger-3"><h3><i data-lucide="video" style="color:var(--accent-cyan)"></i> Live Classes</h3><div class="schedule-list">`;
            data.upcoming_schedules.slice(0, 3).forEach(s => {
                const st = new Date(s.start_time);
                sidebarHtml += `<div class="schedule-card" style="cursor:pointer" onclick="VideoCall.startCall('${s.classroom_id}','${App.escapeHtml(s.title)}')"><div class="schedule-time"><div class="time">${st.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</div><div class="day">${st.toLocaleDateString('en-US', {month:'short', day:'numeric'})}</div></div><div class="schedule-info"><div class="schedule-title">${App.escapeHtml(s.title)}</div><div class="schedule-class">${App.escapeHtml(s.classroom_name)}</div></div></div>`;
            });
            sidebarHtml += `</div></div>`;
        }

        // Deadlines
        if (data.upcoming_deadlines.length) {
            sidebarHtml += `<div class="gam-card animate-in stagger-4"><h3><i data-lucide="clock" style="color:var(--accent-amber)"></i> Deadlines</h3><div class="deadline-list">`;
            data.upcoming_deadlines.slice(0, 5).forEach(d => {
                const due = new Date(d.due_date);
                const now = new Date();
                const diffDays = Math.ceil((due - now) / 86400000);
                const tag = diffDays <= 1 ? 'urgent' : diffDays <= 3 ? 'soon' : 'later';
                sidebarHtml += `<div class="deadline-item"><div class="deadline-date"><div class="deadline-day">${due.getDate()}</div><div class="deadline-month">${due.toLocaleString('en',{month:'short'})}</div></div><div class="deadline-info"><div class="deadline-title">${App.escapeHtml(d.title)}</div></div><span class="deadline-tag ${tag}">${diffDays <= 0 ? 'Today' : diffDays + 'd'}</span></div>`;
            });
            sidebarHtml += `</div></div>`;
        }

        // Announcements
        if (data.recent_announcements.length) {
            sidebarHtml += `<div class="gam-card animate-in stagger-5"><h3><i data-lucide="megaphone" style="color:var(--accent-rose)"></i> Recent</h3><div class="announcement-list">`;
            data.recent_announcements.slice(0, 3).forEach(a => {
                sidebarHtml += `<div class="announcement-item" style="padding:12px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="announcement-author" style="font-size:0.8rem">${App.escapeHtml(a.author_name)}</span><span class="announcement-time">${App.timeAgo(a.created_at)}</span></div><div class="announcement-text" style="font-size:0.8rem">${App.escapeHtml(a.content).substring(0, 120)}...</div></div>`;
            });
            sidebarHtml += `</div></div>`;
        }

        content.innerHTML = `
<div class="page-header animate-in"><h1>Welcome back, ${App.escapeHtml(user.first_name || user.username)}!</h1>
<div class="page-header-actions">
    ${isTeacher ? `<button class="btn btn-primary" onclick="App.openModal('modal-create-class')"><i data-lucide="plus"></i> Create Class</button>` : ''}
    <button class="btn btn-outline" onclick="App.openModal('modal-join-class')"><i data-lucide="log-in"></i> Join Class</button>
</div></div>
<div class="stats-grid">${statsHtml}</div>
${xpHtml}
<div class="dashboard-grid">${classesHtml?`<div>${classesHtml}</div>`:'<div></div>'}<div>${sidebarHtml}</div></div>`;
        lucide.createIcons();
    },

    renderClassCard(c) {
        const colorClass = App.getColorClass(c.id);
        return `<div class="class-card ${colorClass}" onclick="window.location.hash='#/classroom/${c.id}'"><div class="class-card-header"><h3>${App.escapeHtml(c.name)}</h3><p>${App.escapeHtml(c.section || c.subject || '')}</p></div><div class="class-card-body"><div class="class-card-meta"><span><i data-lucide="users"></i> ${c.member_count} students</span><span><i data-lucide="user"></i> ${App.escapeHtml(c.teacher_name)}</span></div></div></div>`;
    }
};
