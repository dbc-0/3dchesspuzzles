# Chess piece artwork -- attribution and licence

The twelve SVG files in this directory (`wK.svg`, `wQ.svg`, `wR.svg`, `wB.svg`, `wN.svg`,
`wP.svg`, `bK.svg`, `bQ.svg`, `bR.svg`, `bB.svg`, `bN.svg`, `bP.svg`) are the "Cburnett" chess
piece set.

- **Author:** Colin M.L. Burnett (Wikipedia/Wikimedia Commons user
  [Cburnett](https://en.wikipedia.org/wiki/User:Cburnett)), first published 2006. This is the
  same piece set used as Wikipedia's standard chess diagram artwork and shipped by lichess.org
  as its default "cburnett" board theme -- the pieces most players already recognise.
- **Downloaded from:** the lichess.org client source, `lichess-org/lila`, path
  `public/piece/cburnett/*.svg`
  (https://github.com/lichess-org/lila/tree/master/public/piece/cburnett), which redistributes
  Burnett's original artwork unmodified in shape (only whitespace/minification differs from the
  Wikimedia Commons originals, e.g.
  https://commons.wikimedia.org/wiki/File:Chess_kdt45.svg).
- **Licence:** Burnett originally released the set under multiple licences and permits using
  any one of them (see the "Licensing" section of the Wikimedia Commons file pages, e.g. the
  link above): GNU Free Documentation License 1.2+, Creative Commons
  Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0), 3-clause BSD, and GNU GPL 2.0+. This
  project uses the set under **CC BY-SA 3.0**
  (https://creativecommons.org/licenses/by-sa/3.0/).
  - lichess-org/lila's own `COPYING.md` separately labels its bundled copy of
    `public/piece/cburnett` as GPLv2+; either label traces back to the same
    multi-licensed Burnett original and either licence's terms are satisfied by the CC BY-SA
    3.0 attribution given here.

## What CC BY-SA 3.0 requires here

- **Attribution:** give appropriate credit to Colin M.L. Burnett. Done via this file plus a
  visible in-app credit (see below).
- **ShareAlike:** if this artwork is modified and redistributed, the modified artwork must be
  shared under the same or a compatible licence. The files in this directory are used
  unmodified (only re-encoded as inline SVG markup inside `app/js/pieces-svg.js` -- same paths,
  same geometry, no visual changes).

## In-app credit

A short attribution line is shown in the app itself; see `app/js/pieces-svg.js` for the
`PIECE_CREDIT` string that any UI screen (About/Settings/etc.) can render, and the
implementation report for where to surface it if that means touching a screen outside this
change's file ownership.
