import { Request, Response } from "express";
import { z } from "zod";
import * as authService from "../services/auth.service";
import { asyncHandler, sendValidationError, AppError } from "../utils/app-error";
import { requestMeta } from "../utils/request-meta";
import { AuthenticatedRequest } from "../middleware/auth";

// Section 4.3's validated India bounding box, reused for every lat/lng field.
const LAT = z.number().min(6.0).max(37.5);
const LNG = z.number().min(68.0).max(97.5);

const REFRESH_COOKIE_NAME = "refreshToken";
const REFRESH_COOKIE_PATH = "/api/v1/auth/refresh";

function setRefreshCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    expires: expiresAt
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
}

export const customerRegisterSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(8).max(72),
  address: z.string().min(5).max(200),
  lat: LAT,
  lng: LNG,
  acceptedTerms: z.boolean()
});

export const registerCustomer = asyncHandler(async (req: Request, res: Response) => {
  const parsed = customerRegisterSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const { user, tokens } = await authService.registerCustomer(parsed.data, requestMeta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  return res.status(201).json({ userId: user.id, token: tokens.accessToken });
});

export const workerRegisterSchema = z.object({
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(8).max(72),
  cooperativeId: z.string().min(1),
  primarySkillId: z.string().min(1),
  experienceYears: z.number().int().min(0).max(60),
  homeLocation: z.object({ lat: LAT, lng: LNG, address: z.string().min(5).max(200) }),
  serviceAreaRadiusKm: z.number().positive().max(50),
  acceptedTerms: z.boolean()
});

export const registerWorker = asyncHandler(async (req: Request, res: Response) => {
  const parsed = workerRegisterSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const { user, tokens } = await authService.registerWorker(parsed.data, requestMeta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  return res.status(201).json({
    userId: user.id,
    workerProfileId: user.workerProfile!.id,
    verificationStatus: user.workerProfile!.verificationStatus,
    token: tokens.accessToken
  });
});

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1)
});

async function handleLogin(req: Request, res: Response, role: "CUSTOMER" | "WORKER" | "ADMIN") {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const { user, tokens } = await authService.login(role, parsed.data.identifier, parsed.data.password, requestMeta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  return res.json({ userId: user.id, token: tokens.accessToken, role: user.role });
}

export const loginCustomer = asyncHandler((req, res) => handleLogin(req, res, "CUSTOMER"));
export const loginWorker = asyncHandler((req, res) => handleLogin(req, res, "WORKER"));
export const loginAdmin = asyncHandler((req, res) => handleLogin(req, res, "ADMIN"));

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!raw) {
    throw new AppError(401, "MISSING_REFRESH_TOKEN", "No session found");
  }
  const tokens = await authService.refreshTokens(raw, requestMeta(req));
  setRefreshCookie(res, tokens.refreshToken, tokens.refreshTokenExpiresAt);
  return res.json({ token: tokens.accessToken });
});

export const logout = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE_NAME]);
  clearRefreshCookie(res);
  return res.status(200).json({ loggedOut: true });
});

export const logoutAll = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  await authService.logoutAll(req.user!.id);
  clearRefreshCookie(res);
  return res.status(200).json({ loggedOut: true });
});

const passwordResetRequestSchema = z.object({ identifier: z.string().min(3) });

export const passwordResetRequest = asyncHandler(async (req: Request, res: Response) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  await authService.requestPasswordReset(parsed.data.identifier);
  // Always 200 regardless of match — Section 6.5 enumeration mitigation.
  return res.status(200).json({ message: "If an account exists, a reset link has been sent" });
});

const passwordResetConfirmSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(72)
});

export const passwordResetConfirm = asyncHandler(async (req: Request, res: Response) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  await authService.confirmPasswordReset(parsed.data.token, parsed.data.newPassword);
  return res.status(200).json({ message: "Password updated, please log in again" });
});

const verifyOtpSchema = z.object({
  channel: z.enum(["EMAIL", "PHONE"]),
  code: z.string().length(6)
});

export const verifyOtp = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);
  await authService.verifyOtp(req.user!.id, parsed.data.channel, parsed.data.code);
  return res.json({ verified: true });
});
