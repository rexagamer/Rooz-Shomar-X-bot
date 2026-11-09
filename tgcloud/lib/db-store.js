import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { dates, userStates, shareCodes, shareImports, importAttempts, userSettings } from '../schema.js';

const first = async (query) => (await query.get()) ?? null;

export function createDbStore() {
  return {
    // ----- dates (ownership is part of every query) -----
    async listDates(ownerId) {
      return db.select().from(dates).where(eq(dates.ownerUserId, ownerId)).all();
    },
    async getDate(ownerId, id) {
      return first(db.select().from(dates).where(and(eq(dates.id, id), eq(dates.ownerUserId, ownerId))));
    },
    async insertDate(row) {
      await db.insert(dates).values(row).run();
    },
    async updateDate(ownerId, id, patch) {
      await db.update(dates).set(patch).where(and(eq(dates.id, id), eq(dates.ownerUserId, ownerId))).run();
    },
    async deleteDate(ownerId, id) {
      await db.delete(dates).where(and(eq(dates.id, id), eq(dates.ownerUserId, ownerId))).run();
    },

    // ----- conversation state -----
    async getState(userId) {
      return first(db.select().from(userStates).where(eq(userStates.userId, userId)));
    },
    async saveState(row) {
      await db.delete(userStates).where(eq(userStates.userId, row.userId)).run();
      await db.insert(userStates).values(row).run();
    },
    async clearState(userId) {
      await db.delete(userStates).where(eq(userStates.userId, userId)).run();
    },

    // ----- shares -----
    async insertShare(row) {
      await db.insert(shareCodes).values(row).run();
    },
    async getShareById(id) {
      return first(db.select().from(shareCodes).where(eq(shareCodes.id, id)));
    },
    async findShareByHash(hash) {
      return first(db.select().from(shareCodes).where(eq(shareCodes.codeHash, hash)));
    },
    async listActiveShares(ownerId) {
      return db.select().from(shareCodes)
        .where(and(eq(shareCodes.ownerUserId, ownerId), eq(shareCodes.revokedAt, 0))).all();
    },
    async revokeShare(ownerId, id, now) {
      await db.update(shareCodes).set({ revokedAt: now })
        .where(and(eq(shareCodes.id, id), eq(shareCodes.ownerUserId, ownerId))).run();
    },

    // ----- imports & attempts -----
    async getImport(id) {
      return first(db.select().from(shareImports).where(eq(shareImports.id, id)));
    },
    async insertImport(row) {
      await db.insert(shareImports).values(row).run();
    },
    async getAttempts(userId) {
      return first(db.select().from(importAttempts).where(eq(importAttempts.userId, userId)));
    },
    async saveAttempts(row) {
      await db.delete(importAttempts).where(eq(importAttempts.userId, row.userId)).run();
      await db.insert(importAttempts).values(row).run();
    },

    // ----- user settings -----
    async getSettings(userId) {
      return first(db.select().from(userSettings).where(eq(userSettings.userId, userId)));
    },
    async saveSettings(row) {
      await db.delete(userSettings).where(eq(userSettings.userId, row.userId)).run();
      await db.insert(userSettings).values(row).run();
    },
  };
}