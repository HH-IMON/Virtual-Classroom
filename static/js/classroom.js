/**
 * Virtual Classroom – Enhanced Classroom Module
 * Class list/detail with tabs: stream, assignments, discussions, schedule, quizzes, people, files.
 * File upload for assignments/submissions, scheduling, live quizzes, threaded discussions.
 */
const ClassroomView = {
    currentClass: null, currentTab: 'stream', currentAssignmentId: null, currentSubmissionId: null,

    async renderList() {
        const content=document.getElementById('content-area'), isTeacher=App.state.user?.role==='teacher';
        content.innerHTML=`<div class="page-header animate-in"><h1>My Classes</h1><div class="page-header-actions">${isTeacher?`<button class="btn btn-primary" onclick="App.openModal('modal-create-class')"><i data-lucide="plus"></i> Create Class</button>`:''}<button class="btn btn-outline" onclick="App.openModal('modal-join-class')"><i data-lucide="log-in"></i> Join Class</button></div></div><div class="class-grid">${Array(3).fill('<div class="skeleton" style="height:180px;border-radius:var(--radius-lg)"></div>').join('')}</div>`;
        lucide.createIcons();
        try {
            const data=await App.api('/api/classrooms'); const classes=data.classrooms||[];
            if(!classes.length){content.querySelector('.class-grid').outerHTML=`<div class="empty-state animate-in"><i data-lucide="book-open"></i><h3>No Classes</h3><p>${isTeacher?'Create your first class!':'Ask your teacher for a class code.'}</p></div>`;}
            else{content.querySelector('.class-grid').innerHTML=classes.map(c=>Dashboard.renderClassCard(c)).join('');}
            lucide.createIcons();
        } catch(e){App.toast(e.message,'error');}
    },

    async createClass() {
        const name=document.getElementById('class-name').value.trim();
        if(!name){App.toast('Name required','warning');return;}
        try{const d=await App.api('/api/classrooms','POST',{name,subject:document.getElementById('class-subject').value.trim(),section:document.getElementById('class-section').value.trim(),description:document.getElementById('class-description').value.trim()});App.closeModal('modal-create-class');App.toast('Class created! +50 XP','success');window.location.hash=`#/classroom/${d.classroom.id}`;['class-name','class-subject','class-section','class-description'].forEach(id=>document.getElementById(id).value='');}catch(e){App.toast(e.message,'error');}
    },

    async joinClass() {
        const code=document.getElementById('join-code').value.trim().toUpperCase();
        if(!code){App.toast('Enter a code','warning');return;}
        try{const d=await App.api('/api/classrooms/join','POST',{code});App.closeModal('modal-join-class');App.toast(d.message+' +25 XP','success');document.getElementById('join-code').value='';window.location.hash=`#/classroom/${d.classroom.id}`;}catch(e){App.toast(e.message,'error');}
    },

    async renderDetail(classId) {
        const content=document.getElementById('content-area');
        content.innerHTML=`<div class="spinner"></div>`;
        try{const d=await App.api(`/api/classrooms/${classId}`);this.currentClass=d;this.renderClassDetail(d);}catch(e){content.innerHTML=`<div class="empty-state"><i data-lucide="alert-circle"></i><h3>Error</h3><p>${e.message}</p><button class="btn btn-outline" onclick="window.location.hash='#/classes'"><i data-lucide="arrow-left"></i> Back</button></div>`;lucide.createIcons();}
    },

    renderClassDetail(data) {
        const content=document.getElementById('content-area'), c=data.classroom, isTeacher=data.is_teacher, colorClass=App.getColorClass(c.id);
        content.innerHTML=`
<button class="btn btn-ghost btn-sm animate-in" onclick="window.location.hash='#/classes'" style="margin-bottom:var(--space-md)"><i data-lucide="arrow-left"></i> Back</button>
<div class="classroom-header ${colorClass} animate-in stagger-1"><div class="classroom-code" onclick="navigator.clipboard.writeText('${c.code}');App.toast('Code copied!','success')" title="Click to copy"><i data-lucide="copy" style="width:14px;height:14px;display:inline;vertical-align:middle;margin-right:4px"></i>${c.code}</div><h1>${App.escapeHtml(c.name)}</h1><p>${App.escapeHtml(c.section||c.subject||'')}</p></div>
<div class="class-tabs animate-in stagger-2">
    <button class="class-tab ${this.currentTab==='stream'?'active':''}" onclick="ClassroomView.switchTab('stream')"><i data-lucide="activity"></i> Stream</button>
    <button class="class-tab ${this.currentTab==='assignments'?'active':''}" onclick="ClassroomView.switchTab('assignments')"><i data-lucide="file-text"></i> Assignments</button>
    <button class="class-tab ${this.currentTab==='discussions'?'active':''}" onclick="ClassroomView.switchTab('discussions')"><i data-lucide="message-square"></i> Discussions</button>
    <button class="class-tab ${this.currentTab==='schedule'?'active':''}" onclick="ClassroomView.switchTab('schedule')"><i data-lucide="calendar"></i> Schedule</button>
    <button class="class-tab ${this.currentTab==='quizzes'?'active':''}" onclick="ClassroomView.switchTab('quizzes')"><i data-lucide="help-circle"></i> Quizzes</button>
    <button class="class-tab ${this.currentTab==='people'?'active':''}" onclick="ClassroomView.switchTab('people')"><i data-lucide="users"></i> People</button>
    <button class="class-tab ${this.currentTab==='files'?'active':''}" onclick="ClassroomView.switchTab('files')"><i data-lucide="folder"></i> Files</button>
    <button class="class-tab" onclick="VideoCall.startCall('${c.id}','${App.escapeHtml(c.name)}')"><i data-lucide="video"></i> Live Class</button>
</div>
<div id="class-tab-content"></div>`;
        lucide.createIcons(); this.switchTab(this.currentTab);
    },

    async switchTab(tab) {
        this.currentTab=tab;
        document.querySelectorAll('.class-tab').forEach(t=>{const txt=t.textContent.trim().toLowerCase();t.classList.toggle('active',txt.includes(tab));});
        const tc=document.getElementById('class-tab-content'); if(!tc)return;
        switch(tab){case 'stream':await this.renderStream(tc);break;case 'assignments':await this.renderAssignments(tc);break;case 'discussions':await this.renderDiscussions(tc);break;case 'schedule':await this.renderSchedule(tc);break;case 'quizzes':await this.renderQuizzes(tc);break;case 'people':this.renderPeople(tc);break;case 'files':await this.renderFiles(tc);break;}
    },

    // Stream
    async renderStream(container) {
        const data=this.currentClass, isTeacher=data.is_teacher, cid=data.classroom.id;
        let html=isTeacher?`<div class="stream-compose" onclick="App.openModal('modal-announcement')"><div class="user-avatar">${App.getInitial(App.state.user.first_name||App.state.user.username)}</div><span>Share something with your class...</span></div>`:'';
        try{const a=await App.api(`/api/classrooms/${cid}/announcements`);const anns=a.announcements||[];if(!anns.length&&!isTeacher)html+=`<div class="empty-state"><i data-lucide="megaphone"></i><h3>No Announcements</h3></div>`;else{html+=`<div class="announcement-list">`;anns.forEach(a=>{html+=`<div class="announcement-item animate-in"><div class="announcement-header"><div class="user-avatar" style="background:var(--gradient-accent)">${App.getInitial(a.author_name)}</div><span class="announcement-author">${App.escapeHtml(a.author_name)}</span><span class="announcement-time">${App.timeAgo(a.created_at)}</span></div><div class="announcement-text">${App.escapeHtml(a.content)}</div></div>`;});html+=`</div>`;}}catch(e){html+=`<p style="color:var(--accent-red)">${e.message}</p>`;}
        container.innerHTML=html;lucide.createIcons();
    },

    // Assignments
    async renderAssignments(container) {
        const data=this.currentClass, isTeacher=data.is_teacher, cid=data.classroom.id;
        let html=isTeacher?`<div style="margin-bottom:var(--space-lg)"><button class="btn btn-primary" onclick="App.openModal('modal-create-assignment')"><i data-lucide="plus"></i> Create Assignment</button></div>`:'';
        try{const a=await App.api(`/api/classrooms/${cid}/assignments`);const asns=a.assignments||[];if(!asns.length)html+=`<div class="empty-state"><i data-lucide="file-text"></i><h3>No Assignments</h3></div>`;else{html+=`<div class="assignment-list">`;asns.forEach(a=>{const icon=a.assignment_type==='quiz'?'help-circle':a.assignment_type==='material'?'book':'file-text';let status='';if(!isTeacher){if(a.submission&&a.submission.status==='graded')status=`<span class="status-badge graded">${a.submission.grade}/${a.points}</span>`;else if(a.submitted)status=`<span class="status-badge submitted">Submitted</span>`;else status=`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();ClassroomView.openSubmitModal(${a.id},'${App.escapeHtml(a.title)}',${a.points})">Submit</button>`;}else{status=`<span class="status-badge pending">${a.submission_count} submitted</span>`;}
            html+=`<div class="assignment-card animate-in" onclick="ClassroomView.viewAssignment(${a.id})"><div class="assignment-icon ${a.assignment_type}"><i data-lucide="${icon}"></i></div><div class="assignment-info"><div class="assignment-title">${App.escapeHtml(a.title)}</div><div class="assignment-meta"><span><i data-lucide="calendar"></i> ${a.due_date?'Due: '+App.formatDateTime(a.due_date):'No due date'}</span><span><i data-lucide="trophy"></i> ${a.points} pts</span></div>${a.file_path?`<a href="${a.file_path}" target="_blank" class="assignment-file-link" onclick="event.stopPropagation()"><i data-lucide="paperclip"></i> ${App.escapeHtml(a.file_name||'Attached file')}</a>`:''}</div><div class="assignment-status">${status}</div></div>`;});html+=`</div>`;}}catch(e){html+=`<p style="color:var(--accent-red)">${e.message}</p>`;}
        container.innerHTML=html;lucide.createIcons();
    },

    // Discussions (Threaded)
    async renderDiscussions(container) {
        const cid=this.currentClass.classroom.id;
        let html=`<div style="margin-bottom:var(--space-lg)"><button class="btn btn-primary" onclick="App.openModal('modal-create-thread')"><i data-lucide="plus"></i> New Discussion</button></div>`;
        try{const d=await App.api(`/api/classrooms/${cid}/threads`);const threads=d.threads||[];if(!threads.length)html+=`<div class="empty-state"><i data-lucide="message-square"></i><h3>No Discussions</h3><p>Start a discussion thread!</p></div>`;else{html+=`<div class="thread-list">`;threads.forEach(t=>{html+=`<div class="thread-card ${t.is_pinned?'pinned':''}" onclick="ClassroomView.viewThread(${t.id})">${t.is_pinned?'<div style="font-size:0.65rem;color:var(--accent-amber);margin-bottom:4px;display:flex;align-items:center;gap:4px"><i data-lucide="pin" style="width:12px;height:12px"></i> Pinned</div>':''}<div class="thread-title">${App.escapeHtml(t.title)}</div><div class="thread-meta"><span><i data-lucide="user" style="width:12px;height:12px"></i> ${App.escapeHtml(t.author_name)}</span><span><i data-lucide="message-circle" style="width:12px;height:12px"></i> ${t.reply_count} replies</span><span>${App.timeAgo(t.created_at)}</span></div><div class="thread-content-preview">${App.escapeHtml(t.content)}</div></div>`;});html+=`</div>`;}}catch(e){html+=`<p style="color:var(--accent-red)">${e.message}</p>`;}
        container.innerHTML=html;lucide.createIcons();
    },

    async viewThread(tid) {
        const tc=document.getElementById('class-tab-content');
        try{const d=await App.api(`/api/threads/${tid}`);const t=d.thread,replies=d.replies;
        let html=`<button class="btn btn-ghost btn-sm" onclick="ClassroomView.switchTab('discussions')" style="margin-bottom:var(--space-md)"><i data-lucide="arrow-left"></i> Back to Discussions</button>
<div class="gam-card"><div class="thread-title" style="font-size:1.1rem;margin-bottom:8px">${App.escapeHtml(t.title)}</div><div class="thread-meta" style="margin-bottom:12px"><span><i data-lucide="user" style="width:12px;height:12px"></i> ${App.escapeHtml(t.author_name)}</span><span>${App.timeAgo(t.created_at)}</span></div><p style="color:var(--text-secondary);line-height:1.7">${App.escapeHtml(t.content)}</p></div>
<div class="section-title" style="margin-top:var(--space-xl)"><i data-lucide="message-circle"></i> Replies (${replies.length})</div>`;
        replies.forEach(r=>{html+=`<div class="thread-reply-card"><div class="user-avatar">${App.getInitial(r.author_name)}</div><div class="thread-reply-content"><div class="thread-reply-author">${App.escapeHtml(r.author_name)} <span class="thread-reply-time">${App.timeAgo(r.created_at)}</span></div><div class="thread-reply-text">${App.escapeHtml(r.content)}</div></div></div>`;});
        html+=`<div class="chat-input-area" style="margin-top:var(--space-md);padding:0"><div class="chat-input-wrapper"><textarea id="thread-reply-input" placeholder="Write a reply..." rows="2"></textarea><div class="chat-input-actions"><button class="btn-icon" onclick="ClassroomView.replyThread(${tid})"><i data-lucide="send"></i></button></div></div></div>`;
        tc.innerHTML=html;lucide.createIcons();}catch(e){App.toast(e.message,'error');}
    },

    async createThread() {
        const cid=this.currentClass?.classroom?.id; if(!cid)return;
        const title=document.getElementById('thread-title').value.trim(),content=document.getElementById('thread-content').value.trim();
        if(!title||!content){App.toast('Title and content required','warning');return;}
        try{await App.api(`/api/classrooms/${cid}/threads`,'POST',{title,content});App.closeModal('modal-create-thread');App.toast('Discussion posted! +15 XP','success');document.getElementById('thread-title').value='';document.getElementById('thread-content').value='';this.switchTab('discussions');}catch(e){App.toast(e.message,'error');}
    },

    async replyThread(tid) {
        const content=document.getElementById('thread-reply-input').value.trim();
        if(!content){App.toast('Write a reply','warning');return;}
        try{await App.api(`/api/threads/${tid}/reply`,'POST',{content});App.toast('Reply posted! +10 XP','success');this.viewThread(tid);}catch(e){App.toast(e.message,'error');}
    },

    // Schedule
    async renderSchedule(container) {
        const cid=this.currentClass.classroom.id, isTeacher=this.currentClass.is_teacher;
        let html=isTeacher?`<div style="margin-bottom:var(--space-lg)"><button class="btn btn-primary" onclick="App.openModal('modal-schedule')"><i data-lucide="calendar-plus"></i> Schedule Class</button></div>`:'';
        try{const d=await App.api(`/api/classrooms/${cid}/schedules`);const scheds=d.schedules||[];if(!scheds.length)html+=`<div class="empty-state"><i data-lucide="calendar"></i><h3>No Classes Scheduled</h3></div>`;else{html+=`<div class="schedule-list">`;scheds.forEach(s=>{const st=new Date(s.start_time);html+=`<div class="schedule-card" onclick="VideoCall.startCall('${cid}','${App.escapeHtml(s.title)}')"><div class="schedule-time"><div class="time">${st.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'})}</div><div class="day">${st.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div></div><div class="schedule-info"><div class="schedule-title">${App.escapeHtml(s.title)}</div><div class="schedule-class">${App.escapeHtml(s.description||s.recurring!=='none'?'Recurring: '+s.recurring:'One-time')}</div></div><button class="btn btn-primary btn-sm"><i data-lucide="video"></i> Join</button>${isTeacher?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();ClassroomView.deleteSchedule(${s.id})"><i data-lucide="trash-2"></i></button>`:''}</div>`;});html+=`</div>`;}}catch(e){html+=`<p style="color:var(--accent-red)">${e.message}</p>`;}
        container.innerHTML=html;lucide.createIcons();
    },

    async createSchedule() {
        const cid=this.currentClass?.classroom?.id; if(!cid)return;
        const title=document.getElementById('sched-title').value.trim();
        if(!title){App.toast('Title required','warning');return;}
        const start=document.getElementById('sched-start').value,end=document.getElementById('sched-end').value;
        if(!start||!end){App.toast('Start/end time required','warning');return;}
        try{await App.api(`/api/classrooms/${cid}/schedules`,'POST',{title,description:document.getElementById('sched-desc').value.trim(),start_time:start,end_time:end,recurring:document.getElementById('sched-recurring').value});App.closeModal('modal-schedule');App.toast('Class scheduled!','success');this.switchTab('schedule');}catch(e){App.toast(e.message,'error');}
    },

    async deleteSchedule(sid){try{await App.api(`/api/schedules/${sid}`,'DELETE');App.toast('Deleted','success');this.switchTab('schedule');}catch(e){App.toast(e.message,'error');}},

    // Quizzes
    async renderQuizzes(container) {
        const cid=this.currentClass.classroom.id, isTeacher=this.currentClass.is_teacher;
        let html=isTeacher?`<div style="margin-bottom:var(--space-lg)"><button class="btn btn-primary" onclick="App.openModal('modal-create-quiz')"><i data-lucide="plus"></i> Create Quiz</button></div>`:'';
        try{const d=await App.api(`/api/classrooms/${cid}/quizzes`);const quizzes=d.quizzes||[];if(!quizzes.length)html+=`<div class="empty-state"><i data-lucide="help-circle"></i><h3>No Quizzes</h3></div>`;else{html+=`<div class="assignment-list">`;quizzes.forEach(q=>{html+=`<div class="assignment-card" onclick="ClassroomView.viewQuiz(${q.id})"><div class="assignment-icon quiz"><i data-lucide="zap"></i></div><div class="assignment-info"><div class="assignment-title">${App.escapeHtml(q.title)}</div><div class="assignment-meta"><span><i data-lucide="help-circle"></i> ${q.question_count} questions</span><span>${App.timeAgo(q.created_at)}</span></div></div><div><span class="status-badge ${q.status==='active'?'submitted':'pending'}">${q.status}</span></div></div>`;});html+=`</div>`;}}catch(e){html+=`<p style="color:var(--accent-red)">${e.message}</p>`;}
        container.innerHTML=html;lucide.createIcons();
    },

    addQuizQuestion() {
        const builder=document.getElementById('quiz-questions-builder');
        const count=builder.querySelectorAll('.quiz-q-item').length+1;
        const div=document.createElement('div');div.className='quiz-q-item';div.style.marginTop='var(--space-lg)';div.style.paddingTop='var(--space-lg)';div.style.borderTop='1px solid var(--border-color)';
        div.innerHTML=`<div class="form-group"><label>Question ${count}</label><input type="text" class="quiz-q-text" placeholder="Enter question"></div><div class="form-row four-col"><input type="text" class="quiz-opt" placeholder="Option A"><input type="text" class="quiz-opt" placeholder="Option B"><input type="text" class="quiz-opt" placeholder="Option C"><input type="text" class="quiz-opt" placeholder="Option D"></div><div class="form-row"><div class="form-group"><label>Correct (0-3)</label><input type="number" class="quiz-correct" value="0" min="0" max="3"></div><div class="form-group"><label>Time (sec)</label><input type="number" class="quiz-time" value="30" min="5"></div></div>`;
        builder.appendChild(div);
    },

    async createQuiz() {
        const cid=this.currentClass?.classroom?.id; if(!cid)return;
        const title=document.getElementById('quiz-title').value.trim();
        if(!title){App.toast('Title required','warning');return;}
        const items=document.querySelectorAll('.quiz-q-item');const questions=[];
        items.forEach(item=>{const q=item.querySelector('.quiz-q-text').value.trim();const opts=[...item.querySelectorAll('.quiz-opt')].map(o=>o.value.trim());const correct=parseInt(item.querySelector('.quiz-correct').value)||0;const time=parseInt(item.querySelector('.quiz-time').value)||30;if(q&&opts.some(o=>o))questions.push({question:q,options:opts,correct_answer:correct,time_limit:time});});
        if(!questions.length){App.toast('Add at least one question','warning');return;}
        try{await App.api(`/api/classrooms/${cid}/quizzes`,'POST',{title,questions});App.closeModal('modal-create-quiz');App.toast('Quiz created!','success');this.switchTab('quizzes');}catch(e){App.toast(e.message,'error');}
    },

    async viewQuiz(qid) {
        try{const d=await App.api(`/api/quizzes/${qid}`);const q=d.quiz;const tc=document.getElementById('class-tab-content');
        let html=`<button class="btn btn-ghost btn-sm" onclick="ClassroomView.switchTab('quizzes')" style="margin-bottom:var(--space-md)"><i data-lucide="arrow-left"></i> Back</button><h2 style="margin-bottom:var(--space-lg)">${App.escapeHtml(q.title)}</h2>`;
        const answeredIds=q.my_responses.map(r=>r.question_id);
        q.questions.forEach((qn,i)=>{const answered=answeredIds.includes(qn.id);const response=q.my_responses.find(r=>r.question_id===qn.id);
        html+=`<div class="gam-card" style="margin-bottom:var(--space-md)" id="quiz-q-${qn.id}"><h3>Q${i+1}: ${App.escapeHtml(qn.question_text)}</h3><div class="quiz-options" style="margin-top:var(--space-md)">`;
        qn.options.forEach((opt,oi)=>{let cls='quiz-option';if(answered){if(response&&response.answer===oi)cls+=response.is_correct?' correct':' wrong';}
        html+=`<div class="${cls}" ${!answered?`onclick="ClassroomView.answerQuiz(${q.id},${qn.id},${oi},this)"`:''} style="padding:var(--space-md)"><div class="quiz-option-label">${['A','B','C','D'][oi]}</div>${App.escapeHtml(opt)}</div>`;});
        html+=`</div>${answered?`<p style="margin-top:8px;font-size:0.8rem;color:${response?.is_correct?'var(--accent-emerald)':'var(--accent-red)'}">${response?.is_correct?'Correct! +20 XP':'Incorrect'}</p>`:''}</div>`;});
        tc.innerHTML=html;lucide.createIcons();}catch(e){App.toast(e.message,'error');}
    },

    async answerQuiz(quizId,questionId,answer,el) {
        try{const d=await App.api(`/api/quizzes/${quizId}/respond`,'POST',{question_id:questionId,answer,time_taken:0});
        const parent=el.closest('.quiz-options');parent.querySelectorAll('.quiz-option').forEach((o,i)=>{o.style.pointerEvents='none';if(i===d.correct_answer)o.classList.add('correct');if(i===answer&&!d.is_correct)o.classList.add('wrong');});
        const msg=document.createElement('p');msg.style.cssText=`margin-top:8px;font-size:0.8rem;color:${d.is_correct?'var(--accent-emerald)':'var(--accent-red)'}`;msg.textContent=d.is_correct?'Correct! +20 XP':'Incorrect';parent.parentElement.appendChild(msg);
        if(d.is_correct)App.toast('Correct answer! +20 XP','success');else App.toast('Wrong answer','error');}catch(e){App.toast(e.message,'error');}
    },

    // People
    renderPeople(container) {
        const data=this.currentClass, teacher=data.teacher, members=data.members||[];
        let html=`<div class="people-section"><div class="people-section-title">Teacher</div><div class="people-list"><div class="person-item"><div class="user-avatar" style="background:var(--gradient-accent)">${App.getInitial(teacher?.first_name||teacher?.username)}</div><div class="person-info"><div class="person-name">${App.escapeHtml(teacher?.first_name&&teacher?.last_name?`${teacher.first_name} ${teacher.last_name}`:teacher?.username)}</div><div class="person-email">${App.escapeHtml(teacher?.email||'')}</div></div><div class="${teacher?.is_online?'online-dot':'offline-dot'}"></div></div></div></div><div class="people-section"><div class="people-section-title">Students (${members.length})</div><div class="people-list">`;
        if(!members.length)html+=`<p style="color:var(--text-tertiary);padding:var(--space-md);font-size:0.85rem">No students yet.</p>`;
        else members.forEach(m=>{html+=`<div class="person-item"><div class="user-avatar">${App.getInitial(m.first_name||m.username)}</div><div class="person-info"><div class="person-name">${App.escapeHtml(m.first_name&&m.last_name?`${m.first_name} ${m.last_name}`:m.username)}</div><div class="person-email">${App.escapeHtml(m.email)}</div></div><div class="${m.is_online?'online-dot':'offline-dot'}"></div></div>`;});
        html+=`</div></div>`;container.innerHTML=html;lucide.createIcons();
    },

    // Files
    async renderFiles(container) {
        const cid=this.currentClass.classroom.id, isTeacher=this.currentClass.is_teacher;
        let html=isTeacher?`<div style="margin-bottom:var(--space-lg)"><label class="btn btn-primary" style="cursor:pointer"><i data-lucide="upload"></i> Upload File<input type="file" style="display:none" onchange="ClassroomView.uploadFile(this,${cid})"></label></div>`:'';
        try{const d=await App.api(`/api/classrooms/${cid}/resources`);const resources=d.resources||[];if(!resources.length)html+=`<div class="empty-state"><i data-lucide="folder-open"></i><h3>No Files</h3></div>`;else{html+=`<div class="files-grid">`;resources.forEach(r=>{html+=`<a href="${r.file_path}" target="_blank" class="file-card" style="text-decoration:none"><div class="file-icon ${r.file_type||'other'}"><i data-lucide="file"></i></div><div class="file-name">${App.escapeHtml(r.title)}</div><div class="file-meta">${App.formatFileSize(r.file_size)} - ${App.timeAgo(r.created_at)}</div></a>`;});html+=`</div>`;}}catch(e){html+=`<p style="color:var(--accent-red)">${e.message}</p>`;}
        container.innerHTML=html;lucide.createIcons();
    },

    async uploadFile(input,classId){const f=input.files[0];if(!f)return;const fd=new FormData();fd.append('file',f);fd.append('classroom_id',classId);fd.append('title',f.name);fd.append('folder','General');try{await App.apiUpload('/api/upload',fd);App.toast('File uploaded!','success');this.switchTab('files');}catch(e){App.toast(e.message,'error');}},

    // Assignment actions
    async viewAssignment(aid) {
        try{const d=await App.api(`/api/assignments/${aid}`);const a=d.assignment;const isTeacher=App.state.user.role==='teacher';
        if(isTeacher&&a.submissions){let html=`<div class="page-header"><div><button class="btn btn-ghost btn-sm" onclick="ClassroomView.switchTab('assignments')"><i data-lucide="arrow-left"></i> Back</button><h1 style="margin-top:8px">${App.escapeHtml(a.title)}</h1><p style="color:var(--text-secondary);margin-top:4px">${App.escapeHtml(a.description||'')}</p>${a.file_path?`<a href="${a.file_path}" target="_blank" class="assignment-file-link"><i data-lucide="paperclip"></i> ${App.escapeHtml(a.file_name||'Attached file')}</a>`:''}</div></div><div class="section-title"><i data-lucide="file-check"></i> Submissions (${a.submissions.length})</div>`;
        if(!a.submissions.length)html+=`<p style="color:var(--text-tertiary)">No submissions yet.</p>`;else{html+=`<div class="assignment-list">`;a.submissions.forEach(s=>{html+=`<div class="assignment-card"><div class="assignment-icon assignment"><i data-lucide="user"></i></div><div class="assignment-info"><div class="assignment-title">${App.escapeHtml(s.student_name)}</div><div class="assignment-meta"><span><i data-lucide="clock"></i> ${App.formatDateTime(s.submitted_at)}</span></div><p style="margin-top:6px;font-size:0.82rem;color:var(--text-secondary)">${App.escapeHtml(s.content||'No text')}</p>${s.file_path?`<a href="${s.file_path}" target="_blank" class="assignment-file-link"><i data-lucide="paperclip"></i> ${App.escapeHtml(s.file_name||'Attached file')}</a>`:''}</div><div class="assignment-status">${s.status==='graded'?`<span class="status-badge graded">${s.grade}/${a.points}</span>`:`<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();ClassroomView.openGradeModal(${s.id},'${App.escapeHtml(s.student_name)}',${a.points})">Grade</button>`}</div></div>`;});html+=`</div>`;}
        document.getElementById('class-tab-content').innerHTML=html;lucide.createIcons();}}catch(e){App.toast(e.message,'error');}
    },

    openSubmitModal(aid,title,points){this.currentAssignmentId=aid;document.getElementById('submit-assignment-info').innerHTML=`<div style="margin-bottom:var(--space-md);padding:var(--space-md);background:var(--surface-2);border-radius:var(--radius-md)"><strong>${App.escapeHtml(title)}</strong> <span style="color:var(--text-secondary)">(${points} points)</span></div>`;document.getElementById('submit-content').value='';document.getElementById('submit-file-name').textContent='';App.openModal('modal-submit-assignment');},

    async submitAssignment() {
        const content=document.getElementById('submit-content').value.trim();
        const fileInput=document.getElementById('submit-file');
        if(!content&&!fileInput.files.length){App.toast('Add text or file','warning');return;}
        const fd=new FormData();fd.append('content',content);
        if(fileInput.files.length)fd.append('file',fileInput.files[0]);
        try{const headers={};if(App.state.token)headers['Authorization']=`Bearer ${App.state.token}`;
        const r=await fetch(`/api/assignments/${this.currentAssignmentId}/submit`,{method:'POST',headers,body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error);
        App.closeModal('modal-submit-assignment');App.toast('Submitted! +30 XP','success');this.switchTab('assignments');}catch(e){App.toast(e.message,'error');}
    },

    openGradeModal(sid,name,max){this.currentSubmissionId=sid;document.getElementById('grade-submission-info').innerHTML=`<div style="margin-bottom:var(--space-md);padding:var(--space-md);background:var(--surface-2);border-radius:var(--radius-md)"><strong>${App.escapeHtml(name)}</strong> <span style="color:var(--text-secondary)">(max ${max})</span></div>`;document.getElementById('grade-value').value='';document.getElementById('grade-value').max=max;document.getElementById('grade-feedback').value='';App.openModal('modal-grade');},

    async gradeSubmission(){const grade=parseInt(document.getElementById('grade-value').value);const feedback=document.getElementById('grade-feedback').value.trim();if(isNaN(grade)||grade<0){App.toast('Enter valid grade','warning');return;}try{await App.api(`/api/submissions/${this.currentSubmissionId}/grade`,'PUT',{grade,feedback});App.closeModal('modal-grade');App.toast('Graded!','success');this.switchTab('assignments');}catch(e){App.toast(e.message,'error');}},

    async createAssignment() {
        const cid=this.currentClass?.classroom?.id;if(!cid)return;
        const title=document.getElementById('assign-title').value.trim();if(!title){App.toast('Title required','warning');return;}
        const fd=new FormData();fd.append('title',title);fd.append('description',document.getElementById('assign-description').value.trim());fd.append('due_date',document.getElementById('assign-due').value);fd.append('points',document.getElementById('assign-points').value||'100');fd.append('assignment_type',document.getElementById('assign-type').value);
        const fileInput=document.getElementById('assign-file');if(fileInput.files.length)fd.append('file',fileInput.files[0]);
        try{const headers={};if(App.state.token)headers['Authorization']=`Bearer ${App.state.token}`;
        const r=await fetch(`/api/classrooms/${cid}/assignments`,{method:'POST',headers,body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error);
        App.closeModal('modal-create-assignment');App.toast('Assignment created!','success');['assign-title','assign-description','assign-due'].forEach(id=>document.getElementById(id).value='');document.getElementById('assign-points').value='100';document.getElementById('assign-file-name').textContent='';this.switchTab('assignments');}catch(e){App.toast(e.message,'error');}
    },

    async postAnnouncement(){const cid=this.currentClass?.classroom?.id;if(!cid)return;const content=document.getElementById('announcement-content').value.trim();if(!content){App.toast('Enter announcement','warning');return;}try{await App.api(`/api/classrooms/${cid}/announcements`,'POST',{content});App.closeModal('modal-announcement');App.toast('Posted!','success');document.getElementById('announcement-content').value='';this.switchTab('stream');}catch(e){App.toast(e.message,'error');}},
};
