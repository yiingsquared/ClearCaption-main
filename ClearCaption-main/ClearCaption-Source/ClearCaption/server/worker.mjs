import { handleAPI } from './api.mjs';
import assets from '../.generated/assets.json';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
      return handleAPI(request, env);
    }
    const name = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const asset = assets[name];
    if (!asset) return new Response('Not found', { status: 404 });
    return new Response(asset.content, { headers: { 'Content-Type': asset.type,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
  },
};
