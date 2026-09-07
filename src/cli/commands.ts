/**
 * The command table shared by the `slide-nextup` bin and by `init`: one entry per CLI module under
 * src/cli/, in the order the help lists them. `init` writes a package.json script for every entry
 * except itself, so a workspace's `pnpm <name>` and the repo's `pnpm <name>` run the same thing.
 */
export interface Command {
  /** the module under src/cli/, or null for a command the bin runs itself */
  module: string | null
  help: string
  /** arguments inserted before the user's (for modules that take a mode word) */
  args?: string[]
}

export const COMMANDS: Record<string, Command> = {
  init: {
    module: 'init.ts',
    help: 'Create a workspace for your decks (package.json, AGENTS.md, skills, decks/, themes/)',
  },
  'story:check': {
    module: 'story-check.ts',
    help: 'Validate a story.md and print the per-slide summary',
  },
  'story:confirm': {
    module: 'story-confirm.ts',
    help: 'Record the confirmed story (the build gate)',
  },
  'story:apply-deck': {
    module: 'story-apply-deck.ts',
    help: 'Write the page arrangement made in the editor back into story.md',
  },
  'deck:scaffold': {
    module: 'deck-scaffold.ts',
    help: 'Generate or regenerate deck.json from a confirmed story',
  },
  'deck:regenerate': { module: 'deck-scaffold.ts', help: 'Alias of deck:scaffold' },
  'deck:validate': {
    module: 'deck-validate.ts',
    help: 'Validate deck.json against the schema and its cross-references',
  },
  'deck:retheme': { module: 'deck-retheme.ts', help: 'Move a deck to another theme pack' },
  render: { module: 'render.ts', help: 'Render deck.json into one self-contained HTML file' },
  qa: {
    module: 'qa.ts',
    help: 'Overflow, overlap, font size, density and geometry checks in headless Chromium',
  },
  dev: {
    module: 'dev.ts',
    help: 'Preview and edit a deck locally; edits are saved back to deck.json',
  },
  layouts: { module: 'layouts.ts', help: 'List the layouts and their slots' },
  'layout:gallery': {
    module: 'layout-gallery.ts',
    help: 'Screenshot every layout with its sample content',
  },
  'design:preview': {
    module: 'design-preview.ts',
    help: 'Render a theme cover with the first page of a story',
  },
  'theme:lint': { module: 'theme-lint.ts', help: 'Check the theme and layout contract' },
  'theme:qa': {
    module: 'theme-qa.ts',
    help: 'Run the full QA over every layout sample of a theme pack',
  },
  'theme:check': { module: 'theme-check.ts', help: 'Fitness report for sharing a theme pack' },
  'theme:export': { module: 'theme-export.ts', help: 'Copy or zip a theme pack' },
  'theme:import': {
    module: 'theme-import.ts',
    help: 'Import a theme pack after theme:check and theme:qa pass',
  },
  preflight: { module: 'preflight.ts', help: 'Check node, pnpm, playwright and chromium' },
  'browsers:install': {
    module: null,
    help: 'Download the Chromium that qa, previews and galleries use (once)',
  },
  'skills:sync': {
    module: 'skills-sync.ts',
    help: 'Mirror .agents/skills into .claude/skills',
    args: ['sync'],
  },
  'skills:check': {
    module: 'skills-sync.ts',
    help: 'Fail when the skills mirror has drifted',
    args: ['check'],
  },
}

/** The scripts `init` writes into a workspace's package.json: every command but init itself. */
export function workspaceScripts(): Record<string, string> {
  return Object.fromEntries(
    Object.keys(COMMANDS)
      .filter((name) => name !== 'init')
      .map((name) => [name, `slide-nextup ${name}`]),
  )
}
