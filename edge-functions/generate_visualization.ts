// @ts-ignore
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Declare Deno to silence linter errors
declare const Deno: any;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: any) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const { record_id, image, prompt_config } = await req.json()
    
    if (!image || !record_id) {
      throw new Error('Missing image or record_id')
    }

    // Init Supabase & Env
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    if (!supabaseUrl || !supabaseKey || !geminiApiKey) {
      throw new Error('Missing environment variables')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Process Reference Images
    // We ignore reference images to ensure strict editing mode (avoiding random generation)
    const modelName = prompt_config?.model || 'zonnescherm'
    const colorName = prompt_config?.color || 'standaard'
    // const modelImageUrl = prompt_config?.model_image
    // const colorImageUrl = prompt_config?.color_image

    // 2. Construct Prompt (Adopting logic from english_priceindication.ts)
    
    const awningDescriptions: Record<string, string> = {
      "knikarm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING WITH HORIZONTAL EXTENDING METAL ARMS",
      "knikarmscherm": "MANDATORY KNIKARM RETRACTABLE FOLDING ARM AWNING WITH HORIZONTAL EXTENDING METAL ARMS",
      "uitvalarm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
      "uitvalscherm": "MANDATORY UITVALARM VERTICAL DROP ARM AWNING",
      "markiezen": "MANDATORY MARKIEZEN TRADITIONAL FIXED CANOPY AWNING (traditional Dutch fixed canopy awning with a curved, basket-like profile, non-retractable, mounted above windows/doors)",
      "canopy": "MANDATORY CANOPY FIXED CANOPY AWNING (modern rectangular or wedge canopy, rigid frame, non-retractable, mounted above windows/doors)"
    };

    // Determine effective awning type
    let effectiveAwningType = modelName.toLowerCase();
    if (!awningDescriptions[effectiveAwningType]) {
        if (effectiveAwningType.includes('knikarm')) effectiveAwningType = 'knikarm';
        else if (effectiveAwningType.includes('uitval')) effectiveAwningType = 'uitvalarm';
        else if (effectiveAwningType.includes('markies') || effectiveAwningType.includes('markiezen')) effectiveAwningType = 'markiezen';
        else if (effectiveAwningType.includes('canopy')) effectiveAwningType = 'canopy';
    }

    const awningDescription = awningDescriptions[effectiveAwningType] || effectiveAwningType;

    // Color Description
    let colorDescription = "";
    if (colorName && colorName !== "standaard" && colorName !== "default") {
        colorDescription = ` The fabric must be ${colorName}.`;
    }

    // Model Description
    let modelDescription = "";
    if (effectiveAwningType === "knikarm" || effectiveAwningType === "knikarmscherm") {
      modelDescription = `MANDATORY KNIKARM SPECIFICATIONS: Use modern metal folding arms that extend horizontally from a wall-mounted cassette. The arms must be clearly visible, articulated (with joints), and extend outward from the wall. Include a slim rectangular cassette mounted to the wall. Arms/frame may be dark grey or black. ABSOLUTELY NO vertical wall-mounted support arms/brackets and NO ground-support posts or poles. This is a retractable folding arm awning - NOT a fixed canopy or markiezen.${colorDescription}`;
    } else if (effectiveAwningType === "uitvalarm" || effectiveAwningType === "uitvalscherm") {
      modelDescription = `Use a compact wall-mounted cassette and two SHORT angled support arms (50–80 cm). Hardware should be minimal and light-coloured (white/grey); avoid heavy black bars.${colorDescription}`;
    } else if (effectiveAwningType === "markiezen") {
      modelDescription = `Use a traditional fixed canopy: a curved or wedge-shaped fabric roof with side cheeks and a front fabric valance. Frame is concealed or painted to match; NO folding arms, NO front roller/cassette, and NO black metal front bar.${colorDescription}`;
    } else {
      modelDescription = colorDescription;
    }

    // Negative Prompting
    let negativePrompting = "";
    if (effectiveAwningType === "markiezen") {
        negativePrompting = "CRITICAL: Do NOT add any retractable arms, front roller, cassette, or black metal front bar. NO knikarm hardware. This must be a traditional fixed canopy with curved/wedge shape, side cheeks, and a fabric valance.";
    } else if (effectiveAwningType === "canopy") {
        negativePrompting = "CRITICAL: Do NOT add any retractable folding arms, front roller, or wall-mounted cassette. NO heavy black metal front bar. Keep the frame minimal and clean. This must be a modern fixed canopy (rectangular or wedge).";
    } else if (effectiveAwningType === "knikarm") {
        negativePrompting = "CRITICAL REJECTION RULES: ABSOLUTELY DO NOT create any of these wrong awning types: 1) NO traditional fixed canopy awnings (markiezen) with curved tops, side cheeks, or fabric valances - this is NOT a knikarm, 2) NO vertical drop arm awnings (uitvalarm) that hang down like window shades, 3) NO horizontal cassette awnings without folding arms, 4) NO half-markiezen or semi-fixed canopies, 5) NO wedge-shaped or curved canopy structures, 6) NO vertical wall-mounted support arms or brackets, and NO ground-support posts/poles under the awning. MANDATORY: ONLY create a retractable folding arm awning (knikarm) with horizontal extending metal arms that fold out from a wall-mounted cassette. The arms must be clearly visible and extend horizontally outward from the wall.";
    } else if (effectiveAwningType === "uitvalarm") {
        negativePrompting = "CRITICAL: ABSOLUTELY DO NOT create any horizontal canopy, horizontal awning, or outward-projecting shade structure. DO NOT create a retractable folding arm awning (knikarm) with horizontal extending arms. DO NOT create a traditional fixed canopy (markiezen) that projects outward. ONLY create a vertical drop arm awning that hangs down from the wall like a window shade.";
    }

    // Strict Editing Template
    let systemPrompt = `
      Using the provided image, add a ${awningDescription} to this house. 
      
      LOCATION: The user has drawn a RED LINE on the wall. Place the awning EXACTLY along this red line. The red line indicates the mounting position. REMOVE the red line from the final result.
      
      SPECIFICATIONS:
      - Keep everything else in the image exactly the same, preserving the original style, lighting, and composition.
      - ${modelDescription}
      - The awning should look professionally installed and architecturally appropriate.
      - Shadows: Cast realistic shadows from the awning onto the wall and windows.
      
      NEGATIVE PROMPTS:
      ${negativePrompting}
      
      DO NOT create a new house. DO NOT generate a different building.
      PRESERVE every pixel of the original house except where the awning is added.
      ABSOLUTELY DO NOT include any manual crank handle (slingerarm) or visible operating rod.
    `;

    // 3. Build Gemini Payload
    // Using Gemini 3 Pro Image Preview (Nano Banana Pro) as requested
    const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent"
    
    const base64Image = image.replace(/^data:image\/[a-z]+;base64,/, '')

    // Order: Base Image -> Text Prompt (Strict Single Image Editing)
    const parts: any[] = [
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
        { text: systemPrompt }
    ];

    const payload = {
      contents: [{
        parts: parts
      }],
      generationConfig: {
        temperature: 0.3, // Lower temperature for more faithful editing
        topK: 32,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseModalities: ["IMAGE"]
      }
    }

    console.log('Sending request to Gemini...')
    console.log(`Prompt: ${systemPrompt.substring(0, 200)}...`)

    const response = await fetch(`${GEMINI_URL}?key=${geminiApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Gemini API Error:', errText)
      throw new Error(`Gemini API failed: ${response.statusText} - ${errText}`)
    }

    const result = await response.json()
    
    // 4. Extract Image
    let generatedBase64 = null
    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        const inlineData = part.inlineData || part.inline_data
        if (inlineData && inlineData.data) {
           generatedBase64 = inlineData.data
           break
        }
      }
    }

    if (!generatedBase64) {
      console.error('No image in Gemini response:', JSON.stringify(result))
      throw new Error('Gemini did not return an image')
    }

    // 5. Upload to Storage
    const outputFileName = `${record_id}/output.jpg`
    // Convert base64 to Uint8Array
    const binaryString = atob(generatedBase64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const { error: uploadError } = await supabase.storage
      .from('visualizations')
      .upload(outputFileName, bytes, {
        contentType: 'image/jpeg',
        upsert: true
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      throw new Error('Failed to upload generated image')
    }

    // 6. Update Database Record
    const { error: dbError } = await supabase
      .from('visualizations')
      .update({
        status: 'completed',
        output_image_path: outputFileName,
        updated_at: new Date().toISOString()
      })
      .eq('id', record_id)

    if (dbError) {
      console.error('DB Update error:', dbError)
      // Don't fail the request if just the DB update failed, but warn
    }

    // 7. Return Success
    return new Response(JSON.stringify({
      success: true,
      image_path: outputFileName,
      message: 'Visualization generated successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error: any) {
    const errorMessage = error.message || String(error)
    console.error('Edge Function Error:', error)
    return new Response(JSON.stringify({
      error: errorMessage,
      success: false
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
