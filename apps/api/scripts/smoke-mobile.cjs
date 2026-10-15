// Local-only integration smoke test. Never sends messages outside Mailpit.
const { PrismaClient } = require("@prisma/client");
const { randomUUID } = require("node:crypto");
const argon2 = require("argon2");
const assert = require("node:assert/strict");
const { writeFileSync, mkdirSync } = require("node:fs");
if (
  !process.env.TEST_DATABASE_URL ||
  !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_schema_test")
)
  throw new Error("Disposable TEST_DATABASE_URL required");
const db = new PrismaClient({
  datasources: { db: { url: process.env.TEST_DATABASE_URL } },
});
const base = "http://localhost:3101/api/v1/auth";
async function post(path, body, status) {
  const result = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(result.status, status, `${path}: HTTP ${result.status}`);
  return status === 204 ? null : result.json();
}
async function main() {
  const uid = randomUUID(),
    clinicId = randomUUID(),
    email = `smtp-${uid}@example.com`,
    password = "Mailpit-synthetic-password-123";
  await db.clinic.create({
    data: { id: clinicId, code: clinicId, name: "Clínica sintética SMTP" },
  });
  await db.user.create({
    data: { id: uid, email, passwordHash: await argon2.hash(password) },
  });
  await db.userClinic.create({
    data: {
      userId: uid,
      clinicId,
      role: "PATIENT",
      displayName: "Paciente sintético SMTP",
    },
  });
  const first = (await post("/mobile/login", { email, password }, 200)).session;
  const challenge = await post("/password/forgot", { email }, 202);
  let code;
  for (let i = 0; i < 20 && !code; i++) {
    const listing = await fetch("http://localhost:8025/api/v1/messages").then(
      (r) => r.json(),
    );
    const mail = listing.messages.find((m) =>
      m.To.some((to) => to.Address === email),
    );
    if (mail) {
      const message = await fetch(
        `http://localhost:8025/api/v1/message/${mail.ID}`,
      ).then((r) => r.json());
      code = message.Text.match(/\b[0-9]{6}\b/)?.[0];
    }
    if (!code) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(code, "Mailpit must receive the actual SMTP message");
  const verified = await post(
    "/password/verify",
    { challengeId: challenge.challengeId, code },
    200,
  );
  const next = " New-mailpit-password-123 ";
  await post(
    "/password/reset",
    { resetToken: verified.resetToken, password: next },
    204,
  );
  assert.equal(
    (
      await fetch(base + "/me", {
        headers: { Authorization: `Bearer ${first.accessToken}` },
      })
    ).status,
    401,
  );
  await post("/mobile/login", { email, password }, 401);
  const session = (await post("/mobile/login", { email, password: next }, 200))
    .session;
  assert.equal(session.profile.clinic.id, clinicId);
  await post("/logout", { refreshToken: session.refreshToken }, 204);
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/smtp-smoke.json",
    JSON.stringify(
      {
        smtp: "Mailpit local",
        recovery: "passed",
        oldSessionRevoked: true,
        newPasswordLogin: true,
        logout: true,
      },
      null,
      2,
    ),
  );
  console.log(
    "SMTP real, código, cambio de contraseña, revocación y nuevo login: OK",
  );
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
