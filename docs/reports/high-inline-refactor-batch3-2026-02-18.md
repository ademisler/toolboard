# High Inline Refactor - Batch 3 (2026-02-18)

## Scope
- `extension/tools/converters/pdfMergeSplitConverter.js`
- `extension/tools/converters/qrTextConverter.js`
- `extension/tools/converters/csvJsonConverter.js`
- `extension/tools/converters/xmlJsonConverter.js`
- `extension/tools/converters/audioFormatConverter.js`
- `extension/tools/converters/subtitleConverter.js`
- `extension/tools/converters/unitConverter.js`
- `extension/tools/capture/qrCodeGenerator.js`

## What Changed
- Refactored all listed tools from inline-heavy templates to class-based UI styles (`ensureStyles()` + scoped CSS).
- Removed inline HTML style attributes from all 8 target files.
- Standardized button cursor behavior (`cursor: pointer` for interactive actions, `not-allowed` for disabled actions).
- Replaced initial hidden sections (`style="display:none"`) with CSS class toggles.
- Reduced dynamic style mutations by using class toggles for active mode/hint visibility.
- Added fullscreen preview behavior for QR previews:
  - `qr-text-converter`: click generated preview to open fullscreen overlay.
  - `qr-code-generator`: click rendered preview canvas to open fullscreen overlay.
- Fixed dynamic-render fullscreen continuity risk by binding preview click at container level, so newly rendered canvases still open fullscreen.

## Inline Style Count (Post-Refactor)
- `extension/tools/converters/pdfMergeSplitConverter.js`: 0
- `extension/tools/converters/qrTextConverter.js`: 0
- `extension/tools/converters/csvJsonConverter.js`: 0
- `extension/tools/converters/xmlJsonConverter.js`: 0
- `extension/tools/converters/audioFormatConverter.js`: 0
- `extension/tools/converters/subtitleConverter.js`: 0
- `extension/tools/converters/unitConverter.js`: 0
- `extension/tools/capture/qrCodeGenerator.js`: 0

## Fullscreen Runtime Checklist (Tool-by-Tool)
- `pdf-merge-split-converter`: N/A (no preview canvas/image)
- `qr-text-converter`: Works (preview click -> fullscreen overlay)
- `csv-json-converter`: N/A (text conversion only)
- `xml-json-converter`: N/A (text conversion only)
- `audio-format-converter`: N/A (no visual preview surface)
- `subtitle-converter`: N/A (text conversion only)
- `unit-converter`: N/A (numeric conversion only)
- `qr-code-generator`: Works (preview canvas click -> fullscreen overlay)

## Verification
- `npm run lint`: PASS
- `npm test -- --runInBand`: PASS (256/256)
