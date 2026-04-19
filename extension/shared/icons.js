// Lucide-inspired icon helper without external dependencies

const ICON_DEFINITIONS = {
  color: {
    title: 'Color',
    elements: [
      { tag: 'path', attrs: { d: 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z' } }
    ]
  },
  text: {
    title: 'Text',
    elements: [
      { tag: 'path', attrs: { d: 'M12 4v16' } },
      { tag: 'path', attrs: { d: 'M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2' } },
      { tag: 'path', attrs: { d: 'M9 20h6' } }
    ]
  },
  element: {
    title: 'Element',
    elements: [
      { tag: 'path', attrs: { d: 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z' } }
    ]
  },
  screenshot: {
    title: 'Screenshot',
    elements: [
      { tag: 'path', attrs: { d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z' } },
      { tag: 'circle', attrs: { cx: 12, cy: 13, r: 3 } }
    ]
  },
  link: {
    title: 'Link',
    elements: [
      { tag: 'path', attrs: { d: 'M9 17H7A5 5 0 0 1 7 7h2' } },
      { tag: 'path', attrs: { d: 'M15 7h2a5 5 0 1 1 0 10h-2' } },
      { tag: 'line', attrs: { x1: 8, y1: 12, x2: 16, y2: 12 } }
    ]
  },
  font: {
    title: 'Font',
    elements: [
      { tag: 'path', attrs: { d: 'M15 11h4.5a1 1 0 0 1 0 5h-4a.5.5 0 0 1-.5-.5v-9a.5.5 0 0 1 .5-.5h3a1 1 0 0 1 0 5' } },
      { tag: 'path', attrs: { d: 'm2 16 4.039-9.69a.5.5 0 0 1 .923 0L11 16' } },
      { tag: 'path', attrs: { d: 'M3.304 13h6.392' } }
    ]
  },
  image: {
    title: 'Image',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 } },
      { tag: 'circle', attrs: { cx: 9, cy: 9, r: 2 } },
      { tag: 'path', attrs: { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' } }
    ]
  },
  media: {
    title: 'Media',
    elements: [
      { tag: 'path', attrs: { d: 'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z' } },
      { tag: 'path', attrs: { d: 'M6.2 5.3 9.3 9.2' } },
      { tag: 'path', attrs: { d: 'M12.4 3.4l3.1 4' } },
      { tag: 'path', attrs: { d: 'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' } }
    ]
  },
  video: {
    title: 'Video',
    elements: [
      { tag: 'rect', attrs: { x: 2.5, y: 6.5, width: 13, height: 11, rx: 2, ry: 2 } },
      { tag: 'path', attrs: { d: 'M15.5 10.25 21.5 7.5v8l-6-2.75Z' } }
    ]
  },
  sun: {
    title: 'Sun',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 4 } },
      { tag: 'path', attrs: { d: 'M12 2v2' } },
      { tag: 'path', attrs: { d: 'M12 20v2' } },
      { tag: 'path', attrs: { d: 'M4.93 4.93l1.41 1.41' } },
      { tag: 'path', attrs: { d: 'M17.66 17.66l1.41 1.41' } },
      { tag: 'path', attrs: { d: 'M2 12h2' } },
      { tag: 'path', attrs: { d: 'M20 12h2' } },
      { tag: 'path', attrs: { d: 'M6.34 17.66l-1.41 1.41' } },
      { tag: 'path', attrs: { d: 'M19.07 4.93l-1.41 1.41' } }
    ]
  },
  moon: {
    title: 'Moon',
    elements: [
      { tag: 'path', attrs: { d: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' } }
    ]
  },
  site: {
    title: 'Site information',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
      { tag: 'path', attrs: { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' } },
      { tag: 'path', attrs: { d: 'M2 12h20' } }
    ]
  },
  note: {
    title: 'Sticky note',
    elements: [
      { tag: 'path', attrs: { d: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z' } },
      { tag: 'path', attrs: { d: 'M15 3v5h5' } },
      { tag: 'path', attrs: { d: 'M8 12h8' } },
      { tag: 'path', attrs: { d: 'M8 16h6' } },
      { tag: 'path', attrs: { d: 'M8 20h4' } }
    ]
  },
  notes: {
    title: 'Sticky notes',
    elements: [
      { tag: 'path', attrs: { d: 'M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z' } },
      { tag: 'path', attrs: { d: 'M15 3v5h5' } },
      { tag: 'path', attrs: { d: 'M8 12h8' } },
      { tag: 'path', attrs: { d: 'M8 16h6' } },
      { tag: 'path', attrs: { d: 'M8 20h4' } }
    ]
  },
  developer: {
    title: 'Developer',
    elements: [
      { tag: 'path', attrs: { d: 'M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z' } },
      { tag: 'line', attrs: { x1: 3.946, y1: 15.987, x2: 20.054, y2: 15.987 } }
    ]
  },
  copy: {
    title: 'Copy',
    elements: [
      { tag: 'rect', attrs: { x: 8, y: 8, width: 14, height: 14, rx: 2, ry: 2 } },
      { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } }
    ]
  },
  download: {
    title: 'Download',
    elements: [
      { tag: 'path', attrs: { d: 'M12 15V3' } },
      { tag: 'path', attrs: { d: 'M7 10l5 5 5-5' } },
      { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } }
    ]
  },
  export: {
    title: 'Export',
    elements: [
      { tag: 'path', attrs: { d: 'M12 2v13' } },
      { tag: 'path', attrs: { d: 'm16 6-4-4-4 4' } },
      { tag: 'path', attrs: { d: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8' } }
    ]
  },
  pdf: {
    title: 'PDF',
    elements: [
      { tag: 'path', attrs: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
      { tag: 'polyline', attrs: { points: '14,2 14,8 20,8' } },
      { tag: 'path', attrs: { d: 'M9 13h6' } },
      { tag: 'path', attrs: { d: 'M9 17h6' } }
    ]
  },
  favorite: {
    title: 'Favorite',
    elements: [
      { tag: 'path', attrs: { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' } }
    ]
  },
  star: {
    title: 'Star',
    elements: [
      { tag: 'path', attrs: { d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z' } }
    ]
  },
  trash: {
    title: 'Delete',
    elements: [
      { tag: 'path', attrs: { d: 'M3 6h18' } },
      { tag: 'path', attrs: { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' } },
      { tag: 'path', attrs: { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' } },
      { tag: 'path', attrs: { d: 'M10 11v6' } },
      { tag: 'path', attrs: { d: 'M14 11v6' } }
    ]
  },
  info: {
    title: 'Info',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
      { tag: 'path', attrs: { d: 'M12 16v-4' } },
      { tag: 'path', attrs: { d: 'M12 8h.01' } }
    ]
  },
  alert: {
    title: 'Warning',
    elements: [
      { tag: 'path', attrs: { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' } },
      { tag: 'path', attrs: { d: 'M12 9v4' } },
      { tag: 'path', attrs: { d: 'M12 17h.01' } }
    ]
  },
  success: {
    title: 'Success',
    elements: [
      { tag: 'path', attrs: { d: 'M20 6 9 17l-5-5' } }
    ]
  },
  close: {
    title: 'Close',
    elements: [
      { tag: 'path', attrs: { d: 'M18 6 6 18' } },
      { tag: 'path', attrs: { d: 'M6 6l12 12' } }
    ]
  },
  plus: {
    title: 'Add',
    elements: [
      { tag: 'path', attrs: { d: 'M5 12h14' } },
      { tag: 'path', attrs: { d: 'M12 5v14' } }
    ]
  },
  palette: {
    title: 'Color Palette',
    elements: [
      { tag: 'circle', attrs: { cx: 13.5, cy: 6.5, r: 0.5, fill: 'currentColor' } },
      { tag: 'circle', attrs: { cx: 17.5, cy: 10.5, r: 0.5, fill: 'currentColor' } },
      { tag: 'circle', attrs: { cx: 8.5, cy: 7.5, r: 0.5, fill: 'currentColor' } },
      { tag: 'circle', attrs: { cx: 6.5, cy: 12.5, r: 0.5, fill: 'currentColor' } },
      { tag: 'path', attrs: { d: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z' } }
    ]
  },
  highlighter: {
    title: 'Highlighter',
    elements: [
      { tag: 'path', attrs: { d: 'M9 11 4 3' } },
      { tag: 'path', attrs: { d: 'M14 9 20 3' } },
      { tag: 'path', attrs: { d: 'M20 3v4l-6 6' } },
      { tag: 'path', attrs: { d: 'M4 3h4l6 6' } },
      { tag: 'path', attrs: { d: 'M9 11l5 5-8 6V11Z' } }
    ]
  },
  'book-open': {
    title: 'Reading Mode',
    elements: [
      { tag: 'path', attrs: { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' } },
      { tag: 'path', attrs: { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' } }
    ]
  },
  qrcode: {
    title: 'QR Code',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 2 } },
      { tag: 'rect', attrs: { x: 5, y: 5, width: 4, height: 4 } },
      { tag: 'rect', attrs: { x: 15, y: 5, width: 4, height: 4 } },
      { tag: 'rect', attrs: { x: 5, y: 15, width: 4, height: 4 } },
      { tag: 'line', attrs: { x1: 11, y1: 5, x2: 11, y2: 9 } },
      { tag: 'line', attrs: { x1: 11, y1: 11, x2: 11, y2: 13 } },
      { tag: 'line', attrs: { x1: 11, y1: 15, x2: 11, y2: 19 } },
      { tag: 'line', attrs: { x1: 15, y1: 11, x2: 19, y2: 11 } },
      { tag: 'line', attrs: { x1: 15, y1: 15, x2: 19, y2: 15 } }
    ]
  },
  bookmark: {
    title: 'Bookmark',
    elements: [
      { tag: 'path', attrs: { d: 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' } }
    ]
  },
  list: {
    title: 'List',
    elements: [
      { tag: 'line', attrs: { x1: 8, y1: 6, x2: 21, y2: 6 } },
      { tag: 'line', attrs: { x1: 8, y1: 12, x2: 21, y2: 12 } },
      { tag: 'line', attrs: { x1: 8, y1: 18, x2: 21, y2: 18 } },
      { tag: 'line', attrs: { x1: 3, y1: 6, x2: 3.01, y2: 6 } },
      { tag: 'line', attrs: { x1: 3, y1: 12, x2: 3.01, y2: 12 } },
      { tag: 'line', attrs: { x1: 3, y1: 18, x2: 3.01, y2: 18 } }
    ]
  },
  folder: {
    title: 'Folder',
    elements: [
      { tag: 'path', attrs: { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' } }
    ]
  },
  tag: {
    title: 'Tag',
    elements: [
      { tag: 'path', attrs: { d: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z' } },
      { tag: 'line', attrs: { x1: 7, y1: 7, x2: 7.01, y2: 7 } }
    ]
  },
  edit: {
    title: 'Edit',
    elements: [
      { tag: 'path', attrs: { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' } },
      { tag: 'path', attrs: { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' } }
    ]
  },
  upload: {
    title: 'Upload',
    elements: [
      { tag: 'path', attrs: { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' } },
      { tag: 'polyline', attrs: { points: '7,10 12,5 17,10' } },
      { tag: 'line', attrs: { x1: 12, y1: 5, x2: 12, y2: 15 } }
    ]
  },
  'file-text': {
    title: 'File Text',
    elements: [
      { tag: 'path', attrs: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } },
      { tag: 'polyline', attrs: { points: '14,2 14,8 20,8' } },
      { tag: 'line', attrs: { x1: 16, y1: 13, x2: 8, y2: 13 } },
      { tag: 'line', attrs: { x1: 16, y1: 17, x2: 8, y2: 17 } },
      { tag: 'polyline', attrs: { points: '10,9 9,9 8,9' } }
    ]
  },
  play: {
    title: 'Play',
    elements: [
      { tag: 'polygon', attrs: { points: '5,3 19,12 5,21' } }
    ]
  },
  wrench: {
    title: 'Wrench',
    elements: [
      { tag: 'path', attrs: { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' } }
    ]
  },
  book: {
    title: 'Book',
    elements: [
      { tag: 'path', attrs: { d: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20' } },
      { tag: 'path', attrs: { d: 'M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z' } }
    ]
  },
  sparkles: {
    title: 'AI Sparkles',
    elements: [
      { tag: 'path', attrs: { d: 'M12 3v4' } },
      { tag: 'path', attrs: { d: 'M16 7l-4-4-4 4' } },
      { tag: 'path', attrs: { d: 'M12 21v-4' } },
      { tag: 'path', attrs: { d: 'M8 17l4 4 4-4' } },
      { tag: 'path', attrs: { d: 'M3 12h4' } },
      { tag: 'path', attrs: { d: 'M21 12h-4' } }
    ]
  },
  brain: {
    title: 'AI Brain',
    elements: [
      { tag: 'path', attrs: { d: 'M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z' } },
      { tag: 'path', attrs: { d: 'M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z' } },
      { tag: 'path', attrs: { d: 'M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4' } },
      { tag: 'path', attrs: { d: 'M17.599 6.5a3 3 0 0 0 .399-1.375' } },
      { tag: 'path', attrs: { d: 'M6.003 5.125A3 3 0 0 0 6.401 6.5' } },
      { tag: 'path', attrs: { d: 'M3.477 10.896a4 4 0 0 1 .585-.396' } },
      { tag: 'path', attrs: { d: 'M19.938 10.5a4 4 0 0 1 .585.396' } },
      { tag: 'path', attrs: { d: 'M6 18a4 4 0 0 1-1.967-.516' } },
      { tag: 'path', attrs: { d: 'M19.967 17.484A4 4 0 0 1 18 18' } }
    ]
  },
  languages: {
    title: 'Languages',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 10 } },
      { tag: 'path', attrs: { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' } },
      { tag: 'path', attrs: { d: 'M2 12h20' } }
    ]
  },
  email: {
    title: 'Email',
    elements: [
      { tag: 'rect', attrs: { x: '2', y: '4', width: '20', height: '16', rx: '2' } },
      { tag: 'path', attrs: { d: 'M22 7l-10 6L2 7' } }
    ]
  },
  'search-check': {
    title: 'SEO Analyzer',
    elements: [
      { tag: 'circle', attrs: { cx: '11', cy: '11', r: '8' } },
      { tag: 'path', attrs: { d: 'm21 21-4.35-4.35' } },
      { tag: 'path', attrs: { d: 'm9 11 2 2 4-4' } }
    ]
  },
  'message': {
    title: 'Message',
    elements: [
      { tag: 'path', attrs: { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' } }
    ]
  },
  'clipboard-list': {
    title: 'Clipboard List',
    elements: [
      { tag: 'rect', attrs: { x: 8, y: 2, width: 8, height: 4, rx: 1 } },
      { tag: 'path', attrs: { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' } },
      { tag: 'path', attrs: { d: 'M9 12h6' } },
      { tag: 'path', attrs: { d: 'M9 16h6' } },
      { tag: 'path', attrs: { d: 'M9 8h6' } }
    ]
  },
  binary: {
    title: 'Binary',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 9h.01' } },
      { tag: 'path', attrs: { d: 'M7 13h.01' } },
      { tag: 'path', attrs: { d: 'M7 17h.01' } },
      { tag: 'path', attrs: { d: 'M11 9h2' } },
      { tag: 'path', attrs: { d: 'M11 13h2' } },
      { tag: 'path', attrs: { d: 'M11 17h2' } },
      { tag: 'path', attrs: { d: 'M16 9h.01' } },
      { tag: 'path', attrs: { d: 'M16 13h.01' } },
      { tag: 'path', attrs: { d: 'M16 17h.01' } }
    ]
  },
  braces: {
    title: 'Braces',
    elements: [
      { tag: 'path', attrs: { d: 'M9 4H7a2 2 0 0 0-2 2v2a2 2 0 0 1-2 2 2 2 0 0 1 2 2v2a2 2 0 0 0 2 2h2' } },
      { tag: 'path', attrs: { d: 'M15 4h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0-2 2v2a2 2 0 0 1-2 2h-2' } }
    ]
  },
  'link-code': {
    title: 'Link Code',
    elements: [
      { tag: 'path', attrs: { d: 'M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1' } },
      { tag: 'path', attrs: { d: 'M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1' } },
      { tag: 'path', attrs: { d: 'M8 2 5 5 8 8' } },
      { tag: 'path', attrs: { d: 'M16 16l3 3-3 3' } }
    ]
  },
  'text-case': {
    title: 'Text Case',
    elements: [
      { tag: 'path', attrs: { d: 'M4 19h5' } },
      { tag: 'path', attrs: { d: 'M6.5 19V8' } },
      { tag: 'path', attrs: { d: 'M4 8h5' } },
      { tag: 'path', attrs: { d: 'M13 16h7' } },
      { tag: 'path', attrs: { d: 'M16.5 16V5' } },
      { tag: 'path', attrs: { d: 'M13 5h7' } }
    ]
  },
  'markdown-html': {
    title: 'Markdown HTML',
    elements: [
      { tag: 'path', attrs: { d: 'M4 8h6v8H8V10l-1.5 2.5L5 10v6H4z' } },
      { tag: 'path', attrs: { d: 'M14 8h6' } },
      { tag: 'path', attrs: { d: 'M14 12h6' } },
      { tag: 'path', attrs: { d: 'M14 16h6' } }
    ]
  },
  'entity-code': {
    title: 'Entity Code',
    elements: [
      { tag: 'path', attrs: { d: 'M5 12h14' } },
      { tag: 'path', attrs: { d: 'M9 7 5 12l4 5' } },
      { tag: 'path', attrs: { d: 'M15 7l4 5-4 5' } },
      { tag: 'path', attrs: { d: 'M12 4v2' } },
      { tag: 'path', attrs: { d: 'M12 18v2' } }
    ]
  },
  slug: {
    title: 'Slug',
    elements: [
      { tag: 'path', attrs: { d: 'M4 12h8' } },
      { tag: 'path', attrs: { d: 'M4 8h12' } },
      { tag: 'path', attrs: { d: 'M4 16h6' } },
      { tag: 'path', attrs: { d: 'M18 6l3 3-3 3' } },
      { tag: 'path', attrs: { d: 'M21 9h-6' } }
    ]
  },
  uuid: {
    title: 'UUID',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 10h2' } },
      { tag: 'path', attrs: { d: 'M11 10h2' } },
      { tag: 'path', attrs: { d: 'M15 10h2' } },
      { tag: 'path', attrs: { d: 'M7 14h2' } },
      { tag: 'path', attrs: { d: 'M11 14h2' } },
      { tag: 'path', attrs: { d: 'M15 14h2' } }
    ]
  },
  hash: {
    title: 'Hash',
    elements: [
      { tag: 'line', attrs: { x1: 9, y1: 3, x2: 7, y2: 21 } },
      { tag: 'line', attrs: { x1: 17, y1: 3, x2: 15, y2: 21 } },
      { tag: 'line', attrs: { x1: 4, y1: 9, x2: 20, y2: 9 } },
      { tag: 'line', attrs: { x1: 3, y1: 15, x2: 19, y2: 15 } }
    ]
  },
  'jwt-token': {
    title: 'JWT Token',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 3 } },
      { tag: 'path', attrs: { d: 'M8 10h8' } },
      { tag: 'path', attrs: { d: 'M8 14h4' } },
      { tag: 'path', attrs: { d: 'M16 14h.01' } }
    ]
  },
  'json-yaml': {
    title: 'JSON YAML',
    elements: [
      { tag: 'path', attrs: { d: 'M6 5H4v14h2' } },
      { tag: 'path', attrs: { d: 'M18 5h2v14h-2' } },
      { tag: 'path', attrs: { d: 'M10 9h4' } },
      { tag: 'path', attrs: { d: 'M10 13h4' } },
      { tag: 'path', attrs: { d: 'M10 17h2' } }
    ]
  },
  'table-arrows': {
    title: 'Table Arrows',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M3 10h18' } },
      { tag: 'path', attrs: { d: 'M9 5v14' } },
      { tag: 'path', attrs: { d: 'M14 12h5' } },
      { tag: 'path', attrs: { d: 'M16 10l3 2-3 2' } }
    ]
  },
  'xml-json': {
    title: 'XML JSON',
    elements: [
      { tag: 'path', attrs: { d: 'M5 9 2 12l3 3' } },
      { tag: 'path', attrs: { d: 'M19 9l3 3-3 3' } },
      { tag: 'path', attrs: { d: 'M14 5 10 19' } },
      { tag: 'path', attrs: { d: 'M7 5h2' } },
      { tag: 'path', attrs: { d: 'M15 19h2' } }
    ]
  },
  'image-convert': {
    title: 'Image Convert',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
      { tag: 'circle', attrs: { cx: 8.5, cy: 9, r: 1.3 } },
      { tag: 'path', attrs: { d: 'M4 17l4.5-4.5a1.5 1.5 0 0 1 2.1 0L13 15l1.2-1.2a1.5 1.5 0 0 1 2.1 0L20 17' } },
      { tag: 'path', attrs: { d: 'M14 8h5' } },
      { tag: 'path', attrs: { d: 'M17 6l2 2-2 2' } }
    ]
  },
  'resize-compress': {
    title: 'Resize Compress',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 3, width: 18, height: 18, rx: 3 } },
      { tag: 'path', attrs: { d: 'M8 8h4' } },
      { tag: 'path', attrs: { d: 'M8 12h8' } },
      { tag: 'path', attrs: { d: 'M8 16h6' } },
      { tag: 'path', attrs: { d: 'M16 5h3v3' } },
      { tag: 'path', attrs: { d: 'M19 5l-4 4' } }
    ]
  },
  'svg-png': {
    title: 'SVG PNG',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 8, height: 8, rx: 1 } },
      { tag: 'path', attrs: { d: 'M4.5 10l2-2 1 1 1.5-1.5L10 9v2H4.5z' } },
      { tag: 'path', attrs: { d: 'M14 7h7' } },
      { tag: 'path', attrs: { d: 'M14 11h7' } },
      { tag: 'path', attrs: { d: 'M14 16h7' } },
      { tag: 'path', attrs: { d: 'M14 20h7' } }
    ]
  },
  'heic-convert': {
    title: 'HEIC Convert',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 9h3' } },
      { tag: 'path', attrs: { d: 'M7 13h3' } },
      { tag: 'path', attrs: { d: 'M13 11h7' } },
      { tag: 'path', attrs: { d: 'M17 9l3 2-3 2' } }
    ]
  },
  'pdf-image': {
    title: 'PDF Image',
    elements: [
      { tag: 'path', attrs: { d: 'M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' } },
      { tag: 'path', attrs: { d: 'M14 3v5h5' } },
      { tag: 'rect', attrs: { x: 7.5, y: 12.5, width: 9, height: 6.5, rx: 1.2 } },
      { tag: 'circle', attrs: { cx: 10, cy: 14.5, r: 0.8 } },
      { tag: 'path', attrs: { d: 'M8.5 18l2.2-2.3 1.7 1.6 1.6-1.6 2 2.3' } }
    ]
  },
  'image-pdf': {
    title: 'Image PDF',
    elements: [
      { tag: 'path', attrs: { d: 'M14 3H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a1 1 0 0 0 1-1V7z' } },
      { tag: 'path', attrs: { d: 'M14 3v4h4' } },
      { tag: 'rect', attrs: { x: 4, y: 9, width: 9, height: 7, rx: 1.2 } },
      { tag: 'circle', attrs: { cx: 6.6, cy: 11.3, r: 0.8 } },
      { tag: 'path', attrs: { d: 'M5.2 15l2-2.1 1.4 1.2 1.5-1.5 2 2.4' } }
    ]
  },
  'pdf-merge': {
    title: 'PDF Merge',
    elements: [
      { tag: 'path', attrs: { d: 'M8 3h6l4 4v13a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' } },
      { tag: 'path', attrs: { d: 'M14 3v4h4' } },
      { tag: 'path', attrs: { d: 'M9 12h6' } },
      { tag: 'path', attrs: { d: 'M12 9v6' } },
      { tag: 'path', attrs: { d: 'M4 16h3' } },
      { tag: 'path', attrs: { d: 'M17 16h3' } }
    ]
  },
  'pdf-compress': {
    title: 'PDF Compress',
    elements: [
      { tag: 'path', attrs: { d: 'M8 3h6l4 4v13a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z' } },
      { tag: 'path', attrs: { d: 'M14 3v4h4' } },
      { tag: 'path', attrs: { d: 'M8.5 13h7' } },
      { tag: 'path', attrs: { d: 'M10.5 10l-2 3 2 3' } },
      { tag: 'path', attrs: { d: 'M13.5 10l2 3-2 3' } }
    ]
  },
  'qr-convert': {
    title: 'QR Convert',
    elements: [
      { tag: 'rect', attrs: { x: 4, y: 4, width: 16, height: 16, rx: 2 } },
      { tag: 'rect', attrs: { x: 6, y: 6, width: 4, height: 4, rx: 1 } },
      { tag: 'rect', attrs: { x: 14, y: 6, width: 4, height: 4, rx: 1 } },
      { tag: 'rect', attrs: { x: 6, y: 14, width: 4, height: 4, rx: 1 } },
      { tag: 'path', attrs: { d: 'M13 15h5' } },
      { tag: 'path', attrs: { d: 'M16 13l2 2-2 2' } }
    ]
  },
  'audio-convert': {
    title: 'Audio Convert',
    elements: [
      { tag: 'path', attrs: { d: 'M11 5 7 8H4v8h3l4 3z' } },
      { tag: 'path', attrs: { d: 'M15 9c1.5 1.2 1.5 4.8 0 6' } },
      { tag: 'path', attrs: { d: 'M18 7c2.8 2.4 2.8 7.6 0 10' } },
      { tag: 'path', attrs: { d: 'M20 12h2' } }
    ]
  },
  'video-convert': {
    title: 'Video Convert',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 14, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M9 9l4 3-4 3z' } },
      { tag: 'path', attrs: { d: 'M17 10l4-2v8l-4-2' } },
      { tag: 'path', attrs: { d: 'M3 12h-1' } }
    ]
  },
  'subtitle-convert': {
    title: 'Subtitle Convert',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 10h5' } },
      { tag: 'path', attrs: { d: 'M7 14h7' } },
      { tag: 'path', attrs: { d: 'M15 9h5' } },
      { tag: 'path', attrs: { d: 'M17 7l3 2-3 2' } }
    ]
  },
  'roman-convert': {
    title: 'Roman Numeral Convert',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
      { tag: 'path', attrs: { d: 'M8 9h2a1.5 1.5 0 0 1 0 3H8V9z' } },
      { tag: 'path', attrs: { d: 'M8 12h2.2a1.4 1.4 0 0 1 0 2.8H8' } },
      { tag: 'path', attrs: { d: 'M14 9v6' } },
      { tag: 'path', attrs: { d: 'M16.5 9v6' } }
    ]
  },
  'json-tree': {
    title: 'JSON Tree',
    elements: [
      { tag: 'path', attrs: { d: 'M6 5h4v4H6z' } },
      { tag: 'path', attrs: { d: 'M14 5h4v4h-4z' } },
      { tag: 'path', attrs: { d: 'M10 7h4' } },
      { tag: 'path', attrs: { d: 'M12 9v5' } },
      { tag: 'path', attrs: { d: 'M6 14h4v4H6z' } },
      { tag: 'path', attrs: { d: 'M14 14h4v4h-4z' } },
      { tag: 'path', attrs: { d: 'M10 16h4' } }
    ]
  },
  'table-preview': {
    title: 'Table Preview',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M3 9h18' } },
      { tag: 'path', attrs: { d: 'M9 9v9' } },
      { tag: 'path', attrs: { d: 'M15 9v9' } },
      { tag: 'path', attrs: { d: 'M7 20h10' } }
    ]
  },
  'markdown-preview': {
    title: 'Markdown Preview',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
      { tag: 'path', attrs: { d: 'M6 16V9l2.2 3 2.2-3v7' } },
      { tag: 'path', attrs: { d: 'M14 9h4' } },
      { tag: 'path', attrs: { d: 'M14 12h3' } },
      { tag: 'path', attrs: { d: 'M14 15h4' } }
    ]
  },
  'xml-tree': {
    title: 'XML Tree',
    elements: [
      { tag: 'path', attrs: { d: 'M7 8 4 12l3 4' } },
      { tag: 'path', attrs: { d: 'M17 8l3 4-3 4' } },
      { tag: 'path', attrs: { d: 'M13 6 11 18' } },
      { tag: 'path', attrs: { d: 'M4 20h16' } }
    ]
  },
  'pdf-preview': {
    title: 'PDF Preview',
    elements: [
      { tag: 'path', attrs: { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a1 1 0 0 0 1-1V8z' } },
      { tag: 'path', attrs: { d: 'M14 3v5h5' } },
      { tag: 'path', attrs: { d: 'M8 13h8' } },
      { tag: 'path', attrs: { d: 'M8 17h6' } },
      { tag: 'path', attrs: { d: 'M4 10h3' } }
    ]
  },
  'image-inspector': {
    title: 'Image Inspector',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 14, height: 14, rx: 2 } },
      { tag: 'circle', attrs: { cx: 8, cy: 9, r: 1.2 } },
      { tag: 'path', attrs: { d: 'M4 16l3.5-3.5a1.5 1.5 0 0 1 2.1 0L13 16' } },
      { tag: 'circle', attrs: { cx: 18.5, cy: 17.5, r: 2.5 } },
      { tag: 'path', attrs: { d: 'm20.5 19.5 1.5 1.5' } }
    ]
  },
  'social-preview': {
    title: 'Social Preview',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
      { tag: 'rect', attrs: { x: 5.5, y: 7.5, width: 5, height: 5, rx: 1 } },
      { tag: 'path', attrs: { d: 'M12.5 8h6' } },
      { tag: 'path', attrs: { d: 'M12.5 11h6' } },
      { tag: 'path', attrs: { d: 'M5.5 14h13' } }
    ]
  },
  'schema-preview': {
    title: 'Schema Preview',
    elements: [
      { tag: 'path', attrs: { d: 'M12 3v4' } },
      { tag: 'path', attrs: { d: 'M12 17v4' } },
      { tag: 'path', attrs: { d: 'M3 12h4' } },
      { tag: 'path', attrs: { d: 'M17 12h4' } },
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 3 } },
      { tag: 'circle', attrs: { cx: 12, cy: 3, r: 1 } },
      { tag: 'circle', attrs: { cx: 12, cy: 21, r: 1 } },
      { tag: 'circle', attrs: { cx: 3, cy: 12, r: 1 } },
      { tag: 'circle', attrs: { cx: 21, cy: 12, r: 1 } }
    ]
  },
  'link-preview': {
    title: 'Link Preview',
    elements: [
      { tag: 'path', attrs: { d: 'M9 12a3 3 0 0 1 3-3h2' } },
      { tag: 'path', attrs: { d: 'M15 12a3 3 0 0 1-3 3h-2' } },
      { tag: 'path', attrs: { d: 'M10 12h4' } },
      { tag: 'circle', attrs: { cx: 18.5, cy: 18.5, r: 2.5 } },
      { tag: 'path', attrs: { d: 'm20.5 20.5 1.5 1.5' } }
    ]
  },
  'jwt-claims': {
    title: 'JWT Claims',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 10h10' } },
      { tag: 'path', attrs: { d: 'M7 14h6' } },
      { tag: 'circle', attrs: { cx: 17.5, cy: 14.5, r: 1.5 } }
    ]
  },
  'zpl-viewer': {
    title: 'ZPL Viewer',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 16, rx: 2 } },
      { tag: 'path', attrs: { d: 'M6 8h12' } },
      { tag: 'path', attrs: { d: 'M6 12h7' } },
      { tag: 'path', attrs: { d: 'M6 16h12' } },
      { tag: 'path', attrs: { d: 'M15 10l3 3-3 3' } }
    ]
  },
  'code-preview': {
    title: 'Code Preview',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M8 9 5 12l3 3' } },
      { tag: 'path', attrs: { d: 'M16 9l3 3-3 3' } },
      { tag: 'path', attrs: { d: 'M13 8 11 16' } },
      { tag: 'path', attrs: { d: 'M8 20h8' } }
    ]
  },
  'html-viewer': {
    title: 'HTML Viewer',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 4, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M8 9 5 12l3 3' } },
      { tag: 'path', attrs: { d: 'M16 9l3 3-3 3' } },
      { tag: 'path', attrs: { d: 'M12 7v10' } },
      { tag: 'path', attrs: { d: 'M8 20h8' } }
    ]
  },
  'yaml-viewer': {
    title: 'YAML Viewer',
    elements: [
      { tag: 'path', attrs: { d: 'M6 6h12' } },
      { tag: 'path', attrs: { d: 'M6 12h5' } },
      { tag: 'path', attrs: { d: 'M6 18h12' } },
      { tag: 'circle', attrs: { cx: 15.5, cy: 12, r: 1.5 } }
    ]
  },
  'toml-ini': {
    title: 'TOML INI Viewer',
    elements: [
      { tag: 'rect', attrs: { x: 4, y: 4, width: 16, height: 16, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 8h10' } },
      { tag: 'path', attrs: { d: 'M7 12h4' } },
      { tag: 'path', attrs: { d: 'M7 16h10' } },
      { tag: 'path', attrs: { d: 'M13 12h4' } }
    ]
  },
  'jsonl-viewer': {
    title: 'JSONL Viewer',
    elements: [
      { tag: 'path', attrs: { d: 'M5 6h14' } },
      { tag: 'path', attrs: { d: 'M5 10h14' } },
      { tag: 'path', attrs: { d: 'M5 14h14' } },
      { tag: 'path', attrs: { d: 'M5 18h10' } },
      { tag: 'circle', attrs: { cx: 18, cy: 18, r: 1 } }
    ]
  },
  'har-viewer': {
    title: 'HAR Viewer',
    elements: [
      { tag: 'path', attrs: { d: 'M4 6h16' } },
      { tag: 'path', attrs: { d: 'M4 10h12' } },
      { tag: 'path', attrs: { d: 'M4 14h9' } },
      { tag: 'path', attrs: { d: 'M4 18h6' } },
      { tag: 'path', attrs: { d: 'M14 12h6' } },
      { tag: 'path', attrs: { d: 'M17 9v6' } }
    ]
  },
  'diff-viewer': {
    title: 'Diff Viewer',
    elements: [
      { tag: 'path', attrs: { d: 'M7 5v14' } },
      { tag: 'path', attrs: { d: 'M4 8l3-3 3 3' } },
      { tag: 'path', attrs: { d: 'M17 19V5' } },
      { tag: 'path', attrs: { d: 'M14 16l3 3 3-3' } },
      { tag: 'path', attrs: { d: 'M9 12h6' } }
    ]
  },
  'sql-result': {
    title: 'SQL Result',
    elements: [
      { tag: 'ellipse', attrs: { cx: 12, cy: 6, rx: 7, ry: 3 } },
      { tag: 'path', attrs: { d: 'M5 6v8c0 1.7 3.1 3 7 3s7-1.3 7-3V6' } },
      { tag: 'path', attrs: { d: 'M5 10c0 1.7 3.1 3 7 3s7-1.3 7-3' } },
      { tag: 'path', attrs: { d: 'M5 14c0 1.7 3.1 3 7 3s7-1.3 7-3' } }
    ]
  },
  'a11y-audit': {
    title: 'Accessibility Audit',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } },
      { tag: 'path', attrs: { d: 'M12 8v8' } },
      { tag: 'path', attrs: { d: 'M8 12h8' } }
    ]
  },
  'web-vitals': {
    title: 'Web Vitals',
    elements: [
      { tag: 'path', attrs: { d: 'M4 16h16' } },
      { tag: 'path', attrs: { d: 'M6 16V9' } },
      { tag: 'path', attrs: { d: 'M12 16V6' } },
      { tag: 'path', attrs: { d: 'M18 16v-4' } }
    ]
  },
  'security-headers': {
    title: 'Security Headers',
    elements: [
      { tag: 'path', attrs: { d: 'M12 3 5 6v6c0 4.5 2.7 7.5 7 9 4.3-1.5 7-4.5 7-9V6z' } },
      { tag: 'path', attrs: { d: 'M9 12h6' } },
      { tag: 'path', attrs: { d: 'M12 9v6' } }
    ]
  },
  'structured-data': {
    title: 'Structured Data',
    elements: [
      { tag: 'rect', attrs: { x: 4, y: 4, width: 6, height: 6, rx: 1 } },
      { tag: 'rect', attrs: { x: 14, y: 4, width: 6, height: 6, rx: 1 } },
      { tag: 'rect', attrs: { x: 9, y: 14, width: 6, height: 6, rx: 1 } },
      { tag: 'path', attrs: { d: 'M10 7h4' } },
      { tag: 'path', attrs: { d: 'M12 10v4' } }
    ]
  },
  'social-preview-pro': {
    title: 'Social Preview Pro',
    elements: [
      { tag: 'rect', attrs: { x: 3, y: 5, width: 18, height: 14, rx: 2 } },
      { tag: 'path', attrs: { d: 'M7 11h10' } },
      { tag: 'path', attrs: { d: 'M7 15h7' } },
      { tag: 'circle', attrs: { cx: 18, cy: 8, r: 1 } }
    ]
  },
  'robots-sitemap': {
    title: 'Robots Sitemap',
    elements: [
      { tag: 'path', attrs: { d: 'M5 5h14v6H5z' } },
      { tag: 'path', attrs: { d: 'M5 15h6v4H5z' } },
      { tag: 'path', attrs: { d: 'M13 15h6v4h-6z' } },
      { tag: 'path', attrs: { d: 'M8 11v4' } },
      { tag: 'path', attrs: { d: 'M16 11v4' } }
    ]
  },
  'har-diff': {
    title: 'HAR Diff',
    elements: [
      { tag: 'path', attrs: { d: 'M6 4v16' } },
      { tag: 'path', attrs: { d: 'M3 7l3-3 3 3' } },
      { tag: 'path', attrs: { d: 'M18 20V4' } },
      { tag: 'path', attrs: { d: 'M15 17l3 3 3-3' } },
      { tag: 'path', attrs: { d: 'M9 12h6' } }
    ]
  },
  'cookie-auditor': {
    title: 'Cookie Auditor',
    elements: [
      { tag: 'circle', attrs: { cx: 12, cy: 12, r: 8 } },
      { tag: 'circle', attrs: { cx: 9, cy: 9, r: 1 } },
      { tag: 'circle', attrs: { cx: 14, cy: 8, r: 1 } },
      { tag: 'circle', attrs: { cx: 13, cy: 13, r: 1 } },
      { tag: 'path', attrs: { d: 'M16.5 16.5 20 20' } }
    ]
  },
  'macro-recorder': {
    title: 'Macro Recorder',
    elements: [
      { tag: 'path', attrs: { d: 'M4.5 3.5 15 8l-5 2 4 4-2 2-4-4-2 5z' } },
      { tag: 'path', attrs: { d: 'M16.5 13.5 21 16l-4.5 2.5z' } },
      { tag: 'circle', attrs: { cx: 17, cy: 17, r: 4 } }
    ]
  }
};

const DEFAULT_ICON = {
  title: 'Item',
  elements: [
    { tag: 'circle', attrs: { cx: 12, cy: 12, r: 9 } }
  ]
};

function buildSvg(definition, options = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', options.strokeWidth ?? 1.8);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const size = options.size ?? 20;
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  if (options.className) svg.setAttribute('class', options.className);
  const aria = options.decorative === false ? 'img' : 'presentation';
  svg.setAttribute('role', aria);
  svg.setAttribute('aria-hidden', options.decorative === false ? 'false' : 'true');

  const titleText = options.decorative === false ? (options.title || definition.title) : undefined;
  if (titleText) {
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = titleText;
    svg.appendChild(title);
  }

  (definition.elements || []).forEach(({ tag, attrs }) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs || {}).forEach(([key, value]) => {
      el.setAttribute(key, String(value));
    });
    svg.appendChild(el);
  });

  return svg;
}

export function getIconDefinition(name) {
  if (!name) return DEFAULT_ICON;
  return ICON_DEFINITIONS[name] || DEFAULT_ICON;
}

export function createIconElement(name, options = {}) {
  const definition = getIconDefinition(name);
  const svg = buildSvg(definition, options);
  svg.classList.add('toolary-icon');
  return svg;
}

export function renderIcon(name, options = {}) {
  return createIconElement(name, options);
}

export function getIconSvg(name, options = {}) {
  const definition = getIconDefinition(name);
  const svg = buildSvg(definition, { size: options.size ?? 18, decorative: options.decorative ?? true });
  svg.classList.add('toolary-icon');
  return new XMLSerializer().serializeToString(svg);
}

export const ICON_NAMES = Object.keys(ICON_DEFINITIONS);

// Export icons object for compatibility
export const icons = {
  createIconElement,
  renderIcon,
  getIconSvg,
  getIconDefinition,
  ICON_NAMES
};
