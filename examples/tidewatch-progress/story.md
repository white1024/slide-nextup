---
title: "Tidewatch website health-check tool: progress, deliverables and direction"
audience: The product owner, possibly with two colleagues from the same group; the owner already knows how the three-person split works and cares about whether the tool can be handed over, in what form, and whether non-technical people can use it
occasion: Progress meeting, presenting where the health-check tool stands, what has been delivered and where the work is heading
duration_minutes: 10
density: standard
narrative_pattern: pyramid
core_message: The health-check tool is already a deliverable package; the report contract, the CLI and the unzip-and-run bundle are all there, and the GUI is turning it into something non-technical people can use.
---

## Goal and audience

This progress meeting should tell the product owner two things within 10 minutes: what form the tool has already been delivered in, and what is being worked on now. The owner initiated the three-person split and knows who does what, so the split is not restated; the meeting goes straight to the tool. The project's current responsibility is to deliver the tool, not to produce health-check data, so no figures from past checks are shown at any point. By the end he should know where the tool stands and nod at "bundle plus GUI" as the delivery form.

## Core message

The tool is already a deliverable package. Outwardly there is Result Schema v1, a cross-platform contract; a CLI with a fixed six-step check; and an unzip-and-run bundle that installs unattended on a clean machine. The GUI in progress is the direction the owner set, so that marketing and support can configure, check and read results without opening a terminal.

## Narrative skeleton

1. Conclusion: the health-check tool is already a deliverable package, and the GUI is making it easier to use.
2. Skeleton: one picture of how the tool is put together, then three deliberate design principles.
3. Deliverables: the Result Schema contract, the unzip-and-run bundle, the fixed six-step check.
4. In progress: a GUI for non-technical people.
5. Close: support gets the same package; the CLI and the GUI share one configuration and one set of results.

## Slides

### s1 | The health-check tool is already a deliverable package
- scene_role: hero
- intensity: 4
- content_relation: statement
- message: The health-check tool already has a report contract, a CLI and an unzip-and-run bundle; the GUI is turning it into something non-technical people can use.
- evidence: Tidewatch website health-check tool (tidewatch), progress reports since 2026-08.
- notes: Open with the conclusion in one sentence. What the owner most wants to know is "can the tool be handed over", so give the answer first, then expand.

### s2 | Two things today
- scene_role: map
- intensity: 2
- content_relation: list
- message: Today covers the tool and contract already delivered, then the GUI in progress.
- evidence:
  - "Delivered: the health-check tool's skeleton, the Result Schema contract, the bundle, the six-step flow"
  - "In progress: a GUI for non-technical people"
- notes: Ten seconds, just so the owner knows the structure.

### s3 | The skeleton of the tidewatch health-check tool
- scene_role: relationship
- intensity: 4
- content_relation: statement
- message: A site list comes in, runs through two check paths and lands in one report directory; scoring is a separate second pass.
- evidence: "System map: site list -> browser path / crawler path -> report directory -> aggregate / export"
- notes: This slide uses the photo layout with the simplified system map (four big blocks); the full map is kept in reserve. Trace the arrows with a finger while talking; the principles wait for the next slide.

### s4 | Three deliberate design principles
- scene_role: evidence
- intensity: 3
- content_relation: list
- message: The two paths are never merged into one table, the report directory is a shared contract, and scoring is separate from checking; all three are deliberate.
- evidence:
  - "The two paths are never merged: the browser path includes loading and rendering and is the primary external data source; the crawler path only cross-checks"
  - "The report directory is a shared contract: per-page state is written atomically, so a run interrupted at any moment can resume"
  - "Scoring is a separate second pass: rescoring is free, rechecking takes a whole night; the verdict policy can change without rerunning the numbers"
- notes: Each of the three cards maps to one block of the system map. "Never merged" is because the check boundaries differ; do not quote any measured ratio.

### s5 | What has been delivered: a contract and a bundle
- scene_role: evidence
- intensity: 3
- content_relation: list
- message: Outwardly there is already the Result Schema v1 contract and an unzip-and-run bundle that installs unattended on a clean machine.
- evidence:
  - "Result Schema v1.0.0: the result.json contract shared by every platform, with three role documents"
  - "Bundle 0.1.0: executable, configuration, docs and browser engine; unzip on a clean machine and it installs unattended"
- notes: The bundle is the "repeatable, standardised health-check package" in the work split. The three role documents are operator, viewer and new-platform. The third card stays empty.

### s6 | A fixed six-step health check
- scene_role: relationship
- intensity: 3
- content_relation: sequence
- message: A full health check is a fixed six steps, interruptible and resumable; only the last step, export, produces the result file that gets handed over.
- evidence: preflight (is the machine ready) -> download (fetch the site list) -> plan (dry run to count the pages) -> run (check page by page, state on disk) -> aggregate (roll up into tables) -> export (produce result.json)
- notes: One full-width flow. Point out the two things easiest to miss, namely that run does not produce result.json by itself (skipping export means finishing the run with nothing to hand over) and that aggregate must run on the machine that still holds the snapshots.

### s7 | In progress: a GUI for non-technical people
- scene_role: evidence
- intensity: 4
- content_relation: list
- message: What is being built is an unzip-and-run local GUI, so that marketing and support can configure, check and read results without opening a terminal.
- evidence:
  - "Site setup: import a site list, progress per stage, missing items block, check conditions only inform"
  - "Run a check: fixed preset buttons, parameters locked, comparability governed by the configuration version"
  - "Results: four summary tiles, a heatmap, a line chart, a timeline; the full table drops to an expandable layer"
- notes: The direction the owner set last month. Two rulings, no full parameter editor and no split into two apps. Three screens work end to end, with three looks; acceptance is "unzip and double-click on a freshly reinstalled machine, run the smoke test through, never open a terminal".

### s8 | Support gets the same package
- scene_role: close
- intensity: 3
- content_relation: closing
- message: The CLI and the GUI share one configuration and one set of results; what gets handed over is always the same unzip-and-run package.
- evidence: "Thin-shell principle: the GUI does not redo the verdict logic and talks only through exit codes and result.json; a package without the GUI works as before."
- notes: The close is about the delivery form only, no data and no timeline. If the owner asks about the next step, answer "end-to-end acceptance of the bundle on a freshly reinstalled machine".
