# M3 Tool Call Strategy

## Health chat flow

1. Receive user message and internal `userId`.
2. Call:

```json
{
  "tool": "health_chat_guard",
  "arguments": {
    "userId": "<sanitized_user_id>",
    "options": {
      "medications": true,
      "vitalsRecent": true,
      "chatRecent": true,
      "language": "zh"
    }
  }
}
```

3. Branch:
   - If `canAnswerHealthQuestion=false`: return `fallbackMessage`.
   - If `canAnswerHealthQuestion=true`: continue with response generation using `contextResult.systemPromptContext`.

4. Optional downstream tools:
   - `health_analyze_text` for deeper medical text analysis.
   - `risk_detect_anomalies` for wearable trend checks.

## Daily report flow (M5+)

1. `health_chat_guard` (or `health_context_get`) for base context.
2. Optional `risk_detect_anomalies`.
3. `report_generate` to generate and persist report.
