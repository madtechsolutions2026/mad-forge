const { after, before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const { randomUUID } = require('node:crypto');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const projectRoot = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

const runFile = promisify(execFile);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const createdIds = new Set();
const pool = new Pool({
  max: 2,
  connectionTimeoutMillis: 3000,
  query_timeout: 5000
});

let activeServer;
let dbAvailable = false;
let sessionCookie;
let csrfToken;
let testUserId;
const origin = 'http://127.0.0.1:5176';
process.env.APP_ORIGINS = origin;

function redact(value) {
  let message = String(value ?? '');
  for (const secret of [process.env.PGPASSWORD, process.env.DATABASE_URL]) {
    if (secret) message = message.split(secret).join('[redacted]');
  }
  return message.replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[redacted]@');
}

async function migrate() {
  try {
    await runFile(process.execPath, ['scripts/migrate.cjs'], {
      cwd: projectRoot,
      env: process.env,
      timeout: 30000,
      maxBuffer: 256 * 1024
    });
  } catch (error) {
    throw new Error(redact(`Migration failed. ${error.stderr ?? error.message}`));
  }
}

// Run the real compiled entry point. Replace only its first listen port with 0
// so an existing development server is never stopped or contacted by this test.
// IPC lets Windows trigger the application's normal SIGTERM shutdown handler.
const serverWrapper = `
  const http = require('node:http');
  const originalListen = http.Server.prototype.listen;
  let firstListen = true;
  http.Server.prototype.listen = function (...args) {
    if (firstListen) {
      firstListen = false;
      args[0] = 0;
      this.once('listening', () => {
        process.send?.({ type: 'ready', port: this.address().port });
      });
    }
    return originalListen.apply(this, args);
  };
  process.on('message', message => {
    if (message?.type === 'stop') process.emit('SIGTERM');
  });
  process.channel?.unref();
  require(process.argv[1]);
`;

async function startServer() {
  const child = spawn(process.execPath, [
    '--eval', serverWrapper, path.join(projectRoot, 'dist/server.js')
  ], {
    cwd: projectRoot,
    env: { ...process.env, HOST: '127.0.0.1', PORT: '3030' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true
  });
  const server = { child, baseUrl: '', output: '', stopped: false };
  activeServer = server;

  function collect(chunk) {
    server.output = (server.output + redact(chunk)).slice(-12000);
  }
  child.stdout.on('data', collect);
  child.stderr.on('data', collect);
  // Keep a rejection handler attached even if startup fails before stopServer.
  server.exit = new Promise(resolve => child.once('exit', (code, signal) => {
    resolve({ code, signal });
  }));

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('API startup timed out.')), 10000);
    function finish(error, port) {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) reject(new Error(redact(`${error.message}\n${server.output}`)));
      else {
        server.baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      }
    }
    function onMessage(message) {
      if (message?.type === 'ready') finish(null, message.port);
    }
    function onExit(code) {
      finish(new Error(`API exited during startup (code ${code}).`));
    }
    function onError(error) { finish(error); }
    child.on('message', onMessage);
    child.once('exit', onExit);
    child.once('error', onError);
  });
  return server;
}

async function stopServer(server, requireCleanExit = true) {
  if (!server || server.stopped) return;
  server.stopped = true;
  if (server.child.exitCode === null && server.child.signalCode === null) {
    if (server.child.connected) {
      await new Promise(resolve => {
        server.child.send({ type: 'stop' }, () => resolve());
      });
    } else {
      server.child.kill();
    }
  }
  let timeout;
  try {
    const result = await Promise.race([
      server.exit,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('API shutdown timed out.')), 12000);
      })
    ]);
    if (requireCleanExit) {
      assert.equal(result.code, 0, redact(`API shutdown failed.\n${server.output}`));
      assert.equal(result.signal, null);
    }
  } finally {
    clearTimeout(timeout);
    if (server.child.exitCode === null && server.child.signalCode === null) {
      server.child.kill();
    }
  }
}

async function request(method, route, body) {
  const response = await fetch(`${activeServer.baseUrl}${route}`, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(sessionCookie ? { Cookie: sessionCookie, 'X-CSRF-Token': csrfToken } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(5000)
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); }
  catch { assert.fail(`Expected JSON, received ${response.status}: ${redact(text)}`); }
  if (method === 'POST' && uuidPattern.test(payload?.data?.id ?? '')) {
    createdIds.add(payload.data.id);
  }
  return { response, payload };
}

function assertCompany(company) {
  assert.ok(uuidPattern.test(company.id));
  assert.equal(typeof company.name, 'string');
  assert.ok(company.address === null || typeof company.address === 'string');
  assert.ok(company.phone === null || typeof company.phone === 'string');
  assert.ok(Number.isFinite(Date.parse(company.created_at)));
  assert.ok(Number.isFinite(Date.parse(company.updated_at)));
}

describe('Company profile persistence API', { concurrency: false }, () => {
  before(async () => {
    try {
      await pool.query('SELECT 1');
      dbAvailable = true;
    } catch (error) {
      throw new Error(redact(`PostgreSQL must be available for integration tests: ${error.message}`));
    }
    await migrate();
    const columns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
      ORDER BY ordinal_position
    `);
    assert.ok(columns.rowCount > 0, 'Migration must create the companies table.');
    await migrate();
    const afterSecondMigration = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'companies'
      ORDER BY ordinal_position
    `);
    assert.deepEqual(afterSecondMigration.rows, columns.rows, 'Running migrations twice must preserve the schema.');
    await startServer();
    const registered = await request('POST', '/api/auth/register', {
      name: 'Company Test Owner',
      email: `company-owner-${randomUUID()}@example.test`,
      password: 'CompanyTestOwner@2026!',
      companyName: 'Company profile test workspace'
    });
    assert.equal(registered.response.status, 201);
    sessionCookie = registered.response.headers.get('set-cookie').split(';')[0];
    csrfToken = registered.payload.csrfToken;
    testUserId = registered.payload.user.id;
    for (const company of registered.payload.companies) createdIds.add(company.id);
  });

  after(async () => {
    let cleanupError;
    try { await stopServer(activeServer); }
    catch (error) { cleanupError = error; }
    try {
      if (dbAvailable && createdIds.size > 0) {
        await pool.query('DELETE FROM public.companies WHERE id = ANY($1::uuid[])', [[...createdIds]]);
      }
      if (testUserId) await pool.query('DELETE FROM public.users WHERE id = $1', [testUserId]);
    } catch (error) {
      cleanupError ??= new Error(redact(`Test-record cleanup failed: ${error.message}`));
    } finally {
      await pool.end();
    }
    if (cleanupError) throw cleanupError;
  });

  it('creates a trimmed company profile and reads the saved values', async () => {
    const { response, payload } = await request('POST', '/api/companies', {
      name: '  Green Bamboo Products  ',
      address: '  Chennai  ',
      phone: '  +91 9876543210  '
    });
    assert.equal(response.status, 201);
    assert.equal(payload.status, 'ok');
    assertCompany(payload.data);
    assert.equal(payload.data.name, 'Green Bamboo Products');
    assert.equal(payload.data.address, 'Chennai');
    assert.equal(payload.data.phone, '+91 9876543210');
    assert.equal(response.headers.get('location'), `/api/companies/${payload.data.id}`);
    const read = await request('GET', `/api/companies/${payload.data.id}`);
    assert.equal(read.response.status, 200);
    assert.deepEqual(read.payload, payload);
  });

  it('stores apostrophes and SQL-looking text as ordinary data', async () => {
    const name = "O'Brien Bamboo'; DROP TABLE companies; --";
    const result = await request('POST', '/api/companies', { name });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.data.name, name);
    const read = await request('GET', `/api/companies/${result.payload.data.id}`);
    assert.equal(read.response.status, 200);
    assert.equal(read.payload.data.name, name);
    assert.equal(read.payload.data.address, null);
    assert.equal(read.payload.data.phone, null);
  });

  it('accepts explicit nulls and turns blank optional fields into null', async () => {
    for (const fields of [
      { address: null, phone: null },
      { address: '   ', phone: '\t ' }
    ]) {
      const result = await request('POST', '/api/companies', {
        name: `Nullable company ${randomUUID()}`, ...fields
      });
      assert.equal(result.response.status, 201);
      assert.equal(result.payload.data.address, null);
      assert.equal(result.payload.data.phone, null);
    }
  });

  it('accepts exactly the documented maximum lengths', async () => {
    const result = await request('POST', '/api/companies', {
      name: 'N'.repeat(150), address: 'A'.repeat(500), phone: '1'.repeat(32)
    });
    assert.equal(result.response.status, 201);
    assert.equal(result.payload.data.name.length, 150);
    assert.equal(result.payload.data.address.length, 500);
    assert.equal(result.payload.data.phone.length, 32);
  });

  it('returns validation errors for invalid bodies and unknown fields', async () => {
    const invalidBodies = [
      {}, { name: '' }, { name: '   ' }, { name: null }, { name: 123 },
      { name: 'N'.repeat(151) },
      { name: 'Company\u0000name' },
      { name: 'Example', address: 'Address\u0000text' },
      { name: 'Example', phone: '123\u0000456' },
      { name: 'Example', address: 123 },
      { name: 'Example', phone: 123 },
      { name: 'Example', address: 'A'.repeat(501) },
      { name: 'Example', phone: '1'.repeat(33) },
      { name: 'Example', companyId: randomUUID() },
      { name: 'Example', unexpected: true },
      [], ['Example'], null, 'Example', 123, true
    ];
    for (const body of invalidBodies) {
      const result = await request('POST', '/api/companies', body);
      assert.equal(result.response.status, 400, `Expected 400 for ${JSON.stringify(body)}`);
      assert.equal(result.payload.status, 'error');
    }
  });

  it('distinguishes malformed and missing company IDs', async () => {
    const malformed = await request('GET', '/api/companies/not-a-uuid');
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.payload.status, 'error');
    const missing = await request('GET', `/api/companies/${randomUUID()}`);
    assert.equal(missing.response.status, 404);
    assert.equal(missing.payload.status, 'error');
  });

  it('keeps a company after the entire API process restarts', async () => {
    const created = await request('POST', '/api/companies', {
      name: `Persistent company ${randomUUID()}`,
      address: 'Chennai', phone: '+91 9876543210'
    });
    assert.equal(created.response.status, 201);
    const previousPid = activeServer.child.pid;
    await stopServer(activeServer);
    await startServer();
    assert.notEqual(activeServer.child.pid, previousPid);
    const read = await request('GET', `/api/companies/${created.payload.data.id}`);
    assert.equal(read.response.status, 200);
    assert.deepEqual(read.payload, created.payload);
  });
});
