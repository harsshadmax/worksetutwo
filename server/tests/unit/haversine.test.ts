import { haversineKm } from "../../src/controllers/location.controller";

// Section 9 threat #14 (GPS spoofing) / Section 12.6 — plausibility checks
// are only as good as the underlying distance math.
describe("haversineKm", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineKm(13.0064, 80.2569, 13.0064, 80.2569)).toBeCloseTo(0, 6);
  });

  it("computes a known real-world distance within tolerance (Chennai Adyar to Egmore, ~8km)", () => {
    const adyar = { lat: 13.0064, lng: 80.2569 };
    const egmore = { lat: 13.0732, lng: 80.2609 };
    const km = haversineKm(adyar.lat, adyar.lng, egmore.lat, egmore.lng);
    expect(km).toBeGreaterThan(6);
    expect(km).toBeLessThan(10);
  });

  it("is symmetric regardless of argument order", () => {
    const a = haversineKm(13.0064, 80.2569, 13.0732, 80.2609);
    const b = haversineKm(13.0732, 80.2609, 13.0064, 80.2569);
    expect(a).toBeCloseTo(b, 9);
  });

  it("scales roughly linearly for small due-north offsets (~111km per degree of latitude)", () => {
    const oneDegree = haversineKm(13.0, 80.0, 14.0, 80.0);
    expect(oneDegree).toBeGreaterThan(105);
    expect(oneDegree).toBeLessThan(115);
  });
});
