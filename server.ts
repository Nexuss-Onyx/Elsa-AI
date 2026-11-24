import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, type FunctionCall, type Part } from '@google/genai';
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
import {
  buildOAuthCallbackHtml,
  createAgentToolSession,
  disconnectConnector,
  initiateConnectorAuth,
  isComposioConfigured,
  listComposioCategories,
  listComposioToolkits,
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
  normalizeUserId,
  resolveCallbackOrigin,
  type AgentToolSession,
} from './src/lib/composioServer.ts';

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

  app.get('/api/composio/categories', async (_req: Request, res: Response) => {
    if (!isComposioConfigured()) {
      res.json({ configured: false, categories: [] });
      return;
    }
    try {
      const categories = await listComposioCategories();
      res.json({ configured: true, categories });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load connector categories.';
      res.status(502).json({ configured: true, categories: [], error: message });
    }
  });

  app.get('/api/composio/toolkits', async (req: Request, res: Response) => {
    const userId = normalizeUserId(req.query.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid userId.' });
      return;
    }

    if (!isComposioConfigured()) {
      res.json({
        configured: false,
        items: [],
        cursor: null,
        totalPages: 1,
      });
      return;
    }

    try {
      const search = typeof req.query.search === 'string' ? req.query.search : '';
      const category = typeof req.query.category === 'string' ? req.query.category : '';
      const connectedOnly = req.query.connectedOnly === 'true';
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
      const rawLimit = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : 36;
      const limit = Number.isFinite(rawLimit) ? rawLimit : 36;
      const origin = resolveCallbackOrigin(req.query.clientOrigin);

      const data = await listComposioToolkits({
        userId,
        origin,
        search,
        category,
        connectedOnly,
        cursor,
        limit,
      });

      res.json({
        configured: true,
        ...data,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Composio connectors.';
      res.status(502).json({
        configured: true,
        items: [],
        cursor: null,
        totalPages: 1,
        error: message,
      });
    }
  });

  app.post('/api/composio/connect', async (req: Request, res: Response) => {
    if (!isComposioConfigured()) {
      res.status(503).json({
        error: 'Composio API key is not configured. Add COMPOSIO_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const body = (req.body ?? {}) as {
      userId?: unknown;
      toolkitSlug?: unknown;
      clientOrigin?: unknown;
    };

    const userId = normalizeUserId(body.userId);
    const toolkitSlug = normalizeToolkitSlug(body.toolkitSlug);
    if (!userId || !toolkitSlug) {
      res.status(400).json({ error: 'Valid userId and toolkitSlug are required.' });
      return;
    }

    try {
      const origin = resolveCallbackOrigin(body.clientOrigin);
      const result = await initiateConnectorAuth({ userId, toolkitSlug, origin });
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start connector authorization.';
      res.status(502).json({ error: message });
    }
  });

  app.get(['/api/composio/callback', '/api/composio/callback/'], (req: Request, res: Response) => {
    const toolkit = typeof req.query.toolkit === 'string' ? req.query.toolkit : '';
    const error = typeof req.query.error === 'string' ? req.query.error : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const ok = !error && status.toLowerCase() !== 'failed';

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildOAuthCallbackHtml({ toolkit, ok, error }));
  });

  app.delete('/api/composio/connections/:connectionId', async (req: Request, res: Response) => {
    if (!isComposioConfigured()) {
      res.status(503).json({ error: 'Composio API key is not configured.' });
      return;
    }

    const connectionId = typeof req.params.connectionId === 'string' ? req.params.connectionId.trim() : '';
    if (!/^[a-zA-Z0-9_-]{4,120}$/.test(connectionId)) {
      res.status(400).json({ error: 'Invalid connectionId.' });
      return;
    }

    const userId = normalizeUserId(req.query.userId ?? (req.body as { userId?: unknown } | undefined)?.userId);
    if (!userId) {
      res.status(400).json({ error: 'Invalid userId.' });
      return;
    }

    try {
      const deleted = await disconnectConnector({ userId, connectionId });
      if (!deleted) {
        res.status(404).json({ error: 'Connected account not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disconnect app.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      messages?: Array<{ role?: string; text?: string }>;
      userId?: unknown;
      enabledToolkits?: unknown;
      clientOrigin?: unknown;
    };

    const turns = sanitizeChatHistory(Array.isArray(body.messages) ? body.messages : []);
    if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
      res.status(400).json({
        error: 'እባክዎ መጀመሪያ መልእክት ይጻፉ።',
      });
      return;
    }

    const userId = normalizeUserId(body.userId);
    if (!userId) {
      res.status(400).json({
        error: 'ልክ ያልሆነ የተጠቃሚ መለያ።',
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

    const enabledToolkits = normalizeToolkitSlugs(body.enabledToolkits);
    const origin = resolveCallbackOrigin(body.clientOrigin);

    let agentSession: AgentToolSession | null = null;
    if (enabledToolkits.length > 0 && isComposioConfigured()) {
      try {
        agentSession = await createAgentToolSession({
          userId,
          enabledToolkits,
          origin,
        });
      } catch (err) {
        console.warn('Composio session initialization skipped:', err instanceof Error ? err.message : err);
      }
    }

    const activeConnectorList = agentSession && agentSession.tools.length > 0 ? enabledToolkits : [];
    const systemInstruction = buildElsaSystemInstruction(activeConnectorList);
    const estimatedInputTokens = estimateRequestTokens(systemInstruction, turns, 1024);

    let closed = false;
    const requestAbortController = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        requestAbortController.abort();
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
        timeout: agentSession ? 30_000 : 12_000,
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
    let executedAnyTool = false;
    let lastStatus = 500;

    for (const candidate of candidates) {
      if (closed) break;

      const attemptStart = Date.now();
      modelRouter.recordAttempt(candidate.id, estimatedInputTokens, attemptStart);

      const attemptController = new AbortController();
      const onRequestAbort = () => attemptController.abort();
      requestAbortController.signal.addEventListener('abort', onRequestAbort, { once: true });

      const firstChunkTimer = setTimeout(() => {
        attemptController.abort(new Error('Upstream tier timeout (503)'));
      }, 10_000);

      try {
        let outputText = '';

        if (agentSession && agentSession.tools.length > 0) {
          const history = turns.slice(0, -1);
          const latestUserText = turns[turns.length - 1].parts[0].text;
          const chat = ai.chats.create({
            model: candidate.id,
            history,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: agentSession.tools }],
            },
          });

          let nextMessage: string | Part[] = latestUserText;
          const MAX_TOOL_ROUNDS = 8;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
            if (closed) break;

            const stream = await chat.sendMessageStream({
              message: nextMessage,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations: agentSession.tools }],
                abortSignal: round === 0 ? attemptController.signal : requestAbortController.signal,
              },
            });

            const pendingCalls: FunctionCall[] = [];
            for await (const chunk of stream) {
              if (closed) break;
              if (Array.isArray(chunk.functionCalls) && chunk.functionCalls.length > 0) {
                if (!streamedAnyChunk && !executedAnyTool) {
                  clearTimeout(firstChunkTimer);
                }
                for (const fc of chunk.functionCalls) {
                  pendingCalls.push(fc);
                }
              }
              const text = chunk.text;
              if (typeof text === 'string' && text.length > 0) {
                if (!streamedAnyChunk && !executedAnyTool) {
                  clearTimeout(firstChunkTimer);
                }
                streamedAnyChunk = true;
                outputText += text;
                writeEvent({ type: 'chunk', text });
              }
            }

            if (closed || pendingCalls.length === 0) {
              break;
            }

            executedAnyTool = true;
            writeEvent({
              type: 'tool_status',
              tools: pendingCalls.map((fc) => fc.name || 'connector_tool'),
            });

            const responseParts: Part[] = [];
            for (const fc of pendingCalls) {
              if (closed) break;
              let parsedResult: unknown;
              try {
                const rawResult = await agentSession.executeToolCall({
                  name: fc.name ?? '',
                  args: (fc.args ?? {}) as Record<string, unknown>,
                });
                try {
                  parsedResult = JSON.parse(rawResult);
                } catch {
                  parsedResult = rawResult;
                }
              } catch (toolErr) {
                parsedResult = {
                  error: toolErr instanceof Error ? toolErr.message : 'Tool execution failed',
                };
              }

              responseParts.push({
                functionResponse: {
                  id: fc.id,
                  name: fc.name,
                  response: { result: parsedResult },
                },
              });
            }

            nextMessage = responseParts;
          }
        } else {
          const stream = await ai.models.generateContentStream({
            model: candidate.id,
            contents: turns,
            config: {
              systemInstruction,
              abortSignal: attemptController.signal,
            },
          });

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
        }

        clearTimeout(firstChunkTimer);
        requestAbortController.signal.removeEventListener('abort', onRequestAbort);

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
        requestAbortController.signal.removeEventListener('abort', onRequestAbort);
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

        // If partial chunks or tool executions already happened, stop rather than mixing partial outputs
        if (streamedAnyChunk || executedAnyTool) {
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
