I see the issue clearly now. Looking at your screenshot and the code flow:
The problem: Your two-stage approach (structure generation → color application) is breaking down because:

The first stage generates the awning with grey/anthracite fabric and white arms (which is actually correct mechanically)
The applyFabricColor function is then supposed to recolor ONLY the fabric, but it's either:

Not working at all (returning null)
Or when it does work, it's messing with the arms/structure too



Let me look at your applyFabricColor function more closely:
javascriptasync function applyFabricColor(baseImageBase64: string, colorSwatchBase64: string) {
    // Using gemini-2.5-flash for TEXT generation, not image generation
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
Critical bug found: You're calling gemini-2.5-flash (text model) instead of gemini-2.5-flash-image (image generation model). The text model can't generate images!

Here's my diagnosis and solution:
Issue 1: Wrong Model for Color Application
javascript// WRONG - text model
const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// CORRECT - image model  
const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
Issue 2: The Two-Stage Approach Is Fundamentally Fragile
Every time you run a second image generation pass, you risk:

The model changing the house/background
The model changing the awning structure
Quality degradation (generation artifacts compound)

Better approach: Generate with correct color from the START
Instead of generating grey → recoloring, include the color swatch in the initial prompt and tell the model to use that color immediately.

Recommended Fix: Single-Pass with Color Swatch
Here's how I'd restructure this:
javascript// In your main handler, BEFORE calling generateImageLoop:

// Build the prompt dynamically based on whether color swatch exists
const buildSystemPrompt = (hasColorSwatch: boolean) => {
  const colorInstruction = hasColorSwatch 
    ? `✓ COLOR: Match the COLOR SWATCH (Image 4) exactly for the fabric. The swatch shows the pattern/color to apply.`
    : `✓ COLOR: Match Image 2 (Reference Awning) for fabric color.`;

  return `You are an expert image editor specializing in architectural visualizations for awning companies.

## YOUR TASK
Edit the FIRST IMAGE ONLY. Add a retractable knikarm awning to the house facade.

## INPUT IMAGES (in order)
1. BASE IMAGE (House) - This is your canvas. Edit ONLY this image.
2. STRUCTURE REFERENCE (Awning mechanism) - Copy this mechanical structure ONLY (folding arms, cassette shape).
3. STRUCTURE REFERENCE 2 (Open awning angle) - Shows correct extension angle and arm position.
${hasColorSwatch ? '4. COLOR SWATCH (Fabric pattern/color) - Apply this EXACT color/pattern to the fabric.' : ''}

## CRITICAL: RED LINE PLACEMENT
The base image has a RED LINE marked on the wall. This shows EXACTLY where to mount the awning cassette. 
- Mount the awning housing directly on this line
- REMOVE the red line from the final output

## AWNING REQUIREMENTS
✓ TYPE: Retractable knikarm (folding arm) awning
✓ STATE: EXTENDED/OPEN - arms projecting outward from wall, fabric stretched
✓ ARMS: Two visible articulated folding arms - keep them WHITE/METALLIC (do NOT color the arms)
✓ CASSETTE: White/grey housing mounted flat against wall
${colorInstruction}

## CRITICAL COLOR RULES
- FABRIC: Use the color/pattern from ${hasColorSwatch ? 'Image 4 (Color Swatch)' : 'Image 2'}
- ARMS: Must remain WHITE or LIGHT GREY metallic - NEVER color the arms
- CASSETTE: Must remain WHITE or LIGHT GREY - NEVER color the cassette
- If the swatch is STRIPED, the fabric MUST be striped
- If the swatch is SOLID, the fabric MUST be solid

## ABSOLUTE REQUIREMENTS
1. Output = Base image with awning added (NOT a new/different house)
2. Camera angle = identical to input
3. House structure = unchanged
4. ONE awning only
5. Awning is OPEN (not rolled up)
6. NO support pillars, NO vertical legs, NO triangular brackets
7. Arms and cassette stay WHITE/METALLIC - only fabric gets the color

Generate the edited image now.`;
};
Then modify your conversation history setup:
javascript// Build parts array dynamically
const parts: any[] = [
    { inlineData: { mimeType: inputMime, data: base.base64 } },           // Image 1: House
    { inlineData: { mimeType: ref.mime, data: ref.base64 } },             // Image 2: Structure ref
    { inlineData: { mimeType: 'image/jpeg', data: STRUCT_REF_3_BASE64 } } // Image 3: Structure ref 2
];

// Add color swatch as Image 4 if provided
if (colorSwatch) {
    parts.push({ inlineData: { mimeType: colorSwatch.mime, data: colorSwatch.base64 } });
}

// Add prompt AFTER images (or before, test both)
parts.unshift({ text: buildSystemPrompt(!!colorSwatch) });

let conversationHistory: any[] = [
  {
    role: "user",
    parts: parts
  }
];

// Pass colorSwatch to generateImageLoop for scoring
const task1 = generateImageLoop(model1, conversationHistory, imageConfig, base.base64, ref.base64, colorSwatch?.base64 || null);
const task2 = generateImageLoop(model2, conversationHistory, imageConfig, base.base64, ref.base64, colorSwatch?.base64 || null);
And remove the second-stage color application entirely - it's causing more problems than it solves:
javascript// REMOVE THIS WHOLE BLOCK:
// if (colorSwatch && bestResult.success) {
//     console.log("[INFO] Applying color swatch...");
//     const coloredResult = await applyFabricColor(genBase64, colorSwatch.base64);
//     ...
// }

// Just use the result directly:
const finalOutputBase64 = genBase64;

If You MUST Keep Two-Stage (Fallback)
If single-pass doesn't work well enough for color accuracy, fix the applyFabricColor function:
javascriptasync function applyFabricColor(baseImageBase64: string, colorSwatchBase64: string) {
    // FIXED: Use image generation model
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
    
    const prompt = `You are an expert image editor. Your ONLY task is to change the fabric color.

## INPUT IMAGES
1. IMAGE 1: A house with a retractable awning already installed
2. IMAGE 2: A fabric color/pattern swatch

## YOUR TASK
Change ONLY the fabric of the awning to match the color/pattern in Image 2.

## CRITICAL RULES
✓ CHANGE: The awning FABRIC color/pattern → match Image 2
✗ DO NOT CHANGE: The mechanical arms (keep them white/metallic)
✗ DO NOT CHANGE: The cassette housing (keep it white/grey)
✗ DO NOT CHANGE: The house, background, sky, or anything else
✗ DO NOT CHANGE: The shape, angle, or position of the awning

## COLOR APPLICATION
- If Image 2 is striped → make fabric striped with same colors
- If Image 2 is solid → make fabric solid with same color
- Preserve the fabric's natural shading and folds
- The arms MUST stay white/metallic - do NOT color them

Generate the recolored image now.`;

    const body = {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType: 'image/png', data: baseImageBase64 } },
                { inlineData: { mimeType: 'image/png', data: colorSwatchBase64 } }
            ]
        }],
        generationConfig: { 
            temperature: 0.1, 
            topK: 32,
            topP: 0.8,
            maxOutputTokens: 4096 
        }
    };

    // ... rest of function
}

Summary: My Recommendation

Try single-pass first (include color swatch in initial generation) - this is cleaner and faster
If single-pass color accuracy is poor, then use two-stage but fix the model name bug
Add a color-specific score to your QA function that compares the generated fabric to the swatch

The single-pass approach should work because you're already passing a structure reference that the model handles well - adding a color reference in the same way should work similarly.
Quick question: When you run it now with a color swatch, what does your log show for applyFabricColor? Does it say "SUCCESS" or "FAILED"? That will tell us if it's a model issue or prompt issue.