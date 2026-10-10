# Toolboard Privacy Policy

_Effective date: Toolboard v2.0.0_

Toolboard is built with a privacy-first approach. The extension operates entirely within your browser and never sends page data, notes, or usage information to external servers (except for AI features which require API calls to Google's Gemini service).

## Data Collection

| Data Type | Stored? | Location | Purpose |
|-----------|---------|----------|---------|
| Favorites & hidden tools | Yes | `chrome.storage.local` | Store your popup preferences locally |
| Tool usage statistics | Yes | `chrome.storage.local` | Sort tools by usage frequency |
| Sticky notes | Yes | `chrome.storage.local` (per-site keys) | Persist your notes across sessions |
| Copy history | Yes | `chrome.storage.local` (per-domain keys) | Track clipboard history for quick access |
| AI settings & API keys | Yes | `chrome.storage.local` | Store your AI preferences and API keys |
| Bookmarks | Yes | `chrome.storage.local` | Store your bookmarks, folders, and tags |
| Text highlights | Yes | `chrome.storage.local` (per-site keys) | Persist highlighted text across sessions |
| Dark mode preferences | Yes | `chrome.storage.local` | Remember your theme preference |
| Onboarding completion status | Yes | `chrome.storage.local` | Track if user has completed the onboarding tour |
| Page content, colors, fonts, links | No (in-memory only) | N/A | Processed on demand, never persisted or transmitted |
| Diagnostic telemetry | No | N/A | Toolboard does not send analytics or crash reports |

### Sticky Notes
Notes are stored under keys prefixed with `toolaryStickyNotes_` in `chrome.storage.local`. Legacy keys (`stickyNotes_`) are migrated automatically. You can remove notes via the sticky notes manager or by clearing the associated keys in Chrome storage.

### AI Features
Toolboard includes AI-powered tools that use Google's Gemini API. When you use AI features:

- **Content Processing**: Selected text or page content is sent to Google's Gemini API for processing
- **API Keys**: Your Gemini API keys are encrypted using AES-GCM encryption and stored locally in `chrome.storage.local` - never shared
- **Secure Storage**: API keys are protected with industry-standard encryption before storage
- **No History Storage**: AI interactions are not stored locally - each request is processed independently
- **No Data Mining**: We do not collect, analyze, or monetize your AI interactions
- **User Control**: You can remove API keys at any time through the AI settings panel
- **API Endpoint**: `https://generativelanguage.googleapis.com/v1beta`

### Copy History Manager
The Copy History Manager tracks clipboard content per domain for quick access:

- **Domain Isolation**: Each website's copy history is stored separately
- **Local Storage Only**: Copy history never leaves your device
- **Automatic Cleanup**: History is limited to 50 items per domain
- **Manual Control**: You can clear history for specific domains or all domains

### Coffee Toast System
Toolboard displays coffee-themed messages after successful tool operations:

- **Message Data**: All messages are stored locally, never sent to external servers
- **Language Detection**: Your browser language is automatically detected
- **Button Interaction**: "Buy Me a Coffee" button redirects to https://buymeacoffee.com/ademisler
- **No Data Collection**: Toast interactions are not tracked or stored

### Onboarding System
Toolboard includes an interactive onboarding system for new users:

- **Completion Status**: Whether you've completed the onboarding tour is stored locally
- **No Personal Data**: The onboarding system only tracks completion status, not personal information
- **User Control**: You can restart the onboarding tour anytime through the settings
- **Local Storage**: Onboarding data stays on your device and is never transmitted

## Permissions Explained

Toolboard requests the following permissions to provide its full functionality:

### Core Permissions
- **`activeTab`** – Required to inject content scripts when you activate tools. This permission allows Toolboard to access the current tab's content only when you explicitly activate a tool.
- **`scripting`** – Needed to inject content scripts into web pages for tool functionality (element inspection, text extraction, etc.).
- **`storage`** – Used for all local data storage including favorites, settings, notes, and tool preferences.

### Clipboard Permissions
- **`clipboardWrite`** – Used by multiple tools to copy extracted content (colors, text, links, QR codes) to your clipboard.
- **`clipboardRead`** – Used by Copy History Manager to track clipboard content for quick access and history management.

### Tab Management
- **`tabs`** – Required for tab management, tool activation, and accessing tab information (title, URL, favicon) for bookmark management and site analysis.

### Download & Capture Permissions
- **`downloads`** – Used by capture tools (Screenshot Picker, Media Picker, Video Recorder, QR Code Generator) to save files locally to your device.
- **`tabCapture`** – Required specifically for Video Recorder tool to capture screen activity and browser tab content.

### Host Permissions
- **`<all_urls>`** – Required for content script injection on all websites. This allows Toolboard to work on any website you visit, but the extension only accesses page content when you explicitly activate a tool.

### Web Accessible Resources
Toolboard exposes the following resources to web pages:
- **Core modules** (`core/*.js`) – Essential functionality modules
- **Shared utilities** (`shared/*.js`) – Common helper functions
- **Tool modules** (`tools/*/*.js`) – Individual tool implementations
- **Configuration files** (`config/*.json`) – Tool metadata and settings
- **Icons and assets** (`icons/*.svg`) – UI icons and graphics
- **Localization files** (`_locales/*/messages.json`) – Multi-language support

### Permission Justification by Tool Category

#### Inspection Tools (Color Picker, Element Picker, Font Picker, Link Picker)
- **Required:** `activeTab`, `scripting`, `<all_urls>`
- **Purpose:** Access page DOM elements and CSS properties for analysis

#### Capture Tools (Screenshot, Media Picker, Text Picker, Video Recorder, QR Generator, PDF Generator)
- **Required:** `activeTab`, `scripting`, `downloads`, `tabCapture` (Video Recorder only), `<all_urls>`
- **Purpose:** Capture and download page content, media files, and generated content

#### Enhancement Tools (Sticky Notes, Text Highlighter, Reading Mode, Bookmark Manager, Dark Mode)
- **Required:** `activeTab`, `scripting`, `storage`, `tabs` (Bookmark Manager only), `<all_urls>`
- **Purpose:** Modify page appearance and manage user preferences

#### Utility Tools (Site Info Picker, Color Palette Generator, Copy History Manager)
- **Required:** `activeTab`, `scripting`, `clipboardRead`, `clipboardWrite`, `storage`, `<all_urls>`
- **Purpose:** Analyze site information and manage clipboard history

#### AI Tools (Text Summarizer, Translator, Content Detector, Email Generator, SEO Analyzer, AI Chat)
- **Required:** `activeTab`, `scripting`, `storage`, `<all_urls>`
- **Purpose:** Process page content with AI services (requires external API calls to Google Gemini)

### Security Considerations
- **No Background Access:** Toolboard only accesses page content when you explicitly activate a tool
- **Local Processing:** All data processing happens locally in your browser
- **No Data Transmission:** Except for AI features (which use your own API keys), no data is sent to external servers
- **Minimal Permissions:** Each permission is directly tied to specific tool functionality

## Third Parties

Toolboard does **not** rely on external services, trackers, or CDNs for core functionality. All code ships with the extension bundle and runs locally.

**Exceptions**:
- **AI Features**: AI-powered tools require API calls to Google's Gemini service when you choose to use AI features. These calls are made directly from your browser to Google's servers using your own API keys.
- **Coffee Support**: The coffee toast system includes a "Buy Me a Coffee" button that redirects to https://buymeacoffee.com/ademisler

## Data Security

- **Local Processing**: All data processing happens locally in your browser
- **Encrypted Storage**: Chrome's built-in storage encryption protects your data
- **Secure API Key Storage**: AI API keys are encrypted using AES-GCM encryption before storage
- **No Cloud Sync**: All data stays on your device - no cloud synchronization
- **API Key Protection**: Your AI API keys are stored locally and never transmitted to our servers

## User Controls

- Manage favorites, hidden tools, and notes directly inside the popup UI
- Remove AI API keys through the AI settings panel
- Clear copy history for specific domains or all domains via the Copy History Manager
- Clear bookmarks and highlights through their respective managers
- Clear Toolboard data via Chrome's extension storage management (`chrome://settings/siteData` → search "toolboard")
- Remove the extension at any time to delete all associated storage

## Data Retention

- **Local Storage**: All data remains on your device until manually cleared
- **No Sync Storage**: Toolboard does not use Chrome's sync storage - all data is stored locally
- **Copy History**: Automatically limited to 50 items per domain
- **Tool Usage**: Stored locally for sorting purposes
- **AI Interactions**: Not stored - each request is processed independently

## Updates

Updates are delivered through the Chrome Web Store. Each release is accompanied by changelog entries outlining new features or fixes.

## Contact

For privacy-related questions or issues please open an issue on the GitHub repository or reach out via https://ademisler.com.

Toolboard may revise this policy for future releases. The version number at the top of this document indicates the latest update.