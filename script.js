// Configuratie data
const productData = {
    knikarm: {
        name: 'Knikarm',
        models: [
            { value: 'knikarm-model1', name: 'Knikarm Model 1', image: 'assets/models/model1.webp' }
        ]
    },
    markiezen: {
        name: 'Markiezen',
        models: [
            { value: 'markiezen-model1', name: 'Markiezen Model 1', image: 'assets/models/markiezen_real.jpg' }
        ]
    }
}

// Function to show popup notification
function showPopupNotification(message) {
    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'popup-notification';
    popup.innerHTML = `
        <div class="popup-content">
            <div class="popup-icon">✅</div>
            <div class="popup-message">${message}</div>
            <button class="popup-close" onclick="closePopup(this)">×</button>
        </div>
    `;
    
    // Add to body
    document.body.appendChild(popup);
    
    // Show popup with animation
    setTimeout(() => {
        popup.classList.add('show');
    }, 10);
    
    // Auto close after 5 seconds
    setTimeout(() => {
        closePopup(popup.querySelector('.popup-close'));
    }, 5000);
}

// Function to close popup
function closePopup(button) {
    const popup = button.closest('.popup-notification');
    popup.classList.remove('show');
    setTimeout(() => {
        if (popup.parentNode) {
            popup.parentNode.removeChild(popup);
        }
    }, 300);
};

const colorOptions = [
    { 
        value: 'lichtgrijs-wit-gestreept', 
        name: 'Lichtgrijs met Wit (Gestreept)', 
        image: 'assets/colors/lichtgrijs-wit-gestreept.jpg' 
    },
    { 
        value: 'gebroken-wit-creme-gestreept', 
        name: 'Gebroken Wit/Crème (Gestreept)', 
        image: 'assets/colors/gebroken-wit-creme-gestreept.jpg' 
    },
    { 
        value: 'loodgrijs-effen', 
        name: 'Loodgrijs (Effen)', 
        image: 'assets/colors/loodgrijs-effen.png' 
    },
    { 
        value: 'oranje', 
        name: 'Oranje', 
        image: 'assets/colors/oranje.jpg' 
    }
];

// DOM elementen
const productTypeSelect = document.getElementById('product-type');
const modelSelection = document.getElementById('model-selection');
const modelOptions = document.getElementById('model-options');
const colorSelection = document.getElementById('color-selection');
const colorOptionsContainer = document.getElementById('color-options');
const imageUpload = document.getElementById('image-upload');
const houseImageInput = document.getElementById('house-image');
const uploadArea = document.querySelector('.upload-area');
const imagePreview = document.getElementById('image-preview');
const previewImage = document.getElementById('preview-image');
const removeImageBtn = document.getElementById('remove-image');
const placementArea = document.getElementById('placement-area');
const placementInstructionInput = document.getElementById('placement-instruction');
const placementImagePreview = document.getElementById('placement-image-preview');
const charCountElement = document.getElementById('char-count');
const generateBtn = document.getElementById('generate-visualization');
const visualizationArea = document.querySelector('.visualization-area');

// State management
const appState = {
    productType: '',
    model: '',
    color: '',
    houseImage: null
};

// API Configuration is loaded from config.js

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    console.log('Initializing app...');
    console.log('houseImageInput:', houseImageInput);
    console.log('uploadArea:', uploadArea);
    
    // Product type change
    productTypeSelect.addEventListener('change', handleProductTypeChange);
    
    // Image upload
    if (houseImageInput) {
        houseImageInput.addEventListener('change', handleImageUpload);
        console.log('Image upload event listener attached');
    } else {
        console.error('houseImageInput not found!');
    }
    
    // Drag and drop
    if (uploadArea) {
        uploadArea.addEventListener('dragover', handleDragOver);
        uploadArea.addEventListener('drop', handleDrop);
        uploadArea.addEventListener('dragleave', handleDragLeave);
        console.log('Drag and drop event listeners attached');
    } else {
        console.error('uploadArea not found!');
    }
    
    // Remove image
    removeImageBtn.addEventListener('click', removeImage);
    
    // Email notification checkbox
    const emailNotificationCheckbox = document.getElementById('email-notifications');
    const emailNotificationFields = document.getElementById('email-notification-fields');

    if (emailNotificationCheckbox && emailNotificationFields) {
        emailNotificationCheckbox.addEventListener('change', () => {
            if (emailNotificationCheckbox.checked) {
                emailNotificationFields.style.display = 'block';
            } else {
                emailNotificationFields.style.display = 'none';
            }
        });
    }

    // Price indication checkbox
    const priceIndicationCheckbox = document.getElementById('price-indication');
    const priceIndicationFields = document.getElementById('price-indication-fields');

    if (priceIndicationCheckbox && priceIndicationFields) {
        priceIndicationCheckbox.addEventListener('change', () => {
            if (priceIndicationCheckbox.checked) {
                priceIndicationFields.style.display = 'block';
            } else {
                priceIndicationFields.style.display = 'none';
            }
        });
    }
    
    // Generate button
    generateBtn.addEventListener('click', generateVisualization);
    
    // Initialize color options
    renderColorOptions();
    
    // Update generate button state
    updateGenerateButton();
}

function handleProductTypeChange() {
    const selectedType = productTypeSelect.value;
    appState.productType = selectedType;
    appState.model = '';
    
    if (selectedType && productData[selectedType]) {
        modelSelection.style.display = 'block';
        renderModelOptions(productData[selectedType].models);
    } else {
        modelSelection.style.display = 'none';
        modelOptions.innerHTML = '';
    }
    
    updateGenerateButton();
}

function renderModelOptions(models) {
    modelOptions.innerHTML = '';
    
    models.forEach(model => {
        const modelOption = document.createElement('div');
        modelOption.className = 'model-option';
        modelOption.innerHTML = `
            <input type="radio" name="model" value="${model.value}" id="model-${model.value}">
            <div class="model-content">
                <img src="${model.image}" alt="${model.name}" class="model-image" />
                <div class="model-name">${model.name}</div>
            </div>
        `;
        
        const radioInput = modelOption.querySelector('input[type="radio"]');
        radioInput.addEventListener('change', () => {
            if (radioInput.checked) {
                appState.model = model.value;
                updateGenerateButton();
            }
        });
        
        modelOptions.appendChild(modelOption);
    });
}

function renderColorOptions() {
    colorOptionsContainer.innerHTML = '';
    
    colorOptions.forEach(color => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color-option';
        colorOption.innerHTML = `
            <input type="radio" name="color" value="${color.value}" id="color-${color.value}">
            <div class="color-swatch">
                <img src="${color.image}" alt="${color.name}" />
            </div>
            <div class="color-content">
                <span class="color-name">${color.name}</span>
            </div>
        `;
        
        colorOption.addEventListener('click', () => {
            // Remove previous selection
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('selected'));
            // Add selection to current
            colorOption.classList.add('selected');
            // Check the radio button
            colorOption.querySelector('input[type="radio"]').checked = true;
            appState.color = color.value;
            
            // Show image upload section
            imageUpload.style.display = 'block';
            
            updateGenerateButton();
        });
        
        colorOptionsContainer.appendChild(colorOption);
    });
}

function handleImageUpload(event) {
    console.log('handleImageUpload called');
    const file = event.target.files[0];
    console.log('File selected:', file);
    if (file && file.type.startsWith('image/')) {
        console.log('File is valid image, processing...');
        processImageFile(file);
    } else {
        console.log('No valid image file selected');
    }
}

function handleDragOver(event) {
    event.preventDefault();
    uploadArea.classList.add('dragover');
}

function handleDrop(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = event.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith('image/')) {
        processImageFile(files[0]);
    }
}

function handleDragLeave(event) {
    event.preventDefault();
    uploadArea.classList.remove('dragover');
}

function processImageFile(file) {
    console.log('processImageFile called with:', file.name);
    const reader = new FileReader();
    reader.onload = function(e) {
        console.log('File read successfully, data URL length:', e.target.result.length);
        appState.houseImage = e.target.result;
        showImagePreview(e.target.result);
        setupPlacementInput(e.target.result);
    };
    reader.onerror = function(e) {
        console.error('Error reading file:', e);
    };
    reader.readAsDataURL(file);
}

function showImagePreview(imageSrc) {
    console.log('showImagePreview called');
    previewImage.src = imageSrc;
    imagePreview.style.display = 'block';
    uploadArea.style.display = 'none';
    placementArea.style.display = 'block';
    console.log('placementArea display set to:', placementArea.style.display);
    updateGenerateButton();
}

function removeImage() {
    appState.houseImage = null;
    
    imagePreview.style.display = 'none';
    uploadArea.style.display = 'block';
    placementArea.style.display = 'none';
    houseImageInput.value = '';
    clearPlacementInstruction();
    updateGenerateButton();
}

function setupPlacementInput(imageSrc) {
    console.log('setupPlacementInput called with imageSrc length:', imageSrc ? imageSrc.length : 'null');
    
    // Hide the main image preview
    imagePreview.style.display = 'none';
    console.log('Main image preview hidden');
    
    // Show the image preview in the placement area
    if (placementImagePreview) {
        placementImagePreview.onload = function() {
            console.log('Placement image loaded:', placementImagePreview.naturalWidth, 'x', placementImagePreview.naturalHeight);
            placementImagePreview.style.display = 'block';
            console.log('Placement image display after load:', window.getComputedStyle(placementImagePreview).display);
            initializeDrawing();
        };
        placementImagePreview.onerror = function(e) {
            console.error('Placement image failed to load:', e);
        };
        placementImagePreview.src = imageSrc;
        console.log('Placement image src set:', placementImagePreview.src.substring(0, 50) + '...');
        console.log('Placement image initial computed display:', window.getComputedStyle(placementImagePreview).display);
    } else {
        console.error('placementImagePreview element not found!');
    }
}



function updateGenerateButton() {
    const isComplete = appState.productType && 
                      appState.model && 
                      appState.color && 
                      appState.houseImage;
    
    generateBtn.disabled = !isComplete;
    
    if (isComplete) {
        generateBtn.textContent = 'Genereer Visualisatie';
        generateBtn.classList.remove('disabled');
    } else {
        generateBtn.textContent = 'Vul alle velden in om te genereren';
        generateBtn.classList.add('disabled');
    }
}

function generateVisualization() {
    if (generateBtn.disabled) return;
    
    // Show loading state
    generateBtn.textContent = 'Genereren...';
    generateBtn.disabled = true;
    
    // Call API immediately
    callVisualizationAPI();
}

// Helper function to get canvas with drawn lines as base64
async function getCompositedImage(originalBase64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const drawingCanvas = document.getElementById('drawing-canvas');
      ctx.drawImage(drawingCanvas, 0, 0, drawingCanvas.width, drawingCanvas.height, 0, 0, tempCanvas.width, tempCanvas.height);
      resolve(tempCanvas.toDataURL('image/png'));
    };
    img.src = originalBase64;
  });
}

// Helper function to get selected model reference image
function getSelectedModelImage() {
    const selectedModel = appState.model;
    const productType = appState.productType;
    
    if (!selectedModel || !productType || !productData[productType]) {
        return null;
    }
    
    const modelData = productData[productType].models.find(m => m.value === selectedModel);
    return modelData ? modelData.image : null;
}

// Helper function to convert image URL to base64
async function imageUrlToBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error converting image to base64:', error);
        return null;
    }
}

// Helper function to map color values to Dutch names
function getColorName(colorValue) {
    const colorMapping = {
        'lichtgrijs-wit-gestreept': 'light grey and white striped fabric',
        'gebroken-wit-creme-gestreept': 'broken white and cream striped fabric',
        'loodgrijs-effen': 'dark lead grey solid fabric',
        'oranje': 'bright orange solid fabric'
    };
    
    return colorMapping[colorValue] || 'light grey and white striped fabric';
}

// Helper function to determine pattern type and stripe ratio
function getPatternInfo(colorValue) {
    if (colorValue.includes('gestreept')) {
        return {
            pattern_type: 'striped',
            stripe_ratio: '1:1' // Default ratio for striped patterns
        };
    } else {
        return {
            pattern_type: 'solid',
            stripe_ratio: null
        };
    }
}

// Helper function to collect email notification data
function getEmailNotificationData() {
    const emailNotificationCheckbox = document.getElementById('email-notifications');
    
    if (!emailNotificationCheckbox || !emailNotificationCheckbox.checked) {
        return {
            send_notifications: false,
            customer_email: null,
            customer_name: null
        };
    }
    
    const customerEmail = document.getElementById('customer-email')?.value;
    const customerName = document.getElementById('customer-name')?.value;
    
    return {
        send_notifications: true,
        customer_email: customerEmail || null,
        customer_name: customerName || null
    };
}

// Helper function to collect price indication data
function getPriceIndicationData() {
    const priceIndicationCheckbox = document.getElementById('price-indication');
    console.log('[DEBUG] Price indication checkbox found:', !!priceIndicationCheckbox);
    console.log('[DEBUG] Price indication checkbox checked:', priceIndicationCheckbox?.checked);
    
    if (priceIndicationCheckbox && priceIndicationCheckbox.checked) {
        const width = document.getElementById('width').value;
        const projection = document.getElementById('projection').value;
        const verdieping = document.getElementById('verdieping').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const customerName = document.getElementById('customer-name')?.value;

        const priceData = {
            width: width ? parseFloat(width) : null,
            projection: projection ? parseFloat(projection) : null,
            verdieping: verdieping || null,
            email: email || null,
            phone: phone || null,
            customerName: customerName || null
        };
        
        console.log('[DEBUG] Price indication data collected:', priceData);
        return priceData;
    }
    console.log('[DEBUG] Price indication checkbox not checked or not found, returning null');
    return null;
}

// Helper function to get selected color swatch image as base64
async function getSelectedColorSwatchImage() {
    if (!appState.color) {
        console.log('[DEBUG] No color selected');
        return null;
    }
    
    // Find the selected color option
    const selectedColorOption = colorOptions.find(option => option.value === appState.color);
    if (!selectedColorOption) {
        console.log('[DEBUG] Selected color option not found:', appState.color);
        return null;
    }
    
    console.log('[DEBUG] Getting color swatch image for:', selectedColorOption.name, 'from:', selectedColorOption.image);
    
    try {
        const swatchImageBase64 = await imageUrlToBase64(selectedColorOption.image);
        if (swatchImageBase64) {
            console.log('[DEBUG] ✓ Color swatch image converted to base64 successfully');
            return swatchImageBase64;
        } else {
            console.log('[DEBUG] ✗ Failed to convert color swatch image to base64');
            return null;
        }
    } catch (error) {
        console.error('[DEBUG] Error getting color swatch image:', error);
        return null;
    }
}

// Main API call function
async function callVisualizationAPI() {
    let timeoutId;
    try {
        // Show loading state
        showLoadingState();
        
        // Validate API configuration
        if (!API_CONFIG.url || API_CONFIG.url === 'YOUR_EDGE_FUNCTION_URL_HERE') {
            throw new Error('API configuratie ontbreekt. Controleer config.js.');
        }
        
        // Validate required data
        if (!appState.houseImage) {
            throw new Error('Ontbrekende gegevens: zorg ervoor dat u een afbeelding heeft geüpload.');
        }
        
        // Composite the image with drawn line
        const compositedImage = await getCompositedImage(appState.houseImage);
        
        // Get model reference image
        const modelImageUrl = getSelectedModelImage();
        if (!modelImageUrl) {
            throw new Error('Kon geen model afbeelding vinden.');
        }
        
        // Convert model image to base64
        const modelImageBase64 = await imageUrlToBase64(modelImageUrl);
        if (!modelImageBase64) {
            throw new Error('Kon model afbeelding niet laden.');
        }
        
        // Get pattern information
        const patternInfo = getPatternInfo(appState.color);
        
        // Get color swatch image for accurate color reference
        const colorSwatchImage = await getSelectedColorSwatchImage();
        
        // Prepare API payload with safe defaults
        const payload = {
            image_data: compositedImage || '',
            new_awning_reference_image: modelImageBase64 || '',
            new_awning_type: appState.productType || '',
            new_fabric_color: getColorName(appState.color) || '',
            pattern_type: patternInfo.pattern_type || 'solid',
            stripe_ratio: patternInfo.stripe_ratio || 0.5,
            color_swatch_image: colorSwatchImage || ''
        };
        
        // Add email notification data
        const emailData = getEmailNotificationData();
        
        // Add price indication data if available
        const priceData = getPriceIndicationData();
        console.log('[DEBUG] Price data from getPriceIndicationData():', priceData);
        
        // Determine email notification settings
        let finalSendNotifications = emailData.send_notifications;
        let finalCustomerEmail = emailData.customer_email;
        let finalCustomerName = emailData.customer_name;
        
        if (priceData) {
            // Add price indication parameters directly to the root level of payload
            payload.width = priceData.width;
            payload.projection = priceData.projection;
            payload.verdieping = priceData.verdieping;
            payload.include_price_indication = true;
            
            // Auto-enable email notifications for price indication if email is provided
            if (priceData.email) {
                finalSendNotifications = true;
                finalCustomerEmail = priceData.email;
                console.log('[DEBUG] Auto-enabling email notifications for price indication with email:', priceData.email);
                
                // Use customer name from email notifications if available, otherwise from price indication
                if (!finalCustomerName && priceData.customerName) {
                    finalCustomerName = priceData.customerName;
                }
            }
            
            console.log('[DEBUG] Added price indication parameters to root level of payload');
        } else {
            payload.include_price_indication = false;
        }
        
        // Set final email notification values
        payload.send_notifications = finalSendNotifications;
        payload.customer_email = finalCustomerEmail;
        payload.customer_name = finalCustomerName;
        
        // Determine which endpoint to use based on price indication data
        const apiUrl = priceData ? API_CONFIG.priceIndicationUrl : API_CONFIG.url;
        const endpointType = priceData ? 'smooth-function (price indication)' : 'hyper-worker (visualization)';
        
        console.log(`[DEBUG] API_CONFIG.priceIndicationUrl:`, API_CONFIG.priceIndicationUrl);
        console.log(`[DEBUG] API_CONFIG.url:`, API_CONFIG.url);
        console.log(`[DEBUG] priceData truthy:`, !!priceData);
        console.log(`[DEBUG] Selected apiUrl:`, apiUrl);
        console.log(`[Edge] Using endpoint: ${endpointType} - ${apiUrl}`);
        
        // Debug payload structure
        console.warn('[Edge] Payload validation:');
        Object.keys(payload).forEach(key => {
            const value = payload[key];
            const type = typeof value;
            const isValid = value !== null && value !== undefined && value !== '';
            console.warn(`  ${key}: ${type} (${isValid ? 'valid' : 'INVALID'}) - ${type === 'string' ? value.substring(0, 50) + '...' : value}`);
        });
        
        const sizeHouseKB = Math.round((appState.houseImage.length * 3) / 4 / 1024);
        const sizeModelKB = Math.round((modelImageBase64.length * 3) / 4 / 1024);
        const sizeColorKB = colorSwatchImage ? Math.round((colorSwatchImage.length * 3) / 4 / 1024) : 0;
        console.log(`Payload image sizes ~ House: ${sizeHouseKB}KB, Model: ${sizeModelKB}KB, Color Swatch: ${sizeColorKB}KB`);
        console.log('Sending API request with payload:', {
            ...payload,
            image_data: 'base64_data_present',
            new_awning_reference_image: 'base64_data_present',
            color_swatch_image: colorSwatchImage ? 'base64_data_present' : 'not_provided'
        });
        
        // Create AbortController for better timeout control
        const controller = new AbortController();
        
        // Set up timeout
        timeoutId = setTimeout(() => {
            controller.abort();
        }, API_CONFIG.timeout);
        
        // Make fetch request with abort signal (with domain fallback)
        // Add cache-busting parameter to force fresh request
        const cacheBustUrl = apiUrl + '?t=' + Date.now() + '&r=' + Math.random();
        console.info(`[Edge] POST ${cacheBustUrl}`);
        
        // Quick connectivity check first
        try {
            const healthCheck = await fetch(apiUrl, {
                method: 'OPTIONS',
                headers: {
                    'Authorization': `Bearer ${API_CONFIG.key}`,
                    'apikey': API_CONFIG.key
                },
                signal: AbortSignal.timeout(5000) // 5 second timeout for health check
            });
            console.info(`[Edge] Health check status: ${healthCheck.status}`);
        } catch (healthError) {
            console.warn(`[Edge] Health check failed:`, healthError);
        }
        let response;
        try {
            response = await fetch(cacheBustUrl, {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'Authorization': `Bearer ${API_CONFIG.key}`,
                     'apikey': API_CONFIG.key,
                     'X-Client-Info': 'supabase-js/2.0.0',
                     'Cache-Control': 'no-cache, no-store, must-revalidate',
                     'Pragma': 'no-cache',
                     'Expires': '0'
                 },
                 cache: 'no-store',
                 body: JSON.stringify(payload),
                 signal: controller.signal
             });
        } catch (primaryError) {
            // Try alternate Supabase functions domain if primary fails immediately
            const altUrl = apiUrl.includes('.supabase.co/functions/v1/')
                ? apiUrl.replace('.supabase.co/functions/v1/', '.functions.supabase.co/')
                : (apiUrl.includes('.functions.supabase.co/')
                    ? apiUrl.replace('.functions.supabase.co/', '.supabase.co/functions/v1/')
                    : null);
            if (altUrl) {
                console.info(`[Edge] Primary failed; trying alt URL: ${altUrl}`);
                response = await fetch(altUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${API_CONFIG.key}`
                    },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
            } else {
                throw primaryError;
            }
        }
        
        // Clear timeout if request succeeds
        clearTimeout(timeoutId);
        
        console.info(`[Edge] Status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            throw new Error(`API fout: ${response.status} ${response.statusText}`);
        }
        
        // Read raw response for debugging, then parse JSON
        const rawText = await response.clone().text();
        console.warn('[Edge] Raw response preview:', rawText.slice(0, 300));
        console.warn('[Edge] Response headers:');
        const headers = Object.fromEntries(response.headers.entries());
        console.warn(headers);
        
        // Check for Supabase-specific headers
        if (headers['x-edge-function-name']) {
            console.warn('[Edge] ✅ Edge function called:', headers['x-edge-function-name']);
        } else {
            console.warn('[Edge] ❌ No x-edge-function-name header - request may be cached/proxied');
        }
        let result;
        try {
            result = await response.json();
            console.warn('[Edge] Parsed JSON result:', result);
        } catch (parseErr) {
            console.error('[Edge] JSON parse failed:', parseErr);
            throw new Error(`Ongeldige serverrespons (geen JSON).`);
        }
        
        // Handle successful response
        handleAPISuccess(result);
        
    } catch (error) {
        // Clear timeout in case of error
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        
        console.error('API call failed:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
        
        // Handle different types of errors
        console.error('API Error:', error);
        
        // Reset button state
        generateBtn.textContent = 'Genereer Visualisatie';
        generateBtn.disabled = false;
    }
}

// Function to show loading state
function showLoadingState() {
    const loadingHTML = `
        <div class="loading-state">
            <div class="spinner"></div>
            <div class="loading-content">
                <h3>Bezig met genereren...</h3>
                <p>Uw visualisatie wordt gegenereerd. Dit kan 30-90 seconden duren.</p>
                <div class="progress-steps">
                    <div class="step active">📸 Afbeelding analyseren</div>
                    <div class="step">🎨 Zonnescherm plaatsen</div>
                    <div class="step">✨ Resultaat optimaliseren</div>
                </div>
            </div>
        </div>
    `;
    
    visualizationArea.innerHTML = loadingHTML;
    visualizationArea.style.display = 'block';
}

// Function to handle successful API response
function handleAPISuccess(result) {
    console.log('API Success:', result);

    // Show simple popup notification
    const customerEmail = document.getElementById('customer-email').value;
    showPopupNotification(`Uw visualisatie is begonnen! We sturen het per mail naar ${customerEmail} toe.`);
    
    // Reset the form for a new visualization
    resetVisualization();

    // Reset button
    generateBtn.textContent = 'Genereer Nieuwe Visualisatie';
    generateBtn.disabled = false;
}



// Helper functions for result actions
// downloadResult function removed - results are only delivered via email

function resetVisualization() {
    // Reset all form data
    appState.productType = '';
    appState.model = '';
    appState.color = '';
    appState.houseImage = null;
    
    // Reset UI
    document.getElementById('product-type').value = '';
    document.getElementById('model-selection').style.display = 'none';
    document.getElementById('color-selection').style.display = 'none';
    document.getElementById('image-upload').style.display = 'none';
    document.getElementById('placement-area').style.display = 'none';
    document.querySelector('.visualization-area').innerHTML = '';
    
    updateGenerateButton();
}

// Image Modal Functions removed - results are only delivered via email


function initializeDrawing() {
  const canvas = document.getElementById('drawing-canvas');
  if (!canvas) {
    console.error('Drawing canvas not found!');
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const image = document.getElementById('placement-image-preview');
  
  // Set initial canvas size
  canvas.width = image.clientWidth;
  canvas.height = image.clientHeight;
  
  // Add resize listener
  window.addEventListener('resize', () => {
    canvas.width = image.clientWidth;
    canvas.height = image.clientHeight;
  });
  
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    isDrawing = true;
  });
  
  canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 3;
    ctx.stroke();
  });
  
  canvas.addEventListener('mouseup', () => {
    isDrawing = false;
  });
  
  canvas.addEventListener('mouseleave', () => {
    isDrawing = false;
  });
  
  document.getElementById('clear-line').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
}