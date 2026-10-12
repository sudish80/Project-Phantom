import { DEFAULT_PORT } from '@phantom/shared';
import { log } from './log';
import { getLanUrls } from './networking/lan';
import { createGameServer } from './server';

function parseArgs(argv: string[]) {
  const args = { lan: false, port: Number(process.env.PORT) || DEFAULT_PORT, host: process.env.HOST ?? '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lan') args.lan = true;
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) args.port = Number(a.slice(7));
    else if (a === '--host') args.host = argv[++i];
    else if (a.startsWith('--host=')) args.host = a.slice(7);
  }
  if (!args.host) args.host = args.lan || process.env.LAN === '1' ? '0.0.0.0' : '127.0.0.1';
  if (!Number.isInteger(args.port) || args.port <= 0 || args.port > 65535) {
    log.error(`Invalid port "${args.port}". Use --port 3000 or PORT=3000.`);
    process.exit(1);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const game = createGameServer({ port: args.port, host: args.host });
  let port: number;
  try {
    port = await game.listen();
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      log.error(`Port ${args.port} is already in use. Stop the other process or choose another port: PORT=3001 npm run serve:lan`);
    } else if (err?.code === 'EACCES') {
      log.error(`Permission denied for port ${args.port}. Use a port above 1024.`);
    } else log.error('Server failed to start:', err?.message ?? err);
    process.exit(1);
  }

  const line = '─'.repeat(64);
  console.log(`\n${line}\n  PROJECT PHANTOM — game server online\n${line}`);
  console.log(`  Local:    http://localhost:${port}`);
  const lan = args.host === '127.0.0.1' || args.host === 'localhost' ? [] : getLanUrls(port);
  if (lan.length) {
    lan.forEach((u, i) => console.log(`  ${i === 0 ? 'LAN:  ' : '      '}    ${u}${i === 0 ? '   ← share this with players on your Wi-Fi' : ''}`));
    console.log(`\n  Firewall: allow inbound TCP port ${port} on PRIVATE networks only.`);
    console.log('    Windows: allow Node.js when prompted (Private networks), or run as admin:');
    console.log(`      netsh advfirewall firewall add rule name="Project Phantom" dir=in action=allow protocol=TCP localport=${port} profile=private`);
    console.log(`    macOS:   System Settings → Network → Firewall → allow incoming for "node"`);
    console.log(`    Linux:   sudo ufw allow ${port}/tcp`);
  } else if (args.host === '0.0.0.0') {
    console.log('  LAN:      no private IPv4 address detected — are you connected to Wi-Fi?');
  } else {
    console.log('  LAN:      disabled (bound to localhost). Use `npm run start:lan` to accept LAN players.');
  }
  if (!game.clientDist) console.log('\n  ⚠ Client build not found. Run `npm run build` first.');
  console.log(`${line}\n`);

  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    log.info(`${sig} received, shutting down…`);
    const force = setTimeout(() => process.exit(0), 3000);
    await game.close().catch(() => {});
    clearTimeout(force);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => log.error('Uncaught exception (server kept alive):', err));
  process.on('unhandledRejection', (err) => log.error('Unhandled rejection (server kept alive):', err));
}

main();
