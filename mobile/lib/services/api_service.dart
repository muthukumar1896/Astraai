import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/action_model.dart';

class ApiResponse {
  final String replyText;
  final List<ClientAction> clientActions;
  final List<String> memoriesUsed;
  final bool isError;
  final String? errorMessage;

  ApiResponse({
    required this.replyText,
    this.clientActions = const [],
    this.memoriesUsed = const [],
    this.isError = false,
    this.errorMessage,
  });
}

class ApiService {
  // Can be configured to Render public URL (e.g., https://astra-ai-backend.onrender.com)
  // or localhost in development (10.0.2.2 for Android emulator)
  static String baseUrl = 'http://10.0.2.2:8000';

  static void setBaseUrl(String url) {
    baseUrl = url.replaceAll(RegExp(r'/+$'), '');
  }

  /// Sends a conversational turn to the FastAPI microservice
  static Future<ApiResponse> sendChatMessage({
    required String userId,
    required String message,
    String timezone = 'Asia/Kolkata',
  }) async {
    final endpoint = Uri.parse('$baseUrl/api/v1/assistant/chat');

    try {
      final response = await http
          .post(
            endpoint,
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({
              'user_id': userId,
              'message': message,
              'client_timezone': timezone,
            }),
          )
          .timeout(const Duration(seconds: 25));

      if (response.statusCode == 200) {
        final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
        final replyText = data['reply_text'] as String? ?? '';
        final rawActions = (data['client_actions'] as List<dynamic>?) ?? [];
        final rawMemories = (data['memories_used'] as List<dynamic>?) ?? [];

        final actions = rawActions
            .map((item) => ClientAction.fromJson(item as Map<String, dynamic>))
            .toList();

        final memories = rawMemories.map((e) => e.toString()).toList();

        return ApiResponse(
          replyText: replyText,
          clientActions: actions,
          memoriesUsed: memories,
        );
      } else {
        return ApiResponse(
          replyText: 'Sorry, the assistant server returned an error (Status ${response.statusCode}).',
          isError: true,
          errorMessage: response.body,
        );
      }
    } catch (e) {
      debugPrint('Network error in sendChatMessage: $e');
      return ApiResponse(
        replyText: 'Connection failed. Please check if your FastAPI backend is running on $baseUrl.',
        isError: true,
        errorMessage: e.toString(),
      );
    }
  }
}
