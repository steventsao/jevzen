# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

# Project notes

Use pnpm. Keep Effect and the Effect Agent packages pinned to compatible versions.
The TypeSafe integration requires Effect v4 RC, so use the compatible RC instead
of the older `effect@beta` tag.

API keys belong in the gitignored `.env`. Never print keys, raw HTTP headers, or
unfiltered provider errors. Use synthetic support tickets for live demos.

`pnpm typecheck` and `pnpm test` run locally without API calls.
`pnpm start` performs a live TypeSafe evaluation.
