/**
 * Voice-note transcription with multimodal Gemini (inline audio).
 * The transcript is returned as plain text and then handled like a typed message.
 */
type FetchLike = typeof fetch

export async function transcribeAudioWithGemini(
  audio: { bytes: Buffer; mimeType: string },
  options: { apiKey?: string; model?: string; fetchImpl?: FetchLike } = {}
): Promise<string> {
  const apiKey = (options.apiKey ?? process.env.GEMINI_API_KEY ?? '').trim()
  if (!apiKey) throw new Error('transcription_unavailable')
  const model = options.model ?? process.env.GEMINI_TRANSCRIBE_MODEL ?? process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite-preview'
  const response = await (options.fetchImpl ?? fetch)(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            { text: 'فرّغ هذه الرسالة الصوتية نصاً حرفياً بلهجتها كما هي، دون شرح أو إضافة. إذا لم يكن فيها كلام واضح أعد سطراً فارغاً.' },
            { inline_data: { mime_type: audio.mimeType, data: audio.bytes.toString('base64') } },
          ],
        }],
        generationConfig: { temperature: 0 },
      }),
    }
  )
  if (!response.ok) throw new Error(`transcription_http_${response.status}`)
  const json = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  return (json.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('').trim().slice(0, 4000)
}
