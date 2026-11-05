import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';

dotenv.config();

// Use DIRECT_DATABASE_URL (unpooled Neon hostname) for DDL migrations when available,
// falling back to DATABASE_URL for schema generation.
const migrationUrl =
  process.env.DIRECT_DATABASE_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  'postgresql://placeholder:placeholder@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=verify-full';

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: migrationUrl,
  },
  strict: true,
  verbose: true,
});
