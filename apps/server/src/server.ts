import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GAME_VERSION, type ClientToServer, type ServerInfo, type ServerToClient } from '@phantom/shared';
import { getLanUrls } from './networking/lan';
import { RoomManager } from './rooms/room-manager';

export interface GameServerOptions {
  port: number;
  host: string;
  /** directory containing the built client; defaults to apps/client/dist */
  staticDir?: string;
}

export function resolveClientDist() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, '../../client/dist'), path.resolve(process.cwd(), 'apps/client/dist')];
  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) ?? null;
}

export function createGameServer(opts: GameServerOptions) {
  const app = express();
  app.disable('x-powered-by');
  const server = http.createServer(app);
  const io = new Server<ClientToServer, ServerToClient>(server, {
    cors: { origin: true },
    maxHttpBufferSize: 64 * 1024,
    pingInterval: 10_000,
    pingTimeout: 20_000,
  });
  let actualPort = opts.port;
  const lanUrls = () => (opts.host === '127.0.0.1' || opts.host === 'localhost' ? [] : getLanUrls(actualPort));
  const rooms = new RoomManager(io, lanUrls);

  const info = (): ServerInfo => ({ name: 'Project Phantom', version: GAME_VERSION, lanUrls: lanUrls(), port: actualPort, rooms: rooms.rooms.size });
  io.on('connection', (s) => s.emit('server:info', info()));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: GAME_VERSION, uptime: process.uptime() });
  });
  app.get('/api/info', (_req, res) => {
    res.json(info());
  });
  app.get('/api/rooms', (_req, res) => {
    res.json(rooms.publicRooms());
  });

  const dist = opts.staticDir ?? resolveClientDist();
  if (dist) {
    app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
    app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (_req, res) => {
      res
        .type('html')
        .send(
          '<body style="background:#111;color:#ddd;font-family:sans-serif;padding:40px"><h1>Project Phantom server is running</h1>' +
            '<p>The client has not been built yet. Run <code>npm run build</code> (or use <code>npm run dev</code> and open the Vite URL).</p></body>',
        );
    });
  }

  return {
    app,
    server,
    io,
    rooms,
    clientDist: dist,
    listen(): Promise<number> {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(opts.port, opts.host, () => {
          const addr = server.address();
          actualPort = typeof addr === 'object' && addr ? addr.port : opts.port;
          server.off('error', reject);
          resolve(actualPort);
        });
      });
    },
    async close() {
      io.emit('server:shutdown', 'The host stopped the server.');
      rooms.dispose();
      await new Promise<void>((r) => io.close(() => r()));
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
