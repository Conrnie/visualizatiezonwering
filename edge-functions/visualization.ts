import { decode, encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import * as Image from "https://deno.land/x/imagescript@1.2.15/mod.ts";
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
      email.push(`Content-Disposition: attachment; filename="${attachment.filename}"`);
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
  async sendStartNotification(customerEmail, customerName, awningType) {
    const subject = '🏠 Your Awning Visualization is Being Generated';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Hi ${customerName || 'there'}!</h2>
        <p>We've started generating your <strong>${awningType}</strong> visualization.</p>
        <p>Estimated completion time: 3-6 minutes. You'll receive another email once it's ready.</p>
      </div>
    `;
    return await this.sendEmail(customerEmail, subject, htmlContent);
  }
  async sendCompletionNotification(customerEmail, customerName, awningType, imageBase64, goalAchieved, bestScore) {
    const subject = '✅ Your Awning Visualization is Ready!';
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Hi ${customerName || 'there'}!</h2>
        <p>Your <strong>${awningType}</strong> visualization is ready! We've attached the high-quality image to this email.</p>
        <p>Quality Score: <strong>${bestScore}/100</strong></p>
      </div>
    `;
    const attachments = [
      {
        filename: 'awning-visualization.jpg',
        mimeType: 'image/jpeg',
        base64Data: imageBase64.replace(/^data:image\/[^;]+;base64,/, '')
      }
    ];
    return await this.sendEmail(customerEmail, subject, htmlContent, attachments);
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
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    // Supabase handles authentication automatically for edge functions
    console.log('Processing image generation request...');
    // Parse request body
    const body = await req.json();
    const { image_data, new_awning_type, new_fabric_color, pattern_type, stripe_ratio, color_swatch_image, customer_email, customer_name, send_notifications = false } = body;
    // Assign correct variable names for processing
    const image = image_data;
    const awning_type = new_awning_type;
    let colorIterations = []; // Initialize colorIterations here
    let bestColorIteration = 1; // Initialize bestColorIteration here
    // Get original dimensions from the full data URI
    const { width: originalWidth, height: originalHeight } = await getImageDimensions(image);
    console.log('Debug - Original image dimensions:', originalWidth, 'x', originalHeight);
    console.log('Debug - Request parameters:');
    console.log('awning_type:', awning_type);
    console.log('new_fabric_color:', new_fabric_color);
    console.log('pattern_type:', pattern_type);
    console.log('stripe_ratio:', stripe_ratio);
    console.log('color_swatch_image:', color_swatch_image ? 'provided' : 'not provided');
    console.log('send_notifications:', send_notifications);
    console.log('customer_email:', customer_email);
    if (!image) {
      return new Response(JSON.stringify({
        error: 'Missing image_data'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Send start notification email
    let startEmailSent = false;
    if (send_notifications && customer_email && gmailService) {
      try {
        await gmailService.sendStartNotification(customer_email, customer_name, awning_type);
        startEmailSent = true;
        console.log('Start notification email sent successfully');
      } catch (error) {
        console.error('Failed to send start notification email:', error);
      }
    }
    // Utility function to parse data URI
    function parseDataUri(dataUri) {
      const match = dataUri.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) {
        throw new Error("Invalid data URI format");
      }
      return {
        mimeType: match[1],
        base64Data: match[2]
      };
    }
    // Function to get image dimensions without resizing
    async function getImageDimensions(dataUri) {
      try {
        // Ensure dataUri is a valid data URI before decoding
        if (dataUri && typeof dataUri === 'string' && !dataUri.startsWith('data:image')) {
          dataUri = `data:image/jpeg;base64,${dataUri}`;
        }
        const { base64Data } = parseDataUri(dataUri);
        const imageBytes = decode(base64Data);
        const image = await Image.decode(imageBytes);
        return {
          width: image.width,
          height: image.height
        };
      } catch (error) {
        console.error(`[DIMENSION EXTRACTION] Error: ${error.message}`);
        throw error;
      }
    }
    // Function to validate and correct image dimensions
    async function validateImageDimensions(originalImageBase64, newImageBase64, contextLabel) {
      try {
        // First, check if newImageBase64 is a valid, non-empty string
        if (!newImageBase64 || typeof newImageBase64 !== 'string' || newImageBase64.trim() === '') {
          console.log(`[DIMENSION VALIDATION] Warning in ${contextLabel}: newImageBase64 is null, empty, or not a string. Skipping validation.`);
          return {
            valid: false,
            correctedImage: null
          };
        }
        const originalDimensions = await getImageDimensions(originalImageBase64);
        const newDimensions = await getImageDimensions(newImageBase64);
        if (originalDimensions.width === newDimensions.width && originalDimensions.height === newDimensions.height) {
          return {
            valid: true,
            correctedImage: null
          };
        }
        console.log(`[DIMENSION MISMATCH] ${contextLabel}: Expected ${originalDimensions.width}x${originalDimensions.height}, but got ${newDimensions.width}x${newDimensions.height}. Correcting...`);
        // The getImageDimensions function now handles the data URI prefixing
        const { base64Data } = parseDataUri(newImageBase64.startsWith('data:image') ? newImageBase64 : `data:image/jpeg;base64,${newImageBase64}`);
        const imageBytes = decode(base64Data);
        const image = await Image.decode(imageBytes);
        image.resize(originalDimensions.width, originalDimensions.height);
        const correctedImageBytes = await image.encode(95); // Use 95% quality instead of default
        const correctedBase64 = encode(correctedImageBytes);
        return {
          valid: false,
          correctedImage: `data:image/jpeg;base64,${correctedBase64}`
        };
      } catch (error) {
        console.error(`[DIMENSION VALIDATION] Error in ${contextLabel}: ${error.message}`);
        return {
          valid: false,
          correctedImage: null
        };
      }
    }
    // Function to build placement prompt for different awning types with variation strategies
    function buildPlacementPrompt(awningType, variation, fabricColor, patternType, stripeRatio) {
      // Translate Dutch awning types to descriptive English terms with specific model characteristics
      const awningDescriptions = {
        knikarm: "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING: This MUST be EXACTLY a knikarm-style retractable awning with these STRICT VISUAL REQUIREMENTS: 1) WALL-MOUNTED CASSETTE: A horizontal rectangular cassette/housing mounted on the wall above the window containing the fabric roller, 2) TWO ARTICULATED FOLDING ARMS: Exactly TWO visible jointed support arms that extend horizontally outward from the wall in a scissor/folding mechanism - these arms MUST have visible joints/hinges and extend straight out horizontally, 3) HORIZONTAL FABRIC EXTENSION: The fabric stretches horizontally between the two folding arms creating a flat canopy that projects outward from the building, 4) MODERN METAL CONSTRUCTION: Arms and cassette should be sleek metal (typically white, grey, or black), 5) RETRACTABLE MECHANISM: The arms must appear capable of folding back against the wall when retracted. CRITICAL: This is NOT a fixed canopy, NOT a drop-down shade, NOT a traditional awning with curved top - it must be specifically a modern retractable folding arm awning (knikarm) with horizontal extending articulated arms and a wall-mounted cassette.",
        knikarmscherm: "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING: This MUST be EXACTLY a knikarm-style retractable awning with these STRICT VISUAL REQUIREMENTS: 1) WALL-MOUNTED CASSETTE: A horizontal rectangular cassette/housing mounted on the wall above the window containing the fabric roller, 2) TWO ARTICULATED FOLDING ARMS: Exactly TWO visible jointed support arms that extend horizontally outward from the wall in a scissor/folding mechanism - these arms MUST have visible joints/hinges and extend straight out horizontally, 3) HORIZONTAL FABRIC EXTENSION: The fabric stretches horizontally between the two folding arms creating a flat canopy that projects outward from the building, 4) MODERN METAL CONSTRUCTION: Arms and cassette should be sleek metal (typically white, grey, or black), 5) RETRACTABLE MECHANISM: The arms must appear capable of folding back against the wall when retracted. CRITICAL: This is NOT a fixed canopy, NOT a drop-down shade, NOT a traditional awning with curved top - it must be specifically a modern retractable folding arm awning (knikarm) with horizontal extending articulated arms and a wall-mounted cassette.",
        uitvalarm: "VERTICAL DROP ARM AWNING (uitvalarm type): This must be a VERTICAL WINDOW SHADE STYLE awning that drops DOWN from above the window, similar to a large outdoor window blind. CRITICAL VISUAL CHARACTERISTICS: 1) VERTICAL FABRIC ORIENTATION - the fabric must hang DOWN vertically like a window shade or blind, NOT extend horizontally outward, 2) COMPACT WALL-MOUNTED CASSETTE - small horizontal housing mounted above the window containing the roller mechanism, 3) VERTICAL DROP MECHANISM - fabric unrolls downward to cover the window vertically, dropping approximately 1-2 meters down from the cassette, 4) SHORT ANGLED SUPPORT ARMS - two SHORT diagonal support arms (maximum 50-80cm length) extend from the bottom edge of the fabric at approximately 45-degree angles to hold the fabric away from the window. CRITICAL: These arms must be SHORT and should NOT extend down to the ground or anywhere near the ground level - they are just short supports to hold the fabric away from the window, 5) WINDOW COVERAGE - the fabric primarily covers the window area vertically, not projecting far outward like a traditional canopy. This is essentially a large VERTICAL WINDOW SHADE for outdoor use, NOT a horizontal projecting canopy. The fabric should drop DOWN to cover the window, not extend OUT to create shade above. Think 'vertical window blind with short support arms' not 'horizontal canopy'. The arms are SUPPORT STRUTS, not long extending poles.",
        uitvalscherm: "VERTICAL DROP ARM AWNING (uitvalarm type): This must be a VERTICAL WINDOW SHADE STYLE awning that drops DOWN from above the window, similar to a large outdoor window blind. CRITICAL VISUAL CHARACTERISTICS: 1) VERTICAL FABRIC ORIENTATION - the fabric must hang DOWN vertically like a window shade or blind, NOT extend horizontally outward, 2) COMPACT WALL-MOUNTED CASSETTE - small horizontal housing mounted above the window containing the roller mechanism, 3) VERTICAL DROP MECHANISM - fabric unrolls downward to cover the window vertically, dropping approximately 1-2 meters down from the cassette, 4) SHORT ANGLED SUPPORT ARMS - two SHORT diagonal support arms (maximum 50-80cm length) extend from the bottom edge of the fabric at approximately 45-degree angles to hold the fabric away from the window. CRITICAL: These arms must be SHORT and should NOT extend down to the ground or anywhere near the ground level - they are just short supports to hold the fabric away from the window, 5) WINDOW COVERAGE - the fabric primarily covers the window area vertically, not projecting far outward like a traditional canopy. This is essentially a large VERTICAL WINDOW SHADE for outdoor use, NOT a horizontal projecting canopy. The fabric should drop DOWN to cover the window, not extend OUT to create shade above. Think 'vertical window blind with short support arms' not 'horizontal canopy'. The arms are SUPPORT STRUTS, not long extending poles.",
        markiezen: "TRADITIONAL FIXED CANOPY AWNING (markiezen type): A fixed canopy with a rigid frame that projects slightly outward above the window/door. CRITICAL VISUAL CHARACTERISTICS: 1) Canopy SHAPE is curved or wedge-shaped (no flat horizontal top), 2) Fabric SIDE CHEEKS are present along the sides, 3) FRONT FABRIC VALANCE hangs at the leading edge (scalloped or straight), 4) Frame is concealed or painted to match (wood or light-coloured metal), 5) Not retractable. DO NOT add folding arms, front rollers, cassettes, or any BLACK METAL FRONT BAR typical of knikarm awnings."
      };
      // Define different variation strategies for better diversity
      const variationStrategies = {
        A: "conservative scaling, exact horizontal alignment, minimal vertical offset",
        B: "slightly larger scaling, subtle vertical offset correction, refine bracket spacing",
        C: "medium scaling, focus on perfect bracket alignment with window frames",
        D: "precise scaling to window width, emphasize natural draping",
        E: "balanced approach with moderate scaling, enhanced perspective matching"
      };
      const awningDescription = awningDescriptions[awningType] || `${awningType} awning`;
      // Build color and pattern description
      let colorDescription = "";
      if (fabricColor && fabricColor !== 'default') {
        if (patternType === 'striped' || patternType === 'gestreept') {
          const ratio = stripeRatio || '1:1';
          colorDescription = ` The awning fabric should have ${fabricColor} striped pattern with ${ratio} stripe ratio. Apply the stripes evenly across the fabric surface.`;
        } else {
          colorDescription = ` The awning fabric should be ${fabricColor} solid color. Apply uniform color across the entire fabric surface.`;
        }
      }
      // Combined model and color description (type-specific)
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
        negativePrompting = "CRITICAL REJECTION RULES: ABSOLUTELY DO NOT create any of these wrong awning types: 1) NO traditional fixed canopy awnings (markiezen) with curved tops, side cheeks, or fabric valances, 2) NO vertical drop arm awnings (uitvalarm) that hang down like window shades, 3) NO fixed awnings without retractable arms, 4) NO awnings with curved or wedge-shaped tops, 5) NO awnings with fabric side panels or valances, 6) NO simple canopies without visible folding arm mechanisms. MANDATORY REQUIREMENTS: This MUST be a modern retractable folding arm awning (knikarm) with: horizontal wall-mounted cassette + TWO visible articulated folding arms extending horizontally + flat fabric canopy stretched between arms. REJECT any design that doesn't have these exact features.";
      } else if (awningType === "uitvalarm" || awningType === "uitvalscherm") {
        negativePrompting = "CRITICAL: ABSOLUTELY DO NOT create any horizontal canopy, horizontal awning, or outward-projecting shade structure. DO NOT create a retractable folding arm awning (knikarm) with horizontal extending arms. DO NOT create a traditional fixed canopy (markiezen) that projects outward horizontally. DO NOT create long support arms that extend down to the ground or near ground level - the support arms must be SHORT (maximum 50-80cm). This must be a VERTICAL DROP ARM awning that hangs DOWN like a window shade, NOT a horizontal canopy that extends OUT. The fabric must drop vertically downward to cover the window, not extend horizontally outward to create overhead shade. The support arms are SHORT STRUTS to hold fabric away from window, NOT long poles extending downward. Reject any horizontal orientation completely and any long extending arms completely.";
      } else if (awningType === "markiezen") {
        negativePrompting = "CRITICAL: Do NOT add any retractable arms, front roller, cassette, or black metal front bar. NO knikarm hardware. This must be a traditional fixed canopy with curved/wedge shape, side cheeks, and a fabric valance.";
      }
      return `Using the provided image, add a ${awningDescription} to this house. Follow the red line exactly for placement, then remove the red line completely. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition. ${modelDescription} The awning should look realistic and professionally installed. ${negativePrompting} CRITICAL ASPECT RATIO REQUIREMENT: Do not change the input aspect ratio. You MUST preserve the exact same aspect ratio, width, height, and dimensions as the input image. Do NOT crop, resize, stretch, or change the image proportions in ANY way. The output image must have identical dimensions to the input. ${variation}: ${variationStrategies[variation] || variationStrategies.A}.`;
    }
    // Function to build evaluation prompt with type-specific criteria
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
    const parsed = parseDataUri(image);
    const imageBase64 = parsed.base64Data;
    // Generate placement variations with early stopping and iterative improvement
    const evaluationPrompt = buildEvaluationPrompt(awning_type);
    console.log(`[DEBUG] Starting placement generation phase...`);
    const variations = [];
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
        const variation = await generatePlacementVersion(buildPlacementPrompt(awning_type, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio), currentBaseImage, `Placement ${i + 1}`, GEMINI_API_KEY);
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
          const score = computePlacementScore(evaluation, awning_type);
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
          const basePrompt = buildPlacementPrompt(awning_type, String.fromCharCode(65 + i), new_fabric_color, pattern_type, stripe_ratio);
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
            const score = computePlacementScore(evaluation, awning_type);
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
      const colorIterations = [];
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
              colorEditPrompt = hasColorSwatch ? `Pattern application to match swatch: Apply the exact pattern from the reference swatch to the awning fabric only. Ensure pattern consistency across all fabric panels. ${swatchReference}` : `Stripe application: Apply ${new_fabric_color} stripes with ${finalStripeRatio} ratio to the awning fabric only. Create consistent pattern across entire fabric surface, maintaining stripe proportions.`;
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
          console.log(`[DEBUG] - Evaluation details:`, {
            is_uniform_base_color: colorEvaluation.is_uniform_base_color,
            matches_swatch_color: colorEvaluation.matches_swatch_color,
            fabric_only_edited: colorEvaluation.fabric_only_edited,
            awning_frame_preserved: colorEvaluation.awning_frame_preserved,
            awning_cassette_preserved: colorEvaluation.awning_cassette_preserved,
            awning_arms_preserved: colorEvaluation.awning_arms_preserved,
            building_walls_preserved: colorEvaluation.building_walls_preserved,
            windows_preserved: colorEvaluation.windows_preserved,
            doors_preserved: colorEvaluation.doors_preserved,
            roof_preserved: colorEvaluation.roof_preserved,
            brick_color_unchanged: colorEvaluation.brick_color_unchanged,
            fabric_texture_smooth: colorEvaluation.fabric_texture_smooth,
            pattern_type: finalPatternType,
            has_decorative_stripes: colorEvaluation.has_decorative_stripes,
            stripe_accuracy: colorEvaluation.stripe_accuracy
          });
          // Store color iteration data
          const colorIterationData = {
            iteration: currentColorIteration,
            score: colorScore,
            evaluation: colorEvaluation,
            issues: colorIssues,
            image_data: editedColorImageData,
            prompt_used: colorEditPrompt,
            goal_met: colorEvaluation.goal_met || colorScore >= colorGoalThreshold
          };
          colorIterations.push(colorIterationData);
          // Update best if this is better
          if (colorScore > bestColorScore) {
            bestColorScore = colorScore;
            bestColorIteration = currentColorIteration;
            bestColorImageData = editedColorImageData;
          }
          // Track if color goal is met
          if (colorEvaluation.goal_met || colorScore >= colorGoalThreshold) {
            colorGoalMet = true;
            console.log(`[DEBUG] Color goal achieved! Stopping early at iteration ${currentColorIteration}`);
            console.log(`[DEBUG] - Goal met: ${colorEvaluation.goal_met}, Score: ${colorScore}, Threshold: ${colorGoalThreshold}`);
            break; // Exit the color iteration loop early
          }
          // Prepare for next iteration
          currentColorImageData = editedColorImageData;
          colorBase64Data = colorEvalBase64Data;
          currentColorIteration++;
          // Small delay to prevent rate limiting
          await new Promise((resolve)=>setTimeout(resolve, 1000));
        } catch (colorIterationError) {
          console.log(`Error in color iteration ${currentColorIteration}:`, colorIterationError.message);
          currentColorIteration++;
          await new Promise((resolve)=>setTimeout(resolve, 2000));
        }
      }
      console.log(`[DEBUG] Color iteration complete. Best score: ${bestColorScore}`);
      // Use the best color result as the final processed image
      processedImage = bestColorImageData;
      finalColorScore = bestColorScore;
    }
    // Determine overall goal achievement
    const goalAchieved = bestScore >= 30 && (finalColorScore >= 75 || !new_fabric_color);
    // Send completion notification email
    let completionEmailSent = false;
    console.log('DEBUG: Checking completion email conditions:');
    console.log('- send_notifications:', send_notifications);
    console.log('- customer_email:', customer_email);
    console.log('- gmailService:', !!gmailService);
    if (send_notifications && customer_email && gmailService) {
      console.log('DEBUG: All conditions met, attempting to send completion email...');
      try {
        await gmailService.sendCompletionNotification(customer_email, customer_name, awning_type, processedImage, goalAchieved, bestScore);
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
    const debug = {
      bestLabel: best.label,
      bestEval: best.evalParsed,
      variations: variations.map((v)=>({
          label: v.label,
          score: v.evalScore ?? 0,
          genError: v.genError,
          evalError: v.evalError,
          hasImage: !!v.base64
        })),
      color_iterations: {
        enabled: !!(new_fabric_color && best.base64 && bestScore >= 30),
        total_iterations: colorIterations ? colorIterations.length : 0,
        final_color_score: finalColorScore,
        color_goal_met: colorGoalMet,
        best_color_iteration: bestColorIteration,
        iterations_summary: colorIterations ? colorIterations.map((iter)=>({
            iteration: iter.iteration,
            score: iter.score,
            goal_met: iter.goal_met,
            hasImage: !!iter.image_data
          })) : []
      },
      email_notifications: {
        enabled: send_notifications,
        customer_email: customer_email || null,
        start_sent: startEmailSent,
        completion_sent: completionEmailSent
      }
    };
    return new Response(JSON.stringify({
      goalAchieved,
      processedImage,
      bestScore,
      allIterations: variations.map((v)=>({
          label: v.label,
          hasImage: !!v.base64,
          score: v.evalScore ?? 0
        })),
      // Color iteration results
      color_iterations: colorIterations || [],
      final_color_score: finalColorScore,
      color_goal_met: colorGoalMet,
      best_color_iteration: bestColorIteration,
      debug
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
