/**
 * SavoryShelf — rate-limit policy definitions
 *
 * All per-endpoint thresholds and risk tiers live here so tuning
 * one number in one place affects every callsite consistently.
 *
 * strict: true  → fail-closed (deny when the RPC backend is unavailable)
 * strict: false → fail-open  (allow when the RPC backend is unavailable)
 *
 * Risk tiers:
 *   HIGH   — triggers external network calls or service-role Storage writes
 *   MEDIUM — AI API calls (cost-bearing, no Storage write)
 *   LOW    — cheap read-only or purely local operations
 */

export const RATE_POLICY = {
  /** URL import — external fetch + optional Storage write (HIGH) */
  IMPORT_AUTHENTICATED: { max: 10, windowMs: 60_000, strict: true  },
  IMPORT_ANONYMOUS:     { max: 5,  windowMs: 60_000, strict: true  },

  /** Storage image fetch / migration — service-role write (HIGH) */
  IMAGE_FETCH:          { max: 20, windowMs: 60_000, strict: true  },

  /** Grok AI calls — cost-bearing (MEDIUM) */
  AI:                   { max: 8,  windowMs: 60_000, strict: true  },
} as const
