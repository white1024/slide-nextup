import type { ElementKind, Override, Slot } from '../model/deck.ts'

export function escapeHtml(text: string): string
export function inlineMarkup(text: string): string
/** a short prefix, one number (thousands separators and decimals allowed), a short suffix: what a count entrance runs up to */
export const COUNTABLE: RegExp
/** the number a one-line value counts up to, or null when it is not one */
export function countValue(text: string): number | null
export function chartSvg(slot: Extract<Slot, { type: 'chart' }>, opts?: { off?: number[] }): string
export function renderSlot(slot: Slot): string
export function slotText(slot: Slot | undefined): string
export function applyTextOverride(slot: Slot | undefined, text: string): Slot
/** element roles (data-role) whose content may carry `details` */
export const DETAILS_ROLES: ReadonlySet<string>
export function effectiveSlot(
  slot: Slot | undefined,
  override: Override | undefined,
  kind: ElementKind | null | undefined,
): Slot | undefined
