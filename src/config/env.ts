import "dotenv/config";

function readPort(value: string | undefined, fallback: number, name: string): number {
  const raw = value?.trim() ?? String(fallback);
  const port = Number(raw);

  if (!/^\d+$/.test(raw) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be a port number between 1 and 65535.`);
  }

  return port;
}

for (const name of ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"] as const) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Missing ${name}. Check the project root .env file.`);
  }
}

readPort(process.env.PGPORT, 5432, "PGPORT");

export const env = Object.freeze({
  port: readPort(process.env.PORT, 3030, "PORT"),
  host: process.env.HOST?.trim() || "127.0.0.1",
});
