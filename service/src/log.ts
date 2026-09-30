// Structured logger: one JSON object per line on stdout.

type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

// JSON.stringify turns an Error into {}, so keep the parts worth reading.
function serializeErrors(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      ...value,
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: value.cause,
    };
  }
  return value;
}

function write(level: Level, msg: string, fields?: Fields): void {
  const head = { time: new Date().toISOString(), level, msg };
  let line: string;
  try {
    // head goes first so it leads the line, and last so fields cannot override it.
    line = JSON.stringify({ ...head, ...fields, ...head }, serializeErrors);
  } catch (err) {
    // Circular references and BigInt values make JSON.stringify throw; logging must not.
    line = JSON.stringify({ ...head, logError: String(err) });
  }
  process.stdout.write(line + "\n");
}

export const log = {
  info: (msg: string, fields?: Fields) => write("info", msg, fields),
  warn: (msg: string, fields?: Fields) => write("warn", msg, fields),
  error: (msg: string, fields?: Fields) => write("error", msg, fields),
};
