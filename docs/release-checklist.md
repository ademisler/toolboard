# Toolboard Release Checklist

Use this checklist before publishing a new extension release.

## 1) Automated Gates (must pass)

Run from repository root:

```bash
npm run lint
npm test -- --runInBand
```

These checks validate:
- Tool manifest integrity (module existence, export shape, unique + kebab-case ids)
- i18n key coverage for tool manifest keys in `en/tr/fr`
- Tool icon registration against `extension/shared/icons.js`
- Coffee message coverage for all manifest tools

## 2) Converter + Previewer UI Smoke Checks

For each tool that renders preview media (`img`, `video`, `canvas`):
- Open tool from popup and run primary action
- Regenerate preview with different input
- Verify hover cursor is click/zoom style on interactive media
- Verify fullscreen works after the second render (not only first render)
- Verify overlay close paths (close button, outside click, `Esc`) work

## 3) i18n + Theme Sanity

- Switch language (`en`, `tr`, `fr`) and verify tool labels/titles/descriptions in popup
- Run key tools in light and dark contexts and confirm control contrast/readability

## 4) Functional Publishing Checks

- Verify `extension/manifest.json` version bump and permissions consistency
- Verify `extension/config/tools-manifest.json` tool count/category data
- Verify any roadmap docs updated when feature scope changed (`docs/converters-plan.md`)

## 5) Final Sign-off

- No unresolved TODO/FIXME in project code/docs (exclude vendored libs)
- Manual smoke pass complete for high-traffic tools
- Changelog / release notes prepared
