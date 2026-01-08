import { describe, expect, it } from 'vitest'
import { evaluatePerformance } from './performanceCriteria'

describe('performanceCriteria', () => {
  it('treats <=3s as fast', () => {
    const result = evaluatePerformance(3000)
    expect(result.withinFastThreshold).toBe(true)
    expect(result.withinMaxThreshold).toBe(true)
  })

  it('treats <=5s as acceptable', () => {
    const result = evaluatePerformance(4500)
    expect(result.withinFastThreshold).toBe(false)
    expect(result.withinMaxThreshold).toBe(true)
  })

  it('flags values above 5s', () => {
    const result = evaluatePerformance(6000)
    expect(result.withinFastThreshold).toBe(false)
    expect(result.withinMaxThreshold).toBe(false)
  })
})
