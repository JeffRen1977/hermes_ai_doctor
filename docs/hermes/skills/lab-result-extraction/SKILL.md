---
name: lab-result-extraction
description: >-
  Turn pasted lab report text into strict JSON for programmatic use; does not
  replace clinician review. Pair with health_analyze_text or Node-side Joi if needed.
---

# Lab result extraction (strict JSON)

## Input

- Raw text: OCR output, user paste, or `health_analyze_text` summary source text.
- Optional: `userId` for trace only (do not echo PHI in logs).

## Workflow

1. If the task is **individualized** (this user’s labs tied to care advice), call **`health_chat_guard`** first; if false, refuse individualized interpretation and only offer generic education.

2. Extract structured data from the lab text.

## Output schema

Return **only** valid JSON (no markdown fences):

```json
{
  "document": {
    "title": "string|null",
    "collectionDate": "YYYY-MM-DD|null",
    "facility": "string|null"
  },
  "patient": {
    "name": "string|null",
    "age": "number|null",
    "sex": "male|female|unknown|null"
  },
  "tests": [
    {
      "name": "string",
      "code": "string|null",
      "value": "string|number|null",
      "unit": "string|null",
      "referenceRange": "string|null",
      "flag": "high|low|abnormal|normal|unknown|null",
      "notes": "string|null"
    }
  ],
  "confidence": "high|medium|low",
  "warnings": ["string"]
}
```

## Rules

- If a field is unknown, use `null` or `unknown` — never invent numeric results.
- `warnings`: e.g. partial OCR, conflicting units, missing specimen date.
- Downstream: Node can map this JSON into internal models or re-validate with Joi before storage.
