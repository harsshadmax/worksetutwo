import crypto from "crypto";
import bcrypt from "bcrypt";
import { Prisma, User, UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { signAccessToken, Role } from "../lib/jwt";
import { AppError } from "../utils/app-error";

const BCRYPT_COST = 12; // Section 6.2
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // Section 6.1 — 30 days
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000; // Section 6.5
const OTP_TTL_MS = 10 * 60 * 1000; // Section 6.5
const MAX_FAILED_LOGIN_ATTEMPTS = 5; // Section 6.6
const LOCKOUT_MS = 15 * 60 * 1000; // Section 6.6
const MAX_OTP_ATTEMPTS = 5; // Section 6.5

interface RequestMeta {
  ipAddress?: string;
  userAgent?: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

async function issueTokenPair(user: Pick<User, "id" | "role" | "tokenVersion">, meta: RequestMeta): Promise<IssuedTokens> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role as Role, tokenVersion: user.tokenVersion });
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent
    }
  });
  return { accessToken, refreshToken, refreshTokenExpiresAt: expiresAt };
}

// Section 6.5 — registration creates an OtpVerification row and dispatches
// it. The Section 18 NotificationChannel abstraction (InAppChannel/
// EmailChannel/SmsChannel) is explicitly PHASE 10 work (Section 28); until
// then, dispatch is the same "always SENT in development" console stub
// Section 18.4 describes for an unconfigured channel — not a gap, just
// built in the order the PRD's own phase plan lays out.
//
// codeHash uses sha256, not bcrypt: this was a real registration-latency
// contributor -- a second ~200-300ms synchronous BCRYPT_COST=12 hash,
// on top of the password's own, running inside the registration
// transaction on every signup. A 6-digit OTP is low-entropy, 10-minute-
// lived, and already attempt-limited (MAX_OTP_ATTEMPTS in verifyOtp), so
// it doesn't carry the same offline-brute-force threat a password hash
// defends against -- sha256 (already used for refresh/reset tokens
// elsewhere in this file) is the appropriate cost here.
async function createOtpVerification(tx: Prisma.TransactionClient, userId: string, channel: "EMAIL" | "PHONE") {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = sha256(code);
  await tx.otpVerification.create({
    data: { userId, channel, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS) }
  });
  console.log(`[DEV OTP] ${channel} verification code for user ${userId}: ${code}`);
}

async function assertIdentityAvailable(email: string, phone: string) {
  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { phone }] } });
  if (existing) {
    throw new AppError(409, "ACCOUNT_ALREADY_EXISTS", "An account with this email or phone already exists");
  }
}

export interface RegisterCustomerInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  address: string;
  lat: number;
  lng: number;
  acceptedTerms: boolean;
}

export async function registerCustomer(input: RegisterCustomerInput, meta: RequestMeta) {
  if (!input.acceptedTerms) {
    throw new AppError(400, "TERMS_NOT_ACCEPTED", "You must accept the terms to register");
  }
  await assertIdentityAvailable(input.email, input.phone);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: "CUSTOMER",
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        acceptedTermsAt: new Date(),
        preference: { create: {} },
        customerProfile: { create: { defaultAddress: input.address } }
      },
      include: { customerProfile: true }
    });
    await tx.$executeRaw`
      UPDATE customer_profiles
      SET "defaultLocation" = ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)
      WHERE id = ${created.customerProfile!.id}
    `;
    await createOtpVerification(tx, created.id, "PHONE");
    return created;
  });

  const tokens = await issueTokenPair(user, meta);
  return { user, tokens };
}

export interface RegisterWorkerInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  cooperativeId: string;
  primarySkillId: string;
  experienceYears: number;
  homeLocation: { lat: number; lng: number; address: string };
  serviceAreaRadiusKm: number;
  acceptedTerms: boolean;
}

export async function registerWorker(input: RegisterWorkerInput, meta: RequestMeta) {
  if (!input.acceptedTerms) {
    throw new AppError(400, "TERMS_NOT_ACCEPTED", "You must accept the terms to register");
  }
  await assertIdentityAvailable(input.email, input.phone);

  const cooperative = await prisma.cooperative.findUnique({ where: { id: input.cooperativeId } });
  if (!cooperative) {
    throw new AppError(404, "COOPERATIVE_NOT_FOUND", "Selected cooperative does not exist");
  }
  const skill = await prisma.skillCategory.findUnique({ where: { id: input.primarySkillId } });
  if (!skill) {
    throw new AppError(404, "SKILL_NOT_FOUND", "Selected skill does not exist");
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        role: "WORKER",
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        acceptedTermsAt: new Date(),
        preference: { create: {} },
        workerProfile: {
          create: {
            cooperativeId: input.cooperativeId,
            experienceYears: input.experienceYears,
            serviceAreaRadiusKm: input.serviceAreaRadiusKm,
            skills: { create: [{ skillCategoryId: input.primarySkillId, isPrimary: true }] }
          }
        }
      },
      include: { workerProfile: true }
    });
    await tx.$executeRaw`
      UPDATE worker_profiles
      SET "homeLocation" = ST_SetSRID(ST_MakePoint(${input.homeLocation.lng}, ${input.homeLocation.lat}), 4326)
      WHERE id = ${created.workerProfile!.id}
    `;
    await createOtpVerification(tx, created.id, "PHONE");
    return created;
  });

  const tokens = await issueTokenPair(user, meta);
  return { user, tokens };
}

export async function login(role: UserRole, identifier: string, password: string, meta: RequestMeta) {
  const user = await prisma.user.findFirst({ where: { role, OR: [{ email: identifier }, { phone: identifier }] } });

  // Section 9 — same generic error whether the account exists or not, to
  // avoid enumeration.
  if (!user || user.deletedAt) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, "ACCOUNT_LOCKED", "Account temporarily locked due to repeated failed login attempts");
  }
  if (user.accountStatus === "SUSPENDED") {
    throw new AppError(403, "ACCOUNT_SUSPENDED", "This account has been suspended");
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failedLoginAttempts = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts,
        lockedUntil: failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : undefined
      }
    });
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
  }

  const refreshedUser = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
  });

  const tokens = await issueTokenPair(refreshedUser, meta);
  return { user: refreshedUser, tokens };
}

export async function refreshTokens(rawRefreshToken: string, meta: RequestMeta): Promise<IssuedTokens> {
  const tokenHash = sha256(rawRefreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!existing) {
    throw new AppError(401, "INVALID_REFRESH_TOKEN", "Invalid session, please log in again");
  }

  if (existing.revokedAt) {
    // Section 6.3 reuse detection — a revoked token being presented again
    // means it was captured/replayed. Revoke the whole family.
    await prisma.$transaction([
      prisma.refreshToken.updateMany({ where: { userId: existing.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.user.update({ where: { id: existing.userId }, data: { tokenVersion: { increment: 1 } } })
    ]);
    throw new AppError(401, "REFRESH_TOKEN_REUSED", "Session invalidated due to suspicious activity, please log in again");
  }

  if (existing.expiresAt < new Date()) {
    throw new AppError(401, "REFRESH_TOKEN_EXPIRED", "Session expired, please log in again");
  }

  const newRaw = generateOpaqueToken();
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: sha256(newRaw),
        expiresAt: newExpiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent
      }
    });
    await tx.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenId: created.id }
    });
  });

  const accessToken = signAccessToken({
    sub: existing.user.id,
    role: existing.user.role as Role,
    tokenVersion: existing.user.tokenVersion
  });

  return { accessToken, refreshToken: newRaw, refreshTokenExpiresAt: newExpiresAt };
}

export async function logout(rawRefreshToken: string | undefined): Promise<void> {
  if (!rawRefreshToken) return;
  const tokenHash = sha256(rawRefreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { OR: [{ email: identifier }, { phone: identifier }] } });
  // Always the same outward behavior regardless of match — Section 9
  // enumeration mitigation, restated by Section 6.5.
  if (user && !user.deletedAt) {
    const rawToken = generateOpaqueToken();
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) }
    });
    console.log(`[DEV PASSWORD RESET] token for user ${user.id}: ${rawToken}`);
  }
}

export async function confirmPasswordReset(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError(400, "INVALID_RESET_TOKEN", "This reset link is invalid or has expired");
  }
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
  await prisma.$transaction([
    // tokenVersion bump alone invalidates access tokens; refresh tokens are
    // opaque DB rows the JWT tokenVersion can't reach, so they're revoked
    // explicitly too — otherwise a still-valid refresh token could mint a
    // fresh access token immediately after reset, defeating the point.
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
  ]);
}

export async function verifyOtp(userId: string, channel: "EMAIL" | "PHONE", code: string): Promise<void> {
  const record = await prisma.otpVerification.findFirst({
    where: { userId, channel, consumedAt: null },
    orderBy: { createdAt: "desc" }
  });
  if (!record || record.expiresAt < new Date()) {
    throw new AppError(400, "OTP_EXPIRED_OR_NOT_FOUND", "This code has expired, please request a new one");
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError(429, "OTP_LOCKED", "Too many incorrect attempts, please request a new code");
  }
  const submittedHash = Buffer.from(sha256(code));
  const storedHash = Buffer.from(record.codeHash);
  const valid = submittedHash.length === storedHash.length && crypto.timingSafeEqual(submittedHash, storedHash);
  if (!valid) {
    await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw new AppError(400, "OTP_INCORRECT", "Incorrect code");
  }
  await prisma.$transaction([
    prisma.otpVerification.update({ where: { id: record.id }, data: { consumedAt: new Date() } }),
    prisma.user.update({
      where: { id: userId },
      data: channel === "EMAIL" ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() }
    })
  ]);
}
