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
    const accessToken = await this.getAccessToken();
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
    let rawEmail;
    try {
      rawEmail = encode(email.join('\r\n'));
    } catch (error) {
      console.error('Failed to encode email content:', error);
      console.error('Email subject:', subject);
      throw new Error('Email content encoding failed');
    }
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
      throw new Error(`Gmail API error: ${result.error.message}`);
    }
    return result;
  }
  async sendStartNotification(customerEmail, customerName) {
    const subject = '🚀 Uw Zonnescherm Visualisatie wordt Gemaakt';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Hallo ${customerName || 'daar'}!</h2>
          
          <p style="color: #555; line-height: 1.6;">Bedankt voor uw aanvraag! We zijn nu bezig met het maken van uw persoonlijke zonnescherm visualisatie en prijsindicatie.</p>
          
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db;">
            <h3 style="color: #2c3e50; margin-top: 0;">⏳ Wat gebeurt er nu?</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>Onze AI analyseert uw woningfoto</li>
              <li>We plaatsen het zonnescherm op de beste locatie</li>
              <li>We berekenen uw persoonlijke prijsindicatie</li>
              <li>U ontvangt binnen enkele minuten het resultaat</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 20px 0;">
            <div style="background: #28a745; color: white; padding: 15px; border-radius: 8px; display: inline-block;">
              <strong>🔄 Bezig met verwerken...</strong>
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; text-align: center;">Dit proces duurt meestal 2-5 minuten.</p>
        </div>
      </div>
    `;
    return await this.sendEmail(customerEmail, subject, htmlContent);
  }
  async sendCompletionNotification(customerEmail, customerName, awningType, processedImage, goalAchieved, score, priceData = null) {
    const subject = goalAchieved ? '✅ Uw Zonnescherm Visualisatie is Klaar!' : '⚠️ Uw Zonnescherm Visualisatie - Resultaat Beschikbaar';
    const priceSection = priceData ? `
      <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
        <h3 style="color: #2c3e50; margin-top: 0;">💰 Prijsindicatie</h3>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #555;">Basisprijs zonnescherm:</span>
          <span style="font-weight: bold;">€${priceData.basePrice.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #555;">Installatie (${priceData.floor}):</span>
          <span style="font-weight: bold;">€${priceData.installationCost.toFixed(2)}</span>
        </div>
        ${priceData.colorSurcharge > 0 ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #555;">Kleur toeslag:</span>
          <span style="font-weight: bold;">€${priceData.colorSurcharge.toFixed(2)}</span>
        </div>
        ` : ''}
        <hr style="border: none; border-top: 1px solid #ccc; margin: 15px 0;">
        <div style="display: flex; justify-content: space-between; font-size: 18px;">
          <span style="color: #2c3e50; font-weight: bold;">Totaalprijs (incl. BTW):</span>
          <span style="color: #e74c3c; font-weight: bold; font-size: 20px;">€${priceData.totalPrice.toFixed(2)}</span>
        </div>
      </div>
      
      <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
        <p style="color: #856404; margin: 0; font-size: 14px;">
          <strong>⚠️ Let op:</strong> Dit is een indicatieve prijs. De definitieve prijs kan afwijken na een persoonlijke meting en adviesgesprek.
        </p>
      </div>
    ` : '';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
        <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <h2 style="color: #2c3e50; margin-bottom: 20px;">Hallo ${customerName || 'daar'}!</h2>
          
          <p style="color: #555; line-height: 1.6;">Uw zonnescherm visualisatie is voltooid! Hieronder vindt u het resultaat${priceData ? ' inclusief prijsindicatie' : ''}:</p>
          
          <div style="text-align: center; margin: 20px 0;">
            <h3 style="color: #2c3e50;">🏠 Uw Zonnescherm Visualisatie</h3>
            <img src="cid:visualization" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" alt="Zonnescherm visualisatie">
            <p style="color: #666; font-size: 12px; margin-top: 10px;">Zo zou uw nieuwe ${awningType} zonnescherm er uit kunnen zien</p>
          </div>
          
          ${priceData ? `
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3498db;">
            <h3 style="color: #2c3e50; margin-top: 0;">📋 Specificaties</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li><strong>Type zonnescherm:</strong> ${priceData.awningType}</li>
              <li><strong>Afmetingen:</strong> ${priceData.width}cm breed × ${priceData.projection}cm uitval</li>
              <li><strong>Oppervlakte:</strong> ${priceData.area} m²</li>
              <li><strong>Verdieping:</strong> ${priceData.floor}</li>
              <li><strong>Kleur:</strong> ${priceData.fabricColor || 'Standaard'}</li>
            </ul>
          </div>
          ` : ''}
          
          ${priceSection}
          
          <div style="background: ${goalAchieved ? '#d4edda' : '#f8d7da'}; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${goalAchieved ? '#28a745' : '#dc3545'};">
            <p style="color: ${goalAchieved ? '#155724' : '#721c24'}; margin: 0;">
              <strong>${goalAchieved ? '✅' : '⚠️'} Kwaliteitsscore:</strong> ${score}/100
              ${goalAchieved ? ' - Uitstekend resultaat! Het zonnescherm is realistisch geplaatst.' : ' - Het resultaat kan worden verbeterd. Neem contact op voor een persoonlijk adviesgesprek.'}
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #555; margin-bottom: 15px;">Interesse in deze visualisatie${priceData ? ' en prijsindicatie' : ''}?</p>
            <a href="tel:+31123456789" style="background: #3498db; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px;">📞 Bel ons</a>
            <a href="mailto:info@voorbeeld.nl" style="background: #28a745; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 5px;">✉️ E-mail ons</a>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #888; font-size: 12px;">
            <p>Deze visualisatie${priceData ? ' en prijsindicatie' : ''} is 30 dagen geldig vanaf ${new Date().toLocaleDateString('nl-NL')}.</p>
            <p>Bedankt voor uw vertrouwen in onze dienstverlening!</p>
          </div>
        </div>
      </div>
    `;
    // Prepare attachments
    const attachments = [];
    if (processedImage) {
      // Extract base64 data from data URI
      const base64Match = processedImage.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
      const base64Data = base64Match ? base64Match[1] : processedImage;
      attachments.push({
        filename: 'zonnescherm_visualisatie.jpg',
        mimeType: 'image/jpeg',
        base64Data: base64Data,
        contentId: 'visualization'
      });
    }
    return await this.sendEmail(customerEmail, subject, htmlContent, attachments);
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
      'markiezen': 95
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
      'begane-grond': 'Begane grond',
      'eerste-verdieping': 'Eerste verdieping',
      'tweede-verdieping': 'Tweede verdieping',
      'derde-verdieping': 'Derde verdieping',
      'hoger': 'Hoger dan 3e verdieping'
    };
    return floorNames[floor] || floor;
  }
  getAwningDisplayName(awningType) {
    const awningNames = {
      'knikarm': 'Knikarm Zonnescherm',
      'knikarmscherm': 'Knikarm Zonnescherm',
      'uitvalarm': 'Uitvalarm Zonnescherm',
      'uitvalscherm': 'Uitvalarm Zonnescherm',
      'markiezen': 'Markiezen'
    };
    return awningNames[awningType] || awningType;
  }
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
    const { image_data, new_awning_type, new_fabric_color, pattern_type, stripe_ratio, color_swatch_image, customer_email, customer_name, send_notifications, width, projection, verdieping, include_price_indication = false } = body;
    console.log('Debug - Extracted request parameters:');
    console.log('- image_data:', !!image_data);
    console.log('- new_awning_type:', new_awning_type);
    console.log('- new_fabric_color:', new_fabric_color);
    console.log('- pattern_type:', pattern_type);
    console.log('- stripe_ratio:', stripe_ratio);
    console.log('- color_swatch_image:', !!color_swatch_image);
    console.log('- customer_email:', customer_email);
    console.log('- customer_name:', customer_name);
    console.log('- send_notifications:', send_notifications);
    console.log('- width:', width);
    console.log('- projection:', projection);
    console.log('- verdieping:', verdieping);
    console.log('- include_price_indication:', include_price_indication);
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
          error: 'Invalid dimensions. Width must be 100-800cm, projection must be 50-400cm'
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
    let startEmailSent = false;
    console.log('DEBUG: Checking start email conditions:');
    console.log('- send_notifications:', send_notifications);
    console.log('- customer_email:', customer_email);
    console.log('- gmailService:', !!gmailService);
    if (send_notifications && customer_email && gmailService) {
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
    // Function to parse data URI
    function parseDataUri(dataUri) {
      const [header, base64Data] = dataUri.split(',');
      const mimeMatch = header.match(/data:([^;]+)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
      return {
        mimeType,
        base64Data
      };
    }
    // Function to build placement prompt for different awning types with variation strategies
    function buildPlacementPrompt(awningType, variation, fabricColor, patternType, stripeRatio) {
      // Translate Dutch awning types to descriptive English terms with specific model characteristics
      const awningDescriptions = {
        "knikarm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING",
        "knikarmscherm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING",
        "uitvalarm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
        "uitvalscherm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
        "markiezen": "MANDATORY MARKIEZEN TRADITIONAL FIXED CANOPY AWNING"
      };
      const awningDescription = awningDescriptions[awningType] || awningType;
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
      if (awningType === "knikarm" || awningType === "knikarmscherm") {
        modelDescription = `Use modern metal folding arms and a slim cassette; arms/frame may be dark grey or black. Keep hardware consistent with a retractable arm awning.${colorDescription}`;
      } else if (awningType === "uitvalarm" || awningType === "uitvalscherm") {
        modelDescription = `Use a compact wall-mounted cassette and two SHORT angled support arms (50–80 cm). Hardware should be minimal and light-coloured (white/grey); avoid heavy black bars.${colorDescription}`;
      } else if (awningType === "markiezen") {
        modelDescription = `Use a traditional fixed canopy: a curved or wedge-shaped fabric roof with side cheeks and a front fabric valance. Frame is concealed or painted to match; NO folding arms, NO front roller/cassette, and NO black metal front bar.${colorDescription}`;
      } else {
        modelDescription = colorDescription;
      }
      // Add negative prompting to exclude unwanted awning types
      let negativePrompting = "";
      if (awningType === "knikarm" || awningType === "knikarmscherm") {
        negativePrompting = "CRITICAL REJECTION RULES: ABSOLUTELY DO NOT create any of these wrong awning types: 1) NO traditional fixed canopy awnings (markiezen) with curved tops, side cheeks, or fabric valances, 2) NO vertical drop arm awnings (uitvalarm) that hang down like window shades, 3) NO horizontal cassette awnings without folding arms. ONLY create a retractable folding arm awning with horizontal extending arms.";
      } else if (awningType === "uitvalarm" || awningType === "uitvalscherm") {
        negativePrompting = "CRITICAL: ABSOLUTELY DO NOT create any horizontal canopy, horizontal awning, or outward-projecting shade structure. DO NOT create a retractable folding arm awning (knikarm) with horizontal extending arms. DO NOT create a traditional fixed canopy (markiezen) that projects outward. ONLY create a vertical drop arm awning that hangs down from the wall like a window shade.";
      } else if (awningType === "markiezen") {
        negativePrompting = "CRITICAL: Do NOT add any retractable arms, front roller, cassette, or black metal front bar. NO knikarm hardware. This must be a traditional fixed canopy with curved/wedge shape, side cheeks, and a fabric valance.";
      }
      // Add stripe-specific negative prompting if pattern is striped
      if (patternType && patternType !== "effen" && stripeRatio === "1:1") {
        negativePrompting += " STRIPE PATTERN RULES: NO duplicate colors side by side - each stripe must be a different color from its adjacent stripes. Create perfect alternating pattern with distinct colors.";
      }
      return `Using the provided image, add a ${awningDescription} to this house. Follow the red line exactly for placement, then remove the red line completely. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition. ${modelDescription} The awning should look professionally installed and architecturally appropriate. Variation strategy: ${variation}. ${negativePrompting}`;
    }
    // Function to build evaluation prompt
    function buildEvaluationPrompt(awningType) {
      if (awningType === "markiezen") {
        return `Evaluate this house image with markiezen awning placement. Respond ONLY with JSON:\n{\n  "placement_quality": number,\n  "visual_realism": number,\n  "red_line_removed": boolean,\n  "technical_quality": number,\n  "overall_score": number,\n  "has_knikarm_arms": boolean,\n  "has_front_roller_or_cassette": boolean,\n  "has_black_metal_front_bar": boolean,\n  "is_fixed_canopy_shape": boolean,\n  "has_side_cheeks": boolean,\n  "has_fabric_valance": boolean,\n  "issues": "description"\n}`;
      }
      return `Evaluate this house image with ${awningType} awning placement. Rate 1-10 for: placement quality, visual realism, red line removal, technical quality. Return JSON: {"placement_quality": number, "visual_realism": number, "red_line_removed": boolean, "technical_quality": number, "overall_score": number, "issues": "description"}`;
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
      // Ensure non-negative score
      score = Math.max(0, score);
      return {
        score,
        issues
      };
    }
    // Function to generate placement version
    async function generatePlacementVersion(prompt, imageBase64, label, geminiApiKey) {
      const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
      const requestBody = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: imageBase64
                }
              },
              {
                text: prompt
              }
            ]
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
      const response = await fetch(`${GEMINI_IMAGE_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        throw new Error(`Generation API error: ${response.status}`);
      }
      const result = await response.json();
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
      return {
        base64Data,
        label
      };
    }
    // Function to evaluate placement
    async function evaluatePlacement(evaluationPrompt, imageBase64, geminiApiKey) {
      const GEMINI_TEXT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: evaluationPrompt
              },
              {
                inlineData: {
                  mimeType: "image/png",
                  data: imageBase64
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
    // Parse the input image
    const parsed = parseDataUri(image_data);
    const imageBase64 = parsed.base64Data;
    // Generate placement variations with early stopping and iterative improvement
    const evaluationPrompt = buildEvaluationPrompt(new_awning_type);
    console.log(`[DEBUG] Starting placement generation phase...`);
    const variations = [];
    const colorIterations = []; // Initialize colorIterations at proper scope
    const maxVariations = 5;
    const initialVariations = 2;
    const scoreThreshold = 75; // Score threshold to proceed to color editing
    let currentBaseImage = imageBase64; // Track the best image for iterative improvement
    let bestScore = 0;
    let bestVariationIndex = -1;
    // Phase 1: Generate initial 2 variations
    console.log(`[DEBUG] Phase 1: Generating initial ${initialVariations} variations...`);
    for(let i = 0; i < initialVariations; i++){
      try {
        console.log(`[DEBUG] Generating placement variation ${i + 1}/${initialVariations}...`);
        const variation = await generatePlacementVersion(buildPlacementPrompt(new_awning_type, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio), currentBaseImage, `Placement ${i + 1}`, GEMINI_API_KEY);
        if (variation.base64Data) {
          // Validate image dimensions
          const validation = await validateImageDimensions(imageBase64, variation.base64Data, `placement variation ${i + 1}`);
          if (!validation.valid && validation.correctedImage) {
            variation.base64Data = validation.correctedImage;
            console.log(`[DEBUG] Applied dimension correction to placement variation ${i + 1}`);
          }
          // Evaluate the placement
          const evalBase64Match = variation.base64Data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          const evalBase64Data = evalBase64Match ? evalBase64Match[1] : variation.base64Data;
          const evaluation = await evaluatePlacement(evaluationPrompt, evalBase64Data, GEMINI_API_KEY);
          const score = computePlacementScore(evaluation, new_awning_type);
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
          const basePrompt = buildPlacementPrompt(new_awning_type, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio);
          const iterativePrompt = `${basePrompt}\n\nIMPORTANT: This is an iterative improvement. The current image already has an awning, but it needs refinement. Focus on:\n- Improving the awning's positioning and proportions\n- Enhancing the structural realism and mounting details\n- Better integration with the building architecture\n- Correcting any placement or scaling issues from the previous iteration`;
          const variation = await generatePlacementVersion(iterativePrompt, currentBaseImage, `Placement ${i + 1} (Refined)`, GEMINI_API_KEY);
          if (variation.base64Data) {
            // Validate image dimensions
            const validation = await validateImageDimensions(imageBase64, variation.base64Data, `refined placement variation ${i + 1}`);
            if (!validation.valid && validation.correctedImage) {
              variation.base64Data = validation.correctedImage;
              console.log(`[DEBUG] Applied dimension correction to refined placement variation ${i + 1}`);
            }
            // Evaluate the placement
            const evalBase64Match = variation.base64Data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
            const evalBase64Data = evalBase64Match ? evalBase64Match[1] : variation.base64Data;
            const evaluation = await evaluatePlacement(evaluationPrompt, evalBase64Data, GEMINI_API_KEY);
            const score = computePlacementScore(evaluation, new_awning_type);
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
    const validVariations = variations.filter((v)=>v.base64 && v.evalScore > 0);
    if (validVariations.length === 0) {
      throw new Error("No valid placement variations generated");
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
              colorEditPrompt = hasColorSwatch ? `Color correction to match swatch: Apply the exact color from the reference swatch to the awning fabric only. Preserve all structural elements (frame, arms, cassette) and building features. ${swatchReference}` : `Color application: Apply ${new_fabric_color} to the awning fabric only. Preserve all structural elements (frame, arms, cassette) and building features. Create uniform, smooth fabric appearance.`;
            } else {
              if (finalStripeRatio === '1:1') {
                colorEditPrompt = hasColorSwatch ? `Pattern application to match swatch: Apply the exact pattern from the reference swatch to the awning fabric only. Ensure pattern consistency across all fabric panels. ${swatchReference}` : `Stripe application: Apply ${new_fabric_color} stripes to the awning fabric only. CRITICAL: Create EQUAL WIDTH STRIPES where each stripe is exactly the same width as adjacent stripes. Ensure alternating colors with NO DUPLICATE COLORS side by side. Each stripe must be distinct from its neighbors.`;
              } else {
                colorEditPrompt = hasColorSwatch ? `Pattern application to match swatch: Apply the exact pattern from the reference swatch to the awning fabric only. Ensure pattern consistency across all fabric panels. ${swatchReference}` : `Stripe application: Apply ${new_fabric_color} stripes with ${finalStripeRatio} ratio to the awning fabric only. Create consistent pattern across entire fabric surface, maintaining stripe proportions.`;
              }
            }
          } else {
            // Second iteration: refinement and correction
            const refinementPrompts = finalPatternType === 'solid' ? hasColorSwatch ? [
              `Pattern correction to match swatch: Ensure the pattern follows the reference swatch exactly, consistently across all fabric panels and seams.`,
              `Final swatch pattern application: Perfect the pattern to exactly match the reference swatch for complete visual consistency.`
            ] : [
              `Color refinement: Perfect the ${new_fabric_color} application, ensuring uniform coverage and smooth fabric texture throughout.`,
              `Final color correction: Achieve perfect ${new_fabric_color} uniformity across the entire awning fabric surface.`
            ] : hasColorSwatch ? [
              `Stripe alignment to match swatch: Apply the pattern shown in the reference swatch with proper spacing, ensuring pattern continuity across fabric joints.`,
              `Pattern optimization to match swatch: Ensure the pattern maintains the exact appearance of the reference swatch throughout the fabric.`
            ] : finalStripeRatio === '1:1' ? [
              `Pattern correction: Ensure ${new_fabric_color} stripes have EQUAL WIDTH - each stripe exactly the same width as adjacent stripes. NO DUPLICATE COLORS side by side. Perfect alternating pattern.`,
              `Final stripe optimization: Perfect the ${new_fabric_color} equal-width stripe pattern. Verify each stripe is identical in width and no two adjacent stripes share the same color.`
            ] : [
              `Pattern correction: Ensure ${new_fabric_color} stripes follow ${finalStripeRatio} ratio consistently across all fabric panels and seams.`,
              `Final stripe optimization: Perfect the ${new_fabric_color} stripe pattern for complete consistency and proper proportions.`
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
          // Evaluate the color-edited image
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
            imageData: editedColorImageData
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
            imageData: null
          });
          currentColorIteration++;
        }
      }
      // Use best color iteration if goal wasn't met
      if (!colorGoalMet && bestColorScore > 0) {
        console.log(`[DEBUG] Using best color iteration ${bestColorIteration} with score: ${bestColorScore}`);
        finalColorScore = bestColorScore;
        processedImage = bestColorImageData;
      }
      console.log(`[DEBUG] Color iteration phase complete. Final score: ${finalColorScore}, Goal met: ${colorGoalMet}`);
    } else {
      console.log(`[DEBUG] Skipping color iteration phase - no fabric color specified or placement score too low`);
      finalColorScore = bestScore; // Use placement score as final score
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
    console.log('DEBUG: Checking completion email conditions:');
    console.log('- send_notifications:', send_notifications);
    console.log('- customer_email:', customer_email);
    console.log('- gmailService:', !!gmailService);
    console.log('- processedImage:', !!processedImage);
    if (send_notifications && customer_email && gmailService && processedImage) {
      console.log('DEBUG: All conditions met, attempting to send completion email...');
      try {
        await gmailService.sendCompletionNotification(customer_email, customer_name, new_awning_type, processedImage, overallGoalAchieved, finalScore, priceData);
        completionEmailSent = true;
        console.log('Completion notification email sent successfully');
      } catch (error) {
        console.error('Failed to send completion notification email:', error);
        console.error('Error details:', error.message);
        console.error('Error stack:', error.stack);
      }
    } else {
      console.log('DEBUG: Completion email not sent - conditions not met');
    }
    // Prepare debug object
    const debugInfo = {
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
