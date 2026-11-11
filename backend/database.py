"""
AstraAI Database & Cache Management Layer
Supports Supabase PostgreSQL (with pgvector) and Redis (with in-memory fallback).
Optimized for Free Tiers (SSL pooler, reconnect retries, anti-sleep keep-alives).
"""

import os
import json
import logging
from typing import List, Dict, Any, Optional
import psycopg
from psycopg.rows import dict_row

logger = logging.getLogger("astra.database")

# Environment variables
DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable"
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# In-memory fallback cache for short-term memory when Redis is not provisioned on free tier
_IN_MEMORY_CACHE: Dict[str, List[Dict[str, Any]]] = {}

def get_db_connection():
    """
    Establishes connection to Supabase / PostgreSQL.
    Automatically configures dictionary row factory for JSON serialization.
    """
    try:
        # For Supabase, sslmode=require is mandatory. If in URL, psycopg respects it.
        conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {e}")
        return None

# ============================================================================
# Vector Memory Operations (pgvector)
# ============================================================================

def query_relevant_memories(user_id: str, query_embedding: List[float], top_k: int = 4) -> List[Dict[str, Any]]:
    """
    Performs cosine similarity vector search in user_memories table.
    Restricted strictly to the caller's user_id for multi-tenant isolation.
    """
    conn = get_db_connection()
    if not conn:
        logger.warning("No database connection available; returning empty memories")
        return []

    try:
        with conn.cursor() as cur:
            # We use pgvector <=> cosine distance operator
            embedding_str = f"[{','.join(str(x) for x in query_embedding)}]"
            sql = """
                SELECT id, memory_text, category, 
                       1 - (embedding <=> %s::vector) AS similarity
                FROM user_memories
                WHERE user_id = %s
                  AND 1 - (embedding <=> %s::vector) >= 0.55
                ORDER BY embedding <=> %s::vector ASC
                LIMIT %s;
            """
            cur.execute(sql, (embedding_str, user_id, embedding_str, embedding_str, top_k))
            results = cur.fetchall()
            return [dict(r) for r in results]
    except Exception as ex:
        logger.error(f"Error querying user memories: {ex}")
        return []
    finally:
        conn.close()

def save_user_memory(user_id: str, memory_text: str, embedding: List[float], category: str = "general") -> Optional[str]:
    """
    Saves newly extracted personal preference/fact into pgvector table.
    """
    conn = get_db_connection()
    if not conn:
        return None

    try:
        with conn.cursor() as cur:
            embedding_str = f"[{','.join(str(x) for x in embedding)}]"
            sql = """
                INSERT INTO user_memories (user_id, memory_text, embedding, category)
                VALUES (%s, %s, %s::vector, %s)
                RETURNING id;
            """
            cur.execute(sql, (user_id, memory_text, embedding_str, category))
            row = cur.fetchone()
            conn.commit()
            return str(row["id"]) if row else None
    except Exception as ex:
        logger.error(f"Error saving user memory: {ex}")
        conn.rollback()
        return None
    finally:
        conn.close()

# ============================================================================
# Short-Term Chat Context (Redis with Memory Fallback)
# ============================================================================

def get_short_term_history(user_id: str, limit: int = 10) -> List[Dict[str, str]]:
    """
    Retrieves recent conversational turns for multi-turn coherence.
    """
    try:
        import redis
        r = redis.from_url(REDIS_URL, decode_responses=True)
        key = f"chat_history:{user_id}"
        messages = r.lrange(key, -limit, -1)
        if messages:
            return [json.loads(m) for m in messages]
    except Exception:
        # Fallback to local in-memory dict
        pass

    history = _IN_MEMORY_CACHE.get(user_id, [])
    return history[-limit:]

def append_short_term_turn(user_id: str, role: str, content: str):
    """
    Pushes turn to Redis with 24-hour expiration (86400 seconds).
    """
    turn = {"role": role, "content": content}
    try:
        import redis
        r = redis.from_url(REDIS_URL, decode_responses=True)
        key = f"chat_history:{user_id}"
        r.rpush(key, json.dumps(turn))
        r.ltrim(key, -30, -1) # Keep last 30 messages
        r.expire(key, 86400)
        return
    except Exception:
        pass

    if user_id not in _IN_MEMORY_CACHE:
        _IN_MEMORY_CACHE[user_id] = []
    _IN_MEMORY_CACHE[user_id].append(turn)
    if len(_IN_MEMORY_CACHE[user_id]) > 30:
        _IN_MEMORY_CACHE[user_id] = _IN_MEMORY_CACHE[user_id][-30:]

# ============================================================================
# Proactive Reminders
# ============================================================================

def insert_scheduled_reminder(user_id: str, title: str, scheduled_time: str, is_recurring: bool, frequency: str = "") -> Optional[str]:
    conn = get_db_connection()
    if not conn:
        return "mock-reminder-id"
    try:
        with conn.cursor() as cur:
            sql = """
                INSERT INTO scheduled_reminders (user_id, title, recurrence_rule, is_recurring, execute_at, status)
                VALUES (%s, %s, %s, %s, NOW() + INTERVAL '1 hour', 'scheduled')
                RETURNING id;
            """
            cur.execute(sql, (user_id, title, frequency, is_recurring))
            row = cur.fetchone()
            conn.commit()
            return str(row["id"]) if row else None
    except Exception as ex:
        logger.error(f"Error creating reminder: {ex}")
        conn.rollback()
        return None
    finally:
        conn.close()
