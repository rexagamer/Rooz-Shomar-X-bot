export const CONFIG = Object.freeze({
  timeZone: 'Asia/Tehran',
  maxDatesPerUser: 200,
  pageSize: 8,
  dateListPageSize: 4, // fewer per page in the new detailed date list
  stateTtlMs: 24 * 60 * 60 * 1000,
  maxActiveShares: 20,
  importMaxFailures: 5,
  importWindowMs: 15 * 60 * 1000,
  defaultDisplayMode: 'detailed', // 'detailed' | 'short'
});