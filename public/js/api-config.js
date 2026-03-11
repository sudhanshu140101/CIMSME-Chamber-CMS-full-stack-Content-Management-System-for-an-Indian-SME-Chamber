(function() {
    'use strict';
    
    // ENVIRONMENT DETECTION 
    const hostname = window.location.hostname;
const isLocalhost =
  hostname === 'localhost' ||
  hostname === '127.0.0.1';

// Use current origin 
window.API_CONFIG = {
  BASE_URL: isLocalhost
    ? 'http://localhost:3000'
    : window.location.origin,
  API_PATH: '/api',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  get API_URL() {
    return this.BASE_URL + this.API_PATH;
  },

  get ENV() {
    return isLocalhost ? 'development' : 'production';
  }
};

    
  
    // Automatically intercepts ALL fetch calls to /api/routes
    const originalFetch = window.fetch;
    
    window.fetch = function(url, options = {}) {
        // Only modify API calls
        if (typeof url === 'string' && url.startsWith('/api/')) {
            const fullUrl = `${API_CONFIG.BASE_URL}${url}`;
            console.log(` API Call: ${url} → ${fullUrl}`);
            return originalFetch(fullUrl, options);
        }
        
        // Pass through all other fetch calls unchanged
        return originalFetch(url, options);
    };
    
    //  GLOBAL API HELPER FUNCTIONS 
    
  
    window.apiCall = async function(endpoint, options = {}) {
        const url = `${API_CONFIG.API_URL}${endpoint}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);
        
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout - please try again');
            }
            
            throw error;
        }
    };
    
    
    window.apiCallWithRetry = async function(endpoint, options = {}, attempts = API_CONFIG.RETRY_ATTEMPTS) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await window.apiCall(endpoint, options);
            } catch (error) {
                if (i === attempts - 1) throw error;
                
                console.warn(` API call failed (attempt ${i + 1}/${attempts}). Retrying...`);
                await new Promise(resolve => setTimeout(resolve, API_CONFIG.RETRY_DELAY * (i + 1)));
            }
        }
    };
    
    //  LOADING OVERLAY 
    
    window.showLoading = function(message = 'Loading...') {
        let overlay = document.getElementById('apiLoadingOverlay');
        
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'apiLoadingOverlay';
            overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            overlay.style.display = 'none';
            overlay.innerHTML = `
                <div class="bg-white rounded-lg p-6 shadow-xl flex flex-col items-center">
                    <div class="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mb-4"></div>
                    <p class="text-gray-700 font-semibold" id="loadingMessage">${message}</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        
        const messageEl = overlay.querySelector('#loadingMessage');
        if (messageEl) messageEl.textContent = message;
        overlay.style.display = 'flex';
    };
    
    window.hideLoading = function() {
        const overlay = document.getElementById('apiLoadingOverlay');
        if (overlay) overlay.style.display = 'none';
    };
    
    // TOAST NOTIFICATIONS 
    
    window.showToast = function(message, type = 'info', duration = 3000) {
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        // Remove existing toasts
        document.querySelectorAll('.api-toast').forEach(t => t.remove());
        
        const toast = document.createElement('div');
        toast.className = `api-toast fixed top-4 right-4 ${colors[type]} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 z-50`;
        toast.style.animation = 'slideInRight 0.3s ease-out';
        toast.innerHTML = `
            <span class="text-2xl">${icons[type]}</span>
            <span class="font-semibold">${message}</span>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    };
    
    // ERROR HANDLER 
    
    window.handleApiError = function(error, userMessage = 'Something went wrong') {
        console.error(' API Error:', error);
        
        if (!navigator.onLine) {
            window.showToast('No internet connection', 'error');
            return;
        }
        
        if (error.message && error.message.includes('timeout')) {
            window.showToast('Request timeout - please try again', 'warning');
            return;
        }
        
        if (error.message && error.message.includes('401')) {
            window.showToast('Session expired - please login again', 'warning');
            return;
        }
        
        window.showToast(userMessage, 'error');
    };
    
    //  NETWORK STATUS MONITORING 
    
    window.addEventListener('online', () => {
        window.showToast('Connection restored!', 'success');
    });
    
    window.addEventListener('offline', () => {
        window.showToast('No internet connection', 'error');
    });
    
    //  ADD REQUIRED CSS 
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        
        #apiLoadingOverlay {
            backdrop-filter: blur(4px);
        }
        
        .api-toast {
            max-width: 400px;
            word-wrap: break-word;
        }
    `;
    document.head.appendChild(style);
    
    // INITIALIZATION LOG 
    
    console.log(' CIMSME API CONFIG LOADED', 'color: #22c55e; font-weight: bold; font-size: 16px; padding: 4px 8px; background: #dcfce7; border-radius: 4px;');
    console.log(' Environment: ' + API_CONFIG.ENV, 'color: #3b82f6; font-weight: bold;');
    console.log(' Base URL: ' + API_CONFIG.BASE_URL, 'color: #3b82f6; font-weight: bold;');
    console.log(' API URL: ' + API_CONFIG.API_URL, 'color: #3b82f6; font-weight: bold;');
    console.log('All fetch() calls to /api/* are now automatic!', 'color: #f59e0b; font-weight: bold;');
    
})();
