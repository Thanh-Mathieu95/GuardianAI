function unavailable() {
  return new Response('Guardian AI chưa sẵn sàng. Vui lòng thử lại sau.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Cloudflare is the public entry point; the Node service renders the app and
// owns its API/engine. Do not run a second SQLite-backed engine in a Worker.
export async function proxy(request, env, transport = fetch) {
  let backend;
  try {
    backend = new URL(env.BACKEND_ORIGIN);
    if (backend.protocol !== 'https:' || backend.username || backend.password ||
        backend.pathname !== '/' || backend.search || backend.hash) return unavailable();
  } catch { return unavailable(); }
  const incoming = new URL(request.url);
  if (incoming.origin === backend.origin) return unavailable();
  // Assign path/search individually so a path beginning with // cannot replace
  // the configured upstream origin.
  const target = new URL(backend.origin);
  target.pathname = incoming.pathname;
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('forwarded');
  headers.delete('x-forwarded-for');
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', 'https');
  const options = { method: request.method, headers, redirect: 'manual', signal: request.signal };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    options.body = request.body;
    options.duplex = 'half';
  }
  let upstream;
  try { upstream = await transport(target.href, options); }
  catch { return unavailable(); }
  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.set('Cache-Control', 'no-store');
  const location = responseHeaders.get('Location');
  if (location) {
    try {
      const redirect = new URL(location, target);
      if (redirect.origin === backend.origin) {
        redirect.protocol = incoming.protocol;
        redirect.host = incoming.host;
        responseHeaders.set('Location', redirect.href);
      }
    } catch { /* Preserve an upstream header without interpreting it. */ }
  }
  // Pass through the body stream: do not buffer SSE or recording downloads.
  return new Response(upstream.body, {
    status: upstream.status, statusText: upstream.statusText, headers: responseHeaders,
  });
}

export default {
  fetch(request, env) { return proxy(request, env); },
};
