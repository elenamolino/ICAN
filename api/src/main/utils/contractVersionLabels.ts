import { ContractVersionLabel } from '../types/models/ContractVersion';

// Oldest item in an ordered (ascending) sequence is 'first', newest is 'last',
// everything in between is 'intermediate'. A lone version is both at once —
// it's labeled 'last' (the "current" state), matching the single-snapshot
// case TermsCockpitSyncService special-cases the same way.
export function labelForIndex(index: number, length: number): ContractVersionLabel {
  if (length === 1) return 'last';
  if (index === 0) return 'first';
  if (index === length - 1) return 'last';
  return 'intermediate';
}
