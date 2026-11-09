// In-memory implementation of the store contract (same shape as db-store.js).
export function createMemoryStore() {
  const t = { dates: new Map(), states: new Map(), shares: new Map(), imports: new Map(), attempts: new Map() };
  const copy = (r) => (r ? { ...r } : null);
  return {
    async listDates(ownerId) { return [...t.dates.values()].filter((r) => r.ownerUserId === ownerId).map(copy); },
    async getDate(ownerId, id) { const r = t.dates.get(id); return r && r.ownerUserId === ownerId ? copy(r) : null; },
    async insertDate(row) { t.dates.set(row.id, { ...row }); },
    async updateDate(ownerId, id, patch) { const r = t.dates.get(id); if (r && r.ownerUserId === ownerId) Object.assign(r, patch); },
    async deleteDate(ownerId, id) { const r = t.dates.get(id); if (r && r.ownerUserId === ownerId) t.dates.delete(id); },
    async getState(userId) { return copy(t.states.get(userId)); },
    async saveState(row) { t.states.set(row.userId, { ...row }); },
    async clearState(userId) { t.states.delete(userId); },
    async insertShare(row) { t.shares.set(row.id, { ...row }); },
    async getShareById(id) { return copy(t.shares.get(id)); },
    async findShareByHash(hash) { return copy([...t.shares.values()].find((s) => s.codeHash === hash)); },
    async listActiveShares(ownerId) { return [...t.shares.values()].filter((s) => s.ownerUserId === ownerId && !s.revokedAt).map(copy); },
    async revokeShare(ownerId, id, now) { const s = t.shares.get(id); if (s && s.ownerUserId === ownerId) s.revokedAt = now; },
    async getImport(id) { return copy(t.imports.get(id)); },
    async insertImport(row) { t.imports.set(row.id, { ...row }); },
    async getAttempts(userId) { return copy(t.attempts.get(userId)); },
    async saveAttempts(row) { t.attempts.set(row.userId, { ...row }); },
  };
}
