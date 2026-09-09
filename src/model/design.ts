/**
 * decks/<id>/design.json: the visual direction the user chose, recorded by `design:set` after the
 * slide-design pitch (or straight away when the user names a theme). deck:scaffold takes its default
 * theme from here and deck:validate reports a deck that sits on another theme, so the choice is a
 * file with a schema rather than a line the agent has to remember to write.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Ajv, type ErrorObject } from 'ajv'

export interface Design {
  /** the theme pack id */
  theme: string
  /** the pitch direction's name (safe / bold / free, or the pitch's own label) */
  direction?: string
  /** ISO 8601, when the choice was recorded */
  chosenAt?: string
}

export type DesignResult = { ok: true; design: Design } | { ok: false; errors: string[] }

const schemaUrl = new URL('../../schemas/design.schema.json', import.meta.url)
const schema = JSON.parse(readFileSync(schemaUrl, 'utf8')) as Record<string, unknown>
const ajv = new Ajv({ allErrors: true, strict: true })
const validateShape = ajv.compile(schema)

function describeError(e: ErrorObject): string {
  const where = e.instancePath || '/'
  if (e.keyword === 'additionalProperties') {
    const extra = (e.params as { additionalProperty: string }).additionalProperty
    return `${where}  unknown field \`${extra}\` (design.json holds theme, direction and chosenAt only)`
  }
  if (e.keyword === 'required') {
    return `${where}  missing \`${(e.params as { missingProperty: string }).missingProperty}\``
  }
  return `${where}  ${e.message ?? e.keyword}`
}

export function designPath(deckDir: string): string {
  return join(deckDir, 'design.json')
}

export function validateDesign(input: unknown): DesignResult {
  if (validateShape(input)) return { ok: true, design: input as Design }
  return { ok: false, errors: (validateShape.errors ?? []).map(describeError) }
}

export function parseDesign(text: string): DesignResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    return { ok: false, errors: [`not valid JSON: ${(err as Error).message}`] }
  }
  return validateDesign(data)
}

/** The deck folder's design.json, parsed and checked against the schema; null when there is none. */
export function readDesign(deckDir: string): (DesignResult & { path: string }) | null {
  const path = designPath(deckDir)
  if (!existsSync(path)) return null
  return { path, ...parseDesign(readFileSync(path, 'utf8')) }
}

/** Fixed key order (theme, direction, chosenAt), two-space indent, trailing newline. */
export function stringifyDesign(design: Design): string {
  const ordered: Design = { theme: design.theme }
  if (design.direction) ordered.direction = design.direction
  if (design.chosenAt) ordered.chosenAt = design.chosenAt
  return `${JSON.stringify(ordered, null, 2)}\n`
}

export function writeDesign(deckDir: string, design: Design): string {
  const path = designPath(deckDir)
  writeFileSync(path, stringifyDesign(design), 'utf8')
  return path
}
