import { showError, handleError, showSuccess } from '../../shared/helpers.js';
import { showCoffeeMessageForTool } from '../../shared/coffeeToast.js';
import * as messageRouter from '../../core/messageRouter.js';

export const metadata = {
  id: 'pdf-generator',
  name: 'PDF Generator',
  category: 'capture',
  icon: 'pdf',
  permissions: ['activeTab', 'downloads'],
  tags: ['pdf', 'capture', 'export', 'print'],
  keywords: ['pdf', 'export', 'save', 'document', 'print']
};

let isCapturing = false;

function getFilename(url) {
  if (!url) {
    return `toolary-pdf-${Date.now()}.pdf`;
  }

  try {
    const { hostname, pathname } = new URL(url);
    const slug = `${hostname}${pathname}`
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/(^-|-$)/g, '')
      .toLowerCase();
    return `toolary-pdf-${slug || 'page'}-${Date.now()}.pdf`;
  } catch {
    return `toolary-pdf-${Date.now()}.pdf`;
  }
}

function showProgress(message = '') {
  // Remove existing progress overlay
  const existingOverlay = document.getElementById('toolary-pdf-progress');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const overlay = document.createElement('div');
  overlay.id = 'toolary-pdf-progress';
  overlay.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    max-width: 300px;
  `;

  overlay.textContent = message;
  document.body.appendChild(overlay);
}

function hideProgress() {
  const overlay = document.getElementById('toolary-pdf-progress');
  if (overlay) {
    overlay.remove();
  }
}


async function generatePDF() {
  if (isCapturing) {
    throw new Error('PDF generation already in progress');
  }

  isCapturing = true;
  
  try {
    showProgress('Generating PDF...');
    
    // Send to background script for PDF conversion
    console.log('Sending PDF_GENERATE message to background script...');
    const response = await messageRouter.sendRuntimeMessage('PDF_GENERATE', {
      filename: getFilename(window.location.href)
    });
    
    console.log('Response from background script:', response);
    
    if (!response) {
      throw new Error('No response from background script');
    }
    
    if (!response.success) {
      throw new Error(response.error || 'PDF generation failed');
    }
    
    // Check if we used window.print() method
    if (response.method === 'window.print') {
      // No UI messages for window.print - direct print for clean PDF
      console.log('PDF Generator: Print dialog opened');
      
      // Show coffee message after a delay to ensure it appears above print dialog
      setTimeout(() => {
        showCoffeeMessageForTool('pdf-generator');
      }, 1000); // 1 second delay to ensure print dialog is fully loaded
    } else {
      const message = chrome.i18n ? chrome.i18n.getMessage('pdfGeneratedAndDownloadedSuccessfully') : 'PDF generated and downloaded successfully!';
      showSuccess(message);
      
      // Show coffee message
      showCoffeeMessageForTool('pdf-generator');
    }
    
  } catch (error) {
    console.error('PDF Generator error details:', error);
    handleError(error, 'pdfGenerator.generatePDF');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToGeneratePDF', [error.message || error.toString()]) : 'Failed to generate PDF: ' + (error.message || error.toString());
    showError(errorMessage);
  } finally {
    hideProgress();
    isCapturing = false;
  }
}

export async function activate(deactivate) {
  try {
    console.log('PDF Generator activated');
    
    // Check if PDF generation is already in progress
    if (isCapturing) {
      console.log('PDF generation already in progress, skipping...');
      deactivate();
      return;
    }
    
    // Check if we can access the required APIs
    if (!chrome.runtime?.sendMessage) {
      throw new Error('Chrome runtime API not available');
    }
    
    await generatePDF();
    
    // Deactivate after completion
    deactivate();
    
  } catch (error) {
    console.error('PDF Generator activation error details:', error);
    handleError(error, 'pdfGenerator.activate');
    const errorMessage = chrome.i18n ? chrome.i18n.getMessage('failedToActivatePDFGenerator', [error.message || error.toString()]) : 'Failed to activate PDF Generator: ' + (error.message || error.toString());
    showError(errorMessage);
    deactivate();
  }
}

export function deactivate() {
  console.log('PDF Generator deactivated');
  
  // Cleanup
  hideProgress();
  isCapturing = false;
}
