import 'package:uuid/uuid.dart';

enum MessageSender { user, assistant, system }

enum ActionType {
  nativeAlarm,
  deepLink,
  scheduledReminder,
  unknown;

  static ActionType fromString(String val) {
    switch (val.toUpperCase()) {
      case 'NATIVE_ALARM':
        return ActionType.nativeAlarm;
      case 'DEEP_LINK':
        return ActionType.deepLink;
      case 'SCHEDULED_REMINDER':
        return ActionType.scheduledReminder;
      default:
        return ActionType.unknown;
    }
  }
}

class ClientAction {
  final ActionType type;
  final String status;
  final Map<String, dynamic> payload;
  bool executed;
  String? executionFeedback;

  ClientAction({
    required this.type,
    required this.status,
    required this.payload,
    this.executed = false,
    this.executionFeedback,
  });

  factory ClientAction.fromJson(Map<String, dynamic> json) {
    return ClientAction(
      type: ActionType.fromString(json['type'] ?? ''),
      status: json['status'] ?? 'pending',
      payload: Map<String, dynamic>.from(json['payload'] ?? {}),
    );
  }
}

class ChatMessage {
  final String id;
  final MessageSender sender;
  final String text;
  final DateTime timestamp;
  final List<ClientAction> actions;
  final List<String> memoriesUsed;

  ChatMessage({
    String? id,
    required this.sender,
    required this.text,
    DateTime? timestamp,
    this.actions = const [],
    this.memoriesUsed = const [],
  })  : id = id ?? const Uuid().v4(),
        timestamp = timestamp ?? DateTime.now();
}
