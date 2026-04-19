# Toolboard

A comprehensive Chrome extension with 83 web productivity tools, including AI-powered features, a smart favorite system, converter suite, and coffee toast messages.

## 🚀 Features

### AI-Powered Tools
- **AI Summarizer** - Intelligent text summarization with multiple length options
- **AI Translator** - Real-time translation with in-place page translation
- **AI Content Detector** - Detect AI-generated content with detailed analysis
- **AI Email Generator** - Professional email generation with customizable tone and type
- **AI SEO Analyzer** - Comprehensive SEO analysis with AI-powered scoring
- **AI Chat** - Intelligent conversational interface with persistent page context awareness

### Inspection Tools
- **Color Picker** - Extract colors from any webpage element
- **Element Picker** - Inspect DOM elements and their properties
- **Font Picker** - Analyze fonts used on web pages
- **Link Picker** - Validate and analyze links

### Capture Tools
- **Screenshot Picker** - Capture full page or selected area screenshots
- **Text Picker** - Extract text from web pages
- **Media Picker** - Extract images and media from pages
- **PDF Generator** - Convert web pages to PDF
- **QR Code Generator** - Generate QR codes for URLs
- **Video Recorder** - Record screen activity

### Enhancement Tools
- **Sticky Notes** - Add persistent notes to web pages
- **Text Highlighter** - Highlight important text
- **Reading Mode** - Clean reading experience
- **Bookmark Manager** - Advanced bookmark management
- **Dark Mode Toggle** - Toggle dark/light themes

### Utility Tools
- **Site Info Picker** - Comprehensive website analysis
- **Color Palette Generator** - Generate color palettes from images
- **Copy History Manager** - Track and manage clipboard history with tab-specific monitoring

### Converter Tools
- **31 converter tools** including unit, currency, timezone, color, Unix time, base conversions, JSON/CSV/XML transforms, image/PDF/media converters, subtitle conversion, and more.

## 🎯 Key Features

- **AI Integration** - Powered by Google Gemini API with key rotation
- **Multi-language Support** - English, Turkish, French UI with 40+ AI languages
- **Smart Search** - Find tools quickly with intelligent search
- **⭐ Favorites System** - Mark frequently used tools as favorites with star icons and smart sorting
- **Smart Organization** - Tools organized by usage and favorites
- **83 Tools** - Broad toolkit across inspect, capture, enhance, utilities, AI, and converters
- **Dark/Light Themes** - Automatic theme switching
- **Responsive Design** - Works on all screen sizes
- **☕ Coffee Toast System** - Modern glassmorphism notifications with developer support

## 🛠️ Installation

1. Download the extension from Chrome Web Store
2. Click "Add to Chrome" to install
3. Pin the extension to your toolbar for easy access
4. Configure AI settings (optional) for AI-powered tools

## 🎮 Usage

1. **Open Toolboard** - Click the extension icon in your browser toolbar
2. **Search Tools** - Use the search bar to find specific tools
3. **Browse Categories** - Click category buttons to filter tools
4. **Mark Favorites** - Click the star icon on tool cards to mark as favorites
5. **Activate Tools** - Click on any tool card to activate it
6. **Configure AI** - Add API keys in settings for AI-powered tools

## 🎯 Simple Interface

**No Keyboard Shortcuts** - Toolboard uses a clean, simple interface where all tools are accessed through the popup. This eliminates complexity and makes the extension easier to use.

- **Click to Access** - Simply click the extension icon and select your tool
- **Search & Filter** - Find tools quickly using the search bar and category filters
- **Favorites** - Mark frequently used tools as favorites for quick access

## 🤖 AI Features

### AI Summarizer
- Extract and summarize page content automatically
- Three summary lengths: Short, Medium, Long
- Keyword extraction
- Multi-language support

### AI Translator
- Translate text, selections, or entire pages
- In-place translation (Google Translate style)
- Auto-detect source language
- 40+ target languages

### AI Content Detector
- Detect AI-generated content
- Multi-metric analysis (writing style, word choice, structure)
- Inline highlighting of suspicious sections
- Confidence scoring

### AI Email Generator
- Generate professional emails
- 5 tones: Professional, Friendly, Formal, Casual, Urgent
- 8 types: Inquiry, Follow-up, Thank you, Complaint, Request, Meeting, Introduction, Apology
- 3 lengths: Short, Medium, Long
- Auto-generated subject lines

### AI Chat
- Intelligent conversational interface
- Persistent page context awareness
- Multi-turn conversations
- Context-aware responses

## ⭐ Favorites System

Toolboard includes a comprehensive favorite system that enhances your productivity:

### Features
- **Star Icons** - Each tool card displays a star icon in the top-right corner
- **Smart Sorting** - Favorite tools always appear at the top of the list
- **Usage-Based Ordering** - Within favorites, tools are sorted by usage count
- **Persistent Storage** - Your favorites are saved and restored across sessions
- **Real-time Updates** - Clicking the star immediately toggles favorite status
- **Smooth Animations** - Grid reordering with CSS transitions for better UX

### How It Works
1. **Mark Favorites** - Click the star icon on any tool card
2. **Automatic Sorting** - Favorites appear first, sorted by usage among themselves
3. **Visual Feedback** - Empty star for non-favorites, filled white star for favorites
4. **Hover Effects** - Star grows and becomes more visible on hover

## ☕ Coffee Toast System

Toolboard includes a modern glassmorphism coffee toast system that displays humorous coffee-themed messages after successful tool operations:

### Features
- **Modern Glassmorphism Design** - Translucent glass effect with backdrop blur
- **Coffee-Themed Messages** - Humorous messages in Turkish, English, and French
- **Responsive Layout** - Horizontal layout with coffee emoji, centered text, and compact button
- **Smart Text Wrapping** - 5 words per line for optimal readability
- **Auto-Dismiss** - Messages automatically disappear after 6 seconds
- **Language Detection** - Automatically detects user's browser language
- **Buy Me a Coffee Integration** - Direct link to support the developer

## 🔧 Configuration

### AI Settings
- Add multiple Gemini API keys for load balancing
- Choose AI model preference (Auto/Smart/Lite)
- Select preferred language for AI responses
- Test API key health
- **Note**: AI interactions are not stored - each request is processed independently

### Tool Management
- Hide unused tools
- Mark tools as favorites with star icons
- Smart sorting: Favorites appear first, sorted by usage
- View tool usage statistics

## 🌐 Internationalization

- **UI Languages**: English, Turkish, French
- **AI Languages**: 40+ languages supported
- **Auto-detection**: Automatically detects browser language

## 🧪 Testing

The extension includes comprehensive testing:
- Jest test suites for core modules, manifest integrity, helpers, and tool activation paths
- Release-gate integrity tests for manifest module exports, i18n coverage, icon registration, and coffee message coverage
- ESLint code quality checks
- Manual testing checklist
- Test environment limitations noted for some tools
- Pre-publish checklist: [docs/release-checklist.md](docs/release-checklist.md)

## 📁 Project Structure

```
extension/
├── manifest.json              # Extension configuration
├── background.js              # Service worker
├── popup/                     # Main UI
├── content/                   # Content scripts
├── core/                      # Core modules
├── shared/                    # Shared utilities
├── tools/                     # Tool implementations
│   ├── inspect/              # Inspection tools
│   ├── capture/              # Capture tools
│   ├── enhance/              # Enhancement tools
│   ├── utilities/            # Utility tools
│   ├── converters/           # Conversion tools
│   ├── previewers/           # Structured preview tools
│   └── ai/                   # AI-powered tools
├── config/                    # Configuration files
├── icons/                     # Icon assets
└── _locales/                  # Internationalization
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Ensure all tests pass and coverage is maintained
7. Submit a pull request

## 🔒 Permissions & Privacy

Toolboard is designed with privacy-first principles. Here's what permissions are required and why:

### Required Permissions

| Permission | Purpose | Used By |
|------------|---------|---------|
| `activeTab` | Access current tab content when tools are activated | All tools |
| `scripting` | Inject content scripts for tool functionality | All tools |
| `storage` | Save user preferences, favorites, and settings | All tools |
| `clipboardWrite` | Copy extracted content to clipboard | Color Picker, Text Picker, Link Picker, QR Generator |
| `clipboardRead` | Track clipboard history for quick access | Copy History Manager |
| `tabs` | Access tab information for bookmark management | Bookmark Manager |
| `downloads` | Save captured content and generated files | Screenshot, Media Picker, Video Recorder, QR Generator |
| `tabCapture` | Record screen and tab content | Video Recorder |
| `<all_urls>` | Work on any website you visit | All tools |

### Privacy Guarantees

- ✅ **No Background Access** - Tools only activate when you click them
- ✅ **Local Processing** - All data processing happens in your browser
- ✅ **No Data Collection** - No analytics, tracking, or data mining
- ✅ **Your API Keys** - AI features use your own Gemini API keys
- ✅ **Local Storage Only** - All data stays on your device (no sync storage)

### Security Features

- **Explicit Activation** - Tools only access page content when you activate them
- **Minimal Permissions** - Each permission is directly tied to specific functionality
- **No External Dependencies** - All code runs locally, no CDNs or external scripts
- **Transparent Storage** - Clear documentation of what data is stored and where

For detailed privacy information, see our [Privacy Policy](docs/PRIVACY_POLICY.md).

## 📄 License

MIT License - see LICENSE file for details

## 👨‍💻 Author

**Adem İsler**
- GitHub: [@fulexo](https://github.com/fulexo)
- Repository: [toolboard](https://github.com/fulexo/toolary)

## 🔄 Version History

- **v2.0.0** - Enhanced release with major UX, AI, onboarding, secure storage, and favorites improvements
- **v2.x** - Expanded toolkit to 83 tools with a comprehensive converters category and UI/system-wide quality upgrades

---

**Toolboard** - Enhancing your web productivity with AI-powered tools and modern design! 🚀☕
