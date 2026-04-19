"""
Utility functions for Virtual Classroom application.
Includes JWT authentication decorator and helper functions.
"""

from functools import wraps
from flask import request, jsonify, g, current_app
import jwt
import os


def token_required(f):
    """Decorator to require valid JWT token for API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        auth_header = request.headers.get('Authorization', '')

        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

        if not token:
            return jsonify({'error': 'Authentication token is required'}), 401

        try:
            from models import User
            data = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
            g.current_user = User.query.get(data['user_id'])
            if not g.current_user:
                return jsonify({'error': 'User not found'}), 401
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated


def decode_token(token):
    """Decode JWT token and return payload or None."""
    try:
        from flask import current_app
        return jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
    except:
        return None


def teacher_required(f):
    """Decorator to require teacher role."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if g.current_user.role != 'teacher':
            return jsonify({'error': 'Teacher access required'}), 403
        return f(*args, **kwargs)
    return decorated


def allowed_file(filename):
    """Check if file extension is allowed."""
    ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
                          'txt', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'mp3', 'zip'}
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_type(filename):
    """Get file type category from filename."""
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    type_map = {
        'pdf': 'document', 'doc': 'document', 'docx': 'document', 'txt': 'document',
        'ppt': 'presentation', 'pptx': 'presentation',
        'xls': 'spreadsheet', 'xlsx': 'spreadsheet',
        'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image',
        'mp4': 'video', 'mp3': 'audio',
        'zip': 'archive'
    }
    return type_map.get(ext, 'other')


def ensure_upload_dir(app):
    """Ensure upload directory exists."""
    upload_dir = app.config.get('UPLOAD_FOLDER', os.path.join(app.root_path, 'static', 'uploads'))
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir
