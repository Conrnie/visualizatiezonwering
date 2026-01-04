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
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" }
    ],
    generationConfig: {
      temperature: temperature,
      topK: 32,
      topP: 0.8,
      maxOutputTokens: 4096,
      // responseModalities: ["IMAGE"]
      }
    };
  
    if (model === 'gemini-2.0-flash-exp' || model === 'gemini-2.5-flash-image') {
        // Common handling if needed
    }

    if (imageConfig) {
      if (model === 'gemini-2.0-flash-exp') {
         // Pass image config and force image modality for exp model
         body.generationConfig.imageConfig = { aspectRatio: imageConfig.aspectRatio };
         body.generationConfig.responseModalities = ["IMAGE"];
      } else if (model === 'gemini-2.5-flash-image') {
         // Pass image config, NO responseModalities for 2.5-flash-image
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
      
      const jsonRes = await res.json();
      
      // Log full response if candidates are empty or have finishReason other than STOP
      if (!jsonRes.candidates || jsonRes.candidates.length === 0 || jsonRes.candidates[0].finishReason !== 'STOP') {
          console.log("[DEBUG] Gemini Full Response:", JSON.stringify(jsonRes).substring(0, 2000));
      }
      
      return jsonRes;
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
  console.log("[DEBUG] extractImage failed. Result candidates:", JSON.stringify(result?.candidates || "No candidates").substring(0, 1000));
  
  if (result?.candidates?.[0]?.content?.parts) {
      const parts = result.candidates[0].content.parts;
      const textPart = parts.find((p: any) => p.text);
      if (textPart) {
          console.log("[DEBUG] Model Text Response:", textPart.text);
      }
  }

  if (result?.promptFeedback) console.log("[DEBUG] PromptFeedback:", JSON.stringify(result.promptFeedback));
  return null;
}

// Unified Quality Scoring Function (Knikarm Focused)
async function quickPreservationCheck(originalBase64: string, generatedBase64: string) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const prompt = `Compare these two images. Is Image 2 the SAME HOUSE from the SAME ANGLE as Image 1, with only an awning added?

Answer with ONLY: YES or NO

If NO, briefly explain what changed (different house, different angle, cropped, etc.)`;

  const body: any = {
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: originalBase64 } },
        { inlineData: { mimeType: 'image/png', data: generatedBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
  };

  try {
    const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await res.json();
    const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "NO";
    const passed = text.trim().toUpperCase().startsWith("YES");
    return { passed, reason: text };
  } catch (e) {
    console.error("Preservation check failed", e);
    return { passed: false, reason: "Check failed" };
  }
}

async function measureAwningWidthUsingDiff(baseBase64: string, genBase64: string, anchors: { x_left: number; x_right: number; y: number; width_px: number }) {
  try {
    const genImg = await Image.decode(base64ToBytes(genBase64));

    // We measure the awning width by detecting pixels that differ significantly from the "background" wall color.
    // We assume the pixels just outside the expected awning range (left/right) are the wall/background.

    const y = Math.min(Math.max(Math.round(anchors.y), 0), genImg.height - 1);
    // Scan a few lines around the anchor Y to catch the awning body/frame
    // We start slightly below the anchor Y to avoid the very top edge blending with wall
    const yStart = Math.min(genImg.height - 1, Math.max(0, y + 2));
    const yEnd = Math.min(genImg.height - 1, yStart + 12);

    // Define background sample regions (approx 40px outside the expected anchors)
    // We use the generated image itself to find "what the wall looks like now"
    const bgLeftX = Math.max(0, Math.round(anchors.x_left) - 40);
    const bgRightX = Math.min(genImg.width - 1, Math.round(anchors.x_right) + 40);

    // Sample background color (average of a vertical strip to reduce noise)
    let bgR = 0, bgG = 0, bgB = 0, count = 0;
    for (let yy = yStart; yy <= yEnd; yy++) {
      const c1 = genImg.getPixelAt(bgLeftX, yy);
      const c2 = genImg.getPixelAt(bgRightX, yy);
      bgR += ((c1 >> 24) & 0xFF) + ((c2 >> 24) & 0xFF);
      bgG += ((c1 >> 16) & 0xFF) + ((c2 >> 16) & 0xFF);
      bgB += ((c1 >> 8) & 0xFF) + ((c2 >> 8) & 0xFF);
      count += 2;
    }
    bgR = Math.round(bgR / count);
    bgG = Math.round(bgG / count);
    bgB = Math.round(bgB / count);

    const threshold = 35; // Sensitivity to color change vs wall

    let left = -1;
    let right = -1;

    // Search range: generous around the anchors
    const searchMin = Math.max(0, Math.round(anchors.x_left) - 100);
    const searchMax = Math.min(genImg.width - 1, Math.round(anchors.x_right) + 100);

    for (let x = searchMin; x <= searchMax; x++) {
      let isAwning = 0;
      for (let yy = yStart; yy <= yEnd; yy++) {
        const c = genImg.getPixelAt(x, yy);
        const r = (c >> 24) & 0xFF, g = (c >> 16) & 0xFF, b = (c >> 8) & 0xFF;
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        if (diff > threshold) isAwning++;
      }

      // If more than 40% of the vertical pixels differ from background, it's awning
      if (isAwning > (yEnd - yStart + 1) * 0.4) {
        if (left === -1) left = x;
        right = x;
      }
    }

    if (left === -1 || right === -1) return null;

    // Filter noise: Awning must be at least 20px wide
    if ((right - left) < 20) return null;

    return { x_left: left, x_right: right, width_px: right - left };
  } catch (_) {
    return null;
  }
}

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
  - Shape: KNIKARM (Horizontal, Fully Extended).
  - Extension: 0 if retracted/closed, 10 if fully extended.
  - Hardware: Arms must be visible.
  - Front Bar: Slim, rounded HALF-CYLINDER voorlijst (NOT boxy), fabric-dominant view.
  - Color: Match swatch.

  STYLE CLASSIFICATION:
  - 'knikarm': Folding arms, horizontal, fully extended.
  
  Provide a style_match_score (0-10). 10 = perfect match to knikarm (fully extended).
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
    "style_pred": "knikarm" | "other",
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

async function measureAwningYPosition(baseBase64: string, genBase64: string, anchors: { x_left: number; x_right: number; y: number; width_px: number }) {
  try {
    const genImg = await Image.decode(base64ToBytes(genBase64));
    const baseImg = await Image.decode(base64ToBytes(baseBase64));

    // Dimension mismatch scaling
    const sx = genImg.width / baseImg.width;
    const sy = genImg.height / baseImg.height;

    // Scale anchors to generated image space
    const ax_left = Math.round(anchors.x_left * sx);
    const ax_right = Math.round(anchors.x_right * sx);
    const ay = Math.round(anchors.y * sy);

    const centerX = Math.floor((ax_left + ax_right) / 2);
    const searchXStart = Math.max(0, centerX - 20);
    const searchXEnd = Math.min(genImg.width - 1, centerX + 20);
    
    // We expect the awning to start around ay and go down.
    // Scan downwards from ay.
    const startY = Math.max(0, ay);
    const endY = Math.min(genImg.height - 1, ay + 300); // Look up to 300px down

    let topY = -1;
    let bottomY = -1;

    // Very simple difference check
    for (let y = startY; y <= endY; y++) {
      let diffCount = 0;
      for (let x = searchXStart; x <= searchXEnd; x++) {
        const c1 = genImg.getPixelAt(x, y);
        const c0 = baseImg.getPixelAt(Math.round(x / sx), Math.round(y / sy)); // Map back to base
        
        const r0 = (c0 >> 24) & 0xFF, g0 = (c0 >> 16) & 0xFF, b0 = (c0 >> 8) & 0xFF;
        const r1 = (c1 >> 24) & 0xFF, g1 = (c1 >> 16) & 0xFF, b1 = (c1 >> 8) & 0xFF;
        
        if (Math.abs(r1 - r0) + Math.abs(g1 - g0) + Math.abs(b1 - b0) > 60) {
          diffCount++;
        }
      }
      if (diffCount > 5) {
        if (topY === -1) topY = y;
        bottomY = y;
      }
    }

    if (topY !== -1 && bottomY !== -1) {
      return { y_top: topY, y_bottom: bottomY };
    }
    return null;
  } catch (e) {
    console.error("measureAwningYPosition failed:", e);
    return null;
  }
}

async function getRedLineBoundingBox(base64: string) {
  try {
    const anchors = await detectRedLineAnchorsPixel(base64);
    if (!anchors) return null;
    
    // For Knikarm, we want a box that covers the width + some margin, and height downwards.
    // Default crop box strategy:
    const marginX = Math.round(anchors.width_px * 0.2);
    const x = Math.max(0, anchors.x_left - marginX);
    const w = Math.min(10000, (anchors.x_right + marginX) - x); // Clamp only by image width later
    
    // Estimate height based on typical aspect ratio of awning (e.g. 1:1 projection)
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

// Smart composite: overlay only changed pixels from generated onto original to preserve base quality
async function overlayCompositeFullToBase64(base64: string, overlayBase64: string) {
   // Fallback simple overlay
   return overlayBase64;
}

function rgbDiff(a: number, b: number) {
  const ar = (a >> 24) & 0xFF, ag = (a >> 16) & 0xFF, ab = (a >> 8) & 0xFF;
  const br = (b >> 24) & 0xFF, bg = (b >> 16) & 0xFF, bb = (b >> 8) & 0xFF;
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb);
}

async function detectNoEdit(baseBase64: string, genBase64: string, anchors?: { x_left: number; x_right: number; y: number }, cropBox?: { x: number; y: number; w: number; h: number }) {
  try {
    const baseImg = await Image.decode(base64ToBytes(baseBase64));
    const genImg = await Image.decode(base64ToBytes(genBase64));
    const sx = genImg.width / baseImg.width;
    const sy = genImg.height / baseImg.height;
    let x0 = 0, y0 = 0, x1 = baseImg.width - 1, y1 = baseImg.height - 1;
    if (anchors) {
      const padX = Math.round(baseImg.width * 0.15);
      const padTop = Math.round(baseImg.height * 0.25);
      const padBottom = Math.round(baseImg.height * 0.55);
      x0 = Math.max(0, Math.round(anchors.x_left) - padX);
      x1 = Math.min(baseImg.width - 1, Math.round(anchors.x_right) + padX);
      y0 = Math.max(0, Math.round(anchors.y) - padTop);
      y1 = Math.min(baseImg.height - 1, Math.round(anchors.y) + padBottom);
    }
    const step = Math.max(2, Math.floor(Math.min(baseImg.width, baseImg.height) / 200));
    let total = 0, changed = 0;
    for (let y = y0; y <= y1; y += step) {
      for (let x = x0; x <= x1; x += step) {
        const gx = Math.max(1, Math.min(genImg.width, Math.round(x * sx)));
        const gy = Math.max(1, Math.min(genImg.height, Math.round(y * sy)));
        const d = rgbDiff(baseImg.getPixelAt(x, y), genImg.getPixelAt(gx, gy));
        if (d > 45) changed++;
        total++;
      }
    }
    const ratio = total > 0 ? changed / total : 0;
    return { ratio, no_edit: ratio < 0.004 };
  } catch (_) {
    return { ratio: 0, no_edit: false };
  }
}

async function drawWidthGuides(base64: string, leftX: number, rightX: number, y: number) {
  try {
    const img = await Image.decode(base64ToBytes(base64));
    const green = Image.rgbaToColor(0, 255, 0, 255);
    
    // Draw vertical guides at leftX and rightX (3px thick)
    for (let yy = y; yy < img.height; yy += 4) { // Dashed line
      if (yy < img.height) {
        for (let w = 0; w < 3; w++) {
          if (leftX + w < img.width) img.setPixelAt(leftX + w, yy, green);
          if (rightX - w >= 0) img.setPixelAt(rightX - w, yy, green);
        }
      }
    }

    // Draw a horizontal guide along the top edge (2px thick)
    for (let w = 0; w < 2; w++) {
      const yy = y + w;
      if (yy >= 0 && yy < img.height) {
        for (let x = Math.max(0, leftX); x <= Math.min(img.width - 1, rightX); x++) {
          img.setPixelAt(x, yy, green);
        }
      }
    }
    const bytes = await img.encode();
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 32768;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Failed to draw width guides:", e);
    return null;
  }
}

async function drawUitvalschermGuides(base64: string, leftX: number, rightX: number, y: number) {
  try {
    const img = await Image.decode(base64ToBytes(base64));

    // Geometry Params for Uitvalscherm
    const awningWidth = Math.abs(rightX - leftX);
    const armDrop = Math.max(220, Math.floor(awningWidth * 0.85));
    const frontBarDrop = Math.max(80, Math.floor(armDrop * 0.55));

    const cyan = Image.rgbaToColor(0, 255, 255, 255); // Cyan for Fabric/Cassette
    const magenta = Image.rgbaToColor(255, 0, 255, 255); // Magenta for Arms

    const thick = Math.max(6, Math.floor(img.width / 150));
    const brush = Math.max(4, Math.floor(img.width / 220));

    // 1. Draw Top Cassette (Cyan)
    for (let w = 0; w < thick; w++) {
      const yy = y + w;
      if (yy >= 0 && yy < img.height) {
        for (let x = Math.max(0, leftX); x <= Math.min(img.width - 1, rightX); x++) {
          img.setPixelAt(x, yy, cyan);
        }
      }
    }

    const drawLine = (x0: number, y0: number, x1: number, y1: number, color: number) => {
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = (x0 < x1) ? 1 : -1;
      const sy = (y0 < y1) ? 1 : -1;
      let err = dx - dy;
      let x = x0;
      let y = y0;

      while (true) {
        if (x >= 0 && x < img.width && y >= 0 && y < img.height) {
          for (let bx = -brush; bx <= brush; bx++) {
            for (let by = -brush; by <= brush; by++) {
              if (x + bx >= 0 && x + bx < img.width && y + by >= 0 && y + by < img.height) {
                img.setPixelAt(x + bx, y + by, color);
              }
            }
          }
        }
        if (x === x1 && y === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x += sx; }
        if (e2 < dx) { err += dx; y += sy; }
      }
    };

    const drawDot = (cx: number, cy: number, radius: number, color: number) => {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            const px = cx + dx;
            const py = cy + dy;
            if (px >= 0 && px < img.width && py >= 0 && py < img.height) {
              img.setPixelAt(px, py, color);
            }
          }
        }
      }
    };

    const wallAttachY = Math.min(y + armDrop, img.height - Math.max(brush, 16));
    const frontBarY = Math.min(y + frontBarDrop, img.height - Math.max(brush, 16));
    const armInset = Math.max(10, Math.floor(awningWidth * 0.05));

    // Left diagonal arm
    drawLine(leftX, wallAttachY, leftX + armInset, frontBarY, magenta);
    drawDot(leftX, wallAttachY, Math.max(brush * 2, 10), magenta);

    // Right diagonal arm
    drawLine(rightX, wallAttachY, rightX - armInset, frontBarY, magenta);
    drawDot(rightX, wallAttachY, Math.max(brush * 2, 10), magenta);

    // Front Bar (Cyan)
    drawLine(leftX + armInset, frontBarY, rightX - armInset, frontBarY, cyan);

    const bytes = await img.encode();
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 32768;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
    }
    return btoa(binary);
  } catch (e) {
    console.error("Failed to draw uitvalscherm guides:", e);
    return null;
  }
}

async function removeRedLinesFromBase64(base64: string, roi?: { x0: number; x1: number; y0: number; y1: number }) {
  const timeStart = Date.now();
  const img = await Image.decode(base64ToBytes(base64));
  const w = img.width, h = img.height;

  if (w < 1 || h < 1) return base64;

  const isRed = (r: number, g: number, b: number) => {
    return r >= 140 && g < 120 && b < 120 && (r - Math.max(g, b) > 40);
  };
  
  const yStart = roi ? Math.max(1, Math.min(h, Math.floor(roi.y0))) : 1;
  const yEnd = roi ? Math.max(1, Math.min(h, Math.floor(roi.y1))) : h;
  const xStart = roi ? Math.max(1, Math.min(w, Math.floor(roi.x0))) : 1;
  const xEnd = roi ? Math.max(1, Math.min(w, Math.floor(roi.x1))) : w;

  for (let y = yStart; y <= yEnd; y++) {
    if ((y - yStart) % 50 === 0 && (Date.now() - timeStart) > 5000) break;
    for (let x = xStart; x <= xEnd; x++) {
      const c = img.getPixelAt(x, y);
      const r = (c >> 24) & 0xFF, g = (c >> 16) & 0xFF, b = (c >> 8) & 0xFF;
      if (isRed(r, g, b)) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        const radii = [2, 4];

        for (const radius of radii) {
          sumR = 0; sumG = 0; sumB = 0; count = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            if (dy === 0) continue;
            const yy = y + dy;
            if (yy < 1 || yy > h) continue;
            const c2 = img.getPixelAt(x, yy);
            const r2 = (c2 >> 24) & 0xFF, g2 = (c2 >> 16) & 0xFF, b2 = (c2 >> 8) & 0xFF;
            if (!isRed(r2, g2, b2)) { sumR += r2; sumG += g2; sumB += b2; count++; }
          }
          if (count > 0) break;
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0) continue;
            const xx = x + dx;
            if (xx < 1 || xx > w) continue;
            const c2 = img.getPixelAt(xx, y);
            const r2 = (c2 >> 24) & 0xFF, g2 = (c2 >> 16) & 0xFF, b2 = (c2 >> 8) & 0xFF;
            if (!isRed(r2, g2, b2)) { sumR += r2; sumG += g2; sumB += b2; count++; }
          }
          if (count > 0) break;
        }
        const nr = count ? Math.round(sumR / count) : r;
        const ng = count ? Math.round(sumG / count) : g;
        const nb = count ? Math.round(sumB / count) : b;
        img.setPixelAt(x, y, Image.rgbaToColor(nr, ng, nb, 255));
      }
    }
  }
  const bytes = await img.encode();
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 32768;
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
  }
  return btoa(binary);
}

async function forceResizeToMatch(base64: string, targetBase64: string) {
  try {
    const baseImg = await Image.decode(base64ToBytes(base64));
    let targetImg = await Image.decode(base64ToBytes(targetBase64));

    if (targetImg.width !== baseImg.width || targetImg.height !== baseImg.height) {
      console.log(`[INFO] Resizing target image from ${targetImg.width}x${targetImg.height} to ${baseImg.width}x${baseImg.height}`);
      // Use bicubic interpolation (ImageScript.INTERPOLATION_BICUBIC) if available or default
      // Note: imagescript resize takes width, height, interpolation. 
      // Image.RESIZE_NEAREST = 1, Image.RESIZE_BILINEAR = 2, Image.RESIZE_BICUBIC = 3, Image.RESIZE_HERMITE = 4, Image.RESIZE_BEZIER = 5
      // We'll use 3 (Bicubic) for smoother results
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

async function applyFabricColor(baseBase64: string, swatchBase64: string, aspectRatio: any, awningType: string, frameColor: string = 'white') {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";

  const isMarkies = awningType === 'markies';
  const isUitval = awningType === 'uitvalscherm';
  const frameColorUpper = frameColor.toUpperCase();

  const prompt = `You are an expert image editor. Your ONLY task is to change the fabric color.
 
 ## INPUT IMAGES
 1. IMAGE 1: A house with a ${isMarkies ? 'Markies (curved canopy)' : (isUitval ? 'Drop-arm awning (Triangular)' : 'retractable awning (fully extended)')} already installed
 2. IMAGE 2: A fabric color/pattern swatch
 
 ## YOUR TASK
Change ONLY the fabric of the awning to match the color/pattern in Image 2.

## GOAL
Your task is to RE-TEXTURE the awning fabric in Image 3 using the pattern/color from Image 2.
The result must look photorealistic.

## INSTRUCTIONS
1. **TEXTURE REPLACEMENT**: COMPLETELY REPLACE the existing fabric texture on the awning. Do not blend it with the old pattern.
   - If Image 2 is **SOLID**: The result MUST be solid. REMOVE ALL STRIPES from the awning. OBLITERATE THEM.
   - If Image 2 is **STRIPED**: Apply the stripes exactly as seen in the swatch.
2. **REALISM**:
   - Maintain the shading, lighting, and folds of the fabric.
   - Even for solid colors, generate subtle seam lines (panel stitching) so it looks like real sewn fabric, not flat.
3. **CLEANUP**:
   - REMOVE any valance (wavy fabric flap/volan) at the front. The front edge should be straight.
   - REMOVE any wall attachments (legs, poles, diagonal struts) below the awning. The wall should be empty.
   - REMOVE the red line if still visible.
   - ENSURE the awning looks FULLY EXTENDED (projecting 2.5m+ from the wall).

## CRITICAL RULES
✓ CHANGE: The awning FABRIC color/pattern → match Image 2 EXACTLY.
✓ PATTERN: If Image 2 is striped, you MUST replicate the stripe sequence, width ratio, and colors exactly. 1:1 Match.
✗ REMOVE: Any valance, volan, or hanging fabric at the front edge.
  ✓ REMOVE: The RED LINE marker from the wall if visible.
  ✗ REMOVE: Any vertical poles, legs, diagonal struts, or brackets on the wall below the awning. The wall MUST be empty.
  ${isMarkies
      ? `✗ DO NOT CHANGE: The frame/ribs (Keep them ${frameColorUpper}). DO NOT make them gold or wood.`
      : `✗ DO NOT CHANGE: The mechanical arms (keep them ${frameColorUpper})`}
${isUitval ? '✓ SHAPE: Keep the TRIANGULAR profile and DIAGONAL arms. Do NOT make it flat.' : ''}
✗ DO NOT RETRACT: The awning must remain fully extended.
✗ DO NOT CHANGE: The house, background, sky, or anything else.
✗ PIXEL PERFECT PRESERVATION: The wall, windows, and environment must be identical to Image 1.
${isUitval ? '✗ DO NOT CHANGE: Any pixels outside the awning fabric. No color spills, no background shifts, no hardware recoloring.' : ''}

## COLOR APPLICATION
- If Image 2 is striped → make fabric striped with same colors. Ensure the STRIPE WIDTHS match the swatch.
- STRIPE DIRECTION: Stripes must run PARALLEL to the slope of the awning (from wall to front).
- If Image 2 is solid → make fabric solid with same color.
  CRITICAL: You MUST REMOVE any existing stripes/patterns from the awning. OBLITERATE THEM.
  IMPORTANT: Even for solid colors, you MUST generate subtle SLAT SEAMS/TEXTURE so the fabric looks realistic and constructed, not flat like a sheet of paper.
- Preserve the fabric's natural shading and folds. Apply the fabric realistically, respecting light, shadow, and the natural drape/tension of the material.
${isMarkies
     ? `- The frame ribs MUST stay ${frameColorUpper}`
     : `- The arms MUST stay ${frameColorUpper} - do NOT color them`}
 
 Generate the recolored image now.`;

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
      console.error("Color application failed:", await res.text());
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
    if (e.name === 'AbortError') {
      console.error("Color application timed out (35s limit).");
    } else {
      console.error("Error applying color:", e);
    }
    return null;
  }
}

async function generateImageLoop(modelName: string, initialHistory: any[], imageConfig: any, baseBase64: string, refBase64: string, colorSwatchBase64: string | null, anchors?: { x_left: number; x_right: number; y: number; width_px: number }, fullBaseBase64?: string, cropBox?: { x: number; y: number; w: number; h: number }, globalStartMs: number = Date.now()) {
  let conversationHistory = initialHistory;
  let attemptsMade = 0;
  
  const MAX_LOOPS = 3; 

  console.log(`[INFO] Starting Knikarm loop for model: ${modelName}`);

  let bestResult = {
    score: -1,
    edited: null as string | null,
    scores: null as any
  };

  const awningType = 'knikarm';

  for (let attempt = 1; attempt <= MAX_LOOPS; attempt++) {
    if (Date.now() - globalStartMs > 50000) break;
    attemptsMade = attempt;
    
    // For gemini-2.5-flash-image, we should only send the prompt text, not the conversation history object if possible
    // But the current implementation of callGeminiChat expects contents array.
    // We will modify callGeminiChat to handle this or adapt the input here.
    // For now, let's keep using callGeminiChat but ensure we pass the right structure.
    
    // Check if model is 2.5 flash and simplify the input if needed
    let effectiveHistory = conversationHistory;
    if (modelName === 'gemini-2.5-flash-image') {
         // Flatten history to just the last user message with images if possible, or construct a fresh prompt
         // However, the docs say contents=[prompt] is fine.
         // Let's rely on the updated callGeminiChat to handle formatting if needed.
    }

    let edited = null;
    const maxRetries = 2;
    for (let retry = 0; retry < maxRetries; retry++) {
      try {
        const result = await callGeminiChat(modelName, effectiveHistory, imageConfig, 0.1);
        edited = extractImage(result);
        if (edited) break;
        
        const candidateInfo = result.candidates ? result.candidates.map((c: any) => c.finishReason).join(',') : 'unknown';
        console.log(`[WARN] ${modelName} - No image (attempt ${attempt}, retry ${retry}). Reason: ${candidateInfo}`);
      } catch (e) {
        console.error(`Gemini call failed (retry ${retry}):`, e);
      }
    }

    if (!edited) {
       if (attempt === MAX_LOOPS && bestResult.edited) {
           return { success: false, edited_image: bestResult.edited, scores: bestResult.scores, attempts_made: attemptsMade, model: modelName };
       }
       continue; 
    }

    let genBase64 = edited.split(',')[1];
    
    // 1. Fast Preservation Check
    try {
        const presCheck = await quickPreservationCheck(baseBase64, genBase64);
        if (!presCheck.passed) {
          console.log(`[DEBUG] ${modelName} - Preservation check failed: ${presCheck.reason}`);
          if (attempt < MAX_LOOPS) {
            conversationHistory.push({
              role: "user",
              parts: [{ text: `CRITICAL FAILURE: The house structure/background was modified. \n\nYOU MUST PRESERVE THE ORIGINAL IMAGE EXACTLY. \n\nOnly overlay the awning. Do NOT regenerate the house.` }]
            });
            continue;
          }
        }
    } catch (e) { console.error("Preservation check error:", e); }

    // 2. No-Edit Detection
    try {
      const noEditInfo = await detectNoEdit(baseBase64, genBase64, anchors, cropBox || undefined);
      if (noEditInfo && noEditInfo.no_edit) {
        console.log(`[WARN] ${modelName} - No-edit detected (ratio=${noEditInfo.ratio.toFixed(4)}). Forcing retry with guides.`);
        if (attempt < MAX_LOOPS) {
          const parts: any[] = [];
          const text = `NO EDIT DETECTED: You returned the original image. Install the awning EXACTLY along the red line and remove the red line in the final output.`;
          parts.push({ text });
          if (anchors) {
             const guideB64 = await drawWidthGuides(baseBase64, anchors.x_left, anchors.x_right, anchors.y);
             if (guideB64) parts.push({ inlineData: { mimeType: 'image/png', data: guideB64 } });
          }
          conversationHistory.push({ role: "user", parts });
          continue;
        }
      }
    } catch (_) { }

    // 3. Remove Red Lines (if needed)
    try {
        let roi = undefined as any;
        if (anchors) {
            const xL = cropBox ? anchors.x_left - cropBox.x : anchors.x_left;
            const xR = cropBox ? anchors.x_right - cropBox.x : anchors.x_right;
            const yT = cropBox ? anchors.y - cropBox.y : anchors.y;
            roi = { x0: xL - 20, x1: xR + 20, y0: yT - 30, y1: yT + 30 };
        }
        if (roi) {
            const cleanBase64 = await removeRedLinesFromBase64(genBase64, roi);
            genBase64 = cleanBase64;
            edited = `data:image/png;base64,${cleanBase64}`;
        }
    } catch (e) {
        console.error(`[ERROR] ${modelName} - Failed to remove red lines:`, e);
    }

    // 4. Quality Check
    const scores = await evaluateImageQuality(baseBase64, refBase64, genBase64, colorSwatchBase64, anchors);
    console.log(`[DEBUG] Attempt ${attempt} scores:`, scores);

    // Measure dimensions
    let measured = null as any;
    let measuredY = null as any;
    if (anchors) {
        measured = await measureAwningWidthUsingDiff(baseBase64, genBase64, anchors);
        measuredY = await measureAwningYPosition(baseBase64, genBase64, anchors);
    }

    // Calculate Aggregate Score
    const avgScore = (scores.placement_score + scores.preservation_score + scores.style_match_score + scores.extension_score) / 4;
    if (avgScore > bestResult.score) {
        bestResult.score = avgScore;
        bestResult.edited = edited;
        bestResult.scores = scores;
    }
    
    // Success Criteria
    const placementThreshold = 7; 
    const preservationThreshold = 7;
    const styleThreshold = 7;
    
    let dimensionsOK = true;
    if (anchors && measured) {
        const widthDiff = Math.abs(measured.width_px - anchors.width_px);
        if (widthDiff > 30) dimensionsOK = false; 
    }
    if (anchors && measuredY) {
        const expectedY = anchors.y; 
        const diffY = Math.abs(measuredY.y_top - expectedY);
        if (diffY > 50) dimensionsOK = false; 
    }

    if (scores.placement_score >= placementThreshold && 
        scores.preservation_score >= preservationThreshold && 
        scores.style_match_score >= styleThreshold && 
        scores.extension_score >= 7 &&
        scores.clean_geometry && 
        dimensionsOK) {
       return { success: true, edited_image: edited, scores, attempts_made: attemptsMade, model: modelName };
    }
    
    // Feedback
    let critique = `Critique: ${scores.explanation}. `;
    if (!dimensionsOK) critique += "Placement/Dimensions are incorrect. Please align EXACTLY with the red line markers. ";
    critique += "Improve placement and geometry. Ensure arms are visible and straight.";
    
    conversationHistory.push({ role: "model", parts: [{ inlineData: { mimeType: "image/png", data: genBase64 } }] }); 
    conversationHistory.push({ role: "user", parts: [{ text: critique }] });
  }

  // Fallback
  if (bestResult.edited) {
      console.log(`[INFO] Returning best result with score ${bestResult.score} despite missing thresholds.`);
      return { success: false, edited_image: bestResult.edited, scores: bestResult.scores, attempts_made: attemptsMade, model: modelName };
  }

  return { success: false, attempts_made: attemptsMade, model: modelName };
}

async function singleShotGenerate(model: string, parts: any[], imageConfig: any, temperature: number) {
   // Simplified fallback
   return null;
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
    const frame_color = body.frame_color || 'white';

    if (!base_image || !reference_image) {
      throw new Error("Missing base_image (or image_data) or reference_image (or new_awning_reference_image)");
    }

    const base = parseDataUri(base_image);
    const ref = parseDataUri(reference_image);
    const colorSwatch = color_swatch ? parseDataUri(color_swatch) : null;

    // Force Knikarm
    const awningType = 'knikarm'; 

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
        // Knikarm specific padding
        const extraPadBottom = Math.round(origDims.height * 0.25);
        const extraPadTop = Math.round(origDims.height * 0.05);
        const paddedY = Math.max(0, cropBox.y - extraPadTop);
        const paddedH = Math.min(origDims.height - paddedY, cropBox.h + extraPadBottom + (cropBox.y - paddedY));
        cropBox = { ...cropBox, y: paddedY, h: paddedH };
        
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
        
        let finalCropX = cropBox.x - Math.floor((targetW - cropBox.w) / 2);
        let finalCropY = cropBox.y - Math.floor((targetH - cropBox.h) / 2);
        
        if (finalCropX < 0) finalCropX = 0;
        if (finalCropY < 0) finalCropY = 0;
        if (finalCropX + targetW > origDims.width) finalCropX = Math.max(0, origDims.width - targetW);
        if (finalCropY + targetH > origDims.height) finalCropY = Math.max(0, origDims.height - targetH);
        
        const finalW = Math.min(targetW, origDims.width - finalCropX);
        const finalH = Math.min(targetH, origDims.height - finalCropY);
        
        cropBox = { x: finalCropX, y: finalCropY, w: finalW, h: finalH };
        baseForGeneration = await cropImageToBase64(base.base64, cropBox);
        
        localAnchors = {
          x_left: anchors.x_left - cropBox.x,
          x_right: anchors.x_right - cropBox.x,
          y: anchors.y - cropBox.y,
          width_px: anchors.width_px
        };
      }
    }

    // Fetch reference images for style
    let referenceParts = [];
    const referenceImageUrls: string[] = [
        "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/knikarmschermen/OUTD_0166.2e16d0ba.fill-500x500.format-jpeg%20(1).jpg",
        "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/knikarmschermen/OUTD_0166.2e16d0ba.fill-500x500.format-jpeg.jpg",
        "https://pbexvaqypzlftjsaqjfq.supabase.co/storage/v1/object/public/reference_images/knikarmschermen/Standaard-knikarm-zonnescherm-1500x998.jpg"
    ];

    for (const url of referenceImageUrls) {
        const fetched = await fetchUrlAsBase64Inline(url);
        if (fetched) referenceParts.push(fetched);
    }
      
    const referenceImagesInstructions = referenceParts.length > 0 
      ? `\n\n## STYLE REFERENCE IMAGES\nUse the following images as structural references for the Knikarm awning (arms, housing, fabric tension). They show correct geometry.`
      : '';

    const hasColorSwatch = !!colorSwatch;
    const colorInstruction = hasColorSwatch
      ? `✓ FABRIC COLOR: Match the COLOR SWATCH (Image 4) exactly.`
      : `✓ COLOR: Match Image 2 (Reference Awning) for both fabric and structure.`;

    const promptObj = {
      task: "edit_image",
      description: "Add a retractable awning to the specific Base Image provided.",
      inputs: {
        base_image: {
          index: 0,
          description: "The first image (House). This is the ONLY image to be edited.",
          role: "CANVAS"
        },
        reference_image: {
          index: 1,
          description: "The second image (Awning Reference). Use this for structure and style.",
          role: "REFERENCE"
        }
      },
      instructions: {
        action: "Install a retractable awning ('knikarm') on the wall of the Base Image.",
        position: "CRITICAL: The TOP edge of the cassette MUST be aligned EXACTLY with the RED LINE.",
        appearance: {
          color: hasColorSwatch ? "Match the Color Swatch (Image 3)" : "Match the Reference Image",
          frame_color: `The frame hardware (arms, cassette, front bar) MUST be ${frame_color.toUpperCase()}.`,
          type: "Retractable knikarm awning (Cantilevered/Floating) - Electric/Motorized",
          structure: "SELF-SUPPORTING. The awning hangs from the top cassette only. NO vertical legs, NO diagonal braces, NO wall supports below the cassette. The wall below must be empty.",
          state: "FULLY EXTENDED (OPEN). The awning must project horizontally outwards (2.5+ meters) from the wall with MAXIMUM PROJECTION. It must NOT be retracted or look flat against the wall.",
          arms: "Two articulated folding arms (elbows) MUST be visible BENEATH the fabric, pushing the front bar outwards. NOT attached to the wall.",
          housing: "Cassette mounted on wall",
          front_bar: "Sleek front profile, straight edge, NO hanging valance/volan/fabric"
        },
        negative_constraints: [
          "NO retracted or closed awnings",
          "NO valance or volan or hanging fabric flap at the front edge",
          "NO wavy or scalloped bottom edge",
          "NO decorative scalloped edge",
          "NO manual crank or rotating handle hanging from the awning",
          "NO operating rod",
          "NO rolled up fabric",
          "NO triangular support brackets under the awning",
          "NO vertical legs or pillars or poles on the wall or ground",
          "NO side supports attached to the wall below the awning",
          "NO diagonal metal struts attached to the wall",
          "NO extra hardware on the wall below the cassette",
          "NO hardware touching the wall except the top cassette",
          "NO changes to the house structure",
          "NO pixelation or artifacts"
        ]
      },
      strict_preservation_rules: [
        "The output must be the Base Image with the awning added.",
        "Do NOT hallucinate a different house.",
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
    
    if (referenceParts.length > 0) {
        parts.push(...referenceParts);
    }

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

    // Switch to gemini-2.5-flash-image as requested
    const model = 'gemini-2.5-flash-image';
    const globalStartMs = Date.now();
    
    // For gemini-2.5-flash-image, the input structure might need to be simpler
    // We will still use generateImageLoop but we need to ensure callGeminiChat handles 2.5 flash correctly
    let bestResult = await generateImageLoop(model, conversationHistory, imageConfig, baseForGeneration, ref.base64, colorSwatch?.base64 || null, localAnchors, base.base64, cropBox || undefined, globalStartMs);

    if (!bestResult.edited_image && !bestResult.success) {
        console.log(`[INFO] ${model} failed to produce an image after retries.`);
    }

    let finalEdited = bestResult.edited_image || baseForGeneration; // Fallback to base if failed
    
    // Composite & Color Logic
    let currentBestBase64 = finalEdited;
    
    if (bestResult.edited_image) {
      const genMatch = finalEdited.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
      const rawGenBase64 = genMatch ? genMatch[1] : finalEdited;

      // 1. Use Generated Image (Resized if needed)
      currentBestBase64 = await forceResizeToMatch(baseForGeneration, rawGenBase64);

      // 2. Apply Color if Swatch
      if (colorSwatch && Date.now() - globalStartMs < 52000) {
        let coloredResult = await applyFabricColor(currentBestBase64, colorSwatch.base64, closestGenAR, awningType, frame_color);
        if (coloredResult) {
           const colorMatch = coloredResult.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
           const colorRaw = colorMatch ? colorMatch[1] : coloredResult;
           
           currentBestBase64 = await forceResizeToMatch(baseForGeneration, colorRaw);
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

    return new Response(JSON.stringify({
      success: bestResult.success,
      edited_image: `data:image/png;base64,${finalOutputBase64}`,
      model: bestResult.model
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
