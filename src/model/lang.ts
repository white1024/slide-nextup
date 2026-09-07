/**
 * The language tag a document declares (`<html lang>`): the deck's `lang` when the author set
 * one, otherwise a guess from the text itself. The guess only tells scripts apart — it exists
 * so that a Chinese deck keeps `zh-Hant` (which picks the right Han glyphs) and an English one
 * gets `en`, not to identify languages that share a script.
 */

const KANA = /[぀-ヿ]/
const HANGUL = /[ᄀ-ᇿ가-힣]/
const HAN = /[㐀-䶿一-鿿豈-﫿]/

/** BCP 47 tag guessed from the script of the text: ja, ko, zh-Hant or en. */
export function detectLang(text: string): string {
  if (KANA.test(text)) return 'ja'
  if (HANGUL.test(text)) return 'ko'
  if (HAN.test(text)) return 'zh-Hant'
  return 'en'
}

/** A loose BCP 47 shape: `en`, `en-GB`, `zh-Hant`, `zh-Hant-TW`. */
export const LANG_PATTERN = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/

/** The declared language, or a guess from the given text when none is declared. */
export function langOf(declared: string | undefined, text: string): string {
  return declared && LANG_PATTERN.test(declared) ? declared : detectLang(text)
}
