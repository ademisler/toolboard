// Test file for all picker modules
describe('Picker Modules', () => {
  
  describe('Color Picker', () => {
    test('should activate color picker', async () => {
      const { activate } = await import('../extension/tools/inspect/colorPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Element Picker', () => {
    test('should activate element picker', async () => {
      const { activate } = await import('../extension/tools/inspect/elementPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Screenshot Picker', () => {
    test('should activate screenshot picker', async () => {
      const { activate } = await import('../extension/tools/capture/screenshotPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Text Picker', () => {
    test('should activate text picker', async () => {
      const { activate } = await import('../extension/tools/capture/textPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Link Picker', () => {
    test('should activate link picker', async () => {
      const { activate } = await import('../extension/tools/inspect/linkPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Font Picker', () => {
    test('should activate font picker', async () => {
      const { activate } = await import('../extension/tools/inspect/fontPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Media Picker', () => {
    test('should activate media picker', async () => {
      const { activate } = await import('../extension/tools/capture/mediaPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Site Info Picker', () => {
    test('should activate site info picker', async () => {
      const { activate } = await import('../extension/tools/utilities/siteInfoPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Sticky Notes Picker', () => {
    test('should activate sticky notes picker', async () => {
      const { activate } = await import('../extension/tools/enhance/stickyNotesPicker.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });
  });

  describe('Color Palette Generator', () => {
    test('should activate color palette generator', async () => {
      const { activate } = await import('../extension/tools/utilities/colorPaletteGenerator.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', async () => {
      const { metadata } = await import('../extension/tools/utilities/colorPaletteGenerator.js');
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('color-palette-generator');
      expect(metadata.name).toBe('Color Palette Generator');
      expect(metadata.category).toBe('utilities');
    });
  });

  describe('PDF Generator', () => {
    test('should activate PDF generator', async () => {
      const { activate } = await import('../extension/tools/capture/pdfGenerator.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', async () => {
      const { metadata } = await import('../extension/tools/capture/pdfGenerator.js');
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('pdf-generator');
      expect(metadata.name).toBe('PDF Generator');
      expect(metadata.category).toBe('capture');
    });
  });

  describe('Text Highlighter', () => {
    test('should activate text highlighter', async () => {
      const { activate } = await import('../extension/tools/enhance/textHighlighter.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', async () => {
      const { metadata } = await import('../extension/tools/enhance/textHighlighter.js');
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('text-highlighter');
      expect(metadata.name).toBe('Text Highlighter');
      expect(metadata.category).toBe('enhance');
    });
  });

  describe('QR Code Generator', () => {
    test('should activate QR code generator', async () => {
      const { activate } = await import('../extension/tools/capture/qrCodeGenerator.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', async () => {
      const { metadata } = await import('../extension/tools/capture/qrCodeGenerator.js');
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('qr-code-generator');
      expect(metadata.name).toBe('QR Code Generator');
      expect(metadata.category).toBe('capture');
    });
  });

  describe('Bookmark Manager', () => {
    test('should activate bookmark manager', async () => {
      const { activate } = await import('../extension/tools/enhance/bookmarkManager.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', async () => {
      const { metadata } = await import('../extension/tools/enhance/bookmarkManager.js');
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('bookmark-manager');
      expect(metadata.name).toBe('Bookmark Manager');
      expect(metadata.category).toBe('enhance');
    });
  });

  describe('Video Recorder', () => {
    test('should activate video recorder', async () => {
      const { activate } = await import('../extension/tools/capture/videoRecorder.js');
      const mockDeactivate = jest.fn();
      
      expect(() => activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', async () => {
      const { metadata } = await import('../extension/tools/capture/videoRecorder.js');
      
      expect(metadata).toBeDefined();
      expect(metadata.id).toBe('video-recorder');
      expect(metadata.name).toBe('Video Recorder');
      expect(metadata.category).toBe('capture');
    });
  });

  describe('Dark Mode Toggle', () => {
    let darkModeModule;

    beforeAll(async () => {
      darkModeModule = await import('../extension/tools/enhance/darkModeToggle.js');
    });

    test('should activate dark mode toggle', () => {
      const mockDeactivate = jest.fn();
      
      expect(() => darkModeModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(darkModeModule.metadata).toBeDefined();
      expect(darkModeModule.metadata.id).toBe('dark-mode-toggle');
      expect(darkModeModule.metadata.name).toBe('Dark Mode Toggle');
      expect(darkModeModule.metadata.category).toBe('enhance');
    });
  });

  describe('AI Text Summarizer', () => {
    let textSummarizerModule;

    beforeAll(async () => {
      textSummarizerModule = await import('../extension/tools/ai/textSummarizer.js');
    });

    test('should activate AI text summarizer', async () => {
      const mockDeactivate = jest.fn();
      
      expect(() => textSummarizerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(textSummarizerModule.metadata).toBeDefined();
      expect(textSummarizerModule.metadata.id).toBe('ai-text-summarizer');
      expect(textSummarizerModule.metadata.name).toBe('AI Summarizer');
      expect(textSummarizerModule.metadata.category).toBe('ai');
      expect(textSummarizerModule.metadata.icon).toBe('brain');
    });
  });

  describe('AI Text Translator', () => {
    let textTranslatorModule;

    beforeAll(async () => {
      textTranslatorModule = await import('../extension/tools/ai/textTranslator.js');
    });

    test('should activate AI text translator', async () => {
      const mockDeactivate = jest.fn();
      
      expect(() => textTranslatorModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(textTranslatorModule.metadata).toBeDefined();
      expect(textTranslatorModule.metadata.id).toBe('ai-text-translator');
      expect(textTranslatorModule.metadata.name).toBe('AI Translator');
      expect(textTranslatorModule.metadata.category).toBe('ai');
      expect(textTranslatorModule.metadata.icon).toBe('languages');
    });

    test('should deactivate without errors', () => {
      expect(() => textTranslatorModule.deactivate()).not.toThrow();
    });
  });

  describe('AI Content Detector', () => {
    let contentDetectorModule;

    beforeAll(async () => {
      contentDetectorModule = await import('../extension/tools/ai/contentDetector.js');
    });

    test('should have correct metadata', () => {
      expect(contentDetectorModule.metadata).toBeDefined();
      expect(contentDetectorModule.metadata.id).toBe('ai-content-detector');
      expect(contentDetectorModule.metadata.name).toBe('AI Content Detector');
      expect(contentDetectorModule.metadata.category).toBe('ai');
      expect(contentDetectorModule.metadata.icon).toBe('sparkles');
    });

    test('should deactivate without errors', () => {
      expect(() => contentDetectorModule.deactivate()).not.toThrow();
    });
  });

  describe('AI Email Generator', () => {
    let emailGeneratorModule;

    beforeAll(async () => {
      emailGeneratorModule = await import('../extension/tools/ai/emailGenerator.js');
    });

    test('should have correct metadata', () => {
      expect(emailGeneratorModule.metadata).toBeDefined();
      expect(emailGeneratorModule.metadata.id).toBe('ai-email-generator');
      expect(emailGeneratorModule.metadata.name).toBe('AI Email Generator');
      expect(emailGeneratorModule.metadata.category).toBe('ai');
      expect(emailGeneratorModule.metadata.icon).toBe('email');
    });

    test('should deactivate without errors', () => {
      expect(() => emailGeneratorModule.deactivate()).not.toThrow();
    });
  });

  describe('AI SEO Analyzer', () => {
    let seoAnalyzerModule;

    beforeAll(async () => {
      seoAnalyzerModule = await import('../extension/tools/ai/seoAnalyzer.js');
    });

    test('should have correct metadata', () => {
      expect(seoAnalyzerModule.metadata).toBeDefined();
      expect(seoAnalyzerModule.metadata.id).toBe('ai-seo-analyzer');
      expect(seoAnalyzerModule.metadata.name).toBe('AI SEO Analyzer');
      expect(seoAnalyzerModule.metadata.category).toBe('ai');
      expect(seoAnalyzerModule.metadata.icon).toBe('search-check');
    });

    test('should deactivate without errors', () => {
      expect(() => seoAnalyzerModule.deactivate()).not.toThrow();
    });
  });

  describe('AI Chat', () => {
    let aiChatModule;

    beforeAll(async () => {
      aiChatModule = await import('../extension/tools/ai/aiChat.js');
    });

    test('should have correct metadata', () => {
      expect(aiChatModule.metadata).toBeDefined();
      expect(aiChatModule.metadata.id).toBe('ai-chat');
      expect(aiChatModule.metadata.name).toBe('AI Chat');
      expect(aiChatModule.metadata.category).toBe('ai');
      expect(aiChatModule.metadata.icon).toBe('message');
    });

    test('should deactivate without errors', () => {
      expect(() => aiChatModule.deactivate()).not.toThrow();
    });
  });

  describe('Copy History Manager', () => {
    let copyHistoryManagerModule;

    beforeAll(async () => {
      copyHistoryManagerModule = await import('../extension/tools/utilities/copyHistoryManager.js');
    });

    test('should activate copy history manager', async () => {
      const mockDeactivate = jest.fn();
      
      expect(() => copyHistoryManagerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(copyHistoryManagerModule.metadata).toBeDefined();
      expect(copyHistoryManagerModule.metadata.id).toBe('copy-history-manager');
      expect(copyHistoryManagerModule.metadata.name).toBe('Copy History Manager');
      expect(copyHistoryManagerModule.metadata.category).toBe('utilities');
      expect(copyHistoryManagerModule.metadata.icon).toBe('clipboard-list');
    });

    test('should deactivate without errors', () => {
      expect(() => copyHistoryManagerModule.deactivate()).not.toThrow();
    });
  });

  describe('Unit Converter', () => {
    let unitConverterModule;

    beforeAll(async () => {
      unitConverterModule = await import('../extension/tools/converters/unitConverter.js');
    });

    test('should activate unit converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => unitConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(unitConverterModule.metadata).toBeDefined();
      expect(unitConverterModule.metadata.id).toBe('unit-converter');
      expect(unitConverterModule.metadata.name).toBe('Unit Converter');
      expect(unitConverterModule.metadata.category).toBe('converters');
      expect(unitConverterModule.metadata.icon).toBe('wrench');
    });

    test('should deactivate without errors', () => {
      expect(() => unitConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Currency Converter', () => {
    let currencyConverterModule;

    beforeAll(async () => {
      currencyConverterModule = await import('../extension/tools/converters/currencyConverter.js');
    });

    test('should activate currency converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => currencyConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(currencyConverterModule.metadata).toBeDefined();
      expect(currencyConverterModule.metadata.id).toBe('currency-converter');
      expect(currencyConverterModule.metadata.name).toBe('Currency Converter');
      expect(currencyConverterModule.metadata.category).toBe('converters');
      expect(currencyConverterModule.metadata.icon).toBe('tag');
    });

    test('should deactivate without errors', () => {
      expect(() => currencyConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Time Zone Converter', () => {
    let timeZoneConverterModule;

    beforeAll(async () => {
      timeZoneConverterModule = await import('../extension/tools/converters/timeZoneConverter.js');
    });

    test('should activate time zone converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => timeZoneConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(timeZoneConverterModule.metadata).toBeDefined();
      expect(timeZoneConverterModule.metadata.id).toBe('time-zone-converter');
      expect(timeZoneConverterModule.metadata.name).toBe('Time Zone Converter');
      expect(timeZoneConverterModule.metadata.category).toBe('converters');
      expect(timeZoneConverterModule.metadata.icon).toBe('site');
    });

    test('should deactivate without errors', () => {
      expect(() => timeZoneConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Color Converter', () => {
    let colorConverterModule;

    beforeAll(async () => {
      colorConverterModule = await import('../extension/tools/converters/colorConverter.js');
    });

    test('should activate color converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => colorConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(colorConverterModule.metadata).toBeDefined();
      expect(colorConverterModule.metadata.id).toBe('color-converter');
      expect(colorConverterModule.metadata.name).toBe('Color Converter');
      expect(colorConverterModule.metadata.category).toBe('converters');
      expect(colorConverterModule.metadata.icon).toBe('palette');
    });

    test('should deactivate without errors', () => {
      expect(() => colorConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Unix Time Converter', () => {
    let unixTimeConverterModule;

    beforeAll(async () => {
      unixTimeConverterModule = await import('../extension/tools/converters/unixTimeConverter.js');
    });

    test('should activate unix time converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => unixTimeConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(unixTimeConverterModule.metadata).toBeDefined();
      expect(unixTimeConverterModule.metadata.id).toBe('unix-time-converter');
      expect(unixTimeConverterModule.metadata.name).toBe('Unix Time Converter');
      expect(unixTimeConverterModule.metadata.category).toBe('converters');
      expect(unixTimeConverterModule.metadata.icon).toBe('file-text');
    });

    test('should deactivate without errors', () => {
      expect(() => unixTimeConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Number Base Converter', () => {
    let numberBaseConverterModule;

    beforeAll(async () => {
      numberBaseConverterModule = await import('../extension/tools/converters/numberBaseConverter.js');
    });

    test('should activate number base converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => numberBaseConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(numberBaseConverterModule.metadata).toBeDefined();
      expect(numberBaseConverterModule.metadata.id).toBe('number-base-converter');
      expect(numberBaseConverterModule.metadata.name).toBe('Number Base Converter');
      expect(numberBaseConverterModule.metadata.category).toBe('converters');
      expect(numberBaseConverterModule.metadata.icon).toBe('binary');
    });

    test('should deactivate without errors', () => {
      expect(() => numberBaseConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Base64 Converter', () => {
    let base64ConverterModule;

    beforeAll(async () => {
      base64ConverterModule = await import('../extension/tools/converters/base64Converter.js');
    });

    test('should activate base64 converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => base64ConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(base64ConverterModule.metadata).toBeDefined();
      expect(base64ConverterModule.metadata.id).toBe('base64-converter');
      expect(base64ConverterModule.metadata.name).toBe('Base64 Encode/Decode');
      expect(base64ConverterModule.metadata.category).toBe('converters');
      expect(base64ConverterModule.metadata.icon).toBe('braces');
    });

    test('should deactivate without errors', () => {
      expect(() => base64ConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('URL Converter', () => {
    let urlConverterModule;

    beforeAll(async () => {
      urlConverterModule = await import('../extension/tools/converters/urlConverter.js');
    });

    test('should activate url converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => urlConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(urlConverterModule.metadata).toBeDefined();
      expect(urlConverterModule.metadata.id).toBe('url-converter');
      expect(urlConverterModule.metadata.name).toBe('URL Encode/Decode');
      expect(urlConverterModule.metadata.category).toBe('converters');
      expect(urlConverterModule.metadata.icon).toBe('link-code');
    });

    test('should deactivate without errors', () => {
      expect(() => urlConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Case Converter', () => {
    let caseConverterModule;

    beforeAll(async () => {
      caseConverterModule = await import('../extension/tools/converters/caseConverter.js');
    });

    test('should activate case converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => caseConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(caseConverterModule.metadata).toBeDefined();
      expect(caseConverterModule.metadata.id).toBe('case-converter');
      expect(caseConverterModule.metadata.name).toBe('Case Converter');
      expect(caseConverterModule.metadata.category).toBe('converters');
      expect(caseConverterModule.metadata.icon).toBe('text-case');
    });

    test('should deactivate without errors', () => {
      expect(() => caseConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Markdown HTML Converter', () => {
    let markdownHtmlConverterModule;

    beforeAll(async () => {
      markdownHtmlConverterModule = await import('../extension/tools/converters/markdownHtmlConverter.js');
    });

    test('should activate markdown html converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => markdownHtmlConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(markdownHtmlConverterModule.metadata).toBeDefined();
      expect(markdownHtmlConverterModule.metadata.id).toBe('markdown-html-converter');
      expect(markdownHtmlConverterModule.metadata.name).toBe('Markdown ↔ HTML Converter');
      expect(markdownHtmlConverterModule.metadata.category).toBe('converters');
      expect(markdownHtmlConverterModule.metadata.icon).toBe('markdown-html');
    });

    test('should deactivate without errors', () => {
      expect(() => markdownHtmlConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('HTML Entity Converter', () => {
    let htmlEntityConverterModule;

    beforeAll(async () => {
      htmlEntityConverterModule = await import('../extension/tools/converters/htmlEntityConverter.js');
    });

    test('should activate html entity converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => htmlEntityConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(htmlEntityConverterModule.metadata).toBeDefined();
      expect(htmlEntityConverterModule.metadata.id).toBe('html-entity-converter');
      expect(htmlEntityConverterModule.metadata.name).toBe('HTML Entity Encode/Decode');
      expect(htmlEntityConverterModule.metadata.category).toBe('converters');
      expect(htmlEntityConverterModule.metadata.icon).toBe('entity-code');
    });

    test('should deactivate without errors', () => {
      expect(() => htmlEntityConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Text to Slug Converter', () => {
    let textToSlugConverterModule;

    beforeAll(async () => {
      textToSlugConverterModule = await import('../extension/tools/converters/textToSlugConverter.js');
    });

    test('should activate text to slug converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => textToSlugConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(textToSlugConverterModule.metadata).toBeDefined();
      expect(textToSlugConverterModule.metadata.id).toBe('text-to-slug-converter');
      expect(textToSlugConverterModule.metadata.name).toBe('Text to Slug');
      expect(textToSlugConverterModule.metadata.category).toBe('converters');
      expect(textToSlugConverterModule.metadata.icon).toBe('slug');
    });

    test('should deactivate without errors', () => {
      expect(() => textToSlugConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('UUID Converter', () => {
    let uuidConverterModule;

    beforeAll(async () => {
      uuidConverterModule = await import('../extension/tools/converters/uuidConverter.js');
    });

    test('should activate uuid converter', () => {
      const mockDeactivate = jest.fn();
      expect(() => uuidConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(uuidConverterModule.metadata).toBeDefined();
      expect(uuidConverterModule.metadata.id).toBe('uuid-converter');
      expect(uuidConverterModule.metadata.name).toBe('UUID Generator/Validator');
      expect(uuidConverterModule.metadata.category).toBe('converters');
      expect(uuidConverterModule.metadata.icon).toBe('uuid');
    });

    test('should deactivate without errors', () => {
      expect(() => uuidConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Hash Generator', () => {
    let hashGeneratorModule;

    beforeAll(async () => {
      hashGeneratorModule = await import('../extension/tools/converters/hashGenerator.js');
    });

    test('should activate hash generator', () => {
      const mockDeactivate = jest.fn();

      expect(() => hashGeneratorModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(hashGeneratorModule.metadata).toBeDefined();
      expect(hashGeneratorModule.metadata.id).toBe('hash-generator');
      expect(hashGeneratorModule.metadata.name).toBe('Hash Generator');
      expect(hashGeneratorModule.metadata.category).toBe('converters');
      expect(hashGeneratorModule.metadata.icon).toBe('hash');
    });

    test('should deactivate without errors', () => {
      expect(() => hashGeneratorModule.deactivate()).not.toThrow();
    });
  });

  describe('JWT Decoder', () => {
    let jwtDecoderModule;

    beforeAll(async () => {
      jwtDecoderModule = await import('../extension/tools/converters/jwtDecoder.js');
    });

    test('should activate jwt decoder', () => {
      const mockDeactivate = jest.fn();

      expect(() => jwtDecoderModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(jwtDecoderModule.metadata).toBeDefined();
      expect(jwtDecoderModule.metadata.id).toBe('jwt-decoder');
      expect(jwtDecoderModule.metadata.name).toBe('JWT Decoder');
      expect(jwtDecoderModule.metadata.category).toBe('converters');
      expect(jwtDecoderModule.metadata.icon).toBe('jwt-token');
    });

    test('should deactivate without errors', () => {
      expect(() => jwtDecoderModule.deactivate()).not.toThrow();
    });
  });

  describe('JSON YAML Converter', () => {
    let jsonYamlConverterModule;

    beforeAll(async () => {
      jsonYamlConverterModule = await import('../extension/tools/converters/jsonYamlConverter.js');
    });

    test('should activate json yaml converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => jsonYamlConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(jsonYamlConverterModule.metadata).toBeDefined();
      expect(jsonYamlConverterModule.metadata.id).toBe('json-yaml-converter');
      expect(jsonYamlConverterModule.metadata.name).toBe('JSON ↔ YAML Converter');
      expect(jsonYamlConverterModule.metadata.category).toBe('converters');
      expect(jsonYamlConverterModule.metadata.icon).toBe('json-yaml');
    });

    test('should deactivate without errors', () => {
      expect(() => jsonYamlConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('CSV JSON Converter', () => {
    let csvJsonConverterModule;

    beforeAll(async () => {
      csvJsonConverterModule = await import('../extension/tools/converters/csvJsonConverter.js');
    });

    test('should activate csv json converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => csvJsonConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(csvJsonConverterModule.metadata).toBeDefined();
      expect(csvJsonConverterModule.metadata.id).toBe('csv-json-converter');
      expect(csvJsonConverterModule.metadata.name).toBe('CSV ↔ JSON Converter');
      expect(csvJsonConverterModule.metadata.category).toBe('converters');
      expect(csvJsonConverterModule.metadata.icon).toBe('table-arrows');
    });

    test('should deactivate without errors', () => {
      expect(() => csvJsonConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('XML JSON Converter', () => {
    let xmlJsonConverterModule;

    beforeAll(async () => {
      xmlJsonConverterModule = await import('../extension/tools/converters/xmlJsonConverter.js');
    });

    test('should activate xml json converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => xmlJsonConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(xmlJsonConverterModule.metadata).toBeDefined();
      expect(xmlJsonConverterModule.metadata.id).toBe('xml-json-converter');
      expect(xmlJsonConverterModule.metadata.name).toBe('XML ↔ JSON Converter');
      expect(xmlJsonConverterModule.metadata.category).toBe('converters');
      expect(xmlJsonConverterModule.metadata.icon).toBe('xml-json');
    });

    test('should deactivate without errors', () => {
      expect(() => xmlJsonConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Image Format Converter', () => {
    let imageFormatConverterModule;

    beforeAll(async () => {
      imageFormatConverterModule = await import('../extension/tools/converters/imageFormatConverter.js');
    });

    test('should activate image format converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => imageFormatConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(imageFormatConverterModule.metadata).toBeDefined();
      expect(imageFormatConverterModule.metadata.id).toBe('image-format-converter');
      expect(imageFormatConverterModule.metadata.name).toBe('Image Format Converter');
      expect(imageFormatConverterModule.metadata.category).toBe('converters');
      expect(imageFormatConverterModule.metadata.icon).toBe('image-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => imageFormatConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Image Resizer Compressor', () => {
    let imageResizerCompressorModule;

    beforeAll(async () => {
      imageResizerCompressorModule = await import('../extension/tools/converters/imageResizerCompressor.js');
    });

    test('should activate image resizer compressor', () => {
      const mockDeactivate = jest.fn();

      expect(() => imageResizerCompressorModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(imageResizerCompressorModule.metadata).toBeDefined();
      expect(imageResizerCompressorModule.metadata.id).toBe('image-resizer-compressor');
      expect(imageResizerCompressorModule.metadata.name).toBe('Image Resizer/Compressor');
      expect(imageResizerCompressorModule.metadata.category).toBe('converters');
      expect(imageResizerCompressorModule.metadata.icon).toBe('resize-compress');
    });

    test('should deactivate without errors', () => {
      expect(() => imageResizerCompressorModule.deactivate()).not.toThrow();
    });
  });

  describe('SVG to PNG Converter', () => {
    let svgToPngConverterModule;

    beforeAll(async () => {
      svgToPngConverterModule = await import('../extension/tools/converters/svgToPngConverter.js');
    });

    test('should activate svg to png converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => svgToPngConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(svgToPngConverterModule.metadata).toBeDefined();
      expect(svgToPngConverterModule.metadata.id).toBe('svg-to-png-converter');
      expect(svgToPngConverterModule.metadata.name).toBe('SVG to PNG Converter');
      expect(svgToPngConverterModule.metadata.category).toBe('converters');
      expect(svgToPngConverterModule.metadata.icon).toBe('svg-png');
    });

    test('should deactivate without errors', () => {
      expect(() => svgToPngConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('HEIC Converter', () => {
    let heicConverterModule;

    beforeAll(async () => {
      heicConverterModule = await import('../extension/tools/converters/heicConverter.js');
    });

    test('should activate HEIC converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => heicConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(heicConverterModule.metadata).toBeDefined();
      expect(heicConverterModule.metadata.id).toBe('heic-converter');
      expect(heicConverterModule.metadata.name).toBe('HEIC to JPG/PNG');
      expect(heicConverterModule.metadata.category).toBe('converters');
      expect(heicConverterModule.metadata.icon).toBe('heic-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => heicConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('PDF to Image Converter', () => {
    let pdfToImageConverterModule;

    beforeAll(async () => {
      pdfToImageConverterModule = await import('../extension/tools/converters/pdfToImageConverter.js');
    });

    test('should activate pdf to image converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => pdfToImageConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(pdfToImageConverterModule.metadata).toBeDefined();
      expect(pdfToImageConverterModule.metadata.id).toBe('pdf-to-image-converter');
      expect(pdfToImageConverterModule.metadata.name).toBe('PDF to Image');
      expect(pdfToImageConverterModule.metadata.category).toBe('converters');
      expect(pdfToImageConverterModule.metadata.icon).toBe('pdf-image');
    });

    test('should deactivate without errors', () => {
      expect(() => pdfToImageConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Image to PDF Converter', () => {
    let imageToPdfConverterModule;

    beforeAll(async () => {
      imageToPdfConverterModule = await import('../extension/tools/converters/imageToPdfConverter.js');
    });

    test('should activate image to pdf converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => imageToPdfConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(imageToPdfConverterModule.metadata).toBeDefined();
      expect(imageToPdfConverterModule.metadata.id).toBe('image-to-pdf-converter');
      expect(imageToPdfConverterModule.metadata.name).toBe('Image to PDF');
      expect(imageToPdfConverterModule.metadata.category).toBe('converters');
      expect(imageToPdfConverterModule.metadata.icon).toBe('image-pdf');
    });

    test('should deactivate without errors', () => {
      expect(() => imageToPdfConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('PDF Merge Split Converter', () => {
    let pdfMergeSplitConverterModule;

    beforeAll(async () => {
      pdfMergeSplitConverterModule = await import('../extension/tools/converters/pdfMergeSplitConverter.js');
    });

    test('should activate pdf merge split converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => pdfMergeSplitConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(pdfMergeSplitConverterModule.metadata).toBeDefined();
      expect(pdfMergeSplitConverterModule.metadata.id).toBe('pdf-merge-split-converter');
      expect(pdfMergeSplitConverterModule.metadata.name).toBe('PDF Merge/Split');
      expect(pdfMergeSplitConverterModule.metadata.category).toBe('converters');
      expect(pdfMergeSplitConverterModule.metadata.icon).toBe('pdf-merge');
    });

    test('should deactivate without errors', () => {
      expect(() => pdfMergeSplitConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('PDF Compress Converter', () => {
    let pdfCompressConverterModule;

    beforeAll(async () => {
      pdfCompressConverterModule = await import('../extension/tools/converters/pdfCompressConverter.js');
    });

    test('should activate pdf compress converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => pdfCompressConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(pdfCompressConverterModule.metadata).toBeDefined();
      expect(pdfCompressConverterModule.metadata.id).toBe('pdf-compress-converter');
      expect(pdfCompressConverterModule.metadata.name).toBe('PDF Compress');
      expect(pdfCompressConverterModule.metadata.category).toBe('converters');
      expect(pdfCompressConverterModule.metadata.icon).toBe('pdf-compress');
    });

    test('should deactivate without errors', () => {
      expect(() => pdfCompressConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('QR Text Converter', () => {
    let qrTextConverterModule;

    beforeAll(async () => {
      qrTextConverterModule = await import('../extension/tools/converters/qrTextConverter.js');
    });

    test('should activate qr text converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => qrTextConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(qrTextConverterModule.metadata).toBeDefined();
      expect(qrTextConverterModule.metadata.id).toBe('qr-text-converter');
      expect(qrTextConverterModule.metadata.name).toBe('QR Text Converter');
      expect(qrTextConverterModule.metadata.category).toBe('converters');
      expect(qrTextConverterModule.metadata.icon).toBe('qr-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => qrTextConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Audio Format Converter', () => {
    let audioFormatConverterModule;

    beforeAll(async () => {
      audioFormatConverterModule = await import('../extension/tools/converters/audioFormatConverter.js');
    });

    test('should activate audio format converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => audioFormatConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(audioFormatConverterModule.metadata).toBeDefined();
      expect(audioFormatConverterModule.metadata.id).toBe('audio-format-converter');
      expect(audioFormatConverterModule.metadata.name).toBe('Audio Format Converter');
      expect(audioFormatConverterModule.metadata.category).toBe('converters');
      expect(audioFormatConverterModule.metadata.icon).toBe('audio-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => audioFormatConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Video Format Converter', () => {
    let videoFormatConverterModule;

    beforeAll(async () => {
      videoFormatConverterModule = await import('../extension/tools/converters/videoFormatConverter.js');
    });

    test('should activate video format converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => videoFormatConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(videoFormatConverterModule.metadata).toBeDefined();
      expect(videoFormatConverterModule.metadata.id).toBe('video-format-converter');
      expect(videoFormatConverterModule.metadata.name).toBe('Video Format Converter');
      expect(videoFormatConverterModule.metadata.category).toBe('converters');
      expect(videoFormatConverterModule.metadata.icon).toBe('video-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => videoFormatConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Subtitle Converter', () => {
    let subtitleConverterModule;

    beforeAll(async () => {
      subtitleConverterModule = await import('../extension/tools/converters/subtitleConverter.js');
    });

    test('should activate subtitle converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => subtitleConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(subtitleConverterModule.metadata).toBeDefined();
      expect(subtitleConverterModule.metadata.id).toBe('subtitle-converter');
      expect(subtitleConverterModule.metadata.name).toBe('Subtitle Converter');
      expect(subtitleConverterModule.metadata.category).toBe('converters');
      expect(subtitleConverterModule.metadata.icon).toBe('subtitle-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => subtitleConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('Roman Numeral Converter', () => {
    let romanNumeralConverterModule;

    beforeAll(async () => {
      romanNumeralConverterModule = await import('../extension/tools/converters/romanNumeralConverter.js');
    });

    test('should activate roman numeral converter', () => {
      const mockDeactivate = jest.fn();

      expect(() => romanNumeralConverterModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(romanNumeralConverterModule.metadata).toBeDefined();
      expect(romanNumeralConverterModule.metadata.id).toBe('roman-numeral-converter');
      expect(romanNumeralConverterModule.metadata.name).toBe('Roman Numeral Converter');
      expect(romanNumeralConverterModule.metadata.category).toBe('converters');
      expect(romanNumeralConverterModule.metadata.icon).toBe('roman-convert');
    });

    test('should deactivate without errors', () => {
      expect(() => romanNumeralConverterModule.deactivate()).not.toThrow();
    });
  });

  describe('JSON Previewer', () => {
    let jsonPreviewerModule;

    beforeAll(async () => {
      jsonPreviewerModule = await import('../extension/tools/previewers/jsonPreviewer.js');
    });

    test('should activate json previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => jsonPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(jsonPreviewerModule.metadata).toBeDefined();
      expect(jsonPreviewerModule.metadata.id).toBe('json-previewer');
      expect(jsonPreviewerModule.metadata.category).toBe('previewers');
      expect(jsonPreviewerModule.metadata.icon).toBe('json-tree');
    });

    test('should deactivate without errors', () => {
      expect(() => jsonPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('CSV/TSV Previewer', () => {
    let csvTsvPreviewerModule;

    beforeAll(async () => {
      csvTsvPreviewerModule = await import('../extension/tools/previewers/csvTsvPreviewer.js');
    });

    test('should activate csv/tsv previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => csvTsvPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(csvTsvPreviewerModule.metadata).toBeDefined();
      expect(csvTsvPreviewerModule.metadata.id).toBe('csv-tsv-previewer');
      expect(csvTsvPreviewerModule.metadata.category).toBe('previewers');
      expect(csvTsvPreviewerModule.metadata.icon).toBe('table-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => csvTsvPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('Markdown Previewer', () => {
    let markdownPreviewerModule;

    beforeAll(async () => {
      markdownPreviewerModule = await import('../extension/tools/previewers/markdownPreviewer.js');
    });

    test('should activate markdown previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => markdownPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(markdownPreviewerModule.metadata).toBeDefined();
      expect(markdownPreviewerModule.metadata.id).toBe('markdown-previewer');
      expect(markdownPreviewerModule.metadata.category).toBe('previewers');
      expect(markdownPreviewerModule.metadata.icon).toBe('markdown-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => markdownPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('XML Previewer', () => {
    let xmlPreviewerModule;

    beforeAll(async () => {
      xmlPreviewerModule = await import('../extension/tools/previewers/xmlPreviewer.js');
    });

    test('should activate xml previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => xmlPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(xmlPreviewerModule.metadata).toBeDefined();
      expect(xmlPreviewerModule.metadata.id).toBe('xml-previewer');
      expect(xmlPreviewerModule.metadata.category).toBe('previewers');
      expect(xmlPreviewerModule.metadata.icon).toBe('xml-tree');
    });

    test('should deactivate without errors', () => {
      expect(() => xmlPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('PDF Preview Inspector', () => {
    let pdfPreviewInspectorModule;

    beforeAll(async () => {
      pdfPreviewInspectorModule = await import('../extension/tools/previewers/pdfPreviewInspector.js');
    });

    test('should activate pdf preview inspector', () => {
      const mockDeactivate = jest.fn();
      expect(() => pdfPreviewInspectorModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(pdfPreviewInspectorModule.metadata).toBeDefined();
      expect(pdfPreviewInspectorModule.metadata.id).toBe('pdf-preview-inspector');
      expect(pdfPreviewInspectorModule.metadata.category).toBe('previewers');
      expect(pdfPreviewInspectorModule.metadata.icon).toBe('pdf-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => pdfPreviewInspectorModule.deactivate()).not.toThrow();
    });
  });

  describe('Image Preview Inspector', () => {
    let imagePreviewInspectorModule;

    beforeAll(async () => {
      imagePreviewInspectorModule = await import('../extension/tools/previewers/imagePreviewInspector.js');
    });

    test('should activate image preview inspector', () => {
      const mockDeactivate = jest.fn();
      expect(() => imagePreviewInspectorModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(imagePreviewInspectorModule.metadata).toBeDefined();
      expect(imagePreviewInspectorModule.metadata.id).toBe('image-preview-inspector');
      expect(imagePreviewInspectorModule.metadata.category).toBe('previewers');
      expect(imagePreviewInspectorModule.metadata.icon).toBe('image-inspector');
    });

    test('should deactivate without errors', () => {
      expect(() => imagePreviewInspectorModule.deactivate()).not.toThrow();
    });
  });

  describe('OpenGraph Meta Previewer', () => {
    let openGraphMetaPreviewerModule;

    beforeAll(async () => {
      openGraphMetaPreviewerModule = await import('../extension/tools/previewers/openGraphMetaPreviewer.js');
    });

    test('should activate opengraph meta previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => openGraphMetaPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(openGraphMetaPreviewerModule.metadata).toBeDefined();
      expect(openGraphMetaPreviewerModule.metadata.id).toBe('opengraph-meta-previewer');
      expect(openGraphMetaPreviewerModule.metadata.category).toBe('previewers');
      expect(openGraphMetaPreviewerModule.metadata.icon).toBe('social-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => openGraphMetaPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('Schema Previewer', () => {
    let schemaPreviewerModule;

    beforeAll(async () => {
      schemaPreviewerModule = await import('../extension/tools/previewers/schemaPreviewer.js');
    });

    test('should activate schema previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => schemaPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(schemaPreviewerModule.metadata).toBeDefined();
      expect(schemaPreviewerModule.metadata.id).toBe('schema-previewer');
      expect(schemaPreviewerModule.metadata.category).toBe('previewers');
      expect(schemaPreviewerModule.metadata.icon).toBe('schema-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => schemaPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('Link Previewer', () => {
    let linkPreviewerModule;

    beforeAll(async () => {
      linkPreviewerModule = await import('../extension/tools/previewers/linkPreviewer.js');
    });

    test('should activate link previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => linkPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(linkPreviewerModule.metadata).toBeDefined();
      expect(linkPreviewerModule.metadata.id).toBe('link-previewer');
      expect(linkPreviewerModule.metadata.category).toBe('previewers');
      expect(linkPreviewerModule.metadata.icon).toBe('link-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => linkPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('JWT Claims Previewer', () => {
    let jwtClaimsPreviewerModule;

    beforeAll(async () => {
      jwtClaimsPreviewerModule = await import('../extension/tools/previewers/jwtClaimsPreviewer.js');
    });

    test('should activate jwt claims previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => jwtClaimsPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(jwtClaimsPreviewerModule.metadata).toBeDefined();
      expect(jwtClaimsPreviewerModule.metadata.id).toBe('jwt-claims-previewer');
      expect(jwtClaimsPreviewerModule.metadata.category).toBe('previewers');
      expect(jwtClaimsPreviewerModule.metadata.icon).toBe('jwt-claims');
    });

    test('should deactivate without errors', () => {
      expect(() => jwtClaimsPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('ZPL Viewer', () => {
    let zplViewerModule;

    beforeAll(async () => {
      zplViewerModule = await import('../extension/tools/previewers/zplViewer.js');
    });

    test('should activate zpl viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => zplViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(zplViewerModule.metadata).toBeDefined();
      expect(zplViewerModule.metadata.id).toBe('zpl-viewer');
      expect(zplViewerModule.metadata.category).toBe('previewers');
      expect(zplViewerModule.metadata.icon).toBe('zpl-viewer');
    });

    test('should deactivate without errors', () => {
      expect(() => zplViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('HTML CSS JS Previewer', () => {
    let htmlCssJsPreviewerModule;

    beforeAll(async () => {
      htmlCssJsPreviewerModule = await import('../extension/tools/previewers/htmlCssJsPreviewer.js');
    });

    test('should activate html css js previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => htmlCssJsPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(htmlCssJsPreviewerModule.metadata).toBeDefined();
      expect(htmlCssJsPreviewerModule.metadata.id).toBe('html-css-js-previewer');
      expect(htmlCssJsPreviewerModule.metadata.category).toBe('previewers');
      expect(htmlCssJsPreviewerModule.metadata.icon).toBe('code-preview');
    });

    test('should deactivate without errors', () => {
      expect(() => htmlCssJsPreviewerModule.deactivate()).not.toThrow();
    });
  });

  describe('HTML Viewer', () => {
    let htmlViewerModule;

    beforeAll(async () => {
      htmlViewerModule = await import('../extension/tools/previewers/htmlViewer.js');
    });

    test('should activate html viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => htmlViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(htmlViewerModule.metadata).toBeDefined();
      expect(htmlViewerModule.metadata.id).toBe('html-viewer');
      expect(htmlViewerModule.metadata.category).toBe('previewers');
      expect(htmlViewerModule.metadata.icon).toBe('html-viewer');
    });

    test('should deactivate without errors', () => {
      expect(() => htmlViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('YAML Viewer', () => {
    let yamlViewerModule;

    beforeAll(async () => {
      yamlViewerModule = await import('../extension/tools/previewers/yamlViewer.js');
    });

    test('should activate yaml viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => yamlViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(yamlViewerModule.metadata).toBeDefined();
      expect(yamlViewerModule.metadata.id).toBe('yaml-viewer');
      expect(yamlViewerModule.metadata.category).toBe('previewers');
      expect(yamlViewerModule.metadata.icon).toBe('yaml-viewer');
    });

    test('should deactivate without errors', () => {
      expect(() => yamlViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('TOML INI Viewer', () => {
    let tomlIniViewerModule;

    beforeAll(async () => {
      tomlIniViewerModule = await import('../extension/tools/previewers/tomlIniViewer.js');
    });

    test('should activate toml ini viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => tomlIniViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(tomlIniViewerModule.metadata).toBeDefined();
      expect(tomlIniViewerModule.metadata.id).toBe('toml-ini-viewer');
      expect(tomlIniViewerModule.metadata.category).toBe('previewers');
      expect(tomlIniViewerModule.metadata.icon).toBe('toml-ini');
    });

    test('should deactivate without errors', () => {
      expect(() => tomlIniViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('JSONL NDJSON Viewer', () => {
    let jsonlViewerModule;

    beforeAll(async () => {
      jsonlViewerModule = await import('../extension/tools/previewers/jsonlViewer.js');
    });

    test('should activate jsonl viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => jsonlViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(jsonlViewerModule.metadata).toBeDefined();
      expect(jsonlViewerModule.metadata.id).toBe('jsonl-ndjson-viewer');
      expect(jsonlViewerModule.metadata.category).toBe('previewers');
      expect(jsonlViewerModule.metadata.icon).toBe('jsonl-viewer');
    });

    test('should deactivate without errors', () => {
      expect(() => jsonlViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('HAR Viewer', () => {
    let harViewerModule;

    beforeAll(async () => {
      harViewerModule = await import('../extension/tools/previewers/harViewer.js');
    });

    test('should activate har viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => harViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(harViewerModule.metadata).toBeDefined();
      expect(harViewerModule.metadata.id).toBe('har-viewer');
      expect(harViewerModule.metadata.category).toBe('previewers');
      expect(harViewerModule.metadata.icon).toBe('har-viewer');
    });

    test('should deactivate without errors', () => {
      expect(() => harViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('Diff Viewer', () => {
    let diffViewerModule;

    beforeAll(async () => {
      diffViewerModule = await import('../extension/tools/previewers/diffViewer.js');
    });

    test('should activate diff viewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => diffViewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(diffViewerModule.metadata).toBeDefined();
      expect(diffViewerModule.metadata.id).toBe('diff-viewer');
      expect(diffViewerModule.metadata.category).toBe('previewers');
      expect(diffViewerModule.metadata.icon).toBe('diff-viewer');
    });

    test('should deactivate without errors', () => {
      expect(() => diffViewerModule.deactivate()).not.toThrow();
    });
  });

  describe('SQL Result Previewer', () => {
    let sqlResultPreviewerModule;

    beforeAll(async () => {
      sqlResultPreviewerModule = await import('../extension/tools/previewers/sqlResultPreviewer.js');
    });

    test('should activate sql result previewer', () => {
      const mockDeactivate = jest.fn();
      expect(() => sqlResultPreviewerModule.activate(mockDeactivate)).not.toThrow();
    });

    test('should have correct metadata', () => {
      expect(sqlResultPreviewerModule.metadata).toBeDefined();
      expect(sqlResultPreviewerModule.metadata.id).toBe('sql-result-previewer');
      expect(sqlResultPreviewerModule.metadata.category).toBe('previewers');
      expect(sqlResultPreviewerModule.metadata.icon).toBe('sql-result');
    });

    test('should deactivate without errors', () => {
      expect(() => sqlResultPreviewerModule.deactivate()).not.toThrow();
    });
  });
});
