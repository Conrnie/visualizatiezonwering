# Zonnescherm Visualizer

Een interactieve web-applicatie voor het configureren en visualiseren van zonwering (zonneschermen). Deze tool stelt gebruikers in staat om verschillende producttypen, kleuren en afmetingen te selecteren en direct te zien hoe hun keuzes eruit zullen zien.

## 🌟 Features

- **Interactieve Productconfiguratie**: Kies uit verschillende zonnescherm modellen
- **Kleurvisualisatie**: Selecteer uit 4 verschillende kleuren met real-time preview
- **Responsive Design**: Werkt perfect op desktop, tablet en mobiele apparaten
- **Moderne UI**: Clean en professionele interface met smooth animaties
- **Prijsindicatie**: Automatische berekening van geschatte kosten
- **Gebruiksvriendelijk**: Intuïtieve interface voor eenvoudige configuratie

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

### Styling Features
- CSS Grid en Flexbox voor layout
- CSS Custom Properties voor theming
- Responsive design met mobile-first approach
- Smooth transitions en hover effects
- Modern box-shadow en border-radius styling

### JavaScript Functionaliteit
- Dynamische kleur selectie en preview
- Form validatie en user feedback
- Responsive image loading
- API integratie (configureerbaar via config.js)

## 🎯 Portfolio Highlights

Dit project demonstreert:
- **Frontend Development**: Modern HTML, CSS en JavaScript
- **Responsive Design**: Mobile-first, cross-browser compatibility
- **User Experience**: Intuïtieve interface en smooth interactions
- **Code Organization**: Clean, maintainable code structure
- **API Integration**: Configureerbare backend integratie
- **Project Management**: Proper documentation en deployment ready

## 🔧 Configuratie

Voor productie gebruik:
1. Kopieer `.env.example` naar `.env`
2. Vul de juiste API endpoints in `config.js`
3. Update de Supabase configuratie indien nodig

## 📱 Browser Ondersteuning

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## 📄 Licentie

MIT License - zie het project voor meer details.

## 👨‍💻 Development

Dit project is ontwikkeld als portfolio demonstratie van moderne frontend development technieken en gebruiksvriendelijke interface design.