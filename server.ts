import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI } from '@google/genai';
import {
  TieredModelRouter,
  estimateRequestTokens,
  estimateTextTokens,
} from './src/lib/modelRouter.ts';
import {
  buildElsaSystemInstruction,
  buildElsaTitleSystemInstruction,
  buildTitlePromptFromTurns,
  sanitizeChatHistory,
  sanitizeGeneratedTitle,
} from './src/lib/promptBuilder.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const modelRouter = new TieredModelRouter();

function classifyErrorStatus(err: unknown): number {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes('403') ||
    lower.includes('permission_denied') ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid')
  ) {
    return 403;
  }
  if (lower.includes('429') || lower.includes('resource_exhausted') || lower.includes('quota')) {
    return 429;
  }
  if (lower.includes('404') || lower.includes('not_found')) {
    return 404;
  }
  if (lower.includes('503') || lower.includes('unavailable') || lower.includes('high demand')) {
    return 503;
  }
  return 500;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: 'elsa-ai',
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      messages?: Array<{ role?: string; text?: string }>;
    };

    const turns = sanitizeChatHistory(Array.isArray(body.messages) ? body.messages : []);
    if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
      res.status(400).json({
        error: 'እባክዎ መጀመሪያ መልእክት ይጻፉ።',
      });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({
        error: 'የኤልሳ AI አገልግሎት ቁልፍ አልተዋቀረም። እባክዎ በ Settings > Secrets ውስጥ ያስተካክሉ።',
      });
      return;
    }

    const systemInstruction = buildElsaSystemInstruction();
    const estimatedInputTokens = estimateRequestTokens(systemInstruction, turns, 1024);

    let closed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
      }
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (payload: Record<string, unknown>) => {
      if (!closed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        timeout: 12_000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const candidates = modelRouter.getCandidateOrder({
      estimatedTokens: estimatedInputTokens,
      now: Date.now(),
    });

    let streamedAnyChunk = false;
    let lastStatus = 500;

    for (const candidate of candidates) {
      if (closed) break;

      const attemptStart = Date.now();
      modelRouter.recordAttempt(candidate.id, estimatedInputTokens, attemptStart);

      const attemptController = new AbortController();
      const firstChunkTimer = setTimeout(() => {
        attemptController.abort(new Error('Upstream tier timeout (503)'));
      }, 10_000);

      try {
        const stream = await ai.models.generateContentStream({
          model: candidate.id,
          contents: turns,
          config: {
            systemInstruction,
            abortSignal: attemptController.signal,
          },
        });

        let outputText = '';
        for await (const chunk of stream) {
          if (closed) break;
          const text = chunk.text;
          if (typeof text === 'string' && text.length > 0) {
            if (!streamedAnyChunk) {
              clearTimeout(firstChunkTimer);
            }
            streamedAnyChunk = true;
            outputText += text;
            writeEvent({ type: 'chunk', text });
          }
        }
        clearTimeout(firstChunkTimer);

        if (closed) break;

        if (!outputText.trim()) {
          modelRouter.markFailure(candidate.id, 500, Date.now());
          continue;
        }

        modelRouter.recordCompletionTokens(
          candidate.id,
          estimateTextTokens(outputText),
          Date.now(),
        );
        writeEvent({ type: 'done' });
        if (!res.writableEnded) {
          res.end();
        }
        return;
      } catch (err) {
        clearTimeout(firstChunkTimer);
        const status = classifyErrorStatus(err);
        lastStatus = status;

        if (status === 403) {
          writeEvent({
            type: 'error',
            status: 403,
            message: 'የአገልግሎት ቁልፍ ፈቃድ የለውም። እባክዎ በ Settings > Secrets ውስጥ ያረጋግጡ።',
          });
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }

        modelRouter.markFailure(candidate.id, status, Date.now());

        // If partial chunks were already sent to the client, stop rather than mixing partial outputs
        if (streamedAnyChunk) {
          writeEvent({
            type: 'error',
            status,
            message: 'ምላሹ ተቋርጧል። እባክዎ እንደገና ይሞክሩ።',
          });
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        // Otherwise silently fall through and retry with the next tier model
      }
    }

    if (!closed && !res.writableEnded) {
      writeEvent({
        type: 'error',
        status: lastStatus,
        message: 'ኤልሳ AI አሁን ምላሽ መስጠት አልቻለችም። እባክዎ ከጥቂት ሰከንዶች በኋላ እንደገና ይሞክሩ።',
      });
      res.end();
    }
  });

  app.post('/api/title', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      messages?: Array<{ role?: string; text?: string }>;
    };

    const turns = sanitizeChatHistory(Array.isArray(body.messages) ? body.messages : []);
    if (turns.length === 0) {
      res.status(400).json({ title: null });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      res.status(500).json({ title: null });
      return;
    }

    const systemInstruction = buildElsaTitleSystemInstruction();
    const titlePrompt = buildTitlePromptFromTurns(turns);
    const estimatedInputTokens =
      estimateTextTokens(systemInstruction) + estimateTextTokens(titlePrompt) + 64;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        timeout: 10_000,
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const candidates = modelRouter.getCandidateOrder({
      estimatedTokens: estimatedInputTokens,
      now: Date.now(),
    });

    for (const candidate of candidates) {
      const attemptStart = Date.now();
      modelRouter.recordAttempt(candidate.id, estimatedInputTokens, attemptStart);

      const attemptController = new AbortController();
      const timer = setTimeout(() => {
        attemptController.abort(new Error('Title generation timeout (503)'));
      }, 8_000);

      try {
        const result = await ai.models.generateContent({
          model: candidate.id,
          contents: titlePrompt,
          config: {
            systemInstruction,
            maxOutputTokens: 48,
            abortSignal: attemptController.signal,
          },
        });
        clearTimeout(timer);

        const rawTitle = result.text ?? '';
        const title = sanitizeGeneratedTitle(rawTitle);
        if (!title) {
          modelRouter.markFailure(candidate.id, 500, Date.now());
          continue;
        }

        modelRouter.recordCompletionTokens(
          candidate.id,
          estimateTextTokens(rawTitle),
          Date.now(),
        );
        res.json({ title });
        return;
      } catch (err) {
        clearTimeout(timer);
        const status = classifyErrorStatus(err);
        if (status === 403) {
          res.status(403).json({ title: null });
          return;
        }
        modelRouter.markFailure(candidate.id, status, Date.now());
      }
    }

    res.json({ title: null });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Elsa AI server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Elsa AI server:', err);
  process.exit(1);
});
