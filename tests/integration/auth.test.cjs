const { before, after, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const path = require("node:path");
const { Pool } = require("pg");

const root = path.resolve(__dirname, "../..");
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const origin = "http://127.0.0.1:5176";
process.env.APP_ORIGINS = origin;
const password = "TestFactoryOwner@2026!";
const userIds = new Set();
const companyIds = new Set();
const pool = new Pool({ max: 2, connectionTimeoutMillis: 3000 });
let apiPool;
let server;
let base;
let primary;
let secondary;
let viewer;

async function request(route, { method = "GET", body, session, headers = {} } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      Origin: origin,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session.cookie } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = response.status === 204 ? undefined : await response.json();
  return { response, data };
}

async function register(label) {
  const email = `forge-${label}-${randomUUID()}@example.test`;
  const result = await request("/api/auth/register", {
    method: "POST",
    body: { name: `Test ${label}`, companyName: `Integration Factory ${label}`, email, password },
  });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const cookieHeader = result.response.headers.get("set-cookie");
  assert.ok(cookieHeader);
  const session = { ...result.data, cookie: cookieHeader.split(";")[0], cookieHeader, password };
  userIds.add(session.user.id);
  for (const company of session.companies) companyIds.add(company.id);
  return session;
}

describe("identity, cookies and company isolation", { concurrency: false }, () => {
  before(async () => {
    await promisify(execFile)(process.execPath, ["scripts/migrate.cjs"], {
      cwd: root,
      env: process.env,
      timeout: 30000,
    });
    const { app } = require(path.join(root, "dist/app.js"));
    apiPool = require(path.join(root, "dist/config/db.js")).pool;
    server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    base = `http://127.0.0.1:${server.address().port}`;
    primary = await register("primary");
    secondary = await register("isolated");
  });

  after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    for (const userId of userIds) await pool.query("DELETE FROM public.users WHERE id = $1", [userId]);
    for (const companyId of companyIds) await pool.query("DELETE FROM public.companies WHERE id = $1", [companyId]);
    await apiPool?.end();
    await pool.end();
  });

  it("rejects an unauthenticated identity lookup", async () => {
    const { response } = await request("/api/auth/me");
    assert.equal(response.status, 401);
  });

  it("creates the user, company, owner membership and hashed session", async () => {
    assert.match(primary.cookieHeader, /HttpOnly/i);
    assert.match(primary.cookieHeader, /SameSite=Lax/i);
    assert.match(primary.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal(primary.companies[0].role, "owner");
    assert.equal(primary.password_hash, undefined);
    const stored = await pool.query(
      `SELECT u.password_hash, m.role, s.token_hash FROM public.users u
       JOIN public.company_memberships m ON m.user_id = u.id
       JOIN public.auth_sessions s ON s.user_id = u.id WHERE u.id = $1`,
      [primary.user.id],
    );
    assert.equal(stored.rows.length, 1);
    assert.match(stored.rows[0].password_hash, /^scrypt\$/);
    assert.notEqual(stored.rows[0].password_hash, password);
    assert.equal(stored.rows[0].role, "owner");
    assert.notEqual(stored.rows[0].token_hash, primary.cookie.split("=")[1]);
  });

  it("returns the authenticated identity with only its own company", async () => {
    const { response, data } = await request("/api/auth/me", { session: primary });
    assert.equal(response.status, 200);
    assert.equal(data.user.id, primary.user.id);
    assert.deepEqual(
      data.companies.map((company) => company.id),
      [primary.companies[0].id],
    );
    assert.equal(data.csrfToken, primary.csrfToken);
    assert.match(response.headers.get("cache-control"), /no-store/);
  });

  it("rejects a duplicate email without leaving an extra company", async () => {
    const companyName = `Rollback check ${randomUUID()}`;
    const result = await request("/api/auth/register", {
      method: "POST",
      body: { name: "Duplicate Owner", companyName, email: primary.user.email.toUpperCase(), password },
    });
    assert.equal(result.response.status, 409);
    const after = await pool.query("SELECT id FROM public.companies WHERE name = $1", [companyName]);
    assert.equal(after.rows.length, 0);
  });

  it("logs in with a valid password and rejects an invalid password", async () => {
    const bad = await request("/api/auth/login", {
      method: "POST",
      body: { email: primary.user.email, password: "wrong-password" },
    });
    assert.equal(bad.response.status, 401);
    assert.equal(bad.response.headers.get("set-cookie"), null);
    const good = await request("/api/auth/login", { method: "POST", body: { email: primary.user.email, password } });
    assert.equal(good.response.status, 200);
    assert.equal(good.data.user.id, primary.user.id);
    assert.ok(good.response.headers.get("set-cookie"));
  });

  it("protects a company profile from another authenticated owner", async () => {
    const own = await request(`/api/companies/${primary.companies[0].id}`, { session: primary });
    assert.equal(own.response.status, 200);
    const other = await request(`/api/companies/${secondary.companies[0].id}`, { session: primary });
    assert.equal(other.response.status, 404);
  });

  it("rejects a forged workspace header", async () => {
    const result = await request("/api/erp/workspace", {
      session: primary,
      headers: { "X-Company-Id": secondary.companies[0].id },
    });
    assert.equal(result.response.status, 403);
  });

  it("rejects writes without a valid CSRF token", async () => {
    const result = await request("/api/companies", {
      method: "POST",
      session: primary,
      body: { name: "Must Not Be Created" },
    });
    assert.equal(result.response.status, 403);
    const result2 = await request("/api/auth/logout", {
      method: "POST",
      session: primary,
      headers: { "X-CSRF-Token": "wrong-token" },
    });
    assert.equal(result2.response.status, 403);
  });

  it("rejects a cross-origin login even with the correct password", async () => {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: { email: primary.user.email, password },
      headers: { Origin: "https://untrusted.example" },
    });
    assert.equal(result.response.status, 403);
  });

  it("allows a viewer to read stock but prevents creating an item", async () => {
    viewer = await register("viewer");
    await pool.query("UPDATE public.company_memberships SET role = 'viewer' WHERE user_id = $1 AND company_id = $2", [
      viewer.user.id,
      viewer.companies[0].id,
    ]);
    const headers = { "X-Company-Id": viewer.companies[0].id, "X-CSRF-Token": viewer.csrfToken };
    const read = await request("/api/erp/workspace", { session: viewer, headers });
    assert.equal(read.response.status, 200);
    const write = await request("/api/erp/items", {
      method: "POST",
      session: viewer,
      headers,
      body: { name: "Forbidden Item", sku: "FORBIDDEN", unit: "kg", type: "raw" },
    });
    assert.equal(write.response.status, 403);
  });

  it("rejects NUL characters in registration fields before PostgreSQL", async () => {
    for (const field of ["name", "email", "companyName"]) {
      const body = {
        name: "Invalid Owner",
        companyName: "Invalid Factory",
        email: `invalid-${randomUUID()}@example.test`,
        password,
      };
      body[field] += "\u0000";
      const result = await request("/api/auth/register", { method: "POST", body });
      assert.equal(result.response.status, 400, `${field}: ${JSON.stringify(result.data)}`);
    }
  });

  it("creates scoped team members without exposing their password", async () => {
    const email = `member-${randomUUID()}@example.test`;
    const headers = { "X-Company-Id": primary.companies[0].id, "X-CSRF-Token": primary.csrfToken };
    const created = await request("/api/auth/members", {
      method: "POST",
      session: primary,
      headers,
      body: { name: "Warehouse Teammate", email, password, role: "warehouse" },
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    const member = created.data.member;
    userIds.add(member.id);
    assert.equal(member.role, "warehouse");
    assert.equal(member.email, email);
    assert.equal(member.password, undefined);
    assert.equal(member.password_hash, undefined);
    const list = await request("/api/auth/members", { session: primary, headers });
    assert.equal(list.response.status, 200);
    assert.ok(list.data.members.some((entry) => entry.id === member.id));
    assert.ok(!list.data.members.some((entry) => entry.id === secondary.user.id));
    const other = await request("/api/auth/members", {
      session: primary,
      headers: { "X-Company-Id": secondary.companies[0].id },
    });
    assert.equal(other.response.status, 403);
    primary.teamMember = { id: member.id, email };
  });

  it("keeps existing account credentials when adding a membership", async () => {
    const before = await pool.query("SELECT name, password_hash FROM public.users WHERE id = $1", [viewer.user.id]);
    const result = await request("/api/auth/members", {
      method: "POST",
      session: primary,
      headers: { "X-Company-Id": primary.companies[0].id, "X-CSRF-Token": primary.csrfToken },
      body: { name: "Do Not Replace", email: viewer.user.email, password: "DoNotReplacePassword@2026", role: "viewer" },
    });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
    assert.equal(result.data.member.id, viewer.user.id);
    const after = await pool.query("SELECT name, password_hash FROM public.users WHERE id = $1", [viewer.user.id]);
    assert.deepEqual(after.rows[0], before.rows[0]);
    const denied = await request("/api/auth/members", {
      method: "POST",
      session: viewer,
      headers: { "X-Company-Id": primary.companies[0].id, "X-CSRF-Token": viewer.csrfToken },
      body: { name: "Forbidden Person", email: `forbidden-${randomUUID()}@example.test`, password, role: "viewer" },
    });
    assert.equal(denied.response.status, 403);
  });

  it("protects the last owner and prevents admins changing privileged roles", async () => {
    const headers = { "X-Company-Id": primary.companies[0].id, "X-CSRF-Token": primary.csrfToken };
    const lastOwner = await request(`/api/auth/members/${primary.user.id}`, {
      method: "PATCH",
      session: primary,
      headers,
      body: { role: "viewer" },
    });
    assert.equal(lastOwner.response.status, 409);
    const crossCompany = await request(`/api/auth/members/${secondary.user.id}`, {
      method: "PATCH",
      session: primary,
      headers,
      body: { role: "viewer" },
    });
    assert.equal(crossCompany.response.status, 404);
    const promoted = await request(`/api/auth/members/${primary.teamMember.id}`, {
      method: "PATCH",
      session: primary,
      headers,
      body: { role: "admin" },
    });
    assert.equal(promoted.response.status, 200);
    assert.equal(promoted.data.member.role, "admin");
    const login = await request("/api/auth/login", {
      method: "POST",
      body: { email: primary.teamMember.email, password },
    });
    assert.equal(login.response.status, 200);
    const admin = { ...login.data, cookie: login.response.headers.get("set-cookie").split(";")[0] };
    const adminHeaders = { "X-Company-Id": primary.companies[0].id, "X-CSRF-Token": admin.csrfToken };
    const changeOwner = await request(`/api/auth/members/${primary.user.id}`, {
      method: "PATCH",
      session: admin,
      headers: adminHeaders,
      body: { role: "viewer" },
    });
    assert.equal(changeOwner.response.status, 403);
    const createOwner = await request("/api/auth/members", {
      method: "POST",
      session: admin,
      headers: adminHeaders,
      body: { name: "Forbidden Owner", email: `forbidden-owner-${randomUUID()}@example.test`, password, role: "owner" },
    });
    assert.equal(createOwner.response.status, 403);
    const demoted = await request(`/api/auth/members/${primary.teamMember.id}`, {
      method: "PATCH",
      session: primary,
      headers,
      body: { role: "warehouse" },
    });
    assert.equal(demoted.response.status, 200);
    const noLongerAdmin = await request("/api/auth/members", {
      method: "POST",
      session: admin,
      headers: adminHeaders,
      body: {
        name: "Forbidden Viewer",
        email: `forbidden-viewer-${randomUUID()}@example.test`,
        password,
        role: "viewer",
      },
    });
    assert.equal(noLongerAdmin.response.status, 403);
  });

  it("revokes the session on logout", async () => {
    const result = await request("/api/auth/logout", {
      method: "POST",
      session: primary,
      headers: { "X-CSRF-Token": primary.csrfToken },
    });
    assert.equal(result.response.status, 204);
    assert.match(result.response.headers.get("set-cookie"), /Expires=Thu, 01 Jan 1970/i);
    const lookup = await request("/api/auth/me", { session: primary });
    assert.equal(lookup.response.status, 401);
  });
});
