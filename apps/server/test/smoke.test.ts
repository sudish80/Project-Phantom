import { describe, expect, it } from 'vitest';
import { setQuiet } from '../src/log';
import { createGameServer, resolveClientDist } from '../src/server';

setQuiet(true);

describe('smoke: backend + frontend start', () => {
  it('starts, serves health/info, serves the client (or a build hint), and shuts down cleanly', async () => {
    const game = createGameServer({ port: 0, host: '127.0.0.1' });
    const port = await game.listen();
    const base = `http://127.0.0.1:${port}`;
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    const info = (await (await fetch(`${base}/api/info`)).json()) as { port: number; lanUrls: string[] };
    expect(info.port).toBe(port);
    expect(info.lanUrls).toEqual([]); // bound to localhost => no LAN URLs advertised
    const html = await (await fetch(`${base}/`)).text();
    if (resolveClientDist()) {
      expect(html).toContain('<div id="root">');
      const js = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
      expect(js).toBeTruthy();
      expect((await fetch(base + js)).status).toBe(200);
    } else expect(html).toContain('npm run build');
    await game.close();
  });

  it('reports port conflicts instead of crashing', async () => {
    const a = createGameServer({ port: 0, host: '127.0.0.1' });
    const port = await a.listen();
    const b = createGameServer({ port, host: '127.0.0.1' });
    await expect(b.listen()).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await a.close();
  });
});
