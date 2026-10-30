from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from contextlib import asynccontextmanager
import asyncio, json, uuid
from datetime import datetime

from database import init_db, get_db
from models import (
    ConversationCreate, ConversationOut,
    MessageCreate, DatabaseSelection
)
from pipeline import run_pipeline
from pydantic import BaseModel
from sqlalchemy import create_engine, text

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    try:   # préchauffe le modèle d'embedding (sinon la 1re question attend ~30 s)
        from pipeline import _get_collection
        await asyncio.to_thread(_get_collection)
    except Exception as e:
        print(f"[SALL] RAG indisponible au démarrage : {e}")
    yield

app = FastAPI(title="SALL API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ════════════════════════════════════════════════════════════════
#  CONVERSATIONS
# ════════════════════════════════════════════════════════════════

@app.get("/conversations", response_model=list[ConversationOut])
def list_conversations():
    db   = get_db()
    rows = db.execute(
        "SELECT * FROM conversations ORDER BY updated_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


@app.post("/conversations", response_model=ConversationOut)
def create_conversation(body: ConversationCreate):
    db  = get_db()
    cid = str(uuid.uuid4())
    now = datetime.utcnow().isoformat()
    db.execute(
        "INSERT INTO conversations (id,title,databases,created_at,updated_at) VALUES (?,?,?,?,?)",
        (cid, body.title, json.dumps(body.databases), now, now)
    )
    db.commit()
    return {"id": cid, "title": body.title,
            "databases": body.databases, "created_at": now, "updated_at": now}


@app.get("/conversations/{conv_id}", response_model=ConversationOut)
def get_conversation(conv_id: str):
    db  = get_db()
    row = db.execute(
        "SELECT * FROM conversations WHERE id=?", (conv_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv = dict(row)
    conv["databases"] = json.loads(conv["databases"])
    conv["messages"]  = [
        dict(m) for m in db.execute(
            "SELECT * FROM messages WHERE conv_id=? ORDER BY created_at",
            (conv_id,)
        ).fetchall()
    ]
    return conv


@app.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str):
    db = get_db()
    db.execute("DELETE FROM messages WHERE conv_id=?", (conv_id,))
    db.execute("DELETE FROM conversations WHERE id=?", (conv_id,))
    db.commit()
    return {"deleted": conv_id}


# ════════════════════════════════════════════════════════════════
#  MESSAGES + STREAM SSE
# ════════════════════════════════════════════════════════════════

# ── Modèle étendu : inclut db_configs depuis la navbar ──────────
class MessageWithDbConfigs(BaseModel):
    content:    str
    db_configs: list[dict] = []   # ← configs DB depuis l'icône utilisateur


@app.post("/conversations/{conv_id}/message")
async def send_message(conv_id: str, body: MessageWithDbConfigs):
    db  = get_db()
    row = db.execute(
        "SELECT * FROM conversations WHERE id=?", (conv_id,)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    now         = datetime.utcnow().isoformat()
    user_msg_id = str(uuid.uuid4())
    sall_msg_id = str(uuid.uuid4())

    db.execute(
        "INSERT INTO messages (id,conv_id,role,content,created_at) VALUES (?,?,'user',?,?)",
        (user_msg_id, conv_id, body.content, now)
    )
    db.execute(
        "INSERT INTO messages (id,conv_id,role,content,pipeline_steps,created_at) VALUES (?,?,'assistant','','[]',?)",
        (sall_msg_id, conv_id, now)
    )

    # Mettre à jour le titre si premier message
    msg_count = db.execute(
        "SELECT COUNT(*) FROM messages WHERE conv_id=?", (conv_id,)
    ).fetchone()[0]
    if msg_count <= 2:
        title = body.content[:50] + ("..." if len(body.content) > 50 else "")
        db.execute(
            "UPDATE conversations SET title=?, updated_at=? WHERE id=?",
            (title, now, conv_id)
        )

    db.execute("UPDATE conversations SET updated_at=? WHERE id=?", (now, conv_id))
    db.commit()

    return {
        "user_msg_id":  user_msg_id,
        "sall_msg_id":  sall_msg_id,
        "stream_url":   f"/stream/{sall_msg_id}",
        "question":     body.content,
        "databases":    json.loads(row["databases"]),
        # On renvoie db_configs pour que le frontend puisse les utiliser
        "db_configs":   body.db_configs,
    }


@app.get("/stream/{sall_msg_id}")
async def stream_pipeline(
    sall_msg_id: str,
    question:    str,
    databases:   str = "",
    db_configs:  str = "[]",   # ← JSON encodé des configs DB
):
    """
    SSE endpoint — exécute le pipeline SALL.
    db_configs : JSON string de la liste des configs DB
    """
    selected_dbs = databases.split(",") if databases else []
    try:
        parsed_configs = json.loads(db_configs)
    except Exception:
        parsed_configs = []

    async def event_generator():
        full_content   = []
        pipeline_steps = []

        try:
            async for event in run_pipeline(
                question   = question,
                databases  = selected_dbs,
                msg_id     = sall_msg_id,
                db_configs = parsed_configs,   # ← transmis au pipeline
            ):
                yield f"data: {json.dumps(event)}\n\n"

                if event["type"] == "step":
                    pipeline_steps.append(event)
                elif event["type"] == "token":
                    full_content.append(event.get("content", ""))
                elif event["type"] == "done":
                    db = get_db()
                    db.execute(
                        "UPDATE messages SET content=?, pipeline_steps=? WHERE id=?",
                        ("".join(full_content),
                         json.dumps(pipeline_steps),
                         sall_msg_id)
                    )
                    db.commit()

                await asyncio.sleep(0)

        except Exception as e:
            yield f"data: {json.dumps({'type':'error','message':str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ════════════════════════════════════════════════════════════════
#  BASES DE DONNÉES
# ════════════════════════════════════════════════════════════════

AVAILABLE_DATABASES = [
    {"id": "agirh",       "name": "AGIRH",       "description": "Ressources Humaines", "color": "blue"},
    {"id": "openproject", "name": "OpenProject", "description": "Gestion de Projets",  "color": "green"},
    {"id": "itop",        "name": "iTop",        "description": "Support IT",           "color": "red"},
    {"id": "mplanner",    "name": "MPlanner",    "description": "Missions",             "color": "orange"},
]

@app.get("/databases")
def list_databases():
    return AVAILABLE_DATABASES


@app.post("/databases/select")
def select_databases(body: DatabaseSelection):
    return {"selected": body.databases, "status": "ok"}


class DbConnectRequest(BaseModel):
    name:     str
    host:     str
    port:     str = "5432"
    user:     str
    password: str


@app.post("/databases/connect")
def test_db_connection(body: DbConnectRequest):
    """Teste la connexion PostgreSQL via SQLAlchemy."""
    try:
        uri = f"postgresql://{body.user}:{body.password}@{body.host}:{body.port}/{body.name}"
        engine = create_engine(uri, connect_args={"connect_timeout": 5}, pool_pre_ping=True)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return {"status": "connected", "name": body.name,
                "uri": f"{body.host}:{body.port}/{body.name}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok", "service": "SALL API"}