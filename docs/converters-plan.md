# Converters Category Implementation Plan

## Goal
Add a new `converters` category to Toolboard and implement high-demand conversion tools with production-level quality, stable cleanup, i18n support, and test coverage.

## Delivery Principles
- Build in small, verifiable increments.
- Keep default UX simple, expose advanced options only when needed.
- Favor client-side processing first; use network calls only where unavoidable.
- Each tool must include: metadata, activate/deactivate cleanup, i18n strings, and manifest registration.

## Phase 0: Foundation (now)
- [x] Add `converters` category to constants, manifest categories, popup category menu, and i18n.
- [x] Add first converter tool: `unit-converter`.
- [x] Verify lint + tests.

## Phase 1: Core Utility Converters (highest demand, low risk)
- [x] Unit Converter
- [x] Currency Converter
- [x] Time Zone Converter
- [x] Color Converter (HEX/RGB/HSL/CMYK)
- [x] Unix Time Converter
- [x] Number Base Converter

## Phase 2: Dev/Text Converters
- [x] JSON ↔ YAML
- [x] CSV ↔ JSON
- [x] XML ↔ JSON
- [x] Base64 Encode/Decode
- [x] URL Encode/Decode
- [x] Case Converter
- [x] Markdown ↔ HTML
- [x] HTML Entity Encode/Decode
- [x] Text to Slug
- [x] UUID Generator/Validator
- [x] Hash Generator
- [x] JWT Decoder

## Phase 3: Image + PDF Converters
- [x] Image Format Converter (PNG/JPG/WebP)
- [x] Image Resizer/Compressor
- [x] SVG to PNG
- [x] HEIC to JPG/PNG
- [x] PDF to Image
- [x] Image to PDF
- [x] PDF Merge/Split
- [x] PDF Compress

## Phase 4: Media/Advanced
- [x] QR ↔ Text (decode support)
- [x] Audio Format Converter
- [x] Video Format Converter
- [x] Subtitle Converter (SRT/VTT)

## Phase 5: Bonus Converters (incremental)
- [x] Roman Numeral Converter (Number ↔ Roman)

## Quality Checklist per Tool
- [ ] Tool module exports `metadata`, `activate`, `deactivate`.
- [ ] No leaked event listeners or DOM nodes after deactivate.
- [ ] Clear, localized user messages.
- [ ] Handles invalid input gracefully.
- [ ] Works in both light and dark popup/content contexts.
- [ ] Added to manifest and searchable tags/keywords.
