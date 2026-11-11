# 🚀 AstraAI: Free Tier Deployment & Anti-Sleep Architecture Guide

This architecture is optimized for zero-cost operation using **Render Free Tier** and **Supabase Free Tier (PostgreSQL + pgvector)**, with a specialized anti-sleep keep-alive scheduler that keeps the microservice running 24/7.

---

## 1. 🗄️ Supabase Free Tier Setup (Database & pgvector)

1. Sign up at [supabase.com](https://supabase.com) (100% Free).
2. Create a new project (Region: **Singapore / ap-southeast-1** recommended for India/Asia low latency).
3. In Supabase Dashboard, navigate to **SQL Editor**.
4. Paste the entire contents of `database/schema.sql` and click **Run**.
   - This enables the `vector` and `uuid-ossp` extensions.
   - Creates `users`, `user_preferences`, `user_memories` (with 768-dim HNSW vector index), and `scheduled_reminders`.
   - Creates the `match_user_memories` cosine similarity stored procedure.
5. Go to **Project Settings -> Database**:
   - Copy the **Connection URI (Transaction Pooler - Port 6543)**.
   - Example: `postgresql://postgres.[ref]:[PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require`

---

## 2. ⚡ Render Free Tier Setup (FastAPI Backend + 24/7 Non-Sleep Scheduler)

Render provides a free Web Service tier, but spins down instances after 15 minutes of inbound inactivity. AstraAI includes a self-pinging background scheduler that prevents this.

### Step-by-Step Deploy:
1. Push this repository to GitHub or GitLab.
2. Sign up at [render.com](https://render.com).
3. Click **New + -> Web Service**:
   - Connect your GitHub repository.
   - **Environment**: `Python 3` or `Docker` (Dockerfile is provided in `/backend/Dockerfile`).
   - **Region**: `Singapore`
   - **Plan**: `Free`
   - **Root Directory**: `backend`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. In **Environment Variables**, add:
   - `GEMINI_API_KEY`: Your Google Gemini API Key from Google AI Studio.
   - `DATABASE_URL`: Your Supabase connection string from Step 1.
   - `PING_INTERVAL_MINUTES`: `10`
   - `APP_URL`: Your Render service URL (e.g., `https://astra-ai-backend.onrender.com`).
5. Click **Deploy Web Service**!

### 🛡️ How the Anti-Sleep Scheduler Works:
- Every 10 minutes (`PING_INTERVAL_MINUTES`), the internal `APScheduler` worker sends an inbound HTTP GET request to its own public URL (`/api/v1/health`).
- Because Render monitors inbound HTTP traffic to decide whether to spin down an instance, this self-ping resets the 15-minute inactivity timer, keeping your service active 24/7!
- Concurrently, it runs a lightweight heartbeat query on Supabase (`INSERT INTO system_keep_alive ...`), preventing Supabase from pausing due to 7 days of inactivity.

---

## 3. 📱 Flutter Mobile App Setup (Android & iOS)

### Prerequisites:
- Flutter SDK 3.20+
- Android Studio with Android 11+ Device or Emulator

### Steps:
1. Navigate to the mobile directory:
   ```bash
   cd mobile
   flutter pub get
   ```
2. In `lib/services/api_service.dart`, verify or update your backend URL:
   - For local Android emulator: `http://10.0.2.2:8000`
   - For physical phone: your computer's local IP or your public Render URL `https://your-service.onrender.com`
3. Launch on device:
   ```bash
   flutter run
   ```

### 🎯 Testing Native Actions:
1. **Clock Alarm**: Speak or type *"Naalaikku kaalaila 6 manikku alarm vei"* or *"Set alarm for 6:00 AM"*.
   - Gemini detects the intent, emits `set_native_alarm(6, 0, "Astra Alarm")`.
   - The Flutter client invokes `android.intent.action.SET_ALARM`, triggering the Android clock application.
2. **Movie Ticket Booking**: Say *"Leo movie tickets book pannanum"*.
   - Gemini emits `open_deep_link` with `bms://movie?title=Leo` and web fallback.
   - The client invokes `url_launcher` smoothly opening BookMyShow.
3. **Proactive Reminders**: Say *"Remind me to drink water every 2 hours"*.
   - Stored in PostgreSQL with recurrence rule and scheduled.
