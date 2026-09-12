import { customerRegisterSchema, workerRegisterSchema, loginSchema } from "../../src/controllers/auth.controller";
import { requestBookingSchema } from "../../src/controllers/booking.controller";
import { reviewSchema } from "../../src/controllers/review.controller";

const validCustomer = {
  fullName: "Deepika Ramaswamy",
  email: "deepika@example.com",
  phone: "9876500001",
  password: "TestPass@123",
  address: "54, Gandhi Nagar Main Road, Adyar, Chennai",
  lat: 13.0064,
  lng: 80.2569,
  acceptedTerms: true
};

describe("customerRegisterSchema", () => {
  it("accepts a well-formed registration", () => {
    expect(customerRegisterSchema.safeParse(validCustomer).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = customerRegisterSchema.safeParse({ ...validCustomer, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = customerRegisterSchema.safeParse({ ...validCustomer, password: "short" });
    expect(result.success).toBe(false);
  });

  it("rejects coordinates outside the India bounding box (Section 4.1's LAT/LNG guard)", () => {
    expect(customerRegisterSchema.safeParse({ ...validCustomer, lat: 51.5 }).success).toBe(false);
    expect(customerRegisterSchema.safeParse({ ...validCustomer, lng: -0.12 }).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { fullName, ...withoutName } = validCustomer;
    expect(customerRegisterSchema.safeParse(withoutName).success).toBe(false);
  });
});

describe("workerRegisterSchema", () => {
  const validWorker = {
    fullName: "Ravi Kumar",
    email: "ravi@example.com",
    phone: "9876500002",
    password: "TestPass@123",
    cooperativeId: "coop-1",
    primarySkillId: "plumbing",
    experienceYears: 6,
    homeLocation: { lat: 13.0012, lng: 80.2565, address: "Adyar, Chennai" },
    serviceAreaRadiusKm: 10,
    acceptedTerms: true
  };

  it("accepts a well-formed registration", () => {
    expect(workerRegisterSchema.safeParse(validWorker).success).toBe(true);
  });

  it("rejects a serviceAreaRadiusKm above the 50km cap", () => {
    expect(workerRegisterSchema.safeParse({ ...validWorker, serviceAreaRadiusKm: 500 }).success).toBe(false);
  });

  it("rejects negative experienceYears", () => {
    expect(workerRegisterSchema.safeParse({ ...validWorker, experienceYears: -1 }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts identifier + password", () => {
    expect(loginSchema.safeParse({ identifier: "deepika@example.com", password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ identifier: "deepika@example.com", password: "" }).success).toBe(false);
  });
});

describe("requestBookingSchema", () => {
  const validBooking = {
    serviceCategoryId: "plumbing",
    location: { address: "54, Gandhi Nagar Main Road, Adyar, Chennai", lat: 13.0064, lng: 80.2569 },
    description: "Leaking kitchen tap and pipe needs replacement",
    scheduledAt: null,
    urgency: "URGENT"
  };

  it("accepts a well-formed request", () => {
    expect(requestBookingSchema.safeParse(validBooking).success).toBe(true);
  });

  it("rejects an invalid urgency value (not in the enum)", () => {
    expect(requestBookingSchema.safeParse({ ...validBooking, urgency: "ASAP" }).success).toBe(false);
  });

  it("rejects a description under 10 characters", () => {
    expect(requestBookingSchema.safeParse({ ...validBooking, description: "leak" }).success).toBe(false);
  });
});

describe("reviewSchema (Section 20 — 4-dimension rating)", () => {
  const validReview = { punctuality: 5, quality: 5, professionalism: 5, communication: 5 };

  it("accepts ratings in range 1-5", () => {
    expect(reviewSchema.safeParse(validReview).success).toBe(true);
  });

  it("rejects a rating of 0", () => {
    expect(reviewSchema.safeParse({ ...validReview, quality: 0 }).success).toBe(false);
  });

  it("rejects a rating above 5", () => {
    expect(reviewSchema.safeParse({ ...validReview, punctuality: 6 }).success).toBe(false);
  });

  it("rejects a non-integer rating", () => {
    expect(reviewSchema.safeParse({ ...validReview, communication: 3.5 }).success).toBe(false);
  });

  it("writtenFeedback is optional", () => {
    expect(reviewSchema.safeParse(validReview).success).toBe(true);
  });
});
