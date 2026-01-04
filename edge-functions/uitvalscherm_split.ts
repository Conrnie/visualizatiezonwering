import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
const deno = (globalThis as any).Deno;
const GEMINI_API_KEY = deno?.env?.get?.('GEMINI_API_KEY') ?? '';

// Reference images - extensive set for teaching the model
const UITVALSCHERM_REFERENCES = {
  ref1: "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/reference_uitvalscherm_6%20(1).jpg",
  ref2: "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/Uitvalscherm_reference_1.webp",
  ref3: "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/UItvalscherm_reference_2.jpeg",
  ref4: "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/Uitvalscherm_reference_3.webp",
  ref5: "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/uitvalscherm_reference_4.jpg",
  ref6: "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/uitvalscherm_reference_5.jpg"
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, Authorization, x-client-info, X-Client-Info, apikey, ApiKey, content-type, Content-Type, cache-control, Cache-Control, pragma, Pragma, expires, Expires, x-edge-function-name, X-Edge-Function-Name, accept, Accept',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function parseDataUri(data: string) {
  const m = data.match(/^data:([^;]+);base64,(.+)$/i);
  if (m) return { mime: m[1], base64: m[2] };
  return { mime: 'image/png', base64: data };
}

function guessMimeFromPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

async function fetchUrlAsBase64Inline(url: string): Promise<{ inlineData: { mimeType: string; data: string } } | null> {
  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      console.error(`[ERROR] Failed to fetch URL ${url}: ${res.status} ${res.statusText}`);
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    const ab = await res.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let binary = '';
    const chunkSize = 32768;
    for (let i = 0; i < bytes.byteLength; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
    }
    const base64 = btoa(binary);
    let mime = contentType ? contentType.split(';')[0].trim().toLowerCase() : guessMimeFromPath(url);
    if (mime === 'image/jpg') mime = 'image/jpeg';
    if (!mime.startsWith('image/')) mime = guessMimeFromPath(url);
    return { inlineData: { mimeType: mime, data: base64 } };
  } catch (e) {
    console.error(`[ERROR] fetchUrlAsBase64Inline failed for ${url}:`, e);
    return null;
  }
}

async function callGeminiChat(model: string, contents: any[], imageConfig?: any, temperature: number = 0.1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body: any = {
    contents: contents,
    generationConfig: {
      temperature: temperature,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 4096,
      responseModalities: ["IMAGE"]
    }
  };

  if (imageConfig) {
    if (model === 'gemini-2.5-flash-image') {
      body.generationConfig.imageConfig = { aspectRatio: imageConfig.aspectRatio };
      delete body.generationConfig.responseModalities;
    } else {
      body.generationConfig.imageConfig = imageConfig;
    }
  }

  console.log(`[DEBUG] calling Gemini Chat with model ${model}, history length: ${contents.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000);

  try {
    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const txt = await res.text();
      console.error(`Gemini error ${res.status}: ${txt}`);
      throw new Error(`Gemini error: ${res.status} ${txt}`);
    }
    return await res.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Gemini request timed out after 55s`);
    }
    throw error;
  }
}

function extractImage(result: any) {
  if (result && Array.isArray(result.candidates)) {
    for (const c of result.candidates) {
      if (c && c.content && Array.isArray(c.content.parts)) {
        for (const p of c.content.parts) {
          const img = (p as any).inlineData || (p as any).inline_data;
          if (img && img.data) {
            let mime = img.mimeType || img.mime_type || 'image/png';
            if (mime === 'image/jpg') mime = 'image/jpeg';
            if (!mime.startsWith('image/')) mime = 'image/png';
            return `data:${mime};base64,${img.data}`;
          }
        }
      }
    }
  }
  return null;
}

// IMPROVED Quality Scoring - Actually checks for arm visibility against references
async function evaluateUitvalschermQuality(
  originalBase64: string, 
  generatedBase64: string,
  referenceImages: { inlineData: { mimeType: string; data: string } }[] = []
): Promise<{ 
  is_uitvalscherm: boolean; 
  diagonal_arms_visible: boolean;
  front_bar_type: "thin_tube" | "thick_rectangular" | "not_visible";
  slope_angle_estimate: number;
  wall_brackets_visible: boolean;
  recommendation: "accept" | "retry" | "reject";
  issues: string[];
}> {
  const model = 'gemini-2.5-flash-image'; // Use vision model for evaluation
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const promptText = `Analyze the "GENERATED IMAGE" and compare it to the "REFERENCE EXAMPLES" of an uitvalscherm.
  
STRICT CHECKLIST - The generated awning MUST match the style of the references:

1. DIAGONAL ARMS: Does it have TWO straight diagonal metal arms connecting the wall (top) to the front bar (bottom), like in the references? (Crucial!)
2. WALL ATTACHMENT: Do the arms clearly attach to the wall with brackets? (They must not float!)
3. FABRIC SLOPE: Is the slope steep (approx 50-70 degrees) like the references? (If it's flat/horizontal, it's WRONG - that's a knikarm).
4. FRONT BAR: Is the front bar a THIN tube/profile like the references? (If it's thick/scalloped, it's WRONG).

Compare strictly. If it looks like a flat terrace awning (knikarm), REJECT it.

Respond with JSON only:
{
  "is_uitvalscherm": boolean,
  "diagonal_arms_visible": boolean,
  "arms_count_visible": number,
  "front_bar_type": "thin_tube" | "thick_rectangular" | "not_visible",
  "slope_angle_estimate": number,
  "wall_brackets_visible": boolean,
  "house_preserved": boolean,
  "red_line_covered": boolean,
  "confidence": number,
  "issues": ["list of problems found"],
  "recommendation": "accept" | "retry" | "reject"
}`;

  // Build parts with references
  const parts: any[] = [{ text: promptText }];
  
  // Add references labeled - LIMIT TO 1 (Master Reference) to avoid 400 errors
  if (referenceImages.length > 0) {
    parts.push({ text: "\nREFERENCE EXAMPLE (Correct Uitvalscherm Style):" });
    parts.push(referenceImages[0]); 
  }

  parts.push({ text: "\nORIGINAL IMAGE (For context):" });
  parts.push({ inlineData: { mimeType: 'image/png', data: originalBase64 } });
  
  parts.push({ text: "\nGENERATED IMAGE (Analyze this):" });
  parts.push({ inlineData: { mimeType: 'image/png', data: generatedBase64 } });

  const body = {
    contents: [{ parts: parts }],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 2048,
      responseMimeType: "application/json"
    }
  };

  try {
    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      console.error(`[WARN] Quality check failed: ${res.status}`);
      return { 
        is_uitvalscherm: false, 
        diagonal_arms_visible: false,
        front_bar_type: "not_visible",
        slope_angle_estimate: 0,
        wall_brackets_visible: false,
        recommendation: "retry", 
        issues: ["Quality check API failed"] 
      };
    }

    const j = await res.json();
    let parsed: any = { is_uitvalscherm: false, recommendation: "retry", issues: ["Could not parse"] };

    if (j.candidates && j.candidates[0]) {
      const c = j.candidates[0];
      if (c.content && c.content.parts) {
        const allText = c.content.parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join('\n');
        if (allText) {
          const clean = allText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          const m = clean.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = JSON.parse(m[0]);
            } catch (e) {
              console.error(`[ERROR] JSON parse failed:`, e);
            }
          }
        }
      }
    }
    
    console.log(`[INFO] Quality check result:`, JSON.stringify(parsed));
    return parsed;
  } catch (e) {
    console.error(`[ERROR] Quality check error:`, e);
    return { 
      is_uitvalscherm: false, 
      diagonal_arms_visible: false,
      front_bar_type: "not_visible",
      slope_angle_estimate: 0,
      wall_brackets_visible: false,
      recommendation: "retry", 
      issues: [(e as Error).message] 
    };
  }
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getImageDimensionsFromBase64(base64: string) {
  try {
    const bytes = base64ToBytes(base64);
    const img = await Image.decode(bytes);
    return { width: img.width, height: img.height };
  } catch (e) {
    console.error("Error decoding image dimensions:", e);
    return { width: 0, height: 0 };
  }
}

async function detectRedLineAnchorsPixel(baseImageBase64: string) {
  try {
    const img = await Image.decode(base64ToBytes(baseImageBase64));
    let best = { y: -1, minX: 0, maxX: 0, width: 0, count: 0 };
    for (let y = 0; y < img.height; y++) {
      let minX = img.width, maxX = -1, count = 0;
      for (let x = 0; x < img.width; x++) {
        const color = img.getPixelAt(x, y);
        const r = (color >> 24) & 0xFF;
        const g = (color >> 16) & 0xFF;
        const b = (color >> 8) & 0xFF;

        if (r >= 200 && g < 80 && b < 80 && (r - Math.max(g, b) > 100)) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
      if (count > 0 && maxX >= 0) {
        const width = maxX - minX;
        if (width > best.width || (width === best.width && count > best.count)) {
          best = { y, minX, maxX, width, count };
        }
      }
    }
    if (best.y < 0 || best.width < 20) return null;
    return { x_left: best.minX, x_right: best.maxX, y: best.y, width_px: best.width };
  } catch (_) {
    return null;
  }
}

async function getRedLineBoundingBox(base64: string, imgHeight: number) {
  try {
    const anchors = await detectRedLineAnchorsPixel(base64);
    if (!anchors) return null;
    
    // Uitvalscherm: needs space below for steep drop + arms going to wall
    const marginX = Math.round(anchors.width_px * 0.25);
    const x = Math.max(0, anchors.x_left - marginX);
    const w = Math.min(10000, (anchors.x_right + marginX) - x); 
    
    // Height: uitvalscherm drops steeply, needs ~1.3x width for full coverage
    const h = Math.round(anchors.width_px * 1.3); 
    const y = Math.max(0, anchors.y - 30); // Small margin above cassette

    return { x, y, w, h };
  } catch (e) {
    return null;
  }
}

async function cropImageToBase64(base64: string, box: { x: number, y: number, w: number, h: number }) {
  try {
    const img = await Image.decode(base64ToBytes(base64));
    const crop = img.crop(box.x, box.y, box.w, box.h);
    const bytes = await crop.encode();
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 32768;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Crop failed:", e);
    return base64;
  }
}

async function forceResizeToMatch(base64Str: string, targetW: number, targetH: number) {
  try {
    const img = await Image.decode(base64ToBytes(base64Str));
    if (img.width === targetW && img.height === targetH) return base64Str;
    
    const resized = img.resize(targetW, targetH);
    const bytes = await resized.encode();
    
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 32768;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
    }
    return btoa(binary);
  } catch (e) {
    console.error("forceResizeToMatch failed:", e);
    return base64Str;
  }
}

// IMPROVED: Color application with strict preservation
async function applyFabricColor(baseBase64: string, swatchBase64: string, aspectRatio: string, frameColor: string = 'white') {
  const model = 'gemini-2.5-flash-image';
  const frameColorUpper = frameColor.toUpperCase();

  const prompt = `TASK: Change ONLY the fabric color of the awning.

INPUT:
- Image 1: House with uitvalscherm (drop-arm awning) installed
- Image 2: Color/pattern swatch to apply

RULES:
1. ONLY change the FABRIC pixels to match Image 2
2. Keep the DROP ARMS exactly as they are (${frameColorUpper} metal)
3. Keep the CASSETTE exactly as it is (${frameColorUpper})
4. Keep the FRONT BAR exactly as it is (${frameColorUpper})
5. Keep the WALL BRACKETS exactly as they are
6. Do NOT change any house/background pixels

COLOR APPLICATION:
- If swatch is striped → make fabric striped with SAME colors and widths
- If swatch is solid → make fabric solid
- Stripes run PARALLEL to the slope (wall to front bar direction)
- Preserve fabric shadows and highlights for realism

PIXEL-PERFECT REQUIREMENT:
- The house, windows, wall texture must be IDENTICAL to Image 1
- Only awning fabric pixels change
- This is an IN-PAINTING task, not regeneration`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  const body: any = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: baseBase64 } },
        { inlineData: { mimeType: 'image/png', data: swatchBase64 } }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      imageConfig: { aspectRatio: aspectRatio }
    }
  };

  try {
    console.log(`[INFO] Applying fabric color...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const txt = await res.text();
      console.error(`Color application failed:`, txt);
      return null;
    }

    const json = await res.json();
    const data = extractImage(json);
    if (data) {
      const m = data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
      return m ? m[1] : null;
    }
    return null;
  } catch (e: any) {
    console.error(`Error applying color:`, e);
    return null;
  }
}

// Build the IMPROVED prompt - PURE EDITING approach
// Key insight: For editing, we need to clearly separate the INPUT to edit from style guidance
function buildUitvalschermPrompt(hasColorSwatch: boolean, frameColor: string, hasFrontendRef: boolean): string {
  const colorInstruction = hasColorSwatch 
    ? "Apply the fabric color/pattern from the COLOR SWATCH to the awning fabric"
    : "Use gray and white striped fabric";

  // CRITICAL: For image editing, the prompt must be EDIT-focused, not GENERATE-focused
  return `EDIT THIS IMAGE: Add a drop-arm awning (uitvalscherm) to this house.

CRITICAL INSTRUCTION: You are EDITING the provided image. 
- The output must be the SAME house, SAME background, SAME environment
- ONLY add the awning - do NOT change anything else about the image
- Preserve the exact wall color, window frames, surroundings, lighting

AWNING SPECIFICATIONS (Uitvalscherm / Drop-arm awning):
1. POSITION: Mount directly over/covering the red line marked on the image
2. ARMS: Two DIAGONAL support arms visible on left and right sides
   - Straight metal bars from wall bracket down to front bar
   - Color: ${frameColor.toUpperCase()}
3. FABRIC: Steep slope (50-70 degrees from horizontal)
   - ${colorInstruction}
   - Stretched taut between cassette and front bar
4. CASSETTE: Compact box housing at top (covers red line)
5. FRONT BAR: THIN tube at bottom edge - NOT thick

PRESERVE EXACTLY:
- Wall texture and color (do not change!)
- Window frames and glass
- All surroundings (grass, plants, other buildings)
- Lighting and shadows
- Image composition

OUTPUT: The same image with ONLY the awning added.`;
}

// Main generation loop with retry logic
// MULTI-TURN APPROACH: First teach what uitvalscherm looks like, then request edit
// This separates "learning the style" from "editing the target image"
async function generateUitvalscherm(
  baseBase64: string, 
  referenceImages: { inlineData: { mimeType: string; data: string } }[],
  colorSwatchBase64: string | null,
  imageConfig: any,
  maxAttempts: number = 2,
  _hasFrontendRef: boolean = false
): Promise<{ success: boolean; edited_image?: string; quality?: any; attempts: number; model: string }> {
  
  const models = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
  const frameColor = 'white';
  const hasColorSwatch = !!colorSwatchBase64;
  
  // MULTI-TURN CONVERSATION APPROACH
  // Turn 1: Teach the model what uitvalscherm looks like using references
  // Turn 2: Request the edit on the target image
  
  // Build Turn 1: Reference teaching
  const teachingParts: any[] = [
    { text: `LEARN what an UITVALSCHERM (drop-arm awning) looks like.

🔥🔥 CRITICAL STYLE INSTRUCTION 🔥🔥
REFERENCE 1 is the **MASTER HARDWARE REFERENCE**.
- You MUST copy the ARMS, JOINTS, and CASSETTE style from Reference 1 EXACTLY.
- Do NOT use the hardware style from the other references.
- References 2-7 are for **GEOMETRY ONLY** (to show how arms connect to the wall).

SPECIFIC HARDWARE FEATURES TO COPY FROM REFERENCE 1:
1. ARMS: Look at the color, thickness, and joints of the arms in Reference 1.
2. FRONT BAR: Look at the shape/profile of the front bar in Reference 1.

GEOMETRY RULES (Learn this from ALL references):
1. DIAGONAL DROP ARMS:
   - Arms are LONG rigid bars (approx 50-80% of the drop height).
   - They go from a Wall Bracket (LOWER on the wall) UP/OUT to the Front Bar.
   - They do NOT look like small folding elbows at the top.
   - Form a large TRIANGLE side profile.

2. PLACEMENT:
   - Wall brackets positions: MOUNTED LOW (e.g. at middle of window height).
   - NOT directly under the cassette. There must be a vertical gap between cassette and wall bracket.
   - Arms attach to the WALL BRICKS, never the window.

Here are the reference images:` }
  ];
  
  // Add all reference images for teaching
  // Reference 1 is the Frontend Reference (User's Model) - It comes first
  for (let i = 0; i < referenceImages.length; i++) {
    const label = i === 0 ? " [MASTER HARDWARE REFERENCE]" : " [GEOMETRY EXAMPLE ONLY]";
    teachingParts.push({ text: `\n[Reference ${i + 1}${label}]:` });
    teachingParts.push(referenceImages[i]);
  }
  
  teachingParts.push({ text: `\n\nREMEMBER: Copy the ARMS from Reference 1. Place them LOW on the wall like a proper drop-arm awning.` });

  // Build Turn 2: Edit request
  const colorInstruction = hasColorSwatch 
    ? "Apply the color/pattern from the SWATCH image to the fabric"
    : "Use gray and white striped fabric";

  const editParts: any[] = [
    { text: `NOW EDIT THIS IMAGE: Add a STEEP drop-arm awning (uitvalscherm) to this house.

👀 LOOK AT THE STYLE REFERENCE IMAGE BELOW AGAIN.
- COPY THE EXACT ARM STYLE: Long, straight, diagonal bars.
- COPY THE EXACT ANGLE: Steep drop (look at the side view).
- COPY THE FRONT BAR: Straight tube.

⛔️ NEGATIVE CONSTRAINTS (DO NOT DO THIS):
- NO SCALLOPED/WAVY FABRIC EDGES (Must be straight/taut).
- NO FLAT/HORIZONTAL ANGLE (Must be steep).
- NO FOLDING ELBOW ARMS (Must be straight diagonal bars).
- NO THICK CASSETTE.

GEOMETRY INSTRUCTIONS:
1. DRAW TWO LONG DIAGONAL ARMS:
   - From the wall (LOW down, middle of window height).
   - To the front bar (OUT and UP).
   - They form a LARGE VISIBLE TRIANGLE on the sides.
2. FABRIC:
   - Stretched tight.
   - Angled down steeply.

INPUT IMAGE TO EDIT:` },
    { inlineData: { mimeType: 'image/png', data: baseBase64 } },
    { text: "\n\nSTYLE REFERENCE (COPY THIS EXACTLY):" }
  ];
  
  // Add Reference 1 again to the edit turn
  if (referenceImages.length > 0) {
    editParts.push(referenceImages[0]);
  }
  
  // Add color swatch if provided
  if (colorSwatchBase64) {
    editParts.push({ text: "\n\nCOLOR SWATCH - Apply this exact color/pattern to the awning fabric:" });
    editParts.push({ inlineData: { mimeType: 'image/png', data: colorSwatchBase64 } });
  }
  
  editParts.push({ text: "\n\nGenerate the edited image now. The output must show THIS SAME HOUSE with an uitvalscherm added - including visible diagonal arms on both sides!" });

  // Build multi-turn conversation
  const conversationHistory = [
    { role: "user", parts: teachingParts },
    { role: "model", parts: [{ text: "I understand. An uitvalscherm (drop-arm awning) has two DIAGONAL support arms visible on the outside of the fabric, one on each side. The arms go from wall brackets at the top diagonally down to a thin front bar. The fabric has a steep slope. I will add this type of awning to your image while preserving the original house and environment." }] },
    { role: "user", parts: editParts }
  ];
  
  // Clone for the loop so we can append feedback without affecting the original if we needed to reset (though here we just continue)
  const currentConversationHistory = [...conversationHistory];
  
  let bestResult: { success: boolean; edited_image?: string; quality?: any; attempts: number; model: string } = {
    success: false,
    attempts: 0,
    model: 'none'
  };
  
  // Main generation loop with Self-Correction
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    for (const model of models) {
      console.log(`[INFO] Attempt ${attempt + 1}, Model: ${model} (multi-turn with ${referenceImages.length} references)`);
      bestResult.attempts++;
      
      try {
        const result = await callGeminiChat(model, currentConversationHistory, imageConfig, 0.2);
        const edited = extractImage(result);
        
        if (!edited) {
          console.log(`[WARN] No image generated by ${model}`);
          continue;
        }
        
        const generatedBase64 = edited.split(',')[1];
        
        // Run quality check - CRITICAL STEP - Pass references for strict comparison
        const quality = await evaluateUitvalschermQuality(baseBase64, generatedBase64, referenceImages);
        
        console.log(`[INFO] Quality check: is_uitvalscherm=${quality.is_uitvalscherm}, arms_visible=${quality.diagonal_arms_visible}, recommendation=${quality.recommendation}`);
        
        // Accept if it's a proper uitvalscherm
        if (quality.is_uitvalscherm && quality.diagonal_arms_visible && quality.recommendation === 'accept') {
          console.log(`[SUCCESS] Generated proper uitvalscherm on attempt ${attempt + 1}`);
          return {
            success: true,
            edited_image: edited,
            quality: quality,
            attempts: bestResult.attempts,
            model: model
          };
        }
        
        // Store as best result so far
        if (!bestResult.edited_image || (quality.is_uitvalscherm && !bestResult.quality?.is_uitvalscherm)) {
          bestResult = {
            success: true,
            edited_image: edited,
            quality: quality,
            attempts: bestResult.attempts,
            model: model
          };
        }
        
        // SELF-CORRECTION: If quality check failed, add specific instructions for the next attempt
        // This is the "Feedback Loop" requested
        if (attempt < maxAttempts - 1) {
          console.log(`[INFO] Quality check failed. Adding feedback for next attempt...`);
          
          let feedback = "The previous attempt had issues. Please FIX them in this next version:\n";
          if (!quality.diagonal_arms_visible) feedback += "- ERROR: Diagonal drop arms were missing or not clearly visible. You MUST draw two diagonal metal arms, one on each side, connecting wall to front bar.\n";
          if (quality.front_bar_type === 'thick_rectangular') feedback += "- ERROR: Front bar was too thick. Make it a THIN round tube.\n";
          if (!quality.wall_brackets_visible) feedback += "- ERROR: Arms appeared floating. Attach them clearly to wall brackets at the top.\n";
          if (quality.issues && quality.issues.length > 0) feedback += `- Additional issues: ${quality.issues.join(', ')}\n`;
          
          feedback += "\nGENERATE AGAIN, correcting these specific mistakes. Ensure arms are visible and attached correctly!";
          
          // Add the model's failed attempt (optional, might be too heavy) or just the feedback text
          // We'll add the feedback as a new user message to the conversation history
          currentConversationHistory.push({ 
            role: "user", 
            parts: [{ text: feedback }] 
          });
        }
        
      } catch (e) {
        console.error(`[ERROR] Model ${model} failed:`, e);
      }
    }
  }
  
  // Return best result we got (even if not perfect)
  console.log(`[WARN] Returning best available result after ${bestResult.attempts} attempts`);
  return bestResult;
}

deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const globalStartMs = Date.now();

  try {
    const body = await req.json();
    const base_image = body.base_image || body.image_data;
    const reference_image = body.reference_image || body.new_awning_reference_image || body.awning_reference_image;
    const color_swatch = body.color_swatch || body.color_swatch_image;
    const frame_color = body.frame_color || 'white';

    if (!base_image) {
      throw new Error("Missing base_image");
    }

    const base = parseDataUri(base_image);
    const colorSwatch = color_swatch ? parseDataUri(color_swatch) : null;
    
    // IMPORTANT: Parse the reference image from frontend (the 3D model render)
    const frontendRef = reference_image ? parseDataUri(reference_image) : null;

    const origDims = await getImageDimensionsFromBase64(base.base64);
    console.log(`[INFO] Original image: ${origDims.width}x${origDims.height}`);

    // Build teaching references array - include ALL good examples
    const validRefs: { inlineData: { mimeType: string; data: string } }[] = [];
    
    // 1. Add user-selected reference (usually the clean 3D render)
    if (frontendRef) {
      console.log(`[INFO] Using frontend-provided reference image`);
      validRefs.push({ inlineData: { mimeType: frontendRef.mime, data: frontendRef.base64 } });
    }
    
    // 2. Add our carefully selected teaching references
    console.log(`[INFO] Fetching all teaching references...`);
    
    // Fetch ALL references defined in the constant
    for (const [key, url] of Object.entries(UITVALSCHERM_REFERENCES)) {
      try {
        const ref = await fetchUrlAsBase64Inline(url);
        if (ref) {
          validRefs.push(ref);
          console.log(`[INFO] Added reference: ${key}`);
        }
      } catch (e) {
        console.error(`[WARN] Failed to load reference ${key}:`, e);
      }
    }
    
    console.log(`[INFO] Total references for teaching: ${validRefs.length}`);

    // Detect red line and potentially crop
    let cropBox: { x: number; y: number; w: number; h: number } | null = null;
    let baseForGeneration = base.base64;
    
    const anchors = await detectRedLineAnchorsPixel(base.base64);
    if (anchors) {
      console.log(`[INFO] Red line detected at y=${anchors.y}, width=${anchors.width_px}px`);
      cropBox = await getRedLineBoundingBox(base.base64, origDims.height);
      
      if (cropBox) {
        // Adjust crop to supported aspect ratio
        const supportedARs = [
          { str: "1:1", val: 1 },
          { str: "4:3", val: 4/3 },
          { str: "3:4", val: 3/4 },
          { str: "16:9", val: 16/9 },
          { str: "9:16", val: 9/16 }
        ];
        
        const currentAR = cropBox.w / cropBox.h;
        let bestAR = supportedARs[0];
        let minDiff = Infinity;
        
        for (const ar of supportedARs) {
          const diff = Math.abs(currentAR - ar.val);
          if (diff < minDiff) {
            minDiff = diff;
            bestAR = ar;
          }
        }
        
        // Adjust dimensions to match AR
        let targetW = cropBox.w;
        let targetH = cropBox.h;
        if (currentAR > bestAR.val) {
          targetH = Math.round(targetW / bestAR.val);
        } else {
          targetW = Math.round(targetH * bestAR.val);
        }
        
        // Center the adjusted crop
        let newX = cropBox.x - Math.floor((targetW - cropBox.w) / 2);
        let newY = cropBox.y - Math.floor((targetH - cropBox.h) / 2);
        
        // Clamp to image bounds
        newX = Math.max(0, Math.min(newX, origDims.width - targetW));
        newY = Math.max(0, Math.min(newY, origDims.height - targetH));
        const finalW = Math.min(targetW, origDims.width - newX);
        const finalH = Math.min(targetH, origDims.height - newY);
        
        cropBox = { x: newX, y: newY, w: finalW, h: finalH };
        baseForGeneration = await cropImageToBase64(base.base64, cropBox);
        
        console.log(`[INFO] Cropped to ${cropBox.w}x${cropBox.h} at (${cropBox.x}, ${cropBox.y}), AR: ${bestAR.str}`);
      }
    } else {
      console.log(`[WARN] No red line detected, using full image`);
    }

    // Determine aspect ratio for generation
    const genDims = await getImageDimensionsFromBase64(baseForGeneration);
    const genAR = genDims.width / genDims.height;
    const supportedARs = [
      { str: "1:1", val: 1 },
      { str: "4:3", val: 4/3 },
      { str: "3:4", val: 3/4 },
      { str: "16:9", val: 16/9 },
      { str: "9:16", val: 9/16 }
    ];
    let closestAR = "1:1";
    let minDiff = Infinity;
    for (const ar of supportedARs) {
      const diff = Math.abs(genAR - ar.val);
      if (diff < minDiff) {
        minDiff = diff;
        closestAR = ar.str;
      }
    }
    const imageConfig = { aspectRatio: closestAR };

    // Generate uitvalscherm
    const hasFrontendRef = !!frontendRef;
    const genResult = await generateUitvalscherm(
      baseForGeneration,
      validRefs,
      colorSwatch?.base64 || null,
      imageConfig,
      2, // max attempts
      hasFrontendRef
    );

    if (!genResult.success || !genResult.edited_image) {
      throw new Error("Failed to generate uitvalscherm after all attempts");
    }

    let currentBase64 = genResult.edited_image.split(',')[1] || genResult.edited_image;

    // Resize to match generation input dimensions
    const targetDims = await getImageDimensionsFromBase64(baseForGeneration);
    currentBase64 = await forceResizeToMatch(currentBase64, targetDims.width, targetDims.height);

    // Apply color if swatch provided
    if (colorSwatch) {
      console.log(`[INFO] Applying fabric color from swatch...`);
      const coloredResult = await applyFabricColor(currentBase64, colorSwatch.base64, closestAR, frame_color);
      if (coloredResult) {
        currentBase64 = await forceResizeToMatch(coloredResult, targetDims.width, targetDims.height);
        console.log(`[INFO] Color applied successfully`);
      } else {
        console.log(`[WARN] Color application failed, using original colors`);
      }
    }

    // Composite back to full image if we cropped
    let finalOutputBase64 = currentBase64;
    if (cropBox) {
      try {
        const fullImg = await Image.decode(base64ToBytes(base.base64));
        const cropImg = await Image.decode(base64ToBytes(currentBase64));
        
        if (cropImg.width === cropBox.w && cropImg.height === cropBox.h) {
          fullImg.composite(cropImg, cropBox.x, cropBox.y);
          const finalBytes = await fullImg.encode();
          let binary = '';
          const len = finalBytes.byteLength;
          const chunkSize = 32768;
          for (let i = 0; i < len; i += chunkSize) {
            binary += String.fromCharCode.apply(null, finalBytes.subarray(i, i + chunkSize) as any);
          }
          finalOutputBase64 = btoa(binary);
          console.log(`[INFO] Composited back to full image`);
        } else {
          console.log(`[WARN] Crop dimensions mismatch, skipping composite`);
        }
      } catch (e) {
        console.error("[ERROR] Composite failed:", e);
      }
    }

    const totalTime = Date.now() - globalStartMs;
    console.log(`[INFO] Total processing time: ${totalTime}ms`);

    return new Response(JSON.stringify({
      success: true,
      edited_image: `data:image/png;base64,${finalOutputBase64}`,
      model: genResult.model,
      attempts: genResult.attempts,
      quality: genResult.quality,
      processing_time_ms: totalTime
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (e: any) {
    console.error(`[ERROR] Request failed:`, e);
    return new Response(JSON.stringify({ 
      error: e.message,
      processing_time_ms: Date.now() - globalStartMs
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});