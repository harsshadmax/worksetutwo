// Section 16.4/16.5 — private object storage with signed temporary URLs.
// The PRD names real Supabase Storage as the concrete implementation; this
// interface is the swap boundary (same shape a supabase-js-backed adapter
// would implement) so a real bucket can replace LocalDiskStorageAdapter
// later without touching any caller. Deviation, disclosed: this prototype
// build uses a local-disk-backed implementation instead (no Supabase
// Storage service-role key was available to wire up), matching the
// established PaymentService/NotificationChannel abstraction-boundary
// pattern used elsewhere in this codebase (Section 14.7, Section 18).
export interface StorageAdapter {
  save(objectKey: string, data: Buffer): Promise<void>;
  createSignedUrl(objectKey: string, expirySeconds: number): Promise<string>;
  delete(objectKey: string): Promise<void>;
}
