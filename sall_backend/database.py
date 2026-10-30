import sqlite3
import os

DB_PATH = os.getenv("SALL_DB_PATH", "sall_conversations.db")

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS conversations (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL,
            databases   TEXT NOT NULL DEFAULT '[]',
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
            id             TEXT PRIMARY KEY,
            conv_id        TEXT NOT NULL,
            role           TEXT NOT NULL,
            content        TEXT NOT NULL DEFAULT '',
            pipeline_steps TEXT NOT NULL DEFAULT '[]',
            figures        TEXT NOT NULL DEFAULT '[]',
            created_at     TEXT NOT NULL,
            FOREIGN KEY (conv_id) REFERENCES conversations(id)
        );

        CREATE INDEX IF NOT EXISTS idx_messages_conv
            ON messages(conv_id);
        CREATE INDEX IF NOT EXISTS idx_conv_updated
            ON conversations(updated_at DESC);
    """)
    db.commit()
    db.close()
