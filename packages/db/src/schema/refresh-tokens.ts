import { pgTable, uuid, text, boolean, timestamptz } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

/**
 * Hashed refresh tokens — raw token is NEVER stored.
 * jti is the JWT ID embedded in the signed refresh token.
 * token_hash is sha256(rawToken) stored for constant-time comparison.
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash:  text('token_hash').notNull().unique(),
  jti:        text('jti').notNull().unique(),
  isRevoked:  boolean('is_revoked').notNull().default(false),
  expiresAt:  timestamptz('expires_at').notNull(),
  createdAt:  timestamptz('created_at').notNull().defaultNow(),
});

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));
