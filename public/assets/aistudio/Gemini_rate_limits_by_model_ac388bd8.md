# Gemini rate limits by model

Peak usage per model compared with its limit over the last 28 days. Models with `0 / 0` for all three rate-limit measures have been excluded.

| Model | Category | RPM (peak / limit) | TPM (peak / limit) | RPD (peak / limit) | GenerateContent endpoint |
|---|---|---:|---:|---:|---|
| Gemini 2.5 Flash | Text-out models | 0 / 5 | 0 / 250K | 0 / 20 | `POST /v1beta/models/gemini-2.5-flash:generateContent` |
| Gemini 2.5 Flash Lite | Text-out models | 0 / 10 | 0 / 250K | 0 / 20 | `POST /v1beta/models/gemini-2.5-flash-lite:generateContent` |
| Gemini 3 Flash | Text-out models | 0 / 5 | 0 / 250K | 0 / 20 | `POST /v1beta/models/gemini-3-flash-preview:generateContent` |
| Gemini 3.1 Flash Lite | Text-out models | 0 / 15 | 0 / 250K | 0 / 500 | `POST /v1beta/models/gemini-3.1-flash-lite:generateContent` |
| Gemini 3.6 Flash | Text-out models | 0 / 5 | 0 / 250K | 0 / 20 | `POST /v1beta/models/gemini-3.6-flash:generateContent` |
| Gemini 3.5 Flash Lite | Text-out models | 0 / 15 | 0 / 250K | 0 / 500 | `POST /v1beta/models/gemini-3.5-flash-lite:generateContent` |
| Gemini 3.8 Flash | Text-out models | 0 / 5 | 0 / 250K | 0 / 20 | `POST /v1beta/models/gemini-3.8-flash:generateContent` |
| Gemini 4 Hydrogen | Text-out models | 0 / 5 | 0 / 250K | 0 / 20 | `POST /v1beta/models/gemini-4-hydrogen:generateContent` |

Full REST URL pattern: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
