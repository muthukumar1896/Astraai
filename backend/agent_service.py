"""
AstraAI Core Agent Service
Powered by the official Google GenAI SDK (gemini-3.8-flash / gemini-2.0).
Implements Function Calling, ReAct loop, Tanglish & English understanding,
and multi-tenant memory retrieval.
"""

import os
import json
import logging
from typing import List, Dict, Any, Tuple
from google import genai
from google.genai import types

from database import (
    query_relevant_memories, 
    get_short_term_history, 
    append_short_term_turn,
    insert_scheduled_reminder
)

logger = logging.getLogger("astra.agent")

# Initialize the official Google GenAI client
# AI Studio and Render environments inject GEMINI_API_KEY
client = genai.Client(
    api_key=os.getenv("GEMINI_API_KEY", ""),
    http_options={"headers": {"User-Agent": "aistudio-build"}}
)

# Active model selection (Fast, multimodal, robust tool caller)
MODEL_ID = "gemini-3.8-flash"

# ============================================================================
# Tool / Function Declarations
# ============================================================================

set_native_alarm_declaration = types.FunctionDeclaration(
    name="set_native_alarm",
    description="Invokes the native Android/iOS mobile clock to set a physical hardware alarm. Use this whenever the user wants to wake up or set a timer/alarm at a specific time.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "hour": types.Schema(
                type=types.Type.INTEGER,
                description="The hour of the alarm in 24-hour format (0 to 23)."
            ),
            "minute": types.Schema(
                type=types.Type.INTEGER,
                description="The minute of the alarm (0 to 59)."
            ),
            "label": types.Schema(
                type=types.Type.STRING,
                description="Brief description or purpose of the alarm (e.g., 'Morning Workout', 'Flight Wakeup')."
            )
        },
        required=["hour", "minute", "label"]
    )
)

open_deep_link_declaration = types.FunctionDeclaration(
    name="open_deep_link",
    description="Constructs and opens a smart deep link into a native mobile app (e.g., BookMyShow, Swiggy, Uber, Zomato, Google Maps) with fallback to mobile web URL.",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "action_type": types.Schema(
                type=types.Type.STRING,
                description="Type of task: 'movie_booking', 'cab_booking', 'food_delivery', 'map_navigation'."
            ),
            "target_url": types.Schema(
                type=types.Type.STRING,
                description="Native mobile application custom URI scheme (e.g., 'bms://movie?title=Leo&city=chennai', 'uber://?action=setPickup')."
            ),
            "fallback_web_url": types.Schema(
                type=types.Type.STRING,
                description="Universal HTTPS Web URL if the native app is not installed on the user device."
            ),
            "summary": types.Schema(
                type=types.Type.STRING,
                description="User-friendly description of the task (e.g., 'Opening BookMyShow for Leo in Chennai')."
            )
        },
        required=["action_type", "target_url", "fallback_web_url", "summary"]
    )
)

schedule_proactive_reminder_declaration = types.FunctionDeclaration(
    name="schedule_proactive_reminder",
    description="Schedules a proactive background habit reminder or calendar notification (e.g., drink water every 2 hours, take medication at 8:30 PM).",
    parameters=types.Schema(
        type=types.Type.OBJECT,
        properties={
            "title": types.Schema(
                type=types.Type.STRING,
                description="Title of the reminder (e.g., 'Drink 500ml Water', 'Take BP Tablet')."
            ),
            "scheduled_time": types.Schema(
                type=types.Type.STRING,
                description="Time or interval string (e.g., '20:30', 'every 2 hours', 'tomorrow at 9am')."
            ),
            "is_recurring": types.Schema(
                type=types.Type.BOOLEAN,
                description="Whether this is a recurring daily or interval habit."
            ),
            "frequency": types.Schema(
                type=types.Type.STRING,
                description="Recurrence pattern: 'daily', 'every_2_hours', 'weekdays', 'once'."
            )
        },
        required=["title", "scheduled_time", "is_recurring", "frequency"]
    )
)

TOOL_DECLARATIONS = [
    types.Tool(function_declarations=[
        set_native_alarm_declaration,
        open_deep_link_declaration,
        schedule_proactive_reminder_declaration
    ])
]

# ============================================================================
# System Persona & Multi-Language Instructions (English + Tanglish)
# ============================================================================

SYSTEM_INSTRUCTION = """
You are Astra, an intelligent, personal, and proactive Mobile AI Companion built for real-world execution.
You operate on Android & iOS mobile devices and have direct hardware capabilities via client-side action hooks.

CORE BEHAVIORS:
1. Native Device Controls:
   - When the user asks to wake up, set an alarm, or alert them at a time, CALL `set_native_alarm`.
   - Examples: "Naalaikku kaalaila 6:30-ku alarm vei", "Set alarm for 7:00 AM", "Wake me up at 5:45 AM".
2. Smart Deep-Linking (Zero Friction Automation):
   - For movie ticket bookings, cabs, food orders, or navigation, NEVER scrape behind logins. 
   - Instead, resolve the details (movie name, city, restaurant) and CALL `open_deep_link`.
   - Provide both the native app scheme (e.g., `bms://...`, `uber://...`, `swiggy://...`) AND a reliable fallback HTTPS URL.
3. Proactive Reminders:
   - When the user asks for habit tracking, health alerts, or recurring routines (e.g. "Water reminder every 2 hours", "Night 9 PM tablet reminder"), CALL `schedule_proactive_reminder`.
4. Language & Tone:
   - You are bilingual: You understand English and Tanglish (Tamil words written in English alphabet, e.g., 'kaalaila', 'panren', 'thookam', 'sapadu').
   - If the user talks in Tanglish, reply with warmth in friendly Tanglish / Indian English!
   - Keep answers concise, helpful, and free from unnecessary AI jargon.
5. Personalization & Memory:
   - Respect user preferences and long-term memory injected into the prompt.
"""

# ============================================================================
# Agent Execution Loop
# ============================================================================

async def process_user_turn(
    user_id: str, 
    user_message: str, 
    client_timezone: str = "Asia/Kolkata"
) -> Dict[str, Any]:
    """
    Main entrypoint for chat turn:
    1. Fetches short-term Redis history and relevant pgvector memories.
    2. Sends context + tools to Gemini.
    3. Detects tool calls and prepares `client_actions` for the Flutter app.
    4. Updates short-term history.
    """
    client_actions = []
    memories_used = []

    # 1. Long-term memory query (pseudo embedding or 768-dim vector)
    try:
        # Create lightweight embedding for memory lookup
        emb_resp = client.models.embed_content(
            model="gemini-embedding-2",
            contents=user_message,
        )
        if emb_resp.embeddings:
            query_vector = emb_resp.embeddings[0].values
            memories = query_relevant_memories(user_id, query_vector, top_k=3)
            memories_used = [m["memory_text"] for m in memories]
    except Exception as ex:
        logger.info(f"Memory lookup skipped: {ex}")

    # 2. Retrieve recent conversational turns
    past_turns = get_short_term_history(user_id, limit=6)

    # 3. Assemble contents
    memory_context_prompt = ""
    if memories_used:
        memory_context_prompt = "\n[Known User Facts & Memory]:\n" + "\n".join(f"- {m}" for m in memories_used)

    contents = []
    # Add short term history
    for t in past_turns:
        role = "user" if t["role"] == "user" else "model"
        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=t["content"])]))

    # Append current message with timezone context
    current_text = f"{user_message}\n[User Timezone: {client_timezone}]{memory_context_prompt}"
    contents.append(types.Content(role="user", parts=[types.Part.from_text(text=current_text)]))

    try:
        # 4. Invoke Gemini with tools
        response = client.models.generate_content(
            model=MODEL_ID,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                tools=TOOL_DECLARATIONS,
                temperature=0.4,
            )
        )

        reply_text = response.text or ""

        # 5. Check and resolve Function Calls
        if response.function_calls:
            for call in response.function_calls:
                fn_name = call.name
                fn_args = call.args or {}
                logger.info(f"Model dispatched tool: {fn_name} with args: {fn_args}")

                if fn_name == "set_native_alarm":
                    client_actions.append({
                        "type": "NATIVE_ALARM",
                        "status": "ready_to_dispatch",
                        "payload": {
                            "hour": int(fn_args.get("hour", 6)),
                            "minute": int(fn_args.get("minute", 0)),
                            "label": str(fn_args.get("label", "Astra Alarm")),
                            "skip_ui": False
                        }
                    })
                    if not reply_text:
                        reply_text = f"Sure! Setting alarm for {fn_args.get('hour'):02d}:{fn_args.get('minute'):02d} ({fn_args.get('label')})."

                elif fn_name == "open_deep_link":
                    client_actions.append({
                        "type": "DEEP_LINK",
                        "status": "ready_to_dispatch",
                        "payload": {
                            "action_type": str(fn_args.get("action_type", "movie_booking")),
                            "target_url": str(fn_args.get("target_url", "")),
                            "fallback_web_url": str(fn_args.get("fallback_web_url", "")),
                            "summary": str(fn_args.get("summary", "Opening requested app"))
                        }
                    })
                    if not reply_text:
                        reply_text = f"Opening {fn_args.get('summary')} for you right away!"

                elif fn_name == "schedule_proactive_reminder":
                    # Also persist in database
                    reminder_id = insert_scheduled_reminder(
                        user_id=user_id,
                        title=str(fn_args.get("title", "Reminder")),
                        scheduled_time=str(fn_args.get("scheduled_time", "")),
                        is_recurring=bool(fn_args.get("is_recurring", False)),
                        frequency=str(fn_args.get("frequency", "once"))
                    )
                    client_actions.append({
                        "type": "SCHEDULED_REMINDER",
                        "status": "scheduled",
                        "payload": {
                            "id": reminder_id,
                            "title": str(fn_args.get("title", "")),
                            "scheduled_time": str(fn_args.get("scheduled_time", "")),
                            "is_recurring": bool(fn_args.get("is_recurring", False)),
                            "frequency": str(fn_args.get("frequency", "once"))
                        }
                    })
                    if not reply_text:
                        reply_text = f"Scheduled your reminder for '{fn_args.get('title')}' at {fn_args.get('scheduled_time')}."

        # If model returned no text and no function call, provide fallback
        if not reply_text and not client_actions:
            reply_text = "I am ready to help! You can ask me to set an alarm, book movie tickets, or set daily habit reminders."

        # 6. Save turn in short-term history
        append_short_term_turn(user_id, "user", user_message)
        append_short_term_turn(user_id, "assistant", reply_text)

        return {
            "reply_text": reply_text,
            "client_actions": client_actions,
            "memories_used": memories_used
        }

    except Exception as ex:
        logger.error(f"Error in Gemini agent processing: {ex}")
        return {
            "reply_text": "I encountered a momentary issue processing your request. Please try again.",
            "client_actions": [],
            "memories_used": []
        }
