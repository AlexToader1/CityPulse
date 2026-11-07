import type {
  BrandDNA,
  BusinessCategory,
  CityResult,
  FeedItem,
  SimulatedEventPreset,
} from './types'

export const ALL_CITIES = [
  'Bucharest',
  'Cluj-Napoca',
  'Iasi',
  'Constanta',
  'Brasov',
  'Timisoara',
  'Sibiu',
  'Craiova',
] as const

export const BUSINESS_CATEGORIES: BusinessCategory[] = [
  'Cafe',
  'Pharmacy',
  'Florist',
  'Gym',
  'Supplements',
]

type BaseCity = Omit<CityResult, 'score' | 'action' | 'costUsd' | 'minutesSaved'>

export const BASE_CITIES: BaseCity[] = [
  {
    city: 'Cluj-Napoca',
    lat: 46.77,
    lon: 23.62,
    signals: [
      { type: 'event', label: 'Festival weekend (mock)', source: 'curated', strength: 50 },
      { type: 'trend', label: 'Brunch searches up', source: 'simulated', strength: 24 },
      { type: 'weather', label: 'Sunny, 24°C', source: 'live', strength: 20 },
    ],
    reason: 'A festival weekend fills the centre, so a festive visual and copy are worth making.',
    headline: 'Weekend de festival? Incepe cu noi.',
    body: 'Treci pe la noi inainte de concerte. Plecam impreuna cu energie.',
    motif: 'festival',
    compliance: { status: 'fixed', note: 'Removed a third-party festival name and a superlative claim.' },
  },
  {
    city: 'Bucharest',
    lat: 44.43,
    lon: 26.1,
    signals: [
      { type: 'weather', label: 'Storm forecast', source: 'live', strength: 45 },
      { type: 'trend', label: 'Delivery searches rising', source: 'simulated', strength: 26 },
    ],
    reason: 'A storm is on the way and people stay in, so the ad switches to delivery.',
    headline: 'Afara ploua. Noi venim la tine.',
    body: 'Comanda acum si livram oriunde in oras, uscat si la timp.',
    motif: 'storm',
    compliance: { status: 'passed', note: 'No brand or advertising rule issues found.' },
  },
  {
    city: 'Iasi',
    lat: 47.16,
    lon: 27.6,
    signals: [
      { type: 'holiday', label: 'Student days (mock)', source: 'curated', strength: 34 },
      { type: 'weather', label: 'Mild, 18°C', source: 'live', strength: 24 },
    ],
    reason: 'Student days bring a younger crowd, so a copy tweak speaks their language.',
    headline: 'Zile de student? Pauza e la noi.',
    body: 'Intre cursuri, gasesti un loc bun si ceva pe gustul tau.',
    motif: 'greeting',
    compliance: { status: 'passed', note: 'No brand or advertising rule issues found.' },
  },
  {
    city: 'Sibiu',
    lat: 45.8,
    lon: 24.13,
    signals: [
      { type: 'event', label: 'Open-air market weekend (mock)', source: 'curated', strength: 30 },
      { type: 'weather', label: 'Clear skies', source: 'live', strength: 17 },
    ],
    reason: 'An open-air market weekend brings people outside, so the copy invites a stop.',
    headline: 'Piata e plina. Fa o pauza la noi.',
    body: 'La doi pasi de tarabe, te asteptam cu ceva bun.',
    motif: 'festival',
    compliance: { status: 'passed', note: 'No brand or advertising rule issues found.' },
  },
  {
    city: 'Constanta',
    lat: 44.16,
    lon: 28.63,
    signals: [
      { type: 'weather', label: 'Warm sea breeze', source: 'live', strength: 22 },
      { type: 'trend', label: 'Beach searches up', source: 'simulated', strength: 12 },
    ],
    reason: 'A warm breeze keeps people near the sea, so the copy leans into the coast.',
    headline: 'Briza marii, pauza perfecta.',
    body: 'Dupa plaja, te asteptam cu ceva racoros.',
    motif: 'heat',
    compliance: { status: 'fixed', note: 'Replaced "perfect" in the body with a softer claim.' },
  },
  {
    city: 'Craiova',
    lat: 44.33,
    lon: 23.79,
    signals: [
      { type: 'weather', label: 'Overcast', source: 'live', strength: 16 },
      { type: 'trend', label: 'Local searches flat', source: 'simulated', strength: 13 },
    ],
    reason: 'Nothing unusual is happening, so the master ad already fits.',
    headline: 'Cald afara, racoare la noi.',
    body: 'Intra la noi si ia o pauza la racoare.',
    motif: 'heat',
    compliance: { status: 'passed', note: 'No brand or advertising rule issues found.' },
  },
  {
    city: 'Timisoara',
    lat: 45.75,
    lon: 21.21,
    signals: [{ type: 'weather', label: 'Cloudy, 15°C', source: 'live', strength: 22 }],
    reason: 'Nothing unusual is happening, so the master ad already fits.',
    headline: 'O zi linistita in Timisoara.',
    body: 'Te asteptam ca de obicei.',
    motif: 'plain',
    compliance: { status: 'passed', note: 'No brand or advertising rule issues found.' },
  },
  {
    city: 'Brasov',
    lat: 45.64,
    lon: 25.59,
    signals: [{ type: 'weather', label: 'Cool, 12°C', source: 'live', strength: 18 }],
    reason: 'Nothing unusual is happening, so the master ad already fits.',
    headline: 'Spre festival? Opreste-te la noi.',
    body: 'Pe drum spre weekend, facem o pauza buna impreuna.',
    motif: 'festival',
    compliance: { status: 'passed', note: 'No brand or advertising rule issues found.' },
  },
]

export const EVENT_PRESETS: SimulatedEventPreset[] = [
  {
    id: 'storm-bucharest',
    label: 'Storm in Bucharest',
    changes: [
      {
        city: 'Bucharest',
        delta: 22,
        signal: { type: 'weather', label: 'Severe storm warning', source: 'simulated', strength: 22 },
      },
      {
        city: 'Constanta',
        delta: -8,
        signal: { type: 'weather', label: 'Rain bands moving east', source: 'simulated', strength: -8 },
      },
    ],
  },
  {
    id: 'festival-cluj',
    label: 'Festival in Cluj-Napoca',
    changes: [
      {
        city: 'Cluj-Napoca',
        delta: 5,
        signal: { type: 'event', label: 'Festival lineup extended (mock)', source: 'simulated', strength: 5 },
      },
      {
        city: 'Brasov',
        delta: 45,
        signal: { type: 'event', label: 'Festival crowds passing through (mock)', source: 'simulated', strength: 45 },
        override: {
          reason: 'Festival crowds drive through on their way to Cluj-Napoca, so a road-stop ad is worth making.',
        },
      },
      {
        city: 'Sibiu',
        delta: 15,
        signal: { type: 'event', label: 'Festival traffic on the road (mock)', source: 'simulated', strength: 15 },
        override: {
          headline: 'Cel mai bun popas spre festival.',
          body: 'Opreste in Sibiu, festivalul te mai asteapta putin.',
          reason: 'Festival traffic passes through Sibiu, so the ad catches people on the road.',
          compliance: {
            status: 'blocked',
            note: 'Held back: "Cel mai bun" is a superlative claim we cannot prove. Edit the copy to release it.',
          },
        },
      },
    ],
  },
  {
    id: 'heatwave-constanta',
    label: 'Heatwave in Constanta',
    changes: [
      {
        city: 'Constanta',
        delta: 42,
        signal: { type: 'weather', label: 'Heatwave, 36°C', source: 'simulated', strength: 42 },
        override: {
          headline: '36 de grade? Ceva rece, acum.',
          body: 'Intra la racoare si ia ceva rece pentru drum.',
          reason: 'A heatwave sends people looking for shade, so the visual and copy turn cool.',
          compliance: { status: 'fixed', note: 'Softened a health claim about cooling the body down.' },
        },
      },
      {
        city: 'Bucharest',
        delta: 6,
        signal: { type: 'weather', label: 'Hot afternoon', source: 'simulated', strength: 6 },
      },
      {
        city: 'Craiova',
        delta: 12,
        signal: { type: 'weather', label: 'Heat building', source: 'simulated', strength: 12 },
        override: { reason: 'Heat is building, so a copy tweak points people to a cool break.' },
      },
    ],
  },
  {
    id: 'quiet-day',
    label: 'Quiet day',
    changes: [
      {
        city: 'Iasi',
        delta: -30,
        signal: { type: 'holiday', label: 'Student days postponed (mock)', source: 'simulated', strength: -30 },
      },
      {
        city: 'Sibiu',
        delta: -20,
        signal: { type: 'event', label: 'Market rained off (mock)', source: 'simulated', strength: -20 },
      },
      {
        city: 'Bucharest',
        delta: -14,
        signal: { type: 'weather', label: 'Storm passes early', source: 'simulated', strength: -14 },
      },
      {
        city: 'Cluj-Napoca',
        delta: -10,
        signal: { type: 'trend', label: 'Brunch searches cooling', source: 'simulated', strength: -10 },
      },
    ],
  },
]

export const MASTER_COPY: Record<BusinessCategory, { headline: string; body: string; cta: string }> = {
  Cafe: { headline: 'Cafeaua ta, in fiecare oras.', body: 'Boabe proaspat prajite, servite cu zambet.', cta: 'Comanda acum' },
  Pharmacy: { headline: 'Grija pentru tine, aproape de casa.', body: 'Sfaturi de la farmacisti, in fiecare cartier.', cta: 'Vezi oferta' },
  Florist: { headline: 'Flori proaspete pentru fiecare zi.', body: 'Buchete facute de mana, livrate azi.', cta: 'Comanda buchet' },
  Gym: { headline: 'Mai puternic in fiecare zi.', body: 'Antrenamente pentru orice program.', cta: 'Rezerva o sedinta' },
  Supplements: { headline: 'Energie pentru ritmul tau.', body: 'Formule simple, ingrediente clare.', cta: 'Descopera' },
}

export const SAMPLE_BRAND_SWATCHES = ['#8FDCC8', '#1F3A5F', '#F6E7CF', '#FF8B6B']

export function sampleBrand(category: BusinessCategory): BrandDNA {
  const copy = MASTER_COPY[category]
  return {
    name: 'Sample brand',
    swatches: SAMPLE_BRAND_SWATCHES,
    font: 'Space Grotesk Bold',
    tone: ['Warm', 'Playful'],
    masterHeadline: copy.headline,
    masterBody: copy.body,
    cta: copy.cta,
    imageUrl: null,
  }
}

export const FEED_POOL: Omit<FeedItem, 'id'>[] = [
  { city: 'Bucharest', type: 'weather', text: 'Storm forecast', source: 'live' },
  { city: 'Cluj-Napoca', type: 'event', text: 'Festival weekend (mock)', source: 'curated' },
  { city: 'Iasi', type: 'holiday', text: 'Student days (mock)', source: 'curated' },
  { city: 'Constanta', type: 'trend', text: 'Beach searches up', source: 'simulated' },
  { city: 'Sibiu', type: 'event', text: 'Open-air market weekend (mock)', source: 'curated' },
  { city: 'Timisoara', type: 'weather', text: 'Cloudy, 15°C', source: 'live' },
  { city: 'Bucharest', type: 'trend', text: 'Delivery searches rising', source: 'simulated' },
  { city: 'Brasov', type: 'weather', text: 'Cool, 12°C', source: 'live' },
  { city: 'Cluj-Napoca', type: 'weather', text: 'Sunny, 24°C', source: 'live' },
  { city: 'Craiova', type: 'trend', text: 'Local searches flat', source: 'simulated' },
  { city: 'Constanta', type: 'weather', text: 'Warm sea breeze', source: 'live' },
  { city: 'Cluj-Napoca', type: 'trend', text: 'Brunch searches up', source: 'simulated' },
]
