import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { sha256 } from './deck.ts'

export interface Confirmation {
  sha256: string
  confirmedAt: string
  slides: number
}

export type ConfirmStatus =
  | { state: 'confirmed'; confirmation: Confirmation }
  | { state: 'missing' }
  | { state: 'stale'; confirmation: Confirmation }

export function confirmationPath(storyFile: string): string {
  return join(dirname(storyFile), 'story.confirmed.json')
}

export function readConfirmation(storyFile: string): Confirmation | null {
  const file = confirmationPath(storyFile)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8')) as Confirmation
}

/** The gate: a story counts as confirmed only while its bytes match the recorded hash. */
export function confirmationStatus(storyFile: string, storyText?: string): ConfirmStatus {
  const confirmation = readConfirmation(storyFile)
  if (!confirmation) return { state: 'missing' }
  const text = storyText ?? readFileSync(storyFile, 'utf8')
  return sha256(text) === confirmation.sha256
    ? { state: 'confirmed', confirmation }
    : { state: 'stale', confirmation }
}

export function writeConfirmation(
  storyFile: string,
  storyText: string,
  slides: number,
): Confirmation {
  const confirmation: Confirmation = {
    sha256: sha256(storyText),
    confirmedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    slides,
  }
  writeFileSync(confirmationPath(storyFile), `${JSON.stringify(confirmation, null, 2)}\n`, 'utf8')
  return confirmation
}

export function describeStatus(status: ConfirmStatus): string {
  switch (status.state) {
    case 'confirmed':
      return `confirmed (${status.confirmation.confirmedAt}, ${status.confirmation.slides} slides)`
    case 'stale':
      return `the story file was modified after it was confirmed (${status.confirmation.confirmedAt}), confirm it again`
    case 'missing':
      return 'not confirmed: show the user the per-slide summary first, then run pnpm story:confirm once they agree'
  }
}
