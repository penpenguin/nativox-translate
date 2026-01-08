export const PERFORMANCE_THRESHOLDS_MS = {
  fast: 3000,
  max: 5000,
}

export const evaluatePerformance = (durationMs: number) => ({
  withinFastThreshold: durationMs <= PERFORMANCE_THRESHOLDS_MS.fast,
  withinMaxThreshold: durationMs <= PERFORMANCE_THRESHOLDS_MS.max,
})
