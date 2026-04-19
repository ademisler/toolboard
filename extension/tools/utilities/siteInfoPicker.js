import { showError, showSuccess, showInfo, showModal, handleError, safeExecute, validateUrl } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';

export const metadata = {
  id: 'site-info-picker',
  name: 'Site Info',
  category: 'utilities',
  icon: 'info',
  permissions: ['activeTab'],
  tags: ['analysis', 'seo', 'performance'],
  keywords: ['tech stack', 'seo', 'accessibility', 'performance']
};

// Detect technologies and frameworks with enhanced error handling
function detectTechnologies() {
  try {
    const technologies = {
      // Frontend Frameworks
      react: {
        name: 'React',
        detected: safeExecute(() => !!document.querySelector('[data-reactroot]') || 
                  !!window.React || 
                  !!document.querySelector('script[src*="react"]') ||
                  !!document.querySelector('script[src*="react-dom"]') ||
                  !!document.querySelector('div[id*="react"]') ||
                  !!window.__REACT_DEVTOOLS_GLOBAL_HOOK__ ||
                  !!document.querySelector('[data-react-helmet]') ||
                  !!window.ReactDOM, 'detect React') || false,
        confidence: 'high'
      },
      nextjs: {
        name: 'Next.js',
        detected: safeExecute(() => !!document.querySelector('script[id="__NEXT_DATA__"]') ||
                  !!window.__NEXT_DATA__ ||
                  !!document.querySelector('meta[name="next-head-count"]') ||
                  !!document.querySelector('script[src*="next"]') ||
                  !!document.querySelector('link[rel="preload"][as="script"][href*="_next"]') ||
                  !!document.querySelector('script[src*="_next/static"]') ||
                  !!document.querySelector('link[href*="_next/static"]'), 'detect Next.js') || false,
        confidence: 'high'
      },
      nuxt: {
        name: 'Nuxt.js',
        detected: safeExecute(() => !!window.$nuxt ||
                  !!document.querySelector('script[id="__NUXT__"]') ||
                  !!document.querySelector('meta[name="nuxt-app"]') ||
                  !!document.querySelector('script[src*="nuxt"]') ||
                  !!document.querySelector('link[href*="_nuxt"]'), 'detect Nuxt.js') || false,
        confidence: 'high'
      },
      vue: {
        name: 'Vue.js',
        detected: safeExecute(() => !!window.Vue || 
                  !!document.querySelector('[data-v-]') ||
                  !!document.querySelector('script[src*="vue"]') ||
                  !!document.querySelector('[v-]') ||
                  !!window.VueRouter ||
                  !!window.vue, 'detect Vue.js') || false,
        confidence: 'high'
      },
      angular: {
        name: 'Angular',
        detected: safeExecute(() => !!window.ng || 
                  !!document.querySelector('[ng-app]') ||
                  !!document.querySelector('script[src*="angular"]') ||
                  !!document.querySelector('[ng-]') ||
                  !!window.angular ||
                  !!document.querySelector('script[src*="angularjs"]'), 'detect Angular') || false,
        confidence: 'high'
      },
      svelte: {
        name: 'Svelte',
        detected: safeExecute(() => !!document.querySelector('script[src*="svelte"]') ||
                  !!window.svelte ||
                  !!document.querySelector('[data-svelte]') ||
                  !!document.querySelector('script[src*="sveltejs"]'), 'detect Svelte') || false,
        confidence: 'medium'
      },
      sveltekit: {
        name: 'SvelteKit',
        detected: safeExecute(() => !!document.querySelector('script[src*="sveltekit"]') ||
                  !!window.__sveltekit ||
                  !!document.querySelector('link[href*="sveltekit"]'), 'detect SvelteKit') || false,
        confidence: 'high'
      },
      gatsby: {
        name: 'Gatsby',
        detected: safeExecute(() => !!document.querySelector('script[src*="gatsby"]') ||
                  !!window.___gatsby ||
                  !!document.querySelector('link[href*="gatsby"]') ||
                  !!document.querySelector('meta[name="generator"][content*="Gatsby"]'), 'detect Gatsby') || false,
        confidence: 'high'
      },
      astro: {
        name: 'Astro',
        detected: safeExecute(() => !!document.querySelector('script[src*="astro"]') ||
                  !!window.astro ||
                  !!document.querySelector('meta[name="generator"][content*="Astro"]') ||
                  !!document.querySelector('link[href*="astro"]'), 'detect Astro') || false,
        confidence: 'high'
      },
      remix: {
        name: 'Remix',
        detected: safeExecute(() => !!document.querySelector('script[src*="remix"]') ||
                  !!window.__remixContext ||
                  !!document.querySelector('link[href*="remix"]'), 'detect Remix') || false,
        confidence: 'high'
      },
      solid: {
        name: 'SolidJS',
        detected: safeExecute(() => !!window.Solid ||
                  !!document.querySelector('script[src*="solid"]') ||
                  !!document.querySelector('[data-solid]'), 'detect SolidJS') || false,
        confidence: 'medium'
      },
      preact: {
        name: 'Preact',
        detected: safeExecute(() => !!window.preact ||
                  !!document.querySelector('script[src*="preact"]') ||
                  !!window.h, 'detect Preact') || false,
        confidence: 'medium'
      },
      
      // Backend/CMS
      wordpress: {
        name: 'WordPress',
        detected: safeExecute(() => !!document.querySelector('meta[name="generator"][content*="WordPress"]') ||
                  !!document.querySelector('link[href*="wp-content"]') ||
                  !!document.querySelector('script[src*="wp-includes"]') ||
                  !!window.wp, 'detect WordPress') || false,
        confidence: 'high'
      },
      drupal: {
        name: 'Drupal',
        detected: safeExecute(() => !!document.querySelector('meta[name="generator"][content*="Drupal"]') ||
                  !!document.querySelector('link[href*="sites/default"]'), 'detect Drupal') || false,
        confidence: 'high'
      },
      joomla: {
        name: 'Joomla',
        detected: safeExecute(() => !!document.querySelector('meta[name="generator"][content*="Joomla"]') ||
                  !!document.querySelector('link[href*="templates"]'), 'detect Joomla') || false,
        confidence: 'high'
      },
      
      // E-commerce Platforms
      shopify: {
        name: 'Shopify',
        detected: safeExecute(() => !!document.querySelector('script[src*="shopify"]') ||
                  !!window.Shopify ||
                  !!document.querySelector('link[href*="shopify"]') ||
                  !!document.querySelector('meta[name="shopify-digital-wallet"]') ||
                  !!document.querySelector('script[src*="cdn.shopify.com"]') ||
                  !!window.ShopifyAnalytics ||
                  !!document.querySelector('[data-shopify]') ||
                  !!document.querySelector('script[src*="shopifyapps"]') ||
                  !!window.ShopifyPay, 'detect Shopify') || false,
        confidence: 'high'
      },
      woocommerce: {
        name: 'WooCommerce',
        detected: safeExecute(() => !!document.querySelector('script[src*="woocommerce"]') ||
                  !!document.querySelector('link[href*="woocommerce"]') ||
                  !!document.querySelector('script[src*="wc-"]') ||
                  !!document.querySelector('[data-product_id]') ||
                  !!window.wc_add_to_cart_params, 'detect WooCommerce') || false,
        confidence: 'high'
      },
      magento: {
        name: 'Magento',
        detected: safeExecute(() => !!document.querySelector('script[src*="magento"]') ||
                  !!document.querySelector('link[href*="magento"]') ||
                  !!document.querySelector('script[src*="mage/"]') ||
                  !!window.Mage ||
                  !!document.querySelector('[data-mage-init]'), 'detect Magento') || false,
        confidence: 'high'
      },
      bigcommerce: {
        name: 'BigCommerce',
        detected: safeExecute(() => !!document.querySelector('script[src*="bigcommerce"]') ||
                  !!window.BigCommerce ||
                  !!document.querySelector('[data-product-options]') ||
                  !!document.querySelector('script[src*="bc-app"]'), 'detect BigCommerce') || false,
        confidence: 'high'
      },
      prestashop: {
        name: 'PrestaShop',
        detected: safeExecute(() => !!document.querySelector('script[src*="prestashop"]') ||
                  !!document.querySelector('link[href*="prestashop"]') ||
                  !!document.querySelector('[data-prestashop]'), 'detect PrestaShop') || false,
        confidence: 'medium'
      },
      opencart: {
        name: 'OpenCart',
        detected: safeExecute(() => !!document.querySelector('script[src*="opencart"]') ||
                  !!document.querySelector('link[href*="opencart"]') ||
                  !!window.oc ||
                  !!document.querySelector('[data-opencart]'), 'detect OpenCart') || false,
        confidence: 'medium'
      },
      squarespace: {
        name: 'Squarespace',
        detected: safeExecute(() => !!document.querySelector('script[src*="squarespace"]') ||
                  !!window.Squarespace ||
                  !!document.querySelector('[data-squarespace]') ||
                  !!document.querySelector('link[href*="squarespace"]'), 'detect Squarespace') || false,
        confidence: 'high'
      },
      wix: {
        name: 'Wix',
        detected: safeExecute(() => !!document.querySelector('script[src*="wix"]') ||
                  !!window.wix ||
                  !!document.querySelector('[data-wix]') ||
                  !!document.querySelector('script[src*="wixstatic"]'), 'detect Wix') || false,
        confidence: 'high'
      },
      webflow: {
        name: 'Webflow',
        detected: safeExecute(() => !!document.querySelector('script[src*="webflow"]') ||
                  !!window.Webflow ||
                  !!document.querySelector('[data-wf]') ||
                  !!document.querySelector('link[href*="webflow"]'), 'detect Webflow') || false,
        confidence: 'high'
      },
      ghost: {
        name: 'Ghost',
        detected: safeExecute(() => !!document.querySelector('script[src*="ghost"]') ||
                  !!document.querySelector('meta[name="generator"][content*="Ghost"]') ||
                  !!window.Ghost ||
                  !!document.querySelector('[data-ghost]'), 'detect Ghost') || false,
        confidence: 'high'
      },
      strapi: {
        name: 'Strapi',
        detected: safeExecute(() => !!document.querySelector('script[src*="strapi"]') ||
                  !!window.strapi ||
                  !!document.querySelector('[data-strapi]'), 'detect Strapi') || false,
        confidence: 'medium'
      },
      contentful: {
        name: 'Contentful',
        detected: safeExecute(() => !!document.querySelector('script[src*="contentful"]') ||
                  !!window.contentful ||
                  !!document.querySelector('[data-contentful]'), 'detect Contentful') || false,
        confidence: 'medium'
      },
      sanity: {
        name: 'Sanity',
        detected: safeExecute(() => !!document.querySelector('script[src*="sanity"]') ||
                  !!window.sanity ||
                  !!document.querySelector('[data-sanity]'), 'detect Sanity') || false,
        confidence: 'medium'
      },
      netlify: {
        name: 'Netlify',
        detected: safeExecute(() => !!document.querySelector('script[src*="netlify"]') ||
                  !!window.netlify ||
                  !!document.querySelector('[data-netlify]') ||
                  !!document.querySelector('meta[name="generator"][content*="Netlify"]'), 'detect Netlify') || false,
        confidence: 'medium'
      },
      vercel: {
        name: 'Vercel',
        detected: safeExecute(() => !!document.querySelector('script[src*="vercel"]') ||
                  !!window.vercel ||
                  !!document.querySelector('[data-vercel]') ||
                  !!document.querySelector('meta[name="generator"][content*="Vercel"]'), 'detect Vercel') || false,
        confidence: 'medium'
      },
      
      // Analytics & Tracking
      googleAnalytics: {
        name: 'Google Analytics',
        detected: safeExecute(() => !!document.querySelector('script[src*="google-analytics"]') ||
                  !!document.querySelector('script[src*="gtag"]') ||
                  !!window.ga || !!window.gtag, 'detect Google Analytics') || false,
        confidence: 'high'
      },
      googleTagManager: {
        name: 'Google Tag Manager',
        detected: safeExecute(() => !!document.querySelector('script[src*="googletagmanager"]') ||
                  !!window.google_tag_manager, 'detect Google Tag Manager') || false,
        confidence: 'high'
      },
      facebookPixel: {
        name: 'Facebook Pixel',
        detected: safeExecute(() => !!document.querySelector('script[src*="facebook.net"]') ||
                  !!window.fbq, 'detect Facebook Pixel') || false,
        confidence: 'high'
      },
      
      // CDN & Hosting
      cloudflare: {
        name: 'Cloudflare',
        detected: safeExecute(() => !!document.querySelector('meta[name="cf-ray"]') ||
                  !!document.querySelector('script[src*="cloudflare"]'), 'detect Cloudflare') || false,
        confidence: 'high'
      },
      aws: {
        name: 'AWS',
        detected: safeExecute(() => !!document.querySelector('script[src*="amazonaws"]') ||
                  !!document.querySelector('link[href*="amazonaws"]'), 'detect AWS') || false,
        confidence: 'medium'
      },
      
      // UI Libraries
      bootstrap: {
        name: 'Bootstrap',
        detected: safeExecute(() => !!document.querySelector('link[href*="bootstrap"]') ||
                  !!document.querySelector('script[src*="bootstrap"]'), 'detect Bootstrap') || false,
        confidence: 'high'
      },
      tailwind: {
        name: 'Tailwind CSS',
        detected: safeExecute(() => !!document.querySelector('script[src*="tailwind"]') ||
                  document.documentElement.classList.contains('tailwind'), 'detect Tailwind CSS') || false,
        confidence: 'medium'
      },
      jquery: {
        name: 'jQuery',
        detected: safeExecute(() => !!window.jQuery || !!window.$, 'detect jQuery') || false,
        confidence: 'high'
      },
      
      // Build Tools
      webpack: {
        name: 'Webpack',
        detected: safeExecute(() => !!document.querySelector('script[src*="webpack"]') ||
                  !!window.webpackChunkName, 'detect Webpack') || false,
        confidence: 'medium'
      },
      vite: {
        name: 'Vite',
        detected: safeExecute(() => !!document.querySelector('script[src*="vite"]') ||
                  !!window.__vite_plugin_react_preamble_installed__, 'detect Vite') || false,
        confidence: 'medium'
      },
      
      // Payment Systems
      stripe: {
        name: 'Stripe',
        detected: safeExecute(() => !!document.querySelector('script[src*="stripe"]') ||
                  !!window.Stripe, 'detect Stripe') || false,
        confidence: 'high'
      },
      paypal: {
        name: 'PayPal',
        detected: safeExecute(() => !!document.querySelector('script[src*="paypal"]') ||
                  !!window.paypal, 'detect PayPal') || false,
        confidence: 'high'
      }
    };
    
    return Object.entries(technologies)
      .filter(([, tech]) => tech.detected)
      .map(([key, tech]) => ({ key, ...tech }));
  } catch (error) {
    handleError(error, 'detectTechnologies');
    return [];
  }
}

// Get page performance metrics with enhanced error handling
function getPerformanceMetrics() {
  try {
    const hasPerformanceEntries = typeof performance?.getEntriesByType === 'function';
    const navigation = hasPerformanceEntries
      ? safeExecute(() => performance.getEntriesByType('navigation')[0], 'get navigation entry') || null
      : null;
    const paint = hasPerformanceEntries
      ? safeExecute(() => performance.getEntriesByType('paint'), 'get paint entries') || []
      : [];
    
    return {
      loadTime: navigation ? safeExecute(() => Math.round(navigation.loadEventEnd - navigation.loadEventStart), 'calculate load time') || 'N/A' : 'N/A',
      domContentLoaded: navigation ? safeExecute(() => Math.round(navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart), 'calculate DOM ready time') || 'N/A' : 'N/A',
      firstPaint: safeExecute(() => {
        const fp = paint.find(p => p.name === 'first-paint');
        return fp?.startTime ? Math.round(fp.startTime) : 'N/A';
      }, 'calculate first paint') || 'N/A',
      firstContentfulPaint: safeExecute(() => {
        const fcp = paint.find(p => p.name === 'first-contentful-paint');
        return fcp?.startTime ? Math.round(fcp.startTime) : 'N/A';
      }, 'calculate first contentful paint') || 'N/A',
      transferSize: navigation ? safeExecute(() => Math.round(navigation.transferSize / 1024), 'calculate transfer size') || 'N/A' : 'N/A',
      encodedBodySize: navigation ? safeExecute(() => Math.round(navigation.encodedBodySize / 1024), 'calculate encoded body size') || 'N/A' : 'N/A'
    };
  } catch (error) {
    handleError(error, 'getPerformanceMetrics');
    return {
      loadTime: 'N/A',
      domContentLoaded: 'N/A',
      firstPaint: 'N/A',
      firstContentfulPaint: 'N/A',
      transferSize: 'N/A',
      encodedBodySize: 'N/A'
    };
  }
}

// Get security information with enhanced error handling
function getSecurityInfo() {
  try {
    const security = {
      https: safeExecute(() => location.protocol === 'https:', 'check HTTPS') || false,
      hasCSP: safeExecute(() => !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'), 'check CSP') || false,
      hasHSTS: safeExecute(() => document.cookie.includes('HSTS') || 
               !!document.querySelector('meta[http-equiv="Strict-Transport-Security"]'), 'check HSTS') || false,
      hasReferrerPolicy: safeExecute(() => !!document.querySelector('meta[name="referrer"]'), 'check referrer policy') || false,
      hasPermissionsPolicy: safeExecute(() => !!document.querySelector('meta[http-equiv="Permissions-Policy"]'), 'check permissions policy') || false
    };
    
    return security;
  } catch (error) {
    handleError(error, 'getSecurityInfo');
    return {
      https: false,
      hasCSP: false,
      hasHSTS: false,
      hasReferrerPolicy: false,
      hasPermissionsPolicy: false
    };
  }
}

// Get SEO information with enhanced error handling
function getSEOInfo() {
  try {
    const seo = {
      title: safeExecute(() => document.title, 'get title') || 'Not set',
      description: safeExecute(() => document.querySelector('meta[name="description"]')?.content, 'get description') || 'Not set',
      keywords: safeExecute(() => document.querySelector('meta[name="keywords"]')?.content, 'get keywords') || 'Not set',
      canonical: safeExecute(() => document.querySelector('link[rel="canonical"]')?.href, 'get canonical') || 'Not set',
      robots: safeExecute(() => document.querySelector('meta[name="robots"]')?.content, 'get robots') || 'Not set',
      ogTitle: safeExecute(() => document.querySelector('meta[property="og:title"]')?.content, 'get og title') || 'Not set',
      ogDescription: safeExecute(() => document.querySelector('meta[property="og:description"]')?.content, 'get og description') || 'Not set',
      ogImage: safeExecute(() => document.querySelector('meta[property="og:image"]')?.content, 'get og image') || 'Not set',
      twitterCard: safeExecute(() => document.querySelector('meta[name="twitter:card"]')?.content, 'get twitter card') || 'Not set',
      hasSchema: safeExecute(() => !!document.querySelector('script[type="application/ld+json"]'), 'check schema') || false,
      h1Count: safeExecute(() => document.querySelectorAll('h1').length, 'count h1') || 0,
      h2Count: safeExecute(() => document.querySelectorAll('h2').length, 'count h2') || 0,
      imageCount: safeExecute(() => document.querySelectorAll('img').length, 'count images') || 0,
      linkCount: safeExecute(() => document.querySelectorAll('a').length, 'count links') || 0
    };
    
    return seo;
  } catch (error) {
    handleError(error, 'getSEOInfo');
    return {
      title: 'Not set',
      description: 'Not set',
      keywords: 'Not set',
      canonical: 'Not set',
      robots: 'Not set',
      ogTitle: 'Not set',
      ogDescription: 'Not set',
      ogImage: 'Not set',
      twitterCard: 'Not set',
      hasSchema: false,
      h1Count: 0,
      h2Count: 0,
      imageCount: 0,
      linkCount: 0
    };
  }
}

// Get domain age and authority metrics with enhanced error handling
async function getDomainMetrics() {
  try {
    const domain = safeExecute(() => new URL(window.location.href).hostname, 'get domain') || 'unknown';
    
    // Try to get domain age from WHOIS-like services
    let domainAge = 'Check manually';
    try {
      domainAge = await getDomainAge(domain);
    } catch (error) {
      console.log('Domain age check failed:', error);
    }
    
    // Try to get DA/PA from various sources
    let authority = {
      da: 'Check manually',
      pa: 'Check manually',
      backlinks: 'Check manually',
      referringDomains: 'Check manually'
    };
    try {
      authority = await getDomainAuthority(domain);
    } catch (error) {
      console.log('Domain authority check failed:', error);
    }
    
    return {
      domain: domain,
      age: domainAge,
      da: authority.da,
      pa: authority.pa,
      backlinks: authority.backlinks,
      referringDomains: authority.referringDomains,
      lastChecked: new Date().toLocaleDateString()
    };
  } catch (error) {
    handleError(error, 'getDomainMetrics');
    return {
      domain: 'unknown',
      age: 'Check manually',
      da: 'Check manually',
      pa: 'Check manually',
      backlinks: 'Check manually',
      referringDomains: 'Check manually',
      lastChecked: new Date().toLocaleDateString()
    };
  }
}

// Get domain age (approximate) with enhanced error handling
async function getDomainAge(domain) {
  try {
    if (!domain || !validateUrl(`https://${domain}`)) {
      return 'Check manually';
    }
    
    // For now, return estimated based on domain characteristics
    const commonTLDs = ['.com', '.org', '.net', '.edu', '.gov'];
    const isCommonTLD = safeExecute(() => commonTLDs.some(tld => domain.endsWith(tld)), 'check common TLD') || false;
    
    if (domain.length < 10 && isCommonTLD) {
      return 'Likely 5+ years (short, common TLD)';
    } else if (domain.includes('-') || domain.length > 15) {
      return 'Likely newer (longer name with dashes)';
    } else {
      return 'Check manually with WHOIS tools';
    }
  } catch (error) {
    handleError(error, 'getDomainAge');
    return 'Check manually';
  }
}

// Get domain authority metrics with enhanced error handling
async function getDomainAuthority(domain) {
  try {
    if (!domain || !validateUrl(`https://${domain}`)) {
      return {
        da: 'Check manually',
        pa: 'Check manually',
        backlinks: 'Check manually',
        referringDomains: 'Check manually'
      };
    }
    
    // Try to get Moz metrics from various sources
    const metrics = {
      da: 'Check manually',
      pa: 'Check manually', 
      backlinks: 'Check manually',
      referringDomains: 'Check manually'
    };
    
    // Method 1: Try to detect if site has Moz toolbar data
    const mozData = safeExecute(() => document.querySelector('meta[name="moz-domain-authority"]'), 'get moz data');
    if (mozData) {
      metrics.da = mozData.content;
    }
    
    // Method 2: Check for SEO plugins that might expose metrics
    const seoPlugin = safeExecute(() => document.querySelector('meta[name="seo-score"]'), 'get seo plugin');
    if (seoPlugin) {
      metrics.pa = seoPlugin.content;
    }
    
    // Method 3: Estimate based on site characteristics
    const linkCount = safeExecute(() => document.querySelectorAll('a[href*="http"]').length, 'count links') || 0;
    const externalLinks = safeExecute(() => {
      const links = document.querySelectorAll('a[href*="http"]');
      let count = 0;
      for (let i = 0; i < links.length; i++) {
        try {
          if (links[i] && links[i].href && !links[i].href.includes(domain)) {
            count++;
          }
        } catch {
          // Skip problematic links
          continue;
        }
      }
      return count;
    }, 'count external links') || 0;
    
    if (linkCount > 100 && externalLinks > 20) {
      metrics.backlinks = `Estimated ${Math.floor(linkCount * 0.1)}-${Math.floor(linkCount * 0.3)}`;
      metrics.referringDomains = `Estimated ${Math.floor(externalLinks * 0.2)}-${Math.floor(externalLinks * 0.5)}`;
    }
    
    // Method 4: Check for social signals
    const socialLinks = safeExecute(() => document.querySelectorAll('a[href*="facebook.com"], a[href*="twitter.com"], a[href*="linkedin.com"]').length, 'count social links') || 0;
    if (socialLinks > 5) {
      metrics.da = 'Likely 20-40 (good social presence)';
      metrics.pa = 'Likely 15-30 (good social presence)';
    }
    
    return metrics;
  } catch (error) {
    handleError(error, 'getDomainAuthority');
    return {
      da: 'Check manually',
      pa: 'Check manually',
      backlinks: 'Check manually',
      referringDomains: 'Check manually'
    };
  }
}

// Get accessibility information with enhanced error handling
function getAccessibilityInfo() {
  try {
    const a11y = {
      hasLang: safeExecute(() => !!document.documentElement.lang, 'check lang') || false,
      hasSkipLinks: safeExecute(() => !!document.querySelector('a[href="#main"], a[href="#content"]'), 'check skip links') || false,
      hasAltText: safeExecute(() => Array.from(document.querySelectorAll('img')).every(img => img.alt !== undefined), 'check alt text') || false,
      hasFormLabels: safeExecute(() => Array.from(document.querySelectorAll('input')).every(input => 
        input.labels.length > 0 || input.getAttribute('aria-label') || input.getAttribute('placeholder')
      ), 'check form labels') || false,
      hasHeadings: safeExecute(() => document.querySelectorAll('h1, h2, h3, h4, h5, h6').length > 0, 'check headings') || false,
      hasLandmarks: safeExecute(() => document.querySelectorAll('main, nav, aside, section, article, header, footer').length > 0, 'check landmarks') || false,
      colorContrast: 'Check manually', // Would need more complex analysis
      focusManagement: 'Check manually'
    };
    
    return a11y;
  } catch (error) {
    handleError(error, 'getAccessibilityInfo');
    return {
      hasLang: false,
      hasSkipLinks: false,
      hasAltText: false,
      hasFormLabels: false,
      hasHeadings: false,
      hasLandmarks: false,
      colorContrast: 'Check manually',
      focusManagement: 'Check manually'
    };
  }
}

// Get social media presence with enhanced error handling
function getSocialMediaInfo() {
  try {
    const social = {
      facebook: safeExecute(() => !!document.querySelector('meta[property="og:site_name"]') ||
               !!document.querySelector('script[src*="facebook"]'), 'check facebook') || false,
      twitter: safeExecute(() => !!document.querySelector('meta[name="twitter:site"]') ||
              !!document.querySelector('script[src*="twitter"]'), 'check twitter') || false,
      linkedin: safeExecute(() => !!document.querySelector('meta[property="og:type"][content="article"]') ||
                !!document.querySelector('script[src*="linkedin"]'), 'check linkedin') || false,
      instagram: safeExecute(() => !!document.querySelector('meta[property="og:site_name"][content*="Instagram"]'), 'check instagram') || false,
      youtube: safeExecute(() => !!document.querySelector('script[src*="youtube"]') ||
               !!document.querySelector('iframe[src*="youtube"]'), 'check youtube') || false,
      tiktok: safeExecute(() => !!document.querySelector('script[src*="tiktok"]'), 'check tiktok') || false
    };
    
    return social;
  } catch (error) {
    handleError(error, 'getSocialMediaInfo');
    return {
      facebook: false,
      twitter: false,
      linkedin: false,
      instagram: false,
      youtube: false,
      tiktok: false
    };
  }
}

// Analyze site structure with enhanced error handling
function analyzeSiteStructure() {
  try {
    const structure = {
      hasHeader: safeExecute(() => !!document.querySelector('header, .header, #header'), 'check header') || false,
      hasFooter: safeExecute(() => !!document.querySelector('footer, .footer, #footer'), 'check footer') || false,
      hasNavigation: safeExecute(() => !!document.querySelector('nav, .nav, .navigation'), 'check navigation') || false,
      hasSidebar: safeExecute(() => !!document.querySelector('aside, .sidebar, .side-bar'), 'check sidebar') || false,
      hasMain: safeExecute(() => !!document.querySelector('main, .main, #main'), 'check main') || false,
      hasSearch: safeExecute(() => !!document.querySelector('input[type="search"], .search, #search'), 'check search') || false,
      hasLogin: safeExecute(() => !!document.querySelector('input[type="password"], .login, #login'), 'check login') || false,
      hasCart: safeExecute(() => !!document.querySelector('.cart, #cart, [class*="cart"]'), 'check cart') || false,
      hasNewsletter: safeExecute(() => !!document.querySelector('input[type="email"], .newsletter, #newsletter'), 'check newsletter') || false,
      pageDepth: safeExecute(() => window.location.pathname.split('/').length - 1, 'calculate page depth') || 0,
      hasBreadcrumbs: safeExecute(() => !!document.querySelector('.breadcrumb, .breadcrumbs, nav[aria-label="breadcrumb"]'), 'check breadcrumbs') || false
    };
    
    return structure;
  } catch (error) {
    handleError(error, 'analyzeSiteStructure');
    return {
      hasHeader: false,
      hasFooter: false,
      hasNavigation: false,
      hasSidebar: false,
      hasMain: false,
      hasSearch: false,
      hasLogin: false,
      hasCart: false,
      hasNewsletter: false,
      pageDepth: 0,
      hasBreadcrumbs: false
    };
  }
}

// Generate comprehensive site report with enhanced error handling
async function generateSiteReport() {
  try {
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('analyzingWebsite') : 'Analyzing website...';
    showInfo(infoMessage, 2000);
    
    const url = safeExecute(() => new URL(window.location.href), 'create URL') || new URL('https://example.com');
    const technologies = safeExecute(() => detectTechnologies(), 'detect technologies') || [];
    const performance = safeExecute(() => getPerformanceMetrics(), 'get performance metrics') || {};
    const security = safeExecute(() => getSecurityInfo(), 'get security info') || {};
    const seo = safeExecute(() => getSEOInfo(), 'get seo info') || {};
    const accessibility = safeExecute(() => getAccessibilityInfo(), 'get accessibility info') || {};
    const social = safeExecute(() => getSocialMediaInfo(), 'get social media info') || {};
    const structure = safeExecute(() => analyzeSiteStructure(), 'analyze site structure') || {};
    let domainMetrics = {};
    try {
      domainMetrics = await getDomainMetrics();
    } catch (error) {
      console.log('Domain metrics check failed:', error);
      domainMetrics = {
        domain: 'unknown',
        age: 'Check manually',
        da: 'Check manually',
        pa: 'Check manually',
        backlinks: 'Check manually',
        referringDomains: 'Check manually',
        lastChecked: new Date().toLocaleDateString()
      };
    }
    
    // Calculate scores with enhanced error handling
    const techScore = safeExecute(() => technologies.length, 'calculate tech score') || 0;
    const securityScore = safeExecute(() => Object.values(security).filter(Boolean).length, 'calculate security score') || 0;
    const seoScore = safeExecute(() => [
      seo.title && seo.title.length > 10,
      seo.description && seo.description.length > 50,
      seo.canonical !== 'Not set',
      seo.ogTitle !== 'Not set',
      seo.hasSchema
    ].filter(Boolean).length, 'calculate seo score') || 0;
    
    const accessibilityScore = safeExecute(() => Object.values(accessibility).filter(val => 
      val === true || val === 'Check manually'
    ).length, 'calculate accessibility score') || 0;
    
    const report = {
      // Basic Info with enhanced error handling
      basic: {
        url: safeExecute(() => window.location.href, 'get location href') || '',
        domain: safeExecute(() => url.hostname, 'get hostname') || '',
        title: safeExecute(() => document.title, 'get title') || '',
        description: safeExecute(() => seo.description, 'get description') || '',
        favicon: safeExecute(() => document.querySelector('link[rel="icon"]')?.href, 'get favicon') || 'Not set',
        language: safeExecute(() => document.documentElement.lang, 'get language') || 'Not set',
        charset: safeExecute(() => document.characterSet, 'get charset') || 'Not set',
        viewport: safeExecute(() => document.querySelector('meta[name="viewport"]')?.content, 'get viewport') || 'Not set'
      },
      
      // Technologies with enhanced error handling
      technologies: safeExecute(() => technologies.map(tech => ({
        name: tech.name,
        confidence: tech.confidence
      })), 'map technologies') || [],
      
      // Performance with enhanced error handling
      performance: {
        ...performance,
        score: safeExecute(() => performance.loadTime < 3000 ? 'Good' : performance.loadTime < 5000 ? 'Average' : 'Poor', 'calculate performance score') || 'Unknown'
      },
      
      // Security with enhanced error handling
      security: {
        ...security,
        score: safeExecute(() => securityScore >= 4 ? 'Good' : securityScore >= 2 ? 'Average' : 'Poor', 'calculate security score') || 'Unknown'
      },
      
      // SEO with enhanced error handling
      seo: {
        ...seo,
        score: safeExecute(() => seoScore >= 4 ? 'Good' : seoScore >= 2 ? 'Average' : 'Poor', 'calculate seo score') || 'Unknown'
      },
      
      // Accessibility with enhanced error handling
      accessibility: {
        ...accessibility,
        score: safeExecute(() => accessibilityScore >= 6 ? 'Good' : accessibilityScore >= 4 ? 'Average' : 'Poor', 'calculate accessibility score') || 'Unknown'
      },
      
      // Social Media with enhanced error handling
      social: safeExecute(() => Object.entries(social).filter(([, value]) => value).map(([key]) => key), 'filter social media') || [],
      
      // Structure with enhanced error handling
      structure: {
        ...structure,
        type: safeExecute(() => structure.hasCart ? 'E-commerce' : 
              structure.hasLogin ? 'Web Application' : 
              'Content Website', 'determine site type') || 'Unknown'
      },
      
      // Domain Metrics with enhanced error handling
      domainMetrics: domainMetrics,
      
      // Overall Score with enhanced error handling
      overallScore: safeExecute(() => Math.round((techScore + securityScore + seoScore + accessibilityScore) / 4), 'calculate overall score') || 0
    };
    
    // Generate report text with enhanced error handling
    let reportText = 'Failed to generate report text';
    try {
      reportText = generateReportText(report);
    } catch (error) {
      console.log('Report text generation failed:', error);
      reportText = `WEBSITE ANALYSIS REPORT

BASIC INFORMATION
URL: ${report.basic?.url || 'Unknown'}
Domain: ${report.basic?.domain || 'Unknown'}
Title: ${report.basic?.title || 'Unknown'}

Some data could not be processed. Please try again.`;
    }
    
    const successMessage = chrome.i18n ? chrome.i18n.getMessage('siteAnalysisCompleted') : 'Site analysis completed!';
    showSuccess(successMessage);
    
    showModal('Site Analysis Report', reportText, 'site', 'site-info');
    
    // Show coffee message when modal is closed
    setTimeout(() => {
      const modalOverlay = document.querySelector('#toolary-modal-overlay');
      if (modalOverlay) {
        let coffeeMessageShown = false;
        
        // Override the dismiss button click
        const dismissBtn = modalOverlay.querySelector('button[type="button"]');
        if (dismissBtn) {
          const originalClick = dismissBtn.onclick;
          dismissBtn.onclick = function(e) {
            if (originalClick) originalClick.call(this, e);
            if (!coffeeMessageShown) {
              coffeeMessageShown = true;
              setTimeout(() => {
                showCoffeeMessageForTool('site-info-picker');
              }, 300);
            }
          };
        }
        
        // Override the close button click
        const closeBtn = modalOverlay.querySelector('button[title*="Close"], button[title*="close"]');
        if (closeBtn) {
          const originalCloseClick = closeBtn.onclick;
          closeBtn.onclick = function(e) {
            if (originalCloseClick) originalCloseClick.call(this, e);
            if (!coffeeMessageShown) {
              coffeeMessageShown = true;
              setTimeout(() => {
                showCoffeeMessageForTool('site-info-picker');
              }, 300);
            }
          };
        }
        
        // Override ESC key and click outside
        // const originalKeydown = document.onkeydown;
        // const originalOverlayClick = modalOverlay.onclick;
        
        const handleKeydown = (e) => {
          if (e.key === 'Escape') {
            if (!coffeeMessageShown) {
              coffeeMessageShown = true;
              setTimeout(() => {
                showCoffeeMessageForTool('site-info-picker');
              }, 300);
            }
          }
        };
        
        const handleOverlayClick = (e) => {
          if (e.target === modalOverlay) {
            if (!coffeeMessageShown) {
              coffeeMessageShown = true;
              setTimeout(() => {
                showCoffeeMessageForTool('site-info-picker');
              }, 300);
            }
          }
        };
        
        document.addEventListener('keydown', handleKeydown);
        modalOverlay.addEventListener('click', handleOverlayClick);
      }
    }, 100);
    
  } catch (error) {
    handleError(error, 'generateSiteReport');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToGenerateSiteReport') : 'Failed to generate site report. Please try again.';
    showError(errorMessage);
  }
}

// Generate human-readable report text with enhanced error handling
function generateReportText(report) {
  try {
    let techList = 'None detected';
    try {
      techList = report.technologies?.map(t => t.name).join(', ') || 'None detected';
    } catch (error) {
      console.log('Tech list generation failed:', error);
    }
    
    let socialList = 'None detected';
    try {
      socialList = report.social?.join(', ') || 'None detected';
    } catch (error) {
      console.log('Social list generation failed:', error);
    }
    
    return `WEBSITE ANALYSIS REPORT

BASIC INFORMATION
URL: ${report.basic?.url || 'Unknown'}
Domain: ${report.basic?.domain || 'Unknown'}
Title: ${report.basic?.title || 'Unknown'}
Language: ${report.basic?.language || 'Unknown'}
Charset: ${report.basic?.charset || 'Unknown'}

TECHNOLOGIES DETECTED (${report.technologies?.length || 0})
${techList}

PERFORMANCE METRICS
Load Time: ${report.performance?.loadTime || 'N/A'}ms
DOM Ready: ${report.performance?.domContentLoaded || 'N/A'}ms
First Paint: ${report.performance?.firstPaint || 'N/A'}ms
Transfer Size: ${report.performance?.transferSize || 'N/A'}KB
Score: ${report.performance?.score || 'Unknown'}

SECURITY ANALYSIS
HTTPS: ${report.security?.https ? 'Enabled' : 'Disabled'}
CSP: ${report.security?.hasCSP ? 'Present' : 'Missing'}
HSTS: ${report.security?.hasHSTS ? 'Present' : 'Missing'}
Score: ${report.security?.score || 'Unknown'}

SEO ANALYSIS
Title: ${report.seo?.title?.length > 50 ? report.seo.title.substring(0, 50) + '...' : report.seo?.title || 'Unknown'}
Description: ${report.seo?.description?.length > 100 ? report.seo.description.substring(0, 100) + '...' : report.seo?.description || 'Unknown'}
Canonical: ${report.seo?.canonical !== 'Not set' ? 'Configured' : 'Not set'}
Open Graph: ${report.seo?.ogTitle !== 'Not set' ? 'Configured' : 'Not set'}
Schema: ${report.seo?.hasSchema ? 'Present' : 'Missing'}
Score: ${report.seo?.score || 'Unknown'}

ACCESSIBILITY
Language Attribute: ${report.accessibility?.hasLang ? 'Present' : 'Missing'}
Alt Text: ${report.accessibility?.hasAltText ? 'Present' : 'Missing'}
Form Labels: ${report.accessibility?.hasFormLabels ? 'Present' : 'Missing'}
Headings: ${report.accessibility?.hasHeadings ? 'Structured' : 'Needs attention'}
Landmarks: ${report.accessibility?.hasLandmarks ? 'Present' : 'Missing'}
Score: ${report.accessibility?.score || 'Unknown'}

SOCIAL MEDIA
Platforms: ${socialList}

SITE STRUCTURE
Type: ${report.structure?.type || 'Unknown'}
Has Header: ${report.structure?.hasHeader ? 'Yes' : 'No'}
Has Footer: ${report.structure?.hasFooter ? 'Yes' : 'No'}
Has Navigation: ${report.structure?.hasNavigation ? 'Yes' : 'No'}
Has Search: ${report.structure?.hasSearch ? 'Yes' : 'No'}
Page Depth: ${report.structure?.pageDepth || 0}

`;
  } catch (error) {
    handleError(error, 'generateReportText');
    return 'Failed to generate report text';
  }
}

export async function activate() {
  try {
    // Generate and show site report
    await generateSiteReport();
  } catch (error) {
    handleError(error, 'siteInfoPicker activation');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivateSiteInfoTool') : 'Failed to activate site info tool. Please try again.';
    showError(errorMessage);
  } finally {
    // Site info tool doesn't need immediate deactivation
    // Modal will handle its own cleanup when closed
  }
}

export function deactivate() {
  try {
    // Site info tool doesn't need cleanup
    const infoMessage = chrome.i18n ? chrome.i18n.getMessage('siteAnalysisCompletedInfo') : 'Site analysis completed';
    showInfo(infoMessage);
  } catch (error) {
    handleError(error, 'siteInfoPicker deactivation');
  }
}
