# 🎓 Virtual Classroom - Smart Learning Platform

A full-featured virtual classroom platform built with Flask, SocketIO, and modern web technologies.

## ✨ Features

- **Real-time Chat & Video** — Live classroom sessions with WebRTC
- **Assignments & Grading** — Create, submit, and grade assignments with file uploads
- **Live Quizzes** — Interactive quizzes with leaderboards
- **Discussion Threads** — Forum-style class discussions
- **AI Teaching Assistant** — Powered by Google Gemini
- **Gamification** — XP, levels, streaks, badges, and daily challenges
- **Scheduling** — Class schedules with notifications
- **Whiteboard** — Collaborative real-time whiteboard
- **Todo & Bookmarks** — Personal productivity tools

## 🚀 Quick Start (Local)

```bash
pip install -r requirements.txt
python app.py
```

Visit `http://localhost:5000`

**Demo Accounts:**
- Teacher: `teacher@demo.com` / `password123`
- Student: `student@demo.com` / `password123`

## 🌐 Deploy on Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Add a **PostgreSQL** plugin from the dashboard
4. Set environment variables (see below)
5. Deploy!

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Auto-set by Railway PostgreSQL plugin | ✅ Auto |
| `SECRET_KEY` | Flask secret key | ✅ Set manually |
| `GEMINI_API_KEY` | Google Gemini API key for AI assistant | Optional |
| `PORT` | Server port | ✅ Auto |

## 🛠 Tech Stack

- **Backend:** Flask, Flask-SocketIO, SQLAlchemy
- **Database:** PostgreSQL (production) / SQLite (local)
- **Real-time:** Socket.IO, WebRTC
- **AI:** Google Gemini API
- **Server:** Gunicorn + Eventlet
