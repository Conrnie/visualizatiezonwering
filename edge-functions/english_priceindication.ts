// @ts-nocheck
import { decode, encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID');
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET');
const GMAIL_REFRESH_TOKEN = Deno.env.get('GMAIL_REFRESH_TOKEN');
const GMAIL_SENDER_EMAIL = Deno.env.get('GMAIL_SENDER_EMAIL');
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
class GmailAPIService {
  constructor(clientId, clientSecret, refreshToken, senderEmail){
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.senderEmail = senderEmail;
    this.accessToken = null;
    this.tokenExpiry = null;
  }
  async getAccessToken() {
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Failed to get access token: ${data.error_description}`);
    }
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000; // 1-minute buffer
    return this.accessToken;
  }
  async sendEmail(to, subject, htmlContent, attachments = []) {
    console.log('=== SEND EMAIL METHOD START ===');
    console.log('Getting access token...');
    const accessToken = await this.getAccessToken();
    console.log('Access token obtained successfully');
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let email = [
      `From: ${this.senderEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      '',
      htmlContent,
      ''
    ];
    attachments.forEach((attachment)=>{
      email.push(`--${boundary}`);
      email.push(`Content-Type: ${attachment.mimeType}; name="${attachment.filename}"`);
      if (attachment.contentId) {
        email.push(`Content-Disposition: inline; filename="${attachment.filename}"`);
        email.push(`Content-ID: <${attachment.contentId}>`);
      } else {
        email.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
      }
      email.push(`Content-Transfer-Encoding: base64`);
      email.push('');
      email.push(attachment.base64Data);
      email.push('');
    });
    email.push(`--${boundary}--`);
    
    console.log('Encoding email content...');
    console.log('Email parts count:', email.length);
    console.log('Total email content length:', email.join('\r\n').length);
    
    let rawEmail;
    try {
      rawEmail = encode(email.join('\r\n'));
      console.log('Email encoded successfully, base64 length:', rawEmail.length);
    } catch (error) {
      console.error('Failed to encode email content:', error);
      console.error('Email subject:', subject);
      throw new Error('Email content encoding failed');
    }

    // Retry logic for network issues
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Sending email attempt ${attempt + 1}/${maxRetries + 1}`);
        
        const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            raw: rawEmail
          })
        });
        
        const result = await response.json();
        if (!response.ok) {
          throw new Error(`Gmail API error: ${result.error?.message || 'Unknown error'}`);
        }
        
        console.log(`Email sent successfully on attempt ${attempt + 1}`);
        return result;
        
      } catch (error) {
        const isNetworkError = error.message.includes('connection reset') || 
                              error.message.includes('connection error') ||
                              error.message.includes('network error') ||
                              error.message.includes('ECONNRESET');
        
        if (isNetworkError && attempt < maxRetries) {
          console.log(`Network error on attempt ${attempt + 1}, retrying in ${retryDelays[attempt]}ms...`);
          console.log(`Error details: ${error.message}`);
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
          continue;
        }
        
        // If it's not a network error or we've exhausted retries, throw the error
        console.error(`Email sending failed after ${attempt + 1} attempts:`, error.message);
        throw error;
      }
    }
  }
  async sendStartNotification(customerEmail, customerName) {
    const subject = 'Your Awning Visualization Is Being Prepared';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Hello ${customerName || 'there'}!</h2>
          
          <p style="color: #555; line-height: 1.6;">Thanks for your request! We're now creating your personalized awning visualization and price estimate.</p>
          
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db;">
            <h3 style="color: #2c3e50; margin-top: 0;">⏳ What happens next?</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>Our AI analyzes your photo</li>
              <li>We place the awning in the best position</li>
              <li>We calculate your personalized price estimate</li>
              <li>You’ll receive the results within a few minutes</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 20px 0;">
            <div style="background: #28a745; color: white; padding: 15px; border-radius: 8px; display: inline-block;">
              <strong>🔄 Processing...</strong>
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; text-align: center;">This process usually takes 2–5 minutes.</p>
        </div>
      </div>
    `;
    return await this.sendEmail(customerEmail, subject, htmlContent);
  }
  async sendCompletionNotification(customerEmail, customerName, awningType, processedImage, goalAchieved, score, priceData = null) {
    console.log('=== COMPLETION EMAIL START ===');
    console.log('Parameters received:');
    console.log('- customerEmail:', customerEmail);
    console.log('- customerName:', customerName);
    console.log('- awningType:', awningType);
    console.log('- processedImage length:', processedImage ? processedImage.length : 'null');
    console.log('- goalAchieved:', goalAchieved);
    console.log('- score:', score);
    console.log('- priceData:', !!priceData);
    
    // Get display name for awning type
    const calculator = new PriceCalculator();
    const awningDisplayName = calculator.getAwningDisplayName(awningType);
    
    const subject = goalAchieved ? 'Your Awning Visualization Is Ready!' : 'Your Awning Visualization – Result Available';
    console.log('Email subject:', subject);
    const priceSection = priceData ? `
      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="color: #2c3e50; margin-top: 0;">💰 Price Estimate</h3>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #555;">Base awning price:</span>
          <span style="font-weight: bold;">€${priceData.basePrice.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #555;">Installation (${priceData.floor}):</span>
          <span style="font-weight: bold;">€${priceData.installationCost.toFixed(2)}</span>
        </div>
        ${priceData.colorSurcharge > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #555;">Color surcharge:</span>
          <span style="font-weight: bold;">€${priceData.colorSurcharge.toFixed(2)}</span>
        </div>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 18px;">
          <span style="color: #2c3e50; font-weight: bold;">Total price (incl. VAT):</span>
          <span style="color: #e74c3c; font-weight: bold; font-size: 20px;">€${priceData.totalPrice.toFixed(2)}</span>
        </div>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <p style="color: #856404; margin: 0; font-size: 14px;">
          <strong>⚠️ Note:</strong> This is an indicative price. The final price may differ after an in‑home measurement and consultation.
        </p>
      </div>
    ` : '';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Hello ${customerName || 'there'}!</h2>
          
          <p style="color: #555; line-height: 1.6;">Your awning visualization is complete! Below you’ll find the result${priceData ? ' including a price estimate' : ''}:</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <h3 style="color: #2c3e50;">🏠 Your Awning Visualization</h3>
            <img src="cid:visualization" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" alt="Awning visualization">
            <p style="color: #666; font-size: 12px; margin-top: 10px;">This is how your new ${awningDisplayName} could look</p>
          </div>
          
          ${priceData ? `
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db;">
            <h3 style="color: #2c3e50; margin-top: 0;">📋 Specifications</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li><strong>Awning type:</strong> ${priceData.awningType}</li>
              <li><strong>Dimensions:</strong> ${cmToFeet(priceData.width)}ft wide × ${cmToFeet(priceData.projection)}ft projection</li>
              <li><strong>Area:</strong> ${sqMeterToSqFeet(priceData.area)} sq ft</li>
              <li><strong>Floor:</strong> ${priceData.floor}</li>
              <li><strong>Color:</strong> ${priceData.fabricColor || 'Standard'}</li>
            </ul>
          </div>
          ` : ''}
          
          ${priceSection}
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #555; margin-bottom: 15px;">Interested in this visualization${priceData ? ' and price estimate' : ''}?</p>
            <a href="tel:+31123456789" style="background: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px;">📞 Call us</a>
            <a href="mailto:info@example.com" style="background: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px;">✉️ Email us</a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px;">
            <p>This visualization${priceData ? ' and price estimate' : ''} is valid for 30 days from ${new Date().toLocaleDateString('en-GB')}.</p>
            <p>Thank you for your trust in our service!</p>
          </div>
        </div>
      </div>
    `;
    // Prepare attachments
    const attachments = [];
    if (processedImage) {
      try {
        // Extract base64 data from data URI
        const base64Match = processedImage.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
        let base64Data = base64Match ? base64Match[1] : processedImage;
        
        // Check image size (base64 is ~33% larger than binary)
        const estimatedSizeBytes = (base64Data.length * 3) / 4;
        const maxSizeBytes = 20 * 1024 * 1024; // 20MB limit for safety
        
        console.log(`Image size: ${(estimatedSizeBytes / 1024 / 1024).toFixed(2)}MB`);
        
        if (estimatedSizeBytes > maxSizeBytes) {
          console.log('Image too large for email, compressing...');
          
          // Decode base64 to get image data
          const imageData = decode(base64Data);
          
          // Load image and compress
          const image = await Image.decode(imageData);
          
          // Calculate new dimensions (max 1200px width while maintaining aspect ratio)
          const maxWidth = 1200;
          let newWidth = image.width;
          let newHeight = image.height;
          
          if (newWidth > maxWidth) {
            const ratio = maxWidth / newWidth;
            newWidth = maxWidth;
            newHeight = Math.round(newHeight * ratio);
          }
          
          // Resize if needed
          if (newWidth !== image.width || newHeight !== image.height) {
            console.log(`Resizing image from ${image.width}x${image.height} to ${newWidth}x${newHeight}`);
            image.resize(newWidth, newHeight);
          }
          
          // Encode as JPEG with quality 80
          const compressedImageData = await image.encodeJPEG(80);
          base64Data = encode(compressedImageData);
          
          const newSizeBytes = (base64Data.length * 3) / 4;
          console.log(`Compressed image size: ${(newSizeBytes / 1024 / 1024).toFixed(2)}MB`);
        }
        
        attachments.push({
          filename: 'awning_visualization.jpg',
          mimeType: 'image/jpeg',
          base64Data: base64Data,
          contentId: 'visualization'
        });
      } catch (error) {
        console.error('Error processing image for email attachment:', error);
        // Continue without attachment if image processing fails
        console.log('Sending email without image attachment due to processing error');
      }
    }
    
    console.log('=== CALLING SEND EMAIL ===');
    console.log('- To:', customerEmail);
    console.log('- Subject:', subject);
    console.log('- Attachments count:', attachments.length);
    console.log('- HTML content length:', htmlContent.length);
    
    const result = await this.sendEmail(customerEmail, subject, htmlContent, attachments);
    
    console.log('=== COMPLETION EMAIL SUCCESS ===');
    console.log('Email sent result:', result);
    
    return result;
  }
}
// Price calculation logic
class PriceCalculator {
  constructor(){
    // Base prices per m² for different awning types (in euros)
    this.basePrices = {
      'knikarm': 85,
      'knikarmscherm': 85,
      'uitvalarm': 75,
      'uitvalscherm': 75,
      'markiezen': 95,
      'canopy': 100
    };
    // Installation costs based on floor level
    this.installationCosts = {
      'begane-grond': 150,
      'eerste-verdieping': 200,
      'tweede-verdieping': 275,
      'derde-verdieping': 350,
      'hoger': 450
    };
    // Color surcharges for special colors/patterns
    this.colorSurcharges = {
      'lichtgrijs-wit-gestreept': 15,
      'gebroken-wit-creme-gestreept': 15,
      'loodgrijs-effen': 0,
      'oranje': 25,
      'default': 0
    };
    // BTW rate
    this.vatRate = 0.21;
  }
  calculatePrice(awningType, width, projection, floor, fabricColor = 'default') {
    // Convert cm to meters and calculate area
    const widthM = width / 100;
    const projectionM = projection / 100;
    const area = widthM * projectionM;
    // Get base price per m²
    const basePricePerM2 = this.basePrices[awningType] || this.basePrices['knikarm'];
    const basePrice = area * basePricePerM2;
    // Get installation cost
    const installationCost = this.installationCosts[floor] || this.installationCosts['begane-grond'];
    // Get color surcharge
    const colorSurcharge = (this.colorSurcharges[fabricColor] || 0) * area;
    // Calculate subtotal
    const subtotal = basePrice + installationCost + colorSurcharge;
    // Add VAT
    const totalPrice = subtotal * (1 + this.vatRate);
    return {
      area: area.toFixed(2),
      basePrice,
      installationCost,
      colorSurcharge,
      subtotal,
      totalPrice,
      vatAmount: totalPrice - subtotal
    };
  }
  getFloorDisplayName(floor) {
    const floorNames = {
      'begane-grond': 'Ground floor',
      'eerste-verdieping': 'First floor',
      'tweede-verdieping': 'Second floor',
      'derde-verdieping': 'Third floor',
      'hoger': 'Above 3rd floor'
    };
    return floorNames[floor] || floor;
  }
  getAwningDisplayName(awningType) {
    const awningNames = {
      'knikarm': 'Retractable Awning',
      'knikarmscherm': 'Retractable Awning',
      'uitvalarm': 'Drop Arm Awning',
      'uitvalscherm': 'Drop Arm Awning',
      'markiezen': 'Dutch Canopy',
      'canopy': 'Canopy Awning'
    };
    return awningNames[awningType] || awningType;
  }
}

// Helper functions for imperial unit conversion
function cmToFeet(cm) {
  const feet = cm / 30.48;
  return feet.toFixed(1);
}

function sqMeterToSqFeet(sqM) {
  const sqFeet = sqM * 10.764;
  return sqFeet.toFixed(1);
}

// Initialize Gmail service
let gmailService = null;
console.log('DEBUG: Gmail environment variables check:');
console.log('- GMAIL_CLIENT_ID:', !!GMAIL_CLIENT_ID);
console.log('- GMAIL_CLIENT_SECRET:', !!GMAIL_CLIENT_SECRET);
console.log('- GMAIL_REFRESH_TOKEN:', !!GMAIL_REFRESH_TOKEN);
console.log('- GMAIL_SENDER_EMAIL:', !!GMAIL_SENDER_EMAIL);
if (GMAIL_CLIENT_ID && GMAIL_CLIENT_SECRET && GMAIL_REFRESH_TOKEN && GMAIL_SENDER_EMAIL) {
  try {
    gmailService = new GmailAPIService(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL);
    console.log('Gmail service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Gmail service:', error);
    console.error('Initialization error details:', error.message);
  }
} else {
  console.log('Gmail environment variables not set - email notifications disabled');
}
// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, cache-control, pragma, expires, x-edge-function-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
Deno.serve(async (req)=>{
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  try {
    console.log('Processing request...');
    // Parse request body
    const body = await req.json();
    const { image_data, new_awning_type, new_awning_model, new_fabric_color, pattern_type, stripe_ratio, color_swatch_image, new_awning_reference_image, additional_reference_images, customer_email, customer_name, send_notifications, width, projection, verdieping, include_price_indication = false } = body;
    console.log('Debug - Extracted request parameters:');
    console.log('- image_data:', !!image_data);
    console.log('- new_awning_type:', new_awning_type);
    console.log('- new_awning_model:', new_awning_model);
    console.log('- new_fabric_color:', new_fabric_color);
    console.log('- pattern_type:', pattern_type);
    console.log('- stripe_ratio:', stripe_ratio);
    console.log('- color_swatch_image:', !!color_swatch_image);
    console.log('- new_awning_reference_image (boolean):', !!new_awning_reference_image);
    console.log('- new_awning_reference_image (type):', typeof new_awning_reference_image);
    console.log('- new_awning_reference_image (value):', new_awning_reference_image);
    console.log('- additional_reference_images (boolean):', !!additional_reference_images);
    console.log('- additional_reference_images (type):', typeof additional_reference_images);
    console.log('- additional_reference_images (length):', Array.isArray(additional_reference_images) ? additional_reference_images.length : 'N/A');

    console.log('- customer_email:', customer_email);
    console.log('- customer_name:', customer_name);
    console.log('- send_notifications:', send_notifications);
    console.log('- width:', width);
    console.log('- projection:', projection);
    console.log('- floor (verdieping):', verdieping);
    console.log('- include_price_indication:', include_price_indication);
    
    // Awning type mapping (normalize inputs to supported internal types)
    let effectiveAwningType = new_awning_type;
    // Map traditional variants to 'markiezen'
    if (new_awning_model === 'markiezen-model1' ||
        new_awning_type === 'markiezen' ||
        new_awning_type === 'markies' ||
        new_awning_type === 'markise' ||
        new_awning_type === 'markiezen-model1') {
      effectiveAwningType = 'markiezen';
    }
    // Map canopy variants to 'canopy'
    if (new_awning_model === 'canopy-model1' ||
        new_awning_type === 'canopy' ||
        new_awning_type === 'canopy-awning' ||
        new_awning_type === 'storefront-canopy') {
      effectiveAwningType = 'canopy';
    }
    
    console.log('- original_awning_type:', new_awning_type);
    console.log('- awning_model:', new_awning_model);
    console.log('- effective_awning_type:', effectiveAwningType);
    
    // Type-specific debug logging
    if (effectiveAwningType === 'markiezen') {
      console.log('=== MARKIEZEN DEBUG INFO ===');
      console.log('- new_awning_type:', new_awning_type);
      console.log('- new_awning_model:', new_awning_model);
      console.log('- effectiveAwningType:', effectiveAwningType);
      console.log('- This should generate a TRADITIONAL FIXED CANOPY awning');
      console.log('============================');
    }
    if (effectiveAwningType === 'canopy') {
      console.log('=== CANOPY DEBUG INFO ===');
      console.log('- new_awning_type:', new_awning_type);
      console.log('- new_awning_model:', new_awning_model);
      console.log('- effectiveAwningType:', effectiveAwningType);
      console.log('- This should generate a MODERN FIXED CANOPY awning');
      console.log('==========================');
    }
    
    // Establish model reference with type-specific defaults if missing
    let modelRef = typeof new_awning_reference_image === 'string' ? new_awning_reference_image : '';
    if (effectiveAwningType === 'canopy' && (!modelRef || !modelRef.trim())) {
      modelRef = '/Users/konniet/Downloads/canopy_selectmodel.jpeg';
      console.log('[DEBUG] Using default canopy select-model reference image');
    }
    if ((effectiveAwningType === 'uitvalscherm' || effectiveAwningType === 'uitvalarm') && (!modelRef || !modelRef.trim())) {
      modelRef = '/Users/konniet/Downloads/visualizatiezonwering/assets/models/uitvalscherm.jpeg';
      console.log('[DEBUG] Using default uitvalscherm select-model reference image');
    }
    const hasModelReference = !!(modelRef && modelRef.trim());
    console.log('- hasModelReference:', hasModelReference);
    console.log('- modelRef after trim check:', modelRef && modelRef.trim ? modelRef.trim() : 'N/A');
    // Build effective additional references list; add type-specific background defaults if needed
    let effectiveAdditionalReferences = Array.isArray(additional_reference_images) ? [...additional_reference_images] : [];
    if (effectiveAwningType === 'canopy' && effectiveAdditionalReferences.length === 0) {
      // Default background reference image for canopy awnings if none provided
      effectiveAdditionalReferences.push('/Users/konniet/Downloads/canopy-awning.jpg');
      console.log('[DEBUG] Added default canopy background reference image');
    }
    if ((effectiveAwningType === 'uitvalscherm' || effectiveAwningType === 'uitvalarm') && effectiveAdditionalReferences.length === 0) {
      // Default background reference image for uitvalscherm awnings if none provided
      effectiveAdditionalReferences.push('/Users/konniet/Downloads/uitvalscherm-background.jpg');
      console.log('[DEBUG] Added default uitvalscherm background reference image');
    }
    
    // Validate required parameters
    if (!image_data || !new_awning_type) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters: image_data, new_awning_type'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Initialize price calculator and calculate price if requested
    let priceData = null;
    if (include_price_indication && width && projection && verdieping) {
      console.log('Calculating price indication...');
      // Validate dimensions
      if (width < 100 || width > 800 || projection < 50 || projection > 400) {
        return new Response(JSON.stringify({
          error: 'Invalid dimensions. Width must be 3.3-26.2ft, projection must be 1.6-13.1ft'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      const calculator = new PriceCalculator();
      const priceCalculation = calculator.calculatePrice(new_awning_type, width, projection, verdieping, new_fabric_color);
      priceData = {
        awningType: calculator.getAwningDisplayName(new_awning_type),
        width,
        projection,
        area: priceCalculation.area,
        floor: calculator.getFloorDisplayName(verdieping),
        fabricColor: new_fabric_color,
        basePrice: priceCalculation.basePrice,
        installationCost: priceCalculation.installationCost,
        colorSurcharge: priceCalculation.colorSurcharge,
        subtotal: priceCalculation.subtotal,
        vatAmount: priceCalculation.vatAmount,
        totalPrice: priceCalculation.totalPrice,
        calculatedAt: new Date().toISOString()
      };
      console.log('Price calculation completed:', priceData);
    }
    // Send start notification email
    // Auto-email policy: send emails automatically for price requests or when notifications are requested
    const shouldSendEmails = !!((include_price_indication || send_notifications) && customer_email && gmailService);
    console.log('DEBUG: Auto-email policy -> shouldSendEmails:', shouldSendEmails);
    let startEmailSent = false;
    console.log('DEBUG: Checking start email conditions:');
    console.log('- include_price_indication:', include_price_indication);
    console.log('- send_notifications:', send_notifications);
    console.log('- customer_email:', customer_email);
    console.log('- gmailService:', !!gmailService);
    console.log('- shouldSendEmails:', shouldSendEmails);
    
    if (shouldSendEmails) {
      console.log('DEBUG: All conditions met, attempting to send start email...');
      try {
        await gmailService.sendStartNotification(customer_email, customer_name);
        startEmailSent = true;
        console.log('Start notification email sent successfully');
      } catch (error) {
        console.error('Failed to send start notification email:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
    } else {
      console.log('DEBUG: Start email not sent - conditions not met');
    }

    // Continue with main image processing
    console.log('Starting main image processing...');
    
    // Main processing function
    async function executeMainProcessing() {
    // Parse the input image
    const parsed = await parseDataUri(image_data);
    const imageBase64 = parsed?.base64Data;
    // Parse reference image if provided
    const modelReferenceParsed = hasModelReference ? await parseDataUri(modelRef) : null;
    console.log('[DEBUG] modelReferenceParsed:', !!modelReferenceParsed);
    console.log('[DEBUG] hasModelReference:', hasModelReference);
    
    // Parse additional reference images if provided
    let additionalReferencesParsed = [];
    if (effectiveAdditionalReferences && Array.isArray(effectiveAdditionalReferences) && effectiveAdditionalReferences.length > 0) {
      console.log('[DEBUG] Processing additional reference images:', effectiveAdditionalReferences.length);
      additionalReferencesParsed = (await Promise.all(effectiveAdditionalReferences.map(async (imageData, index) => {
        try {
          const parsed = await parseDataUri(imageData);
          console.log(`[DEBUG] Additional reference image ${index + 1} parsed successfully`);
          return parsed;
        } catch (error) {
          console.error(`[DEBUG] Failed to parse additional reference image ${index + 1}:`, error);
          return null;
        }
      }))).filter(Boolean); // Remove any null entries
      console.log('[DEBUG] Successfully parsed additional reference images:', additionalReferencesParsed.length);
    }
    // Validate image dimensions
    async function validateImageDimensions(originalImage, generatedImage, context) {
      try {
        const originalDims = await getImageDimensions(originalImage);
        const generatedDims = await getImageDimensions(generatedImage);
        console.log(`[DEBUG] ${context} - Original: ${originalDims.width}x${originalDims.height}, Generated: ${generatedDims.width}x${generatedDims.height}`);
        const aspectRatioOriginal = originalDims.width / originalDims.height;
        const aspectRatioGenerated = generatedDims.width / generatedDims.height;
        const aspectRatioDiff = Math.abs(aspectRatioOriginal - aspectRatioGenerated);
        if (aspectRatioDiff > 0.1) {
          console.log(`[DEBUG] ${context} - Aspect ratio mismatch detected (${aspectRatioDiff.toFixed(3)}), attempting correction...`);
          try {
            const correctedImage = await resizeImageToMatch(generatedImage, originalDims.width, originalDims.height);
            return {
              valid: false,
              correctedImage
            };
          } catch (resizeError) {
            console.log(`[DEBUG] ${context} - Resize failed:`, resizeError.message);
            return {
              valid: false,
              correctedImage: null
            };
          }
        }
        return {
          valid: true,
          correctedImage: null
        };
      } catch (error) {
        console.log(`[DEBUG] ${context} - Dimension validation failed:`, error.message);
        return {
          valid: false,
          correctedImage: null
        };
      }
    }
    // Function to resize image to match dimensions
    async function resizeImageToMatch(imageDataUri, targetWidth, targetHeight) {
      try {
        const base64Match = imageDataUri.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
        const base64Data = base64Match ? base64Match[1] : imageDataUri;
        const imageBytes = decode(base64Data);
        const image = await Image.decode(imageBytes);
        const resized = image.resize(targetWidth, targetHeight);
        const resizedBytes = await resized.encode();
        const resizedBase64 = encode(resizedBytes);
        return `data:image/png;base64,${resizedBase64}`;
      } catch (error) {
        console.log('Image resize failed:', error.message);
        throw error;
      }
    }
    // Function to get image dimensions
    async function getImageDimensions(imageData) {
      try {
        let base64Data;
        if (imageData.startsWith('data:')) {
          const base64Match = imageData.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          base64Data = base64Match ? base64Match[1] : imageData;
        } else {
          base64Data = imageData;
        }
        const imageBytes = decode(base64Data);
        const image = await Image.decode(imageBytes);
        return {
          width: image.width,
          height: image.height
        };
      } catch (error) {
        console.log('Failed to get image dimensions:', error.message);
        return {
          width: 1024,
          height: 768
        }; // Default fallback
      }
    }
    // Function to parse data URI or load local/remote image into a data URI structure
    async function parseDataUri(dataUri) {
      // Safety check for non-string inputs
      if (!dataUri || typeof dataUri !== 'string') {
        console.log('[DEBUG] parseDataUri received non-string input:', typeof dataUri, dataUri);
        return null;
      }
      // Data URI
      if (dataUri.startsWith('data:')) {
        const [header, base64Data] = dataUri.split(',');
        const mimeMatch = header.match(/data:([^;]+)/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        return { mimeType, base64Data };
      }
      // Local file path
      if (dataUri.startsWith('/')) {
        try {
          const bytes = await Deno.readFile(dataUri);
          // Guess mime type by extension
          const lower = dataUri.toLowerCase();
          const mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
          const base64Data = encode(bytes);
          console.log('[DEBUG] Loaded local image path into base64:', dataUri);
          return { mimeType, base64Data };
        } catch (err) {
          console.log('[DEBUG] Failed to read local image path:', dataUri, err?.message);
          return null;
        }
      }
      // Remote URL
      if (dataUri.startsWith('http://') || dataUri.startsWith('https://')) {
        try {
          const res = await fetch(dataUri);
          const buf = new Uint8Array(await res.arrayBuffer());
          const ct = res.headers.get('content-type') || 'image/jpeg';
          const base64Data = encode(buf);
          console.log('[DEBUG] Fetched remote image into base64:', dataUri);
          return { mimeType: ct, base64Data };
        } catch (err) {
          console.log('[DEBUG] Failed to fetch remote image:', dataUri, err?.message);
          return null;
        }
      }
      // Unsupported format
      console.log('[DEBUG] parseDataUri unsupported string format:', dataUri.substring(0, 80));
      return null;
    }
    // Function to build placement prompt for different awning types with variation strategies
    function buildPlacementPrompt(awningType, awningModel, variation, fabricColor, patternType, stripeRatio, hasModelReference, referenceImageCount = 0) {
      console.log(`[DEBUG] === BUILDING PLACEMENT PROMPT ===`);
      console.log(`[DEBUG] awningType: ${awningType}`);
      console.log(`[DEBUG] awningModel: ${awningModel}`);
      console.log(`[DEBUG] variation: ${variation}`);
      console.log(`[DEBUG] fabricColor: ${fabricColor}`);
      console.log(`[DEBUG] hasModelReference: ${hasModelReference}`);
      console.log(`[DEBUG] referenceImageCount: ${referenceImageCount}`);
      
      // REFACTORED: Enhanced awning descriptions with specific markiezen details
      // Improved Gemini prompts with traditional Dutch fixed canopy awning descriptions
      const awningDescriptions = {
        "knikarm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING WITH HORIZONTAL EXTENDING METAL ARMS",
        "knikarmscherm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING WITH HORIZONTAL EXTENDING METAL ARMS",
        "uitvalarm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
        "uitvalscherm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
        "markiezen": "MANDATORY MARKIEZEN TRADITIONAL FIXED CANOPY AWNING (traditional Dutch fixed canopy awning with a curved, basket-like profile, non-retractable, mounted above windows/doors)",
        "canopy": "MANDATORY CANOPY FIXED CANOPY AWNING (modern rectangular or wedge canopy, rigid frame, non-retractable; NO cassette or folding arms)"
      };
      
      // Override awning type to markiezen if traditional model is selected
      let effectiveAwningType = awningType;
      if (awningModel === "markiezen-model1" || awningType === "markiezen") {
        effectiveAwningType = "markiezen";
      } else if (awningModel === "canopy-model1" || awningType === "canopy") {
        effectiveAwningType = "canopy";
      }
      
      // REFACTORED: Enhanced reference image emphasis in prompts
      const awningDescription = hasModelReference
        ? `${awningDescriptions[effectiveAwningType] || "Awning"} THAT MATCHES THE REFERENCE MODEL EXACTLY - Match the style exactly from the reference image(s) provided`
        : (awningDescriptions[effectiveAwningType] || "Awning");
      // Define color description
      let colorDescription = "";
      if (fabricColor && fabricColor !== "default") {
        colorDescription = ` The fabric must be ${fabricColor}`;
        if (patternType && patternType !== "effen") {
          colorDescription += ` with ${patternType} pattern`;
          if (stripeRatio) {
            if (stripeRatio === "1:1") {
              colorDescription += ` with EQUAL WIDTH STRIPES - each stripe must be exactly the same width as the adjacent stripe, creating perfectly balanced alternating bands of equal size`;
            } else {
              colorDescription += ` in ${stripeRatio} ratio`;
            }
          }
        }
        colorDescription += ".";
      }
      // Define model-specific descriptions and hardware requirements
      let modelDescription = "";
      if (hasModelReference) {
        // Get the type-specific description first
        let typeSpecificDescription = "";
        if (awningModel === "markiezen-model1" || effectiveAwningType === "markiezen") {
          typeSpecificDescription = "Use a traditional fixed canopy (traditional Dutch fixed canopy awning with a curved, basket-like profile, non-retractable, mounted above windows/doors): a curved or wedge-shaped fabric roof with side cheeks and a front fabric valance. Frame is concealed or painted to match; NO folding arms, NO front roller/cassette, and NO black metal front bar.";
        } else if (effectiveAwningType === "canopy") {
          typeSpecificDescription = "Use a modern canopy awning: a clean rectangular or wedge-shaped fabric canopy on a rigid minimalist frame, non-retractable, mounted above windows/doors. NO folding arms, NO cassette, NO front roller. Keep the look sleek and contemporary.";
        } else if (awningModel === "knikarm-model1" || effectiveAwningType === "knikarm" || effectiveAwningType === "knikarmscherm") {
          typeSpecificDescription = "MANDATORY KNIKARM SPECIFICATIONS: Create a FULLY EXTENDED retractable folding arm awning with modern metal folding arms that extend horizontally from a wall-mounted cassette. The arms must be clearly visible, articulated (with joints), and extend outward from the wall at FULL EXTENSION. Include a slim rectangular cassette mounted to the wall. The fabric must be completely unrolled and fully deployed. Arms/frame may be dark grey or black. ABSOLUTELY NO vertical wall-mounted support arms/brackets and NO ground-support posts or poles. This is a retractable folding arm awning — NOT a fixed canopy or markiezen.";
        } else if (effectiveAwningType === "uitvalarm" || effectiveAwningType === "uitvalscherm") {
          typeSpecificDescription = "Create a FULLY EXTENDED vertical drop arm awning with a compact wall-mounted cassette and two SHORT angled support arms (50–80 cm). The fabric must be completely lowered and fully deployed. Hardware should be minimal and light-coloured (white/grey); avoid heavy black bars.";
        }

        if (referenceImageCount > 1) {
          modelDescription = `MULTIPLE REFERENCE MODEL MATCHING: You have ${referenceImageCount} reference images showing different views/angles of the same awning model. Study ALL reference images carefully to understand the complete awning design:

REFERENCE ANALYSIS INSTRUCTIONS:
- Examine each reference image to understand the awning's overall structure, proportions, and design details
- Look for consistent design elements across all reference images (frame style, fabric shape, mounting method, hardware details)
- Note any variations in viewing angle, lighting, or installation context between references
- Synthesize the information from all references to create the most accurate representation
- If references show different angles (front view, side view, etc.), use this to understand the 3D structure better
- Pay attention to fabric patterns, colors, and textures that may be clearer in some references than others

IMPLEMENTATION REQUIREMENTS:
- Replicate the geometry, proportions, canopy/arm style, and hardware exactly as shown across the references
- Match the fabric shape, mounting style, and any decorative elements visible in the references
- Ensure the final awning looks like it belongs to the same product family as all reference images
- Do NOT invent features not present in any of the reference images
- Prioritize design elements that are consistently visible across multiple reference images

TYPE-SPECIFIC REQUIREMENTS: ${typeSpecificDescription}${colorDescription}`;
        } else {
          modelDescription = `STRICT MODEL MATCHING: Use the attached awning model reference image to determine type and construction. Replicate the geometry, proportions, canopy/arm style, and any visible hardware exactly as in the reference. Do NOT invent features that are not present in the reference.

TYPE-SPECIFIC REQUIREMENTS: ${typeSpecificDescription}${colorDescription}`;
        }
      } else if (awningModel === "markiezen-model1" || effectiveAwningType === "markiezen") {
        modelDescription = `Use a traditional fixed canopy (traditional Dutch fixed canopy awning with a curved, basket-like profile, non-retractable, mounted above windows/doors): a curved or wedge-shaped fabric roof with side cheeks and a front fabric valance. Frame is concealed or painted to match; NO folding arms, NO front roller/cassette, and NO black metal front bar.${colorDescription}`;
      } else if (effectiveAwningType === "canopy") {
        modelDescription = `Use a modern canopy awning: a clean rectangular or wedge-shaped fabric canopy on a rigid minimalist frame, non-retractable, mounted above windows/doors. NO folding arms, NO cassette, NO front roller. Keep the look sleek and contemporary.${colorDescription}`;
      } else if (awningModel === "knikarm-model1") {
        modelDescription = `MANDATORY KNIKARM SPECIFICATIONS: Create a FULLY EXTENDED retractable folding arm awning with modern metal folding arms that extend horizontally from a wall-mounted cassette. The arms must be clearly visible, articulated (with joints), and extend outward from the wall at FULL EXTENSION. Include a slim rectangular cassette mounted to the wall. The fabric must be completely unrolled and fully deployed. Arms/frame may be dark grey or black. ABSOLUTELY NO vertical wall-mounted support arms/brackets and NO ground-support posts or poles. This is a retractable folding arm awning — NOT a fixed canopy or markiezen.${colorDescription}`;
      } else if (effectiveAwningType === "knikarm" || effectiveAwningType === "knikarmscherm") {
          modelDescription = `MANDATORY KNIKARM SPECIFICATIONS: Create a FULLY EXTENDED retractable folding arm awning with modern metal folding arms that extend horizontally from a wall-mounted cassette. The arms must be clearly visible, articulated (with joints), and extend outward from the wall at FULL EXTENSION. Include a slim rectangular cassette mounted to the wall. The fabric must be completely unrolled and fully deployed. Arms/frame may be dark grey or black. ABSOLUTELY NO vertical wall-mounted support arms/brackets and NO ground-support posts or poles. This is a retractable folding arm awning — NOT a fixed canopy or markiezen.${colorDescription}`;
      } else if (effectiveAwningType === "uitvalarm" || effectiveAwningType === "uitvalscherm") {
        modelDescription = `Create a FULLY EXTENDED vertical drop arm awning with a compact wall-mounted cassette and two SHORT angled support arms (50–80 cm). The fabric must be completely lowered and fully deployed. In addition, add 2–3 slender vertical wall-mounted support arms/brackets placed beneath/near the awning edges. Randomize their count (2 or 3) and spacing with a symmetric look appropriate to the façade; match hardware color; ensure they are structural supports only, not operating devices. Hardware should be minimal and light-coloured (white/grey); avoid heavy black bars.${colorDescription}`;
      } else {
        modelDescription = colorDescription;
      }
      // Add negative prompting to exclude unwanted awning types
      let negativePrompting = "";
      
      // Get type-specific negative prompting first
      let typeSpecificNegativePrompting = "";
      if (effectiveAwningType === "markiezen") {
        typeSpecificNegativePrompting = "CRITICAL: Do NOT add any retractable arms, front roller, cassette, or black metal front bar. NO knikarm hardware. This must be a traditional fixed canopy with curved/wedge shape, side cheeks, and a fabric valance.";
      } else if (effectiveAwningType === "canopy") {
        typeSpecificNegativePrompting = "CRITICAL: Do NOT add any retractable folding arms, front roller, or wall-mounted cassette. NO heavy black metal front bar. Keep the frame minimal and clean. This must be a modern fixed canopy (rectangular or wedge).";
      } else if (effectiveAwningType === "knikarm" || effectiveAwningType === "knikarmscherm") {
        typeSpecificNegativePrompting = "CRITICAL REJECTION RULES: ABSOLUTELY DO NOT create any of these wrong awning types: 1) NO traditional fixed canopy awnings (markiezen) with curved tops, side cheeks, or fabric valances - this is NOT a knikarm, 2) NO vertical drop arm awnings (uitvalarm) that hang down like window shades, 3) NO horizontal cassette awnings without folding arms, 4) NO half-markiezen or semi-fixed canopies, 5) NO wedge-shaped or curved canopy structures, 6) NO vertical wall-mounted support arms or brackets, and NO ground-support posts/poles under the awning. MANDATORY: ONLY create a retractable folding arm awning (knikarm) with horizontal extending metal arms that fold out from a wall-mounted cassette. The arms must be clearly visible and extend horizontally outward from the wall.";
      } else if (effectiveAwningType === "uitvalarm" || effectiveAwningType === "uitvalscherm") {
        typeSpecificNegativePrompting = "CRITICAL: ABSOLUTELY DO NOT create any horizontal canopy, horizontal awning, or outward-projecting shade structure. DO NOT create a retractable folding arm awning (knikarm) with horizontal extending arms. DO NOT create a traditional fixed canopy (markiezen) that projects outward. ONLY create a vertical drop arm awning that hangs down from the wall like a window shade.";
      }

      if (hasModelReference) {
        if (referenceImageCount > 1) {
          negativePrompting = `STRICT MULTI-REFERENCE CONSISTENCY: Do not create any awning type different from what is shown in ALL reference images. Study all reference images to ensure consistency - if any reference shows specific features (folding arms, cassettes, drop-arm hardware, mounting details), include them only if they appear consistently across multiple references. Do not add features visible in only one reference if they contradict the others. Do not change building elements or invent mechanical features not clearly present in the majority of reference images. Prioritize design elements that are consistently visible across all reference images. ${typeSpecificNegativePrompting}`;
        } else {
          negativePrompting = `STRICT TYPE CONSISTENCY: Do not create any awning type different from the reference image. Do not add folding arms, cassettes, drop-arm hardware, vertical wall-mounted support arms, or black metal front bars unless clearly visible in the reference. For knikarm specifically: IGNORE any vertical posts/poles if present in the reference and DO NOT include them. Do not change building elements or invent mechanical features not in the reference. ${typeSpecificNegativePrompting}`;
        }
      } else if (effectiveAwningType === "markiezen") {
        negativePrompting = "CRITICAL: Do NOT add any retractable arms, front roller, cassette, or black metal front bar. NO knikarm hardware. This must be a traditional fixed canopy with curved/wedge shape, side cheeks, and a fabric valance.";
      } else if (effectiveAwningType === "knikarm" || effectiveAwningType === "knikarmscherm") {
        negativePrompting = "CRITICAL REJECTION RULES: ABSOLUTELY DO NOT create any of these wrong awning types: 1) NO traditional fixed canopy awnings (markiezen) with curved tops, side cheeks, or fabric valances - this is NOT a knikarm, 2) NO vertical drop arm awnings (uitvalarm) that hang down like window shades, 3) NO horizontal cassette awnings without folding arms, 4) NO half-markiezen or semi-fixed canopies, 5) NO wedge-shaped or curved canopy structures, 6) NO vertical wall-mounted support arms or brackets, and NO ground-support posts/poles under the awning. MANDATORY: ONLY create a retractable folding arm awning (knikarm) with horizontal extending metal arms that fold out from a wall-mounted cassette. The arms must be clearly visible and extend horizontally outward from the wall.";
      } else if (effectiveAwningType === "uitvalarm" || effectiveAwningType === "uitvalscherm") {
        negativePrompting = "CRITICAL: ABSOLUTELY DO NOT create any horizontal canopy, horizontal awning, or outward-projecting shade structure. DO NOT create a retractable folding arm awning (knikarm) with horizontal extending arms. DO NOT create a traditional fixed canopy (markiezen) that projects outward. ONLY create a vertical drop arm awning that hangs down from the wall like a window shade.";
      }
      // Global hardware exclusions: never render a manual crank/slingerarm
      negativePrompting += " ADDITIONAL HARDWARE EXCLUSIONS: ABSOLUTELY DO NOT include any manual crank handle (slingerarm), winding handle, hanging rod or chain, visible wall-mounted hand crank, or any dangling operating device. Operation controls must be hidden; no external crank or rod should be visible. If the base photo contains any such manual handle/rod/chain, DIGITALLY REMOVE IT COMPLETELY from the final visualization.";
      // Add stripe-specific negative prompting if pattern is striped
      if (patternType && patternType !== "effen" && stripeRatio === "1:1") {
        negativePrompting += " STRIPE PATTERN RULES: NO duplicate colors side by side - each stripe must be a different color from its adjacent stripes. Create perfect alternating pattern with distinct colors.";
      }
      const intro = hasModelReference
        ? (referenceImageCount > 1 
           ? `DO NOT GENERATE A NEW IMAGE. THIS IS IMAGE EDITING ONLY.
           
           You have ${referenceImageCount + 1} images:
           - Image 1: The ACTUAL house to edit (DO NOT CHANGE THIS HOUSE)
           - Images 2-${referenceImageCount + 1}: Reference examples of awning styles
           
           Your task: EDIT image 1 by adding an awning matching the style from images 2-${referenceImageCount + 1}.
           DO NOT create a new house. DO NOT generate a different building.
           PRESERVE every pixel of the original house except where the awning is added.`
           : `DO NOT GENERATE A NEW IMAGE. THIS IS IMAGE EDITING ONLY.
           
           You have 2 images:
           - Image 1: The ACTUAL house to edit (DO NOT CHANGE THIS HOUSE) 
           - Image 2: Reference example of awning style
           
           Your task: EDIT image 1 by adding an awning matching image 2's style.
           DO NOT create a new house. DO NOT generate a different building.
           PRESERVE every pixel of the original house except where the awning is added.`)
        : `DO NOT GENERATE A NEW IMAGE. THIS IS IMAGE EDITING ONLY.
        
        Using the provided house image, ADD an awning to it.
        DO NOT create a new house. DO NOT generate a different building.
        PRESERVE every pixel of the original house except where the awning is added.
        
        You are adding a ${awningDescription} to THIS SPECIFIC HOUSE.`;

      // Only include wall-arm generation policy for non-markiezen types
      const wallArmPolicy = (effectiveAwningType === "uitvalarm" || effectiveAwningType === "uitvalscherm")
        ? `
WALL ARM GENERATION POLICY (UITVALARM ONLY):
- Follow the reference model; if it includes vertical wall arms, replicate their style.
- If arms are not clearly visible in the reference, you may ADD 2–3 slender vertical WALL-MOUNTED support arms/brackets near the awning edges (never reaching the ground).
- Randomize count (2 or 3) and spacing while keeping symmetry and architectural plausibility.
- Arms must be simple straight bars with discreet brackets, matching the hardware color.
- These arms are structural supports ONLY; never render any manual crank handle, chain, or hanging rod.`
        : `
KNIKARM ARM POLICY:
- Use ONLY a wall-mounted cassette and TWO horizontal articulated folding arms.
- DO NOT include any vertical wall arms, support brackets to the ground, posts, or poles.`;

      const finalPrompt = `${intro}

CRITICAL RULES:
1. This is the house you MUST edit: [First image provided]
2. DO NOT generate any new house or building
3. Add ONLY the awning to the existing house
4. Keep EVERYTHING else exactly the same:
   - Same brick color and texture
   - Same windows and frames
   - Same doors
   - Same roof
   - Same ground/patio
   - Same sky and lighting

${modelDescription}

AWNING REQUIREMENTS:
- Type: ${effectiveAwningType}
- Must be fully extended and visible
- Must provide shade over window/door area
${colorDescription}
${wallArmPolicy}

${negativePrompting}

OUTPUT: The same house image with only an awning added.

RESPONSE FORMAT: Generate the image as requested, and if you need to provide any analysis or feedback about the generation process, format it as JSON:
{
  "generation_status": "success|partial|failed",
  "awning_type_generated": "${effectiveAwningType}",
  "placement_confidence": number (1-10),
  "size_adequacy": number (1-10),
  "style_consistency": number (1-10),
  "notes": "any specific observations or adjustments made",
  "warnings": "any potential issues or limitations"
}`;

      console.log(`[DEBUG] === FINAL PLACEMENT PROMPT ===`);
      console.log(`[DEBUG] Prompt length: ${finalPrompt.length}`);
      console.log(`[DEBUG] Prompt preview: ${finalPrompt.substring(0, 200)}...`);
      
      // MARKIEZEN SPECIFIC PROMPT LOGGING
      if (effectiveAwningType === 'markiezen') {
        console.log('=== MARKIEZEN PROMPT DEBUG ===');
        console.log('Full prompt for markiezen:');
        console.log(finalPrompt);
        console.log('==============================');
      }
      
      return finalPrompt;
    }
    // REFACTORED: Enhanced evaluation prompt with awning type validation and fidelity metrics
    function buildEvaluationPrompt(awningType, hasModelReference = false) {
      const fidelityMetrics = `
  "image_fidelity_score": number (1-10, how well the background/house features are preserved),
  "background_preservation": boolean (true if house features unchanged),
  "brick_color_preserved": boolean,
  "window_style_preserved": boolean,
  "door_preserved": boolean (if applicable),
  "roof_preserved": boolean,
  "ground_surface_preserved": boolean,
  "lighting_preserved": boolean,
  "sky_preserved": boolean,
  "architectural_details_preserved": boolean,
  "image_dimensions_preserved": boolean,
  "generation_vs_editing": "editing|generation" (was this proper editing or new generation?),
  "fidelity_issues": "string describing any background changes detected"`;

      if (awningType === "canopy") {
        return `Evaluate this house image with CANOPY awning placement.${hasModelReference ? " You will ALSO receive a reference image of the model." : ""}

🔍 CRITICAL FIDELITY EVALUATION: This should be IMAGE EDITING, not image generation. Check if the background/house features remain identical to the original.

Respond ONLY with JSON:
{
  "placement_quality": number,
  "visual_realism": number,
  "red_line_removed": boolean,
  "technical_quality": number,
  "overall_score": number,
  "is_correct_awning_type": boolean,
  "awning_type_detected": "string (e.g., 'canopy', 'knikarm')",
  "is_canopy_shape": boolean,
  "has_sleek_minimal_frame": boolean,
  "has_knikarm_arms": boolean,
  "has_front_roller_or_cassette": boolean,
  "matches_reference_model": ${hasModelReference ? 'boolean' : 'false'},
  "has_manual_crank_handle": boolean,
  "has_vertical_wall_arms": boolean,
  "wall_arms_count": number,${fidelityMetrics},
  "issues": "description"
}`;
      }

      if (awningType === "markiezen") {
        if (hasModelReference) {
          return `Evaluate this house image with MARKIEZEN awning placement. You will ALSO receive a reference image of the model. 

🔍 CRITICAL FIDELITY EVALUATION: This should be IMAGE EDITING, not image generation. Check if the background/house features remain identical to the original.

Compare the generated awning against the reference and respond ONLY with JSON:
{
  "placement_quality": number,
  "visual_realism": number,
  "red_line_removed": boolean,
  "technical_quality": number,
  "overall_score": number,
  "is_correct_awning_type": boolean,
  "awning_type_detected": "string (e.g., 'markiezen', 'knikarm')",
  "has_knikarm_arms": boolean,
  "has_front_roller_or_cassette": boolean,
  "has_black_metal_front_bar": boolean,
  "is_fixed_canopy_shape": boolean,
  "has_side_cheeks": boolean,
  "has_fabric_valance": boolean,
  "matches_reference_model": boolean,
  "has_manual_crank_handle": boolean,
  "has_vertical_wall_arms": boolean,
  "wall_arms_count": number,${fidelityMetrics},
  "issues": "description"
}`;
        }
        return `Evaluate this house image with MARKIEZEN awning placement. 

🔍 CRITICAL FIDELITY EVALUATION: This should be IMAGE EDITING, not image generation. Check if the background/house features remain identical to the original.

Respond ONLY with JSON:
{
  "placement_quality": number,
  "visual_realism": number,
  "red_line_removed": boolean,
  "technical_quality": number,
  "overall_score": number,
  "is_correct_awning_type": boolean,
  "awning_type_detected": "string (e.g., 'markiezen', 'knikarm')",
  "has_knikarm_arms": boolean,
  "has_front_roller_or_cassette": boolean,
  "has_black_metal_front_bar": boolean,
  "is_fixed_canopy_shape": boolean,
  "has_side_cheeks": boolean,
  "has_fabric_valance": boolean,
  "has_manual_crank_handle": boolean,
  "has_vertical_wall_arms": boolean,
  "wall_arms_count": number,${fidelityMetrics},
  "issues": "description"
}`;
      }
      return `Evaluate this house image with ${awningType} awning placement. 

🔍 CRITICAL FIDELITY EVALUATION: This should be IMAGE EDITING, not image generation. Check if the background/house features remain identical to the original.

Rate 1-10 for: placement quality, visual realism, red line removal, technical quality. Return ONLY JSON: 
{
  "placement_quality": number, 
  "visual_realism": number, 
  "red_line_removed": boolean, 
  "technical_quality": number, 
  "overall_score": number, 
  "is_correct_awning_type": boolean, 
  "awning_type_detected": "string", 
  "has_manual_crank_handle": boolean, 
  "has_vertical_wall_arms": boolean, 
  "wall_arms_count": number,${fidelityMetrics}, 
  "issues": "description"
}`;
    }
    // Function to compute placement score with type-specific criteria
    function computePlacementScore(evaluation, awningType) {
      if (!evaluation) return 0;
      let score = 0;
      let maxScore = 0;
      // Placement quality (30% weight)
      if (typeof evaluation.placement_quality === 'number') {
        score += evaluation.placement_quality * 3;
        maxScore += 30;
      }
      // Visual realism (25% weight)
      if (typeof evaluation.visual_realism === 'number') {
        score += evaluation.visual_realism * 2.5;
        maxScore += 25;
      }
      // Red line removal (25% weight) - boolean converted to score
      if (evaluation.red_line_removed === true) {
        score += 25;
      }
      maxScore += 25;
      // Technical quality (20% weight)
      if (typeof evaluation.technical_quality === 'number') {
        score += evaluation.technical_quality * 2;
        maxScore += 20;
      }
      // Type-specific bonuses/penalties for markiezen correctness
      if (awningType === "markiezen") {
        if (evaluation.has_knikarm_arms === true) score -= 50;
        if (evaluation.has_front_roller_or_cassette === true) score -= 40;
        if (evaluation.has_black_metal_front_bar === true) score -= 30;
        if (evaluation.is_fixed_canopy_shape === true) score += 20;
        if (evaluation.has_side_cheeks === true) score += 10;
        if (evaluation.has_fabric_valance === true) score += 10;
        if (typeof evaluation.matches_reference_model === 'boolean') {
          if (evaluation.matches_reference_model === true) score += 20; else score -= 20;
        }
      }
      // Global hardware penalty: manual crank/handle must never appear
      if (evaluation.has_manual_crank_handle === true) {
        score -= 50;
      }
      // Wall-arm scoring: reward only for uitvalarm; penalize for knikarm
      if (awningType === "uitvalarm" || awningType === "uitvalscherm") {
        if (evaluation.has_vertical_wall_arms === true) {
          const count = typeof evaluation.wall_arms_count === 'number' ? evaluation.wall_arms_count : 0;
          score += 10 + Math.min(Math.max(count, 0), 3) * 5; // bonus 10 + up to 15
        }
      } else if (awningType === "knikarm" || awningType === "knikarmscherm") {
        if (evaluation.has_vertical_wall_arms === true) {
          score -= 30; // explicit penalty: knikarm must be cantilevered without vertical wall arms
        }
      }
      
      // REFACTORED: Add awning type validation penalty
      if (evaluation.is_correct_awning_type === false) {
        score -= 50;
      }
      
      // Prevent negative scores
      score = Math.max(0, score);
      return maxScore > 0 ? Math.round(score / maxScore * 100) : 0;
    }
    // Function to calculate color iteration score
    // Advanced scoring function for color iterations (copied from working edge_function.md)
    function calculateColorIterationScore(evaluation, patternType) {
      let score = 0;
      const issues = [];
      if (patternType === 'solid') {
        // Solid color scoring (more critical)
        if (evaluation.is_uniform_base_color === true) {
          score += 50;
        } else {
          issues.push('Non-uniform base color detected');
        }
        if (evaluation.has_decorative_stripes === false) {
          score += 40;
        } else {
          issues.push('Decorative stripes present');
        }
        if (evaluation.slats_uniform_color === true) {
          score += 30;
        } else {
          issues.push('Non-uniform slats');
        }
        if (evaluation.matches_swatch_color === true) {
          score += 20;
        } else {
          issues.push('Color mismatch');
        }
        if (evaluation.fabric_only_edited === true) {
          score += 10;
        } else {
          issues.push('Hardware was edited');
        }
        // Critical penalties
        if (evaluation.has_visible_ribs === true) {
          score -= 50;
          issues.push('Visible ribs present (critical penalty)');
        }
        if (evaluation.has_visible_slats === true) {
          score -= 50;
          issues.push('Visible slats present (critical penalty)');
        }
        if (evaluation.has_structural_lines === true) {
          score -= 40;
          issues.push('Structural lines present');
        }
        // Goal achievement bonus
        if (evaluation.goal_met === true) {
          score += 100;
        }
      } else {
        // Pattern/stripe scoring
        if (evaluation.stripe_accuracy >= 0.8) {
          score += 60;
        } else if (evaluation.stripe_accuracy >= 0.6) {
          score += 40;
        } else {
          score += 20;
          issues.push('Low stripe accuracy');
        }
        if (evaluation.pattern_consistency === true) {
          score += 30;
        } else {
          issues.push('Inconsistent pattern');
        }
        if (evaluation.matches_swatch_color === true) {
          score += 25;
        } else {
          issues.push('Color mismatch');
        }
        // Penalties for patterns
        if (evaluation.has_structural_lines === true) {
          score -= 40;
          issues.push('Structural lines present');
        }
        if (evaluation.fabric_only_edited === false) {
          score -= 30;
          issues.push('Hardware was edited');
        }
        // Goal achievement bonus for patterns
        if (evaluation.goal_met === true) {
          score += 50;
        }
      }
      // REFACTORED: Add awning type validation penalty
      if (evaluation.is_correct_awning_type === false) {
        score -= 50;
        issues.push(`Incorrect awning type detected: ${evaluation.awning_type_detected || 'unknown'}`);
      }
      
      // FIDELITY PENALTIES: Moderate penalties for poor image editing fidelity
      if (typeof evaluation.image_fidelity_score === 'number') {
        if (evaluation.image_fidelity_score < 7) {
          score -= 25; // Significant penalty for poor fidelity
          issues.push(`Low image fidelity score: ${evaluation.image_fidelity_score}/10`);
        } else if (evaluation.image_fidelity_score < 8) {
          score -= 15; // Moderate penalty
          issues.push(`Moderate fidelity issues: ${evaluation.image_fidelity_score}/10`);
        }
      }
      
      if (evaluation.background_preservation === false) {
        score -= 30; // Significant penalty for background changes
        issues.push('Background/house features were altered');
      }
      
      if (evaluation.generation_vs_editing === 'generation') {
        score -= 35; // Major penalty for generation instead of editing
        issues.push('Image generation detected instead of editing');
      }
      
      // Individual preservation penalties (reduced to avoid total elimination)
      const preservationChecks = [
        { key: 'brick_color_preserved', penalty: 8, label: 'brick color' },
        { key: 'window_style_preserved', penalty: 10, label: 'window style' },
        { key: 'door_preserved', penalty: 6, label: 'door' },
        { key: 'roof_preserved', penalty: 12, label: 'roof' },
        { key: 'ground_surface_preserved', penalty: 6, label: 'ground surface' },
        { key: 'lighting_preserved', penalty: 8, label: 'lighting' },
        { key: 'sky_preserved', penalty: 5, label: 'sky' },
        { key: 'architectural_details_preserved', penalty: 12, label: 'architectural details' },
        { key: 'image_dimensions_preserved', penalty: 20, label: 'image dimensions' }
      ];
      
      for (const check of preservationChecks) {
        if (evaluation[check.key] === false) {
          score -= check.penalty;
          issues.push(`${check.label} not preserved`);
        }
      }
      
      if (evaluation.fidelity_issues && evaluation.fidelity_issues.trim() !== '') {
        issues.push(`Fidelity issues: ${evaluation.fidelity_issues}`);
      }
      
      // Ensure non-negative score
      score = Math.max(0, score);
      return {
        score,
        issues
      };
    }
    // Function to generate placement version
    async function generatePlacementVersion(prompt, imageBase64, label, geminiApiKey, referenceImages = []) {
      console.log(`[DEBUG] === GEMINI API CALL START: ${label} ===`);
      console.log(`[DEBUG] API Key available: ${!!geminiApiKey}`);
      console.log(`[DEBUG] Image data length: ${imageBase64 ? imageBase64.length : 'null'}`);
      console.log(`[DEBUG] Reference images count: ${referenceImages.length}`);
      console.log(`[DEBUG] Prompt preview: ${prompt.substring(0, 200)}...`);
      
      const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
      // Construct parts: base image, optional reference images, then prompt
      const parts: any[] = [
        {
          inlineData: {
            mimeType: "image/png",
            data: imageBase64
          }
        }
      ];
      for (const ref of referenceImages) {
        if (ref && ref.base64Data) {
          console.log(`[DEBUG] Adding reference image with mime type: ${ref.mimeType || "image/png"}`);
          parts.push({
            inlineData: {
              mimeType: ref.mimeType || "image/png",
              data: ref.base64Data
            }
          });
        }
      }
      parts.push({ text: prompt });
      
      console.log(`[DEBUG] Total parts in request: ${parts.length}`);
      
      const requestBody = {
        contents: [
          {
            parts
          }
        ],
        generationConfig: {
          temperature: 0.25,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
          responseModalities: [
            "IMAGE"
          ],
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      };
      
      // REFACTORED: Enhanced debug logging for prompts and responses
      console.log(`[DEBUG] === FULL PROMPT SENT TO GEMINI ===`);
      console.log(prompt);
      console.log(`[DEBUG] === END PROMPT ===`);
      console.log(`[DEBUG] Making API call to: ${GEMINI_IMAGE_URL}`);
      console.log(`[DEBUG] Request body size: ${JSON.stringify(requestBody).length} characters`);
      
      const response = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      console.log(`[DEBUG] API Response status: ${response.status}`);
      console.log(`[DEBUG] API Response headers:`, Object.fromEntries(response.headers.entries()));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DEBUG] API Error response body: ${errorText}`);
        throw new Error(`Generation API error: ${response.status} - ${errorText}`);
      }
      const result = await response.json();
      
      // REFACTORED: Log Gemini's raw response
      console.log(`[DEBUG] === GEMINI RAW RESPONSE ===`);
      console.log(JSON.stringify(result, null, 2));
      console.log(`[DEBUG] === END RAW RESPONSE ===`);
      // Extract image data
      let base64Data = null;
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts){
            const imageData = part.inlineData || part.inline_data;
            if (imageData && imageData.data) {
              let mimeType = imageData.mimeType || imageData.mime_type || 'image/png';
              if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
              if (!mimeType.startsWith('image/')) mimeType = 'image/png';
              base64Data = `data:${mimeType};base64,${imageData.data}`;
              break;
            }
          }
        }
      }
      
      // Parse any JSON feedback from Gemini
      let generationFeedback = null;
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              try {
                const jsonMatch = part.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  generationFeedback = JSON.parse(jsonMatch[0]);
                  console.log(`[DEBUG] Gemini generation feedback:`, generationFeedback);
                  break;
                }
              } catch (e) {
                console.log(`[DEBUG] Failed to parse generation feedback JSON:`, e.message);
              }
            }
          }
        }
      }
      
      return {
        base64Data,
        label,
        generationFeedback
      };
    }

    // Function to validate if the image was edited vs generated
    async function validateIfEdited(originalImageBase64, generatedImageBase64, geminiApiKey) {
      console.log(`[DEBUG] === VALIDATION CHECK: EDITED VS GENERATED ===`);
      
      const GEMINI_TEXT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      
      const checkPrompt = `Compare these two images carefully.
      
      Are they the SAME house/building with only an awning added?
      Or are they completely different houses/buildings?
      
      Look specifically at:
      - Brick color and texture
      - Window style and frames
      - Door style and color
      - Roof design
      - Ground/patio layout
      - Overall building architecture
      
      Respond with JSON only:
      {
        "same_house": boolean,
        "confidence": number (1-10),
        "explanation": "brief explanation of what you observed"
      }`;

      const parts = [
        { text: checkPrompt },
        { inlineData: { mimeType: "image/png", data: originalImageBase64 } },
        { inlineData: { mimeType: "image/png", data: generatedImageBase64 } }
      ];

      const requestBody = {
        contents: [{ parts }],
        generationConfig: { 
          temperature: 0.1, 
          topK: 16, 
          topP: 0.8, 
          maxOutputTokens: 1024 
        }
      };

      try {
        const response = await fetch(`${GEMINI_TEXT_URL}?key=${geminiApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          console.error(`[DEBUG] Validation API error: ${response.status}`);
          return { same_house: true, confidence: 5, explanation: "Validation failed, assuming edited" };
        }

        const result = await response.json();
        
        if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
          const textPart = result.candidates[0].content.parts.find(part => part.text);
          if (textPart) {
            try {
              const jsonMatch = textPart.text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const validation = JSON.parse(jsonMatch[0]);
                console.log(`[DEBUG] Validation result:`, validation);
                return validation;
              }
            } catch (e) {
              console.error(`[DEBUG] Failed to parse validation JSON:`, e.message);
            }
          }
        }
        
        return { same_house: true, confidence: 5, explanation: "Could not parse validation response" };
      } catch (error) {
        console.error(`[DEBUG] Validation error:`, error);
        return { same_house: true, confidence: 5, explanation: "Validation error occurred" };
      }
    }

    // REFACTORED: Enhanced evaluation function with debug logging
    async function evaluatePlacement(evaluationPrompt, imageBase64, geminiApiKey, referenceInlineData = null) {
      const GEMINI_TEXT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      
      // REFACTORED: Log evaluation prompt
      console.log(`[DEBUG] === EVALUATION PROMPT SENT TO GEMINI ===`);
      console.log(evaluationPrompt);
      console.log(`[DEBUG] === END EVALUATION PROMPT ===`);
      
      const parts = [
        { text: evaluationPrompt },
        { inlineData: { mimeType: "image/png", data: imageBase64 } }
      ];
      if (referenceInlineData && referenceInlineData.data) {
        parts.push({ inlineData: { mimeType: referenceInlineData.mimeType || "image/png", data: referenceInlineData.data } });
      }
      const requestBody = {
        contents: [ { parts } ],
        generationConfig: { temperature: 0.1, topK: 16, topP: 0.8, maxOutputTokens: 2048 }
      };
      const response = await fetch(`${GEMINI_TEXT_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        throw new Error(`Evaluation API error: ${response.status}`);
      }
      const result = await response.json();
      
      // REFACTORED: Log evaluation response
      console.log(`[DEBUG] === EVALUATION RAW RESPONSE ===`);
      console.log(JSON.stringify(result, null, 2));
      console.log(`[DEBUG] === END EVALUATION RESPONSE ===`);
      // Extract and parse evaluation
      let evaluation = null;
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts){
            if (part.text) {
              try {
                const jsonMatch = part.text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                  evaluation = JSON.parse(jsonMatch[0]);
                  break;
                }
              } catch (e) {
                console.log(`Failed to parse evaluation JSON:`, e.message);
              }
            }
          }
        }
      }
      return evaluation;
    }
    
    // REFACTORED: Simplified placement variations (3 max) and capped total iterations (5 max)
    const evaluationPrompt = buildEvaluationPrompt(effectiveAwningType, hasModelReference);
    console.log(`[DEBUG] Starting placement generation phase...`);
    const variations = [];
    const colorIterations = []; // Initialize colorIterations at proper scope
    const maxVariations = 3; // REDUCED from 5 to 3
    const initialVariations = 2;
    const scoreThreshold = 70; // Slightly lowered threshold for faster completion
    let currentBaseImage = imageBase64; // Track the best image for iterative improvement
    let bestScore = 0;
    let bestVariationIndex = -1;
    let bestVariation = null;
    // Phase 1: Generate initial 2 variations
    console.log(`[DEBUG] Phase 1: Generating initial ${initialVariations} variations...`);
    for(let i = 0; i < initialVariations; i++){
      try {
        console.log(`[DEBUG] Generating placement variation ${i + 1}/${initialVariations}...`);
        // Combine primary and additional reference images
        const allReferenceImages = [];
        if (hasModelReference && modelReferenceParsed) {
          allReferenceImages.push(modelReferenceParsed);
        }
        if (additionalReferencesParsed.length > 0) {
          allReferenceImages.push(...additionalReferencesParsed);
        }
        
        const variation = await generatePlacementVersion(
          buildPlacementPrompt(effectiveAwningType, new_awning_model, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio, hasModelReference || additionalReferencesParsed.length > 0, allReferenceImages.length),
          imageBase64,
          `Placement ${i + 1}`,
          GEMINI_API_KEY,
          allReferenceImages
        );
        if (variation.base64Data) {
          // Validate image dimensions
          const validation = await validateImageDimensions(imageBase64, variation.base64Data, `placement variation ${i + 1}`);
          if (!validation.valid && validation.correctedImage) {
            variation.base64Data = validation.correctedImage;
            console.log(`[DEBUG] Applied dimension correction to placement variation ${i + 1}`);
          }
          
          // Validate if the image was edited vs generated
          const originalBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          const generatedBase64 = variation.base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
          const editValidation = await validateIfEdited(originalBase64, generatedBase64, GEMINI_API_KEY);
          
          if (!editValidation.same_house && editValidation.confidence > 6) {
            console.log(`[WARNING] === GENERATION DETECTED INSTEAD OF EDITING ===`);
            console.log(`[WARNING] Variation ${i + 1}: ${editValidation.explanation}`);
            console.log(`[WARNING] Confidence: ${editValidation.confidence}/10`);
            console.log(`[WARNING] This suggests the model generated a new house instead of editing the original`);
            console.log(`[WARNING] ================================================`);
            
            // Add a flag to the variation to indicate this issue
            variation.generationDetected = true;
            variation.validationResult = editValidation;
          } else {
            console.log(`[DEBUG] Validation passed: Same house detected (confidence: ${editValidation.confidence}/10)`);
            variation.generationDetected = false;
            variation.validationResult = editValidation;
          }
          // Evaluate the placement
          const evalBase64Match = variation.base64Data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          const evalBase64Data = evalBase64Match ? evalBase64Match[1] : variation.base64Data;
          // Use the first reference image for evaluation (primary reference)
          const primaryReference = allReferenceImages.length > 0 ? allReferenceImages[0] : null;
          const evaluation = await evaluatePlacement(
            evaluationPrompt,
            evalBase64Data,
            GEMINI_API_KEY,
            primaryReference ? { mimeType: primaryReference.mimeType, data: primaryReference.base64Data } : null
          );
          
          // MARKIEZEN EVALUATION DEBUG LOGGING
          if (effectiveAwningType === 'markiezen') {
            console.log('=== MARKIEZEN EVALUATION DEBUG ===');
            console.log('Evaluation result:', JSON.stringify(evaluation, null, 2));
            console.log('==================================');
          }
          
          // FIDELITY DEBUG LOGGING - Compare input vs output characteristics
          if (evaluation) {
            console.log('=== IMAGE FIDELITY ANALYSIS ===');
            console.log(`Variation ${i + 1} - ${variation.label}`);
            console.log('Input Image: Original house photo');
            console.log('Output Analysis:');
            
            // Core fidelity metrics
            if (typeof evaluation.image_fidelity_score === 'number') {
              console.log(`  📊 Image Fidelity Score: ${evaluation.image_fidelity_score}/10`);
              if (evaluation.image_fidelity_score < 7) {
                console.log('  🚨 CRITICAL: Low fidelity detected - major background changes likely');
              } else if (evaluation.image_fidelity_score < 8) {
                console.log('  ⚠️  WARNING: Moderate fidelity issues detected');
              } else {
                console.log('  ✅ Good fidelity score');
              }
            }
            
            // Background preservation analysis
            if (typeof evaluation.background_preservation === 'boolean') {
              console.log(`  🏠 Background Preserved: ${evaluation.background_preservation ? '✅ YES' : '❌ NO'}`);
              if (!evaluation.background_preservation) {
                console.log('  🚨 CRITICAL: Background elements were modified or regenerated');
              }
            }
            
            // Generation vs editing detection
            if (evaluation.generation_vs_editing) {
              console.log(`  🎨 Process Type: ${evaluation.generation_vs_editing}`);
              if (evaluation.generation_vs_editing === 'generation') {
                console.log('  🚨 CRITICAL: Gemini performed generation instead of editing');
              } else {
                console.log('  ✅ Proper editing behavior detected');
              }
            }
            
            // Detailed element preservation
            const preservedElements = evaluation.preserved_elements || {};
            console.log('  🔍 Element Preservation Analysis:');
            Object.entries(preservedElements).forEach(([element, preserved]) => {
              const status = preserved ? '✅' : '❌';
              console.log(`    ${element}: ${status} ${preserved ? 'PRESERVED' : 'CHANGED'}`);
            });
            
            // Fidelity issues summary
            if (evaluation.fidelity_issues && evaluation.fidelity_issues.trim()) {
              console.log(`  ⚠️  Fidelity Issues: ${evaluation.fidelity_issues}`);
            }
            
            console.log('================================');
          }
          
          const score = computePlacementScore(evaluation, effectiveAwningType);
          variations.push({
            label: variation.label,
            base64: variation.base64Data,
            evalParsed: evaluation,
            evalScore: score,
            genError: null,
            evalError: null
          });
          // Track best score and variation
          if (score > bestScore) {
            bestScore = score;
            bestVariationIndex = i;
            // Update base image for next iteration
            currentBaseImage = evalBase64Data;
          }
          console.log(`[DEBUG] ✓ Variation ${i + 1} completed with score: ${score}`);
        } else {
          console.log(`[DEBUG] ✗ Variation ${i + 1} failed - no image generated`);
          variations.push({
            label: variation.label,
            base64: null,
            evalParsed: null,
            evalScore: 0,
            genError: "No image generated",
            evalError: null
          });
        }
        // Small delay to prevent rate limiting
        await new Promise((resolve)=>setTimeout(resolve, 1000));
      } catch (error) {
        console.log(`[DEBUG] ✗ Variation ${i + 1} failed:`, error.message);
        variations.push({
          label: `Placement ${i + 1}`,
          base64: null,
          evalParsed: null,
          evalScore: 0,
          genError: error.message,
          evalError: null
        });
      }
    }
    console.log(`[DEBUG] Phase 1 complete. Best score: ${bestScore}`);
    // Phase 2: Check if we should continue or proceed to color editing
    if (bestScore >= scoreThreshold) {
      console.log(`[DEBUG] Best score (${bestScore}) meets threshold (${scoreThreshold}). Proceeding to color editing.`);
    } else {
      console.log(`[DEBUG] Best score (${bestScore}) below threshold (${scoreThreshold}). Generating additional variations...`);
      // Continue with remaining variations, using best image as base for iterative improvement
      for(let i = initialVariations; i < maxVariations; i++){
        try {
          console.log(`[DEBUG] Generating placement variation ${i + 1}/${maxVariations} (iterative improvement)...`);
          // Use improved prompt for iterative refinement
          // Combine primary and additional reference images for iterative improvement
          const allReferenceImages = [];
          if (hasModelReference && modelReferenceParsed) {
            allReferenceImages.push(modelReferenceParsed);
          }
          if (additionalReferencesParsed.length > 0) {
            allReferenceImages.push(...additionalReferencesParsed);
          }
          
          // Check if previous best variation had fidelity issues
          bestVariation = variations.find(v => v.evalScore === bestScore);
          const hasFidelityIssues = bestVariation && bestVariation.evalParsed && (
            bestVariation.evalParsed.image_fidelity_score < 7 ||
            bestVariation.evalParsed.background_preservation === false ||
            bestVariation.evalParsed.generation_vs_editing === 'generation'
          );
          
          let iterativePrompt;
          if (hasFidelityIssues) {
            console.log(`[DEBUG] Fidelity issues detected in best variation. Using enhanced inpainting prompt.`);
            // Use enhanced inpainting prompt for fidelity issues
            iterativePrompt = `🚨 CRITICAL FIDELITY RECOVERY MODE 🚨

You are performing PRECISE IMAGE EDITING, not image generation. The previous attempt had fidelity issues.

🔴 MANDATORY INPAINTING RULES:
- ONLY edit the area marked by the red line
- PRESERVE every single pixel outside the red line area
- DO NOT change house color, texture, windows, doors, roof, or any background elements
- DO NOT generate a new image - EDIT the existing one
- The red line is your EDIT MASK - add awning there, then remove the red line

🏠 PRESERVATION CHECKLIST (CRITICAL):
✅ Keep exact same brick/wall color and texture
✅ Keep exact same window frames and glass
✅ Keep exact same door style and color
✅ Keep exact same roof and gutters
✅ Keep exact same ground/patio surface
✅ Keep exact same lighting and shadows
✅ Keep exact same sky and background
✅ Keep exact same image dimensions

${buildPlacementPrompt(effectiveAwningType, new_awning_model, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio, hasModelReference || additionalReferencesParsed.length > 0, allReferenceImages.length)}

FIDELITY VERIFICATION: After adding the awning, verify that ONLY the awning area has changed and everything else remains pixel-perfect identical to the input.`;
          } else {
            // Standard iterative improvement prompt
            const basePrompt = buildPlacementPrompt(effectiveAwningType, new_awning_model, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio, hasModelReference || additionalReferencesParsed.length > 0, allReferenceImages.length);
            iterativePrompt = `${basePrompt}\n\nIMPORTANT: This is an iterative improvement. The current image already has an awning, but it needs refinement. Focus on:\n- Improving the awning's positioning and proportions\n- Enhancing the structural realism and mounting details\n- Better integration with the building architecture\n- Correcting any placement or scaling issues from the previous iteration`;
          }
          
          const variation = await generatePlacementVersion(
            iterativePrompt,
            imageBase64,
            `Placement ${i + 1} (Refined)`,
            GEMINI_API_KEY,
            allReferenceImages
          );
          if (variation.base64Data) {
            // Validate image dimensions
            const validation = await validateImageDimensions(imageBase64, variation.base64Data, `refined placement variation ${i + 1}`);
            if (!validation.valid && validation.correctedImage) {
              variation.base64Data = validation.correctedImage;
              console.log(`[DEBUG] Applied dimension correction to refined placement variation ${i + 1}`);
            }
            
            // Validate if the image was edited vs generated (iterative)
            const originalBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            const generatedBase64 = variation.base64Data.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
            const editValidation = await validateIfEdited(originalBase64, generatedBase64, GEMINI_API_KEY);
            
            if (!editValidation.same_house && editValidation.confidence > 6) {
              console.log(`[WARNING] === GENERATION DETECTED IN ITERATIVE REFINEMENT ===`);
              console.log(`[WARNING] Refined Variation ${i + 1}: ${editValidation.explanation}`);
              console.log(`[WARNING] Confidence: ${editValidation.confidence}/10`);
              console.log(`[WARNING] This suggests the model generated a new house instead of refining the original`);
              console.log(`[WARNING] ========================================================`);
              
              // Add a flag to the variation to indicate this issue
              variation.generationDetected = true;
              variation.validationResult = editValidation;
            } else {
              console.log(`[DEBUG] Iterative validation passed: Same house detected (confidence: ${editValidation.confidence}/10)`);
              variation.generationDetected = false;
              variation.validationResult = editValidation;
            }
            // Evaluate the placement
            const evalBase64Match = variation.base64Data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
            const evalBase64Data = evalBase64Match ? evalBase64Match[1] : variation.base64Data;
            // Use the first reference image for evaluation (primary reference)
            const primaryReference = allReferenceImages.length > 0 ? allReferenceImages[0] : null;
            const evaluation = await evaluatePlacement(
              evaluationPrompt,
              evalBase64Data,
              GEMINI_API_KEY,
              primaryReference ? { mimeType: primaryReference.mimeType, data: primaryReference.base64Data } : null
            );
            
            // MARKIEZEN EVALUATION DEBUG LOGGING (iterative)
            if (effectiveAwningType === 'markiezen') {
              console.log('=== MARKIEZEN ITERATIVE EVALUATION DEBUG ===');
              console.log('Evaluation result:', JSON.stringify(evaluation, null, 2));
              console.log('============================================');
            }
            
            // ITERATIVE FIDELITY DEBUG LOGGING - Track fidelity during refinement
            if (evaluation) {
              console.log('=== ITERATIVE FIDELITY ANALYSIS ===');
              console.log(`Refined Variation ${i + 1} - ${variation.label}`);
              console.log(`Prompt Type: ${hasFidelityIssues ? 'FIDELITY RECOVERY MODE' : 'Standard Iterative'}`);
              
              // Core fidelity metrics comparison
              if (typeof evaluation.image_fidelity_score === 'number') {
                console.log(`  📊 Refined Fidelity Score: ${evaluation.image_fidelity_score}/10`);
                if (hasFidelityIssues) {
                  console.log(`  🔄 Recovery Attempt: ${evaluation.image_fidelity_score >= 7 ? 'SUCCESS' : 'STILL NEEDS WORK'}`);
                }
              }
              
              // Background preservation in refinement
              if (typeof evaluation.background_preservation === 'boolean') {
                console.log(`  🏠 Background Still Preserved: ${evaluation.background_preservation ? '✅ YES' : '❌ NO'}`);
              }
              
              // Check if refinement fixed generation vs editing
              if (evaluation.generation_vs_editing) {
                console.log(`  🎨 Refined Process Type: ${evaluation.generation_vs_editing}`);
                if (hasFidelityIssues && evaluation.generation_vs_editing === 'editing') {
                  console.log('  ✅ SUCCESS: Recovery mode fixed generation behavior');
                }
              }
              
              console.log('===================================');
            }
            
            const score = computePlacementScore(evaluation, effectiveAwningType);
            variations.push({
              label: variation.label,
              base64: variation.base64Data,
              evalParsed: evaluation,
              evalScore: score,
              genError: null,
              evalError: null
            });
            // Update best if this iteration improved
            if (score > bestScore) {
              bestScore = score;
              bestVariationIndex = i;
              currentBaseImage = evalBase64Data;
              console.log(`[DEBUG] ✓ Variation ${i + 1} improved score to: ${score}`);
              // Early exit if we reach threshold
              if (score >= scoreThreshold) {
                console.log(`[DEBUG] Score threshold reached! Stopping early and proceeding to color editing.`);
                break;
              }
            } else {
              console.log(`[DEBUG] ✓ Variation ${i + 1} completed with score: ${score} (no improvement)`);
            }
          } else {
            console.log(`[DEBUG] ✗ Variation ${i + 1} failed - no image generated`);
            variations.push({
              label: variation.label,
              base64: null,
              evalParsed: null,
              evalScore: 0,
              genError: "No image generated",
              evalError: null
            });
          }
          // Small delay to prevent rate limiting
          await new Promise((resolve)=>setTimeout(resolve, 1000));
        } catch (error) {
          console.log(`[DEBUG] ✗ Variation ${i + 1} failed:`, error.message);
          variations.push({
            label: `Placement ${i + 1}`,
            base64: null,
            evalParsed: null,
            evalScore: 0,
            genError: error.message,
            evalError: null
          });
        }
      }
    }
    // Find the best placement
    let validVariations = variations.filter((v)=>v.base64 && v.evalScore > 0);
    
    // Fallback: if no positive scores due to fidelity penalties, use any variation with an image
    if (validVariations.length === 0) {
      console.log('[DEBUG] No positive scores found, using fallback to any variation with image');
      validVariations = variations.filter((v)=>v.base64);
      
      if (validVariations.length === 0) {
        throw new Error("No valid placement variations generated");
      }
    }
    const best = validVariations.reduce((a, b)=>a.evalScore > b.evalScore ? a : b);
    bestScore = best.evalScore;
    console.log(`[DEBUG] Best placement score: ${bestScore} (${best.label})`);
    let processedImage = best.base64;
    let finalColorScore = 0;
    let colorGoalMet = false;
    // Color iteration phase (if fabric color is specified and placement score is good enough)
    if (new_fabric_color && best.base64 && bestScore >= 30) {
      console.log(`[DEBUG] Starting color iteration phase for color: ${new_fabric_color}`);
      const hasColorSwatch = !!(color_swatch_image && color_swatch_image.trim());
      const maxColorIterations = 5;
      const colorGoalThreshold = 60;
      let currentColorImageData = best.base64;
      let currentColorIteration = 1;
      let bestColorScore = 0;
      let bestColorIteration = 1;
      let bestColorImageData = best.base64;
      // Extract base64 data for processing - use ORIGINAL input image for aspect ratio reference
      // Use the original input image (imageBase64) as the first image for aspect ratio preservation
      let colorBase64Data = imageBase64;
      // Determine pattern type and stripe ratio
      const finalPatternType = new_fabric_color.toLowerCase().includes('stripe') || new_fabric_color.toLowerCase().includes('gestreept') || pattern_type === 'striped' || pattern_type === 'gestreept' ? 'striped' : 'solid';
      const finalStripeRatio = finalPatternType === 'striped' ? stripe_ratio || '1:1' : null;
      while(currentColorIteration <= maxColorIterations){
        try {
          console.log(`[DEBUG] Color iteration ${currentColorIteration}/${maxColorIterations}...`);
          // Create detailed color prompt based on pattern type and iteration (matching working version)
          let colorEditPrompt;
          const swatchReference = hasColorSwatch ? "Match the exact color and pattern shown in the reference swatch image." : `Apply ${new_fabric_color} color.`;
          if (currentColorIteration === 1) {
            // First iteration: comprehensive color application
            if (finalPatternType === 'solid') {
            colorEditPrompt = hasColorSwatch ? `Color correction to match swatch: Apply the exact color from the reference swatch to the awning fabric only. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms. Preserve all structural elements (frame, arms, cassette) and building features. ${swatchReference}

RESPONSE FORMAT: Generate the image as requested, and if you need to provide feedback about the color application, format it as JSON:
{
  "color_application_status": "success|partial|failed",
  "color_accuracy": number (1-10),
  "pattern_consistency": number (1-10),
  "fabric_visibility": number (1-10),
  "notes": "specific observations about color/pattern application",
  "adjustments_made": "description of any corrections applied"
}` : `Color application: Apply ${new_fabric_color} to the awning fabric only. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms. Preserve all structural elements (frame, arms, cassette) and building features. Create uniform, smooth fabric appearance.

RESPONSE FORMAT: Generate the image as requested, and if you need to provide feedback about the color application, format it as JSON:
{
  "color_application_status": "success|partial|failed",
  "color_accuracy": number (1-10),
  "pattern_consistency": number (1-10),
  "fabric_visibility": number (1-10),
  "notes": "specific observations about color/pattern application",
  "adjustments_made": "description of any corrections applied"
}`;
          } else {
            if (finalStripeRatio === '1:1') {
              colorEditPrompt = hasColorSwatch ? `Pattern application to match swatch: Apply the exact pattern from the reference swatch to the awning fabric only. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms. Ensure pattern consistency across all fabric panels. ${swatchReference}

RESPONSE FORMAT: Generate the image as requested, and if you need to provide feedback about the pattern application, format it as JSON:
{
  "pattern_application_status": "success|partial|failed",
  "pattern_accuracy": number (1-10),
  "stripe_consistency": number (1-10),
  "color_alternation": number (1-10),
  "notes": "specific observations about pattern application",
  "stripe_issues": "any problems with stripe width or color alternation"
}` : `Stripe application: Apply ${new_fabric_color} stripes to the awning fabric only. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms. Create EQUAL WIDTH STRIPES where each stripe is exactly the same width as adjacent stripes. Ensure alternating colors with NO DUPLICATE COLORS side by side. Each stripe must be distinct from its neighbors.

RESPONSE FORMAT: Generate the image as requested, and if you need to provide feedback about the stripe application, format it as JSON:
{
  "pattern_application_status": "success|partial|failed",
  "pattern_accuracy": number (1-10),
  "stripe_consistency": number (1-10),
  "color_alternation": number (1-10),
  "notes": "specific observations about stripe application",
  "stripe_issues": "any problems with stripe width or color alternation"
}`;
            } else {
                colorEditPrompt = hasColorSwatch ? `Pattern application to match swatch: Apply the exact pattern from the reference swatch to the awning fabric only. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms. Ensure pattern consistency across all fabric panels. ${swatchReference}

RESPONSE FORMAT: Generate the image as requested, and if you need to provide feedback about the pattern application, format it as JSON:
{
  "pattern_application_status": "success|partial|failed",
  "pattern_accuracy": number (1-10),
  "stripe_ratio_accuracy": number (1-10),
  "pattern_consistency": number (1-10),
  "notes": "specific observations about pattern application",
  "ratio_issues": "any problems with stripe ratio proportions"
}` : `Stripe application: Apply ${new_fabric_color} stripes with ${finalStripeRatio} ratio to the awning fabric only. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms. Create consistent pattern across entire fabric surface, maintaining stripe proportions.

RESPONSE FORMAT: Generate the image as requested, and if you need to provide feedback about the stripe application, format it as JSON:
{
  "pattern_application_status": "success|partial|failed",
  "pattern_accuracy": number (1-10),
  "stripe_ratio_accuracy": number (1-10),
  "pattern_consistency": number (1-10),
  "notes": "specific observations about stripe application",
  "ratio_issues": "any problems with stripe ratio proportions"
}`;
              }
          }
          } else {
            // Second iteration: refinement and correction
            const refinementPrompts = finalPatternType === 'solid' ? hasColorSwatch ? [
              `Pattern correction to match swatch: Ensure the pattern follows the reference swatch exactly, consistently across all fabric panels and seams. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`,
              `Final swatch pattern application: Perfect the pattern to exactly match the reference swatch for complete visual consistency. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`
            ] : [
              `Color refinement: Perfect the ${new_fabric_color} application, ensuring uniform coverage and smooth fabric texture throughout. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`,
              `Final color correction: Achieve perfect ${new_fabric_color} uniformity across the entire awning fabric surface. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`
            ] : hasColorSwatch ? [
                `Stripe alignment to match swatch: Apply the pattern shown in the reference swatch with proper spacing, ensuring pattern continuity across fabric joints. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`,
                `Pattern optimization to match swatch: Ensure the pattern maintains the exact appearance of the reference swatch throughout the fabric. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`
              ] : finalStripeRatio === '1:1' ? [
                `Pattern correction: Ensure ${new_fabric_color} stripes have EQUAL WIDTH - each stripe exactly the same width as adjacent stripes. NO DUPLICATE COLORS side by side. Perfect alternating pattern. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`,
                `Final stripe optimization: Perfect the ${new_fabric_color} equal-width stripe pattern. Verify each stripe is identical in width and no two adjacent stripes share the same color. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`
              ] : [
                `Pattern correction: Ensure ${new_fabric_color} stripes follow ${finalStripeRatio} ratio consistently across all fabric panels and seams. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`,
                `Final stripe optimization: Perfect the ${new_fabric_color} stripe pattern for complete consistency and proper proportions. CRITICAL: Keep the awning in fully extended/open position with proper diagonal downward slope. The fabric must be clearly visible and angled downward from the wall mounting point. DO NOT add random mechanical elements or fake extension mechanisms.`
            ];
            colorEditPrompt = refinementPrompts[(currentColorIteration - 2) % refinementPrompts.length];
          }
          // Make color edit request to Gemini
          const colorEditRequestParts = [
            {
              inlineData: {
                mimeType: "image/png",
                data: colorBase64Data
              }
            },
            {
              text: colorEditPrompt
            }
          ];
          // Add the placement-processed image as a second reference (for the awning to color)
          const placementBase64Match = currentColorImageData.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          const placementBase64Data = placementBase64Match ? placementBase64Match[1] : currentColorImageData;
          colorEditRequestParts.push({
            inlineData: {
              mimeType: "image/png",
              data: placementBase64Data
            }
          });
          // Add color swatch image as reference if available
          if (hasColorSwatch) {
            const swatchParsed = parseDataUri(color_swatch_image);
            colorEditRequestParts.push({
              inlineData: {
                mimeType: swatchParsed.mimeType,
                data: swatchParsed.base64Data
              }
            });
          }
          const colorEditRequestBody = {
            contents: [
              {
                parts: colorEditRequestParts
              }
            ],
            generationConfig: {
              temperature: 0.4,
              topK: 32,
              topP: 1,
              maxOutputTokens: 4096,
              responseModalities: [
                "IMAGE"
              ],
              imageConfig: {
                aspectRatio: "1:1"
              }
            }
          };
          const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
          const colorEditResponse = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(colorEditRequestBody)
          });
          if (!colorEditResponse.ok) {
            throw new Error(`Color edit API error: ${colorEditResponse.status}`);
          }
          const colorEditResult = await colorEditResponse.json();
          // Extract edited image
          let editedColorImageData = null;
          if (colorEditResult.candidates && colorEditResult.candidates[0]) {
            const candidate = colorEditResult.candidates[0];
            if (candidate.content && candidate.content.parts) {
              for (const part of candidate.content.parts){
                const imageData = part.inlineData || part.inline_data;
                if (imageData && imageData.data) {
                  let mimeType = imageData.mimeType || imageData.mime_type || 'image/png';
                  if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
                  if (!mimeType.startsWith('image/')) mimeType = 'image/png';
                  editedColorImageData = `data:${mimeType};base64,${imageData.data}`;
                  break;
                }
              }
            }
          }
          
          // Parse any JSON feedback from Gemini about color application
          let colorApplicationFeedback = null;
          if (colorEditResult.candidates && colorEditResult.candidates[0]) {
            const candidate = colorEditResult.candidates[0];
            if (candidate.content && candidate.content.parts) {
              for (const part of candidate.content.parts) {
                if (part.text) {
                  try {
                    const jsonMatch = part.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      colorApplicationFeedback = JSON.parse(jsonMatch[0]);
                      console.log(`[DEBUG] Gemini color application feedback:`, colorApplicationFeedback);
                      break;
                    }
                  } catch (e) {
                    console.log(`[DEBUG] Failed to parse color application feedback JSON:`, e.message);
                  }
                }
              }
            }
          }
          
          if (!editedColorImageData) {
            editedColorImageData = currentColorImageData; // Use current as fallback
          } else {
            // Validate image dimensions after color editing
            const validation = await validateImageDimensions(currentColorImageData, editedColorImageData, `color editing - ${finalPatternType}`);
            if (!validation.valid && validation.correctedImage) {
              editedColorImageData = validation.correctedImage;
              console.log(`[DEBUG] Applied dimension correction to color iteration ${currentColorIteration}`);
            }
          }
          // REFACTORED: Enhanced color evaluation prompt with awning type validation
          const colorEvaluationPrompt = `Evaluate awning fabric for ${new_fabric_color} ${finalPatternType}. Check that ONLY the fabric textile material was changed and ALL structural/building elements were preserved. Respond ONLY with JSON:
{
  "is_uniform_base_color": boolean,
  "has_decorative_stripes": boolean,
  "slats_uniform_color": boolean,
  "matches_swatch_color": boolean,
  "fabric_only_edited": boolean,
  "awning_frame_preserved": boolean,
  "awning_cassette_preserved": boolean,
  "awning_arms_preserved": boolean,
  "building_walls_preserved": boolean,
  "windows_preserved": boolean,
  "doors_preserved": boolean,
  "roof_preserved": boolean,
  "brick_color_unchanged": boolean,
  "fabric_texture_smooth": boolean,
  "has_visible_ribs": boolean,
  "has_visible_slats": boolean,
  "has_structural_lines": boolean,
  "stripe_accuracy": 0.8,
  "pattern_consistency": boolean,
  "is_correct_awning_type": boolean,
  "awning_type_detected": "string (e.g., 'markiezen', 'knikarm')",
  "goal_met": boolean
}`;
          const colorEvalBase64Match = editedColorImageData.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          const colorEvalBase64Data = colorEvalBase64Match ? colorEvalBase64Match[1] : editedColorImageData;
          const colorEvaluationRequestBody = {
            contents: [
              {
                parts: [
                  {
                    text: colorEvaluationPrompt
                  },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: colorEvalBase64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              topK: 16,
              topP: 0.8,
              maxOutputTokens: 2048
            }
          };
          const GEMINI_TEXT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
          const colorEvaluationResponse = await fetch(`${GEMINI_TEXT_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(colorEvaluationRequestBody)
          });
          if (!colorEvaluationResponse.ok) {
            throw new Error(`Color evaluation API error: ${colorEvaluationResponse.status}`);
          }
          const colorEvaluationResult = await colorEvaluationResponse.json();
          let colorEvaluation = null;
          if (colorEvaluationResult.candidates && colorEvaluationResult.candidates[0]) {
            const candidate = colorEvaluationResult.candidates[0];
            if (candidate.content && candidate.content.parts) {
              for (const part of candidate.content.parts){
                if (part.text) {
                  try {
                    const jsonMatch = part.text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      colorEvaluation = JSON.parse(jsonMatch[0]);
                      break;
                    }
                  } catch (e) {
                    console.log(`Failed to parse color evaluation JSON:`, e.message);
                  }
                }
              }
            }
          }
          // Fallback evaluation if parsing failed
          if (!colorEvaluation) {
            colorEvaluation = {
              is_uniform_base_color: true,
              has_decorative_stripes: finalPatternType !== 'solid',
              slats_uniform_color: true,
              matches_swatch_color: true,
              fabric_only_edited: true,
              awning_frame_preserved: true,
              awning_cassette_preserved: true,
              awning_arms_preserved: true,
              building_walls_preserved: true,
              windows_preserved: true,
              doors_preserved: true,
              roof_preserved: true,
              brick_color_unchanged: true,
              fabric_texture_smooth: true,
              has_visible_ribs: false,
              has_visible_slats: false,
              has_structural_lines: false,
              stripe_accuracy: finalPatternType === 'solid' ? 1 : 0.7,
              pattern_consistency: true,
              goal_met: false
            };
          }
          // Calculate color score
          const { score: colorScore, issues: colorIssues } = calculateColorIterationScore(colorEvaluation, finalPatternType);
          // Debug output for color scoring
          console.log(`[DEBUG] Color iteration ${currentColorIteration} evaluation:`);
          console.log(`[DEBUG] - Score: ${colorScore}/100`);
          console.log(`[DEBUG] - Goal met: ${colorEvaluation.goal_met}`);
          console.log(`[DEBUG] - Color threshold: ${colorGoalThreshold}`);
          console.log(`[DEBUG] - Issues found: ${colorIssues.length > 0 ? colorIssues.join(', ') : 'None'}`);
          // Store iteration data
          colorIterations.push({
            iteration: currentColorIteration,
            score: colorScore,
            goalMet: colorEvaluation.goal_met,
            evaluation: colorEvaluation,
            issues: colorIssues,
            imageData: editedColorImageData,
            applicationFeedback: colorApplicationFeedback
          });
          // Update best if this iteration improved
          if (colorScore > bestColorScore) {
            bestColorScore = colorScore;
            bestColorIteration = currentColorIteration;
            bestColorImageData = editedColorImageData;
          }
          // Check if goal is met
          if (colorEvaluation.goal_met && colorScore >= colorGoalThreshold) {
            console.log(`[DEBUG] Color goal achieved in iteration ${currentColorIteration}! Score: ${colorScore}`);
            colorGoalMet = true;
            finalColorScore = colorScore;
            processedImage = editedColorImageData;
            break;
          }
          // Update current image for next iteration
          currentColorImageData = editedColorImageData;
          currentColorIteration++;
          // Small delay to prevent rate limiting
          await new Promise((resolve)=>setTimeout(resolve, 1000));
        } catch (error) {
          console.log(`[DEBUG] Color iteration ${currentColorIteration} failed:`, error.message);
          colorIterations.push({
            iteration: currentColorIteration,
            score: 0,
            goalMet: false,
            evaluation: null,
            issues: [
              error.message
            ],
            imageData: null,
            applicationFeedback: null
          });
          currentColorIteration++;
        }
      }
      // Use best color iteration if goal wasn't met
      if (!colorGoalMet && bestColorScore > 0) {
        console.log(`[DEBUG] Using best color iteration ${bestColorIteration} with score: ${bestColorScore}`);
        finalColorScore = bestColorScore;
        processedImage = bestColorImageData;
      } else if (colorGoalMet) {
        // If color goal was met, use the current color image
        processedImage = currentColorImageData;
      }
      // If no color iterations succeeded, processedImage remains as best.base64
      console.log(`[DEBUG] Color iteration phase complete. Final score: ${finalColorScore}, Goal met: ${colorGoalMet}`);
    } else {
      console.log(`[DEBUG] Skipping color iteration phase - no fabric color specified or placement score too low`);
      finalColorScore = bestScore; // Use placement score as final score
      // Ensure processedImage is set to the best placement image
      processedImage = best.base64;
    }
    // Determine overall goal achievement
    const overallGoalAchieved = bestScore >= 60 && (!new_fabric_color || finalColorScore >= 50);
    const finalScore = new_fabric_color ? Math.min(bestScore, finalColorScore) : bestScore;
    console.log(`[DEBUG] Final results:`);
    console.log(`[DEBUG] - Placement score: ${bestScore}`);
    console.log(`[DEBUG] - Color score: ${finalColorScore}`);
    console.log(`[DEBUG] - Overall goal achieved: ${overallGoalAchieved}`);
    console.log(`[DEBUG] - Final score: ${finalScore}`);
    // Send completion notification email
    let completionEmailSent = false;
    console.log('DEBUG: Checking completion email conditions (auto on price request):');
    console.log('- include_price_indication:', include_price_indication);
    console.log('- customer_email:', customer_email);
    console.log('- gmailService:', !!gmailService);
    console.log('- processedImage:', !!processedImage);
    console.log('- shouldSendEmails:', shouldSendEmails);
    if (shouldSendEmails && processedImage) {
      console.log('DEBUG: All conditions met, attempting to send completion email...');
      console.log('DEBUG: Customer email:', customer_email);
      console.log('DEBUG: Customer name:', customer_name);
      console.log('DEBUG: Awning type:', new_awning_type);
      console.log('DEBUG: Goal achieved:', overallGoalAchieved);
      console.log('DEBUG: Final score:', finalScore);
      console.log('DEBUG: Price data available:', !!priceData);
      
      try {
        console.log('DEBUG: Starting completion notification send...');
        await gmailService.sendCompletionNotification(customer_email, customer_name, new_awning_type, processedImage, overallGoalAchieved, finalScore, priceData);
        completionEmailSent = true;
        console.log('SUCCESS: Completion notification email sent successfully');
      } catch (error) {
        console.error('FAILED: Completion notification email failed:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Try to send a simple notification without image as fallback
        try {
          console.log('DEBUG: Attempting fallback email without image...');
          await gmailService.sendCompletionNotification(customer_email, customer_name, new_awning_type, null, overallGoalAchieved, finalScore, priceData);
          completionEmailSent = true;
          console.log('SUCCESS: Fallback completion email sent without image');
        } catch (fallbackError) {
          console.error('FAILED: Even fallback email failed:', fallbackError);
        }
      }
    } else if (shouldSendEmails) {
      // No processed image available; still send a completion email without image
      try {
        console.log('DEBUG: Sending completion email without image (no processedImage)...');
        await gmailService.sendCompletionNotification(customer_email, customer_name, new_awning_type, null, overallGoalAchieved, finalScore, priceData);
        completionEmailSent = true;
        console.log('SUCCESS: Completion email sent without image');
      } catch (error) {
        console.error('FAILED: Completion email without image failed:', error);
      }
    } else {
      console.log('DEBUG: Completion email not sent - conditions not met');
    }
    // REFACTORED: Enhanced debug object with effective_awning_type and prompt_used
    const debugInfo = {
      effective_awning_type: effectiveAwningType,
      original_awning_type: new_awning_type,
      awning_model: new_awning_model,
      prompt_used: bestVariation ? bestVariation.label : 'none',
      placementVariations: variations.map((v)=>({
          label: v.label,
          score: v.evalScore,
          hasImage: !!v.base64,
          evaluation: v.evalParsed,
          generationError: v.genError,
          evaluationError: v.evalError
        })),
      colorIterations: new_fabric_color ? colorIterations.map((ci)=>({
          iteration: ci.iteration,
          score: ci.score,
          goalMet: ci.goalMet,
          hasImage: !!ci.imageData,
          issues: ci.issues
        })) : [],
      emailNotifications: {
        startEmailSent,
        completionEmailSent,
        gmailServiceAvailable: !!gmailService,
        notificationsEnabled: send_notifications,
        customerEmailProvided: !!customer_email
      },
      priceCalculation: priceData ? {
        included: true,
        totalPrice: priceData.totalPrice,
        calculatedAt: priceData.calculatedAt
      } : {
        included: false,
        reason: !include_price_indication ? 'Not requested' : 'Missing required parameters'
      }
    };
    // Return successful response
    return new Response(JSON.stringify({
      success: true,
      processed_image: processedImage,
      placement_score: bestScore,
      color_score: finalColorScore,
      overall_score: finalScore,
      goal_achieved: overallGoalAchieved,
      awning_type: new_awning_type,
      fabric_color: new_fabric_color,
      price_data: priceData,
      debug: debugInfo
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
    } // End of executeMainProcessing function
    
    // Execute main processing logic
    return await executeMainProcessing();
    
  } catch (error) {
    console.error('Edge function error:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({
      error: error.message,
      details: error.stack
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
