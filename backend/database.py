import sqlite3
from pathlib import Path
from datetime import datetime
from typing import Optional

DB_PATH = Path(__file__).parent / "podcraft.db"


def _get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _get_conn()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS podcasts (
                id TEXT PRIMARY KEY,
                title TEXT,
                duration TEXT,
                date TEXT,
                language TEXT,
                materials INTEGER DEFAULT 0,
                audio_path TEXT,
                script TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


def get_podcasts() -> list:
    conn = _get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM podcasts ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_podcast_by_id(podcast_id: str) -> Optional[dict]:
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM podcasts WHERE id = ?", (podcast_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def save_podcast(data: dict):
    conn = _get_conn()
    try:
        conn.execute("""
            INSERT OR REPLACE INTO podcasts
                (id, title, duration, date, language, materials, audio_path, script, created_at)
            VALUES
                (:id, :title, :duration, :date, :language, :materials, :audio_path, :script, :created_at)
        """, {
            "id": data.get("id"),
            "title": data.get("title", ""),
            "duration": data.get("duration", ""),
            "date": data.get("date", datetime.now().strftime("%Y-%m-%d")),
            "language": data.get("language", "中文"),
            "materials": data.get("materials", 0),
            "audio_path": data.get("audio_path", ""),
            "script": data.get("script", ""),
            "created_at": data.get("created_at", datetime.now().isoformat()),
        })
        conn.commit()
    finally:
        conn.close()


def delete_podcast(podcast_id: str):
    conn = _get_conn()
    try:
        conn.execute("DELETE FROM podcasts WHERE id = ?", (podcast_id,))
        conn.commit()
    finally:
        conn.close()
