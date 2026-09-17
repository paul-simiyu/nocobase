/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import type { CreativeDiscipline, RelevanceResult } from './types';

interface WeightedTerm {
  term: string;
  /** 1 = generic word that needs support, 3 = unambiguous creative-services phrase. */
  weight: number;
}

const w = (weight: number, ...terms: string[]): WeightedTerm[] => terms.map((term) => ({ term, weight }));

/**
 * Terms that identify creative-agency service work. Weights matter more than
 * length: "design" alone is worth little because civil-engineering notices use
 * it constantly, while "brand identity" is decisive on its own.
 */
const DISCIPLINE_TERMS: Record<CreativeDiscipline, WeightedTerm[]> = {
  branding: [
    ...w(
      3,
      'brand identity',
      'visual identity',
      'corporate identity',
      'brand strategy',
      'brand guidelines',
      'brand manual',
      'brand book',
      'brand architecture',
      'brand positioning',
      'rebranding',
      'rebrand',
      'logo design',
    ),
    ...w(2, 'branding', 'brand refresh', 'logo'),
  ],
  graphicDesign: [
    ...w(
      3,
      'graphic design',
      'graphic designer',
      'publication design',
      'desktop publishing',
      'typesetting',
      'infographic',
      'infographics',
      'artwork design',
      'layout and design',
    ),
    ...w(2, 'illustration', 'visual design', 'artwork', 'creative design'),
    ...w(1, 'design', 'layout'),
  ],
  advertising: [
    ...w(
      3,
      'advertising agency',
      'advertising campaign',
      'advertising services',
      'creative agency',
      'creative services',
      'media buying',
      'media planning',
      'creative concept',
      'above the line',
      'below the line',
    ),
    ...w(2, 'advertising', 'outdoor advertising', 'campaign development', 'marketing campaign'),
    ...w(1, 'campaign', 'marketing'),
  ],
  digital: [
    ...w(
      3,
      'website design',
      'website development',
      'website redesign',
      'web design',
      'user experience design',
      'ux design',
      'ui design',
      'digital experience',
      'web portal design',
    ),
    ...w(
      2,
      'digital marketing',
      'social media management',
      'social media strategy',
      'search engine optimisation',
      'search engine optimization',
      'user interface',
      'user experience',
    ),
    ...w(1, 'website', 'social media'),
  ],
  content: [
    ...w(
      3,
      'copywriting',
      'content creation',
      'content development',
      'content strategy',
      'editorial services',
      'scriptwriting',
      'storytelling',
    ),
    ...w(2, 'copy editing', 'proofreading', 'translation services', 'editorial'),
    ...w(1, 'content production'),
  ],
  video: [
    ...w(
      3,
      'video production',
      'film production',
      'motion graphics',
      'animation services',
      'documentary production',
      'audiovisual production',
      'audio visual production',
      'video editing',
    ),
    ...w(2, 'photography', 'videography', 'animation', 'video content'),
    ...w(1, 'video'),
  ],
  publicRelations: [
    ...w(
      3,
      'public relations',
      'communications strategy',
      'communication strategy',
      'strategic communications',
      'media relations',
      'communication campaign',
      'communications campaign',
      'behaviour change communication',
      'behavior change communication',
    ),
    ...w(2, 'stakeholder engagement', 'advocacy campaign', 'communications support'),
    ...w(1, 'communications'),
  ],
  events: [
    ...w(
      3,
      'event management',
      'event production',
      'exhibition design',
      'exhibition stand',
      'conference organisation',
      'conference organization',
    ),
    ...w(2, 'event services', 'booth design', 'stand design'),
  ],
  print: [
    ...w(3, 'printing services', 'print production', 'brochure design', 'signage design'),
    ...w(2, 'brochures', 'signage', 'banners', 'promotional materials', 'branded merchandise'),
    ...w(1, 'printing'),
  ],
  research: [
    ...w(2, 'market research', 'audience research', 'brand audit', 'communications audit', 'perception survey'),
  ],
};

/**
 * Phrases that place a notice firmly outside creative-agency scope. They subtract
 * from the score rather than hard-excluding, so that a genuine campaign tender
 * that merely mentions "supply and delivery" of printed material still survives.
 */
const DISQUALIFYING_TERMS = [
  'civil works',
  'construction of',
  'road construction',
  'borehole',
  'drilling',
  'pharmaceutical',
  'medical equipment',
  'laboratory equipment',
  'motor vehicle',
  'catering services',
  'cleaning services',
  'security guard',
  'insurance services',
  'audit of financial statements',
  'legal services',
  'fuel supply',
  'furniture supply',
  'generator',
  'air conditioning',
  'computer hardware',
  'network equipment',
];

/**
 * CPV prefixes the EU and UK portals use for creative work. A CPV match is the
 * buyer's own classification, so it outranks anything inferred from prose.
 */
const CREATIVE_CPV_PREFIXES = [
  '221', // printed books, brochures and leaflets
  '72413', // www site design services
  '7242', // internet development services
  '7931', // market research
  '7932', // public opinion polling
  '7934', // advertising and marketing services
  '79416', // public relations services
  '798', // printing and related services (includes 79822 graphic design)
  '7993', // specialty design services
  '79952', // event services
  '9211', // motion picture production
  '9212', // motion picture and video services
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Precompiled once - a harvest scores hundreds of notices per run. */
const compile = (term: string) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');

const DISCIPLINE_MATCHERS: { discipline: CreativeDiscipline; term: string; weight: number; re: RegExp }[] = (
  Object.entries(DISCIPLINE_TERMS) as [CreativeDiscipline, WeightedTerm[]][]
).flatMap(([discipline, terms]) => terms.map(({ term, weight }) => ({ discipline, term, weight, re: compile(term) })));

const DISQUALIFYING_MATCHERS = DISQUALIFYING_TERMS.map((term) => ({ term, re: compile(term) }));

/** Collapses whitespace so multi-word phrases match across line breaks. */
export const normaliseText = (value: string): string => (value || '').replace(/\s+/g, ' ').trim();

const cpvMatches = (cpvCodes: string[] = []): boolean =>
  cpvCodes.some((code) => {
    const digits = String(code).replace(/\D/g, '');
    return CREATIVE_CPV_PREFIXES.some((prefix) => digits.startsWith(prefix));
  });

/**
 * Calibration. The bands these produce, against the `strong` (70) and `possible`
 * (40) verdict thresholds and the default minimum relevance of 30:
 *
 * - one decisive phrase in the title ("brand identity")  -> 75, strong
 * - one supporting phrase in the title ("branding")      -> 50, possible
 * - only generic words in the title ("design")           -> 25, filtered out
 * - creative terms in the body under a vague title       -> 50, possible
 *
 * Body weight is capped so a long tender document cannot out-shout the title.
 */
const BODY_WEIGHT_CAP = 10;
const TITLE_MULTIPLIER = 5;
const SIGNAL_MULTIPLIER = 5;
const CPV_FLOOR = 70;
const PENALTY_PER_TERM = 18;
const PENALTY_CAP = 54;

export interface ScoreInput {
  title: string;
  description?: string;
  cpvCodes?: string[];
}

/**
 * Scores how closely a notice matches creative-agency service work.
 *
 * The score is deliberately explainable: `matchedTerms` lists exactly what drove
 * it, so a low score can be audited rather than trusted blindly.
 */
export function scoreRelevance({ title, description = '', cpvCodes = [] }: ScoreInput): RelevanceResult {
  const haystackTitle = normaliseText(title);
  const haystackBody = normaliseText(description);

  const disciplines = new Set<CreativeDiscipline>();
  const matchedTerms: string[] = [];
  let titleWeight = 0;
  let bodyWeight = 0;

  for (const matcher of DISCIPLINE_MATCHERS) {
    const inTitle = matcher.re.test(haystackTitle);
    const inBody = matcher.re.test(haystackBody);
    if (!inTitle && !inBody) {
      continue;
    }
    disciplines.add(matcher.discipline);
    matchedTerms.push(matcher.term);
    if (inTitle) {
      titleWeight += matcher.weight;
    } else {
      bodyWeight += matcher.weight;
    }
  }

  const disqualifyingTerms = DISQUALIFYING_MATCHERS.filter(
    ({ re }) => re.test(haystackTitle) || re.test(haystackBody),
  ).map(({ term }) => term);

  const signal = titleWeight * TITLE_MULTIPLIER + Math.min(bodyWeight, BODY_WEIGHT_CAP);
  let score = Math.min(100, signal * SIGNAL_MULTIPLIER);

  if (cpvMatches(cpvCodes)) {
    score = Math.max(score, CPV_FLOOR);
  }

  score -= Math.min(disqualifyingTerms.length * PENALTY_PER_TERM, PENALTY_CAP);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    disciplines: [...disciplines].sort(),
    matchedTerms,
    disqualifyingTerms,
  };
}
