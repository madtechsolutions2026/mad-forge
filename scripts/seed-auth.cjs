const { randomBytes, randomUUID, scrypt } = require("node:crypto");

const demoPassword = "ForgeDemo@2026!";
const primaryCompanyId = "07281174-1de5-42cf-822c-75b9df332d6f";
const alternateCompanyId = "22222222-2222-4222-8222-222222222222";

async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await new Promise((resolve, reject) =>
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, value) =>
      error ? reject(error) : resolve(value),
    ),
  );
  return `scrypt$32768$8$3$${salt}$${key.toString("hex")}`;
}

async function seedAuth(pool) {
  if (process.env.NODE_ENV === "production") throw new Error("Demo identity seeding is disabled in production.");
  const hash = await passwordHash(demoPassword);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO public.companies (id, name, address, phone) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [primaryCompanyId, "Green Bamboo Products (Demo)", "Chennai, Tamil Nadu", "+91 98765 43210"],
    );
    await client.query(
      "INSERT INTO public.companies (id, name, address) VALUES ($1, 'Northstar Packaging (Isolation Demo)', 'Pune, Maharashtra') ON CONFLICT (id) DO NOTHING",
      [alternateCompanyId],
    );
    const identities = [
      { email: "demo@madtech.local", name: "Arjun Mehta", companyId: primaryCompanyId, role: "owner" },
      { email: "viewer@madtech.local", name: "Priya Shah", companyId: primaryCompanyId, role: "viewer" },
      { email: "other@madtech.local", name: "Northstar Owner", companyId: alternateCompanyId, role: "owner" },
    ];
    const ids = [];
    for (const user of identities) {
      const result = await client.query(
        `INSERT INTO public.users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id`,
        [randomUUID(), user.name, user.email, hash],
      );
      const userId = result.rows[0].id;
      ids.push(userId);
      await client.query(
        `INSERT INTO public.company_memberships (user_id, company_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        [userId, user.companyId, user.role],
      );
    }
    await client.query("COMMIT");
    return {
      companyId: primaryCompanyId,
      ownerId: ids[0],
      viewerId: ids[1],
      otherOwnerId: ids[2],
      secondCompanyId: alternateCompanyId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { seedAuth, demoPassword };
