// Direct-from-browser Claude client for the semantic matching fallback.
//
// We call the Messages API with a structured-output schema so the model returns a
// machine-readable mapping of page fields to KB entry ids. Only field *labels* are sent
// — never captured values. The call runs in the service worker (a browser context), so
// it requires the `anthropic-dangerous-direct-browser-access` header to satisfy CORS.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface AiMatchField {
  fieldId: string;
  question: string;
  candidates: { entryId: string; question: string }[];
}

export interface AiMatchResult {
  fieldId: string;
  matchedEntryId: string; // "" means no match
  confidence: number;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    matches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fieldId: { type: 'string' },
          matchedEntryId: {
            type: 'string',
            description:
              'The id of the candidate whose question means the same thing as the field, or an empty string if none of them match.',
          },
          confidence: {
            type: 'number',
            description: 'Confidence from 0 to 1 that the match is correct.',
          },
        },
        required: ['fieldId', 'matchedEntryId', 'confidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['matches'],
  additionalProperties: false,
} as const;

function buildPrompt(fields: AiMatchField[]): string {
  const lines: string[] = [
    'You match form fields on a web page to previously answered questions.',
    'For each field below, decide which candidate question (if any) is asking for the same information — even if the wording differs.',
    'Only match when a stored answer would be a correct answer to the field. If no candidate fits, return an empty string for matchedEntryId.',
    '',
    'Fields:',
  ];
  for (const f of fields) {
    lines.push(`- fieldId "${f.fieldId}": "${f.question}"`);
    for (const c of f.candidates) {
      lines.push(`    candidate ${c.entryId}: "${c.question}"`);
    }
  }
  return lines.join('\n');
}

/**
 * Ask Claude to resolve moderate-confidence field↔entry matches. Returns [] on any
 * error (network, auth, bad response) so the caller falls back to local-only behavior.
 */
export async function callClaudeMatch(
  apiKey: string,
  model: string,
  fields: AiMatchField[],
): Promise<AiMatchResult[]> {
  if (!apiKey || fields.length === 0) return [];

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        output_config: {
          format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
        },
        messages: [{ role: 'user', content: buildPrompt(fields) }],
      }),
    });

    if (!res.ok) {
      console.warn('[CampaignOS] Claude match request failed', res.status);
      return [];
    }

    const data = (await res.json()) as {
      stop_reason?: string;
      content?: { type: string; text?: string }[];
    };
    if (data.stop_reason === 'refusal') return [];

    const textBlock = data.content?.find((b) => b.type === 'text' && b.text);
    if (!textBlock?.text) return [];

    const parsed = JSON.parse(textBlock.text) as { matches?: AiMatchResult[] };
    return Array.isArray(parsed.matches) ? parsed.matches : [];
  } catch (err) {
    console.warn('[CampaignOS] Claude match error', err);
    return [];
  }
}
