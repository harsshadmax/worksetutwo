import { prisma } from "../../src/lib/prisma";
import { redis } from "../../src/lib/redis-lock";

// Importing controller modules for their exported Zod schemas pulls in
// their module-level prisma/redis singletons as a side effect (neither is
// ever queried in unit tests) — close both after the run so Jest workers
// exit cleanly instead of hanging on open DB/Redis sockets.
afterAll(async () => {
  await prisma.$disconnect().catch(() => {});
  redis.disconnect();
});
