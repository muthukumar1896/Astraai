import React, { useState, useEffect, useRef } from 'react';
import {
  AlarmClock,
  Bell,
  ExternalLink,
  Smartphone,
  Database,
  Server,
  Code,
  Copy,
  Check,
  Play,
  RefreshCw,
  Volume2,
  Mic,
  Send,
  Layers,
  ShieldCheck,
  Terminal,
  Activity,
  Sparkles,
  ChevronRight,
  Cpu,
  Globe,
  Clock,
  Info,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Radio,
  Zap,
} from 'lucide-react';

interface ClientAction {
  type: string;
  status: string;
  payload: Record<string, any>;
  executed?: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actions?: ClientAction[];
  memoriesUsed?: string[];
}

interface Tenant {
  id: string;
  name: string;
  phone: string;
  language: string;
  timezone: string;
  preferences: {
    commute: string;
    food: string;
    wakeUp: string;
    apps: Record<string, string>;
  };
}

interface CodeFile {
  label: string;
  relativePath: string;
  lang: string;
  content: string;
}

interface KeepaliveLog {
  timestamp: string;
  source: string;
  httpStatus: string;
  dbStatus: string;
  latencyMs: number;
}

export default function App() {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'anti_sleep' | 'memory'>('simulator');

  // Tenants & active user
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init-1',
      sender: 'assistant',
      text: 'Vanakkam Muthukumar! 👋 I am Astra, your personalized Mobile AI Assistant.\n\nI can set native hardware alarms, trigger smart deep links (BookMyShow, Swiggy, Uber) with zero web-scraping friction, and schedule proactive daily reminders in English or Tanglish!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Simulated Hardware Action Modals
  const [activeAlarmModal, setActiveAlarmModal] = useState<{
    show: boolean;
    hour: number;
    minute: number;
    label: string;
    intentAction: string;
  } | null>(null);

  const [activeDeepLinkModal, setActiveDeepLinkModal] = useState<{
    show: boolean;
    summary: string;
    targetUrl: string;
    fallbackWebUrl: string;
    actionType: string;
  } | null>(null);

  const [activeToast, setActiveToast] = useState<string | null>(null);

  // Code Explorer State
  const [codeFiles, setCodeFiles] = useState<CodeFile[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // Anti-Sleep Telemetry State
  const [keepaliveLogs, setKeepaliveLogs] = useState<KeepaliveLog[]>([]);
  const [isPinging, setIsPinging] = useState(false);

  // Memories State
  const [memories, setMemories] = useState<Array<{ id: string; text: string; category: string; similarity: number }>>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    fetchTenants();
    fetchCodeFiles();
    fetchSystemStatus();
    fetchMemories(selectedTenantId);
  }, []);

  useEffect(() => {
    fetchMemories(selectedTenantId);
  }, [selectedTenantId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const fetchTenants = async () => {
    try {
      const res = await fetch('/api/v1/tenants');
      const data = await res.json();
      if (data.tenants) setTenants(data.tenants);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCodeFiles = async () => {
    try {
      const res = await fetch('/api/v1/code/files');
      const data = await res.json();
      if (data.files) setCodeFiles(data.files);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const res = await fetch('/api/v1/system/status');
      const data = await res.json();
      if (data.keepaliveLogs) setKeepaliveLogs(data.keepaliveLogs);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMemories = async (userId: string) => {
    try {
      const res = await fetch(`/api/v1/memories?user_id=${userId}`);
      const data = await res.json();
      if (data.memories) setMemories(data.memories);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: 'usr-' + Date.now(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customText) setInputText('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/v1/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedTenantId,
          message: textToSend,
          client_timezone: 'Asia/Kolkata',
        }),
      });

      const data = await res.json();
      const assistantMsg: ChatMessage = {
        id: 'ast-' + Date.now(),
        sender: 'assistant',
        text: data.reply_text || 'Completed request.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        actions: data.client_actions || [],
        memoriesUsed: data.memories_used || [],
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Execute client-side hardware action hooks in the simulator!
      if (data.client_actions && data.client_actions.length > 0) {
        data.client_actions.forEach((act: ClientAction) => {
          if (act.type === 'NATIVE_ALARM') {
            setActiveAlarmModal({
              show: true,
              hour: act.payload.hour ?? 6,
              minute: act.payload.minute ?? 0,
              label: act.payload.label ?? 'Astra Alarm',
              intentAction: 'android.intent.action.SET_ALARM',
            });
            showToast(`⏰ Native Alarm intent triggered for ${String(act.payload.hour).padStart(2, '0')}:${String(act.payload.minute).padStart(2, '0')}`);
          } else if (act.type === 'DEEP_LINK') {
            setActiveDeepLinkModal({
              show: true,
              summary: act.payload.summary || 'App Launcher',
              targetUrl: act.payload.target_url || '',
              fallbackWebUrl: act.payload.fallback_web_url || '',
              actionType: act.payload.action_type || '',
            });
            showToast(`🔗 Smart Deep Link resolved: ${act.payload.summary}`);
          } else if (act.type === 'SCHEDULED_REMINDER') {
            showToast(`📅 Scheduled Proactive Reminder saved in PostgreSQL!`);
          }
        });
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: 'err-' + Date.now(),
          sender: 'assistant',
          text: 'Encountered a network or service issue. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setActiveToast(msg);
    setTimeout(() => setActiveToast(null), 4000);
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualPing = async () => {
    setIsPinging(true);
    try {
      const res = await fetch('/api/v1/keepalive/ping', { method: 'POST' });
      const data = await res.json();
      if (data.log) {
        setKeepaliveLogs((prev) => [data.log, ...prev.slice(0, 20)]);
        showToast('✅ Keep-Alive ping executed! Render timer & Supabase heartbeat refreshed.');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsPinging(false);
    }
  };

  const activeTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0] || {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Muthukumar',
    language: 'Tanglish / Tamil',
    timezone: 'Asia/Kolkata',
  };

  const quickPrompts = [
    { label: '⏰ 6 AM Alarm vei', prompt: 'Naalaikku kaalaila 6 manikku alarm vei' },
    { label: '🎟️ Leo Movie tickets', prompt: 'Leo movie tickets Chennai la book pannanum' },
    { label: '💧 Water reminder (2h)', prompt: 'Remind me to drink water every 2 hours' },
    { label: '💊 Night 8:30 PM Tablet', prompt: 'Enakku daily night 8:30 PM ku tablet reminder podu' },
    { label: '🍲 Biryani Swiggy order', prompt: 'Dinner ku Chettinad Biryani Swiggy la paaru' },
    { label: '⏰ 5:45 AM Gym alarm', prompt: 'Wake me up at 5:45 AM for gym workout' },
  ];

  return (
    <div className="flex flex-col h-screen bg-[#0B0F19] text-slate-100 font-sans overflow-hidden">
      {/* Top Universal Header */}
      <header className="h-14 border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur px-5 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-white text-base tracking-tight">AstraAI</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Multi-Tenant Mobile Agent
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Flutter + FastAPI + Gemini Function Calling + Render & Supabase 24/7 Keepalive
            </p>
          </div>
        </div>

        {/* Global Navigation Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'simulator'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mobile Simulator</span>
          </button>

          <button
            onClick={() => setActiveTab('code')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'code'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            <span>Code Architecture ({codeFiles.length} Files)</span>
          </button>

          <button
            onClick={() => setActiveTab('anti_sleep')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'anti_sleep'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span>Render 24/7 Anti-Sleep</span>
          </button>

          <button
            onClick={() => setActiveTab('memory')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'memory'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>pgvector Memory</span>
          </button>
        </div>

        {/* Tenant Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline">Tenant:</span>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-indigo-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 font-medium cursor-pointer"
          >
            <option value="a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11">Muthukumar (Tamil / Tanglish)</option>
            <option value="b1ffcd88-8b1a-4fe7-aa5c-5aa8ac271b22">Sarah Chen (English / US)</option>
          </select>
        </div>
      </header>

      {/* Main Work Area */}
      <main className="flex-1 overflow-hidden relative">
        {/* TAB 1: INTERACTIVE MOBILE SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="h-full flex items-center justify-center p-4 lg:p-6 bg-radial from-slate-900/60 to-slate-950">
            {/* Phone Outer Frame */}
            <div className="w-[380px] sm:w-[410px] h-[780px] max-h-[92vh] bg-slate-950 rounded-[44px] p-3 shadow-2xl border-4 border-slate-700/80 relative flex flex-col overflow-hidden">
              {/* Phone Speaker Notch & Dynamic Island */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-4 bg-slate-900 rounded-full z-40 flex items-center justify-center gap-2 border border-slate-800">
                <div className="w-2 h-2 rounded-full bg-slate-800"></div>
                <div className="w-8 h-1 rounded-full bg-slate-800"></div>
              </div>

              {/* Mobile Screen Inside */}
              <div className="w-full h-full bg-[#0F172A] rounded-[36px] overflow-hidden flex flex-col relative border border-slate-800">
                {/* Mobile Status Bar */}
                <div className="h-8 bg-[#1E293B] px-6 pt-1 flex items-center justify-between text-[11px] text-slate-300 font-mono select-none z-30">
                  <span>07:30</span>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span className="text-[10px]">5G</span>
                    <Radio className="w-3 h-3 text-emerald-400" />
                    <div className="w-4 h-2 border border-slate-400 rounded-sm flex items-center p-0.5">
                      <div className="w-full h-full bg-emerald-400"></div>
                    </div>
                  </div>
                </div>

                {/* Flutter App Bar Header */}
                <div className="bg-[#1E293B] px-4 py-2.5 border-b border-slate-800 flex items-center justify-between z-20">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white leading-tight flex items-center gap-1.5">
                        <span>Astra Mobile AI</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      </div>
                      <div className="text-[10px] text-indigo-300">
                        {activeTenant.name} • {activeTenant.language}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setActiveAlarmModal({
                          show: true,
                          hour: 6,
                          minute: 0,
                          label: 'Daily Morning Wakeup',
                          intentAction: 'android.intent.action.SHOW_ALARMS',
                        })
                      }
                      title="Open Android OS Clock"
                      className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition"
                    >
                      <AlarmClock className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveTab('anti_sleep')}
                      title="View Keepalive Status"
                      className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                    >
                      <Zap className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Quick Prompts Carousel */}
                <div className="bg-slate-900/90 border-b border-slate-800/80 px-2 py-1.5 overflow-x-auto no-scrollbar flex items-center gap-1.5 shrink-0">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendMessage(qp.prompt)}
                      className="whitespace-nowrap px-2.5 py-1 rounded-full bg-slate-800/90 hover:bg-indigo-600 text-slate-300 hover:text-white text-[11px] font-medium border border-slate-700 transition"
                    >
                      {qp.label}
                    </button>
                  ))}
                </div>

                {/* Message Stream */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {messages.map((msg) => {
                    const isUser = msg.sender === 'user';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                        {/* Bubble */}
                        <div
                          className={`max-w-[85%] rounded-2xl p-3 text-[13px] leading-relaxed shadow-sm ${
                            isUser
                              ? 'bg-indigo-600 text-white rounded-br-xs'
                              : 'bg-[#1E293B] text-slate-100 border border-slate-700/70 rounded-bl-xs'
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          <div
                            className={`text-[9px] mt-1 text-right ${
                              isUser ? 'text-indigo-200' : 'text-slate-400'
                            }`}
                          >
                            {msg.timestamp}
                          </div>
                        </div>

                        {/* Long-term memory badge */}
                        {msg.memoriesUsed && msg.memoriesUsed.length > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-purple-300 bg-purple-950/40 border border-purple-800/50 rounded-md px-2 py-0.5">
                            <Database className="w-3 h-3 text-purple-400" />
                            <span>Memory: {msg.memoriesUsed[0]}</span>
                          </div>
                        )}

                        {/* Interactive Client Action Badges */}
                        {msg.actions && msg.actions.length > 0 && (
                          <div className="mt-2 space-y-1.5 w-[88%]">
                            {msg.actions.map((act, i) => {
                              if (act.type === 'NATIVE_ALARM') {
                                return (
                                  <div
                                    key={i}
                                    className="bg-blue-950/80 border border-blue-500/50 rounded-xl p-2.5 flex items-center gap-2.5 text-left shadow-lg animate-fade-in"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                                      <AlarmClock className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <span>
                                          Alarm Triggered [{String(act.payload.hour).padStart(2, '0')}:
                                          {String(act.payload.minute).padStart(2, '0')}]
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-blue-200 truncate">
                                        {act.payload.label || 'Astra Alarm'} • Intent: SET_ALARM
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        setActiveAlarmModal({
                                          show: true,
                                          hour: act.payload.hour ?? 6,
                                          minute: act.payload.minute ?? 0,
                                          label: act.payload.label || 'Astra Alarm',
                                          intentAction: 'android.intent.action.SET_ALARM',
                                        })
                                      }
                                      className="px-2 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold shrink-0 shadow"
                                    >
                                      Inspect Intent
                                    </button>
                                  </div>
                                );
                              }

                              if (act.type === 'DEEP_LINK') {
                                return (
                                  <div
                                    key={i}
                                    className="bg-emerald-950/80 border border-emerald-500/50 rounded-xl p-2.5 flex items-center gap-2.5 text-left shadow-lg animate-fade-in"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                                      <ExternalLink className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-white truncate">
                                        Tap to Open: {act.payload.summary || 'Deep Link'}
                                      </div>
                                      <div className="text-[10px] text-emerald-200 truncate">
                                        Scheme: {act.payload.target_url}
                                      </div>
                                    </div>
                                    <button
                                      onClick={() =>
                                        setActiveDeepLinkModal({
                                          show: true,
                                          summary: act.payload.summary || 'App Launcher',
                                          targetUrl: act.payload.target_url || '',
                                          fallbackWebUrl: act.payload.fallback_web_url || '',
                                          actionType: act.payload.action_type || '',
                                        })
                                      }
                                      className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold shrink-0 shadow"
                                    >
                                      Launch
                                    </button>
                                  </div>
                                );
                              }

                              if (act.type === 'SCHEDULED_REMINDER') {
                                return (
                                  <div
                                    key={i}
                                    className="bg-amber-950/80 border border-amber-500/50 rounded-xl p-2.5 flex items-center gap-2.5 text-left shadow-lg"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center shrink-0">
                                      <Bell className="w-4 h-4 text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-xs font-bold text-white truncate">
                                        Scheduled: {act.payload.title}
                                      </div>
                                      <div className="text-[10px] text-amber-200">
                                        Frequency: {act.payload.scheduled_time || act.payload.scheduledTime}
                                      </div>
                                    </div>
                                    <span className="text-[10px] bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded font-mono">
                                      PostgreSQL
                                    </span>
                                  </div>
                                );
                              }

                              return null;
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {isLoading && (
                    <div className="flex items-center gap-2 text-indigo-400 text-xs py-2 px-3 bg-indigo-950/30 rounded-xl border border-indigo-900/50 w-fit">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Astra is resolving intents & executing tools...</span>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Phone Bottom Input Bar */}
                <div className="p-3 bg-[#1E293B] border-t border-slate-800">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIsListening(!isListening);
                        if (!isListening) {
                          showToast('🎙️ Simulated Speech Recognition active. Listening for Tanglish or English voice input...');
                          setTimeout(() => {
                            handleSendMessage('Naalaikku kaalaila 6 manikku alarm vei');
                            setIsListening(false);
                          }, 1500);
                        }
                      }}
                      className={`p-2.5 rounded-full transition ${
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                      title="Voice Input (Speech-to-Text)"
                    >
                      <Mic className="w-4 h-4" />
                    </button>

                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Type or speak (e.g. 6 AM alarm vei)..."
                      className="flex-1 bg-slate-900 text-slate-100 placeholder-slate-500 text-xs px-3.5 py-2.5 rounded-full border border-slate-700 focus:outline-none focus:border-indigo-500"
                    />

                    <button
                      onClick={() => handleSendMessage()}
                      disabled={isLoading || !inputText.trim()}
                      className="p-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white transition shadow"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Floating Notification Toast */}
                {activeToast && (
                  <div className="absolute top-12 left-4 right-4 bg-slate-900/95 border border-indigo-500/60 rounded-xl p-2.5 shadow-2xl backdrop-blur flex items-center gap-2 text-xs text-white z-50 animate-bounce">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="flex-1">{activeToast}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Side Architecture Callout Panel */}
            <div className="hidden xl:flex flex-col gap-4 w-80 ml-6 shrink-0">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm mb-2">
                  <Cpu className="w-4 h-4" />
                  <span>Client-Side Action Engine</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Unlike traditional chat bots that just return markdown text, Astra emits structured tool payloads:
                </p>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-blue-400 font-mono font-bold">set_native_alarm</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Invokes <code className="text-slate-300">ACTION_SET_ALARM</code> on Android clock without human clock-picker clicks.
                    </p>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-emerald-400 font-mono font-bold">open_deep_link</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Resolves <code className="text-slate-300">bms://</code> or <code className="text-slate-300">uber://</code> with web URL fallback.
                    </p>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-amber-400 font-mono font-bold">schedule_reminder</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Queues habit schedule in PostgreSQL + 24/7 non-sleep worker.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-800/40 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-1.5">
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                  <span>Free Tier Anti-Sleep</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Render Free Web Services sleep after 15 min. Astra’s internal cron pings <code className="text-emerald-300">/api/v1/health</code> every 10 min to keep your microservice alive 24/7.
                </p>
                <button
                  onClick={() => setActiveTab('anti_sleep')}
                  className="mt-3 w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
                >
                  View Anti-Sleep Telemetry →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CODE ARCHITECTURE & PRODUCTION DELIVERABLES */}
        {activeTab === 'code' && (
          <div className="h-full flex flex-col md:flex-row bg-slate-950 overflow-hidden">
            {/* File List Sidebar */}
            <div className="w-full md:w-72 bg-[#0F172A] border-r border-slate-800 flex flex-col shrink-0">
              <div className="p-3 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Production Files
                </span>
                <span className="text-[11px] bg-slate-800 px-2 py-0.5 rounded text-indigo-300 font-mono">
                  {codeFiles.length} modules
                </span>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
                {codeFiles.map((f, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedFileIndex(idx)}
                    className={`w-full text-left px-4 py-3 flex flex-col gap-0.5 transition ${
                      selectedFileIndex === idx
                        ? 'bg-indigo-600/15 border-l-4 border-indigo-500 text-white'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold truncate text-slate-200">{f.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                        {f.lang}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono truncate">{f.relativePath}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Code Content Viewer */}
            <div className="flex-1 flex flex-col bg-[#0B0F19] overflow-hidden">
              {codeFiles[selectedFileIndex] ? (
                <>
                  <div className="h-12 border-b border-slate-800 px-5 flex items-center justify-between bg-slate-900/60">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-mono font-bold text-white">
                        {codeFiles[selectedFileIndex].relativePath}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCopyCode(codeFiles[selectedFileIndex].content)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied to Clipboard!' : 'Copy File'}</span>
                    </button>
                  </div>
                  <div className="flex-1 overflow-auto p-5 font-mono text-xs text-slate-300 leading-relaxed bg-[#0B0F19]">
                    <pre className="whitespace-pre">{codeFiles[selectedFileIndex].content}</pre>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
                  Select a file to inspect production source code.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: RENDER 24/7 ANTI-SLEEP WORKER CONSOLE */}
        {activeTab === 'anti_sleep' && (
          <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-950/60 via-slate-900 to-indigo-950/60 border border-emerald-500/30 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                  </span>
                  <h2 className="text-lg font-bold text-white">Render & Supabase 24/7 Keep-Alive Architecture</h2>
                </div>
                <p className="text-xs text-slate-300 mt-1 max-w-2xl">
                  Configured specifically to bypass Render's 15-minute inactivity spin-down and Supabase's 7-day auto-pause on free tiers without paying for upgraded compute!
                </p>
              </div>

              <button
                onClick={handleManualPing}
                disabled={isPinging}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                <span>Test Anti-Sleep Heartbeat Ping</span>
              </button>
            </div>

            {/* Architecture Explanation Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-2">
                  <Server className="w-4 h-4" />
                  <span>1. Render Free Tier Anti-Spin-Down</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Render Free Web Services inspect inbound HTTP request traffic. If no requests occur in 15 minutes, Render shuts down the process container until the next manual request arrives (which causes a 50+ second cold start).
                </p>
                <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-emerald-300 space-y-1">
                  <div>⏰ Cron Interval: Every 10 Minutes (600s)</div>
                  <div>🎯 Target: Inbound GET /api/v1/health</div>
                  <div>⚡ Result: Inactivity timer resets continuously!</div>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm mb-2">
                  <Database className="w-4 h-4" />
                  <span>2. Supabase Free Tier Anti-Pause</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Supabase pauses free PostgreSQL instances after 7 days without queries. AstraAI’s scheduler performs a micro-heartbeat query during every cycle, ensuring persistent uptime for pgvector long-term memory.
                </p>
                <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono text-indigo-300 space-y-1">
                  <div>쿼 Query: INSERT INTO system_keep_alive ...</div>
                  <div>🔒 Pruning: Triggers retain last 500 records only</div>
                  <div>⚡ Result: Supabase database remains warm & active</div>
                </div>
              </div>
            </div>

            {/* Live Telemetry Ping Logs */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold text-white">Live Inbound Keepalive Pings</span>
                </div>
                <span className="text-xs text-slate-400">Refreshed automatically</span>
              </div>

              <div className="space-y-2">
                {keepaliveLogs.map((log, i) => (
                  <div
                    key={i}
                    className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="text-slate-300">{log.source}</span>
                      <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                        {log.httpStatus}
                      </span>
                      <span className="text-indigo-300 hidden md:inline">{log.dbStatus}</span>
                    </div>

                    <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                      <span>{log.latencyMs}ms latency</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MULTI-TENANT PGVECTOR MEMORY */}
        {activeTab === 'memory' && (
          <div className="h-full overflow-y-auto p-6 max-w-5xl mx-auto space-y-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-400" />
                    <span>Multi-Tenant Long-Term Memory (pgvector 768-dim)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Isolated vectors stored per user tenant. Evaluated via cosine distance (<code className="text-indigo-300">&lt;=&gt;</code>) during each conversational turn.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Current Tenant:</span>
                  <div className="text-sm font-bold text-indigo-300">{activeTenant.name}</div>
                </div>
              </div>

              {/* Memory Cards */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {mem.category}
                        </span>
                        <span className="text-xs font-mono text-emerald-400">
                          Match: {(mem.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">{mem.text}</p>
                    </div>

                    <div className="mt-4 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                      <span>Vector Dimension: 768 float</span>
                      <span>Indexed with HNSW</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stored Preferences */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Tenant Configuration & App Mappings</span>
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Daily Routine</div>
                  <div className="font-semibold text-white mt-1">Wake up: {activeTenant.preferences.wakeUp}</div>
                  <div className="text-slate-400 mt-0.5">Commute: {activeTenant.preferences.commute}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Food & Dining Preferences</div>
                  <div className="font-semibold text-white mt-1">{activeTenant.preferences.food}</div>
                  <div className="text-slate-400 mt-0.5">Primary App: {activeTenant.preferences.apps.food}</div>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <div className="text-slate-400 text-[11px]">Movie & Entertainment</div>
                  <div className="font-semibold text-white mt-1">Deep Link: {activeTenant.preferences.apps.movie}</div>
                  <div className="text-slate-400 mt-0.5">PVR / INOX / SPI Cinemas</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL 1: SIMULATED NATIVE ALARM INTENT DISPATCH */}
      {activeAlarmModal && activeAlarmModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-[#172554] border-2 border-blue-500 rounded-3xl p-6 shadow-2xl relative text-slate-100">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/40">
              <AlarmClock className="w-8 h-8 text-white animate-pulse" />
            </div>

            <div className="text-center mb-5">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-blue-400/20 text-blue-200 border border-blue-400/30">
                Android OS Intent Intercepted
              </span>
              <h3 className="text-xl font-bold text-white mt-2">
                Native Alarm Set: {String(activeAlarmModal.hour).padStart(2, '0')}:
                {String(activeAlarmModal.minute).padStart(2, '0')}
              </h3>
              <p className="text-xs text-blue-200 mt-1">"{activeAlarmModal.label}"</p>
            </div>

            <div className="p-3 bg-slate-950/80 rounded-xl border border-blue-800/80 font-mono text-xs text-blue-300 space-y-1 mb-5">
              <div className="text-slate-400">// Client Action Payload:</div>
              <div>Intent Action: <span className="text-white">android.intent.action.SET_ALARM</span></div>
              <div>EXTRA_HOUR: <span className="text-amber-300">{activeAlarmModal.hour}</span></div>
              <div>EXTRA_MINUTES: <span className="text-amber-300">{activeAlarmModal.minute}</span></div>
              <div>EXTRA_MESSAGE: <span className="text-emerald-300">"{activeAlarmModal.label}"</span></div>
              <div>EXTRA_VIBRATE: <span className="text-emerald-300">true</span></div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveAlarmModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow"
              >
                Simulate Clock Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: SIMULATED SMART DEEP LINK LAUNCHER */}
      {activeDeepLinkModal && activeDeepLinkModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="w-full max-w-md bg-[#064E3B] border-2 border-emerald-500 rounded-3xl p-6 shadow-2xl relative text-slate-100">
            <div className="w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/40">
              <ExternalLink className="w-8 h-8 text-white" />
            </div>

            <div className="text-center mb-5">
              <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                Zero Friction URL Launcher
              </span>
              <h3 className="text-xl font-bold text-white mt-2">{activeDeepLinkModal.summary}</h3>
              <p className="text-xs text-emerald-200 mt-1">Smart Resolution: Native App & Web Fallback</p>
            </div>

            <div className="space-y-3 mb-5 text-xs font-mono">
              <div className="p-3 bg-slate-950/80 rounded-xl border border-emerald-800">
                <div className="text-emerald-400 font-bold mb-1">Primary Native Scheme:</div>
                <div className="text-slate-200 break-all">{activeDeepLinkModal.targetUrl}</div>
              </div>

              <div className="p-3 bg-slate-950/80 rounded-xl border border-emerald-800">
                <div className="text-emerald-400 font-bold mb-1">Universal Web Fallback:</div>
                <div className="text-slate-200 break-all">{activeDeepLinkModal.fallbackWebUrl}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  window.open(activeDeepLinkModal.fallbackWebUrl, '_blank');
                  setActiveDeepLinkModal(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow flex items-center justify-center gap-1.5"
              >
                <span>Launch in Browser</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setActiveDeepLinkModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
