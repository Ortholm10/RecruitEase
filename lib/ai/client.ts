import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { groq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import type { ZodSchema } from 'zod';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const primaryModel = openrouter('nvidia/nemotron-3.5-lightning:free');
const fallbackModel = groq('openai/gpt-oss-120b');

/**
 * Structured-output call used by A2/A4/A5. Tries the free OpenRouter
 * model first; on any failure (rate limit, timeout, bad JSON) retries
 * once against the Groq fallback before giving up for real.
 */
export async function generateStructured<T>(opts: {
  schema: ZodSchema<T>;
  prompt: string;
  system?: string;
}) {
  try {
    const { object } = await generateObject({
      model: primaryModel,
      schema: opts.schema,
      prompt: opts.prompt,
      system: opts.system,
    });
    return object;
  } catch (err) {
    console.warn('[ai] primary model failed, falling back to Groq:', err);
    const { object } = await generateObject({
      model: fallbackModel,
      schema: opts.schema,
      prompt: opts.prompt,
      system: opts.system,
    });
    return object;
  }
}
