"""
Authentication API routes for Virtual Classroom.
Handles registration, login, profile management.
"""

from flask import Blueprint, request, jsonify, g, current_app
from models import db, User
from utils import token_required
import jwt
import datetime

auth_bp = Blueprint('auth', __name__)


@auth_bp.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'student')
    first_name = data.get('first_name', '').strip()
    last_name = data.get('last_name', '').strip()

    if not username or not email or not password:
        return jsonify({'error': 'Username, email, and password are required'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if role not in ('student', 'teacher'):
        return jsonify({'error': 'Role must be student or teacher'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already taken'}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 409

    user = User(
        username=username,
        email=email,
        role=role,
        first_name=first_name,
        last_name=last_name
    )
    user.set_password(password)

    db.session.add(user)
    db.session.commit()

    # Generate JWT token
    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, current_app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({
        'message': 'Registration successful',
        'token': token,
        'user': user.to_dict()
    }), 201


@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    """Login user."""
    data = request.get_json()

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()

    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid email or password'}), 401

    user.is_online = True
    user.last_seen = datetime.datetime.utcnow()
    db.session.commit()

    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(days=7)
    }, current_app.config['SECRET_KEY'], algorithm='HS256')

    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': user.to_dict()
    })


@auth_bp.route('/api/auth/me', methods=['GET'])
@token_required
def get_profile():
    """Get current user profile."""
    return jsonify({'user': g.current_user.to_dict()})


@auth_bp.route('/api/auth/profile', methods=['PUT'])
@token_required
def update_profile():
    """Update user profile."""
    data = request.get_json()
    user = g.current_user

    if 'first_name' in data:
        user.first_name = data['first_name'].strip()
    if 'last_name' in data:
        user.last_name = data['last_name'].strip()
    if 'bio' in data:
        user.bio = data['bio'].strip()
    if 'avatar' in data:
        user.avatar = data['avatar'].strip()

    db.session.commit()
    return jsonify({'message': 'Profile updated', 'user': user.to_dict()})


@auth_bp.route('/api/auth/password', methods=['PUT'])
@token_required
def change_password():
    """Change user password."""
    data = request.get_json()
    user = g.current_user

    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not user.check_password(current_password):
        return jsonify({'error': 'Current password is incorrect'}), 400

    if len(new_password) < 6:
        return jsonify({'error': 'New password must be at least 6 characters'}), 400

    user.set_password(new_password)
    db.session.commit()

    return jsonify({'message': 'Password changed successfully'})
