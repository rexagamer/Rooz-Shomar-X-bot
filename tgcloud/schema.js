import { table, integer, text } from 'sdk/db';

// All user ids are Telegram ids stored as text. No foreign keys (unsupported).
// Timestamps are epoch milliseconds.

export const dates = table('dates', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  title: text('title').notNull(),
  titleKey: text('title_key').notNull(),
  jalaliYear: integer('jalali_year').notNull(),
  jalaliMonth: integer('jalali_month').notNull(),
  jalaliDay: integer('jalali_day').notNull(),
  gregorianDate: text('gregorian_date').notNull(),
  sourceShareId: text('source_share_id').notNull(), // '' when created by the owner
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const userStates = table('user_states', {
  userId: text('user_id').primaryKey(),
  state: text('state').notNull(),
  payload: text('payload').notNull(), // JSON
  updatedAt: integer('updated_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

export const shareCodes = table('share_codes', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  codeHash: text('code_hash').notNull(), // SHA-256 hex of the normalized code
  snapshot: text('snapshot').notNull(), // immutable JSON array
  dateCount: integer('date_count').notNull(),
  createdAt: integer('created_at').notNull(),
  revokedAt: integer('revoked_at').notNull(), // 0 = active
});

export const shareImports = table('share_imports', {
  id: text('id').primaryKey(), // `${shareId}:${recipientUserId}` -> one row per pair
  shareId: text('share_id').notNull(),
  recipientUserId: text('recipient_user_id').notNull(),
  importedAt: integer('imported_at').notNull(),
});

export const importAttempts = table('import_attempts', {
  userId: text('user_id').primaryKey(),
  windowStart: integer('window_start').notNull(),
  failures: integer('failures').notNull(),
});

export const userSettings = table('user_settings', {
  userId: text('user_id').primaryKey(),
  displayMode: text('display_mode').notNull(), // 'detailed' | 'short'
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});