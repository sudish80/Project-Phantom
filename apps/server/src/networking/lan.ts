import os from 'node:os';

/** Private IPv4 addresses of this machine (excluding loopback / link-local). */
export function getLanAddresses(): string[] {
  const out: string[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      const fam = String(a.family) === '4' ? 'IPv4' : String(a.family);
      if (fam !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      // de-prioritise common virtual adapters
      const virtual = /docker|veth|br-|vmnet|virbr|vbox|zt|tailscale|utun/i.test(name);
      if (virtual) out.push(a.address);
      else out.unshift(a.address);
    }
  }
  return [...new Set(out)];
}

export function getLanUrls(port: number): string[] {
  return getLanAddresses().map((ip) => `http://${ip}:${port}`);
}
