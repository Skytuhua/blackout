export { validateCheckpoint, validateRunRecord, ReplayDataError } from './validation';
export { canonicalCheckpoint, deterministicHash } from './canonical';
export { replayRun, verifyReplay } from './recorder';
export { buildOutcomeLedger } from './ledger';
export { compareEarlierCap, EARLIER_CAP_POLICY } from './comparison';
export type { EarlierCapChange } from './comparison';
