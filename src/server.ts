import { app } from "./app.js";
import { pool } from "./config/db.js";
import { env } from "./config/env.js";

const server = app.listen(env.port, env.host, () => {
  console.log(`Server running at http://${env.host}:${env.port}`);
});

server.on("error", (error) => {
  console.error("Server could not start:", error.message);
  void pool.end().finally(() => {
    process.exitCode = 1;
  });
});

let shuttingDown = false;

function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received. Closing server and database pool.`);

  const timeout = setTimeout(() => {
    console.error("Shutdown timed out.");
    process.exit(1);
  }, 10_000);
  timeout.unref();

  server.close((error) => {
    void pool.end().then(
      () => {
        clearTimeout(timeout);
        if (error) console.error("Server shutdown error:", error.message);
        process.exitCode = error ? 1 : 0;
      },
      (databaseError: unknown) => {
        clearTimeout(timeout);
        console.error(
          "Database shutdown error:",
          databaseError instanceof Error ? databaseError.message : "Unknown error"
        );
        process.exitCode = 1;
      }
    );
  });

  server.closeIdleConnections();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
