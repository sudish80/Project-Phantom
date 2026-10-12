const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (...a: unknown[]) => console.log(`[${ts()}]`, ...a),
  warn: (...a: unknown[]) => console.warn(`[${ts()}] WARN`, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] ERROR`, ...a),
  quiet: false,
};

export function setQuiet(q: boolean) {
  if (q) {
    log.info = () => {};
    log.warn = () => {};
  }
}
