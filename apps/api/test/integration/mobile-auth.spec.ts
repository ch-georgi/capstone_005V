import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID, createHash } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import {
  configureApplication,
  createOpenApiDocument,
} from "../../src/config/application";
import { PrismaService } from "../../src/prisma/prisma.service";
import { PasswordService } from "../../src/modules/auth/password.service";
import { MailService } from "../../src/modules/auth/mail.service";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

describe("Mobile sessions, tenant selection and password recovery (PostgreSQL)", () => {
  let app: INestApplication, db: PrismaService;
  let userId: string, email: string;
  const clinicA = randomUUID(),
    clinicB = randomUUID(),
    clinicC = randomUUID(),
    password = "  Mobile-password-123  ";
  const delivered = new Map<string, string>();
  const post = (path: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1/auth/${path}`).send(body);
  const me = (token: string) =>
    request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .auth(token, { type: "bearer" });
  const login = () =>
    post("mobile/login", { email: ` ${email.toUpperCase()} `, password });
  const secondClinic = () =>
    db.userClinic.create({
      data: {
        userId,
        clinicId: clinicB,
        role: "PATIENT",
        displayName: "Nombre privado B",
      },
    });
  const tokenRow = (token: string) =>
    db.refreshToken.findUniqueOrThrow({ where: { tokenHash: hash(token) } });
  const forgot = () => post("password/forgot", { email });
  beforeAll(async () => {
    process.env.PASSWORD_RESET_SECRET =
      "recovery-test-secret-at-least-32-bytes";
    process.env.SMTP_HOST = "localhost";
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useValue({
        sendCode: async (address: string, code: string) => {
          delivered.set(address, code);
        },
      })
      .compile();
    app = module.createNestApplication();
    configureApplication(app);
    await app.init();
    db = app.get(PrismaService);
    await db.clinic.createMany({
      data: [clinicA, clinicB, clinicC].map((id) => ({
        id,
        name: `Clínica sintética ${id}`,
        code: id,
      })),
    });
  });
  beforeEach(async () => {
    await db.authRateLimit.deleteMany();
    userId = randomUUID();
    email = `${userId}@example.com`;
    await db.user.create({
      data: {
        id: userId,
        email,
        passwordHash: await new PasswordService().hash(password),
      },
    });
    await db.userClinic.create({
      data: {
        userId,
        clinicId: clinicA,
        role: "PATIENT",
        displayName: "Paciente A",
      },
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  it("logs in with one clinic, keeps whitespace and does not expose hashes", async () => {
    const { body } = await login().expect(200);
    expect(body.status).toBe("AUTHENTICATED");
    expect(body.session.profile).toMatchObject({
      user: { id: userId, email },
      clinic: { id: clinicA },
      role: "PATIENT",
      access: "READ_ONLY",
      patientRecordPending: true,
    });
    expect(body.session.expiresIn).toBe(900);
    expect(
      Date.parse(body.session.sessionExpiresAt) - Date.now(),
    ).toBeGreaterThan(29 * 86400000);
    expect(body.session).not.toHaveProperty("passwordHash");
    await me(body.session.accessToken).expect(200);
    expect((await tokenRow(body.session.refreshToken)).tokenHash).not.toBe(
      body.session.refreshToken,
    );
    await post("mobile/login", { email, password: password.trim() }).expect(
      401,
    );
  });
  it("requires a single-use selection and rejects arbitrary clinics and challenge-as-access-token", async () => {
    await secondClinic();
    const { body } = await login().expect(200);
    expect(body.status).toBe("CLINIC_SELECTION_REQUIRED");
    expect(body.clinics.map((row: { id: string }) => row.id).sort()).toEqual(
      [clinicA, clinicB].sort(),
    );
    await me(body.selectionToken).expect(401);
    await post("mobile/select-clinic", {
      selectionToken: body.selectionToken,
      clinicId: clinicC,
    }).expect(403);
    const selected = await post("mobile/select-clinic", {
      selectionToken: body.selectionToken,
      clinicId: clinicB,
    }).expect(200);
    expect(selected.body.profile.displayName).toBe("Nombre privado B");
    await post("mobile/select-clinic", {
      selectionToken: body.selectionToken,
      clinicId: clinicA,
    }).expect(401);
  });
  it("expires selection and rechecks membership before exchange", async () => {
    await secondClinic();
    const { body } = await login().expect(200);
    await db.authChallenge.update({
      where: { id: body.selectionToken.split(".")[0] },
      data: {
        expiresAt: new Date(Date.now() + 1000),
        createdAt: new Date(Date.now() - 600000),
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 1050));
    await post("mobile/select-clinic", {
      selectionToken: body.selectionToken,
      clinicId: clinicA,
    }).expect(401);
  });
  it("rejects professional-only accounts and missing memberships", async () => {
    await db.userClinic.update({
      where: { userId_clinicId: { userId, clinicId: clinicA } },
      data: { role: "CLINICIAN" },
    });
    expect((await login().expect(403)).body.code).toBe(
      "MOBILE_PATIENT_REQUIRED",
    );
  });
  it("preserves historical read-only access but rejects inactive patients without a record", async () => {
    await db.patient.create({
      data: {
        id: randomUUID(),
        userId,
        clinicId: clinicA,
        firstName: "Demo",
        lastName: "Histórico",
        dateOfBirth: new Date("1990-01-01"),
      },
    });
    await db.userClinic.update({
      where: { userId_clinicId: { userId, clinicId: clinicA } },
      data: { isActive: false },
    });
    const { body } = await login().expect(200);
    expect(body.session.profile.access).toBe("READ_ONLY");
    expect(body.session.profile.patientRecordPending).toBe(false);
  });
  it("rejects inactive membership without historical record", async () => {
    await db.userClinic.update({
      where: { userId_clinicId: { userId, clinicId: clinicA } },
      data: { isActive: false },
    });
    await login().expect(403);
  });
  it("rotates refresh tokens without extending deadline; replay revokes the whole session", async () => {
    const first = (await login()).body.session;
    const next = (
      await post("refresh", { refreshToken: first.refreshToken }).expect(200)
    ).body;
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.sessionExpiresAt).toBe(first.sessionExpiresAt);
    await post("refresh", { refreshToken: first.refreshToken }).expect(401);
    await me(next.accessToken).expect(401);
    await post("refresh", { refreshToken: next.refreshToken }).expect(401);
  });
  it("serializes concurrent refreshes and detects reuse", async () => {
    const first = (await login()).body.session;
    const replies = await Promise.all([
      post("refresh", { refreshToken: first.refreshToken }),
      post("refresh", { refreshToken: first.refreshToken }),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 401]);
    await me(
      replies.find((reply) => reply.status === 200)!.body.accessToken,
    ).expect(401);
  });
  it("revokes access immediately on logout and treats repeated logout as success", async () => {
    const first = (await login()).body.session;
    await post("logout", { refreshToken: first.refreshToken }).expect(204);
    await me(first.accessToken).expect(401);
    await post("refresh", { refreshToken: first.refreshToken }).expect(401);
    await post("logout", { refreshToken: first.refreshToken }).expect(204);
  });
  it("does not extend absolute expiry on switch and rejects the old clinic token", async () => {
    await secondClinic();
    const selection = (await login()).body;
    const first = (
      await post("mobile/select-clinic", {
        selectionToken: selection.selectionToken,
        clinicId: clinicA,
      })
    ).body;
    await request(app.getHttpServer())
      .post("/api/v1/auth/mobile/switch-clinic")
      .auth(first.accessToken, { type: "bearer" })
      .send({ clinicId: clinicC })
      .expect(403);
    await me(first.accessToken).expect(200);
    const next = (
      await request(app.getHttpServer())
        .post("/api/v1/auth/mobile/switch-clinic")
        .auth(first.accessToken, { type: "bearer" })
        .send({ clinicId: clinicB })
        .expect(200)
    ).body;
    expect(next.profile.clinic.id).toBe(clinicB);
    expect(next.sessionExpiresAt).toBe(first.sessionExpiresAt);
    await me(first.accessToken).expect(401);
  });
  it("rejects an expired 30-day session even with an otherwise valid JWT", async () => {
    const first = (await login()).body.session;
    const row = await tokenRow(first.refreshToken);
    await db.authSession.update({
      where: { id: row.sessionId! },
      data: {
        createdAt: new Date(Date.now() - 31 * 86400000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await me(first.accessToken).expect(401);
    await post("refresh", { refreshToken: first.refreshToken }).expect(401);
  });
  it("rechecks patient permissions during refresh", async () => {
    const first = (await login()).body.session;
    await db.userClinic.update({
      where: { userId_clinicId: { userId, clinicId: clinicA } },
      data: { isActive: false },
    });
    await post("refresh", { refreshToken: first.refreshToken }).expect(403);
  });
  it("returns a generic recovery response for existing and missing accounts, with no usable decoy", async () => {
    const known = await forgot().expect(202);
    const unknown = await post("password/forgot", {
      email: "missing-account@example.com",
    }).expect(202);
    expect(known.body.message).toBe(unknown.body.message);
    expect(Object.keys(known.body)).toEqual(Object.keys(unknown.body));
    await post("password/verify", {
      challengeId: unknown.body.challengeId,
      code: "000000",
    }).expect(400);
  });
  it("verifies a code once, changes password and invalidates mobile and legacy sessions", async () => {
    const first = (await login()).body.session;
    const legacy = (
      await post("login", { email, password, clinicId: clinicA }).expect(200)
    ).body.accessToken;
    await request(app.getHttpServer())
      .post("/api/v1/users")
      .auth(legacy, { type: "bearer" })
      .send({})
      .expect(403);
    const challenge = (await forgot().expect(202)).body.challengeId;
    const code = delivered.get(email)!;
    const { body } = await post("password/verify", {
      challengeId: challenge,
      code,
    }).expect(200);
    await post("password/verify", { challengeId: challenge, code }).expect(400);
    await post("password/reset", {
      resetToken: body.resetToken,
      password: " New-mobile-password-123 ",
    }).expect(204);
    await post("password/reset", {
      resetToken: body.resetToken,
      password: "Another-password-123",
    }).expect(401);
    await me(first.accessToken).expect(401);
    await request(app.getHttpServer())
      .post("/api/v1/users")
      .auth(legacy, { type: "bearer" })
      .send({})
      .expect(401);
    await post("refresh", { refreshToken: first.refreshToken }).expect(401);
    await login().expect(401);
    await post("mobile/login", {
      email,
      password: " New-mobile-password-123 ",
    }).expect(200);
  });
  it("limits wrong codes to five attempts without rolling back the counter", async () => {
    const id = (await forgot()).body.challengeId;
    const right = delivered.get(email)!;
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      await post("password/verify", { challengeId: id, code: wrong }).expect(
        400,
      );
    expect(
      (await db.authChallenge.findUniqueOrThrow({ where: { id } })).attempts,
    ).toBe(5);
    await post("password/verify", { challengeId: id, code: right }).expect(400);
  });
  it("enforces resend cooldown and invalidates the previous code and reset authorization", async () => {
    const initial = (await forgot()).body;
    const oldCode = delivered.get(email)!;
    await forgot().expect(429);
    await db.authRateLimit.deleteMany();
    const second = (await forgot().expect(202)).body;
    await post("password/verify", {
      challengeId: initial.challengeId,
      code: oldCode,
    }).expect(400);
    const verified = (
      await post("password/verify", {
        challengeId: second.challengeId,
        code: delivered.get(email),
      }).expect(200)
    ).body;
    await db.authRateLimit.deleteMany();
    await forgot().expect(202);
    await post("password/reset", {
      resetToken: verified.resetToken,
      password: "Another-password-123",
    }).expect(401);
  });
  it("does not activate pending accounts and rejects malformed or expired recovery tokens", async () => {
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: null },
    });
    const id = (await forgot()).body.challengeId;
    expect(delivered.has(email)).toBe(false);
    await post("password/verify", { challengeId: id, code: "000000" }).expect(
      400,
    );
    await post("password/reset", {
      resetToken: "invalid-token-long-enough",
      password: "Another-password-123",
    }).expect(401);
    await login().expect(401);
  });
  it("enforces login limits and strict DTOs", async () => {
    for (let i = 0; i < 10; i++)
      await post("mobile/login", { email, password: "wrong" }).expect(401);
    await login().expect(429);
    await post("mobile/login", { email, password, role: "PATIENT" }).expect(
      400,
    );
  });
  it("rejects expired recovery codes and reset authorizations", async () => {
    const first = (await forgot().expect(202)).body.challengeId;
    await db.authChallenge.update({
      where: { id: first },
      data: {
        createdAt: new Date(Date.now() - 1200000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await post("password/verify", {
      challengeId: first,
      code: delivered.get(email),
    }).expect(400);
    await db.authRateLimit.deleteMany();
    const second = (await forgot().expect(202)).body.challengeId;
    const verified = (
      await post("password/verify", {
        challengeId: second,
        code: delivered.get(email),
      }).expect(200)
    ).body;
    await db.authChallenge.update({
      where: { id: second },
      data: {
        createdAt: new Date(Date.now() - 1200000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await post("password/reset", {
      resetToken: verified.resetToken,
      password: "Another-password-123",
    }).expect(401);
  });
  it("rechecks selected membership and credential version after issuing a challenge", async () => {
    await secondClinic();
    const selection = (await login().expect(200)).body;
    await db.userClinic.update({
      where: { userId_clinicId: { userId, clinicId: clinicB } },
      data: { isActive: false },
    });
    await post("mobile/select-clinic", {
      selectionToken: selection.selectionToken,
      clinicId: clinicB,
    }).expect(403);
    await db.user.update({
      where: { id: userId },
      data: { credentialsVersion: { increment: 1 } },
    });
    await post("mobile/select-clinic", {
      selectionToken: selection.selectionToken,
      clinicId: clinicA,
    }).expect(401);
  });
  it("documents discriminated login responses and session/profile contracts", () => {
    const document = createOpenApiDocument(app);
    expect(
      document.paths["/api/v1/auth/mobile/login"]?.post?.responses["200"],
    ).toHaveProperty(
      ["content", "application/json", "schema", "oneOf"],
      [expect.any(Object), expect.any(Object)],
    );
    expect(document.components!.schemas!.MobileSessionDto).toBeDefined();
  });
  it("resolves patientId in the current clinic and edits only its own display name including read-only accounts", async () => {
    const initial=await login().expect(200);
    expect(initial.body.session.profile.patientId).toBeNull();
    const record=await db.patient.create({data:{userId,clinicId:clinicA,firstName:"QA",lastName:"Fixture",dateOfBirth:new Date("1990-01-01")}});
    await secondClinic();
    const current=await login().expect(200);
    const selected=await post("mobile/select-clinic",{selectionToken:current.body.selectionToken,clinicId:clinicA}).expect(200);
    expect(selected.body.profile.patientId).toBe(record.id);
    const token=selected.body.accessToken;
    const update=(body:object)=>request(app.getHttpServer()).patch("/api/v1/auth/me").auth(token,{type:"bearer"}).send(body);
    const changed=await update({displayName:"  Nombre nuevo  "}).expect(200);
    expect(changed.body.displayName).toBe("Nombre nuevo");
    expect(changed.body.patientId).toBe(record.id);
    expect((await db.userClinic.findUniqueOrThrow({where:{userId_clinicId:{userId,clinicId:clinicB}}})).displayName).toBe("Nombre privado B");
    expect((await db.patient.findUniqueOrThrow({where:{id:record.id}})).firstName).toBe("QA");
    await update({displayName:" "}).expect(400);
    await update({displayName:"a".repeat(101)}).expect(400);
    await update({displayName:"Invalido",email:"other@example.com"}).expect(400);
    const audit=await db.auditLog.findFirstOrThrow({where:{actorId:userId,action:"UPDATE"},orderBy:{createdAt:"desc"}});
    expect(audit.metadata).toEqual({entity:"USER_CLINIC_PROFILE",changedFields:["displayName"]});
    await db.userClinic.update({where:{userId_clinicId:{userId,clinicId:clinicA}},data:{isActive:false}});
    const historical=await update({displayName:"Nombre histórico"}).expect(200);
    expect(historical.body.access).toBe("READ_ONLY");
    expect(historical.body.patientId).toBe(record.id);
  });

});
