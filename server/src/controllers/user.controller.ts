import { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { asyncHandler, AppError, sendValidationError } from "../utils/app-error";

// New endpoint, added in PHASE 12 — Section 4.2's route table has no
// read-own-profile route (only PATCH /users/me existed), yet the JWT
// payload deliberately excludes name/email/phone (Section 6's PII-
// minimization rule), leaving the frontend with no way to know a logged-in
// user's display name after login (as opposed to registration, where the
// name is already client-known from the form). This is the natural
// read-side counterpart to the existing PATCH /users/me, gated the same
// way (any authenticated role, own row only via req.user.id).
export const getProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    include: {
      customerProfile: true,
      workerProfile: { include: { cooperative: true } },
      adminProfile: true,
      preference: true
    }
  });

  return res.json({
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    theme: user.preference?.theme ?? "LIGHT",
    language: user.preference?.language ?? "en",
    customerProfile: user.customerProfile ? { id: user.customerProfile.id, defaultAddress: user.customerProfile.defaultAddress } : null,
    workerProfile: user.workerProfile
      ? {
          id: user.workerProfile.id,
          cooperativeId: user.workerProfile.cooperativeId,
          cooperativeName: user.workerProfile.cooperative.name,
          verificationStatus: user.workerProfile.verificationStatus,
          availabilityStatus: user.workerProfile.availabilityStatus,
          suspended: user.workerProfile.suspendedAt !== null,
          ratingAverage: user.workerProfile.ratingAverage,
          ratingCount: user.workerProfile.ratingCount,
          serviceAreaRadiusKm: user.workerProfile.serviceAreaRadiusKm
        }
      : null,
    adminProfile: user.adminProfile ? { isSuper: user.adminProfile.isSuper, title: user.adminProfile.title } : null
  });
});

// Section 1.2.9 — exact editable field set; no email/role field accepted
// (role is never client-settable, Section 7.4).
const updateProfileSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().min(10).max(15).optional(),
  avatarUrl: z.string().url().max(500).optional()
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const current = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  const phoneChanged = parsed.data.phone !== undefined && parsed.data.phone !== current.phone;

  if (phoneChanged) {
    const existing = await prisma.user.findUnique({ where: { phone: parsed.data.phone! } });
    if (existing) {
      throw new AppError(409, "PHONE_ALREADY_IN_USE", "This phone number is already registered");
    }
  }

  const updated = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      ...parsed.data,
      // A changed phone number invalidates its prior verification.
      phoneVerifiedAt: phoneChanged ? null : undefined
    }
  });

  return res.json({
    userId: updated.id,
    fullName: updated.fullName,
    phone: updated.phone,
    avatarUrl: updated.avatarUrl
  });
});

const updatePreferencesSchema = z.object({
  theme: z.enum(["LIGHT", "DARK"]).optional(),
  language: z.enum(["en", "hi", "ta", "bn"]).optional(),
  notificationChannels: z.array(z.enum(["IN_APP", "EMAIL", "SMS", "PUSH"])).optional()
});

export const updatePreferences = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updatePreferencesSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(req, res, parsed.error);

  const updated = await prisma.userPreference.update({
    where: { userId: req.user!.id },
    data: parsed.data
  });

  return res.json({
    theme: updated.theme,
    language: updated.language,
    notificationChannels: updated.notificationChannels
  });
});
