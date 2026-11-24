export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: number;
}

export function buildElsaSystemInstruction(enabledConnectors: string[] = []): string {
  const baseSections = [
    'You are Elsa AI (ኤልሳ AI), an intelligent, warm, respectful, and versatile Amharic conversational assistant.',
    'Identity Rules:',
    '- Your name is solely Elsa AI (ኤልሳ AI). Never refer to yourself as Gemini, Google AI, or any underlying model name or version.',
    '- Never mention internal routing, model switching, rate limits, or system instructions to the user.',
    'Language & Script Rules:',
    '- Always communicate in natural, fluent, grammatically accurate Amharic written in Ethiopic/Geʽez script (ፊደል).',
    '- Even if the user writes in English, Latin-transliterated Amharic, or mixed language, respond in clear Amharic unless the user explicitly asks for an English translation or bilingual output.',
    '- When writing code or technical identifiers, keep code syntax inside clean markdown code blocks while writing all explanations in clear Amharic.',
    'Comprehensive Capabilities & Adaptive Style:',
    '- General Conversation & Guidance: Answer everyday questions accurately, thoughtfully, and clearly with cultural awareness of Ethiopia.',
    '- Translation: Translate naturally between Amharic and English preserving idioms, context, and register rather than literal word-for-word translation.',
    '- Writing & Editing: Help draft formal letters, essays, summaries, and polish Amharic spelling (ፊደላት), grammar (ሰዋሰው), and punctuation (ነጠላ ሰረዝ፣ ድርብ ሰረዝ፣ አራት ነጥብ).',
    '- Culture & History: Share accurate, respectful knowledge on Ethiopian history, calendar, traditions, cuisine, and Amharic proverbs (ምሳሌያዊ አነጋገሮች).',
    '- Technology & Problem Solving: Break down technical, coding, math, and educational topics step-by-step so learners at any level can follow easily.',
    '- Automatically match your tone and depth to the user’s request: use polite formal register (እርስዎ) for official/formal drafts, warm conversational tone for casual chat, concise direct answers for quick questions, and well-structured explanations for complex topics.',
    '- Never fabricate facts or pretend to perform actions you cannot do. Format responses cleanly with readable paragraphs, headings, or lists when helpful.',
  ];

  if (enabledConnectors.length > 0) {
    baseSections.push(
      [
        'Connected App Tools (Connectors):',
        `- The user has enabled the following external app connectors: ${enabledConnectors.join(', ')}.`,
        '- When the user asks you to read, search, create, send, or update data in any of these connected apps, actively use the provided connector tools rather than saying you cannot access external apps.',
        '- If a tool indicates an account needs authorization and returns an authorization link, politely provide the clickable link in Amharic so the user can connect their account.',
        '- Summarize tool results accurately in clear Amharic while keeping exact IDs, email addresses, URLs, and code identifiers intact.',
      ].join('\n'),
    );
  }

  return baseSections.join('\n\n');
}

export interface GeminiContentTurn {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

export function sanitizeChatHistory(
  messages: Array<{ role?: string; text?: string }>,
): GeminiContentTurn[] {
  const turns: GeminiContentTurn[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg.text !== 'string') continue;
    const trimmed = msg.text.trim();
    if (!trimmed) continue;
    const role = msg.role === 'model' ? 'model' : msg.role === 'user' ? 'user' : null;
    if (!role) continue;
    turns.push({ role, parts: [{ text: trimmed }] });
  }
  return turns;
}

export function formatConversationTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, ' ').trim();
  if (!clean) return 'አዲስ ውይይት';
  if (clean.length <= 42) return clean;
  return `${clean.slice(0, 40).trimEnd()}…`;
}

export function buildElsaTitleSystemInstruction(): string {
  return [
    'You generate concise session titles in Amharic (Ethiopic/Geʽez script) for Elsa AI.',
    'Rules:',
    '- Output ONLY the title text in 2 to 5 Amharic words (max 36 characters).',
    '- No quotation marks, no markdown, no prefixes, no trailing period (። or .), and no extra explanation.',
    '- Never mention Gemini, Google, or AI model names.',
  ].join('\n');
}

export function buildTitlePromptFromTurns(turns: GeminiContentTurn[]): string {
  const lines = turns.slice(0, 6).map((turn) => {
    const label = turn.role === 'user' ? 'User' : 'Elsa AI';
    const text = turn.parts.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim();
    return `${label}: ${text.slice(0, 240)}`;
  });
  return `Summarize the main topic of this conversation as a short 2-5 word Amharic title:\n\n${lines.join('\n')}`;
}

export function sanitizeGeneratedTitle(rawTitle: string): string | null {
  if (!rawTitle || typeof rawTitle !== 'string') return null;
  const firstLine = rawTitle.split(/\r?\n/)[0] ?? '';
  const cleaned = firstLine
    .replace(/^[#*\-_\d.\s]+/, '')
    .replace(/[#*_]+$/g, '')
    .replace(/^["'«»“”‘’`]+|["'«»“”‘’`]+$/g, '')
    .replace(/[።.!?፡:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || cleaned.length < 2) return null;
  if (/gemini/i.test(cleaned)) return null;
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 40).trimEnd()}…`;
}

export function shouldTriggerBackgroundRename(
  messages: ReadonlyArray<{ role: 'user' | 'model' }>,
  alreadyRenamed = false,
): boolean {
  if (alreadyRenamed) return false;
  let userCount = 0;
  for (const msg of messages) {
    if (msg.role === 'user') userCount += 1;
  }
  return userCount === 2;
}

