import { describe, expect, it } from 'vitest'
import schemaJson from './translationOutput.schema.json'

describe('translationOutput.schema', () => {
  it('requires every property to satisfy response format rules', async () => {
    const schema = schemaJson as {
      properties?: Record<string, unknown>
      required?: string[]
    }

    const keys = Object.keys(schema.properties ?? {})

    expect(schema.required).toEqual(expect.arrayContaining(keys))
    expect(schema.required).toContain('backTranslatedText')
  })
})
