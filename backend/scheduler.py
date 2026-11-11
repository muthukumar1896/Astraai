"""
AstraAI Background Task Scheduler & Free-Tier Keep-Alive Worker
Specifically engineered for Render Free Tier (anti-spin-down) and Supabase (anti-pause).
Also executes proactive reminder dispatching (FCM Push Notifications).
"""

import os
import asyncio
import logging
from datetime import datetime, timezone
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from database import get_db_connection

logger = logging.getLogger("astra.scheduler")

scheduler = AsyncIOScheduler()

# Configuration
APP_URL = os.getenv("APP_URL", os.getenv("RENDER_EXTERNAL_URL", "http://127.0.0.1:8000"))
PING_INTERVAL_MINUTES = int(os.getenv("PING_INTERVAL_MINUTES", "10")) # Render sleeps at 15m; 10m keeps it awake 24/7

# In-memory metrics for dashboard display
KEEPALIVE_STATS = {
    "total_pings": 0,
    "last_ping_time": None,
    "last_db_heartbeat": None,
    "supabase_status": "standby",
    "render_status": "active",
    "ping_history": []
}

async def render_and_supabase_keepalive_job():
    """
    CRITICAL ANTI-SLEEP WORKER:
    1. Render Free Tier Web Services shut down after 15 minutes of zero inbound HTTP traffic.
       This job sends an inbound HTTP GET request to its public URL every 10 minutes.
    2. Supabase Free projects pause after 7 days without queries.
       This job runs a quick lightweight query on PostgreSQL to keep the connection warm.
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    KEEPALIVE_STATS["total_pings"] += 1
    KEEPALIVE_STATS["last_ping_time"] = now_iso

    # 1. Supabase PostgreSQL Heartbeat
    db_success = False
    try:
        conn = get_db_connection()
        if conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO system_keep_alive (source, ping_timestamp, active_tenants_count, notes)
                    VALUES ('anti_sleep_cron', NOW(), (SELECT COUNT(*) FROM users), 'Render-Supabase 24/7 Keepalive')
                    RETURNING id;
                """)
                conn.commit()
            conn.close()
            db_success = True
            KEEPALIVE_STATS["supabase_status"] = "healthy_connected"
            KEEPALIVE_STATS["last_db_heartbeat"] = now_iso
            logger.info("Supabase PostgreSQL heartbeat query executed successfully.")
        else:
            KEEPALIVE_STATS["supabase_status"] = "disconnected_fallback"
    except Exception as e:
        logger.warning(f"Supabase heartbeat warning (using in-memory): {e}")
        KEEPALIVE_STATS["supabase_status"] = "error"

    # 2. Render Inbound HTTP Self-Ping
    http_success = False
    try:
        health_endpoint = f"{APP_URL.rstrip('/')}/api/v1/health"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(health_endpoint)
            if resp.status_code == 200:
                http_success = True
                KEEPALIVE_STATS["render_status"] = "active_non_sleeping"
                logger.info(f"Render self-ping succeeded: {health_endpoint} status 200")
            else:
                logger.warning(f"Render self-ping status: {resp.status_code}")
    except Exception as e:
        logger.warning(f"Render self-ping local loop: {e}")
        KEEPALIVE_STATS["render_status"] = "self_hosted_active"

    # Record log
    entry = {
        "timestamp": now_iso,
        "db_heartbeat": "OK" if db_success else "SKIPPED",
        "http_ping": "OK" if http_success else "LOCAL",
        "target": APP_URL
    }
    KEEPALIVE_STATS["ping_history"].insert(0, entry)
    if len(KEEPALIVE_STATS["ping_history"]) > 20:
        KEEPALIVE_STATS["ping_history"].pop()


async def check_and_dispatch_reminders_job():
    """
    Checks scheduled_reminders table every minute and simulates or triggers
    Firebase Cloud Messaging (FCM) high-priority push notifications to user devices.
    """
    conn = get_db_connection()
    if not conn:
        return

    try:
        with conn.cursor() as cur:
            # Query pending reminders
            sql = """
                SELECT sr.id, sr.user_id, sr.title, sr.recurrence_rule, u.fcm_token
                FROM scheduled_reminders sr
                JOIN users u ON sr.user_id = u.id
                WHERE sr.status = 'scheduled'
                  AND sr.execute_at <= NOW()
                LIMIT 10;
            """
            cur.execute(sql)
            due_reminders = cur.fetchall()

            for r in due_reminders:
                logger.info(f"Dispatching proactive reminder '{r['title']}' to user {r['user_id']}")
                # In production: firebase_admin.messaging.send(Message(...))
                # Update status
                update_sql = """
                    UPDATE scheduled_reminders 
                    SET status = 'dispatched', updated_at = NOW()
                    WHERE id = %s;
                """
                cur.execute(update_sql, (r["id"],))
            conn.commit()
    except Exception as ex:
        logger.error(f"Error checking reminders: {ex}")
        conn.rollback()
    finally:
        conn.close()


def start_scheduler():
    """
    Initializes and starts APScheduler in the FastAPI event loop.
    """
    # 1. Anti-sleep keep-alive every 10 minutes (Render won't sleep)
    scheduler.add_job(
        render_and_supabase_keepalive_job,
        'interval',
        minutes=PING_INTERVAL_MINUTES,
        id='anti_sleep_keepalive',
        replace_existing=True
    )

    # 2. Proactive reminder dispatcher every 60 seconds
    scheduler.add_job(
        check_and_dispatch_reminders_job,
        'interval',
        seconds=60,
        id='reminder_dispatcher',
        replace_existing=True
    )

    scheduler.start()
    logger.info(f"Astra Scheduler started. Anti-sleep keep-alive every {PING_INTERVAL_MINUTES} min.")
