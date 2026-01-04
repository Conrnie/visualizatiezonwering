const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
import { Image } from "https://deno.land/x/imagescript@1.2.15/mod.ts";

export const STRUCT_REF_3_BASE64 = "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";

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

// Updated to support chat history
async function callGeminiChat(model: string, contents: any[], imageConfig?: any, temperature: number = 0.1) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body: any = {
    contents: contents,
    generationConfig: {
      temperature: temperature,
      topK: 32, // Increased from 16 to give creative room
      topP: 0.8,
      maxOutputTokens: 4096
    }
  };
  
  if (imageConfig) {
    body.generationConfig.imageConfig = imageConfig;
  }

  console.log(`[DEBUG] calling Gemini Chat with model ${model}, history length: ${contents.length}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout per call

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
      throw new Error(`Gemini request timed out after 60s`);
    }
    throw error;
  }
}

function extractImage(result: any) {
  let data = null;
  if (result.candidates && result.candidates[0]) {
    const c = result.candidates[0];
    if (c.content && c.content.parts) {
      for (const p of c.content.parts) {
        const img = p.inlineData || p.inline_data;
        if (img && img.data) {
          let mime = img.mimeType || img.mime_type || 'image/png';
          if (mime === 'image/jpg') mime = 'image/jpeg';
          if (!mime.startsWith('image/')) mime = 'image/png';
          data = `data:${mime};base64,${img.data}`;
          break;
        }
      }
    }
  }
  return data;
}

// Quick preservation check to fail fast
async function quickPreservationCheck(originalBase64: string, generatedBase64: string) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const prompt = `Compare these two images. Is Image 2 the SAME HOUSE from the SAME ANGLE as Image 1, with only an awning added?

Answer with ONLY: YES or NO

If NO, briefly explain what changed (different house, different angle, cropped, etc.)`;

  const body = {
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

// Unified Quality Scoring Function
async function evaluateImageQuality(originalBase64: string, referenceBase64: string, generatedBase64: string) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  
  const promptText = `
  You are a strict Quality Assurance agent for an awning visualization tool.
  Compare the Generated Image (last image) with the Original Base Image (first image) and the Reference Awning (second image).
  
  Score the following 5 criteria on a scale from 0 to 10:
  
  1. Placement (0-10): 
     - Is the awning mounted on the wall exactly where requested? 
     - It should be attached to the facade, above the window/door.
  
  2. Original Input Image (Preservation) (0-10):
     - Is the house structure, windows, and background (sky, plants, neighbors) IDENTICAL to the Original Base Image?
     - The ONLY change allowed is the addition of the awning.
     - If the house looks different, or the angle changed, this score must be 0.
  
  3. No Red Line (0-10):
     - The original image might have had a red marker line. Is this line completely removed in the generated image?
     - 10 = No red line visible. 
     - 0 = Red line is still clearly visible.
  
  4. Awning Extension & Structure (0-10):
     - Is the awning EXTENDED (open) projecting outwards from the wall? 
     - It MUST NOT be rolled up or retracted (closed).
     - Does it have visible articulated folding arms ('knikarmen')? 
     - 0 = Awning is closed/retracted (just a cassette on the wall) or flat like a canopy.
     - 10 = Fully extended with visible arms and correct depth.
  
  5. Color Match (0-10):
     - Does the fabric color match the Reference Awning (dark grey/black)?
     - 10 = Perfect color match.
     - 0 = Wrong color (e.g. red, blue, white, or striped if reference is solid).
  
  Provide a JSON response:
  {
    "placement_score": number,
    "preservation_score": number,
    "no_red_line_score": number,
    "extension_score": number,
    "color_score": number,
    "explanation": "concise explanation of failures if any"
  }
  `;

  const body = {
    contents: [{
      parts: [
        { text: promptText },
        { inlineData: { mimeType: 'image/png', data: originalBase64 } },
        { inlineData: { mimeType: 'image/png', data: referenceBase64 } },
        { inlineData: { mimeType: 'image/jpeg', data: STRUCT_REF_3_BASE64 } },
        { inlineData: { mimeType: 'image/png', data: generatedBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.1, topK: 16, topP: 0.8, maxOutputTokens: 1024, responseMimeType: "application/json" }
  };
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
      const res = await fetch(`${url}?key=${GEMINI_API_KEY}`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body),
          signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, explanation: "Verification check failed: " + res.statusText };
      
      const j = await res.json();
      let parsed = { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, explanation: "Could not parse response" };
      
      if (j.candidates && j.candidates[0]) {
        const c = j.candidates[0];
        if (c.content && c.content.parts) {
          for (const p of c.content.parts) {
            if (p.text) {
              const m = p.text.match(/\{[\s\S]*\}/);
              if (m) { 
                  try { 
                      parsed = JSON.parse(m[0]); 
                  } catch (e) {
                      console.error(`[ERROR] JSON parse failed`, e);
                  } 
              }
              break;
            }
          }
        }
      }
      return parsed;
  } catch (e) {
      clearTimeout(timeoutId);
      return { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, explanation: "Error during verification: " + (e as Error).message };
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
  } catch (_) {
    return { width: 0, height: 0 };
  }
}

async function generateImageLoop(modelName: string, initialHistory: any[], imageConfig: any, baseBase64: string, refBase64: string) {
    let conversationHistory = JSON.parse(JSON.stringify(initialHistory));
    let finalEdited = null;
    let finalScores = { placement_score: 0, preservation_score: 0, no_red_line_score: 0, extension_score: 0, color_score: 0, explanation: "" };
    let attemptsMade = 0;
    
    const MAX_LOOPS = 3;
    const startTime = Date.now();
    
    console.log(`[INFO] Starting loop for model: ${modelName}`);

    for (let attempt = 1; attempt <= MAX_LOOPS; attempt++) {
        if (Date.now() - startTime > 60000) {
            console.log(`[WARN] Time limit approaching for ${modelName}, stopping loops.`);
            break;
        }

        attemptsMade = attempt;
        console.log(`[DEBUG] ${modelName} - Attempt ${attempt}...`);
        
        let edited = null;
        let responseCandidates = null;
        
        for (let retry = 0; retry < 2; retry++) {
            try {
                // Higher temperature for retries
                const temp = attempt > 1 ? 0.3 : 0.1;
                const result = await callGeminiChat(modelName, conversationHistory, imageConfig, temp);
                edited = extractImage(result);
                responseCandidates = result.candidates;
                
                if (edited) break;
                
                const candidateInfo = result.candidates ? 
                    result.candidates.map((c: any) => c.finishReason || 'unknown').join(',') : 'no candidates';
                console.log(`[WARN] ${modelName} - No image (attempt ${attempt}, retry ${retry}). Reason: ${candidateInfo}`);
                
                if (candidateInfo.includes('OTHER') || candidateInfo.includes('SAFETY')) break;
                console.log(`[INFO] ${modelName} - Retrying...`);
            } catch (e) {
                console.error(`[ERROR] ${modelName} - API call failed:`, e);
            }
        }
        
        if (!edited) {
             console.error(`[ERROR] ${modelName} - Failed to generate image on attempt ${attempt}.`);
             if (finalEdited) break; 
             continue;
        }
        
        let candidateImage = edited;
        const genMatch = candidateImage.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
        const genBase64 = genMatch ? genMatch[1] : candidateImage;
        
        // Fast preservation check first
        const presCheck = await quickPreservationCheck(baseBase64, genBase64);
        if (!presCheck.passed) {
             console.log(`[DEBUG] ${modelName} - Preservation check failed: ${presCheck.reason}`);
             if (attempt < MAX_LOOPS) {
                 conversationHistory.push({
                    role: "user",
                    parts: [{ text: `Previous attempt FAILED preservation check. The house looked different. \n\nFIX: Output shows different house/angle. Use EXACT input image as base. \n\nGenerate corrected image.` }]
                 });
                 continue; 
             }
        }

        const scores = await evaluateImageQuality(baseBase64, refBase64, genBase64);
        console.log(`[DEBUG] ${modelName} - Scores: Place=${scores.placement_score}, Pres=${scores.preservation_score}, Ext=${scores.extension_score}, Color=${scores.color_score}`);
        
        finalEdited = candidateImage;
        finalScores = scores;
        
        const isGoodEnough = 
            scores.placement_score >= 8 && 
            scores.preservation_score >= 9 && 
            scores.no_red_line_score >= 9 && 
            scores.extension_score >= 8 &&
            scores.color_score >= 8;

        if (isGoodEnough) {
            console.log(`[DEBUG] ${modelName} - High scores achieved!`);
            break;
        } else {
            if (attempt < MAX_LOOPS) {
                if (responseCandidates && responseCandidates[0] && responseCandidates[0].content) {
                     const modelContent = responseCandidates[0].content;
                     modelContent.role = 'model';
                     conversationHistory.push(modelContent);
                }

                // Terse, actionable feedback
                let corrections = [];
                if (scores.preservation_score < 9) {
                  corrections.push("FIX: Output shows different house/angle. Use EXACT input image as base.");
                }
                if (scores.placement_score < 8) {
                  corrections.push("FIX: Awning not at red line position. Mount cassette ON the red marking.");
                }
                if (scores.no_red_line_score < 9) {
                  corrections.push("FIX: Red line still visible. Completely remove it.");
                }
                if (scores.extension_score < 8) {
                  corrections.push("FIX: Awning appears closed/flat. Show EXTENDED awning with arms projecting OUTWARD.");
                }
                if (scores.color_score < 8) {
                  corrections.push("FIX: Wrong fabric color. Match dark grey from reference image 2.");
                }

                const feedbackMessage = `Previous attempt had issues:
${corrections.join('\n')}

Generate corrected image. All other requirements remain the same.`;

                conversationHistory.push({
                    role: "user",
                    parts: [{ text: feedbackMessage }]
                });
            }
        }
    }
    
    if (!finalEdited) {
        console.error(`[ERROR] ${modelName} - Failed to generate image after retries`);
        return { 
            success: false, 
            edited_image: null, 
            scores: finalScores, 
            model: modelName, 
            attempts_made: attemptsMade 
        };
    }
    
    return { 
        success: (finalScores.preservation_score >= 9), 
        edited_image: finalEdited, 
        scores: finalScores, 
        model: modelName, 
        attempts_made: attemptsMade 
    };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.get('ping') === 'true') {
      return new Response(JSON.stringify({ message: 'pong', timestamp: Date.now() }), { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
  }

  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json();
    const { image_data, awning_reference_image, model } = body;
    if (!image_data || !awning_reference_image) {
      return new Response(JSON.stringify({ error: 'Missing required parameters: image_data, awning_reference_image' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const base = parseDataUri(image_data);
    const ref = parseDataUri(awning_reference_image);

    // Calculate aspect ratio
    const origDims = await getImageDimensionsFromBase64(base.base64);
    
    // Determine closest supported aspect ratio (same logic as v1)
    const supportedARs = [
      { str: "1:1", val: 1/1 },
      { str: "2:3", val: 2/3 },
      { str: "3:2", val: 3/2 },
      { str: "3:4", val: 3/4 },
      { str: "4:3", val: 4/3 },
      { str: "4:5", val: 4/5 },
      { str: "5:4", val: 5/4 },
      { str: "9:16", val: 9/16 },
      { str: "16:9", val: 16/9 },
      { str: "21:9", val: 21/9 }
    ];
    
    const inputAR = origDims.width > 0 ? (origDims.width / origDims.height) : 1;
    let closestAR = "1:1";
    let minDiff = Infinity;
    
    for (const ar of supportedARs) {
      const diff = Math.abs(inputAR - ar.val);
      if (diff < minDiff) {
        minDiff = diff;
        closestAR = ar.str;
      }
    }
    console.log(`[DEBUG] Input AR: ${inputAR.toFixed(3)}, Closest supported AR: ${closestAR}`);

    const inputMime = base.mime || 'image/png';

    // Natural Language Prompt (Optimized per Claude)
    const systemPrompt = `You are an expert image editor specializing in architectural visualizations for awning companies.

## YOUR TASK
Edit the FIRST IMAGE ONLY. Add a retractable knikarm awning to the house facade.

## INPUT IMAGES (in order)
1. BASE IMAGE (House) - This is your canvas. Edit ONLY this image.
2. COLOR REFERENCE (Awning) - Match this fabric color and texture exactly.
3. STRUCTURE REFERENCE (Open awning) - Copy this mechanical structure (folding arms extending outward).

## CRITICAL: RED LINE PLACEMENT
The base image has a RED LINE marked on the wall. This shows EXACTLY where to mount the awning cassette. 
- Mount the awning housing directly on this line
- REMOVE the red line from the final output
- If you can't find a red line, place the awning above the main window/door

## AWNING REQUIREMENTS
✓ TYPE: Retractable knikarm (folding arm) awning
✓ STATE: EXTENDED/OPEN - arms projecting outward from wall, fabric stretched over them
✓ ARMS: Two visible articulated folding arms (knikarmen) 
✓ CASSETTE: Housing mounted flat against wall at the red line
✓ DEPTH: Should project 2-3 meters outward from wall
✓ COLOR: Match Image 2 exactly (dark grey/anthracite fabric)

## ABSOLUTE REQUIREMENTS - MUST ALL BE TRUE
1. Output = Base image with awning added (NOT a new/different house)
2. Camera angle = identical to input
3. House structure = unchanged (windows, doors, walls, plants, neighbors)
4. ONE awning only (no duplicates, no stacked awnings)
5. Awning is OPEN (not rolled up, not flat against wall)
6. NO support pillars, NO vertical legs, NO triangular brackets

## WHAT FAILURE LOOKS LIKE (AVOID THESE)
✗ Generating a different house or camera angle
✗ Awning rolled up/retracted (just a tube on the wall)
✗ Flat canopy parallel to wall (should angle downward)
✗ Multiple awnings
✗ Red line still visible
✗ Wrong fabric color

Generate the edited image now.`;

    // Initialize Conversation History (Chat Mode)
    // Turn 1: User sends images and initial prompt
    let conversationHistory: any[] = [
      {
        role: "user",
        parts: [
            { text: systemPrompt },
            { inlineData: { mimeType: inputMime, data: base.base64 } },
            { inlineData: { mimeType: ref.mime, data: ref.base64 } },
            { inlineData: { mimeType: 'image/jpeg', data: STRUCT_REF_3_BASE64 } }
        ]
      }
    ];

    const imageConfig: any = {
      aspectRatio: closestAR
    };

    // Parallel Execution Strategy
    const model1 = 'gemini-2.5-flash-image';
    const model2 = 'gemini-3-pro-image-preview'; // Always force 3.0 Pro for the second path

    console.log(`[INFO] Starting parallel generation with ${model1} and ${model2}`);

    const task1 = generateImageLoop(model1, conversationHistory, imageConfig, base.base64, ref.base64);
    const task2 = generateImageLoop(model2, conversationHistory, imageConfig, base.base64, ref.base64);
    
    // Allow more time for parallel execution
    const timeoutPromise = new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Global timeout reached')), 115000));

    let bestResult;
    try {
        // Use Promise.any to get the first SUCCESSFUL result
        // We wrap the tasks to reject if success is false so Promise.any keeps waiting
        const ensureSuccess = async (task: Promise<any>) => {
            const res = await task;
            if (!res.success) throw res; // Reject with the result object
            return res;
        };

        // Promise.any resolves as soon as ONE task succeeds.
        // It rejects (AggregateError) only if ALL tasks fail (or return success=false).
        bestResult = await Promise.race([
            Promise.any([ensureSuccess(task1), ensureSuccess(task2)]),
            timeoutPromise
        ]);

    } catch (e: any) {
        // If it's an AggregateError, it means NO model succeeded strictly.
        // In that case, we need to find the "best of the failed" results.
        if (e instanceof AggregateError || (e.errors && Array.isArray(e.errors))) {
             console.warn('[WARN] No models met strict success criteria. Checking for fallback results...');
             
             // We need to wait for all to settle to compare them, or check the rejection reasons
             // But Promise.any already waited for all to reject.
             // The rejection reasons (e.errors) contain the result objects!
             const results = e.errors;
             
             const validResults = results.filter((r: any) => r && r.scores); // Check if it's a valid result object
             
             if (validResults.length > 0) {
                 console.warn('[WARN] Picking best available result from failures.');
                 bestResult = validResults.reduce((best: any, current: any) => {
                     return current.scores.preservation_score > best.scores.preservation_score ? current : best;
                 });
             } else {
                 console.error('[ERROR] All models failed completely (no valid result object).');
                 throw new Error('All models failed to generate a valid image.');
             }
        } else {
             console.error('[ERROR] Global timeout or other error:', e);
             throw new Error('Generation timed out or failed. Please try again.');
        }
    }
    
    console.log(`[INFO] Winner: ${bestResult.model} with scores:`, bestResult.scores);

    // Calculate final dimensions for reporting
    const finalEdited = bestResult.edited_image;
    const genMatch = finalEdited.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/i);
    const genBase64 = genMatch ? genMatch[1] : finalEdited;
    const genDims = await getImageDimensionsFromBase64(genBase64);

    return new Response(JSON.stringify({ 
        success: true, 
        edited_image: finalEdited, 
        scores: bestResult.scores,
        model: bestResult.model, 
        original_dims: origDims, 
        generated_dims: genDims,
        attempts_made: bestResult.attempts_made,
        mode: "chat_v2_1_optimized",
        candidates_count: 1
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
