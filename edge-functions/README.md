# Edge Functions

Deze folder is bedoeld voor Supabase Edge Functions die de backend functionaliteit van de zonnescherm visualizer ondersteunen.

## Gebruik

Plaats hier je Supabase Edge Functions zoals:
- API endpoints voor prijsberekeningen
- Email notificatie functies
- Database operaties
- Externe API integraties

## Voorbeeld structuur

```
edge-functions/
├── price-calculator/
│   └── index.ts
├── email-notifications/
│   └── index.ts
└── data-processing/
    └── index.ts
```

## Deployment

Deze functies kunnen gedeployed worden naar Supabase met:
```bash
supabase functions deploy function-name
```