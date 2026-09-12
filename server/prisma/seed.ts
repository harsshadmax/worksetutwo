// prisma/seed.ts — Worksetu demo dataset (Section 19.3, 21.5, 15.9)
//
// Draws on mockData.js (cooperatives, services, workers, customers, and the
// original 9 sample bookings) and extends it with synthetic-but-coherent
// records so every Booking lifecycle stage (Section 1.0), skill/location,
// review, notification, wallet/ledger, and incentive/Feedback Credit row is
// represented at least once, per Section 19.3. Re-runnable: clears its own
// seed-owned tables in FK-safe order before re-inserting, so this same
// script backs POST /api/v1/admin/demo/reset (Section 15.9).

import { PrismaClient, VerificationStatus, WorkerAvailabilityStatus, ProficiencyLevel, BookingStatus, DispatchAttempt, DispatchOutcome, PaymentMethod, CreditTransactionType, CreditTransactionStatus, PayoutMethod, SettlementStatus, IncentiveStatus, NotificationAudience } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const BCRYPT_COST = 12;
const COMMISSION_PERCENT = 15.0;
const FEEDBACK_CREDIT_SHARE = 0.2;

async function hash(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_COST);
}

async function setPoint(table: "customer_profiles" | "worker_profiles", column: string, id: string, lng: number, lat: number) {
  await prisma.$executeRawUnsafe(
    `UPDATE ${table} SET "${column}" = ST_SetSRID(ST_MakePoint($1, $2), 4326) WHERE id = $3`,
    lng,
    lat,
    id
  );
}

async function setWorkerLocations(workerProfileId: string, lng: number, lat: number) {
  await prisma.$executeRaw`
    UPDATE worker_profiles
    SET "homeLocation" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        "currentLocation" = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326),
        "lastLocationAt" = now()
    WHERE id = ${workerProfileId}
  `;
}

interface InsertBookingParams {
  customerId: string;
  serviceCategoryId: string;
  description: string;
  address: string;
  lng: number;
  lat: number;
  scheduledAt: Date | null;
  urgency: "NORMAL" | "URGENT";
  baseCharge: number;
  hourlyRate: number;
  estimatedTotal: number;
  status: BookingStatus;
  assignedWorkerId?: string | null;
  confirmedAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  settledAt?: Date | null;
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  createdAt: Date;
}

async function insertBooking(p: InsertBookingParams): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO bookings (
      id, "customerId", "serviceCategoryId", type, description, address,
      "customerLocation", "scheduledAt", urgency, "baseCharge", "hourlyRate",
      "estimatedTotal", status, "assignedWorkerId", "confirmedAt", "startedAt",
      "completedAt", "settledAt", "cancelledAt", "cancelReason", "createdAt", "updatedAt"
    ) VALUES (
      gen_random_uuid(), ${p.customerId}, ${p.serviceCategoryId},
      ${p.scheduledAt ? "SCHEDULED" : "ON_DEMAND"}::"BookingType", ${p.description}, ${p.address},
      ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326),
      ${p.scheduledAt}, ${p.urgency}::"UrgencyLevel", ${p.baseCharge}, ${p.hourlyRate},
      ${p.estimatedTotal}, ${p.status}::"BookingStatus", ${p.assignedWorkerId ?? null},
      ${p.confirmedAt ?? null}, ${p.startedAt ?? null}, ${p.completedAt ?? null},
      ${p.settledAt ?? null}, ${p.cancelledAt ?? null}, ${p.cancelReason ?? null},
      ${p.createdAt}, now()
    )
    RETURNING id
  `;
  return rows[0].id;
}

async function clearSeedOwnedData() {
  // Reverse dependency order — safe to re-run (Section 15.9 demo reset).
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.settlementRecord.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.feedbackCredit.deleteMany();
  await prisma.incentiveProgress.deleteMany();
  await prisma.review.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.dispatchLog.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.document.deleteMany();
  await prisma.workerSkill.deleteMany();
  await prisma.workerProfile.deleteMany();
  await prisma.customerProfile.deleteMany();
  await prisma.adminProfile.deleteMany();
  await prisma.userPreference.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.otpVerification.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.user.deleteMany();
  await prisma.serviceCategory.deleteMany();
  await prisma.skillCategory.deleteMany();
  await prisma.cooperative.deleteMany();
}

async function main() {
  console.log("Clearing prior seed data...");
  await clearSeedOwnedData();

  console.log("Platform config...");
  await prisma.platformConfig.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, commissionPercent: COMMISSION_PERCENT, top3TimeoutSeconds: 45, poolTimeoutSeconds: 120 }
  });

  console.log("Cooperatives...");
  const cooperativeData = [
    { id: "coop-1", name: "Chennai Skilled Workers Cooperative", location: "Chennai", registrationNumber: "TN/COOP/2018/0114", members: 340, founded: 2018, dividendSharePercent: 12 },
    { id: "coop-2", name: "Delhi Household & Labor Union", location: "Delhi", registrationNumber: "DL/COOP/2015/0089", members: 520, founded: 2015, dividendSharePercent: 10 },
    { id: "coop-3", name: "Mumbai Community & Caregivers Society", location: "Mumbai", registrationNumber: "MH/COOP/2020/0231", members: 280, founded: 2020, dividendSharePercent: 15 },
    { id: "coop-4", name: "Bangalore Technicians Cooperative Board", location: "Bangalore", registrationNumber: "KA/COOP/2017/0176", members: 410, founded: 2017, dividendSharePercent: 8 }
  ];
  for (const c of cooperativeData) {
    await prisma.cooperative.create({ data: c });
  }

  console.log("Service categories + matching skill categories...");
  const serviceData = [
    { id: "plumbing", translationKey: "plumbing", baseRate: 250, hourlyRate: 150, icon: "wrench" },
    { id: "electrical", translationKey: "electrical", baseRate: 300, hourlyRate: 200, icon: "zap" },
    { id: "carpentry", translationKey: "carpentry", baseRate: 280, hourlyRate: 180, icon: "hammer" },
    { id: "painting", translationKey: "painting", baseRate: 350, hourlyRate: 220, icon: "paint-brush" },
    { id: "caregiving", translationKey: "caregiving", baseRate: 400, hourlyRate: 250, icon: "heart" },
    // "flower"/"sparkles" were never valid Font Awesome 6 Free icon names
    // (confirmed live: content: none on both), so these two cards rendered
    // with no glyph at all despite the icon markup being wired correctly.
    // seedling/broom are real icons in the same fa-solid set already used
    // by every other service card.
    { id: "gardening", translationKey: "gardening", baseRate: 200, hourlyRate: 120, icon: "seedling" },
    { id: "cleaning", translationKey: "cleaning", baseRate: 180, hourlyRate: 100, icon: "broom" },
    { id: "domesticHelp", translationKey: "domesticHelp", baseRate: 220, hourlyRate: 130, icon: "utensils" }
  ];
  for (let i = 0; i < serviceData.length; i++) {
    const s = serviceData[i];
    await prisma.serviceCategory.create({ data: { ...s, sortOrder: i, isEnabled: true } });
    await prisma.skillCategory.create({ data: { id: s.id, translationKey: s.translationKey } });
  }

  console.log("Admin (super)...");
  const adminUser = await prisma.user.create({
    data: {
      role: "ADMIN",
      fullName: "Federation Registrar",
      email: "registrar@worksetu.coop",
      phone: "9000000001",
      passwordHash: await hash("AdminPass@123"),
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      acceptedTermsAt: new Date(),
      adminProfile: { create: { title: "Federation Registrar", isSuper: true } },
      preference: { create: {} }
    }
  });

  console.log("Customers...");
  const customerSeeds = [
    { id: "cust-1", name: "Anand Verma", email: "anand@example.com", phone: "9876543210", address: "12, Kasturba Gandhi Marg, Connaught Place, New Delhi", lng: 77.2167, lat: 28.6315 },
    { id: "cust-2", name: "Deepika Ramaswamy", email: "deepika@example.com", phone: "8765432109", address: "54, Gandhi Nagar Main Road, Adyar, Chennai", lng: 80.2569, lat: 13.0064 }
  ];
  const customerProfileIdByMockId = new Map<string, string>();
  const customerUserIdByMockId = new Map<string, string>();
  for (const c of customerSeeds) {
    const user = await prisma.user.create({
      data: {
        role: "CUSTOMER",
        fullName: c.name,
        email: c.email,
        phone: c.phone,
        passwordHash: await hash("Customer@123"),
        accountStatus: "ACTIVE",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        customerProfile: { create: { defaultAddress: c.address } },
        preference: { create: {} }
      },
      include: { customerProfile: true }
    });
    await setPoint("customer_profiles", "defaultLocation", user.customerProfile!.id, c.lng, c.lat);
    customerProfileIdByMockId.set(c.id, user.customerProfile!.id);
    customerUserIdByMockId.set(c.id, user.id);
  }

  console.log("Workers...");
  interface WorkerSeed {
    mockId: string;
    name: string;
    email: string;
    phone: string;
    skill: string;
    extraSkills?: string[];
    rating: number;
    experience: number;
    location: string;
    lng: number;
    lat: number;
    cooperativeId: string;
    availabilityStatus: WorkerAvailabilityStatus;
  }
  const workerSeeds: WorkerSeed[] = [
    { mockId: "worker-1", name: "Ravi Kumar", email: "ravi.kumar@example.com", phone: "9876543211", skill: "plumbing", rating: 4.8, experience: 6, location: "Adyar, Chennai", lng: 80.2565, lat: 13.0012, cooperativeId: "coop-1", availabilityStatus: "AVAILABLE" },
    { mockId: "worker-2", name: "Priya Shanmugam", email: "priya.shanmugam@example.com", phone: "8765432112", skill: "plumbing", rating: 4.9, experience: 5, location: "Mylapore, Chennai", lng: 80.2707, lat: 13.0339, cooperativeId: "coop-1", availabilityStatus: "AVAILABLE" },
    { mockId: "worker-3", name: "Amit Singh", email: "amit.singh@example.com", phone: "7654321213", skill: "plumbing", rating: 4.7, experience: 8, location: "Connaught Place, New Delhi", lng: 77.2167, lat: 28.6315, cooperativeId: "coop-2", availabilityStatus: "AVAILABLE" },
    { mockId: "worker-4", name: "Vikram Rathore", email: "vikram.rathore@example.com", phone: "9543210914", skill: "plumbing", rating: 4.5, experience: 4, location: "Andheri, Mumbai", lng: 72.8697, lat: 19.1197, cooperativeId: "coop-3", availabilityStatus: "AVAILABLE" },
    { mockId: "worker-5", name: "Suresh Babu", email: "suresh.babu@example.com", phone: "9432109815", skill: "plumbing", rating: 4.2, experience: 10, location: "T. Nagar, Chennai", lng: 80.2341, lat: 13.0418, cooperativeId: "coop-1", availabilityStatus: "OFF_DUTY" },
    { mockId: "worker-6", name: "Lakshmi Narayanan", email: "lakshmi.narayanan@example.com", phone: "9321098716", skill: "plumbing", rating: 4.6, experience: 7, location: "Indiranagar, Bangalore", lng: 77.6408, lat: 12.9716, cooperativeId: "coop-4", availabilityStatus: "AVAILABLE" },
    { mockId: "worker-7", name: "Rajesh Kannan", email: "rajesh.kannan@example.com", phone: "9210987617", skill: "electrical", rating: 4.9, experience: 9, location: "Velachery, Chennai", lng: 80.2209, lat: 12.9756, cooperativeId: "coop-1", availabilityStatus: "AVAILABLE" },
    { mockId: "worker-8", name: "Meena Kumari", email: "meena.kumari@example.com", phone: "9109876518", skill: "caregiving", extraSkills: ["cleaning"], rating: 4.8, experience: 5, location: "Bandra, Mumbai", lng: 72.8296, lat: 19.0596, cooperativeId: "coop-3", availabilityStatus: "AVAILABLE" }
  ];

  const workerProfileIdByMockId = new Map<string, string>();
  const workerUserIdByMockId = new Map<string, string>();
  for (const w of workerSeeds) {
    const proficiency: ProficiencyLevel = w.experience >= 8 ? "ADVANCED" : w.experience >= 5 ? "INTERMEDIATE" : "BASIC";
    const user = await prisma.user.create({
      data: {
        role: "WORKER",
        fullName: w.name,
        email: w.email,
        phone: w.phone,
        passwordHash: await hash("Worker@123"),
        accountStatus: "ACTIVE",
        emailVerifiedAt: new Date(),
        phoneVerifiedAt: new Date(),
        acceptedTermsAt: new Date(),
        preference: { create: {} },
        workerProfile: {
          create: {
            cooperativeId: w.cooperativeId,
            experienceYears: w.experience,
            serviceAreaRadiusKm: 10,
            verificationStatus: "APPROVED" as VerificationStatus,
            approvedAt: new Date(),
            approvedByAdminId: adminUser.id,
            availabilityStatus: w.availabilityStatus,
            ratingAverage: w.rating,
            ratingCount: 1,
            skills: {
              create: [w.skill, ...(w.extraSkills ?? [])].map((skillId, idx) => ({
                skillCategoryId: skillId,
                proficiencyLevel: proficiency,
                verificationStatus: "APPROVED" as VerificationStatus,
                isPrimary: idx === 0
              }))
            }
          }
        }
      },
      include: { workerProfile: true }
    });
    await setWorkerLocations(user.workerProfile!.id, w.lng, w.lat);
    workerProfileIdByMockId.set(w.mockId, user.workerProfile!.id);
    workerUserIdByMockId.set(w.mockId, user.id);

    await prisma.auditLog.create({
      data: {
        actorId: adminUser.id,
        action: "WORKER_VERIFIED",
        entityType: "WorkerProfile",
        entityId: user.workerProfile!.id,
        metadata: { decision: "APPROVED" }
      }
    });
  }

  // ---------------------------------------------------------------------
  // Historical bookings from mockData.js — all "Completed" (with rating +
  // review already given) map to backend SETTLED (Section 1.0: review
  // submission is what finalizes settlement); the one "Cancelled" row maps
  // to CANCELLED.
  // ---------------------------------------------------------------------
  console.log("Historical bookings (from mockData.js)...");
  interface MockBooking {
    customerMockId: string;
    serviceId: string;
    workerMockId: string | null;
    description: string;
    datetime: string;
    urgency: "NORMAL" | "URGENT";
    estimatedCost: number;
    status: "SETTLED" | "CANCELLED";
    rating: number | null;
    review: string | null;
  }
  const mockBookings: MockBooking[] = [
    { customerMockId: "cust-2", serviceId: "plumbing", workerMockId: "worker-1", description: "Repair bathroom shower mixer and inspect kitchen drain blockage.", datetime: "2026-08-20T10:00", urgency: "NORMAL", estimatedCost: 400, status: "SETTLED", rating: 5, review: "Excellent service! Ravi was very polite and solved the issue quickly. He had all the tools and explained the cooperative billing structure clearly." },
    { customerMockId: "cust-2", serviceId: "cleaning", workerMockId: "worker-8", description: "Complete post-festive cleaning of 3BHK house.", datetime: "2026-08-22T09:00", urgency: "NORMAL", estimatedCost: 1180, status: "SETTLED", rating: 4, review: "Very professional cleaners. They arrived on time. Deducting one star only because they ran out of a cleaning solution, but overall coop service was great." },
    { customerMockId: "cust-1", serviceId: "plumbing", workerMockId: "worker-1", description: "Install new kitchen sink faucet and fix leakage in inlet pipe.", datetime: "2026-08-21T14:30", urgency: "NORMAL", estimatedCost: 350, status: "SETTLED", rating: 5, review: "Ravi did a great job. Quick and highly professional." },
    { customerMockId: "cust-2", serviceId: "plumbing", workerMockId: "worker-1", description: "Water tank valve replacement.", datetime: "2026-08-22T11:00", urgency: "NORMAL", estimatedCost: 500, status: "SETTLED", rating: 4, review: "Arrived on time. The cooperative society rates are very transparent." },
    { customerMockId: "cust-1", serviceId: "plumbing", workerMockId: "worker-1", description: "Basement drainage pipeline cleaning.", datetime: "2026-08-23T15:00", urgency: "URGENT", estimatedCost: 650, status: "SETTLED", rating: 5, review: "Emergency response was fantastic. Highly recommended plumbing crew." },
    { customerMockId: "cust-2", serviceId: "plumbing", workerMockId: "worker-1", description: "Bathroom wash basin fitting installation.", datetime: "2026-08-24T10:00", urgency: "NORMAL", estimatedCost: 300, status: "SETTLED", rating: 5, review: "Very neat work and friendly attitude." },
    { customerMockId: "cust-1", serviceId: "plumbing", workerMockId: "worker-1", description: "Geyser inlet outlet hose replacement.", datetime: "2026-08-24T16:30", urgency: "NORMAL", estimatedCost: 280, status: "SETTLED", rating: 5, review: "Quick and efficient resolution." },
    { customerMockId: "cust-2", serviceId: "plumbing", workerMockId: "worker-1", description: "Kitchen water purifier line connector block.", datetime: "2026-08-25T09:00", urgency: "NORMAL", estimatedCost: 220, status: "SETTLED", rating: 5, review: "Excellent response, solved the Purifier line issue in 10 minutes." },
    { customerMockId: "cust-2", serviceId: "plumbing", workerMockId: "worker-1", description: "Outdoor sprinkler line joint leak check.", datetime: "2026-08-19T13:00", urgency: "NORMAL", estimatedCost: 200, status: "CANCELLED", rating: null, review: null }
  ];

  // Aggregate rating for worker-1 (Ravi) so ratingAverage/ratingCount reflect
  // the reviews actually seeded below, instead of the flat mock "4.8".
  const raviReviews = mockBookings.filter((b) => b.workerMockId === "worker-1" && b.rating !== null).map((b) => b.rating as number);
  const meenaReviews = mockBookings.filter((b) => b.workerMockId === "worker-8" && b.rating !== null).map((b) => b.rating as number);

  for (const b of mockBookings) {
    const customerProfileId = customerProfileIdByMockId.get(b.customerMockId)!;
    const custSeed = customerSeeds.find((c) => c.id === b.customerMockId)!;
    const workerProfileId = b.workerMockId ? workerProfileIdByMockId.get(b.workerMockId)! : null;
    const service = serviceData.find((s) => s.id === b.serviceId)!;
    const createdAt = new Date(b.datetime);
    const platformFee = Math.round(b.estimatedCost * (COMMISSION_PERCENT / 100) * 100) / 100;

    const bookingId = await insertBooking({
      customerId: customerProfileId,
      serviceCategoryId: b.serviceId,
      description: b.description,
      address: custSeed.address,
      lng: custSeed.lng,
      lat: custSeed.lat,
      scheduledAt: null,
      urgency: b.urgency,
      baseCharge: service.baseRate,
      hourlyRate: service.hourlyRate,
      estimatedTotal: b.estimatedCost,
      status: b.status as BookingStatus,
      assignedWorkerId: b.status === "CANCELLED" ? null : workerProfileId,
      // A real 1-hour gap between start and completion — matches
      // Invoice.hoursBilled's own default of 1 — instead of a zero-duration
      // job, so hours-worked aggregates (Section 1.2.7) have something to sum.
      confirmedAt: b.status === "SETTLED" ? createdAt : null,
      startedAt: b.status === "SETTLED" ? createdAt : null,
      completedAt: b.status === "SETTLED" ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      settledAt: b.status === "SETTLED" ? new Date(createdAt.getTime() + 60 * 60 * 1000) : null,
      cancelledAt: b.status === "CANCELLED" ? createdAt : null,
      cancelReason: b.status === "CANCELLED" ? "Customer cancelled before a worker accepted the offer" : null,
      createdAt
    });

    if (b.status === "SETTLED" && workerProfileId) {
      await prisma.dispatchLog.create({
        data: {
          bookingId,
          workerId: workerProfileId,
          attemptNumber: "ATTEMPT_1" as DispatchAttempt,
          distanceKm: 1.5,
          continuityScore: 80,
          offeredAt: createdAt,
          respondedAt: createdAt,
          outcome: "ACCEPTED" as DispatchOutcome
        }
      });

      const invoice = await prisma.invoice.create({
        data: {
          bookingId,
          baseCharge: service.baseRate,
          hourlyCharge: service.hourlyRate,
          platformFee,
          totalAmount: b.estimatedCost
        }
      });

      await prisma.paymentTransaction.create({
        data: {
          invoiceId: invoice.id,
          paymentMethod: "CASH" as PaymentMethod,
          paymentStatus: "PAID",
          amount: b.estimatedCost,
          processedAt: createdAt
        }
      });

      await prisma.review.create({
        data: {
          bookingId,
          customerId: customerProfileId,
          workerId: workerProfileId,
          punctuality: b.rating!,
          quality: b.rating!,
          professionalism: b.rating!,
          communication: b.rating!,
          overallScore: b.rating!,
          writtenFeedback: b.review,
          createdAt
        }
      });

      const jobPayout = Math.round((b.estimatedCost - platformFee) * 100) / 100;
      await prisma.creditTransaction.create({
        data: {
          workerProfileId,
          type: "JOB_PAYOUT" as CreditTransactionType,
          amount: jobPayout,
          status: "COMPLETED" as CreditTransactionStatus,
          referenceBookingId: bookingId,
          createdAt,
          settledAt: createdAt
        }
      });

      if (b.rating! >= 4.5) {
        const creditAmount = Math.round(platformFee * FEEDBACK_CREDIT_SHARE * 100) / 100;
        await prisma.feedbackCredit.upsert({
          where: { workerProfileId },
          create: { workerProfileId, commissionPoolTotal: creditAmount, distributedTotal: creditAmount },
          update: { commissionPoolTotal: { increment: creditAmount }, distributedTotal: { increment: creditAmount } }
        });
        await prisma.creditTransaction.create({
          data: {
            workerProfileId,
            type: "FEEDBACK_CREDIT" as CreditTransactionType,
            amount: creditAmount,
            status: "COMPLETED" as CreditTransactionStatus,
            referenceBookingId: bookingId,
            createdAt,
            settledAt: createdAt
          }
        });
      }
    }
  }

  // Recompute ratingAverage/ratingCount from the reviews actually seeded,
  // so the stored aggregate matches Section 3.3's "derived, not trusted"
  // rule instead of carrying the flat mock rating forward unchanged.
  for (const [mockId, ratings] of [
    ["worker-1", raviReviews],
    ["worker-8", meenaReviews]
  ] as [string, number[]][]) {
    if (ratings.length === 0) continue;
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;
    await prisma.workerProfile.update({
      where: { id: workerProfileIdByMockId.get(mockId)! },
      data: { ratingAverage: Math.round(avg * 100) / 100, ratingCount: ratings.length }
    });
  }

  // Cooperative dividends — same formula as
  // admin-wallet-ops.controller.ts#distributeDividends (a worker's total
  // completed JOB_PAYOUT earnings × their cooperative's
  // dividendSharePercent), applied once here so the demo dashboard shows a
  // real, traceable number rather than a hardcoded one. No worker has a
  // prior DIVIDEND_PAYOUT yet, so this is "since all time" for every
  // worker, matching what the real endpoint does for a first-ever run.
  console.log("Cooperative dividends...");
  for (const w of workerSeeds) {
    const workerProfileId = workerProfileIdByMockId.get(w.mockId)!;
    const earnings = await prisma.creditTransaction.aggregate({
      where: { workerProfileId, type: "JOB_PAYOUT" as CreditTransactionType, status: "COMPLETED" as CreditTransactionStatus },
      _sum: { amount: true }
    });
    const totalEarnings = Number(earnings._sum.amount ?? 0);
    if (totalEarnings <= 0) continue;
    const sharePercent = cooperativeData.find((c) => c.id === w.cooperativeId)!.dividendSharePercent;
    const dividendAmount = Math.round(totalEarnings * (sharePercent / 100) * 100) / 100;
    if (dividendAmount <= 0) continue;
    await prisma.creditTransaction.create({
      data: {
        workerProfileId,
        type: "DIVIDEND_PAYOUT" as CreditTransactionType,
        amount: dividendAmount,
        status: "COMPLETED" as CreditTransactionStatus,
        settledAt: new Date()
      }
    });
  }

  // ---------------------------------------------------------------------
  // Synthetic bookings covering every remaining Section 1.0 lifecycle
  // stage the mock data doesn't reach on its own: REQUESTED,
  // DISPATCHING_TOP3, DISPATCHING_POOL, ASSIGNED, CONFIRMED, IN_PROGRESS,
  // COMPLETED (not yet reviewed/settled).
  // ---------------------------------------------------------------------
  console.log("Lifecycle-coverage bookings (REQUESTED through COMPLETED)...");
  const now = new Date();
  const cust1 = customerSeeds[0];
  const cust2 = customerSeeds[1];
  const cust1ProfileId = customerProfileIdByMockId.get("cust-1")!;
  const cust2ProfileId = customerProfileIdByMockId.get("cust-2")!;
  const plumbing = serviceData.find((s) => s.id === "plumbing")!;
  const electrical = serviceData.find((s) => s.id === "electrical")!;
  const caregiving = serviceData.find((s) => s.id === "caregiving")!;

  // REQUESTED — no dispatch has run yet.
  await insertBooking({
    customerId: cust1ProfileId,
    serviceCategoryId: "plumbing",
    description: "Leaking overhead tank float valve needs replacement.",
    address: cust1.address,
    lng: cust1.lng,
    lat: cust1.lat,
    scheduledAt: null,
    urgency: "NORMAL",
    baseCharge: plumbing.baseRate,
    hourlyRate: plumbing.hourlyRate,
    estimatedTotal: plumbing.baseRate + plumbing.hourlyRate,
    status: "REQUESTED",
    createdAt: now
  });

  // DISPATCHING_TOP3 — Rajesh (worker-7) has an open offer, unanswered.
  const dispatchingTop3Id = await insertBooking({
    customerId: cust2ProfileId,
    serviceCategoryId: "electrical",
    description: "Ceiling fan wiring short-circuit needs urgent diagnosis.",
    address: cust2.address,
    lng: cust2.lng,
    lat: cust2.lat,
    scheduledAt: null,
    urgency: "URGENT",
    baseCharge: electrical.baseRate,
    hourlyRate: electrical.hourlyRate,
    estimatedTotal: electrical.baseRate + electrical.hourlyRate,
    status: "DISPATCHING_TOP3",
    createdAt: now
  });
  await prisma.dispatchLog.create({
    data: {
      bookingId: dispatchingTop3Id,
      workerId: workerProfileIdByMockId.get("worker-7")!,
      attemptNumber: "ATTEMPT_1" as DispatchAttempt,
      distanceKm: 1.5,
      continuityScore: 72,
      offeredAt: now,
      outcome: "OFFERED" as DispatchOutcome
    }
  });

  // DISPATCHING_POOL — top-3 (Ravi, Priya) already timed out; pool offer
  // now open to Amit.
  const dispatchingPoolId = await insertBooking({
    customerId: cust1ProfileId,
    serviceCategoryId: "plumbing",
    description: "Multiple bathroom taps need washer replacement across the flat.",
    address: cust1.address,
    lng: cust1.lng,
    lat: cust1.lat,
    scheduledAt: null,
    urgency: "NORMAL",
    baseCharge: plumbing.baseRate,
    hourlyRate: plumbing.hourlyRate,
    estimatedTotal: plumbing.baseRate + plumbing.hourlyRate,
    status: "DISPATCHING_POOL",
    createdAt: now
  });
  await prisma.dispatchLog.createMany({
    data: [
      { bookingId: dispatchingPoolId, workerId: workerProfileIdByMockId.get("worker-1")!, attemptNumber: "ATTEMPT_1", distanceKm: 0.9, continuityScore: 95, offeredAt: now, respondedAt: now, outcome: "TIMEOUT" },
      { bookingId: dispatchingPoolId, workerId: workerProfileIdByMockId.get("worker-2")!, attemptNumber: "ATTEMPT_2", distanceKm: 2.1, continuityScore: 58, offeredAt: now, respondedAt: now, outcome: "TIMEOUT" },
      { bookingId: dispatchingPoolId, workerId: workerProfileIdByMockId.get("worker-3")!, attemptNumber: "POOL", distanceKm: 6.4, continuityScore: 30, offeredAt: now, outcome: "OFFERED" }
    ]
  });

  // ASSIGNED — Meena just accepted; she is now ON_JOB.
  const meenaId = workerProfileIdByMockId.get("worker-8")!;
  const assignedId = await insertBooking({
    customerId: cust2ProfileId,
    serviceCategoryId: "caregiving",
    description: "Elderly care assistance needed for a week, daytime shift.",
    address: cust2.address,
    lng: cust2.lng,
    lat: cust2.lat,
    scheduledAt: null,
    urgency: "NORMAL",
    baseCharge: caregiving.baseRate,
    hourlyRate: caregiving.hourlyRate,
    estimatedTotal: caregiving.baseRate + caregiving.hourlyRate,
    status: "ASSIGNED",
    assignedWorkerId: meenaId,
    createdAt: now
  });
  await prisma.dispatchLog.create({
    data: { bookingId: assignedId, workerId: meenaId, attemptNumber: "ATTEMPT_1", distanceKm: 1.1, continuityScore: 88, offeredAt: now, respondedAt: now, outcome: "ACCEPTED" }
  });
  await prisma.workerProfile.update({ where: { id: meenaId }, data: { availabilityStatus: "ON_JOB", currentBookingId: assignedId } });

  // CONFIRMED — Priya's booking, 60s auto-confirm already elapsed.
  const priyaId = workerProfileIdByMockId.get("worker-2")!;
  const confirmedId = await insertBooking({
    customerId: cust2ProfileId,
    serviceCategoryId: "plumbing",
    description: "New RO water purifier plumbing connection install.",
    address: cust2.address,
    lng: cust2.lng,
    lat: cust2.lat,
    scheduledAt: null,
    urgency: "NORMAL",
    baseCharge: plumbing.baseRate,
    hourlyRate: plumbing.hourlyRate,
    estimatedTotal: plumbing.baseRate + plumbing.hourlyRate,
    status: "CONFIRMED",
    assignedWorkerId: priyaId,
    confirmedAt: now,
    createdAt: now
  });
  await prisma.dispatchLog.create({
    data: { bookingId: confirmedId, workerId: priyaId, attemptNumber: "ATTEMPT_1", distanceKm: 2.0, continuityScore: 60, offeredAt: now, respondedAt: now, outcome: "ACCEPTED" }
  });
  await prisma.workerProfile.update({ where: { id: priyaId }, data: { availabilityStatus: "ON_JOB", currentBookingId: confirmedId } });

  // IN_PROGRESS — Amit is on-site now.
  const amitId = workerProfileIdByMockId.get("worker-3")!;
  const inProgressId = await insertBooking({
    customerId: cust1ProfileId,
    serviceCategoryId: "plumbing",
    description: "Bathroom floor drain trap replacement, ongoing.",
    address: cust1.address,
    lng: cust1.lng,
    lat: cust1.lat,
    scheduledAt: null,
    urgency: "NORMAL",
    baseCharge: plumbing.baseRate,
    hourlyRate: plumbing.hourlyRate,
    estimatedTotal: plumbing.baseRate + plumbing.hourlyRate,
    status: "IN_PROGRESS",
    assignedWorkerId: amitId,
    confirmedAt: now,
    startedAt: now,
    createdAt: now
  });
  await prisma.dispatchLog.create({
    data: { bookingId: inProgressId, workerId: amitId, attemptNumber: "ATTEMPT_1", distanceKm: 0.3, continuityScore: 90, offeredAt: now, respondedAt: now, outcome: "ACCEPTED" }
  });
  await prisma.workerProfile.update({ where: { id: amitId }, data: { availabilityStatus: "ON_JOB", currentBookingId: inProgressId } });

  // COMPLETED — Rajesh finished; awaiting the customer's review. Invoice
  // exists (created at completion, Section 4.5) but no PaymentTransaction/
  // Review/CreditTransaction yet — those only land once the review is
  // submitted (Section 1.0).
  const rajeshId = workerProfileIdByMockId.get("worker-7")!;
  const completedId = await insertBooking({
    customerId: cust2ProfileId,
    serviceCategoryId: "electrical",
    description: "Kitchen chimney electrical point installation.",
    address: cust2.address,
    lng: cust2.lng,
    lat: cust2.lat,
    scheduledAt: null,
    urgency: "NORMAL",
    baseCharge: electrical.baseRate,
    hourlyRate: electrical.hourlyRate,
    estimatedTotal: electrical.baseRate + electrical.hourlyRate,
    status: "COMPLETED",
    assignedWorkerId: rajeshId,
    confirmedAt: now,
    startedAt: new Date(now.getTime() - 60 * 60 * 1000),
    completedAt: now,
    createdAt: new Date(now.getTime() - 60 * 60 * 1000)
  });
  await prisma.dispatchLog.create({
    data: { bookingId: completedId, workerId: rajeshId, attemptNumber: "ATTEMPT_1", distanceKm: 1.0, continuityScore: 82, offeredAt: now, respondedAt: now, outcome: "ACCEPTED" }
  });
  const completedInvoice = await prisma.invoice.create({
    data: {
      bookingId: completedId,
      baseCharge: electrical.baseRate,
      hourlyCharge: electrical.hourlyRate,
      platformFee: Math.round((electrical.baseRate + electrical.hourlyRate) * (COMMISSION_PERCENT / 100) * 100) / 100,
      totalAmount: electrical.baseRate + electrical.hourlyRate
    }
  });
  void completedInvoice;
  // Worker is freed back to AVAILABLE once the job completes (Section 4.5).

  // ---------------------------------------------------------------------
  // Wallet/ledger extras — redemption in progress and one already settled,
  // demonstrating Section 14.4's admin manual-settlement workflow.
  // ---------------------------------------------------------------------
  console.log("Redemptions and settlement records...");
  const raviId = workerProfileIdByMockId.get("worker-1")!;
  const settledRedemption = await prisma.creditTransaction.create({
    data: { workerProfileId: raviId, type: "REDEMPTION" as CreditTransactionType, amount: 500, status: "COMPLETED" as CreditTransactionStatus, payoutMethod: "BANK_TRANSFER_MOCK" as PayoutMethod, settledAt: now }
  });
  await prisma.settlementRecord.create({
    data: {
      creditTransactionId: settledRedemption.id,
      payoutMethod: "BANK_TRANSFER_MOCK" as PayoutMethod,
      externalReferenceNote: "Mock UTR WSU2026082600123",
      status: "RECONCILED" as SettlementStatus,
      recordedByAdminId: adminUser.id,
      recordedAt: now,
      reconciledByAdminId: adminUser.id,
      reconciledAt: now
    }
  });
  await prisma.creditTransaction.create({
    data: { workerProfileId: raviId, type: "REDEMPTION" as CreditTransactionType, amount: 300, status: "PROCESSING" as CreditTransactionStatus, payoutMethod: "CASH_PICKUP" as PayoutMethod }
  });

  // ---------------------------------------------------------------------
  // Incentive programs (Section 1.2.5) — one per state.
  // ---------------------------------------------------------------------
  console.log("Incentive programs...");
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  await prisma.incentiveProgress.createMany({
    data: [
      { workerProfileId: raviId, title: "Complete 5 jobs this week", reward: 200, reason: "Weekly job-volume bonus", progress: 3, target: 5, expiry: new Date(now.getTime() + oneWeek), status: "PENDING" as IncentiveStatus },
      { workerProfileId: priyaId, title: "5-star streak bonus", reward: 150, reason: "Three consecutive 5-star reviews", progress: 3, target: 3, expiry: new Date(now.getTime() + oneWeek), status: "COMPLETED" as IncentiveStatus },
      { workerProfileId: amitId, title: "Weekend availability bonus", reward: 100, reason: "Available both weekend days", progress: 1, target: 2, expiry: new Date(now.getTime() - oneWeek), status: "EXPIRED" as IncentiveStatus }
    ]
  });

  // ---------------------------------------------------------------------
  // Notifications (Section 18) — a few in-app events, mixed read/unread.
  // ---------------------------------------------------------------------
  console.log("Notifications...");
  await prisma.notification.createMany({
    data: [
      { userId: customerUserIdByMockId.get("cust-2")!, audience: "USER" as NotificationAudience, title: "Worker assigned", body: "Meena Kumari has been assigned to your caregiving booking.", isRead: false, createdAt: now },
      { userId: customerUserIdByMockId.get("cust-1")!, audience: "USER" as NotificationAudience, title: "Service completed", body: "Your plumbing booking has been completed. Please rate your experience.", isRead: false, createdAt: now },
      { userId: workerUserIdByMockId.get("worker-7")!, audience: "USER" as NotificationAudience, title: "Job completed", body: "You marked the electrical booking as completed. Awaiting customer review.", isRead: true, createdAt: now },
      { userId: workerUserIdByMockId.get("worker-1")!, audience: "USER" as NotificationAudience, title: "Redemption settled", body: "Your redemption of ₹500 via Bank Transfer (Mock) has been settled.", isRead: true, createdAt: now },
      { userId: adminUser.id, audience: "USER" as NotificationAudience, title: "New worker registration", body: "8 workers are seeded and pre-approved for demo purposes.", isRead: true, createdAt: now }
    ]
  });

  console.log("\nSeed complete.\n");
  console.log("Demo credentials:");
  console.log("  Admin (super):", "registrar@worksetu.coop", "/", "AdminPass@123");
  console.log("  Customer:     ", "deepika@example.com", "/", "Customer@123");
  console.log("  Worker:       ", "ravi.kumar@example.com", "/", "Worker@123");
}

// Retry resilience, added after repeatedly observing transient Supabase
// pooler disconnects (P1001/P1017/P2024) during this build's long-running
// seed sessions. main() always starts with clearSeedOwnedData(), so a full
// retry from the top is safe/idempotent — this also backs POST
// /api/v1/admin/demo/reset (Section 15.9), where a flaky connection
// mid-demo should not require an operator to notice and re-run manually.
const RETRYABLE_PRISMA_CODES = new Set(["P1001", "P1017", "P2024"]);
const MAX_ATTEMPTS = 3;

function isRetryablePrismaError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && RETRYABLE_PRISMA_CODES.has((err as { code: string }).code);
}

async function runWithRetry(): Promise<void> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await main();
      return;
    } catch (err) {
      if (isRetryablePrismaError(err) && attempt < MAX_ATTEMPTS) {
        console.warn(`Seed attempt ${attempt} failed with a transient connection error, retrying...`, err);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      throw err;
    }
  }
}

runWithRetry()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
