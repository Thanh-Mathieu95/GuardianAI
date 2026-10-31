import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proxy } from './worker.mjs';
const env = { BACKEND_ORIGIN: 'https://backend.example.test' };

test('Proxy rejects missing, invalid and self-referencing upstreams', async () => {
  for (const value of [undefined, 'http://backend.example.test', 'https://u:p@backend.example.test',
    'https://backend.example.test/path', 'https://backend.example.test?key=x', 'https://public.example.test']) {
    const response = await proxy(new Request('https://public.example.test/'), { BACKEND_ORIGIN: value },
      () => { throw new Error('Must not fetch'); });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('Forwarding keeps session, Origin and body, replaces forged forwarding headers, and never follows redirects', async () => {
  const req = new Request('https://public.example.test/api/incidents?mode=demo', {
    method: 'POST', body: '{"scenario":"NIGHT_WALK"}', headers: {
      Cookie: 'guardian=test-session', Origin: 'https://public.example.test',
      'x-forwarded-host': 'forged.example.test', Forwarded: 'host=forged.example.test',
    },
  });
  const response = await proxy(req, env, async (url, options) => {
    assert.equal(url, 'https://backend.example.test/api/incidents?mode=demo');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.get('x-forwarded-host'), 'public.example.test');
    assert.equal(options.headers.get('forwarded'), null);
    assert.equal(options.headers.get('cookie'), 'guardian=test-session');
    assert.equal(options.headers.get('origin'), 'https://public.example.test');
    assert.equal(await new Response(options.body).text(), '{"scenario":"NIGHT_WALK"}');
    return new Response('ok', { headers: { 'Set-Cookie': 'guardian=new; HttpOnly; Secure; SameSite=Lax' } });
  });
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('Leading double slash stays on the configured backend and same-origin redirects use the public host', async () => {
  const response = await proxy(new Request('https://public.example.test//other.example.test/a'), env,
    async url => {
      assert.equal(new URL(url).origin, env.BACKEND_ORIGIN);
      return new Response(null, { status: 302, headers: { Location: env.BACKEND_ORIGIN + '/demo/phone' } });
    });
  assert.equal(response.headers.get('location'), 'https://public.example.test/demo/phone');
});

test('SSE body remains streamed and backend failures do not reveal details', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {}\n\n')); controller.close(); } });
  const response = await proxy(new Request('https://public.example.test/api/events'), env,
    async () => new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  assert.equal(await response.text(), 'data: {}\n\n');
  const failed = await proxy(new Request('https://public.example.test/'), env,
    async () => { throw new Error('private backend details'); });
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('private backend details'));
});
