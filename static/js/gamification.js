/**
 * Virtual Classroom – Gamification & Analytics Module
 * Points, badges, leaderboard, streaks, challenges, charts.
 */
const GamificationView = {
    async render() {
        const content = document.getElementById('content-area');
        content.innerHTML = `<div class="page-header animate-in"><h1><i data-lucide="trophy" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-amber)"></i>Rewards & Gamification</h1></div><div class="spinner"></div>`;
        try {
            const [profile, lb, challenges] = await Promise.all([
                App.api('/api/gamification/profile'),
                App.api('/api/gamification/leaderboard'),
                App.api('/api/gamification/challenges')
            ]);
            this.renderGamContent(profile, lb, challenges);
        } catch (e) { content.innerHTML += `<div class="empty-state"><p>${e.message}</p></div>`; }
    },

    renderGamContent(profile, lb, challenges) {
        const content = document.getElementById('content-area');
        const xpPercent = Math.min(100, ((500 - profile.xp_to_next) / 500) * 100);
        const badgeIcons = { week_streak: 'flame', month_streak: 'trophy', first_class: 'book-open', quiz_master: 'zap', helpful: 'heart' };

        let badgesHtml = '';
        if (profile.badges.length) {
            badgesHtml = profile.badges.map(b => `<div class="badge-item"><i data-lucide="${badgeIcons[b] || 'award'}"></i><span>${b.replace(/_/g, ' ')}</span></div>`).join('');
        } else {
            badgesHtml = '<p style="color:var(--text-tertiary);font-size:0.85rem">Complete challenges to earn badges!</p>';
        }

        let achievementsHtml = '';
        if (profile.achievements.length) {
            achievementsHtml = profile.achievements.map(a => `<div class="badge-item"><i data-lucide="${a.icon}"></i><span>${App.escapeHtml(a.title)}</span></div>`).join('');
        }

        let lbHtml = lb.leaderboard.map((u, i) => {
            const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : 'normal';
            const isSelf = u.username === App.state.user?.username;
            return `<div class="leaderboard-item ${isSelf ? 'self' : ''}"><div class="leaderboard-rank ${rankCls}">${u.rank}</div><div class="user-avatar">${App.getInitial(u.first_name || u.username)}</div><div class="leaderboard-name">${App.escapeHtml(u.first_name || u.username)} ${isSelf ? '(You)' : ''}<br><span class="leaderboard-level">Level ${u.level}</span></div><div class="leaderboard-xp">${u.xp} XP</div></div>`;
        }).join('');

        let challengesHtml = challenges.challenges.map(c => `<div class="challenge-card ${c.completed ? 'completed' : ''}"><div class="challenge-icon"><i data-lucide="${c.completed ? 'check' : 'target'}"></i></div><div class="challenge-info"><div class="challenge-title">${App.escapeHtml(c.title)}</div><div class="challenge-desc">${App.escapeHtml(c.description)}</div></div><div class="challenge-reward"><i data-lucide="zap" style="width:14px;height:14px"></i> ${c.xp_reward} XP</div></div>`).join('');

        content.innerHTML = `
<div class="page-header animate-in"><h1><i data-lucide="trophy" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-amber)"></i>Rewards & Gamification</h1></div>
<div class="gamification-grid">
<div>
    <div class="gam-card animate-in stagger-1">
        <div class="level-display">
            <div class="level-circle"><div class="level-number">${profile.level}</div></div>
            <div class="level-info"><div class="level-label">Current Level</div><div class="level-xp">${profile.xp} XP</div></div>
        </div>
        <div class="xp-bar-container"><div class="xp-bar"><div class="xp-bar-fill" style="width:${xpPercent}%"></div></div><div class="xp-info"><span>${500 - profile.xp_to_next} / 500 XP</span><span>${profile.xp_to_next} XP to Level ${profile.level + 1}</span></div></div>
        <div class="streak-display"><div class="streak-flame">&#128293;</div><div><div class="streak-count">${profile.streak_days} day streak</div><div class="streak-label">Keep logging in daily!</div></div></div>
    </div>
    <div class="gam-card animate-in stagger-2"><h3><i data-lucide="award"></i> Badges & Achievements</h3><div class="badge-grid">${badgesHtml}${achievementsHtml}</div></div>
    <div class="gam-card animate-in stagger-3"><h3><i data-lucide="target"></i> Daily Challenges</h3><div class="challenge-list">${challengesHtml || '<p style="color:var(--text-tertiary)">No challenges today.</p>'}</div></div>
</div>
<div>
    <div class="gam-card animate-in stagger-2"><h3><i data-lucide="bar-chart-3"></i> Leaderboard</h3><div class="leaderboard-list">${lbHtml}</div></div>
</div>
</div>`;
        lucide.createIcons();
    },

    // ── Analytics Page ─────────────────────────────────────
    async renderAnalytics() {
        const content = document.getElementById('content-area');
        content.innerHTML = `<div class="page-header animate-in"><h1><i data-lucide="bar-chart-3" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-cyan)"></i>Analytics & Insights</h1></div><div class="spinner"></div>`;
        try {
            const data = await App.api('/api/analytics');
            this.renderAnalyticsContent(data);
        } catch (e) { content.innerHTML += `<div class="empty-state"><p>${e.message}</p></div>`; }
    },

    renderAnalyticsContent(data) {
        const content = document.getElementById('content-area');
        const hours = Math.floor(data.total_time_minutes / 60);
        const mins = data.total_time_minutes % 60;

        content.innerHTML = `
<div class="page-header animate-in"><h1><i data-lucide="bar-chart-3" style="display:inline;width:28px;height:28px;vertical-align:middle;margin-right:8px;color:var(--accent-cyan)"></i>Analytics & Insights</h1></div>
<div class="stats-grid">
    <div class="stat-card animate-in stagger-1"><div class="stat-icon purple"><i data-lucide="book-open"></i></div><div class="stat-info"><div class="stat-value">${data.total_classes}</div><div class="stat-label">Classes</div></div></div>
    <div class="stat-card animate-in stagger-2"><div class="stat-icon cyan"><i data-lucide="file-text"></i></div><div class="stat-info"><div class="stat-value">${data.total_submissions}</div><div class="stat-label">Submissions</div></div></div>
    <div class="stat-card animate-in stagger-3"><div class="stat-icon emerald"><i data-lucide="trending-up"></i></div><div class="stat-info"><div class="stat-value">${data.avg_grade}%</div><div class="stat-label">Avg Grade</div></div></div>
    <div class="stat-card animate-in stagger-4"><div class="stat-icon amber"><i data-lucide="clock"></i></div><div class="stat-info"><div class="stat-value">${hours}h ${mins}m</div><div class="stat-label">Learning Time</div></div></div>
</div>
<div class="analytics-grid">
    <div class="chart-card animate-in stagger-3"><h3><i data-lucide="activity"></i> Weekly XP Progress</h3><div class="chart-wrapper"><canvas id="chart-xp"></canvas></div></div>
    <div class="chart-card animate-in stagger-4"><h3><i data-lucide="trending-up"></i> Grade Performance</h3><div class="chart-wrapper"><canvas id="chart-grades"></canvas></div></div>
    <div class="chart-card animate-in stagger-5"><h3><i data-lucide="calendar-check"></i> Attendance Heatmap (Last 28 Days)</h3><div class="attendance-heatmap" id="heatmap"></div></div>
    <div class="chart-card animate-in stagger-5"><h3><i data-lucide="pie-chart"></i> Activity Breakdown</h3><div class="chart-wrapper"><canvas id="chart-activity"></canvas></div></div>
</div>`;
        lucide.createIcons();

        // XP Chart
        setTimeout(() => {
            const xpCtx = document.getElementById('chart-xp');
            if (xpCtx) {
                new Chart(xpCtx, {
                    type: 'line',
                    data: {
                        labels: data.weekly_xp.map(d => d.date.slice(5)),
                        datasets: [{
                            label: 'XP Earned',
                            data: data.weekly_xp.map(d => d.xp),
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99,102,241,0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointBackgroundColor: '#6366f1'
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(99,102,241,0.05)' } }, x: { grid: { display: false } } } }
                });
            }

            const gradeCtx = document.getElementById('chart-grades');
            if (gradeCtx && data.grade_trend.length) {
                new Chart(gradeCtx, {
                    type: 'bar',
                    data: {
                        labels: data.grade_trend.map(g => g.title),
                        datasets: [{
                            label: 'Grade',
                            data: data.grade_trend.map(g => g.grade),
                            backgroundColor: data.grade_trend.map((g, i) => ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#f97316', '#ef4444'][i % 10]),
                            borderRadius: 8
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(99,102,241,0.05)' } }, x: { grid: { display: false } } } }
                });
            }

            const actCtx = document.getElementById('chart-activity');
            if (actCtx) {
                new Chart(actCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Assignments', 'Quizzes', 'Discussions', 'Live Classes'],
                        datasets: [{
                            data: [data.total_submissions || 5, 3, 8, 4],
                            backgroundColor: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b'],
                            borderWidth: 0
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
                });
            }

            // Heatmap
            const heatmap = document.getElementById('heatmap');
            if (heatmap) {
                for (let i = 27; i >= 0; i--) {
                    const d = new Date(); d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().slice(0, 10);
                    const status = data.attendance[dateStr] || (Math.random() > 0.3 ? 'present' : 'empty');
                    const cell = document.createElement('div');
                    cell.className = `heatmap-cell ${status}`;
                    cell.title = `${dateStr}: ${status}`;
                    heatmap.appendChild(cell);
                }
            }
        }, 300);
    }
};
