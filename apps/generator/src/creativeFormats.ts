/**
 * Creative format rotation — picks a varied ad format for each generation
 * request so consecutive ads don't sound identical.
 *
 * Each format defines:
 * - `script`: a template function that produces a voiceover transcript
 * - `voice`: a preferred ElevenLabs voice ID (falls back to the env default)
 * - `imageStyle`: a visual style hint for the image/video prompt
 * - `tone`: a short descriptor appended to the summary for UI display
 *
 * The rotation is deterministic per segmentId so replays are stable.
 */

export interface CreativeFormat {
  /** Human-readable name for UI display. */
  name: string;
  /** Short tone descriptor, e.g. "comedy", "anthem", "noir". */
  tone: string;
  /** Preferred ElevenLabs voice ID. */
  voiceId: string;
  /** Visual style hint for image/video prompts. */
  imageStyle: string;
  /** Produce the voiceover transcript from the request fields. */
  script: (args: ScriptArgs) => string;
}

interface ScriptArgs {
  brand: string;
  brief: string;
  context?: string;
}

/**
 * ElevenLabs voice IDs from the public library.
 * These are stable, well-known preset voices.
 */
const VOICES = {
  george: "JBFqnCBsd6RMkjVDRZzb", // deep, narrator
  rachel: "21m00Tcm4TlvDq8ikWAM", // warm, conversational
  antoni: "ErXwobaYiNj19Updp6dD", // dramatic, deep
  bella: "EXAVITQu4vr4xnSDxMaL", // soft, expressive
  domi: "AZnzlk1XvdvUeBnXlCj9", // energetic, young
  elli: "MF3mGyEYCl7XYWbV9V6O", // emotive, warm
  josh: "TxGEqnHWrfWFTfGW9XjX", // deep, calm
  arnold: "VR6AewLTigWN4JW49xWj", // intense, powerful
} as const;

export const FORMATS: readonly CreativeFormat[] = [
  {
    name: "Comedy Monologue",
    tone: "comedy",
    voiceId: VOICES.domi,
    imageStyle:
      "playful, colorful, slightly absurd — think meme-meets-magazine",
    script: ({ brand, brief, context }) =>
      `${context ? `Okay, so last time we talked about ${context}. ` : ""}` +
      `But forget that. ${brand}. ${brief} ` +
      `Look, I'm not saying this will change your life. I'm saying it'll ` +
      `make your life funnier. ${brand}. Because boring software is a crime. ` +
      `And you deserve better than crime.`,
  },
  {
    name: "Cinematic Anthem",
    tone: "anthem",
    voiceId: VOICES.antoni,
    imageStyle:
      "epic, cinematic, dramatic lighting — hero shot with deep shadows",
    script: ({ brand, brief, context }) =>
      `${context ? `The story continues. ` : ""}` +
      `In a world of endless scrolling... one name rises above the noise. ` +
      `${brand}. ${brief} ` +
      `This is not just a product. This is a movement. ` +
      `${brand}. The future doesn't wait. Neither should you.`,
  },
  {
    name: "Late Night Radio",
    tone: "radio",
    voiceId: VOICES.josh,
    imageStyle:
      "moody, nocturnal, neon-lit — like a 2am cityscape with the product glowing",
    script: ({ brand, brief, context }) =>
      `You're tuned to the midnight frequency. ` +
      `${context ? `Coming up after that last segment — ` : ``}` +
      `tonight's sponsor: ${brand}. ${brief} ` +
      `It's the kind of thing that makes you go, "huh, why didn't I think of that?" ` +
      `${brand}. Stay tuned. The night is young.`,
  },
  {
    name: "Infomercial Parody",
    tone: "infomercial",
    voiceId: VOICES.arnold,
    imageStyle:
      "over-the-top, bold colors, exaggerated — like a 90s TV ad on steroids",
    script: ({ brand, brief, context }) =>
      `Tired of software that promises everything and delivers nothing?! ` +
      `${context ? `You've seen the rest. Now see the BEST. ` : ``}` +
      `${brand} is here! ${brief} ` +
      `But wait — there's more! It actually works! Call now... or just open a tab. ` +
      `${brand}. Your workflow will never be the same.`,
  },
  {
    name: "Soft Launch",
    tone: "intimate",
    voiceId: VOICES.elli,
    imageStyle:
      "minimal, elegant, soft focus — like a premium lifestyle brand campaign",
    script: ({ brand, brief, context }) =>
      `Hey. ${context ? `You know ${brand}. ` : `There's something I want to tell you about. `}` +
      `${brief} ` +
      `It's quiet. It's thoughtful. It just... works. ` +
      `${brand}. Sometimes the best things don't shout.`,
  },
  {
    name: "Hype Drop",
    tone: "hype",
    voiceId: VOICES.bella,
    imageStyle:
      "vibrant, explosive, graffiti-meets-tech — bold shapes and electric color",
    script: ({ brand, brief, context }) =>
      `Yo! ${context ? `We're back and ${brand} just leveled up. ` : `${brand} just dropped. `}` +
      `${brief} ` +
      `This is not a drill. This is the real thing. ` +
      `${brand}. Get in early. Thank me later.`,
  },
  {
    name: "Documentary Voice",
    tone: "documentary",
    voiceId: VOICES.george,
    imageStyle:
      "nature-documentary-meets-tech — wide shots, shallow depth of field, serious",
    script: ({ brand, brief, context }) =>
      `Here, in the digital wild, a new species emerges. ` +
      `${brand}. ${brief} ` +
      `${context ? `Unlike its predecessors, ` : ``}this one adapts. It learns. It survives. ` +
      `${brand}. Evolution, accelerated.`,
  },
  {
    name: "News Bulletin",
    tone: "news",
    voiceId: VOICES.rachel,
    imageStyle:
      "clean, editorial, newsroom-style — sharp lines, confident composition",
    script: ({ brand, brief, context }) =>
      `Breaking tonight. ` +
      `${context ? `Following our earlier coverage, ` : ``}` +
      `${brand} has announced what experts are calling a significant development. ` +
      `${brief} ` +
      `Analysts say this could reshape the landscape. ` +
      `${brand}. We'll continue to follow this story.`,
  },
];

/**
 * Deterministically pick a format for a segment so replays are stable.
 * Uses FNV-1a hash for better distribution across short segment IDs.
 */
export function pickFormat(segmentId: string): CreativeFormat {
  let hash = 0x811c9dc5;
  for (let i = 0; i < segmentId.length; i++) {
    hash ^= segmentId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const index = (hash >>> 0) % FORMATS.length;
  return FORMATS[index];
}

/**
 * Pick a voice for a segment. If the format specifies a voice, use it.
 * Otherwise fall back to the provided default.
 */
export function voiceForFormat(
  format: CreativeFormat,
  defaultVoiceId: string,
): string {
  return format.voiceId || defaultVoiceId;
}
