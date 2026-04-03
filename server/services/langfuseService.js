import { Langfuse } from 'langfuse';

let _client = null;

export function getLangfuse() {
  if (_client) return _client;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    return null;
  }
  const baseUrl = process.env.LANGFUSE_HOST || 'https://cloud.langfuse.com';
  _client = new Langfuse({
    publicKey,
    secretKey,
    baseUrl,
    flushAt: 1,           // send immediately after each event
    flushInterval: 2000   // also flush every 2s as backup
  });
  console.log(`✅ [Langfuse] Initialized — sending traces to ${baseUrl}`);
  return _client;
}

/**
 * Create a new Langfuse trace for a single agent chat turn.
 * Returns the trace object, or null if Langfuse is not configured.
 */
export function startTrace({ userId, sessionId, topic, writerName, message, provider, model }) {
  const lf = getLangfuse();
  if (!lf) {
    console.warn('[Langfuse] Skipping trace — LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set');
    return null;
  }
  const trace = lf.trace({
    name: 'agent-chat',
    userId: userId || 'anonymous',
    sessionId: sessionId || undefined,
    input: { message: message?.substring(0, 2000) },
    metadata: {
      topic: topic || '',
      writerName: writerName || '',
      provider,
      model
    }
  });
  console.log(`[Langfuse] Trace created — userId: ${userId || 'anonymous'} | sessionId: ${sessionId || 'n/a'} | traceId: ${trace.id}`);
  return trace;
}

export async function flushLangfuse() {
  if (_client) {
    try {
      await _client.flushAsync();
    } catch (err) {
      console.error('[Langfuse] Flush error:', err.message);
    }
  }
}
