import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";
const deno = (globalThis as any).Deno;
const GEMINI_API_KEY = deno?.env?.get?.('GEMINI_API_KEY') ?? '';

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

  if (model === 'gemini-2.0-flash-exp' || model === 'gemini-2.5-flash-image') {
       // For 2.5-flash-image, we often do NOT want responseModalities=["IMAGE"] if we want JSON, 
       // but here we want an IMAGE. 
       // However, based on experience, 2.5-flash-image might behave better without explicit responseModalities 
       // if we are providing a JSON prompt? No, we want an IMAGE output.
       // Let's stick to the knikarm configuration which REMOVED responseModalities for 2.5-flash-image
       if (model === 'gemini-2.5-flash-image') {
          delete body.generationConfig.responseModalities;
       }
  }

  if (imageConfig) {
    if (model === 'gemini-2.5-flash-image') {
      body.generationConfig.imageConfig = { aspectRatio: imageConfig.aspectRatio };
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
    const json = await res.json();
    
    // Log full response for debugging (especially for finishReason)
    if (json.candidates && json.candidates[0] && json.candidates[0].finishReason !== "STOP") {
       console.log(`[WARN] ${model} - finishReason: ${json.candidates[0].finishReason}`);
    }

    return json;
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

// Unified Quality Scoring Function (Markies Focused)
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
  - Shape: MARKIES (Curved/Dome/Canopy).
  - Hardware: Ribs must be visible.
  - Color: Match swatch.

  STYLE CLASSIFICATION:
  - 'markies': Dome shape, curved, ribs visible.
  
  Provide a style_match_score (0-10). 10 = perfect match to markies.
  - If the image contains random lines, artifacts, or messy geometry, score must be < 4.
  - Set "clean_geometry": false if the image has artifacts, messy lines, floating parts, or bad geometry. Otherwise true.

  JSON Structure:
  {
    "placement_score": number,
    "preservation_score": number,
    "no_red_line_score": number,
    "extension_score": number,
    "color_score": number,
    "style_match_score": number,
    "style_pred": "markies" | "other",
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
    
    // For Markies, we want a box that covers the width + some margin, and height downwards.
    // Markies are often taller than knikarms (dome shape).
    const marginX = Math.round(anchors.width_px * 0.2);
    const x = Math.max(0, anchors.x_left - marginX);
    const w = Math.min(10000, (anchors.x_right + marginX) - x); 
    
    // Estimate height based on typical aspect ratio of markies (often 1:1 or close to width/2)
    // Let's assume height is similar to width or slightly less.
    const h = Math.round(anchors.width_px * 1.0); 
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
    const bytes = await crop.encode(0);
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

async function forceResizeToMatch(base64: string, targetBase64: string) {
  try {
    const baseImg = await Image.decode(base64ToBytes(base64));
    let targetImg = await Image.decode(base64ToBytes(targetBase64));

    // We'll use 3 (Bicubic) for smoother results
    if (targetImg.width !== baseImg.width || targetImg.height !== baseImg.height) {
      console.log(`[INFO] Resizing target image from ${targetImg.width}x${targetImg.height} to ${baseImg.width}x${baseImg.height}`);
      // Use bicubic interpolation (3)
      targetImg = targetImg.resize(baseImg.width, baseImg.height, 3);
      const bytes = await targetImg.encode(0);
      let binary = '';
      const len = bytes.byteLength;
      const chunkSize = 32768;
      for (let i = 0; i < len; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
      }
      return btoa(binary);
    }
    return targetBase64;
  } catch (e) {
    console.error("forceResizeToMatch failed:", e);
    return targetBase64;
  }
}

async function applyFabricColor(baseBase64: string, swatchBase64: string, aspectRatio: any, awningType: string) {
  const models = ['gemini-2.5-flash-image'];
  const isMarkies = awningType === 'markies';
  const isUitval = awningType === 'uitvalscherm';

  const prompt = `You are an expert image editor. Your ONLY task is to change the fabric color.
 
 ## INPUT IMAGES
 1. IMAGE 1: A house with a ${isMarkies ? 'Markies (curved canopy)' : (isUitval ? 'Drop-arm awning (Triangular)' : 'retractable awning')} already installed
 2. IMAGE 2: A fabric color/pattern swatch
 
 ## YOUR TASK
 Change ONLY the fabric of the awning to match the color/pattern in Image 2.
 
 ## CRITICAL RULES
 ✓ CHANGE: The awning FABRIC color/pattern → match Image 2 EXACTLY.
 ✓ PATTERN: If Image 2 is striped, you MUST replicate the stripe sequence, width ratio, and colors exactly. 1:1 Match.
 ✓ CHANGE: The awning VALANCE (if present) → match Image 2
 ✓ REMOVE: The RED LINE marker from the wall if visible.
 ${isMarkies
      ? '✗ DO NOT CHANGE: The frame/ribs (Keep them WHITE). DO NOT make them gold or wood.'
      : '✗ DO NOT CHANGE: The mechanical arms (keep them DARK GREY/ANTHRACITE)'}
${isUitval ? '✓ SHAPE: Keep the TRIANGULAR profile and DIAGONAL arms. Do NOT make it flat.' : ''}
✗ DO NOT CHANGE: The house, background, sky, or anything else.
✗ PIXEL PERFECT PRESERVATION: The wall, windows, and environment must be identical to Image 1.
${isUitval ? '✗ DO NOT CHANGE: Any pixels outside the awning fabric. No color spills, no background shifts, no hardware recoloring.' : ''}

## COLOR APPLICATION
- If Image 2 is striped → make fabric striped with same colors. Ensure the STRIPE WIDTHS match the swatch.
- STRIPE DIRECTION: Stripes must run PARALLEL to the slope of the awning (from wall to front).
- If Image 2 is solid → make fabric solid with same color. IMPORTANT: Even for solid colors, you MUST generate subtle SLAT SEAMS/TEXTURE so the fabric looks realistic and constructed, not flat like a sheet of paper.
- Preserve the fabric's natural shading and folds. Apply the fabric realistically, respecting light, shadow, and the natural drape/tension of the material.
${isMarkies
     ? '- The frame ribs MUST stay WHITE'
     : '- The arms MUST stay DARK GREY/ANTHRACITE - do NOT color them'}
 
 Generate the recolored image now.`;

  for (const model of models) {
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
        const timeoutId = setTimeout(() => controller.abort(), 35000);

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
  let attemptsMade = 0;
  
  const MAX_LOOPS = 2;

  console.log(`[INFO] Starting Markies loop for model: ${modelName}`);

  for (let attempt = 1; attempt <= MAX_LOOPS; attempt++) {
    if (Date.now() - globalStartMs > 45000) break;
    attemptsMade = attempt;
    
    let edited = null;
    const maxRetries = 2;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const result = await callGeminiChat(modelName, conversationHistory, imageConfig, 0.1);
        edited = extractImage(result);
        if (edited) break;
      } catch (e) {
        console.error(`Gemini call failed (retry ${retry}):`, e);
      }
    }

    if (!edited) return { success: false, attempts_made: attemptsMade, model: modelName };

    const generatedBase64 = edited.split(',')[1];
    
    // Check Quality
    const scores = await evaluateImageQuality(baseBase64, refBase64, generatedBase64, colorSwatchBase64, anchors);
    
    if (scores.placement_score >= 7 && scores.preservation_score >= 7 && scores.style_match_score >= 7 && scores.clean_geometry) {
       return { success: true, edited_image: edited, scores, attempts_made: attemptsMade, model: modelName };
    }
    
    conversationHistory.push({ role: "model", parts: [{ inlineData: { mimeType: "image/png", data: generatedBase64 } }] });
    conversationHistory.push({ role: "user", parts: [{ text: `Critique: ${scores.explanation}. Improve placement and geometry. Ensure it looks like a MARKIES (dome/canopy).` }] });
  }

  return { success: false, attempts_made: attemptsMade, model: modelName };
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

    // Force Markies
    const awningType = 'markies'; 

    // Fetch Hardcoded Reference Images
    const refUrls = [
      "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/markiezen/awning_visualization.jpg",
      "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/markiezen/DSCF0021_0.JPG"
    ];
    const extraRefs: any[] = [];
    for (const url of refUrls) {
      const fetched = await fetchUrlAsBase64Inline(url);
      if (fetched) extraRefs.push(fetched);
    }
    
    const origDims = await getImageDimensionsFromBase64(base.base64);
    
    // Crop Logic
    let anchors = await detectRedLineAnchors(base.base64, origDims.width, origDims.height);
    if (!anchors) anchors = await detectRedLineAnchorsPixel(base.base64);
    
    let cropBox: { x: number; y: number; w: number; h: number } | null = null;
    let baseForGeneration = base.base64;
    let localAnchors = anchors || undefined;

    // Cropping disabled as requested to process full image directly
    /*
    if (anchors) {
      cropBox = await getRedLineBoundingBox(base.base64);
      // ... (rest of the block commented out)
    }
    */

    const hasColorSwatch = !!colorSwatch;
    
    const promptObj = {
      task: "edit_image",
      description: "Add a Markies (Canopy) awning to the specific Base Image provided.",
      inputs: {
        base_image: {
          index: 0,
          description: "The first image (House). This is the ONLY image to be edited.",
          role: "CANVAS"
        },
        reference_image: {
          index: 1,
          description: "The second image (User Provided Awning Reference). Use this for structure and style (Markies/Canopy).",
          role: "REFERENCE"
        },
        additional_references: {
          indices: [2, 3],
          description: "Additional Markies structure references. Use these to understand the side profile, ribs, and folding mechanism.",
          role: "STRUCTURE_REFERENCE"
        }
      },
      instructions: {
        action: "Install a Markies (Dutch Canopy) awning on the wall of the Base Image.",
        position: "Exactly along the RED LINE marked on the wall. Remove the red line in the final output.",
        appearance: {
          color: hasColorSwatch ? "Match the Color Swatch (Last Image)" : "Match the Reference Image",
          type: "Markies (Dutch Canopy) awning",
          shape: "Quarter-cylinder / Quarter-round box shape. NOT just a curved sheet.",
          structure: "CLOSED SIDES: The sides MUST be covered with fabric (not open). SIDE RIBS: Visible wooden/aluminum slats radiating on the side panels.",
          frame: "Wooden or aluminum framework. The side panels are the defining feature."
        },
        negative_constraints: [
          "NO open sides",
          "NO folding arms",
          "NO triangular support brackets under the awning",
          "NO vertical legs or pillars",
          "NO changes to the house structure",
          "NO pixelation or artifacts",
          "NO flat retractable awnings",
          "NO knikarm awnings",
          "NO generic curved awnings without side ribs"
        ]
      },
      strict_preservation_rules: [
        "The output must be the Base Image with the awning added.",
        "Do NOT hallucinate a different house.",
        "Do NOT change the camera angle.",
        "Do NOT crop or zoom significantly.",
        "The awning MUST be a MARKIES (curved/dome shape), NOT a flat/retractable awning.",
        "PIXEL PERFECT PRESERVATION of the background house is REQUIRED. Do not regenerate the bricks, windows, or garden.",
        "Only the area where the awning is attached should be modified.",
        "COPY THE EXACT STRUCTURE OF THE REFERENCE IMAGE (Image 2). It shows a Markies."
      ]
    };

    const systemPrompt = JSON.stringify(promptObj, null, 2);

    const parts: any[] = [
      { text: systemPrompt },
      { inlineData: { mimeType: 'image/png', data: baseForGeneration } },
      { inlineData: { mimeType: ref.mime, data: ref.base64 } }
    ];

    // Add extra references (Markies specific)
    for (const extra of extraRefs) {
      parts.push(extra);
    }

    if (colorSwatch) {
      parts.push({ inlineData: { mimeType: colorSwatch.mime, data: colorSwatch.base64 } });
    }

    // Reset history for new request
    const conversationHistory = [{ role: "user", parts: parts }];
    
    // Force AR
    const inputAR = origDims.width / origDims.height;
    // cropBox is disabled, so we use inputAR
    const genAR = inputAR;
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

    // Fallback Model Logic: Try 3.0, then 2.5
    const models = ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
    const globalStartMs = Date.now();
    let bestResult: any = { success: false };

    for (const model of models) {
        console.log(`[INFO] Trying model: ${model}`);
        // We need to clone the history because generateImageLoop might mutate it (pushing responses)
        // Actually generateImageLoop pushes to the array passed. So we should pass a fresh copy or handle it.
        // generateImageLoop takes 'initialHistory' and assigns it to 'conversationHistory'.
        // If it pushes, it modifies the array.
        // Let's pass a deep copy.
        const historyCopy = JSON.parse(JSON.stringify(conversationHistory));
        
        bestResult = await generateImageLoop(model, historyCopy, imageConfig, baseForGeneration, ref.base64, colorSwatch?.base64 || null, localAnchors, base.base64, cropBox || undefined, globalStartMs);
        
        if (bestResult.success && bestResult.edited_image) {
             break;
        }
    }

    let finalEdited = bestResult.edited_image || baseForGeneration; // Fallback to base if failed
    
    // Composite & Color Logic
    let currentBestBase64 = finalEdited;
    
    if (bestResult.edited_image) {
      const genMatch = finalEdited.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
      const rawGenBase64 = genMatch ? genMatch[1] : finalEdited;

      // 1. Composite Raw -> Force Resize
      // REMOVED RESIZING AS REQUESTED
      currentBestBase64 = rawGenBase64;

      // 2. Apply Color if Swatch
      if (colorSwatch && Date.now() - globalStartMs < 52000) {
        let coloredResult = await applyFabricColor(currentBestBase64, colorSwatch.base64, closestGenAR, awningType);
        if (coloredResult) {
           const colorMatch = coloredResult.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
           const colorRaw = colorMatch ? colorMatch[1] : coloredResult;
           
           // Force Resize - REMOVED
           currentBestBase64 = colorRaw;
        }
      }
    }

    // Final Assembly (if cropped)
    let finalOutputBase64 = currentBestBase64;
    // Assembly disabled as cropping is disabled
    /*
    if (cropBox && bestResult.edited_image) {
       try {
         const fullImg = await Image.decode(base64ToBytes(base.base64));
         const cropImg = await Image.decode(base64ToBytes(currentBestBase64));
         
         if (cropImg.width === cropBox.w && cropImg.height === cropBox.h) {
           fullImg.composite(cropImg, cropBox.x, cropBox.y);
           const finalBytes = await fullImg.encode(0);
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
    */

    return new Response(JSON.stringify({
      success: bestResult.success,
      edited_image: `data:image/png;base64,${finalOutputBase64}`,
      model: bestResult.model
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
