/**
 * Coffee Messages System
 * Contains friendly developer support messages for all tools
 * Messages are displayed after successful tool operations
 */

// Message data structure for all tools
const MESSAGES = {
  'color-picker': {
    tr: "Bu rengi bulana kadar 3 kahve içtim, 2 sinir krizi geçirdim. Bir fincanla moral olur!",
    en: "I drank three coffees and had two minor breakdowns to find this color. A refill would boost morale!",
    fr: "J'ai bu trois cafés et fait deux crises de nerfs pour trouver cette couleur. Un autre café pour le moral ?"
  },
  'element-picker': {
    tr: "Bu kadar CSS selector'la uğraşınca kahve değil, intravenöz espresso lazım!",
    en: "After dealing with this many CSS selectors, I don't need coffee—I need espresso in an IV drip!",
    fr: "Après autant de sélecteurs CSS, j'ai besoin d'un espresso en perfusion, pas d'un simple café !"
  },
  'link-picker': {
    tr: "404 kahve bulunamadı. Düzeltmek ister misin?",
    en: "Error 404: Coffee not found. Would you like to fix that?",
    fr: "Erreur 404 : Café introuvable. Tu veux corriger ça ?"
  },
  'font-picker': {
    tr: "Tipografi savaşında 4 sigara içtim, kahvem bitti!",
    en: "Four cigarettes and one empty mug later, the typography war is won!",
    fr: "Quatre cigarettes et une tasse vide plus tard, la guerre typographique est gagnée !"
  },
  'media-picker': {
    tr: "Bu kadar görseli yakalarken RAM'im değil, kahvem tükendi.",
    en: "While fetching all these media files, it wasn't my RAM that ran out—it was my coffee.",
    fr: "En récupérant tous ces médias, ce n'est pas ma RAM qui a manqué, mais mon café."
  },
  'text-picker': {
    tr: "Metni çıkardım, anlamı kaldı. Kahve olsaydı belki onu da anlardım.",
    en: "Extracted the text, but the meaning stayed behind. Maybe coffee could've helped me find it.",
    fr: "J'ai extrait le texte, mais le sens s'est enfui. Avec un café, j'aurais peut-être compris."
  },
  'screenshot-picker': {
    tr: "Screenshot çekerken fare değil elim titredi, kahve eksikliğinden.",
    en: "While taking the screenshot, it wasn't the mouse that shook—it was my hand, from lack of coffee.",
    fr: "En prenant la capture d'écran, ce n'est pas la souris qui tremblait, c'était ma main… faute de café."
  },
  'pdf-generator': {
    tr: "PDF'yi oluştururken kahvem bitmişti. O yüzden köşeler hafif sinirli olabilir.",
    en: "My coffee ran out while generating this PDF—so forgive the slightly grumpy corners.",
    fr: "Mon café s'est vidé pendant la création du PDF. Les coins sont peut-être un peu nerveux."
  },
  'qr-code-generator': {
    tr: "Bu kare kodun her pikselinde bir kahve kırıntısı var.",
    en: "Every pixel in this QR code contains a trace of caffeine and despair.",
    fr: "Chaque pixel de ce QR code contient une trace de caféine et un soupçon de désespoir."
  },
  'video-recorder': {
    tr: "Video kaydı tamam, ama kamerada değil kahvede fokuslanmışım.",
    en: "Video recording complete—but I accidentally focused on my coffee instead of the screen.",
    fr: "Enregistrement terminé, mais j'ai fait la mise au point sur mon café au lieu de l'écran."
  },
  'sticky-notes-picker': {
    tr: "Bir de 'kahve al' notu ekle, ne olur ne olmaz.",
    en: "Maybe add another one that says 'Buy coffee,' just in case.",
    fr: "Ajoute aussi une note qui dit 'Acheter du café', on ne sait jamais."
  },
  'reading-mode': {
    tr: "Okuma modu: aktif. Sosyal hayat: pasif. Kahve: yok.",
    en: "Reading mode: ON. Social life: OFF. Coffee: EMPTY.",
    fr: "Mode lecture : activé. Vie sociale : désactivée. Café : inexistant."
  },
  'text-highlighter': {
    tr: "Highlight tamam, göz altı morlukları da cabası.",
    en: "Highlight done. Dark circles included for free.",
    fr: "Surlignage terminé. Les cernes sont offerts."
  },
  'bookmark-manager': {
    tr: "Favorilere ekledim. Keşke kahve de favori listeme düşse.",
    en: "Added to favorites. Wish coffee could be bookmarked too.",
    fr: "Ajouté aux favoris. Dommage qu'on ne puisse pas mettre le café en favori."
  },
  'dark-mode-toggle': {
    tr: "Karanlık modda bile kahve ışık saçıyor.",
    en: "Even in dark mode, coffee still shines bright.",
    fr: "Même en mode sombre, le café continue de briller."
  },
  'site-info-picker': {
    tr: "Sitenin tüm bilgilerini buldum. Tek eksik: kahve menüsü.",
    en: "Collected all site info. Only thing missing? The coffee menu.",
    fr: "J'ai trouvé toutes les infos du site. Il ne manque que le menu café."
  },
  'color-palette-generator': {
    tr: "Bu paleti yaparken kahvemi renk paletine döktüm. Tüh...",
    en: "I spilled my coffee on the color palette. That's why it looks so warm.",
    fr: "J'ai renversé mon café sur la palette de couleurs. C'est pour ça qu'elle est si chaleureuse."
  },
  'copy-history-manager': {
    tr: "Tüm kopyaları tuttum, ama kahve molasını kaçırdım.",
    en: "I tracked every copy—but missed my coffee break doing it.",
    fr: "J'ai tout copié, mais j'ai raté ma pause café."
  },
  'unit-converter': {
    tr: "Birimleri çevirdim ama kahve birimini hâlâ çözemiyorum: fincan mı kupa mı?",
    en: "I converted every unit except the most important one: cup of coffee vs mug of coffee.",
    fr: "J'ai converti toutes les unités sauf la plus importante : tasse de café ou mug de café ?"
  },
  'currency-converter': {
    tr: "Kurları çevirdim, tek sabit kalan şey kahve fiyatının hep yüksek olması.",
    en: "I converted all currencies, but coffee is still expensive in every single one.",
    fr: "J'ai converti toutes les devises, mais le café reste cher dans chacune d'elles."
  },
  'time-zone-converter': {
    tr: "Saat dilimlerini çevirdim, kahve molam yine yanlış saat diliminde kaldı.",
    en: "I converted time zones perfectly, but my coffee break is still in the wrong one.",
    fr: "J'ai converti les fuseaux horaires, mais ma pause café est encore dans le mauvais."
  },
  'color-converter': {
    tr: "Renkleri çevirdim ama kahve rengini hâlâ HEX ile anlatamıyorum.",
    en: "I converted all colors, but I still can't represent coffee with a single HEX code.",
    fr: "J'ai converti toutes les couleurs, mais impossible de résumer le café avec un seul code HEX."
  },
  'unix-time-converter': {
    tr: "Unix zamanı çevirdim, kahve molamın epoch'unu hâlâ bulamadım.",
    en: "I converted Unix time, but I still can't find the exact epoch of my coffee break.",
    fr: "J'ai converti le temps Unix, mais impossible de trouver l'epoch exact de ma pause café."
  },
  'number-base-converter': {
    tr: "Sayı tabanlarını çevirdim ama kahve ihtiyacım hâlâ taban-10'da çok yüksek.",
    en: "I converted number bases, but my coffee need is still very high in base-10.",
    fr: "J'ai converti les bases numériques, mais mon besoin de café reste énorme en base 10."
  },
  'base64-converter': {
    tr: "Metni Base64'e çevirdim ama 'kahve' kelimesi hâlâ çok anlaşılır duruyor.",
    en: "I encoded text to Base64, but the word 'coffee' still looks too clear to me.",
    fr: "J'ai encodé le texte en Base64, mais le mot 'café' reste trop lisible."
  },
  'url-converter': {
    tr: "URL'i kodladım, kahve linki yine de kalbime direkt gidiyor.",
    en: "I encoded the URL, but the coffee link still reaches my heart directly.",
    fr: "J'ai encodé l'URL, mais le lien vers le café atteint toujours mon cœur directement."
  },
  'case-converter': {
    tr: "Harflerin büyük-küçük halini çevirdim, kahve isteğim hep BÜYÜK kaldı.",
    en: "I converted every letter case, but my coffee craving stayed UPPERCASE.",
    fr: "J'ai converti toutes les casses, mais mon envie de café est restée en MAJUSCULES."
  },
  'markdown-html-converter': {
    tr: "Markdown'u HTML'e çevirdim, kahve notlarım hâlâ en değerli markup.",
    en: "I converted Markdown to HTML, but my coffee notes are still the most valuable markup.",
    fr: "J'ai converti Markdown en HTML, mais mes notes café restent le balisage le plus précieux."
  },
  'html-entity-converter': {
    tr: "Entity'leri çözdüm ama kahve özlemim hâlâ decode olmuyor.",
    en: "I decoded all entities, but my coffee longing still stays encoded.",
    fr: "J'ai décodé toutes les entités, mais mon envie de café reste encodée."
  },
  'text-to-slug-converter': {
    tr: "Başlığı slug yaptım, kahve molasını da keşke bu kadar düzenli yapabilsem.",
    en: "I turned the title into a perfect slug, wish I could organize coffee breaks this well.",
    fr: "J'ai transformé le titre en slug parfait, si seulement mes pauses café étaient aussi organisées."
  },
  'uuid-converter': {
    tr: "UUID ürettim ama kahve için tekil bir kimlik hâlâ bulamadım.",
    en: "I generated perfect UUIDs, still searching for a unique identifier for coffee.",
    fr: "J'ai généré des UUID parfaits, mais je cherche encore l'identifiant unique du café."
  },
  'hash-generator': {
    tr: "Hash'i ürettim ama kahve isteğimin özeti hâlâ aynı: çok yüksek.",
    en: "I generated the hash, but the digest of my coffee craving is still very high.",
    fr: "J'ai généré le hash, mais le résumé de mon envie de café reste très élevé."
  },
  'jwt-decoder': {
    tr: "Token'ı çözdüm, kahve ihtiyacımın claim'i yine değişmedi.",
    en: "I decoded the token, and my coffee claim still says: required.",
    fr: "J'ai décodé le token, et ma réclamation café dit toujours : requis."
  },
  'json-yaml-converter': {
    tr: "JSON'u YAML'a çevirdim, kahve ihtiyacım her formatta aynı kaldı.",
    en: "I converted JSON to YAML, but my coffee needs stayed format-independent.",
    fr: "J'ai converti JSON en YAML, mais mon besoin de café reste le même dans tous les formats."
  },
  'csv-json-converter': {
    tr: "CSV satırlarını JSON'a çevirdim, kahve satırım hâlâ eksik kaldı.",
    en: "I converted CSV rows into JSON, but my coffee row is still missing.",
    fr: "J'ai converti les lignes CSV en JSON, mais ma ligne café manque toujours."
  },
  'xml-json-converter': {
    tr: "XML düğümlerini JSON'a çevirdim, kahve düğümü yine zorunlu kaldı.",
    en: "I converted XML nodes to JSON, and the coffee node is still mandatory.",
    fr: "J'ai converti les nœuds XML en JSON, et le nœud café reste obligatoire."
  },
  'image-format-converter': {
    tr: "Formatı çevirdim, kahve filtresini hâlâ bulamadım.",
    en: "I converted the format, still searching for a coffee filter preset.",
    fr: "J'ai converti le format, mais je cherche toujours le preset filtre café."
  },
  'image-resizer-compressor': {
    tr: "Görseli küçülttüm, kahve ihtiyacımın dosya boyutu hâlâ devasa.",
    en: "I shrank the image, but my coffee needs are still uncompressed.",
    fr: "J'ai réduit l'image, mais mon besoin de café reste non compressé."
  },
  'svg-to-png-converter': {
    tr: "Vektörü piksele çevirdim, kahve isteğim yine keskin kaldı.",
    en: "I turned vectors into pixels, but my coffee craving stayed ultra sharp.",
    fr: "J'ai transformé le vectoriel en pixels, mais mon envie de café reste ultra nette."
  },
  'heic-converter': {
    tr: "HEIC'i çevirdim ama kahve açlığım hâlâ kayıpsız formatta.",
    en: "I converted HEIC, but my coffee hunger is still in lossless mode.",
    fr: "J'ai converti le HEIC, mais ma faim de café est toujours en mode sans perte."
  },
  'pdf-to-image-converter': {
    tr: "PDF sayfasını görsele çevirdim, kahve isteğim hâlâ yüksek çözünürlükte.",
    en: "I converted the PDF page to image, and my coffee craving is still high resolution.",
    fr: "J'ai converti la page PDF en image, et mon envie de café reste en haute résolution."
  },
  'image-to-pdf-converter': {
    tr: "Görselleri PDF'e topladım, kahve isteğim sayfa sayısıyla arttı.",
    en: "I bundled images into PDF, and my coffee craving scaled with page count.",
    fr: "J'ai regroupé les images en PDF, et mon envie de café a augmenté avec le nombre de pages."
  },
  'pdf-merge-split-converter': {
    tr: "PDF'leri birleştirip böldüm, kahve molam da modüler hale geldi.",
    en: "I merged and split PDFs, and my coffee breaks became modular too.",
    fr: "J'ai fusionné et scindé des PDF, et mes pauses café sont devenues modulaires."
  },
  'pdf-compress-converter': {
    tr: "PDF'i sıkıştırdım ama kahve ihtiyacım hâlâ tam boyut.",
    en: "I compressed the PDF, but my coffee needs are still full size.",
    fr: "J'ai compressé le PDF, mais mon besoin de café reste en taille réelle."
  },
  'qr-text-converter': {
    tr: "QR'ı çözdüm, kahve mesajı yine net çıktı.",
    en: "I decoded the QR, and the coffee message came out crystal clear.",
    fr: "J'ai décodé le QR, et le message café est sorti parfaitement clair."
  },
  'audio-format-converter': {
    tr: "Sesi çevirdim ama kahve frekansım hâlâ en yüksekte.",
    en: "I converted the audio, but my coffee frequency is still peaking.",
    fr: "J'ai converti l'audio, mais ma fréquence café est toujours au maximum."
  },
  'video-format-converter': {
    tr: "Videoyu çevirdim, kahve ihtiyacım hâlâ 60 FPS.",
    en: "I converted the video, and my coffee need is still running at 60 FPS.",
    fr: "J'ai converti la vidéo, et mon besoin de café tourne toujours à 60 FPS."
  },
  'subtitle-converter': {
    tr: "Altyazıyı çevirdim, kahve satırı hâlâ en önemli satır.",
    en: "I converted the subtitles, and the coffee line is still the most important cue.",
    fr: "J'ai converti les sous-titres, et la ligne café reste l'indice le plus important."
  },
  'roman-numeral-converter': {
    tr: "Roma rakamlarını çözdüm, kahve ihtiyacım hâlâ modern çağ seviyesinde.",
    en: "I decoded Roman numerals, but my coffee demand is still from the modern era.",
    fr: "J'ai décodé les chiffres romains, mais mon besoin de café reste bien moderne."
  },
  'json-previewer': {
    tr: "JSON ağacını büyüttüm, kahve dalları hâlâ en kuvvetli olanlar.",
    en: "I expanded the JSON tree, but the strongest branch is still coffee.",
    fr: "J'ai développé l'arbre JSON, mais la branche la plus solide reste le café."
  },
  'csv-tsv-previewer': {
    tr: "Satırları tek tek hizaladım, kahve satırı yine en kritik kolon.",
    en: "I aligned every row, and coffee is still the most critical column.",
    fr: "J'ai aligné chaque ligne, et le café reste la colonne la plus critique."
  },
  'markdown-previewer': {
    tr: "Markdown'u önizledim, kahve başlığı hâlâ H1 seviyesinde.",
    en: "I previewed the markdown, and coffee is still my H1 heading.",
    fr: "J'ai prévisualisé le markdown, et le café reste mon titre H1."
  },
  'xml-previewer': {
    tr: "XML düğümlerini açtım, <coffee> etiketi her yerde çıktı.",
    en: "I opened the XML nodes, and <coffee> appeared everywhere.",
    fr: "J'ai ouvert les nœuds XML, et la balise <coffee> est apparue partout."
  },
  'pdf-preview-inspector': {
    tr: "PDF sayfalarını denetledim, kahve lekesi metadata'ya bile işlemiş.",
    en: "I inspected the PDF pages, and coffee somehow made it into metadata.",
    fr: "J'ai inspecté les pages PDF, et le café a fini jusque dans les métadonnées."
  },
  'image-preview-inspector': {
    tr: "EXIF'te her şeyi buldum, sadece kahve miktarı alanı eksik.",
    en: "I found everything in EXIF except one field: coffee level.",
    fr: "J'ai trouvé tout dans l'EXIF, sauf le niveau de café."
  },
  'opengraph-meta-previewer': {
    tr: "Sosyal önizleme hazır, paylaşmadan önce bir kahve daha iyi gider.",
    en: "Social preview is ready, but one more coffee before posting sounds right.",
    fr: "L'aperçu social est prêt, mais un café avant de publier serait parfait."
  },
  'schema-previewer': {
    tr: "Schema'yı çözdüm, kahve alanı yine required çıktı.",
    en: "I parsed the schema, and the coffee field is still required.",
    fr: "J'ai analysé le schéma, et le champ café est toujours requis."
  },
  'link-previewer': {
    tr: "Linkleri kontrol ettim, en hızlı yanıt veren yine kahve bağlantısı.",
    en: "I checked the links, and coffee still has the fastest response time.",
    fr: "J'ai vérifié les liens, et le café a encore le meilleur temps de réponse."
  },
  'jwt-claims-previewer': {
    tr: "Token claim'lerini açtım, exp'den önce kahve şart görünüyor.",
    en: "I opened the JWT claims, and coffee is required before exp.",
    fr: "J'ai ouvert les claims JWT, et le café est requis avant exp."
  },
  'zpl-viewer': {
    tr: "ZPL etiketi bastım, PDF de hazır; kahve etiketi de ekleyelim mi?",
    en: "I rendered the ZPL label and exported PDF; should we add a coffee label too?",
    fr: "J'ai rendu l'étiquette ZPL et exporté le PDF, on ajoute une étiquette café ?"
  },
  'html-css-js-previewer': {
    tr: "HTML, CSS, JS çalıştı; tek eksik kahveyi import etmek.",
    en: "HTML, CSS, JS all running. The only missing import is coffee.",
    fr: "HTML, CSS, JS tournent bien. Il ne manque qu'un import café."
  },
  'html-viewer': {
    tr: "HTML'i güvenli render ettim, kahve scripti yine bloklanmadı.",
    en: "I rendered HTML safely, and the coffee script still got through.",
    fr: "J'ai rendu le HTML en sécurité, et le script café est toujours passé."
  },
  'yaml-viewer': {
    tr: "YAML ağacını açtım, kahve düğümü kökte çıktı.",
    en: "I expanded the YAML tree and found coffee at the root.",
    fr: "J'ai développé l'arbre YAML et trouvé café à la racine."
  },
  'toml-ini-viewer': {
    tr: "Config'i okudum: [coffee] enabled = true.",
    en: "Config checked: [coffee] enabled = true.",
    fr: "Config vérifiée : [coffee] enabled = true."
  },
  'jsonl-ndjson-viewer': {
    tr: "Log satırlarını çözdüm, en sık event yine coffee.request.",
    en: "I parsed the log lines; coffee.request is still the hottest event.",
    fr: "J'ai analysé les logs; coffee.request reste l'événement principal."
  },
  'har-viewer': {
    tr: "HAR dosyasını açtım, en hızlı istek kahve endpoint'i.",
    en: "I opened the HAR file, and the fastest request is still coffee endpoint.",
    fr: "J'ai ouvert le HAR, et la requête la plus rapide reste l'endpoint café."
  },
  'diff-viewer': {
    tr: "Farkları buldum: solda kod, sağda kahve etkisi.",
    en: "Diff complete: code on the left, coffee effect on the right.",
    fr: "Diff terminé : code à gauche, effet café à droite."
  },
  'sql-result-previewer': {
    tr: "SQL sonucu geldi, coffee_count yine beklenenden yüksek.",
    en: "SQL result loaded, coffee_count is still above expectations.",
    fr: "Résultat SQL chargé, coffee_count est encore au-dessus des attentes."
  },
  'accessibility-quick-audit': {
    tr: "Erişilebilirlik taraması bitti, kahveye erişimim hâlâ kritik seviyede.",
    en: "Accessibility audit done; my access to coffee is still a critical issue.",
    fr: "Audit d’accessibilité terminé ; mon accès au café reste un problème critique."
  },
  'core-web-vitals-analyzer': {
    tr: "LCP/INP/CLS ölçüldü, kahve gecikmem ise hâlâ çok yüksek.",
    en: "LCP/INP/CLS measured; my coffee latency is still way too high.",
    fr: "LCP/INP/CLS mesurés ; la latence de mon café reste bien trop élevée."
  },
  'security-headers-checker': {
    tr: "Header’ları kontrol ettim, kahve politikam hâlâ allow-all.",
    en: "Checked the headers, and my coffee policy is still allow-all.",
    fr: "J’ai vérifié les en-têtes, et ma politique café est toujours allow-all."
  },
  'structured-data-validator': {
    tr: "Schema doğrulandı, @type içinde kahve yine en popüler değer.",
    en: "Structured data validated; coffee is still the most popular @type.",
    fr: "Données structurées validées ; café reste la valeur @type la plus populaire."
  },
  'social-preview-pro': {
    tr: "Sosyal önizleme hazır, paylaşmadan önce bir kahve daha şart.",
    en: "Social preview is ready; one more coffee before posting is mandatory.",
    fr: "Aperçu social prêt ; un café de plus avant publication est obligatoire."
  },
  'robots-sitemap-inspector': {
    tr: "robots ve sitemap tamam, crawl budget’tan kahveye de pay ayıralım.",
    en: "Robots and sitemap checked; let’s allocate some crawl budget to coffee too.",
    fr: "robots et sitemap vérifiés ; gardons aussi un budget crawl pour le café."
  },
  'har-diff-analyzer': {
    tr: "HAR farkı çıkarıldı, en büyük delta yine kahve endpoint’inde.",
    en: "HAR diff complete, and the biggest delta is still on the coffee endpoint.",
    fr: "Diff HAR terminé, et le plus gros delta est encore sur l’endpoint café."
  },
  'macro-recorder': {
    tr: "Makroyu kaydettim, tıklamalar tamam ama kahve yudumlarının logu hâlâ eksik.",
    en: "Macro recorded; all clicks are logged, but the coffee sips are still missing from the timeline.",
    fr: "Macro enregistrée ; tous les clics sont là, mais il manque encore les gorgées de café dans la timeline."
  },
  'cookie-storage-auditor': {
    tr: "Çerez ve storage denetlendi, kahve tercihim localStorage’da sabit.",
    en: "Cookie and storage audit done; my coffee preference is still pinned in localStorage.",
    fr: "Audit cookies et stockage terminé ; ma préférence café reste fixée dans localStorage."
  },
  'text-summarizer': {
    tr: "AI bile kahvesiz çalışmıyor. Bana inan, denedim.",
    en: "Even AI doesn't work without coffee. Believe me, I've tested it.",
    fr: "Même l'IA ne fonctionne pas sans café. Crois-moi, j'ai essayé."
  },
  'ai-text-summarizer': {
    tr: "AI bile kahvesiz çalışmıyor. Bana inan, denedim.",
    en: "Even AI doesn't work without coffee. Believe me, I've tested it.",
    fr: "Même l'IA ne fonctionne pas sans café. Crois-moi, j'ai essayé."
  },
  'text-translator': {
    tr: "Çeviri tamam! 'Bir kahve alır mısın?' her dilde geçerlidir.",
    en: "Translation done! 'Would you like a coffee?' works in every language.",
    fr: "Traduction terminée ! 'Tu veux un café ?' marche dans toutes les langues."
  },
  'ai-text-translator': {
    tr: "Çeviri tamam! 'Bir kahve alır mısın?' her dilde geçerlidir.",
    en: "Translation done! 'Would you like a coffee?' works in every language.",
    fr: "Traduction terminée ! 'Tu veux un café ?' marche dans toutes les langues."
  },
  'content-detector': {
    tr: "AI mi yazmış, insan mı? Kim olursa olsun bir kahve hak eder.",
    en: "AI or human, whoever wrote it deserves a coffee.",
    fr: "IA ou humain, peu importe, l'auteur mérite un café."
  },
  'ai-content-detector': {
    tr: "AI mi yazmış, insan mı? Kim olursa olsun bir kahve hak eder.",
    en: "AI or human, whoever wrote it deserves a coffee.",
    fr: "IA ou humain, peu importe, l'auteur mérite un café."
  },
  'email-generator': {
    tr: "E-posta hazır! Ama kahveyle yazılmış bir 'merhaba' her zaman daha içten.",
    en: "Email ready! But a coffee-fueled 'hello' always feels more genuine.",
    fr: "E-mail prêt ! Mais un 'bonjour' écrit sous caféine, c'est toujours plus sincère."
  },
  'ai-email-generator': {
    tr: "E-posta hazır! Ama kahveyle yazılmış bir 'merhaba' her zaman daha içten.",
    en: "Email ready! But a coffee-fueled 'hello' always feels more genuine.",
    fr: "E-mail prêt ! Mais un 'bonjour' écrit sous caféine, c'est toujours plus sincère."
  },
  'seo-analyzer': {
    tr: "SEO raporu tamam. Kahve içmeden bu kadar sabırlı olabildiğime şaşkınım.",
    en: "SEO report done. I'm shocked I managed this without coffee.",
    fr: "Rapport SEO terminé. Je suis surpris d'avoir tenu sans café."
  },
  'ai-seo-analyzer': {
    tr: "SEO raporu tamam. Kahve içmeden bu kadar sabırlı olabildiğime şaşkınım.",
    en: "SEO report done. I'm shocked I managed this without coffee.",
    fr: "Rapport SEO terminé. Je suis surpris d'avoir tenu sans café."
  },
  'ai-chat': {
    tr: "Bu sohbetten sonra kahveme bile 'nasılsın?' dedim.",
    en: "After this chat, I even asked my coffee how it's doing.",
    fr: "Après cette conversation, j'ai même demandé à mon café comment il allait."
  }
};

/**
 * Get the current language from Chrome's i18n system
 * @returns {string} Language code (tr, en, fr)
 */
export async function getCurrentLanguage() {
  try {
    // Coffee messages use UI language (en, tr, fr only)
    const stored = await chrome.storage.local.get(['language']);
    if (stored?.language && ['en', 'tr', 'fr'].includes(stored.language)) {
      return stored.language;
    }
    
    // Fallback: detect UI language (limited to supported)
    const browserLang = navigator.language || navigator.languages?.[0] || 'en';
    const langCode = browserLang.split('-')[0].toLowerCase();
    
    // Only return supported UI languages
    if (['tr', 'fr'].includes(langCode)) {
      return langCode;
    }
    return 'en';
  } catch (error) {
    console.debug('Coffee Messages: Language detection failed, using English', error);
    return 'en';
  }
}

/**
 * Get coffee message for a specific tool
 * @param {string} toolId - The tool identifier
 * @returns {string|null} The message in current language, or null if not found
 */
export async function getCoffeeMessage(toolId) {
  try {
    const messages = MESSAGES[toolId];
    if (!messages) {
      console.debug(`Coffee Messages: No message found for tool: ${toolId}`);
      return null;
    }
    
    const language = await getCurrentLanguage();
    const message = messages[language] || messages['en'] || null;
    
    if (!message) {
      console.debug(`Coffee Messages: No message found for tool ${toolId} in language ${language}`);
    }
    
    return message;
  } catch (error) {
    console.error('Coffee Messages: Error getting message for tool', toolId, error);
    return null;
  }
}

/**
 * Check if a tool has coffee messages available
 * @param {string} toolId - The tool identifier
 * @returns {boolean} True if messages are available
 */
export function hasCoffeeMessage(toolId) {
  return MESSAGES.hasOwnProperty(toolId);
}
