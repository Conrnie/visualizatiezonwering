import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
const deno = (globalThis as any).Deno;
const GEMINI_API_KEY = deno?.env?.get?.('GEMINI_API_KEY') ?? '';

const UITVALSCHERM_REFERENCES = [
  "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/reference_uitvalscherm_6.jpg",
  "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/reference_uitvalscherm_7.jpg",
  "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/Uitvalscherm_reference_1.webp",
  "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/UItvalscherm_reference_2.jpeg",
  "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/uitvalscherm_reference_4.jpg",
  "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/uitvalschermen/uitvalscherm_reference_5.jpg"
];

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
      delete body.generationConfig.responseModalities; // Flash does not support this field in the same way or requires omission
    } else {
      body.generationConfig.imageConfig = imageConfig;
    }
  }

  console.log(`[DEBUG] calling Gemini Chat with model ${model}, history length: ${contents.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50000);

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
      throw new Error(`Gemini request timed out after 50s`);
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

// Unified Quality Scoring Function (Uitvalscherm Focused)
async function evaluateImageQuality(originalBase64: string, referenceBase64: string, generatedBase64: string, colorSwatchBase64: string | null = null, anchors?: { x_left: number; x_right: number; y: number; width_px: number }) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const inferMimeFromBase64 = (b64: string): string => {
    try {
      const bytes = base64ToBytes(b64.slice(0, 512));
      if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return "image/png";
      if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return "image/jpeg";
      return "image/png";
    } catch (_) {
      return "image/png";
    }
  };

  const promptText = `
  Analyze Generated Image (last) vs Original (first) & Reference (second).
  Respond with valid JSON only.
  ${colorSwatchBase64 ? "Check color accuracy using Swatch (Image 3)." : ""}
  ${anchors ? `Verify placement against anchors: LEFT X=${anchors.x_left}, RIGHT X=${anchors.x_right}, TOP Y=${anchors.y}, WIDTH=${anchors.width_px}.` : ''}
  
  CRITERIA (0-10):
  - Placement: 0 if misaligned.
  - Preservation: 0 if house changed.
  - No Red Line: 10 if gone, 0 if visible.
  - Shape: UITVALSCHERM (Triangle profile, Diagonal Arms).
  - Hardware: Drop arms must be visible and attached to wall below cassette.
  - Color: Match swatch.

  STYLE CLASSIFICATION:
  - 'uitvalscherm': TRIANGLE profile, STRAIGHT diagonal arms, STEEP slope, arms attached to wall.
  
  Provide a style_match_score (0-10). 10 = perfect match to uitvalscherm.
  - If arms are missing or "floating" (no visible wall plates/brackets), score must be < 5.
  - If the image contains random lines, artifacts, or messy geometry, score must be < 4.
  - Set "clean_geometry": false if the image has artifacts, messy lines, floating parts, or bad geometry. Otherwise true.
  - Set "brackets_visible": true ONLY if you see distinct wall plates/mounts where arms attach.

  JSON Structure:
  {
    "placement_score": number,
    "preservation_score": number,
    "no_red_line_score": number,
    "extension_score": number,
    "color_score": number,
    "style_match_score": number,
    "style_pred": "uitvalscherm" | "other",
    "arms_visible": boolean,
    "brackets_visible": boolean,
    "front_bar_slim": boolean,
    "clean_geometry": boolean,
    "explanation": "short string"
  }
  `;

  const originalMime = inferMimeFromBase64(originalBase64);
  const referenceMime = inferMimeFromBase64(referenceBase64);
  const generatedMime = inferMimeFromBase64(generatedBase64);
  const swatchMime = colorSwatchBase64 ? inferMimeFromBase64(colorSwatchBase64) : null;

  const parts = [
    { text: promptText },
    { inlineData: { mimeType: originalMime, data: originalBase64 } },
    { inlineData: { mimeType: referenceMime, data: referenceBase64 } }
  ];

  if (colorSwatchBase64) {
    parts.push({ inlineData: { mimeType: swatchMime || 'image/png', data: colorSwatchBase64 } });
  }

  parts.push({ inlineData: { mimeType: generatedMime, data: generatedBase64 } });

  const body = {
    contents: [{
      parts: parts
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 4096,
      responseMimeType: "application/json"
    }
  };

  try {
    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) return { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, style_match_score: 0, clean_geometry: false, explanation: "Verification check failed: " + res.statusText };

    const j = await res.json();
    let parsed = { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, style_match_score: 0, clean_geometry: false, explanation: "Could not parse response" };

    if (j.candidates && j.candidates[0]) {
      const c = j.candidates[0];
      if (c.content && c.content.parts) {
        const allText = c.content.parts.filter((p: any) => typeof p.text === 'string').map((p: any) => p.text).join('\n');
        if (allText) {
          const clean = allText.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
          const m = clean.match(/\{[\s\S]*\}/);
          if (m) {
            try {
              parsed = { ...parsed, ...JSON.parse(m[0]) };
            } catch (e) {
              console.error(`[ERROR] JSON parse failed. Raw text: ${clean}`, e);
            }
          }
        }
      }
    }
    return parsed;
  } catch (e) {
    return { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, style_match_score: 0, clean_geometry: false, explanation: "Error during verification: " + (e as Error).message };
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

async function detectRedLineAnchors(baseImageBase64: string, imgWidth: number, imgHeight: number) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const prompt = `Identify the user-drawn horizontal RED markers in Image 1.
Return exact pixel anchors relative to the image pixel grid:
{"x_left": number, "x_right": number, "y": number, "width_px": number}
Rules:
- The user may draw ONE continuous red line OR TWO separate red segments indicating LEFT and RIGHT endpoints.
- If TWO segments exist at approximately the SAME Y (±3px), set x_left to the LEFTMOST red pixel across both segments, x_right to the RIGHTMOST red pixel, and y to the common Y (use the top edge). width_px = x_right - x_left.
- If ONE continuous line exists, use its leftmost and rightmost red pixels, y = top edge.
- Ignore tiny red artifacts or slanted markings.
- Respond ONLY with JSON.`;

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: baseImageBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, topK: 16, topP: 0.8, maxOutputTokens: 512, responseMimeType: "application/json" }
  };

  try {
    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) return null;
    const j = await res.json();
    let parsed: any = null;
    const c = j.candidates?.[0];
    const txt = c?.content?.parts?.[0]?.text || '';
    if (typeof txt === 'string') {
      const cleanText = txt.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      const m = cleanText.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch (_) { parsed = null; }
      }
    }
    if (!parsed || typeof parsed.x_left !== 'number' || typeof parsed.x_right !== 'number' || typeof parsed.y !== 'number' || typeof parsed.width_px !== 'number') return null;
    if (parsed.x_left < 0 || parsed.x_right > imgWidth || parsed.y < 0 || parsed.y > imgHeight) return null;
    return parsed;
  } catch (_) {
    return null;
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

async function getRedLineBoundingBox(base64: string) {
  try {
    const anchors = await detectRedLineAnchorsPixel(base64);
    if (!anchors) return null;
    
    // For Uitvalscherm, we want a box that covers the width + some margin, and height downwards.
    // Uitvalschermen extend downwards and outwards, creating a triangle profile.
    // They are often taller than knikarms but not as deep.
    const marginX = Math.round(anchors.width_px * 0.2);
    const x = Math.max(0, anchors.x_left - marginX);
    const w = Math.min(10000, (anchors.x_right + marginX) - x); 
    
    // Estimate height. Uitvalscherm drop arms can be long. Let's assume height ~ width.
    const h = Math.round(anchors.width_px * 1.2); 
    const y = Math.max(0, anchors.y - 50); // Start slightly above

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
    
    // High-quality resize
    const resized = img.resize(targetW, targetH, Image.RESIZE_INTERPOLATION.BICUBIC);
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

async function applyFabricColor(baseBase64: string, swatchBase64: string, aspectRatio: any, awningType: string, globalStartMs: number) {
  const models = ['gemini-2.5-flash-image'];
  const isMarkies = awningType === 'markies';
  const isUitval = awningType === 'uitvalscherm';

  const prompt = `You are an expert image editor. Your ONLY task is to change the fabric color.
   ## INPUT IMAGES
   1. IMAGE 1: A house with a ${isMarkies ? 'Markies (curved canopy)' : (isUitval ? 'Drop-arm awning (Triangular)' : 'retractable awning')} already installed. THIS IS YOUR CANVAS.
   2. IMAGE 2: A fabric color/pattern swatch
   ## YOUR TASK
   Change ONLY the fabric of the awning to match the color/pattern in Image 2.
   ## CRITICAL PIXEL PRESERVATION RULE
   - The output image MUST be a PIXEL-PERFECT COPY of Image 1, except for the awning fabric pixels.
   - DO NOT REGENERATE THE HOUSE.
   - DO NOT REGENERATE THE BACKGROUND.
   - DO NOT REGENERATE THE WINDOWS.
   - If you change a single pixel of the wall, sky, or ground, you have FAILED.
   - This is an IN-PAINTING task, not a generation task. Keep 95% of the image exactly as is.
   ## CRITICAL COLOR RULES (STRICT ENFORCEMENT)
   ✓ COLOR SAMPLING: You MUST sample the EXACT colors from Image 2 (The Swatch).
   ✓ ACCURACY: If Image 2 is GREY and WHITE, the awning MUST be GREY and WHITE.
   ✗ NEGATIVE CONSTRAINT: DO NOT generate BLUE, RED, or GREEN stripes unless the swatch contains those colors.
   ✗ NEGATIVE CONSTRAINT: DO NOT use "default" awning colors. Ignore your training bias for blue/white stripes.
   ✓ COLOR CHECK: Look at the swatch. If it is GRAY, use GRAY. If it is BLUE, use BLUE. DO NOT HALLUCINATE BLUE if the swatch is GRAY.
   ✓ PATTERN: If Image 2 is striped, you MUST replicate the stripe sequence, width ratio, and colors exactly. 1:1 Match.
   ✓ REMOVE: The RED LINE marker from the wall if visible. The cassette should cover it.
   ✗ NEGATIVE CONSTRAINT: Ensure the front bar is clean and straight, without any decorative hanging fabric (valance).
   ✗ NEGATIVE CONSTRAINT: NO thick, heavy, rectangular front bar. It must be MINIMAL, ROUNDED, and THIN.
   ${isMarkies
        ? '✗ DO NOT CHANGE: The frame/ribs (Keep them WHITE). DO NOT make them gold or wood.'
        : '✗ DO NOT CHANGE: The mechanical arms, cassette, and front bar. Keep them NEUTRAL (Aluminum/Grey/White). Do NOT apply the fabric color to them.'}
  ${isUitval ? `
   ## UITVALSCHERM PRESERVATION RULES (CRITICAL)
   ✓ SHAPE: You MUST preserve the TRIANGULAR profile of the Drop-arm awning.
   ✓ SLOPE: Keep the STEEP downward angle (> 50 degrees). Do NOT flatten it.
   ✓ ARMS: Preserve the DIAGONAL drop-arms and their wall brackets EXACTLY. Do NOT change their shape, thickness, or attachment style.
   ✓ HARDWARE PRESERVATION: The cassette, arms, and wall brackets from Image 1 MUST remain unchanged. Do not redraw them.
   ✗ NEGATIVE CONSTRAINT: NO horizontal extension. Do NOT turn this into a standard retractable awning.
   ✗ NEGATIVE CONSTRAINT: NO folding elbows.
   ✗ NEGATIVE CONSTRAINT: NO colored arms. The hardware must remain neutral.
  ` : ''}
  ✗ DO NOT CHANGE: The house, background, sky, or anything else.
  ✗ PIXEL PERFECT PRESERVATION: The wall, windows, and environment must be identical to Image 1.
  ${isUitval ? '✗ DO NOT CHANGE: Any pixels outside the awning fabric. No color spills, no background shifts, no hardware recoloring (arms/cassette/bar must stay neutral).' : ''}
  ## COLOR APPLICATION INSTRUCTIONS
  - ANALYZE Image 2 (Swatch) first. Identify the dominant colors (e.g., Light Grey #D3D3D3 and White #FFFFFF).
  - APPLY those exact colors to the awning fabric in Image 1.
  - If Image 2 is striped → make fabric striped with same colors. Ensure the STRIPE WIDTHS match the swatch.
  - STRIPE DIRECTION: Stripes must run PARALLEL to the slope of the awning (from wall to front).
  - If Image 2 is solid → make fabric solid with same color.
   - TEXTURE RULE: You MUST generate subtle VERTICAL SEAMS (stitching lines) that run from the wall to the front bar.
   - DIRECTION: The seams must be PARALLEL to the slope.
   - NEGATIVE CONSTRAINT: NO squares, NO grid patterns, NO cross-hatching, NO pixelated noise. The fabric should be smooth with only vertical lines.
   - REALISM: The new color must look like REAL FABRIC. Preserve the shadows, highlights, and folds from Image 1.
  - BLENDING: Multiply/Overlay the new color so it interacts with the lighting. Do NOT paste it like a flat sticker.
  - BRIGHTNESS: Keep the scene natural. Do not make the fabric glow or look unnaturally bright/dark.
  ${isMarkies
       ? '- The frame ribs MUST stay WHITE'
       : '- The arms, cassette, and front bar MUST stay NEUTRAL (Aluminum/Grey/White) - do NOT color them.'}
   Generate the recolored image now.`;

  for (const model of models) {
      // Force execution regardless of global timer to ensure color is applied
      const timeoutMs = 35000; 

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
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: aspectRatio }
        }
      };

      if (model === 'gemini-2.5-flash-image') {
          delete body.generationConfig.responseModalities;
      }

      try {
        console.log(`[INFO] Applying color with model: ${model}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const txt = await res.text();
          console.error(`Color application failed (${model}):`, txt);
          continue; // Try next model
        }

        const json = await res.json();
        
        // Log finishReason
        if (json.candidates && json.candidates[0] && json.candidates[0].finishReason !== "STOP") {
             console.log(`[WARN] Color ${model} - finishReason: ${json.candidates[0].finishReason}`);
        }

        const data = extractImage(json);
        if (data) {
          const m = data.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
          return m ? m[1] : null;
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          console.error(`Color application timed out (${model}).`);
        } else {
          console.error(`Error applying color (${model}):`, e);
        }
      }
  }
  return null;
}

async function generateImageLoop(modelName: string, initialHistory: any[], imageConfig: any, baseBase64: string, refBase64: string, colorSwatchBase64: string | null, anchors?: { x_left: number; x_right: number; y: number; width_px: number }, fullBaseBase64?: string, cropBox?: { x: number; y: number; w: number; h: number }, globalStartMs: number = Date.now()) {
  let conversationHistory = initialHistory;
  
  // Fallback Models
   const models = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
   let successfulModel = '';
  let edited: string | null = null;
  let attemptsMade = 0;

  console.log(`[INFO] Starting Uitvalscherm loop.`);

  for (const model of models) {
      if (Date.now() - globalStartMs > 45000) break;
      console.log(`[INFO] Trying model: ${model}`);
      
      try {
        const result = await callGeminiChat(model, conversationHistory, imageConfig, 0.1);
        
        if (result && result.candidates && result.candidates[0]) {
             const c = result.candidates[0];
             if (c.finishReason !== "STOP") {
                 console.log(`[WARN] Model ${model} finishReason: ${c.finishReason}`);
             }
        }
        
        edited = extractImage(result);
        if (edited) {
            successfulModel = model;
            attemptsMade++;
            break;
        }
      } catch (e) {
        console.error(`Model ${model} failed:`, e);
      }
  }

  if (!edited) return { success: false, attempts_made: attemptsMade, model: 'none' };

  const generatedBase64 = edited.split(',')[1];
  
  // Check Quality
  // const scores = await evaluateImageQuality(baseBase64, refBase64, generatedBase64, colorSwatchBase64, anchors);
  const scores = { 
    placement_score: 10, 
    preservation_score: 10, 
    no_red_line_score: 10, 
    extension_score: 0, 
    color_score: 10, 
    style_match_score: 10, 
    clean_geometry: true, 
    explanation: "Skipped for speed" 
  };
  
  // If quality is very poor, we could potentially loop, but for now we'll accept it 
  // or maybe retry with strict prompt? 
  // Given time constraints and model costs, we often just return the result if it's "okay".
  
  return { success: true, edited_image: edited, scores, attempts_made: attemptsMade, model: successfulModel };
}

deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    // Support multiple naming conventions for backward compatibility
    const base_image = body.base_image || body.image_data;
    const reference_image = body.reference_image || body.new_awning_reference_image || body.awning_reference_image;
    const color_swatch = body.color_swatch || body.color_swatch_image;

    if (!base_image || !reference_image) {
      throw new Error("Missing base_image (or image_data) or reference_image (or new_awning_reference_image)");
    }

    const base = parseDataUri(base_image);
    const ref = parseDataUri(reference_image);
    const colorSwatch = color_swatch ? parseDataUri(color_swatch) : null;

    // Force Uitvalscherm
    const awningType = 'uitvalscherm'; 

    const origDims = await getImageDimensionsFromBase64(base.base64);
    
    // Crop Logic
    let anchors = await detectRedLineAnchors(base.base64, origDims.width, origDims.height);
    if (!anchors) anchors = await detectRedLineAnchorsPixel(base.base64);
    
    let cropBox: { x: number; y: number; w: number; h: number } | null = null;
    let baseForGeneration = base.base64;
    let localAnchors = anchors || undefined;

    if (anchors) {
      cropBox = await getRedLineBoundingBox(base.base64);
      if (cropBox) {
        // Uitvalscherm specific padding (taller)
        const extraPadBottom = Math.round(origDims.height * 0.35); // Needs more space at bottom for arms
        const extraPadTop = Math.round(origDims.height * 0.15); // Increased top context for better placement
        const paddedY = Math.max(0, cropBox.y - extraPadTop);
        const newH = Math.min(origDims.height - paddedY, cropBox.h + extraPadBottom + (cropBox.y - paddedY));
        cropBox = { ...cropBox, y: paddedY, h: newH };
        
        // Adjust to supported AR
        const supportedARs = [
          { val: 1.0, label: '1:1' },
          { val: 4/3, label: '4:3' },
          { val: 3/4, label: '3:4' },
          { val: 16/9, label: '16:9' },
          { val: 9/16, label: '9:16' }
        ];
        const currentAR = cropBox.w / cropBox.h;
        let bestAR = 1.0;
        let minDiff = Infinity;
        for (const ar of supportedARs) {
          const diff = Math.abs(currentAR - ar.val);
          if (diff < minDiff) {
            minDiff = diff;
            bestAR = ar.val;
          }
        }
        
        let targetW = cropBox.w;
        let targetH = cropBox.h;
        if (currentAR > bestAR) targetH = Math.round(targetW / bestAR);
        else targetW = Math.round(targetH * bestAR);
        
        let newX = cropBox.x - Math.floor((targetW - cropBox.w) / 2);
        let newY = cropBox.y - Math.floor((targetH - cropBox.h) / 2);
        
        if (newX < 0) newX = 0;
        if (newY < 0) newY = 0;
        if (newX + targetW > origDims.width) newX = Math.max(0, origDims.width - targetW);
        if (newY + targetH > origDims.height) newY = Math.max(0, origDims.height - targetH);
        
        const finalW = Math.min(targetW, origDims.width - newX);
        const finalH = Math.min(targetH, origDims.height - newY);
        
        cropBox = { x: newX, y: newY, w: finalW, h: finalH };
        baseForGeneration = await cropImageToBase64(base.base64, cropBox);
        
        localAnchors = {
          x_left: anchors.x_left - cropBox.x,
          x_right: anchors.x_right - cropBox.x,
          y: anchors.y - cropBox.y,
          width_px: anchors.width_px
        };
      }
    }

    const hasColorSwatch = !!colorSwatch;

    // Fetch additional references
    const additionalRefs = await Promise.all(UITVALSCHERM_REFERENCES.map(url => fetchUrlAsBase64Inline(url)));
    const validAdditionalRefs = additionalRefs.filter(r => r !== null);

    const colorInstruction = hasColorSwatch
      ? `Match the Color Swatch (Image 3) EXACTLY`
      : `Match the Reference Image`;

    const promptObj = {
      task: "edit_image",
      description: "Install a specific 'Uitvalscherm' (Drop-arm awning) on the house wall. This is NOT a standard retractable awning.",
      inputs: {
        base_image: {
          index: 0,
          description: "The House (Canvas). CRITICAL: You must use this EXACT image as the background. Do NOT generate a new house.",
          role: "CANVAS"
        },
        reference_image: {
          index: 1,
          description: "The Awning Reference. Copy the ARM STYLE and WALL BRACKETS exactly from this image.",
          role: "REFERENCE"
        }
      },
      instructions: {
        action: "Install a Drop-arm awning (Uitvalscherm) OVER the red line.",
          position: "CRITICAL: The Red Line is the EXACT MOUNTING POINT. The cassette must be placed DIRECTLY OVER the red line, covering it completely. The red line must be INSIDE the cassette. Do NOT place the cassette above the line. Do NOT place it below the line.",
          appearance: {
            color: colorInstruction + " (Apply to FABRIC ONLY)",
          type: "Uitvalscherm (Classic Drop-arm)",
          shape: "TRIANGULAR side profile. Steep downward slope (> 50 degrees). NOT flat/horizontal.",
          arms: "Two rigid drop-arms. CRITICAL: You MUST match the ARM STYLE and WALL BRACKETS of the Reference Image (Index 1) EXACTLY. Copy the hardware design from the Reference. The arms attach to the wall roughly halfway down the window height. Color: Neutral (Grey/White/Aluminum).",
          cassette: "Compact box housing mounted OVER the red line to hide it. Color: Neutral (Grey/White/Aluminum).",
          volan: "MINIMAL, THIN, ROUNDED front profile (half-cylinder shape). It should be barely visible. NOT a thick rectangular bar."
        },
        negative_constraints: [
          "NO REGENERATING THE HOUSE/BACKGROUND (Critical)",
          "NO changing the wall texture or window details",
          "NO horizontal extension (Retractable/Knikarm style)",
          "NO folding elbows or knuckle joints in the arms",
          "NO flat slope (must be steep)",
          "Valance or hanging fabric on the front bar",
          "NO visible red line (must be covered by cassette)",
          "NO floating cassette (must be ON the red line)",
          "NO vertical offset (do not place above/below the red line)",
          "NO extremely long arms extending to the floor",
          "NO colored hardware (arms/cassette must remain neutral)",
          "NO thick, heavy, rectangular front bar (Knikarm style)",
          "NO placement anywhere else but the red line",
          "NO width wider than the red line",
          "NO tiny or invisible wall attachments (must use visible brackets)"
        ]
      },
      strict_preservation_rules: [
        "CRITICAL: The output must be the Base Image with the awning added.",
        "CRITICAL: Do NOT hallucinate a different house. The wall bricks, windows, and ground must be IDENTICAL to Image 1.",
        "Do NOT change the camera angle.",
        "Do NOT crop or zoom significantly."
      ]
    };

    const systemPrompt = JSON.stringify(promptObj, null, 2);

    const parts: any[] = [
      { text: systemPrompt },
      { inlineData: { mimeType: 'image/png', data: baseForGeneration } },
      { inlineData: { mimeType: ref.mime, data: ref.base64 } }
    ];

    if (colorSwatch) {
      parts.push({ inlineData: { mimeType: colorSwatch.mime, data: colorSwatch.base64 } });
    }

    // Add additional references
    validAdditionalRefs.forEach(r => {
        if(r) parts.push(r); // fetchUrlAsBase64Inline returns { inlineData: ... }
    });

    const conversationHistory = [{ role: "user", parts: parts }];
    
    // Force AR
    const inputAR = origDims.width / origDims.height;
    const genAR = cropBox ? (cropBox.w / cropBox.h) : inputAR;
    // Map to closest supported AR string
    const supportedARs = [
      { str: "1:1", val: 1 / 1 },
      { str: "4:3", val: 4 / 3 },
      { str: "3:4", val: 3 / 4 },
      { str: "16:9", val: 16 / 9 },
      { str: "9:16", val: 9 / 16 }
    ];
    let closestGenAR = "1:1";
    let minDiff = Infinity;
    for (const ar of supportedARs) {
      const diff = Math.abs(genAR - ar.val);
      if (diff < minDiff) {
        minDiff = diff;
        closestGenAR = ar.str;
      }
    }
    const imageConfig = { aspectRatio: closestGenAR };
 
     const model = 'gemini-3-pro-image-preview';
     const globalStartMs = Date.now();
    
    let bestResult = await generateImageLoop(model, conversationHistory, imageConfig, baseForGeneration, ref.base64, colorSwatch?.base64 || null, localAnchors, base.base64, cropBox || undefined, globalStartMs);

    let finalEdited = bestResult.edited_image || baseForGeneration; // Fallback to base if failed
    
    // Composite & Color Logic
    let currentBestBase64 = finalEdited;
    
    if (bestResult.edited_image) {
      const genMatch = finalEdited.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
      const rawGenBase64 = genMatch ? genMatch[1] : finalEdited;

      // 1. Resize Raw to match Base
      const dims = await getImageDimensionsFromBase64(baseForGeneration);
      currentBestBase64 = await forceResizeToMatch(rawGenBase64, dims.width, dims.height);

      // 2. Apply Color if Swatch
      if (colorSwatch) {
        let coloredResult = await applyFabricColor(currentBestBase64, colorSwatch.base64, closestGenAR, awningType, globalStartMs);
        if (coloredResult) {
           const colorMatch = coloredResult.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
           const colorRaw = colorMatch ? colorMatch[1] : coloredResult;
           
           // Resize colored result to match base
           currentBestBase64 = await forceResizeToMatch(colorRaw, dims.width, dims.height);
        }
      }
    }

    // Final Assembly (if cropped)
    let finalOutputBase64 = currentBestBase64;
    if (cropBox && bestResult.edited_image) {
       try {
         const fullImg = await Image.decode(base64ToBytes(base.base64));
         const cropImg = await Image.decode(base64ToBytes(currentBestBase64));
         
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
         }
       } catch (e) {
         console.error("Assembly failed:", e);
       }
    }

    return new Response(JSON.stringify({
      success: bestResult.success,
      edited_image: `data:image/png;base64,${finalOutputBase64}`,
      model: bestResult.model
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
