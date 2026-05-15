import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const queryClient = postgres(connectionString, {
  max: process.env.NODE_ENV === 'production' ? 10 : 3,
  idle_timeout: 30,
});

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;
