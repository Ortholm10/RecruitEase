import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createGroq } from '@ai-sdk/groq';
import { generateObject } from 'ai';
import type { ZodSchema } from 'zod';

// Fail fast per HTTP attempt: a hung or incompatible model aborts at 20s
// (aborts are not retried, so it drops straight to the fallback). Rate-limit
// waits BETWEEN attempts are left alone: Groq's free tier is 8k tokens/min and
// one candidate needs ~9k, so 429 + retry-after (~10s) is normal mid-batch and
// the SDK's retry handles it. The total cap keeps one call from stalling a batch.
const ATTEMPT_TIMEOUT_MS = 20_000;
const CALL_TIMEOUT_MS = 60_000;

const timedFetch: typeof fetch = async (url, init) => {
  const attempt = AbortSignal.timeout(ATTEMPT_TIMEOUT_MS);
  const res = await fetch(url, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, attempt]) : attempt,
  });
  if (!res.ok) {
    console.warn('[ai] HTTP', res.status, String(url), 'retry-after:', res.headers.get('retry-after'));
  }
  return res;
};

const groq = createGroq({ fetch: timedFetch });
const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY, fetch: timedFetch });

// Groq first: it supports structured output and answers in ~6s. The free
// Nemotron endpoint doesn't support response_format (OpenRouter silently
// drops it), so it stays only as a last resort.
const primaryModel = groq('openai/gpt-oss-120b');
const fallbackModel = openrouter('nvidia/nemotron-3.5-lightning:free');

/**
 * Structured-output call used by A2/A4/A5. Tries Groq first; on any failure
 * (timeout, bad JSON, rate limit that outlasts the retries) retries once
 * against the OpenRouter fallback before giving up for real.
 * Returns which model actually answered, for Extraction.modelVersion.
 */
export async function generateStructured<T>(opts: {
  schema: ZodSchema<T>;
  prompt: string;
  system?: string;
  temperature?: number;
}): Promise<{ object: T; model: string }> {
  try {
    const { object } = await generateObject({
      model: primaryModel,
      schema: opts.schema,
      prompt: opts.prompt,
      system: opts.system,
      temperature: opts.temperature,
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    return { object, model: primaryModel.modelId };
  } catch (err) {
    console.warn('[ai] primary model failed, falling back to OpenRouter:', err);
    const { object } = await generateObject({
      model: fallbackModel,
      schema: opts.schema,
      prompt: opts.prompt,
      system: opts.system,
      temperature: opts.temperature,
      abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    return { object, model: fallbackModel.modelId };
  }
}
