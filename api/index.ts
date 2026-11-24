import type { Request, Response } from 'express';
import { createApiApp } from '../src/lib/createApp.ts';

const app = createApiApp();

export function normalizeVercelApiUrl(rawUrl: string | undefined): string {
  const url = new URL(rawUrl || '/api', 'http://localhost');
  const forwardedPath = url.searchParams.get('__elsa_path');

  if (forwardedPath !== null) {
    url.searchParams.delete('__elsa_path');
    const cleanSubpath = forwardedPath.replace(/^\/+/, '');
    const nextPathname = cleanSubpath ? `/api/${cleanSubpath}` : '/api';
    const query = url.searchParams.toString();
    return query ? `${nextPathname}?${query}` : nextPathname;
  }

  if (!url.pathname.startsWith('/api')) {
    const cleanPathname = url.pathname.replace(/^\/+/, '');
    const nextPathname = cleanPathname ? `/api/${cleanPathname}` : '/api';
    const query = url.searchParams.toString();
    return query ? `${nextPathname}?${query}` : nextPathname;
  }

  return `${url.pathname}${url.search}`;
}

export default function handler(req: Request, res: Response) {
  req.url = normalizeVercelApiUrl(req.url);
  if (req.query && typeof req.query === 'object' && '__elsa_path' in req.query) {
    try {
      delete (req.query as Record<string, unknown>).__elsa_path;
    } catch {
      // Ignore if Vercel exposes a read-only req.query getter
    }
  }
  return app(req, res);
}
