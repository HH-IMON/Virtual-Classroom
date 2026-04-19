"""
Virtual Classroom – Enhanced Main Application
Flask + SocketIO + MySQL/SQLite support + advanced features
"""

import os, json, datetime
from flask import Flask, request, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
from models import db, User, Classroom, ClassroomMember, Message, PrivateMessage, Notification, Attendance
from auth_routes import auth_bp
from api_routes import api_bp

# ── App Factory ──────────────────────────────────────

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'virtual-classroom-secret-key-2024')

# Database Configuration — Railway provides DATABASE_URL (PostgreSQL)
DATABASE_URL = os.environ.get('DATABASE_URL', '')
if not DATABASE_URL:
    # Local fallback: SQLite
    DATABASE_URL = 'sqlite:///virtual_classroom.db'
    print('[DB] Using local SQLite database')
elif DATABASE_URL.startswith('postgres://'):
    # Railway/Heroku use "postgres://" but SQLAlchemy requires "postgresql://"
    DATABASE_URL = DATABASE_URL.replace('postgres://', 'postgresql://', 1)
    print('[DB] Using PostgreSQL database')
else:
    print(f'[DB] Using database: {DATABASE_URL[:30]}...')

app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Init DB
db.init_app(app)
app.register_blueprint(auth_bp)
app.register_blueprint(api_bp)

# ── Routes ──────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('templates', 'index.html')

# ── SocketIO Events ──────────────────────────────────

@socketio.on('connect')
def handle_connect():
    from flask import request as req
    print(f'Client connected: {req.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('authenticate')
def handle_authenticate(data):
    token = data.get('token')
    if token:
        from utils import decode_token
        payload = decode_token(token)
        if payload:
            user = User.query.get(payload.get('user_id'))
            if user:
                user.is_online = True
                user.last_seen = datetime.datetime.utcnow()
                db.session.commit()

# ── Chat Events ──────────────────────────────────────

@socketio.on('join_room')
def handle_join_room(data):
    classroom_id = data.get('classroom_id')
    if classroom_id:
        join_room(f'classroom_{classroom_id}')

@socketio.on('leave_room')
def handle_leave_room(data):
    classroom_id = data.get('classroom_id')
    if classroom_id:
        leave_room(f'classroom_{classroom_id}')

@socketio.on('send_message')
def handle_send_message(data):
    classroom_id = data.get('classroom_id')
    content = data.get('content', '').strip()
    if not classroom_id or not content:
        return

    from flask import request as req
    token = data.get('token', '')
    sender_id = data.get('sender_id')
    sender_name = data.get('sender_name', 'User')

    # Try to identify user from authenticated sessions
    try:
        # Get user from recent activity or data
        if sender_id:
            user = User.query.get(sender_id)
        else:
            user = None
            # Try all connected users' most recent ones
            users = User.query.filter_by(is_online=True).all()
            if users:
                user = users[0]

        if user:
            sender_id = user.id
            sender_name = user.username
    except:
        pass

    msg = Message(
        classroom_id=classroom_id,
        sender_id=sender_id or 1,
        content=content,
        message_type=data.get('message_type', 'text'),
        file_path=data.get('file_path', ''),
        file_name=data.get('file_name', '')
    )
    db.session.add(msg)
    db.session.commit()

    emit('new_message', msg.to_dict(), room=f'classroom_{classroom_id}')

@socketio.on('send_private_message')
def handle_send_private_message(data):
    receiver_id = data.get('receiver_id')
    content = data.get('content', '').strip()
    sender_id = data.get('sender_id', 1)

    if not receiver_id or not content:
        return

    msg = PrivateMessage(
        sender_id=sender_id,
        receiver_id=receiver_id,
        content=content,
        message_type=data.get('message_type', 'text')
    )
    db.session.add(msg)
    db.session.commit()

    emit('new_private_message', msg.to_dict(), broadcast=True)

@socketio.on('typing')
def handle_typing(data):
    classroom_id = data.get('classroom_id')
    if classroom_id:
        emit('user_typing', {'username': data.get('username', '')}, room=f'classroom_{classroom_id}', include_self=False)

@socketio.on('stop_typing')
def handle_stop_typing(data):
    classroom_id = data.get('classroom_id')
    if classroom_id:
        emit('user_stop_typing', {'username': data.get('username', '')}, room=f'classroom_{classroom_id}', include_self=False)

# ── Video Events ──────────────────────────────────────

video_rooms = {}

@socketio.on('join_video_room')
def handle_join_video_room(data):
    from flask import request as req
    classroom_id = str(data.get('classroom_id'))
    username = data.get('username', 'User')
    room = f'video_{classroom_id}'
    join_room(room)

    if room not in video_rooms:
        video_rooms[room] = []
    video_rooms[room].append({'sid': req.sid, 'username': username})

    emit('video_room_state', {'participants': video_rooms[room]}, room=room)
    emit('participant_joined', {'username': username, 'sid': req.sid}, room=room, include_self=False)

    # Record attendance
    try:
        user = User.query.filter_by(username=username).first()
        if user:
            today = datetime.date.today().isoformat()
            existing = Attendance.query.filter_by(user_id=user.id, classroom_id=int(classroom_id), date=today).first()
            if not existing:
                db.session.add(Attendance(user_id=user.id, classroom_id=int(classroom_id), date=today, status='present'))
                db.session.commit()
    except:
        pass

@socketio.on('leave_video_room')
def handle_leave_video_room(data):
    from flask import request as req
    classroom_id = str(data.get('classroom_id'))
    room = f'video_{classroom_id}'
    leave_room(room)

    if room in video_rooms:
        video_rooms[room] = [p for p in video_rooms[room] if p['sid'] != req.sid]
        if not video_rooms[room]:
            del video_rooms[room]
        else:
            emit('video_room_state', {'participants': video_rooms[room]}, room=room)
    emit('participant_left', {'username': data.get('username', 'User'), 'sid': req.sid}, room=room)

@socketio.on('audio_toggle')
def handle_audio_toggle(data):
    room = f'video_{data.get("classroom_id")}'
    emit('audio_toggled', data, room=room, include_self=False)

@socketio.on('video_toggle')
def handle_video_toggle(data):
    room = f'video_{data.get("classroom_id")}'
    emit('video_toggled', data, room=room, include_self=False)

@socketio.on('raise_hand')
def handle_raise_hand(data):
    room = f'video_{data.get("classroom_id")}'
    emit('hand_raised', data, room=room, include_self=False)

# ── WebRTC Signaling ──────────────────────────────────

@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    from flask import request as req
    emit('webrtc_offer', {'offer': data['offer'], 'from_sid': req.sid}, room=data['to_sid'])

@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    from flask import request as req
    emit('webrtc_answer', {'answer': data['answer'], 'from_sid': req.sid}, room=data['to_sid'])

@socketio.on('webrtc_ice_candidate')
def handle_ice_candidate(data):
    from flask import request as req
    emit('webrtc_ice_candidate', {'candidate': data['candidate'], 'from_sid': req.sid}, room=data['to_sid'])

# ── Whiteboard Events ──────────────────────────────────

@socketio.on('whiteboard_draw')
def handle_whiteboard_draw(data):
    emit('whiteboard_draw', data, broadcast=True, include_self=False)

@socketio.on('whiteboard_clear')
def handle_whiteboard_clear(data):
    emit('whiteboard_clear', {}, broadcast=True, include_self=False)

# ── Quiz Events ──────────────────────────────────────

@socketio.on('launch_quiz_question')
def handle_launch_quiz(data):
    room = f'video_{data.get("classroom_id")}' if data.get('classroom_id') else None
    if room:
        emit('quiz_question', data, room=room)

# ── Create Sample Data ──────────────────────────────────

def create_sample_data():
    """Create demo users, classes, assignments, and sample data."""
    if User.query.first():
        return

    print('[Setup] Creating sample data...')

    # Users
    teacher = User(username='teacher', email='teacher@demo.com', role='teacher',
                   first_name='John', last_name='Smith', bio='Computer Science Teacher', xp=250, level=1, streak_days=5)
    teacher.set_password('password123')
    student1 = User(username='student', email='student@demo.com', role='student',
                    first_name='Alice', last_name='Johnson', bio='CS Student', xp=150, level=1, streak_days=3)
    student1.set_password('password123')
    student2 = User(username='jane', email='jane@demo.com', role='student',
                    first_name='Jane', last_name='Doe', bio='Engineering Student', xp=100, level=1)
    student2.set_password('password123')

    db.session.add_all([teacher, student1, student2])
    db.session.commit()

    # Classes
    from models import Classroom, ClassroomMember, Assignment, Announcement, ClassSchedule
    c1 = Classroom(name='Web Development 101', description='Learn HTML, CSS, JavaScript and modern frameworks.',
                   subject='Computer Science', section='Section A', teacher_id=teacher.id, cover_color='#6366f1')
    c2 = Classroom(name='Data Science Fundamentals', description='Statistics, Python, and machine learning basics.',
                   subject='Data Science', section='Section B', teacher_id=teacher.id, cover_color='#06b6d4')
    db.session.add_all([c1, c2])
    db.session.commit()

    # Enroll students
    db.session.add_all([
        ClassroomMember(classroom_id=c1.id, user_id=student1.id),
        ClassroomMember(classroom_id=c1.id, user_id=student2.id),
        ClassroomMember(classroom_id=c2.id, user_id=student1.id)
    ])

    # Assignments
    a1 = Assignment(classroom_id=c1.id, title='Build a Portfolio Website',
                    description='Create a personal portfolio using HTML, CSS and JavaScript.',
                    due_date=datetime.datetime.utcnow() + datetime.timedelta(days=7),
                    points=100, assignment_type='assignment')
    a2 = Assignment(classroom_id=c1.id, title='JavaScript Quiz',
                    description='Test your JavaScript fundamentals.',
                    due_date=datetime.datetime.utcnow() + datetime.timedelta(days=3),
                    points=50, assignment_type='quiz')
    a3 = Assignment(classroom_id=c2.id, title='Python Data Analysis',
                    description='Analyze the provided dataset using pandas.',
                    due_date=datetime.datetime.utcnow() + datetime.timedelta(days=14),
                    points=100, assignment_type='assignment')
    db.session.add_all([a1, a2, a3])

    # Announcements
    db.session.add_all([
        Announcement(classroom_id=c1.id, author_id=teacher.id,
                     content='Welcome to Web Development 101! Please review the syllabus and introduce yourself in the discussion.'),
        Announcement(classroom_id=c2.id, author_id=teacher.id,
                     content='Data Science class starts this week. Make sure Python is installed on your machine.')
    ])

    # Scheduled classes
    db.session.add_all([
        ClassSchedule(classroom_id=c1.id, title='HTML & CSS Basics',
                      description='Introduction to web structure and styling',
                      start_time=datetime.datetime.utcnow() + datetime.timedelta(hours=2),
                      end_time=datetime.datetime.utcnow() + datetime.timedelta(hours=3)),
        ClassSchedule(classroom_id=c2.id, title='Python Fundamentals',
                      description='Getting started with Python programming',
                      start_time=datetime.datetime.utcnow() + datetime.timedelta(days=1),
                      end_time=datetime.datetime.utcnow() + datetime.timedelta(days=1, hours=1.5))
    ])

    # Notifications
    db.session.add_all([
        Notification(user_id=student1.id, title='Welcome!', content='Welcome to Virtual Classroom!', notification_type='info'),
        Notification(user_id=student1.id, title='New Assignment', content='Web Dev: Build a Portfolio', notification_type='assignment', link='#/classroom/1')
    ])

    db.session.commit()
    print('[Setup] Sample data created successfully!')
    print(f'  -> Teacher: teacher@demo.com / password123')
    print(f'  -> Student: student@demo.com / password123')

# ── Run ──────────────────────────────────────────

with app.app_context():
    db.create_all()
    create_sample_data()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print('\n========================================')
    print('  Virtual Classroom - Smart Platform')
    print(f'  http://localhost:{port}')
    print('========================================\n')
    socketio.run(app, host='0.0.0.0', port=port, debug=True)
