/**
 * Shared argument guards for the theme commands. `theme:qa`, `theme:check` and `layout:gallery`
 * name a theme pack by id (`--theme <id>`), never by path: a folder handed to them used to fall
 * through as a layout id and come back as `layout \`themes/x\` not found`, which says nothing
 * about what to do instead.
 */

/** True for an argument that reads as a path rather than an id: `themes/x`, `./x`, `C:\x`, `x.css`. */
export function looksLikePath(arg: string): boolean {
  return /[\\/]/.test(arg) || /\.(css|json|html|zip)$/i.test(arg)
}

/**
 * Stop with an explanation when an argument is a path where an id belongs. `command` is the
 * command's own name, `takes` one line saying what it does accept, and `available` the pack ids
 * the command can see from here, so the reader learns at once whether the pack they meant is
 * among them.
 */
export function refusePathArgs(
  values: Array<string | undefined>,
  command: string,
  takes: string,
  available: string[] = [],
) {
  const path = values.find((v) => v !== undefined && looksLikePath(v))
  if (path === undefined) return
  console.error(
    [
      `✖ \`${path}\` looks like a path; ${command} names a theme pack by id, not by folder.`,
      `  ${takes}`,
      ...(available.length > 0 ? [`  Packs in reach from here: ${available.join(', ')}.`] : []),
      '  A pack that is not among them: run the command from the workspace that holds `themes/<id>/`,',
      "  add `--deck <deck.json>` for a deck's own themes/, or install it with `theme:import <dir|zip>`.",
      '  To lint the CSS of one file instead: `theme:lint <file.css> --as theme|layout`.',
    ].join('\n'),
  )
  process.exit(2)
}
