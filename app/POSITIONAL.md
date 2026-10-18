# Positional mode

The Positional card sits directly below Blunder Rush in the new `app/` shell.

- 5-minute Rush and Survival: two moves, one inferior and one approved good move; three mistakes end the run.
- Fixed-cycle study: two or three choices, all positions attemptable, repeatable order, shuffled letters on every cycle.
- Theme practice: two or three choices, shuffled passes through a finite eligible pool, until the player ends the run. No immediate repeat across passes when the pool has more than one card.
- Four broad filters are unions of independently approved finer tags. Counts are unique positions, so overlapping categories do not inflate the corpus count. Finer tags and detailed commentary appear in end review.
- Fixed100 stays disabled until the selected pool actually has 100 unique approved positions. The current catalog has 50, not 100 or 200.

## Content

`data/positional/catalog.js` embeds the exact independently approved 50-card public projection, then adds approved practice metadata. `manifest.json` records the input hashes and the checked binary control for each card. The data test verifies the projection hash, unchanged case values, and the selected controls.

The binary good move is the higher recorded independent 10M-budget Stockfish score among the two approved controls; measured Maia probability and stable UCI break ties. Model probability is not claimed to mean objectively strongest. All supplied moves must be legal and quiet. Source ratings are player ratings, not measured puzzle difficulty. No Glicko rating is invented for these cards.

The corpus includes structural lessons and explicitly labeled tactical/tempo hybrids. Short Maia3-79M lines are genuine model prefixes screened by an engine; where a model line was unsuitable, the Stockfish fallback is labeled. Rating conditioning does not certify playing strength. Longer Stockfish diagnostics are separate from the illustrations.

Chess game data: [Lichess database, CC0](https://database.lichess.org/). Human-model provenance: [Maia3](https://github.com/CSSLab/maia3) and [Maia3-79M](https://huggingface.co/UofTCSSLab/Maia3-79M). This app contains data and authored teaching commentary, no model weights, inference code, Stockfish executable, raw search logs, usernames, or private evidence paths in the new positional dataset. Existing repository assets retain their existing licenses.

## Persistence and timing

`tt.positional.v1` is a separate local-only store. The original app's settings, bests, ratings and statistics keys remain intact. A started run pins its full compact catalog, mode, choice count, board setting, filtered membership and option choices. Repeating a fixed cycle keeps that catalog; starting a new set from Modes explicitly uses the latest catalog. No update adds cards midway through a cycle.

Completed histories retain their pinned catalogs and support All/Misses review. The bounded app stats log is a secondary summary only, never the source of truth for fixed cycles. Corrupt saved data is left untouched and reports an error. Storage failures/conflicting-tab writes pause the run rather than overwriting older data. There is no external telemetry or cross-device synchronization.

Active wall-clock time excludes explicit pauses, hidden tabs, focus loss, feedback transitions and review. Reload restores paused. Header Quit ends the run and keeps answered positions in review. Pause offers a separate saved return to Modes. Starting a new run asks before ending an unfinished one; Resume alone resumes it. An explicit 3D-to-2D recovery keeps answers and marks that run separately from unchanged-board comparisons. Answers save immediately and elapsed time checkpoints every five seconds; a crash can lose up to five seconds of uncheckpointed time. Time is not a measurement of pure thinking. Compare like-for-like corpus, theme, mode, choice count and board setting; these axes are saved with each run.

The existing private pilot is a different origin. Its saved cycles remain there; this PR does not claim automatic migration of cross-origin browser storage.

## Checks

From the repository root, with Node supporting native ES modules:

```
node app/test/positional-data.test.mjs
node app/test/positional-engine.test.mjs
node app/test/positional-board-adapters.test.mjs
node app/test/positional-startup.test.mjs
node app/test/positional-recovery.test.mjs
```

No package installation or build is required. Serve the repository root, then open `app/`.

Cloud-browser QA covered: 13 misses without fixed-set termination; a second cycle with 13 correct answers and empty Misses; pause during feedback; paused reload; changed letters; binary survival's third mistake; actual five-minute Rush expiry at 300.1 active seconds; end commentary and line playback; a 390px phone-layout preview with no horizontal overflow and 44px+ controls; shared-destination labels; history retained across a catalog change; the strict25 default and four broad unique-count filters; keyboard preview/submit; and end-review deep-link reload.

3D limitation: the test cloud browser disables WebGL, so it fails in the pre-existing Three.js renderer before a mode mounts. The optional 3D arrow path has executable resource-ownership/backward-compatibility tests, but needs visual QA on a WebGL-enabled device before merge. Physical iPhone/Android behavior and offline reload under a real disconnected network have not been tested.

## Future content increments

Only replace the default catalog with an independently approved public projection and matching theme map/manifest. Bump the immutable corpus version, retain exact source versions, update the projection hash and binary-control receipts, and rerun the tests. Do not republish a changed payload under an existing version. Preserve the compact played-line fields and all displayed caveats; keep private evidence out of this repository. Position deduplication uses board, side, castling and legal en-passant state, excluding move clocks.

### Shared interface
Positional setup uses the same mode cards and segmented controls as Blunder Rush. Play keeps the board and preview/submit controls in the shared fixed stage/action-bar layout; the score, lives and clock sit in the app bar. Long explanations use a separate scrolling end-review screen. This is a presentation-only update: corpus, scoring, timing, saved-run identity and recovery rules are unchanged.

`node app/test/positional-interface.test.mjs` checks the 2/3-choice render contracts, paused board, separate review layout and all four setup routes. Actual phone-sized cloud browser checks supplement these markup tests; physical iOS/WebGL rendering is not implied.

### Strict50 content increment
The explicit corpus version `positional-training-strict50-20261018-v1` adds 25 approved positions to the prior 25. Started cycles and prior reviews keep their saved source snapshots; a new run uses 50. The public manifest contains the two-budget observed-best consistency receipts and the four excluded, unpublished candidates. All selected controls pass the same operational margins against the strongest measured reference/selected-control result. Source ratings and provisional hybrid difficulty labels remain in end review.
