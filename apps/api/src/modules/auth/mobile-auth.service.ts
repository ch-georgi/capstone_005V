import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, TenantRole } from "@prisma/client";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { isUUID } from "class-validator";
import { PrismaService } from "../../prisma/prisma.service";
import { SessionClaims } from "../../common/types/auth-context";
import { apiError } from "../../common/filters/api-error";
import { PasswordService } from "./password.service";
import { ContextService } from "./context.service";
import { MailService } from "./mail.service";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const secret = () => randomBytes(32).toString("hex");
const future = (ms: number) => new Date(Date.now() + ms);
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const denied = () =>
  apiError(
    401,
    "UNAUTHORIZED",
    "Sesión o autorización no válida. Inicia sesión nuevamente.",
  );
export interface ClinicOption {
  id: string;
  name: string;
  displayName: string;
  access: "READ_ONLY" | "READ_WRITE";
  patientRecordPending: boolean;
}
export interface MobileProfile {
  user: { id: string; email: string };
  clinic: { id: string; name: string };
  displayName: string;
  role: "PATIENT";
  access: "READ_ONLY" | "READ_WRITE";
  patientRecordPending: boolean;
  clinics: ClinicOption[];
}
export interface MobileSession {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  sessionExpiresAt: string;
  profile: MobileProfile;
}
@Injectable()
export class MobileAuthService {
  private readonly logger = new Logger(MobileAuthService.name);
  private readonly dummy: Promise<string>;
  constructor(
    private readonly db: PrismaService,
    private readonly passwords: PasswordService,
    private readonly contexts: ContextService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    this.dummy = passwords.hash(secret());
  }
  private lock(tx: Prisma.TransactionClient, userId: string) {
    return tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
  }
  private async limit(
    scope: string,
    value: string,
    count: number,
    seconds: number,
  ) {
    const key = hash(`${scope}:${value}`);
    const rows = await this.db.$queryRaw<{ count: number }[]>`
   INSERT INTO auth_rate_limits(key,count,reset_at) VALUES(${key},1,NOW()+${seconds}*INTERVAL '1 second')
   ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_rate_limits.reset_at<=NOW() THEN 1 ELSE auth_rate_limits.count+1 END,
    reset_at=CASE WHEN auth_rate_limits.reset_at<=NOW() THEN NOW()+${seconds}*INTERVAL '1 second' ELSE auth_rate_limits.reset_at END
   RETURNING count`;
    if (rows[0].count > count)
      throw apiError(
        429,
        "TOO_MANY_REQUESTS",
        "Demasiados intentos. Espera antes de volver a intentar.",
      );
  }
  private async clinics(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<ClinicOption[]> {
    const rows = await tx.userClinic.findMany({
      where: { userId, role: TenantRole.PATIENT },
      include: { clinic: true, patient: { select: { deletedAt: true } } },
      orderBy: { clinicId: "asc" },
    });
    return rows
      .filter((row) => (row.isActive && row.clinic.isActive) || !!row.patient)
      .map((row) => ({
        id: row.clinicId,
        name: row.clinic.name,
        displayName: row.displayName,
        access:
          row.isActive &&
          row.clinic.isActive &&
          row.patient &&
          !row.patient.deletedAt
            ? "READ_WRITE"
            : "READ_ONLY",
        patientRecordPending: !row.patient,
      }));
  }
  private async profile(
    tx: Prisma.TransactionClient,
    userId: string,
    clinicId: string,
  ): Promise<MobileProfile> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const clinics = await this.clinics(tx, userId),
      clinic = clinics.find((row) => row.id === clinicId);
    if (!clinic || !user.email || !user.passwordHash)
      throw apiError(
        403,
        "MOBILE_PATIENT_REQUIRED",
        "No tienes acceso como paciente. Utiliza el portal web o consulta a tu clínica.",
      );
    return {
      user: { id: userId, email: user.email },
      clinic: { id: clinic.id, name: clinic.name },
      displayName: clinic.displayName,
      role: "PATIENT",
      access: clinic.access,
      patientRecordPending: clinic.patientRecordPending,
      clinics,
    };
  }
  private async issue(
    tx: Prisma.TransactionClient,
    userId: string,
    clinicId: string,
    sessionId?: string,
    deadline?: Date,
  ): Promise<MobileSession> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const profile = await this.profile(tx, userId, clinicId);
    const session = sessionId
      ? await tx.authSession.findUniqueOrThrow({ where: { id: sessionId } })
      : await tx.authSession.create({
          data: {
            userId,
            clinicId,
            expiresAt: deadline ?? future(30 * 86400000),
          },
        });
    const refreshToken = secret();
    await tx.refreshToken.create({
      data: {
        userId,
        sessionId: session.id,
        tokenHash: hash(refreshToken),
        expiresAt: session.expiresAt,
      },
    });
    const expiresIn = Math.min(
      900,
      Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
    );
    if (expiresIn <= 0) throw denied();
    const accessToken = await this.jwt.signAsync(
      {
        sub: userId,
        context: "TENANT",
        clinicId,
        sid: session.id,
        credentialsVersion: user.credentialsVersion,
      },
      { expiresIn },
    );
    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer",
      expiresIn,
      sessionExpiresAt: session.expiresAt.toISOString(),
      profile,
    };
  }
  async login(email: string, password: string, ip: string) {
    await this.limit("login-ip", ip, 30, 900);
    await this.limit("login-email", email, 10, 900);
    const user = await this.db.user.findUnique({ where: { email } });
    const valid = await this.passwords.verify(
      user?.passwordHash ?? (await this.dummy),
      password,
    );
    if (!user?.passwordHash || !valid)
      throw apiError(
        401,
        "INVALID_CREDENTIALS",
        "Email o contraseña incorrectos.",
      );
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, user.id);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      if (current.credentialsVersion !== user.credentialsVersion)
        throw denied();
      const clinics = await this.clinics(tx, user.id);
      if (!clinics.length)
        throw apiError(
          403,
          "MOBILE_PATIENT_REQUIRED",
          "No tienes acceso como paciente. Utiliza el portal web o consulta a tu clínica.",
        );
      if (clinics.length === 1)
        return {
          status: "AUTHENTICATED" as const,
          session: await this.issue(tx, user.id, clinics[0].id),
        };
      const id = randomUUID(),
        token = secret();
      await tx.authChallenge.create({
        data: {
          id,
          userId: user.id,
          purpose: "CLINIC_SELECTION",
          secretHash: hash(token),
          credentialsVersion: user.credentialsVersion,
          expiresAt: future(300000),
        },
      });
      return {
        status: "CLINIC_SELECTION_REQUIRED" as const,
        selectionToken: `${id}.${token}`,
        clinics,
      };
    });
  }
  private split(token: string) {
    const [id, key, ...rest] = token.split(".");
    if (!isUUID(id) || !/^[a-f0-9]{64}$/.test(key ?? "") || rest.length)
      throw denied();
    return { id, key };
  }
  async select(token: string, clinicId: string) {
    const { id, key } = this.split(token);
    const candidate = await this.db.authChallenge.findUnique({ where: { id } });
    if (!candidate?.userId) throw denied();
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, candidate.userId!);
      const challenge = await tx.authChallenge.findUnique({ where: { id } });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: candidate.userId! },
      });
      if (
        !challenge ||
        challenge.purpose !== "CLINIC_SELECTION" ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.credentialsVersion !== user.credentialsVersion ||
        !equal(challenge.secretHash, hash(key))
      )
        throw denied();
      const result = await this.issue(tx, user.id, clinicId);
      await tx.authChallenge.update({
        where: { id },
        data: { consumedAt: new Date() },
      });
      return result;
    });
  }
  async me(claims: SessionClaims) {
    if (claims.context !== "TENANT" || !claims.sid) throw denied();
    await this.contexts.resolve(claims);
    return this.profile(this.db, claims.sub, claims.clinicId);
  }
  async switchClinic(claims: SessionClaims, clinicId: string) {
    if (claims.context !== "TENANT" || !claims.sid) throw denied();
    return this.db.$transaction(async (tx) => {
      await this.lock(tx, claims.sub);
      await this.contexts.resolve(claims, tx);
      const previous = await tx.authSession.findUniqueOrThrow({
        where: { id: claims.sid },
      });
      const result = await this.issue(
        tx,
        claims.sub,
        clinicId,
        undefined,
        previous.expiresAt,
      );
      await this.revoke(tx, claims.sid!);
      return result;
    });
  }
  private async revoke(tx: Prisma.TransactionClient, id: string) {
    await tx.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.refreshToken.updateMany({
      where: { sessionId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  async refresh(token: string) {
    const candidate = await this.db.refreshToken.findUnique({
      where: { tokenHash: hash(token) },
    });
    if (!candidate?.sessionId) throw denied();
    const result = await this.db.$transaction(async (tx) => {
      await this.lock(tx, candidate.userId);
      const row = await tx.refreshToken.findUniqueOrThrow({
        where: { id: candidate.id },
      });
      const session = await tx.authSession.findUniqueOrThrow({
        where: { id: row.sessionId! },
      });
      if (row.revokedAt) {
        await this.revoke(tx, session.id);
        return null;
      }
      if (
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        row.expiresAt <= new Date()
      )
        return null;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
      await this.contexts.resolve(
        {
          sub: row.userId,
          context: "TENANT",
          clinicId: session.clinicId,
          sid: session.id,
          credentialsVersion: user.credentialsVersion,
        },
        tx,
      );
      await tx.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      return this.issue(tx, row.userId, session.clinicId, session.id);
    });
    if (!result) throw denied();
    return result;
  }
  async logout(token: string) {
    const row = await this.db.refreshToken.findUnique({
      where: { tokenHash: hash(token) },
    });
    if (row?.sessionId)
      await this.db.$transaction(async (tx) => {
        await this.lock(tx, row.userId);
        await this.revoke(tx, row.sessionId!);
      });
  }
  private codeHash(id: string, code: string) {
    const key = this.config.get<string>("PASSWORD_RESET_SECRET");
    if (!key || Buffer.byteLength(key) < 32)
      throw apiError(
        503,
        "RECOVERY_UNAVAILABLE",
        "La recuperación no está disponible. Consulta a tu clínica.",
      );
    return createHmac("sha256", key).update(`${id}:${code}`).digest("hex");
  }
  async forgot(email: string, ip: string) {
    if (!this.config.get("SMTP_HOST"))
      throw apiError(
        503,
        "RECOVERY_UNAVAILABLE",
        "La recuperación no está disponible. Consulta a tu clínica.",
      );
    const id = randomUUID(),
      code = String(randomInt(0, 1000000)).padStart(6, "0"),
      secretHash = this.codeHash(id, code);
    await this.limit("recovery-ip", ip, 20, 3600);
    await this.limit("recovery-email-hour", email, 5, 3600);
    await this.limit("recovery-email-minute", email, 1, 60);
    const user = await this.db.user.findUnique({ where: { email } });
    await this.db.$transaction(async (tx) => {
      if (user) {
        await this.lock(tx, user.id);
        await tx.authChallenge.updateMany({
          where: {
            userId: user.id,
            purpose: { in: ["PASSWORD_CODE", "PASSWORD_RESET"] },
            consumedAt: null,
          },
          data: { consumedAt: new Date() },
        });
      }
      const current = user
        ? await tx.user.findUniqueOrThrow({ where: { id: user.id } })
        : null;
      await tx.authChallenge.create({
        data: {
          id,
          userId: current?.passwordHash ? current.id : null,
          purpose: "PASSWORD_CODE",
          secretHash,
          credentialsVersion: current?.credentialsVersion ?? 0,
          expiresAt: future(600000),
        },
      });
    });
    // Delivery is detached from the public response to avoid revealing account existence through SMTP latency.
    if (user?.passwordHash)
      void this.mail
        .sendCode(email, code)
        .catch(() =>
          this.logger.error(
            "Recuperación solicitada; entrega SMTP no confirmada.",
          ),
        );

    return {
      challengeId: id,
      message:
        "Si existe una cuenta con ese correo, recibirás un código de recuperación.",
      resendAfter: 60,
    };
  }
  async verifyCode(id: string, code: string, ip: string) {
    await this.limit("verify-ip", ip, 50, 3600);
    const initial = await this.db.authChallenge.findUnique({ where: { id } });
    const token = secret();
    const result = await this.db.$transaction(async (tx) => {
      if (initial?.userId) await this.lock(tx, initial.userId);
      await tx.$queryRaw`SELECT id FROM auth_challenges WHERE id=${id}::uuid FOR UPDATE`;
      const challenge = await tx.authChallenge.findUnique({ where: { id } });
      if (
        !challenge ||
        challenge.purpose !== "PASSWORD_CODE" ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.attempts >= 5
      )
        return false;
      const user = challenge.userId
        ? await tx.user.findUnique({ where: { id: challenge.userId } })
        : null;
      const valid =
        equal(challenge.secretHash, this.codeHash(id, code)) &&
        !!user?.passwordHash &&
        challenge.credentialsVersion === user.credentialsVersion;
      if (!valid) {
        await tx.authChallenge.update({
          where: { id },
          data: { attempts: { increment: 1 } },
        });
        return false;
      }
      await tx.authChallenge.update({
        where: { id },
        data: {
          purpose: "PASSWORD_RESET",
          secretHash: hash(token),
          expiresAt: future(300000),
          attempts: 0,
        },
      });
      return true;
    });
    if (!result)
      throw apiError(
        400,
        "INVALID_RECOVERY_CODE",
        "Código no válido o vencido. Solicita uno nuevo.",
      );
    return { resetToken: `${id}.${token}`, expiresIn: 300 };
  }
  async reset(token: string, password: string, ip: string) {
    await this.limit("reset-ip", ip, 20, 900);
    const { id, key } = this.split(token);
    const initial = await this.db.authChallenge.findUnique({ where: { id } });
    if (
      !initial?.userId ||
      initial.purpose !== "PASSWORD_RESET" ||
      initial.consumedAt ||
      initial.expiresAt <= new Date() ||
      !equal(initial.secretHash, hash(key))
    )
      throw denied();
    const passwordHash = await this.passwords.hash(password);
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, initial.userId!);
      const challenge = await tx.authChallenge.findUniqueOrThrow({
        where: { id },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: initial.userId! },
      });
      if (
        challenge.purpose !== "PASSWORD_RESET" ||
        challenge.consumedAt ||
        challenge.expiresAt <= new Date() ||
        challenge.credentialsVersion !== user.credentialsVersion ||
        !equal(challenge.secretHash, hash(key))
      )
        throw denied();
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, credentialsVersion: { increment: 1 } },
      });
      await tx.authChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
