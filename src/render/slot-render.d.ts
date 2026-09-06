import type { ElementKind, Override, Slot } from '../model/deck.ts'

export function escapeHtml(text: string): string
export function inlineMarkup(text: string): string
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
