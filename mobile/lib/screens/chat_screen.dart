import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/action_model.dart';
import '../services/action_dispatcher.dart';
import '../services/api_service.dart';

class ChatScreen extends StatefulWidget {
  final String currentUserId;
  final String userName;
  final String userLanguage;

  const ChatScreen({
    super.key,
    this.currentUserId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    this.userName = 'Muthukumar',
    this.userLanguage = 'Tanglish / English',
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<ChatMessage> _messages = [];
  bool _isLoading = false;
  bool _isListening = false;

  final List<String> _quickPrompts = [
    'Naalaikku kaalaila 6 manikku alarm vei',
    'Leo movie tickets Chennai la book pannanum',
    'Remind me to drink water every 2 hours',
    'Dinner ku Biryani Swiggy la order pannu',
    'Wake me up at 5:45 AM for gym',
  ];

  @override
  void initState() {
    super.initState();
    ActionDispatcher.initialize();

    // Welcome greeting
    _messages.add(
      ChatMessage(
        sender: MessageSender.assistant,
        text: 'Vanakkam ${widget.userName}! 👋 I am Astra, your personal mobile assistant.\n\nI can set native alarms on your clock, open movie & cab bookings with 1-tap deep links, or schedule proactive daily reminders in English or Tanglish!',
      ),
    );
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _handleSendMessage([String? prefilledText]) async {
    final text = prefilledText ?? _textController.text.trim();
    if (text.isEmpty || _isLoading) return;

    if (prefilledText == null) {
      _textController.clear();
    }

    // Add user message
    final userMsg = ChatMessage(
      sender: MessageSender.user,
      text: text,
    );

    setState(() {
      _messages.add(userMsg);
      _isLoading = true;
    });
    _scrollToBottom();

    // Call backend API
    final response = await ApiService.sendChatMessage(
      userId: widget.currentUserId,
      message: text,
    );

    final assistantMsg = ChatMessage(
      sender: MessageSender.assistant,
      text: response.replyText,
      actions: response.clientActions,
      memoriesUsed: response.memoriesUsed,
    );

    setState(() {
      _messages.add(assistantMsg);
      _isLoading = false;
    });
    _scrollToBottom();

    // Automatically trigger client actions (Device Hardware Controls)
    if (response.clientActions.isNotEmpty && mounted) {
      for (final action in response.clientActions) {
        if (!action.executed) {
          await ActionDispatcher.dispatch(context, action);
          setState(() {});
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E293B),
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [Color(0xFF6366F1), Color(0xFF8B5CF6)],
                ),
              ),
              child: const Icon(Icons.auto_awesome, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Astra Mobile AI',
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                Text(
                  '${widget.userName} • ${widget.userLanguage}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.indigo.shade200,
                  ),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Open Device Clock',
            icon: const Icon(Icons.access_time_filled, color: Colors.amber),
            onPressed: () => ActionDispatcher.openClockApp(),
          ),
          IconButton(
            tooltip: 'Connection Settings',
            icon: const Icon(Icons.settings, color: Colors.white70),
            onPressed: () => _showSettingsDialog(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Quick Prompts Carousel
          Container(
            height: 46,
            padding: const EdgeInsets.symmetric(vertical: 6),
            color: const Color(0xFF1E293B).withOpacity(0.5),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              itemCount: _quickPrompts.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                final prompt = _quickPrompts[index];
                return ActionChip(
                  label: Text(
                    prompt,
                    style: const TextStyle(fontSize: 12, color: Colors.white70),
                  ),
                  backgroundColor: const Color(0xFF334155),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: const BorderSide(color: Color(0xFF475569)),
                  ),
                  onPressed: () => _handleSendMessage(prompt),
                );
              },
            ),
          ),

          // Message Stream
          Expanded(
            child: ListView.builder(
              controller: _scrollController,
              padding: const EdgeInsets.all(16),
              itemCount: _messages.length,
              itemBuilder: (context, index) {
                final msg = _messages[index];
                final isUser = msg.sender == MessageSender.user;
                return _buildMessageItem(msg, isUser);
              },
            ),
          ),

          if (_isLoading)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.indigoAccent),
                  ),
                  const SizedBox(width: 10),
                  Text(
                    'Astra is reasoning & resolving intents...',
                    style: TextStyle(color: Colors.indigo.shade200, fontSize: 13),
                  ),
                ],
              ),
            ),

          // Input Bar
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildMessageItem(ChatMessage msg, bool isUser) {
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.84,
        ),
        child: Column(
          crossAxisAlignment:
              isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          children: [
            // Bubble Body
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: isUser
                    ? const Color(0xFF4F46E5)
                    : const Color(0xFF1E293B),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(16),
                  topRight: const Radius.circular(16),
                  bottomLeft: Radius.circular(isUser ? 16 : 4),
                  bottomRight: Radius.circular(isUser ? 4 : 16),
                ),
                border: Border.all(
                  color: isUser
                      ? const Color(0xFF6366F1)
                      : const Color(0xFF334155),
                  width: 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.2),
                    blurRadius: 4,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    msg.text,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14.5,
                      height: 1.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Align(
                    alignment: Alignment.bottomRight,
                    child: Text(
                      DateFormat('hh:mm a').format(msg.timestamp),
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.5),
                        fontSize: 10.5,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // Injected Action Badges
            if (msg.actions.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...msg.actions.map((act) => _buildActionCard(act)),
            ],

            // Long-term Memory Indicator
            if (msg.memoriesUsed.isNotEmpty) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.psychology, size: 14, color: Colors.purpleAccent),
                    const SizedBox(width: 6),
                    Text(
                      'Remembered: ${msg.memoriesUsed.first}',
                      style: TextStyle(fontSize: 11, color: Colors.purple.shade200),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildActionCard(ClientAction action) {
    if (action.type == ActionType.nativeAlarm) {
      final hour = action.payload['hour'] ?? 6;
      final minute = action.payload['minute'] ?? 0;
      final label = action.payload['label'] ?? 'Alarm';
      final formattedTime = '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

      return Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF172554),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF3B82F6), width: 1.2),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                color: Color(0xFF2563EB),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.alarm_on, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Alarm Triggered [$formattedTime]',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    '$label • Native Android Clock Intent',
                    style: TextStyle(color: Colors.blue.shade200, fontSize: 11.5),
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: () => ActionDispatcher.dispatch(context, action),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B82F6),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Re-trigger', style: TextStyle(fontSize: 11, color: Colors.white)),
            ),
          ],
        ),
      );
    }

    if (action.type == ActionType.deepLink) {
      final summary = action.payload['summary'] ?? 'Open Service';
      final targetUrl = action.payload['target_url'] ?? '';

      return Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF064E3B),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFF10B981), width: 1.2),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                color: Color(0xFF059669),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.launch, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Tap to Open: $summary',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Scheme: $targetUrl (Fallback: Web)',
                    style: TextStyle(color: Colors.green.shade200, fontSize: 11.5),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: () => ActionDispatcher.dispatch(context, action),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                minimumSize: Size.zero,
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              child: const Text('Launch', style: TextStyle(fontSize: 11, color: Colors.white)),
            ),
          ],
        ),
      );
    }

    if (action.type == ActionType.scheduledReminder) {
      final title = action.payload['title'] ?? 'Reminder';
      final scheduledTime = action.payload['scheduled_time'] ?? '';

      return Container(
        margin: const EdgeInsets.only(top: 4),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFF431407),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFF97316), width: 1.2),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                color: Color(0xFFEA580C),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.event_repeat, color: Colors.white, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Scheduled Habit: $title',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13,
                    ),
                  ),
                  Text(
                    'Frequency: $scheduledTime • Saved to Supabase DB',
                    style: TextStyle(color: Colors.orange.shade200, fontSize: 11.5),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return const SizedBox.shrink();
  }

  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: const BoxDecoration(
        color: Color(0xFF1E293B),
        border: Border(top: BorderSide(color: Color(0xFF334155))),
      ),
      child: SafeArea(
        child: Row(
          children: [
            // Voice Input Button
            GestureDetector(
              onTap: () {
                setState(() => _isListening = !_isListening);
                if (_isListening) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('Listening for voice (Tanglish / English)...'),
                      duration: Duration(seconds: 2),
                    ),
                  );
                }
              },
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _isListening ? Colors.redAccent : const Color(0xFF334155),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  _isListening ? Icons.mic : Icons.mic_none,
                  color: Colors.white,
                  size: 22,
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Text Input Field
            Expanded(
              child: TextField(
                controller: _textController,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _handleSendMessage(),
                style: const TextStyle(color: Colors.white, fontSize: 14.5),
                decoration: InputDecoration(
                  hintText: 'Type or speak (e.g. 6 AM alarm vei)...',
                  hintStyle: const TextStyle(color: Colors.white38),
                  filled: true,
                  fillColor: const Color(0xFF0F172A),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: Color(0xFF334155)),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: Color(0xFF334155)),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.5),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Send Button
            GestureDetector(
              onTap: () => _handleSendMessage(),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [Color(0xFF6366F1), Color(0xFF4F46E5)],
                  ),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.send, color: Colors.white, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSettingsDialog() {
    final urlController = TextEditingController(text: ApiService.baseUrl);

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: const Color(0xFF1E293B),
          title: const Text('Backend API Settings', style: TextStyle(color: Colors.white)),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Enter your Render URL (e.g., https://astra-backend.onrender.com) or local dev server:',
                style: TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: urlController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(
                  labelText: 'Base URL',
                  labelStyle: TextStyle(color: Colors.indigoAccent),
                  enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: Colors.white30)),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancel', style: TextStyle(color: Colors.white54)),
            ),
            ElevatedButton(
              onPressed: () {
                ApiService.setBaseUrl(urlController.text.trim());
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('API Base URL updated to: ${ApiService.baseUrl}')),
                );
              },
              child: const Text('Save'),
            ),
          ],
        );
      },
    );
  }
}
