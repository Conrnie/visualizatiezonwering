# Zonnescherm Visualizer

Een AI-gestuurde web-applicatie voor het automatisch visualiseren en configureren van zonwering op woningfoto's. Dit portfolio project demonstreert geavanceerde technieken in computer vision, iteratieve AI-optimalisatie, en real-time beeldverwerking.

## 🌟 Features

- **AI-Gestuurde Visualisatie**: Automatische plaatsing van zonwering op woningfoto's met Google Gemini 2.5 Flash
- **Iteratief Scoringssysteem**: Multi-criteria evaluatie met early stopping optimalisatie
- **Kleurvisualisatie**: Intelligente kleur- en patroonapplicatie met iteratieve verfijning
- **Prijsindicatie**: Dynamische prijsberekening op basis van type, afmetingen en installatiehoogte
- **Email Notificaties**: Geautomatiseerde klantcommunicatie via Gmail API
- **Responsive Design**: Werkt perfect op desktop, tablet en mobiele apparaten

## 🏗️ Architectuur

### Systeemoverzicht

Het project bestaat uit drie hoofdcomponenten:

1. **Frontend** (`index.html`, `script.js`, `styles.css`)
   - Gebruikersinterface voor foto-upload en configuratie
   - Real-time preview en resultaatweergave

2. **Visualization Engine** (`edge-functions/visualization.ts`)
   - AI-gestuurde beeldgeneratie met iteratieve optimalisatie
   - Twee-fase proces: placement generation en color refinement

3. **Price Calculator** (`edge-functions/priceindication.ts`)
   - Dynamische prijsberekening op basis van meerdere variabelen
   - Geïntegreerde email notificaties met visualisatie bijlagen

## 🎨 Beschikbare Opties

### Producttypen
- Verschillende zonnescherm modellen beschikbaar via dropdown

### Kleuren
- **Lichtgrijs met Wit (Gestreept)**: Klassieke, neutrale uitstraling
- **Gebroken Wit/Crème (Gestreept)**: Warme, elegante look
- **Loodgrijs (Effen)**: Modern en strak design
- **Oranje**: Opvallende, vrolijke kleur

## 🚀 Installatie & Gebruik

### Vereisten
- Python 3.x (voor lokale development server)
- Moderne webbrowser (Chrome, Firefox, Safari, Edge)

### Lokaal draaien
1. Clone of download dit project
2. Navigeer naar de projectmap
3. Start een lokale server:
   ```bash
   python -m http.server 8000
   ```
4. Open je browser en ga naar `http://localhost:8000`

### Alternatief (met npm)
```bash
npm start
```

## 📁 Projectstructuur

```
zonnescherm-visualizer/
├── index.html              # Hoofdpagina van de applicatie
├── pricing-calculator.html # Interne pricing calculator tool
├── styles.css              # Alle styling en responsive design
├── script.js               # JavaScript functionaliteit
├── config.js               # API configuratie (placeholder voor portfolio)
├── .env.example            # Environment variabelen template
├── .gitignore              # Git ignore regels
├── package.json            # Project metadata
├── assets/                 # Afbeeldingen en media
│   ├── colors/             # Kleur voorbeelden
│   │   ├── gebroken-wit-creme-gestreept.jpg
│   │   ├── lichtgrijs-wit-gestreept.jpg
│   │   ├── loodgrijs-effen.png
│   │   └── oranje.jpg
│   └── models/             # Product afbeeldingen
│       ├── markiezen_real.jpg
│       ├── model1.webp
│       ├── model2.webp
│       └── model3.webp
└── README.md               # Dit bestand
```

## 🛠️ Technische Details

### Frontend
- **HTML5**: Semantische markup
- **CSS3**: Flexbox, Grid, CSS Variables, Responsive Design
- **Vanilla JavaScript**: ES6+, DOM manipulation, Event handling

### Backend (Deno Edge Functions)
- **Runtime**: Deno (TypeScript native runtime)
- **AI Provider**: Google Gemini 2.5 Flash (Image & Text models)
- **Image Processing**: ImageScript voor dimensie validatie en correctie
- **Email Service**: Gmail API met OAuth2 authenticatie

## 🔄 Visualisatie Algoritme

### Twee-Fase Verwerkingsproces

#### Fase 1: Placement Generation

Het systeem genereert 2-5 variaties van zonwering plaatsing met een **iteratief verbeteringproces**:

```typescript
// Iteratieve optimalisatie met early stopping
for (let i = 0; i < maxVariations; i++) {
  // Genereer variant
  const variation = await generatePlacementVersion(prompt, baseImage);

  // Evalueer met multi-criteria scoring
  const evaluation = await evaluatePlacement(variation);
  const score = computePlacementScore(evaluation);

  // Early stopping bij score threshold (75%)
  if (score >= scoreThreshold) {
    break; // Ga direct naar kleur fase
  }

  // Anders: gebruik huidige beste als basis voor volgende iteratie
  if (score > bestScore) {
    bestScore = score;
    baseImage = variation; // Iterative refinement
  }
}
```

**Placement Scoring Criteria** (100 punten totaal):
- **Placement Quality** (30%): Correcte positie t.o.v. raam/deur
- **Visual Realism** (25%): Natuurlijke integratie met gebouw
- **Red Line Removal** (25%): Volledige verwijdering van plaatsingsrichtlijn
- **Technical Quality** (20%): Scherpte, resolutie, artefacten

**Type-Specifieke Bonussen/Penalties**:
- Markiezen: +20 pts voor correcte canopy vorm, -50 pts voor verkeerde knikarm elementen
- Knikarm: Verificatie van cassette en articulated folding arms
- Uitvalarm: Controle op verticale orientatie en korte support arms

#### Fase 2: Color Iteration

Na succesvolle plaatsing volgt een **iteratieve kleur optimalisatie** (max 5 iteraties):

```typescript
let currentIteration = 1;
const colorGoalThreshold = 60;

while (currentIteration <= maxColorIterations) {
  // Pas kleur/patroon toe met specifieke prompt strategie
  const editedImage = await applyColorPattern(
    currentImage,
    colorPrompt,
    swatchReference
  );

  // Evalueer kleur kwaliteit
  const evaluation = await evaluateColor(editedImage, patternType);
  const { score, issues } = calculateColorIterationScore(evaluation);

  // Early stopping bij doelbereik
  if (evaluation.goal_met || score >= colorGoalThreshold) {
    return editedImage; // Succesvol afgerond
  }

  // Gebruik resultaat voor volgende iteratie (refinement)
  currentImage = editedImage;
  currentIteration++;
}
```

**Color Scoring Criteria**:

*Voor Solid Colors (150 punten mogelijk):*
- Uniform base color: +50 pts
- Geen decoratieve strepen: +40 pts
- Uniform slat color: +30 pts
- Match met swatch: +20 pts
- Alleen fabric edited: +10 pts
- **Penalties**: Zichtbare ribbels/slats: -50 pts, structuurlijnen: -40 pts
- **Bonus**: Goal met: +100 pts

*Voor Striped Patterns (115 punten mogelijk):*
- Stripe accuracy ≥80%: +60 pts
- Pattern consistency: +30 pts
- Swatch color match: +25 pts
- **Penalties**: Structuurlijnen: -40 pts, hardware edited: -30 pts
- **Bonus**: Goal met: +50 pts

### Dimensie Validatie

Elk gegenereerd beeld wordt automatisch gecontroleerd op dimensie-integriteit:

```typescript
async function validateImageDimensions(original, generated, context) {
  const originalDims = await getImageDimensions(original);
  const generatedDims = await getImageDimensions(generated);

  const aspectRatioDiff = Math.abs(
    (originalDims.width / originalDims.height) -
    (generatedDims.width / generatedDims.height)
  );

  if (aspectRatioDiff > 0.1) {
    // Automatische correctie met ImageScript
    return await resizeImageToMatch(generated, originalDims);
  }

  return { valid: true };
}
```

## 💰 Prijsberekenings Logica

De `PriceCalculator` class berekent prijzen op basis van:

```typescript
class PriceCalculator {
  basePrices = {
    'knikarm': €85/m²,
    'uitvalarm': €75/m²,
    'markiezen': €95/m²
  };

  installationCosts = {
    'begane-grond': €150,
    'eerste-verdieping': €200,
    'tweede-verdieping': €275,
    'derde-verdieping': €350,
    'hoger': €450
  };

  colorSurcharges = {
    'lichtgrijs-wit-gestreept': €15/m²,
    'oranje': €25/m²
  };
}
```

**Berekening**:
1. Oppervlakte = (breedte × uitval) in m²
2. Basisprijs = oppervlakte × base price per m²
3. Installatiekosten = vast tarief op basis van verdieping
4. Kleurtoeslag = oppervlakte × kleur surcharge (indien van toepassing)
5. Subtotaal = som van bovenstaande
6. Totaalprijs = subtotaal × 1.21 (BTW)

## 📧 Email Notificatie Systeem

Geautomatiseerde klantcommunicatie via Gmail API:

**Start Notificatie**:
- Verzonden bij begin van visualisatie proces
- Verwachte voltooiingstijd: 3-6 minuten
- Status updates over AI verwerking

**Completion Notificatie**:
- Bevat embedded visualisatie (inline attachment)
- Kwaliteitsscore en specificaties
- Prijsindicatie (indien aangevraagd)
- Interactieve CTA buttons (bellen/emailen)
- 30-dagen geldigheidsperiode

```typescript
await gmailService.sendCompletionNotification(
  customerEmail,
  customerName,
  awningType,
  processedImage,  // Inline embedded als 'cid:visualization'
  goalAchieved,
  score,
  priceData
);
```

## 🎯 Portfolio Highlights

Dit project demonstreert geavanceerde software engineering technieken:

### 1. AI/ML Integration
- **Prompt Engineering**: Type-specifieke prompts voor verschillende zonwering modellen
- **Iterative Refinement**: Feedback loops voor continue kwaliteitsverbetering
- **Multi-Modal AI**: Combinatie van image generation en text evaluation models
- **Confidence Scoring**: Multi-criteria evaluatie systeem voor output kwaliteit

### 2. Algorithm Design
- **Early Stopping Optimization**: Intelligente terminatie bij doelbereik (75% threshold)
- **Iterative Improvement**: Gebruik van beste resultaat als basis voor volgende iteratie
- **Multi-Phase Processing**: Gescheiden placement en color optimization loops
- **Adaptive Thresholds**: Verschillende success criteria voor verschillende patronen

### 3. Image Processing
- **Dimension Validation**: Automatische aspect ratio controle en correctie
- **Format Handling**: Base64 encoding/decoding, MIME type normalisatie
- **Quality Control**: Artefact detectie en kwaliteitsmonitoring

### 4. Backend Architecture
- **Edge Functions**: Deno runtime voor TypeScript-native serverless functions
- **API Orchestration**: Complexe workflows met meerdere API calls (Gemini, Gmail)
- **Error Handling**: Graceful degradation en fallback mechanismen
- **Rate Limiting**: Strategische delays om API quota te respecteren

### 5. Type Safety & Code Quality
- **Full TypeScript**: Strong typing voor alle data structures
- **Interface Definitions**: Duidelijke contracts tussen componenten
- **Error Types**: Specifieke error handling per failure scenario

### 6. Email Automation
- **OAuth2 Implementation**: Secure Gmail API authenticatie
- **MIME Multipart**: Complexe email structuur met inline images
- **Token Management**: Automatische refresh met 1-minuut buffer
- **HTML Email Templates**: Responsive, professionele klant communicatie

## ⚡ Performance Optimalisaties

### Snelheidsoptimalisaties
1. **Parallelle Verwerking**: Meerdere placement variaties kunnen parallel worden geëvalueerd
2. **Early Exit Strategie**: Stop generatie zodra kwaliteitsdoel bereikt is
3. **Caching**: Token caching om onnodige OAuth2 calls te vermijden
4. **Lazy Loading**: On-demand image loading in frontend

### Resource Efficiëntie
- **Adaptive Quality**: Variabele JPEG quality (95%) voor balans tussen grootte en kwaliteit
- **Smart Iteration Limits**: Maximum iteraties (5 placement, 5 color) om costs te beheersen
- **Threshold-Based Processing**: Color iteration alleen bij placement score ≥30%

### Schaalbaarheid Overwegingen
- **Stateless Functions**: Elke request is onafhankelijk
- **Async/Await**: Non-blocking I/O voor betere throughput
- **Error Isolation**: Failures in één fase blokkeren andere fases niet

## 📊 Data Flow Diagram

```
User Upload (Photo + Config)
         ↓
    [Validation]
         ↓
┌────────────────────────┐
│  PHASE 1: PLACEMENT    │
└────────────────────────┘
         ↓
    [Iteration 1]
         ↓
    Generate Placement → Evaluate (score: 45/100)
         ↓
    [Iteration 2 - Iterative]
         ↓
    Generate from Best → Evaluate (score: 68/100)
         ↓
    [Iteration 3 - Iterative]
         ↓
    Generate from Best → Evaluate (score: 78/100) ✓ > 75% threshold
         ↓
    [Early Stop - Proceed to Color]
         ↓
┌────────────────────────┐
│  PHASE 2: COLOR        │
└────────────────────────┘
         ↓
    [Color Iteration 1]
         ↓
    Apply Color → Evaluate (score: 45/100)
         ↓
    [Color Iteration 2]
         ↓
    Refine Color → Evaluate (score: 72/100) ✓ > 60% threshold + goal_met
         ↓
    [Early Stop - Success]
         ↓
┌────────────────────────┐
│  FINALIZATION          │
└────────────────────────┘
         ↓
    [Dimension Validation]
         ↓
    [Price Calculation]
         ↓
    [Email Notification]
         ↓
    Return to User
```

## 🔧 Configuratie & Deployment

### Environment Variables

```bash
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key

# Gmail API (voor email notificaties)
GMAIL_CLIENT_ID=your_oauth_client_id
GMAIL_CLIENT_SECRET=your_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_refresh_token
GMAIL_SENDER_EMAIL=your_sender_email@domain.com
```

### Deployment op Supabase Edge Functions

```bash
# Deploy visualization function
supabase functions deploy visualization

# Deploy price indication function
supabase functions deploy priceindication

# Test locally
supabase functions serve
```

### Configuratie Parameters

**Placement Generation**:
- `maxVariations`: 5 (maximaal aantal placement pogingen)
- `initialVariations`: 2 (aantal initiële variaties voor parallel)
- `scoreThreshold`: 75 (minimum score voor early stop)

**Color Iteration**:
- `maxColorIterations`: 5 (maximaal aantal kleur verfijningen)
- `colorGoalThreshold`: 60 (minimum score voor acceptatie)

**Gemini API Settings**:
```typescript
generationConfig: {
  temperature: 0.25,    // Placement (consistentie)
  temperature: 0.4,     // Color (creativiteit)
  topK: 40,
  topP: 0.95,
  maxOutputTokens: 4096,
  responseModalities: ["IMAGE"]
}
```

## 📱 Browser Ondersteuning

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 📄 Licentie

MIT License - zie het project voor meer details.

## 🧪 Technische Uitdagingen & Oplossingen

### 1. Inconsistente AI Output Kwaliteit
**Probleem**: Gemini genereerde soms verkeerde zonwering types of plaatsingen
**Oplossing**:
- Type-specifieke prompts met **negative prompting** (wat NIET te genereren)
- Multi-criteria evaluation met type-specifieke bonussen/penalties
- Iterative refinement waarbij beste resultaat als basis dient

### 2. Dimensie Inconsistenties
**Probleem**: Gegenereerde images hadden vaak afwijkende aspect ratios
**Oplossing**:
- Automatische dimensie validatie na elke generatie stap
- ImageScript integration voor on-the-fly resizing
- Preserveren van originele dimensies door alle fases heen

### 3. Kleur Applicatie op Structuur
**Probleem**: AI paste kleuren toe op metalen onderdelen i.p.v. alleen fabric
**Oplossing**:
- Specifieke evaluation criteria voor "fabric_only_edited"
- Penalties in scoring (-30 pts) bij hardware wijzigingen
- Iterative prompts die expliciet structuur preservatie vereisen

### 4. API Rate Limiting
**Probleem**: Gemini API quota overschrijding bij veel parallelle requests
**Oplossing**:
- Strategic delays (1-2 seconden) tussen API calls
- Early stopping om onnodige calls te vermijden
- Threshold-based processing (alleen color iteration bij goede placement)

### 5. Email Deliverability
**Probleem**: Grote base64 images blokkeerden emails of gingen naar spam
**Oplossing**:
- MIME multipart met inline Content-ID referenties
- Adaptive JPEG quality (95%) voor grootte reductie
- Proper email headers en SPF/DKIM compliance

## 🔬 Testing & Quality Assurance

### Evaluatie Metrics
- **Success Rate**: % requests met overall_goal_achieved = true
- **Average Iterations**: Gemiddeld aantal iteraties tot success
- **Processing Time**: Totale verwerkingstijd per request
- **Score Distribution**: Verdeling van placement en color scores

### Debug Informatie
Elke response bevat uitgebreide debug data:
```typescript
{
  placementVariations: [{
    label: "Placement 1",
    score: 78,
    evaluation: {...},
    issues: []
  }],
  colorIterations: [{
    iteration: 1,
    score: 72,
    goalMet: true,
    issues: ["Minor color variance"]
  }],
  emailNotifications: {
    startEmailSent: true,
    completionEmailSent: true
  }
}
```

## 🚀 Toekomstige Verbeteringen

### Geplande Features
1. **Caching Layer**: Redis voor herhaalde configuraties
2. **Batch Processing**: Meerdere kleuren parallel genereren
3. **3D Visualisation**: Three.js integratie voor 3D preview
4. **Mobile App**: React Native companion app
5. **A/B Testing**: Verschillende prompt strategieën vergelijken

### Optimalisatie Mogelijkheden
- **Prompt Caching**: Hergebruik van prompt componenten
- **Image Compression**: WebP formaat voor kleinere payloads
- **CDN Integration**: CloudFlare voor snellere image delivery
- **Webhook Notifications**: Real-time updates i.p.v. polling

## 👨‍💻 Development

### Technische Stack
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Backend**: Deno (TypeScript), Supabase Edge Functions
- **AI/ML**: Google Gemini 2.5 Flash (Image + Text models)
- **Email**: Gmail API met OAuth2
- **Image Processing**: ImageScript (Deno)
- **Version Control**: Git, GitHub

### Code Kwaliteit Standaarden
- TypeScript strict mode enabled
- Async/await voor alle asynchrone operaties
- Comprehensive error handling met try-catch blocks
- Extensive logging voor debugging en monitoring
- Clear naming conventions en code comments

### Lokale Development Setup

```bash
# Clone repository
git clone https://github.com/username/visualizatiezonwering.git

# Install Deno
curl -fsSL https://deno.land/install.sh | sh

# Install Supabase CLI
npm install -g supabase

# Setup environment
cp .env.example .env
# Edit .env met jouw API keys

# Start local development
supabase functions serve

# In aparte terminal: start frontend
python -m http.server 8000
```

Dit project demonstreert geavanceerde software engineering principes in een production-ready applicatie met real-world business value.