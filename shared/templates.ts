/**
 * IVARI Event Templates — curated themes with Nano Banana prompts,
 * color palettes, and pre-built survey questions.
 */

export interface SurveyQuestion {
  id: string;
  type: "text" | "select" | "multiselect";
  label: string;
  options?: string[];
  required: boolean;
}

export interface EventTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  emoji: string;
  /** Nano Banana prompt modifier specific to this theme */
  nanoBananaPrompt: string;
  /** Suggested title placeholder */
  titlePlaceholder: string;
  /** Suggested description */
  suggestedDescription: string;
  /** Pre-built survey questions */
  surveyQuestions: SurveyQuestion[];
  /** Gradient colors for the template card preview */
  gradientFrom: string;
  gradientTo: string;
  /** Accent color in OKLCH */
  accentColor: string;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "wedding",
    name: "Wedding",
    tagline: "A celebration of love",
    description: "Elegant ceremony and reception with romantic ambiance, floral arrangements, and timeless sophistication.",
    emoji: "💍",
    nanoBananaPrompt: "romantic wedding venue with cascading flowers, soft candlelight, crystal chandeliers, golden hour light streaming through tall windows, rose petals on marble floors",
    titlePlaceholder: "The Anderson Wedding",
    suggestedDescription: "Join us as we celebrate the beginning of our forever. An evening of love, laughter, and unforgettable memories.",
    surveyQuestions: [
      { id: "dietary", type: "select", label: "Dietary Restrictions", options: ["None", "Vegetarian", "Vegan", "Gluten-Free", "Halal", "Kosher", "Other"], required: true },
      { id: "meal", type: "select", label: "Meal Preference", options: ["Filet Mignon", "Salmon", "Vegetarian Risotto", "Vegan Plate"], required: true },
      { id: "song", type: "text", label: "Song Request for the Dance Floor", required: false },
      { id: "allergies", type: "text", label: "Any Allergies We Should Know About?", required: false },
      { id: "transport", type: "select", label: "Transportation", options: ["Driving", "Hotel Shuttle", "Uber/Lyft", "Need a Ride"], required: false },
    ],
    gradientFrom: "oklch(0.85 0.12 350)",
    gradientTo: "oklch(0.75 0.15 320)",
    accentColor: "oklch(0.72 0.16 340)",
  },
  {
    id: "birthday",
    name: "Birthday",
    tagline: "Another year, another adventure",
    description: "Vibrant celebration with bold colors, festive energy, and joyful moments worth remembering.",
    emoji: "🎂",
    nanoBananaPrompt: "luxurious birthday celebration with neon lights, confetti, champagne towers, modern lounge setting, colorful balloons against dark velvet backdrop, celebration atmosphere",
    titlePlaceholder: "Sarah's 30th Birthday Bash",
    suggestedDescription: "Let's celebrate another trip around the sun! Join us for an unforgettable night of music, dancing, and pure joy.",
    surveyQuestions: [
      { id: "dietary", type: "select", label: "Dietary Restrictions", options: ["None", "Vegetarian", "Vegan", "Gluten-Free", "Other"], required: false },
      { id: "song", type: "text", label: "What Song Gets You on the Dance Floor?", required: false },
      { id: "drink", type: "select", label: "Drink Preference", options: ["Cocktails", "Wine", "Beer", "Non-Alcoholic", "Surprise Me"], required: false },
      { id: "gift", type: "text", label: "Any Gift Ideas? (Optional)", required: false },
    ],
    gradientFrom: "oklch(0.75 0.2 300)",
    gradientTo: "oklch(0.65 0.22 330)",
    accentColor: "oklch(0.72 0.2 310)",
  },
  {
    id: "corporate",
    name: "Corporate Gala",
    tagline: "Where business meets elegance",
    description: "Sophisticated corporate event with refined aesthetics, professional networking, and world-class hospitality.",
    emoji: "🏛️",
    nanoBananaPrompt: "grand corporate gala in a modern glass atrium, dramatic uplighting in deep blue and gold, long banquet tables with crystal centerpieces, city skyline visible through floor-to-ceiling windows, black tie elegance",
    titlePlaceholder: "Annual Innovation Gala 2026",
    suggestedDescription: "An evening of recognition, connection, and forward-thinking. Join industry leaders for our most prestigious gathering of the year.",
    surveyQuestions: [
      { id: "dietary", type: "select", label: "Dietary Requirements", options: ["None", "Vegetarian", "Vegan", "Gluten-Free", "Halal", "Kosher", "Other"], required: true },
      { id: "company", type: "text", label: "Company / Organization", required: true },
      { id: "title", type: "text", label: "Job Title", required: false },
      { id: "seating", type: "select", label: "Seating Preference", options: ["No Preference", "Near Stage", "Networking Tables", "Quiet Area"], required: false },
      { id: "accessibility", type: "text", label: "Accessibility Requirements", required: false },
    ],
    gradientFrom: "oklch(0.45 0.12 250)",
    gradientTo: "oklch(0.35 0.1 270)",
    accentColor: "oklch(0.65 0.15 250)",
  },
  {
    id: "dinner",
    name: "Dinner Party",
    tagline: "Intimate gatherings, lasting impressions",
    description: "Warm, intimate dinner with curated ambiance, thoughtful details, and the art of togetherness.",
    emoji: "🕯️",
    nanoBananaPrompt: "intimate luxury dinner party with warm candlelight, rustic wooden table set with fine china, hanging greenery and fairy lights, wine glasses catching golden light, cozy elegant atmosphere",
    titlePlaceholder: "An Evening at the Rosewood",
    suggestedDescription: "An intimate evening of exceptional cuisine, meaningful conversation, and the simple pleasure of gathering around a beautiful table.",
    surveyQuestions: [
      { id: "dietary", type: "select", label: "Dietary Restrictions", options: ["None", "Vegetarian", "Vegan", "Gluten-Free", "Pescatarian", "Other"], required: true },
      { id: "allergies", type: "text", label: "Food Allergies", required: false },
      { id: "wine", type: "select", label: "Wine Preference", options: ["Red", "White", "Rosé", "Sparkling", "Non-Alcoholic"], required: false },
      { id: "course", type: "select", label: "Preferred Cuisine Style", options: ["French", "Italian", "Japanese", "Mediterranean", "Chef's Choice"], required: false },
    ],
    gradientFrom: "oklch(0.6 0.12 60)",
    gradientTo: "oklch(0.5 0.14 40)",
    accentColor: "oklch(0.72 0.14 55)",
  },
];

export function getTemplateById(id: string): EventTemplate | undefined {
  return EVENT_TEMPLATES.find(t => t.id === id);
}
