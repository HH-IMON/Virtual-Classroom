"""
Enhanced API routes for Virtual Classroom.
Covers classrooms, assignments with file upload, scheduling, quizzes,
threads, gamification, analytics, todos, bookmarks, AI assistant.
"""

from flask import Blueprint, request, jsonify, g, current_app, send_from_directory
from models import (db, User, Classroom, ClassroomMember, Assignment, Submission,
                     Announcement, Message, PrivateMessage, Resource, Notification,
                     ClassSchedule, LiveQuiz, QuizQuestion, QuizResponse,
                     Thread, ThreadReply, TodoItem, Bookmark, AINote,
                     Achievement, LeaderboardEntry, Attendance, DailyChallenge, ChallengeCompletion)
from utils import token_required, teacher_required, allowed_file, get_file_type
from werkzeug.utils import secure_filename
import os, datetime, json, random
import google.generativeai as genai
import tempfile

import urllib.request, urllib.parse
import requests

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

api_bp = Blueprint('api', __name__)

# ═══════════════════════ CLASSROOMS ═══════════════════════

@api_bp.route('/api/classrooms', methods=['GET'])
@token_required
def get_classrooms():
    user = g.current_user
    if user.role == 'teacher':
        taught = Classroom.query.filter_by(teacher_id=user.id).all()
        enrolled_ids = [m.classroom_id for m in ClassroomMember.query.filter_by(user_id=user.id).all()]
        enrolled = Classroom.query.filter(Classroom.id.in_(enrolled_ids)).all() if enrolled_ids else []
        classrooms = list({c.id: c for c in taught + enrolled}.values())
    else:
        member_ids = [m.classroom_id for m in ClassroomMember.query.filter_by(user_id=user.id).all()]
        classrooms = Classroom.query.filter(Classroom.id.in_(member_ids)).all() if member_ids else []
    return jsonify({'classrooms': [c.to_dict() for c in classrooms]})

@api_bp.route('/api/classrooms', methods=['POST'])
@token_required
@teacher_required
def create_classroom():
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'error': 'Class name is required'}), 400
    colors = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#3b82f6']
    classroom = Classroom(
        name=data['name'].strip(), description=data.get('description','').strip(),
        subject=data.get('subject','').strip(), section=data.get('section','').strip(),
        teacher_id=g.current_user.id, cover_color=data.get('cover_color', random.choice(colors))
    )
    db.session.add(classroom)
    db.session.commit()
    g.current_user.add_xp(50)
    db.session.commit()
    return jsonify({'message': 'Classroom created', 'classroom': classroom.to_dict()}), 201

@api_bp.route('/api/classrooms/<int:cid>', methods=['GET'])
@token_required
def get_classroom(cid):
    classroom = Classroom.query.get_or_404(cid)
    user = g.current_user
    is_teacher = classroom.teacher_id == user.id
    is_member = ClassroomMember.query.filter_by(classroom_id=cid, user_id=user.id).first() is not None
    if not is_teacher and not is_member:
        return jsonify({'error': 'Not a member'}), 403
    members = []
    for m in classroom.members:
        u = User.query.get(m.user_id)
        if u: members.append({**u.to_dict(), 'joined_at': m.joined_at.isoformat()})
    teacher = User.query.get(classroom.teacher_id)
    return jsonify({'classroom': classroom.to_dict(), 'is_teacher': is_teacher,
                    'teacher': teacher.to_dict() if teacher else None, 'members': members})

@api_bp.route('/api/classrooms/<int:cid>', methods=['PUT'])
@token_required
def update_classroom(cid):
    c = Classroom.query.get_or_404(cid)
    if c.teacher_id != g.current_user.id: return jsonify({'error': 'Not authorized'}), 403
    data = request.get_json()
    for f in ['name','description','subject','section']:
        if f in data: setattr(c, f, data[f].strip())
    db.session.commit()
    return jsonify({'message': 'Updated', 'classroom': c.to_dict()})

@api_bp.route('/api/classrooms/<int:cid>', methods=['DELETE'])
@token_required
def delete_classroom(cid):
    c = Classroom.query.get_or_404(cid)
    if c.teacher_id != g.current_user.id: return jsonify({'error': 'Not authorized'}), 403
    db.session.delete(c); db.session.commit()
    return jsonify({'message': 'Deleted'})

@api_bp.route('/api/classrooms/join', methods=['POST'])
@token_required
def join_classroom():
    data = request.get_json()
    code = data.get('code','').strip().upper()
    if not code: return jsonify({'error': 'Code required'}), 400
    c = Classroom.query.filter_by(code=code).first()
    if not c: return jsonify({'error': 'Invalid code'}), 404
    user = g.current_user
    if c.teacher_id == user.id: return jsonify({'error': 'You are the teacher'}), 400
    if ClassroomMember.query.filter_by(classroom_id=c.id, user_id=user.id).first():
        return jsonify({'error': 'Already enrolled'}), 400
    db.session.add(ClassroomMember(classroom_id=c.id, user_id=user.id))
    db.session.add(Notification(user_id=c.teacher_id, title='New Student',
        content=f'{user.username} joined {c.name}', notification_type='info',
        link=f'#/classroom/{c.id}'))
    user.add_xp(25)
    db.session.commit()
    return jsonify({'message': f'Joined {c.name}', 'classroom': c.to_dict()})

@api_bp.route('/api/classrooms/<int:cid>/leave', methods=['POST'])
@token_required
def leave_classroom(cid):
    m = ClassroomMember.query.filter_by(classroom_id=cid, user_id=g.current_user.id).first()
    if not m: return jsonify({'error': 'Not a member'}), 400
    db.session.delete(m); db.session.commit()
    return jsonify({'message': 'Left'})

# ═══════════════════════ ASSIGNMENTS WITH FILE UPLOAD ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/assignments', methods=['GET'])
@token_required
def get_assignments(cid):
    assignments = Assignment.query.filter_by(classroom_id=cid).order_by(Assignment.created_at.desc()).all()
    result = []
    for a in assignments:
        d = a.to_dict()
        sub = Submission.query.filter_by(assignment_id=a.id, student_id=g.current_user.id).first()
        d['submitted'] = sub is not None
        d['submission'] = sub.to_dict() if sub else None
        result.append(d)
    return jsonify({'assignments': result})

@api_bp.route('/api/classrooms/<int:cid>/assignments', methods=['POST'])
@token_required
@teacher_required
def create_assignment(cid):
    c = Classroom.query.get_or_404(cid)
    if c.teacher_id != g.current_user.id: return jsonify({'error': 'Not teacher'}), 403

    title = request.form.get('title', '').strip() or (request.get_json() or {}).get('title', '').strip()
    desc = request.form.get('description', '').strip() or (request.get_json() or {}).get('description', '').strip()
    due = request.form.get('due_date') or (request.get_json() or {}).get('due_date')
    pts = int(request.form.get('points', 100) or (request.get_json() or {}).get('points', 100))
    atype = request.form.get('assignment_type', 'assignment') or (request.get_json() or {}).get('assignment_type', 'assignment')

    if not title: return jsonify({'error': 'Title required'}), 400

    due_date = None
    if due:
        try: due_date = datetime.datetime.fromisoformat(due.replace('Z','+00:00'))
        except: pass

    file_path = ''
    file_name = ''
    if 'file' in request.files:
        f = request.files['file']
        if f.filename and allowed_file(f.filename):
            fn = secure_filename(f.filename)
            ts = datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')
            fn = f"{ts}_{fn}"
            up = current_app.config.get('UPLOAD_FOLDER', os.path.join(current_app.root_path, 'static', 'uploads'))
            os.makedirs(up, exist_ok=True)
            f.save(os.path.join(up, fn))
            file_path = f'/static/uploads/{fn}'
            file_name = f.filename

    a = Assignment(classroom_id=cid, title=title, description=desc, due_date=due_date,
                   points=pts, assignment_type=atype, file_path=file_path, file_name=file_name)
    db.session.add(a)

    for m in ClassroomMember.query.filter_by(classroom_id=cid).all():
        db.session.add(Notification(user_id=m.user_id, title='New Assignment',
            content=f'{c.name}: {title}', notification_type='assignment',
            link=f'#/classroom/{cid}'))
    db.session.commit()
    return jsonify({'message': 'Created', 'assignment': a.to_dict()}), 201

@api_bp.route('/api/assignments/<int:aid>', methods=['GET'])
@token_required
def get_assignment(aid):
    a = Assignment.query.get_or_404(aid)
    c = Classroom.query.get(a.classroom_id)
    d = a.to_dict()
    d['classroom_name'] = c.name if c else ''
    if g.current_user.role == 'teacher' and c and c.teacher_id == g.current_user.id:
        d['submissions'] = [s.to_dict() for s in Submission.query.filter_by(assignment_id=aid).all()]
    else:
        sub = Submission.query.filter_by(assignment_id=aid, student_id=g.current_user.id).first()
        d['submission'] = sub.to_dict() if sub else None
    return jsonify({'assignment': d})

@api_bp.route('/api/assignments/<int:aid>/submit', methods=['POST'])
@token_required
def submit_assignment(aid):
    a = Assignment.query.get_or_404(aid)
    if Submission.query.filter_by(assignment_id=aid, student_id=g.current_user.id).first():
        return jsonify({'error': 'Already submitted'}), 400

    content = request.form.get('content', '').strip()
    if not content and request.is_json:
        content = (request.get_json() or {}).get('content', '').strip()

    file_path = ''
    file_name = ''
    if 'file' in request.files:
        f = request.files['file']
        if f.filename and allowed_file(f.filename):
            fn = secure_filename(f.filename)
            ts = datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')
            fn = f"{ts}_{fn}"
            up = current_app.config.get('UPLOAD_FOLDER', os.path.join(current_app.root_path, 'static', 'uploads'))
            os.makedirs(up, exist_ok=True)
            f.save(os.path.join(up, fn))
            file_path = f'/static/uploads/{fn}'
            file_name = f.filename

    sub = Submission(assignment_id=aid, student_id=g.current_user.id,
                     content=content, file_path=file_path, file_name=file_name)
    db.session.add(sub)

    c = Classroom.query.get(a.classroom_id)
    if c:
        db.session.add(Notification(user_id=c.teacher_id, title='New Submission',
            content=f'{g.current_user.username} submitted {a.title}',
            notification_type='assignment', link=f'#/classroom/{c.id}'))
    g.current_user.add_xp(30)
    db.session.commit()
    return jsonify({'message': 'Submitted', 'submission': sub.to_dict()}), 201

@api_bp.route('/api/submissions/<int:sid>/grade', methods=['PUT'])
@token_required
@teacher_required
def grade_submission(sid):
    sub = Submission.query.get_or_404(sid)
    data = request.get_json()
    sub.grade = data.get('grade')
    sub.feedback = data.get('feedback', '').strip()
    sub.status = 'graded'
    a = Assignment.query.get(sub.assignment_id)
    db.session.add(Notification(user_id=sub.student_id, title='Graded',
        content=f'{a.title}: {sub.grade}/{a.points}', notification_type='grade',
        link=f'#/classroom/{a.classroom_id}'))
    student = User.query.get(sub.student_id)
    if student:
        student.add_xp(int(sub.grade * 0.5) if sub.grade else 10)
    db.session.commit()
    return jsonify({'message': 'Graded', 'submission': sub.to_dict()})

# ═══════════════════════ ANNOUNCEMENTS ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/announcements', methods=['GET'])
@token_required
def get_announcements(cid):
    anns = Announcement.query.filter_by(classroom_id=cid).order_by(Announcement.created_at.desc()).all()
    return jsonify({'announcements': [a.to_dict() for a in anns]})

@api_bp.route('/api/classrooms/<int:cid>/announcements', methods=['POST'])
@token_required
@teacher_required
def create_announcement(cid):
    c = Classroom.query.get_or_404(cid)
    if c.teacher_id != g.current_user.id: return jsonify({'error': 'Not teacher'}), 403
    data = request.get_json()
    if not data or not data.get('content'): return jsonify({'error': 'Content required'}), 400
    ann = Announcement(classroom_id=cid, author_id=g.current_user.id, content=data['content'].strip())
    db.session.add(ann)
    for m in ClassroomMember.query.filter_by(classroom_id=cid).all():
        db.session.add(Notification(user_id=m.user_id, title='Announcement',
            content=f'{c.name}', notification_type='announcement', link=f'#/classroom/{cid}'))
    db.session.commit()
    return jsonify({'message': 'Posted', 'announcement': ann.to_dict()}), 201

# ═══════════════════════ CHAT ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/messages', methods=['GET'])
@token_required
def get_messages(cid):
    msgs = Message.query.filter_by(classroom_id=cid).order_by(Message.created_at.asc()).limit(200).all()
    return jsonify({'messages': [m.to_dict() for m in msgs]})

@api_bp.route('/api/classrooms/<int:cid>/messages/pinned', methods=['GET'])
@token_required
def get_pinned_messages(cid):
    msgs = Message.query.filter_by(classroom_id=cid, is_pinned=True).order_by(Message.created_at.desc()).all()
    return jsonify({'messages': [m.to_dict() for m in msgs]})

@api_bp.route('/api/messages/<int:mid>/pin', methods=['PUT'])
@token_required
def toggle_pin_message(mid):
    msg = Message.query.get_or_404(mid)
    msg.is_pinned = not msg.is_pinned
    db.session.commit()
    return jsonify({'message': 'Toggled', 'is_pinned': msg.is_pinned})

@api_bp.route('/api/messages/<int:mid>/react', methods=['PUT'])
@token_required
def react_message(mid):
    msg = Message.query.get_or_404(mid)
    data = request.get_json()
    emoji = data.get('emoji', '')
    reactions = json.loads(msg.reactions or '{}')
    uid = str(g.current_user.id)
    if emoji in reactions:
        if uid in reactions[emoji]:
            reactions[emoji].remove(uid)
            if not reactions[emoji]: del reactions[emoji]
        else:
            reactions[emoji].append(uid)
    else:
        reactions[emoji] = [uid]
    msg.reactions = json.dumps(reactions)
    db.session.commit()
    return jsonify({'reactions': reactions})

@api_bp.route('/api/messages/private/<int:uid>', methods=['GET'])
@token_required
def get_private_messages(uid):
    my = g.current_user.id
    msgs = PrivateMessage.query.filter(
        ((PrivateMessage.sender_id == my) & (PrivateMessage.receiver_id == uid)) |
        ((PrivateMessage.sender_id == uid) & (PrivateMessage.receiver_id == my))
    ).order_by(PrivateMessage.created_at.asc()).all()
    for m in msgs:
        if m.receiver_id == my and not m.is_read: m.is_read = True
    db.session.commit()
    return jsonify({'messages': [m.to_dict() for m in msgs]})

@api_bp.route('/api/messages/conversations', methods=['GET'])
@token_required
def get_conversations():
    my = g.current_user.id
    sent = db.session.query(PrivateMessage.receiver_id).filter_by(sender_id=my).distinct().all()
    recv = db.session.query(PrivateMessage.sender_id).filter_by(receiver_id=my).distinct().all()
    pids = set([r[0] for r in sent] + [r[0] for r in recv])
    convos = []
    for pid in pids:
        p = User.query.get(pid)
        if not p: continue
        last = PrivateMessage.query.filter(
            ((PrivateMessage.sender_id==my)&(PrivateMessage.receiver_id==pid))|
            ((PrivateMessage.sender_id==pid)&(PrivateMessage.receiver_id==my))
        ).order_by(PrivateMessage.created_at.desc()).first()
        unread = PrivateMessage.query.filter_by(sender_id=pid,receiver_id=my,is_read=False).count()
        convos.append({'user': p.to_dict(), 'last_message': last.to_dict() if last else None, 'unread_count': unread})
    convos.sort(key=lambda x: x['last_message']['created_at'] if x['last_message'] else '', reverse=True)
    return jsonify({'conversations': convos})

# ═══════════════════════ THREADS (FORUM) ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/threads', methods=['GET'])
@token_required
def get_threads(cid):
    threads = Thread.query.filter_by(classroom_id=cid).order_by(Thread.is_pinned.desc(), Thread.created_at.desc()).all()
    return jsonify({'threads': [t.to_dict() for t in threads]})

@api_bp.route('/api/classrooms/<int:cid>/threads', methods=['POST'])
@token_required
def create_thread(cid):
    data = request.get_json()
    if not data or not data.get('title') or not data.get('content'):
        return jsonify({'error': 'Title and content required'}), 400
    t = Thread(classroom_id=cid, author_id=g.current_user.id,
               title=data['title'].strip(), content=data['content'].strip())
    db.session.add(t)
    g.current_user.add_xp(15)
    db.session.commit()
    return jsonify({'message': 'Created', 'thread': t.to_dict()}), 201

@api_bp.route('/api/threads/<int:tid>', methods=['GET'])
@token_required
def get_thread(tid):
    t = Thread.query.get_or_404(tid)
    replies = [r.to_dict() for r in ThreadReply.query.filter_by(thread_id=tid).order_by(ThreadReply.created_at.asc()).all()]
    return jsonify({'thread': t.to_dict(), 'replies': replies})

@api_bp.route('/api/threads/<int:tid>/reply', methods=['POST'])
@token_required
def reply_thread(tid):
    data = request.get_json()
    if not data or not data.get('content'): return jsonify({'error': 'Content required'}), 400
    r = ThreadReply(thread_id=tid, author_id=g.current_user.id, content=data['content'].strip())
    db.session.add(r)
    g.current_user.add_xp(10)
    db.session.commit()
    return jsonify({'message': 'Replied', 'reply': r.to_dict()}), 201

@api_bp.route('/api/threads/<int:tid>/pin', methods=['PUT'])
@token_required
def toggle_pin_thread(tid):
    t = Thread.query.get_or_404(tid)
    t.is_pinned = not t.is_pinned
    db.session.commit()
    return jsonify({'is_pinned': t.is_pinned})

# ═══════════════════════ SCHEDULING ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/schedules', methods=['GET'])
@token_required
def get_schedules(cid):
    scheds = ClassSchedule.query.filter_by(classroom_id=cid).order_by(ClassSchedule.start_time.asc()).all()
    return jsonify({'schedules': [s.to_dict() for s in scheds]})

@api_bp.route('/api/classrooms/<int:cid>/schedules', methods=['POST'])
@token_required
@teacher_required
def create_schedule(cid):
    data = request.get_json()
    if not data or not data.get('title') or not data.get('start_time'):
        return jsonify({'error': 'Title and start time required'}), 400
    try:
        st = datetime.datetime.fromisoformat(data['start_time'].replace('Z','+00:00'))
        et = datetime.datetime.fromisoformat(data.get('end_time', data['start_time']).replace('Z','+00:00'))
    except:
        return jsonify({'error': 'Invalid datetime'}), 400
    s = ClassSchedule(classroom_id=cid, title=data['title'].strip(),
        description=data.get('description','').strip(),
        start_time=st, end_time=et, recurring=data.get('recurring','none'),
        meeting_link=f'#/classroom/{cid}')
    db.session.add(s)
    for m in ClassroomMember.query.filter_by(classroom_id=cid).all():
        db.session.add(Notification(user_id=m.user_id, title='Class Scheduled',
            content=f'{data["title"]} - {st.strftime("%b %d, %I:%M %p")}',
            notification_type='info', link=f'#/classroom/{cid}'))
    db.session.commit()
    return jsonify({'message': 'Scheduled', 'schedule': s.to_dict()}), 201

@api_bp.route('/api/schedules/<int:sid>', methods=['DELETE'])
@token_required
def delete_schedule(sid):
    s = ClassSchedule.query.get_or_404(sid)
    db.session.delete(s); db.session.commit()
    return jsonify({'message': 'Deleted'})

@api_bp.route('/api/schedules/upcoming', methods=['GET'])
@token_required
def get_upcoming_schedules():
    user = g.current_user
    if user.role == 'teacher':
        cids = [c.id for c in Classroom.query.filter_by(teacher_id=user.id).all()]
    else:
        cids = [m.classroom_id for m in ClassroomMember.query.filter_by(user_id=user.id).all()]
    now = datetime.datetime.utcnow()
    scheds = ClassSchedule.query.filter(ClassSchedule.classroom_id.in_(cids),
        ClassSchedule.start_time >= now).order_by(ClassSchedule.start_time.asc()).limit(10).all()
    result = []
    for s in scheds:
        d = s.to_dict()
        c = Classroom.query.get(s.classroom_id)
        d['classroom_name'] = c.name if c else ''
        result.append(d)
    return jsonify({'schedules': result})

# ═══════════════════════ LIVE QUIZZES ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/quizzes', methods=['GET'])
@token_required
def get_quizzes(cid):
    quizzes = LiveQuiz.query.filter_by(classroom_id=cid).order_by(LiveQuiz.created_at.desc()).all()
    return jsonify({'quizzes': [q.to_dict() for q in quizzes]})

@api_bp.route('/api/classrooms/<int:cid>/quizzes', methods=['POST'])
@token_required
@teacher_required
def create_quiz(cid):
    data = request.get_json()
    if not data or not data.get('title'): return jsonify({'error': 'Title required'}), 400
    q = LiveQuiz(classroom_id=cid, title=data['title'].strip())
    db.session.add(q); db.session.flush()
    for i, qd in enumerate(data.get('questions', [])):
        qq = QuizQuestion(quiz_id=q.id, question_text=qd.get('question',''),
            options=json.dumps(qd.get('options',[])),
            correct_answer=qd.get('correct_answer',0),
            time_limit=qd.get('time_limit',30), order_num=i)
        db.session.add(qq)
    db.session.commit()
    return jsonify({'message': 'Created', 'quiz': q.to_dict()}), 201

@api_bp.route('/api/quizzes/<int:qid>', methods=['GET'])
@token_required
def get_quiz(qid):
    q = LiveQuiz.query.get_or_404(qid)
    d = q.to_dict()
    if g.current_user.role != 'teacher':
        for qn in d['questions']:
            del qn['correct_answer']
    responses = QuizResponse.query.filter_by(quiz_id=qid, user_id=g.current_user.id).all()
    d['my_responses'] = [r.to_dict() for r in responses]
    return jsonify({'quiz': d})

@api_bp.route('/api/quizzes/<int:qid>/respond', methods=['POST'])
@token_required
def respond_quiz(qid):
    data = request.get_json()
    qn = QuizQuestion.query.get_or_404(data.get('question_id'))
    existing = QuizResponse.query.filter_by(quiz_id=qid, question_id=qn.id, user_id=g.current_user.id).first()
    if existing: return jsonify({'error': 'Already answered'}), 400
    is_correct = data.get('answer') == qn.correct_answer
    r = QuizResponse(quiz_id=qid, question_id=qn.id, user_id=g.current_user.id,
        answer=data.get('answer', -1), is_correct=is_correct,
        time_taken=data.get('time_taken', 0))
    db.session.add(r)
    if is_correct:
        g.current_user.add_xp(20)
    db.session.commit()
    return jsonify({'is_correct': is_correct, 'correct_answer': qn.correct_answer})

@api_bp.route('/api/quizzes/<int:qid>/results', methods=['GET'])
@token_required
def quiz_results(qid):
    q = LiveQuiz.query.get_or_404(qid)
    responses = QuizResponse.query.filter_by(quiz_id=qid).all()
    user_scores = {}
    for r in responses:
        if r.user_id not in user_scores:
            u = User.query.get(r.user_id)
            user_scores[r.user_id] = {'username': u.username if u else '?', 'correct': 0, 'total': 0}
        user_scores[r.user_id]['total'] += 1
        if r.is_correct: user_scores[r.user_id]['correct'] += 1
    leaderboard = sorted(user_scores.values(), key=lambda x: x['correct'], reverse=True)
    return jsonify({'quiz': q.to_dict(), 'leaderboard': leaderboard})

# ═══════════════════════ RESOURCES ═══════════════════════

@api_bp.route('/api/classrooms/<int:cid>/resources', methods=['GET'])
@token_required
def get_resources(cid):
    resources = Resource.query.filter_by(classroom_id=cid).order_by(Resource.created_at.desc()).all()
    folders = {}
    for r in resources:
        f = r.folder or 'General'
        if f not in folders: folders[f] = []
        folders[f].append(r.to_dict())
    return jsonify({'resources': [r.to_dict() for r in resources], 'folders': folders})

@api_bp.route('/api/upload', methods=['POST'])
@token_required
def upload_file():
    if 'file' not in request.files: return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    if not f.filename: return jsonify({'error': 'No file'}), 400
    if not allowed_file(f.filename): return jsonify({'error': 'Type not allowed'}), 400
    fn = secure_filename(f.filename)
    ts = datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')
    fn = f"{ts}_{fn}"
    up = current_app.config.get('UPLOAD_FOLDER', os.path.join(current_app.root_path, 'static', 'uploads'))
    os.makedirs(up, exist_ok=True)
    fp = os.path.join(up, fn)
    f.save(fp)
    url = f'/static/uploads/{fn}'
    sz = os.path.getsize(fp)
    cid = request.form.get('classroom_id')
    if cid:
        r = Resource(classroom_id=int(cid), uploader_id=g.current_user.id,
            title=request.form.get('title', f.filename), file_path=url,
            file_type=get_file_type(f.filename), file_size=sz,
            folder=request.form.get('folder', 'General'))
        db.session.add(r); db.session.commit()
    return jsonify({'file_path': url, 'file_name': fn, 'file_size': sz, 'original_name': f.filename})

# ═══════════════════════ NOTIFICATIONS ═══════════════════════

@api_bp.route('/api/notifications', methods=['GET'])
@token_required
def get_notifications():
    notifs = Notification.query.filter_by(user_id=g.current_user.id).order_by(Notification.created_at.desc()).limit(50).all()
    unread = Notification.query.filter_by(user_id=g.current_user.id, is_read=False).count()
    return jsonify({'notifications': [n.to_dict() for n in notifs], 'unread_count': unread})

@api_bp.route('/api/notifications/read', methods=['PUT'])
@token_required
def mark_all_read():
    Notification.query.filter_by(user_id=g.current_user.id, is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify({'message': 'Done'})

@api_bp.route('/api/notifications/<int:nid>/read', methods=['PUT'])
@token_required
def mark_read(nid):
    n = Notification.query.get_or_404(nid)
    if n.user_id != g.current_user.id: return jsonify({'error': 'Denied'}), 403
    n.is_read = True; db.session.commit()
    return jsonify({'message': 'Done'})

# ═══════════════════════ GAMIFICATION ═══════════════════════

@api_bp.route('/api/gamification/profile', methods=['GET'])
@token_required
def gamification_profile():
    u = g.current_user
    achievements = Achievement.query.filter_by(user_id=u.id).order_by(Achievement.earned_at.desc()).all()
    today = datetime.date.today().isoformat()
    if u.last_active_date != today:
        if u.last_active_date == (datetime.date.today() - datetime.timedelta(days=1)).isoformat():
            u.streak_days += 1
        else:
            u.streak_days = 1
        u.last_active_date = today
        u.add_xp(10)
        if u.streak_days == 7 and 'week_streak' not in u.get_badges():
            u.add_badge('week_streak')
            db.session.add(Achievement(user_id=u.id, title='Week Warrior',
                description='7-day login streak!', icon='flame'))
        if u.streak_days == 30 and 'month_streak' not in u.get_badges():
            u.add_badge('month_streak')
            db.session.add(Achievement(user_id=u.id, title='Dedicated Learner',
                description='30-day login streak!', icon='trophy'))
        db.session.commit()

    return jsonify({
        'xp': u.xp, 'level': u.level, 'streak_days': u.streak_days,
        'badges': u.get_badges(),
        'achievements': [a.to_dict() for a in achievements],
        'xp_to_next': 500 - (u.xp % 500)
    })

@api_bp.route('/api/gamification/leaderboard', methods=['GET'])
@token_required
def leaderboard():
    users = User.query.order_by(User.xp.desc()).limit(20).all()
    lb = []
    for i, u in enumerate(users):
        lb.append({'rank': i+1, 'username': u.username, 'first_name': u.first_name,
                   'xp': u.xp, 'level': u.level, 'streak_days': u.streak_days,
                   'badges': u.get_badges()})
    return jsonify({'leaderboard': lb})

@api_bp.route('/api/gamification/challenges', methods=['GET'])
@token_required
def get_challenges():
    today = datetime.date.today().isoformat()
    challenges = DailyChallenge.query.filter_by(date=today).all()
    if not challenges:
        templates = [
            ('Complete an Assignment', 'Submit any assignment today', 50),
            ('Class Participation', 'Send 5 messages in any class chat', 30),
            ('Knowledge Seeker', 'View 3 different class resources', 25),
            ('Discussion Leader', 'Start a new discussion thread', 40),
            ('Quiz Champion', 'Score 100% on a live quiz', 75),
        ]
        for title, desc, xp in templates:
            c = DailyChallenge(title=title, description=desc, xp_reward=xp, date=today)
            db.session.add(c)
        db.session.commit()
        challenges = DailyChallenge.query.filter_by(date=today).all()

    completed_ids = [cc.challenge_id for cc in ChallengeCompletion.query.filter_by(user_id=g.current_user.id).all()]
    result = []
    for c in challenges:
        d = c.to_dict()
        d['completed'] = c.id in completed_ids
        result.append(d)
    return jsonify({'challenges': result})

# ═══════════════════════ TODOS ═══════════════════════

@api_bp.route('/api/todos', methods=['GET'])
@token_required
def get_todos():
    todos = TodoItem.query.filter_by(user_id=g.current_user.id).order_by(TodoItem.created_at.desc()).all()
    return jsonify({'todos': [t.to_dict() for t in todos]})

@api_bp.route('/api/todos', methods=['POST'])
@token_required
def create_todo():
    data = request.get_json()
    if not data or not data.get('text'): return jsonify({'error': 'Text required'}), 400
    due = None
    if data.get('due_date'):
        try: due = datetime.datetime.fromisoformat(data['due_date'].replace('Z','+00:00'))
        except: pass
    t = TodoItem(user_id=g.current_user.id, text=data['text'].strip(),
                 priority=data.get('priority','medium'), due_date=due)
    db.session.add(t); db.session.commit()
    return jsonify({'todo': t.to_dict()}), 201

@api_bp.route('/api/todos/<int:tid>', methods=['PUT'])
@token_required
def update_todo(tid):
    t = TodoItem.query.get_or_404(tid)
    if t.user_id != g.current_user.id: return jsonify({'error': 'Denied'}), 403
    data = request.get_json()
    if 'is_done' in data:
        t.is_done = data['is_done']
        if t.is_done: g.current_user.add_xp(5)
    if 'text' in data: t.text = data['text'].strip()
    if 'priority' in data: t.priority = data['priority']
    db.session.commit()
    return jsonify({'todo': t.to_dict()})

@api_bp.route('/api/todos/<int:tid>', methods=['DELETE'])
@token_required
def delete_todo(tid):
    t = TodoItem.query.get_or_404(tid)
    if t.user_id != g.current_user.id: return jsonify({'error': 'Denied'}), 403
    db.session.delete(t); db.session.commit()
    return jsonify({'message': 'Deleted'})

# ═══════════════════════ BOOKMARKS ═══════════════════════

@api_bp.route('/api/bookmarks', methods=['GET'])
@token_required
def get_bookmarks():
    bm = Bookmark.query.filter_by(user_id=g.current_user.id).order_by(Bookmark.created_at.desc()).all()
    return jsonify({'bookmarks': [b.to_dict() for b in bm]})

@api_bp.route('/api/bookmarks', methods=['POST'])
@token_required
def create_bookmark():
    data = request.get_json()
    if not data or not data.get('title'): return jsonify({'error': 'Title required'}), 400
    b = Bookmark(user_id=g.current_user.id, title=data['title'].strip(),
                 link=data.get('link',''), bookmark_type=data.get('type','lecture'))
    db.session.add(b); db.session.commit()
    return jsonify({'bookmark': b.to_dict()}), 201

@api_bp.route('/api/bookmarks/<int:bid>', methods=['DELETE'])
@token_required
def delete_bookmark(bid):
    b = Bookmark.query.get_or_404(bid)
    if b.user_id != g.current_user.id: return jsonify({'error': 'Denied'}), 403
    db.session.delete(b); db.session.commit()
    return jsonify({'message': 'Deleted'})

# ═══════════════════════ AI ASSISTANT ═══════════════════════

AI_RESPONSES = {
    'explain': "Great question! Let me break this down:\n\n**Key Concepts:**\n1. Start with the fundamentals - understand the basic building blocks\n2. Connect related ideas - see how concepts link together\n3. Practice application - try working through examples\n\n**Simple Analogy:** Think of it like building with blocks - each concept is a block, and understanding comes from seeing how they stack together.\n\n**Next Steps:** Try reviewing the class materials and work through practice problems. Feel free to ask more specific questions!",
    'summarize': "Here's a concise summary of the key points:\n\n**Main Topics Covered:**\n- Core theoretical foundations\n- Practical applications and examples\n- Common challenges and solutions\n\n**Key Takeaways:**\n1. Understanding fundamentals is essential\n2. Practice reinforces learning\n3. Collaboration enhances understanding\n\n**Action Items:** Review notes, complete assigned exercises, and prepare questions for next session.",
    'help': "I'm your AI Teaching Assistant! Here's how I can help:\n\n- **Explain concepts** - Ask me to explain any topic\n- **Summarize content** - I'll create concise summaries\n- **Study tips** - Get personalized study advice\n- **Practice questions** - I'll generate practice problems\n- **Clarify doubts** - Ask anything you're unsure about\n\nJust type your question and I'll do my best to help!",
    'quiz': "Let me create a quick practice quiz for you:\n\n**Question 1:** What is the primary purpose of this concept?\nA) To simplify complex processes\nB) To organize information systematically\nC) To enable efficient problem-solving\nD) All of the above\n\n**Answer:** D) All of the above - Each aspect contributes to the overall understanding.\n\n**Question 2:** Which approach is most effective for learning?\nA) Passive reading\nB) Active practice and application\nC) Memorization only\n\n**Answer:** B) Active practice leads to deeper understanding.",
    'default': "That's an interesting question! Based on the course material:\n\n**Key Points:**\n- This topic relates to fundamental concepts covered in class\n- Understanding requires connecting theory with practice\n- Consider reviewing relevant lecture notes and resources\n\n**My Suggestion:** Break the problem into smaller parts and tackle each one systematically. Start with what you know, identify gaps, and focus your study there.\n\n**Need more help?** Try asking me to 'explain', 'summarize', or generate a 'quiz' on this topic!"
}

@api_bp.route('/api/ai/ask', methods=['POST'])
@token_required
def ai_ask():
    if request.is_json:
        # Legacy fallback
        data = request.get_json()
        question = data.get('question', '').strip()
        uploaded_file = None
    else:
        question = request.form.get('question', '').strip()
        uploaded_file = request.files.get('file')

    if not question and not uploaded_file:
        return jsonify({'error': 'Question or attachment required'}), 400

    if not GEMINI_API_KEY:
        try:
            # FREE API Fallback
            full_prompt = f"{question}"
            if uploaded_file: full_prompt += " [Note: Free fallback tier can only read the text provided above]"
            
            payload = {"messages": [{"role": "user", "content": full_prompt}]}
            res = requests.post("https://text.pollinations.ai/", json=payload, headers={'User-Agent': 'Mozilla/5.0'}, timeout=20)
            free_response = res.text
            
            g.current_user.add_xp(5)
            db.session.commit()
            return jsonify({'response': free_response, 'question': question})
        except Exception as fallback_err:
            print("Fallback API error:", fallback_err)
            return jsonify({'response': "I'm having trouble connecting right now. Please try again later.", 'question': question})

    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        contents = []

        if uploaded_file and uploaded_file.filename != '':
            # Handle the file for Gemini
            ext = os.path.splitext(uploaded_file.filename)[1]
            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp:
                uploaded_file.save(temp.name)
                temp_path = temp.name
            
            # Upload to genai
            gfile = genai.upload_file(temp_path)
            contents.append(gfile)
            os.unlink(temp_path)

        if question:
            contents.append(question)
        elif uploaded_file:
            contents.append("Please analyze or summarize the contents of this file.")

        ai_response = model.generate_content(contents)
        result_text = ai_response.text

        g.current_user.add_xp(5)
        db.session.commit()
        return jsonify({'response': result_text, 'question': question})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@api_bp.route('/api/ai/notes', methods=['POST'])
@token_required
def ai_generate_notes():
    data = request.get_json()
    topic = data.get('topic', 'General Notes').strip()
    cid = data.get('classroom_id')
    content = f"# {topic}\n\n## Key Concepts\n- Important foundation concepts were covered\n- Practical examples demonstrated core principles\n- Interactive discussion reinforced understanding\n\n## Detailed Notes\n1. **Introduction**: Overview of {topic} and its significance\n2. **Core Theory**: Fundamental principles and frameworks\n3. **Applications**: Real-world use cases and examples\n4. **Summary**: Key takeaways and review points\n\n## Study Recommendations\n- Review assigned readings and materials\n- Practice with sample problems\n- Discuss concepts with peers"
    key_points = [f"Understanding {topic} fundamentals", "Practical application methods", "Key terminology and definitions", "Connection to previous topics"]

    note = AINote(classroom_id=cid or 0, user_id=g.current_user.id,
                  title=f"Notes: {topic}", content=content,
                  key_points=json.dumps(key_points))
    db.session.add(note); db.session.commit()
    return jsonify({'note': note.to_dict()})

@api_bp.route('/api/ai/notes', methods=['GET'])
@token_required
def get_ai_notes():
    notes = AINote.query.filter_by(user_id=g.current_user.id).order_by(AINote.created_at.desc()).all()
    return jsonify({'notes': [n.to_dict() for n in notes]})

# ═══════════════════════ ANALYTICS ═══════════════════════

@api_bp.route('/api/analytics', methods=['GET'])
@token_required
def get_analytics():
    u = g.current_user
    if u.role == 'teacher':
        cids = [c.id for c in Classroom.query.filter_by(teacher_id=u.id).all()]
    else:
        cids = [m.classroom_id for m in ClassroomMember.query.filter_by(user_id=u.id).all()]

    subs = Submission.query.filter_by(student_id=u.id).all() if u.role == 'student' else []
    graded = [s for s in subs if s.status == 'graded' and s.grade is not None]
    grades = [s.grade for s in graded]
    avg_grade = sum(grades) / len(grades) if grades else 0

    attendance = Attendance.query.filter_by(user_id=u.id).order_by(Attendance.date.desc()).limit(30).all()
    att_data = {a.date: a.status for a in attendance}

    total_time = sum(a.duration_minutes for a in attendance)

    weekly_xp = []
    for i in range(7):
        d = (datetime.date.today() - datetime.timedelta(days=6-i)).isoformat()
        weekly_xp.append({'date': d, 'xp': random.randint(20, 100)})

    grade_trend = []
    for s in graded[-10:]:
        a = Assignment.query.get(s.assignment_id)
        grade_trend.append({'title': a.title[:20] if a else '?', 'grade': s.grade, 'max': a.points if a else 100})

    return jsonify({
        'total_classes': len(cids),
        'total_submissions': len(subs),
        'avg_grade': round(avg_grade, 1),
        'total_time_minutes': total_time,
        'attendance': att_data,
        'weekly_xp': weekly_xp,
        'grade_trend': grade_trend,
        'xp': u.xp, 'level': u.level, 'streak': u.streak_days
    })

# ═══════════════════════ DASHBOARD ═══════════════════════

@api_bp.route('/api/dashboard', methods=['GET'])
@token_required
def get_dashboard():
    user = g.current_user
    if user.role == 'teacher':
        classrooms = Classroom.query.filter_by(teacher_id=user.id).all()
        mcids = [m.classroom_id for m in ClassroomMember.query.filter_by(user_id=user.id).all()]
        mclasses = Classroom.query.filter(Classroom.id.in_(mcids)).all() if mcids else []
        all_c = list({c.id: c for c in classrooms + mclasses}.values())
    else:
        mids = [m.classroom_id for m in ClassroomMember.query.filter_by(user_id=user.id).all()]
        all_c = Classroom.query.filter(Classroom.id.in_(mids)).all() if mids else []

    cids = [c.id for c in all_c]
    upcoming = Assignment.query.filter(Assignment.classroom_id.in_(cids),
        Assignment.due_date != None, Assignment.due_date >= datetime.datetime.utcnow()
    ).order_by(Assignment.due_date.asc()).limit(10).all()
    recent_ann = Announcement.query.filter(Announcement.classroom_id.in_(cids)
    ).order_by(Announcement.created_at.desc()).limit(5).all()
    total_a = Assignment.query.filter(Assignment.classroom_id.in_(cids)).count()

    schedules = ClassSchedule.query.filter(ClassSchedule.classroom_id.in_(cids),
        ClassSchedule.start_time >= datetime.datetime.utcnow()
    ).order_by(ClassSchedule.start_time.asc()).limit(5).all()
    sched_data = []
    for s in schedules:
        d = s.to_dict()
        c = Classroom.query.get(s.classroom_id)
        d['classroom_name'] = c.name if c else ''
        sched_data.append(d)

    if user.role == 'student':
        submitted = Submission.query.filter_by(student_id=user.id).count()
        graded_subs = Submission.query.filter_by(student_id=user.id, status='graded').all()
        stats = {'total_classes': len(all_c), 'total_assignments': total_a,
                 'submitted': submitted, 'graded': len(graded_subs)}
    else:
        total_students = sum(len(c.members) for c in all_c)
        pending = 0
        if cids:
            aids = [a.id for a in Assignment.query.filter(Assignment.classroom_id.in_(cids)).all()]
            if aids:
                pending = Submission.query.filter_by(status='submitted').filter(Submission.assignment_id.in_(aids)).count()
        stats = {'total_classes': len(all_c), 'total_assignments': total_a,
                 'total_students': total_students, 'pending_submissions': pending}

    unread = Notification.query.filter_by(user_id=user.id, is_read=False).count()

    return jsonify({
        'classrooms': [c.to_dict() for c in all_c[:8]],
        'upcoming_deadlines': [a.to_dict() for a in upcoming],
        'recent_announcements': [a.to_dict() for a in recent_ann],
        'upcoming_schedules': sched_data,
        'stats': stats, 'unread_notifications': unread,
        'xp': user.xp, 'level': user.level, 'streak_days': user.streak_days
    })

# ═══════════════════════ USERS ═══════════════════════

@api_bp.route('/api/users', methods=['GET'])
@token_required
def search_users():
    q = request.args.get('q', '').strip()
    if len(q) < 2: return jsonify({'users': []})
    users = User.query.filter((User.username.ilike(f'%{q}%'))|(User.email.ilike(f'%{q}%'))|
        (User.first_name.ilike(f'%{q}%'))).limit(20).all()
    return jsonify({'users': [u.to_dict() for u in users]})

@api_bp.route('/api/users/<int:uid>', methods=['GET'])
@token_required
def get_user(uid):
    return jsonify({'user': User.query.get_or_404(uid).to_dict()})
