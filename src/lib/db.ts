import { PrismaClient } from "@prisma/client";

const globalForDb = global as unknown as {
  prisma: PrismaClient | undefined;
  pool: any | undefined;
};

let prisma: PrismaClient;

const connectionString = process.env.DATABASE_URL || "file:./dev.db";

if (connectionString.startsWith("postgresql://") || connectionString.startsWith("postgres://")) {
  // PostgreSQL Runtime
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");

  if (process.env.NODE_ENV === "production") {
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  } else {
    if (!globalForDb.prisma || !globalForDb.pool) {
      const pool = new Pool({ connectionString });
      globalForDb.pool = pool;
      const adapter = new PrismaPg(pool);
      globalForDb.prisma = new PrismaClient({ adapter });
    }
    prisma = globalForDb.prisma;
  }
} else {
  // SQLite Runtime (for local development/testing)
  const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

  if (process.env.NODE_ENV === "production") {
    const adapter = new PrismaBetterSqlite3({ url: connectionString });
    prisma = new PrismaClient({ adapter });
  } else {
    if (!globalForDb.prisma) {
      const adapter = new PrismaBetterSqlite3({ url: connectionString });
      globalForDb.prisma = new PrismaClient({ adapter });
    }
    prisma = globalForDb.prisma;
  }
}

export { prisma };
