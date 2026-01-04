import { decode, encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

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
    console.log('DEBUG: Full request body:', JSON.stringify(body).substring(0, 500) + '...');
    
    let { image_data, new_awning_type, new_fabric_color, stripe_ratio, color_swatch_image, new_awning_reference_image, customer_email, customer_name, send_notifications } = body;
    const recordId = body.record_id;
    let record = null;

    // Handle database-triggered payload
    if (recordId && body.image) {
      console.log(`DEBUG: Detected database trigger payload for record ${recordId}`);
      image_data = body.image;
      
      // Initialize Supabase client for fetching details
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Fetch record details
      const { data: fetchedRecord, error: fetchError } = await supabase
        .from('visualizations')
        .select('*')
        .eq('id', recordId)
        .single();
        
      if (fetchError) {
        console.error('DEBUG: Failed to fetch record:', fetchError);
      } else if (fetchedRecord) {
        record = fetchedRecord;
        console.log('DEBUG: Fetched record details:', JSON.stringify(record).substring(0, 200));
        // Check configuration first, then legacy fields/metadata
        const config = record.configuration || {};
        const meta = record.metadata || {};
        
        new_awning_type = config.model || config.awning_type || record.awning_type || record.type || meta.awning_type || meta.type;
        new_fabric_color = config.color || config.fabric_color || record.fabric_color || record.color || meta.fabric_color || meta.color;
        // stripe_ratio removed as per user request
        color_swatch_image = config.color_swatch_image || record.color_swatch_image || record.swatch_image || meta.color_swatch_image;
        // Try to find the model reference image in various possible locations
        new_awning_reference_image = config.model_image || config.new_awning_reference_image || record.new_awning_reference_image || meta.new_awning_reference_image || meta.model_image;
        
        customer_email = config.customer_email || record.customer_email || record.email || meta.customer_email;
        customer_name = config.customer_name || record.customer_name || record.name || meta.customer_name;
      }
    }

    console.log('Debug - Extracted request parameters:');
    console.log('- image_data (present):', !!image_data);
    console.log('- record_id:', recordId);
    console.log('- new_awning_type:', new_awning_type);
    console.log('- new_fabric_color:', new_fabric_color);
    // console.log('- stripe_ratio:', stripe_ratio); // Removed
    console.log('- color_swatch_image (present):', !!color_swatch_image);
    console.log('- new_awning_reference_image (present):', !!new_awning_reference_image);
    
    // Validate required parameters
    if (!image_data) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters: image_data'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }

    // Default awning type if missing (User feedback: "New awning type is the model image I assume?")
    if (!new_awning_type) {
        console.log('DEBUG: new_awning_type is undefined. Attempting to infer or default.');
        
        if (new_awning_reference_image) {
            console.log('DEBUG: Model reference image found. Using generic type to allow model-driven generation.');
            new_awning_type = 'custom awning matching the reference model';
        } else {
            console.log('DEBUG: Defaulting new_awning_type to "knikarmscherm"');
            new_awning_type = 'knikarmscherm';
        }
    }

    if (!new_fabric_color) {
         console.log('DEBUG: new_fabric_color is undefined. Defaulting to "grey".');
         new_fabric_color = 'grey';
    }
    // Initialize price calculator and calculate price if requested
    // Price logic removed

    // Send start notification email
    // Email logic removed
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
    function buildPlacementPrompt(awningType, variation, fabricColor, patternType, hasModelImage = false) {
      const awningDescriptions = {
        "knikarm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING WITH HORIZONTAL EXTENDING METAL ARMS",
        "knikarmscherm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING WITH HORIZONTAL EXTENDING METAL ARMS",
        "uitvalarm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
        "uitvalscherm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
        "markiezen": "MANDATORY MARKIEZEN TRADITIONAL FIXED CANOPY AWNING"
      };
      const awningDescription = awningDescriptions[awningType] || awningType;
      let colorDescription = "";
      if (fabricColor && fabricColor !== "default") {
        colorDescription = ` The fabric must be ${fabricColor}`;
        if (patternType && patternType !== "effen") {
          colorDescription += ` with ${patternType} pattern`;
        }
        colorDescription += ".";
      }
      let modelDescription = "";
      let imageReferenceInstruction = hasModelImage
        ? "The first image is the target house. The second image is an awning reference. Edit ONLY the first image. Do not generate a new house or background."
        : "Using the provided house image, edit it directly. Do not generate a new image or change any non-awning elements.";
      
      if (awningType === "knikarm" || awningType === "knikarmscherm") {
        modelDescription = `MANDATORY KNIKARM SPECIFICATIONS: Use modern metal folding arms that extend horizontally from a wall-mounted cassette. The arms must be clearly visible, articulated (with joints), and extend outward from the wall. Include a slim rectangular cassette mounted to the wall. Arms/frame may be dark grey or black. This is a retractable folding arm awning - NOT a fixed canopy or markiezen.${colorDescription}`;
      } else if (awningType === "uitvalarm" || awningType === "uitvalscherm") {
        modelDescription = `Use a compact wall-mounted cassette and two SHORT angled support arms (50–80 cm). Hardware should be minimal and light-coloured (white/grey); avoid heavy black bars.${colorDescription}`;
      } else if (awningType === "markiezen") {
        modelDescription = `Use a traditional fixed canopy: a curved or wedge-shaped fabric roof with side cheeks and a front fabric valance. Frame is concealed or painted to match; NO folding arms, NO front roller/cassette, and NO black metal front bar.${colorDescription}`;
      } else {
        if (hasModelImage) {
             imageReferenceInstruction = "The first image is the target house. The second image is an awning reference. Edit ONLY the first image. Do not generate a new house or background.";
             modelDescription = `MANDATORY: Add an awning to the house in the first image that looks EXACTLY like the awning in the second image (reference). Copy the style, shape, mechanics, and hardware details from the reference image exactly. Do NOT copy the background or house from the reference image.${colorDescription}`;
        } else {
             modelDescription = colorDescription;
        }
      }
      let negativePrompting = "";
      if (awningType === "knikarm" || awningType === "knikarmscherm") {
        negativePrompting = "CRITICAL REJECTION RULES: ABSOLUTELY DO NOT create any of these wrong awning types: 1) NO traditional fixed canopy awnings (markiezen) with curved tops, side cheeks, or fabric valances - this is NOT a knikarm, 2) NO vertical drop arm awnings (uitvalarm) that hang down like window shades, 3) NO horizontal cassette awnings without folding arms, 4) NO half-markiezen or semi-fixed canopies, 5) NO wedge-shaped or curved canopy structures. MANDATORY: ONLY create a retractable folding arm awning (knikarm) with horizontal extending metal arms that fold out from a wall-mounted cassette. The arms must be clearly visible and extend horizontally outward from the wall.";
      } else if (awningType === "uitvalarm" || awningType === "uitvalscherm") {
        negativePrompting = "CRITICAL: ABSOLUTELY DO NOT create any horizontal canopy, horizontal awning, or outward-projecting shade structure. DO NOT create a retractable folding arm awning (knikarm) with horizontal extending arms. DO NOT create a traditional fixed canopy (markiezen) that projects outward. ONLY create a vertical drop arm awning that hangs down from the wall like a window shade.";
      } else if (awningType === "markiezen") {
        negativePrompting = "CRITICAL: Do NOT add any retractable arms, front roller, cassette, or black metal front bar. NO knikarm hardware. This must be a traditional fixed canopy with curved/wedge shape, side cheeks, and a fabric valance.";
      }
      
      return `${imageReferenceInstruction}, add a ${awningDescription} to this house. Follow the red line exactly for placement, then remove the red line completely. Keep everything else in the image exactly the same, preserving the original style, lighting, and composition. ${modelDescription} The awning should look professionally installed and architecturally appropriate. Variation strategy: ${variation}. ${negativePrompting} CRITICAL: Edit ONLY the first image. Do not change the house, background, perspective, lighting, or any non-awning elements.`;
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
      score = Math.min(100, score);
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
    async function generatePlacementVersion(prompt, imageBase64, label, geminiApiKey, modelReferenceImage = null) {
      const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent";
      
      const parts = [
        {
          inlineData: {
            mimeType: "image/png",
            data: imageBase64
          }
        }
      ];

      if (modelReferenceImage) {
        const modelBase64Match = modelReferenceImage.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
        const modelBase64Data = modelBase64Match ? modelBase64Match[1] : modelReferenceImage;
        parts.push({
          inlineData: {
            mimeType: "image/png",
            data: modelBase64Data
          }
        });
      }

      parts.push({
        text: prompt
      });

      const requestBody = {
        contents: [
          {
            parts: parts
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topK: 16,
          topP: 0.8,
          maxOutputTokens: 4096,
          responseModalities: [
            "IMAGE"
          ]
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
    async function generatePlacementVersionLegacy(prompt, imageBase64, label, geminiApiKey, modelReferenceImage = null) {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
      const parts = [ { inlineData: { mimeType: "image/png", data: imageBase64 } } ];
      if (modelReferenceImage) {
        const m = modelReferenceImage.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
        const d = m ? m[1] : modelReferenceImage;
        parts.push({ inlineData: { mimeType: "image/png", data: d } });
      }
      parts.push({ text: prompt });
      const body = { contents: [ { parts } ], generationConfig: { temperature: 0.1, topK: 16, topP: 0.8, maxOutputTokens: 4096, responseModalities: ["IMAGE"] } };
      const response = await fetch(`${url}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`Legacy generation API error: ${response.status}`);
      const result = await response.json();
      let base64Data = null;
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
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
      return { base64Data, label };
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
    async function evaluatePreservation(originalImageBase64, generatedImageBase64, geminiApiKey) {
      const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
      const requestBody = {
        contents: [
          {
            parts: [
              { text: "Compare the two images. Respond ONLY with JSON: {\"same_building\": boolean, \"same_background\": boolean, \"overall_preserved\": boolean}" },
              { inlineData: { mimeType: "image/png", data: originalImageBase64 } },
              { inlineData: { mimeType: "image/png", data: generatedImageBase64 } }
            ]
          }
        ],
        generationConfig: { temperature: 0.1, topK: 16, topP: 0.8, maxOutputTokens: 1024 }
      };
      const response = await fetch(`${url}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
      if (!response.ok) return null;
      const result = await response.json();
      let parsed = null;
      if (result.candidates && result.candidates[0]) {
        const candidate = result.candidates[0];
        if (candidate.content && candidate.content.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              const m = part.text.match(/\{[\s\S]*\}/);
              if (m) {
                try { parsed = JSON.parse(m[0]); } catch {}
                break;
              }
            }
          }
        }
      }
      return parsed;
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
        // Pass new_awning_reference_image to generatePlacementVersion
        const variation = await generatePlacementVersion(buildPlacementPrompt(new_awning_type, String.fromCharCode(65 + i), new_fabric_color, null, !!new_awning_reference_image), currentBaseImage, `Placement ${i + 1}`, GEMINI_API_KEY, new_awning_reference_image);
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
          const preservation = await evaluatePreservation(imageBase64, evalBase64Data, GEMINI_API_KEY);
          const score = computePlacementScore(evaluation, new_awning_type);
          if (!preservation || preservation.overall_preserved !== true) {
            console.log(`[DEBUG] ✗ Variation ${i + 1} rejected - base image not preserved`);
            variations.push({
              label: variation.label,
              base64: variation.base64Data,
              evalParsed: evaluation,
              evalScore: 0,
              genError: "Base image not preserved",
              evalError: null
            });
            await new Promise((resolve)=>setTimeout(resolve, 1000));
            continue;
          }
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
          const basePrompt = buildPlacementPrompt(new_awning_type, String.fromCharCode(65 + i), new_fabric_color, null, !!new_awning_reference_image);
          const iterativePrompt = `${basePrompt}\n\nIMPORTANT: This is an iterative improvement. The current image already has an awning, but it needs refinement. Focus on:\n- Improving the awning's positioning and proportions\n- Enhancing the structural realism and mounting details\n- Better integration with the building architecture\n- Correcting any placement or scaling issues from the previous iteration`;
          // Pass new_awning_reference_image to generatePlacementVersion
          const variation = await generatePlacementVersion(iterativePrompt, currentBaseImage, `Placement ${i + 1} (Refined)`, GEMINI_API_KEY, new_awning_reference_image);
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
          const preservation = await evaluatePreservation(imageBase64, evalBase64Data, GEMINI_API_KEY);
          const score = computePlacementScore(evaluation, new_awning_type);
          if (!preservation || preservation.overall_preserved !== true) {
            console.log(`[DEBUG] ✗ Refined variation ${i + 1} rejected - base image not preserved`);
            variations.push({
              label: variation.label,
              base64: variation.base64Data,
              evalParsed: evaluation,
              evalScore: 0,
              genError: "Base image not preserved",
              evalError: null
            });
            await new Promise((resolve)=>setTimeout(resolve, 1000));
            continue;
          }
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
      console.log('[DEBUG] No valid placement variations; attempting legacy model fallback...');
      try {
        const legacyPrompt = buildPlacementPrompt(new_awning_type, 'Legacy', new_fabric_color, null, !!new_awning_reference_image);
        const legacyVar = await generatePlacementVersionLegacy(legacyPrompt, currentBaseImage, 'Placement (Legacy)', GEMINI_API_KEY, new_awning_reference_image);
        if (legacyVar && legacyVar.base64Data) {
          const val = await validateImageDimensions(imageBase64, legacyVar.base64Data, 'legacy placement');
          const legacyEvalMatch = legacyVar.base64Data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          const legacyEvalData = legacyEvalMatch ? legacyEvalMatch[1] : legacyVar.base64Data;
          const legacyEval = await evaluatePlacement(evaluationPrompt, legacyEvalData, GEMINI_API_KEY);
          const legacyPres = await evaluatePreservation(imageBase64, legacyEvalData, GEMINI_API_KEY);
          const legacyScore = legacyPres && legacyPres.overall_preserved === true ? computePlacementScore(legacyEval, new_awning_type) : 0;
          variations.push({ label: legacyVar.label, base64: legacyVar.base64Data, evalParsed: legacyEval, evalScore: legacyScore, genError: null, evalError: null });
        }
      } catch (e) {
        console.log('[DEBUG] Legacy fallback failed:', e.message);
      }
      const recheck = variations.filter((v)=>v.base64 && v.evalScore > 0);
      if (recheck.length === 0) {
        throw new Error("No valid placement variations generated");
      }
    }
    const best = validVariations.reduce((a, b)=>a.evalScore > b.evalScore ? a : b);
    bestScore = best.evalScore;
    console.log(`[DEBUG] Best placement score: ${bestScore} (${best.label})`);
    let processedImage = best.base64;
    let finalColorScore = 0;
    let colorGoalMet = false;
    
    // Determine pattern type globally for scope access in DB update
    const finalPatternType = (new_fabric_color && (new_fabric_color.toLowerCase().includes('stripe') || new_fabric_color.toLowerCase().includes('gestreept'))) ? 'striped' : 'solid';

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
      // Determine stripe ratio
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
                data: currentColorImageData.replace(/^data:image\/\w+;base64,/, "")
              }
            },
            {
              text: colorEditPrompt
            }
          ];
          
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
              temperature: 0.1,
              topK: 16,
              topP: 0.8,
              maxOutputTokens: 4096,
              responseModalities: [
                "IMAGE"
              ]
            }
          };
          const GEMINI_IMAGE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent";
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
          const { score: colorScore, issues: colorIssues } = calculateColorIterationScore(colorEvaluation, finalPatternType);
          // Debug output for color scoring
          console.log(`[DEBUG] Color iteration ${currentColorIteration} evaluation:`);
          console.log(`[DEBUG] - Score: ${colorScore}/100`);
          console.log(`[DEBUG] - Goal met: ${colorScore >= colorGoalThreshold}`);
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
          if (colorScore >= colorGoalThreshold) {
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
    console.log('DEBUG: Completion email notifications disabled');
    
    // Helper function to upload image to Supabase
    async function uploadImageToSupabase(supabase, imageDataBase64, bucketName = 'visualizations') {
      try {
        // Handle data URI prefix if present
        const base64Data = imageDataBase64.replace(/^data:image\/\w+;base64,/, "");
        const binaryStr = atob(base64Data);
        const len = binaryStr.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        
        const timestamp = new Date().getTime();
        const fileName = `visualization_${timestamp}_${Math.random().toString(36).substring(7)}.png`;
        
        // Upload to Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(fileName, bytes, {
            contentType: 'image/png',
            upsert: false
          });
          
        if (uploadError) {
          console.error(`Supabase storage upload error (bucket: ${bucketName}):`, uploadError);
          // Try 'generated-images' bucket if default fails
          if (bucketName !== 'generated-images') {
             console.log('Retrying with generated-images bucket...');
             return uploadImageToSupabase(supabase, imageDataBase64, 'generated-images');
          }
          return null;
        }
        
        // Get Public URL
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
          
        return {
            publicUrl: publicUrlData.publicUrl,
            fileName: fileName,
            fullPath: uploadData?.path || fileName
        };
      } catch (err) {
        console.error('Supabase upload helper failed:', err);
        return null;
      }
    }

    // Store result in Supabase
    let uploadResult = null;
    let originalUploadResult = null;
    
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        console.log('DEBUG: Attempting to store images in Supabase...');
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        // Upload Generated Image
        if (processedImage) {
            uploadResult = await uploadImageToSupabase(supabase, processedImage);
            if (uploadResult) {
                console.log('DEBUG: Generated image stored. URL:', uploadResult.publicUrl);
            }
        }

        // Upload Original Image
        if (image_data) {
            originalUploadResult = await uploadImageToSupabase(supabase, image_data);
            if (originalUploadResult) {
                console.log('DEBUG: Original image stored. URL:', originalUploadResult.publicUrl);
            }
        }
        
        // Insert or Update record into database
        if (uploadResult && uploadResult.publicUrl) {
            try {
                // Prepare configuration object with all metadata and extra fields
                const newConfiguration = {
                    // Core results
                    score: finalScore,
                    placement_score: bestScore,
                    color_score: finalColorScore,
                    goal_achieved: overallGoalAchieved,
                    pattern_type: finalPatternType,
                    stripe_ratio: stripe_ratio,
                    generated_at: new Date().toISOString(),
                    
                    // Input parameters
                    model: new_awning_type,
                    color: new_fabric_color,
                    customer_email: customer_email,
                    
                    // Image references (if needed in config for easy access)
                    generated_image_url: uploadResult.publicUrl,
                    original_image_url: originalUploadResult ? originalUploadResult.publicUrl : null
                };

                if (recordId) {
                    console.log(`DEBUG: Updating existing record ${recordId} with status completed...`);
                    
                    // Fetch existing configuration to merge
                    const { data: existingRecord } = await supabase
                        .from('visualizations')
                        .select('configuration')
                        .eq('id', recordId)
                        .single();
                        
                    const mergedConfiguration = {
                        ...(existingRecord?.configuration || {}),
                        ...newConfiguration
                    };

                    // Update existing record
                    const { error: updateError } = await supabase
                        .from('visualizations')
                        .update({
                            output_image_path: uploadResult.fileName,
                            status: 'completed',
                            configuration: mergedConfiguration,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', recordId);
                    
                    if (updateError) {
                        console.error('DEBUG: Update failed:', updateError);
                        throw updateError;
                    }
                    console.log(`DEBUG: Database record ${recordId} updated successfully`);
                } else {
                    // Validate required fields for insert
                    const inputPath = originalUploadResult ? originalUploadResult.fileName : `generated_input_${Date.now()}.png`;
                    
                    await supabase.from('visualizations').insert({
                        project_name: customer_name || 'API Generated Project',
                        status: 'completed',
                        input_image_path: inputPath,
                        output_image_path: uploadResult.fileName,
                        configuration: newConfiguration,
                        // updated_at is automatic or can be set
                    });
                    console.log('DEBUG: Database record inserted successfully');
                }
            } catch (dbError) {
                console.log('DEBUG: Database operation failed (non-critical):', dbError.message);
            }
        }
        
      } catch (err) {
        console.error('Supabase storage process failed:', err);
      }
    } else {
      console.log('DEBUG: Skipping Supabase storage - missing credentials');
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
        notificationsEnabled: false,
        message: "Email functionality removed"
      },
      priceCalculation: {
        included: false,
        reason: 'Price calculation functionality removed'
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
      price_data: null,
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
