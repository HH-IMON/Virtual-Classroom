"""
Database models for Virtual Classroom - Enhanced Edition
Includes models for gamification, scheduling, quizzes, AI, todos, whiteboard, threads.
Supports MySQL (primary) and SQLite (fallback).
"""

from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
import uuid, json

db = SQLAlchemy()

def gen_code():
    return uuid.uuid4().hex[:6].upper()

# ═══════════════════════ USERS ═══════════════════════

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), default='student')
    first_name = db.Column(db.String(50), default='')
    last_name = db.Column(db.String(50), default='')
    avatar = db.Column(db.String(256), default='')
    bio = db.Column(db.Text, default='')
    is_online = db.Column(db.Boolean, default=False)
    last_seen = db.Column(db.DateTime, default=datetime.utcnow)
    xp = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    streak_days = db.Column(db.Integer, default=0)
    last_active_date = db.Column(db.String(10), default='')
    badges = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    taught_classes = db.relationship('Classroom', backref='teacher', lazy=True)
    memberships = db.relationship('ClassroomMember', backref='user', lazy=True)
    submissions = db.relationship('Submission', backref='student', lazy=True)
    notifications = db.relationship('Notification', backref='user', lazy=True)
    todos = db.relationship('TodoItem', backref='user', lazy=True)
    bookmarks = db.relationship('Bookmark', backref='user', lazy=True)

    def set_password(self, p):
        self.password_hash = generate_password_hash(p)
    def check_password(self, p):
        return check_password_hash(self.password_hash, p)
    def get_badges(self):
        try: return json.loads(self.badges or '[]')
        except: return []
    def add_badge(self, badge):
        b = self.get_badges()
        if badge not in b:
            b.append(badge)
            self.badges = json.dumps(b)
    def add_xp(self, amount):
        self.xp += amount
        self.level = 1 + self.xp // 500
    def to_dict(self):
        return {
            'id': self.id, 'username': self.username, 'email': self.email,
            'role': self.role, 'first_name': self.first_name, 'last_name': self.last_name,
            'avatar': self.avatar, 'bio': self.bio, 'is_online': self.is_online,
            'xp': self.xp, 'level': self.level, 'streak_days': self.streak_days,
            'badges': self.get_badges(),
            'last_seen': self.last_seen.isoformat() if self.last_seen else None,
            'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ CLASSROOMS ═══════════════════════

class Classroom(db.Model):
    __tablename__ = 'classrooms'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    subject = db.Column(db.String(100), default='')
    section = db.Column(db.String(50), default='')
    code = db.Column(db.String(10), unique=True, nullable=False, default=gen_code)
    teacher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    cover_color = db.Column(db.String(7), default='#6366f1')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    members = db.relationship('ClassroomMember', backref='classroom', lazy=True, cascade='all, delete-orphan')
    assignments = db.relationship('Assignment', backref='classroom', lazy=True, cascade='all, delete-orphan')
    announcements = db.relationship('Announcement', backref='classroom', lazy=True, cascade='all, delete-orphan')
    messages = db.relationship('Message', backref='classroom', lazy=True, cascade='all, delete-orphan')
    resources = db.relationship('Resource', backref='classroom', lazy=True, cascade='all, delete-orphan')
    schedules = db.relationship('ClassSchedule', backref='classroom', lazy=True, cascade='all, delete-orphan')
    quizzes = db.relationship('LiveQuiz', backref='classroom', lazy=True, cascade='all, delete-orphan')
    threads = db.relationship('Thread', backref='classroom', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'name': self.name, 'description': self.description,
            'subject': self.subject, 'section': self.section, 'code': self.code,
            'teacher_id': self.teacher_id,
            'teacher_name': self.teacher.username if self.teacher else '',
            'cover_color': self.cover_color, 'member_count': len(self.members),
            'created_at': self.created_at.isoformat()
        }

class ClassroomMember(db.Model):
    __tablename__ = 'classroom_members'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    joined_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('classroom_id', 'user_id'),)

# ═══════════════════════ ASSIGNMENTS ═══════════════════════

class Assignment(db.Model):
    __tablename__ = 'assignments'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    due_date = db.Column(db.DateTime, nullable=True)
    points = db.Column(db.Integer, default=100)
    assignment_type = db.Column(db.String(20), default='assignment')
    file_path = db.Column(db.String(500), default='')
    file_name = db.Column(db.String(200), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    submissions = db.relationship('Submission', backref='assignment', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id, 'title': self.title,
            'description': self.description,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'points': self.points, 'assignment_type': self.assignment_type,
            'file_path': self.file_path, 'file_name': self.file_name,
            'submission_count': len(self.submissions),
            'created_at': self.created_at.isoformat()
        }

class Submission(db.Model):
    __tablename__ = 'submissions'
    id = db.Column(db.Integer, primary_key=True)
    assignment_id = db.Column(db.Integer, db.ForeignKey('assignments.id'), nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, default='')
    file_path = db.Column(db.String(500), default='')
    file_name = db.Column(db.String(200), default='')
    grade = db.Column(db.Integer, nullable=True)
    feedback = db.Column(db.Text, default='')
    status = db.Column(db.String(20), default='submitted')
    submitted_at = db.Column(db.DateTime, default=datetime.utcnow)
    __table_args__ = (db.UniqueConstraint('assignment_id', 'student_id'),)

    def to_dict(self):
        return {
            'id': self.id, 'assignment_id': self.assignment_id,
            'student_id': self.student_id,
            'student_name': self.student.username if self.student else '',
            'content': self.content, 'file_path': self.file_path,
            'file_name': self.file_name,
            'grade': self.grade, 'feedback': self.feedback, 'status': self.status,
            'submitted_at': self.submitted_at.isoformat()
        }

# ═══════════════════════ ANNOUNCEMENTS ═══════════════════════

class Announcement(db.Model):
    __tablename__ = 'announcements'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    author = db.relationship('User', backref='announcements')

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'author_id': self.author_id,
            'author_name': self.author.username if self.author else '',
            'content': self.content, 'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ MESSAGES & THREADS ═══════════════════════

class Message(db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    message_type = db.Column(db.String(20), default='text')
    file_path = db.Column(db.String(500), default='')
    file_name = db.Column(db.String(200), default='')
    is_pinned = db.Column(db.Boolean, default=False)
    reply_to = db.Column(db.Integer, nullable=True)
    reactions = db.Column(db.Text, default='{}')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sender = db.relationship('User', backref='messages')

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'sender_id': self.sender_id,
            'sender_name': self.sender.username if self.sender else '',
            'content': self.content, 'message_type': self.message_type,
            'file_path': self.file_path, 'file_name': self.file_name,
            'is_pinned': self.is_pinned, 'reply_to': self.reply_to,
            'reactions': json.loads(self.reactions or '{}'),
            'created_at': self.created_at.isoformat()
        }

class PrivateMessage(db.Model):
    __tablename__ = 'private_messages'
    id = db.Column(db.Integer, primary_key=True)
    sender_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    receiver_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    message_type = db.Column(db.String(20), default='text')
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    sender = db.relationship('User', foreign_keys=[sender_id], backref='sent_msgs')
    receiver = db.relationship('User', foreign_keys=[receiver_id], backref='recv_msgs')

    def to_dict(self):
        return {
            'id': self.id, 'sender_id': self.sender_id, 'receiver_id': self.receiver_id,
            'sender_name': self.sender.username if self.sender else '',
            'content': self.content, 'message_type': self.message_type,
            'is_read': self.is_read, 'created_at': self.created_at.isoformat()
        }

class Thread(db.Model):
    __tablename__ = 'threads'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    is_pinned = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    author = db.relationship('User', backref='threads')
    replies = db.relationship('ThreadReply', backref='thread', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'author_id': self.author_id,
            'author_name': self.author.username if self.author else '',
            'title': self.title, 'content': self.content, 'is_pinned': self.is_pinned,
            'reply_count': len(self.replies),
            'created_at': self.created_at.isoformat()
        }

class ThreadReply(db.Model):
    __tablename__ = 'thread_replies'
    id = db.Column(db.Integer, primary_key=True)
    thread_id = db.Column(db.Integer, db.ForeignKey('threads.id'), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    author = db.relationship('User', backref='thread_replies')

    def to_dict(self):
        return {
            'id': self.id, 'thread_id': self.thread_id,
            'author_id': self.author_id,
            'author_name': self.author.username if self.author else '',
            'content': self.content, 'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ SCHEDULING ═══════════════════════

class ClassSchedule(db.Model):
    __tablename__ = 'class_schedules'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    start_time = db.Column(db.DateTime, nullable=False)
    end_time = db.Column(db.DateTime, nullable=False)
    recurring = db.Column(db.String(20), default='none')
    meeting_link = db.Column(db.String(500), default='')
    is_active = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'title': self.title, 'description': self.description,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'recurring': self.recurring, 'meeting_link': self.meeting_link,
            'is_active': self.is_active, 'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ LIVE QUIZZES ═══════════════════════

class LiveQuiz(db.Model):
    __tablename__ = 'live_quizzes'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    status = db.Column(db.String(20), default='draft')
    current_question = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    questions = db.relationship('QuizQuestion', backref='quiz', lazy=True, cascade='all, delete-orphan')
    responses = db.relationship('QuizResponse', backref='quiz', lazy=True, cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'title': self.title, 'status': self.status,
            'current_question': self.current_question,
            'question_count': len(self.questions),
            'questions': [q.to_dict() for q in self.questions],
            'created_at': self.created_at.isoformat()
        }

class QuizQuestion(db.Model):
    __tablename__ = 'quiz_questions'
    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('live_quizzes.id'), nullable=False)
    question_text = db.Column(db.Text, nullable=False)
    options = db.Column(db.Text, nullable=False, default='[]')
    correct_answer = db.Column(db.Integer, default=0)
    time_limit = db.Column(db.Integer, default=30)
    order_num = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id, 'quiz_id': self.quiz_id,
            'question_text': self.question_text,
            'options': json.loads(self.options or '[]'),
            'correct_answer': self.correct_answer,
            'time_limit': self.time_limit, 'order_num': self.order_num
        }

class QuizResponse(db.Model):
    __tablename__ = 'quiz_responses'
    id = db.Column(db.Integer, primary_key=True)
    quiz_id = db.Column(db.Integer, db.ForeignKey('live_quizzes.id'), nullable=False)
    question_id = db.Column(db.Integer, db.ForeignKey('quiz_questions.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    answer = db.Column(db.Integer, default=-1)
    is_correct = db.Column(db.Boolean, default=False)
    time_taken = db.Column(db.Float, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'quiz_id': self.quiz_id, 'question_id': self.question_id,
            'user_id': self.user_id, 'answer': self.answer,
            'is_correct': self.is_correct, 'time_taken': self.time_taken
        }

# ═══════════════════════ RESOURCES ═══════════════════════

class Resource(db.Model):
    __tablename__ = 'resources'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    uploader_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    file_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(50), default='')
    file_size = db.Column(db.Integer, default=0)
    folder = db.Column(db.String(100), default='General')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    uploader = db.relationship('User', backref='resources')

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'uploader_id': self.uploader_id,
            'uploader_name': self.uploader.username if self.uploader else '',
            'title': self.title, 'file_path': self.file_path,
            'file_type': self.file_type, 'file_size': self.file_size,
            'folder': self.folder, 'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ NOTIFICATIONS ═══════════════════════

class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, default='')
    notification_type = db.Column(db.String(30), default='info')
    link = db.Column(db.String(200), default='')
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'user_id': self.user_id, 'title': self.title,
            'content': self.content, 'notification_type': self.notification_type,
            'link': self.link, 'is_read': self.is_read,
            'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ GAMIFICATION ═══════════════════════

class LeaderboardEntry(db.Model):
    __tablename__ = 'leaderboard'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=True)
    points = db.Column(db.Integer, default=0)
    week = db.Column(db.String(10), default='')
    user = db.relationship('User', backref='leaderboard_entries')

class Achievement(db.Model):
    __tablename__ = 'achievements'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(200), default='')
    icon = db.Column(db.String(50), default='award')
    earned_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'user_id': self.user_id, 'title': self.title,
            'description': self.description, 'icon': self.icon,
            'earned_at': self.earned_at.isoformat()
        }

class DailyChallenge(db.Model):
    __tablename__ = 'daily_challenges'
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, default='')
    xp_reward = db.Column(db.Integer, default=50)
    challenge_type = db.Column(db.String(30), default='daily')
    date = db.Column(db.String(10), default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'description': self.description,
            'xp_reward': self.xp_reward, 'challenge_type': self.challenge_type,
            'date': self.date
        }

class ChallengeCompletion(db.Model):
    __tablename__ = 'challenge_completions'
    id = db.Column(db.Integer, primary_key=True)
    challenge_id = db.Column(db.Integer, db.ForeignKey('daily_challenges.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    completed_at = db.Column(db.DateTime, default=datetime.utcnow)

# ═══════════════════════ PRODUCTIVITY ═══════════════════════

class TodoItem(db.Model):
    __tablename__ = 'todo_items'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    text = db.Column(db.String(500), nullable=False)
    is_done = db.Column(db.Boolean, default=False)
    priority = db.Column(db.String(10), default='medium')
    due_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'user_id': self.user_id, 'text': self.text,
            'is_done': self.is_done, 'priority': self.priority,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'created_at': self.created_at.isoformat()
        }

class Bookmark(db.Model):
    __tablename__ = 'bookmarks'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    link = db.Column(db.String(500), nullable=False)
    bookmark_type = db.Column(db.String(30), default='lecture')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'title': self.title, 'link': self.link,
            'bookmark_type': self.bookmark_type,
            'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ AI NOTES ═══════════════════════

class AINote(db.Model):
    __tablename__ = 'ai_notes'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=False)
    key_points = db.Column(db.Text, default='[]')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'title': self.title, 'content': self.content,
            'key_points': json.loads(self.key_points or '[]'),
            'created_at': self.created_at.isoformat()
        }

# ═══════════════════════ ATTENDANCE ═══════════════════════

class Attendance(db.Model):
    __tablename__ = 'attendance'
    id = db.Column(db.Integer, primary_key=True)
    classroom_id = db.Column(db.Integer, db.ForeignKey('classrooms.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    date = db.Column(db.String(10), nullable=False)
    status = db.Column(db.String(10), default='present')
    duration_minutes = db.Column(db.Integer, default=0)

    def to_dict(self):
        return {
            'id': self.id, 'classroom_id': self.classroom_id,
            'user_id': self.user_id, 'date': self.date,
            'status': self.status, 'duration_minutes': self.duration_minutes
        }
