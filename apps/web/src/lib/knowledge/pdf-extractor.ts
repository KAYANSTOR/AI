export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (process.env.KNOWLEDGE_DOCUMENT_EXTRACTION_ENABLED !== 'true') {
    throw new Error('فعّل KNOWLEDGE_DOCUMENT_EXTRACTION_ENABLED=true بعد مراجعة سياسة إرسال المستندات إلى Gemini.')
  }
  if (!apiKey) throw new Error('استخراج PDF يحتاج إلى إعداد مفتاح Gemini في الخادم.')

  const model = process.env.KNOWLEDGE_DOCUMENT_MODEL?.trim() || 'gemini-3.8-flash'
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text: [
                'Extract the text that is actually present in this PDF document.',
                'Preserve the original language, Arabic wording, numbers, names, headings, and table rows.',
                'Keep reading order and use new lines between paragraphs and table rows.',
                'Do not summarize, translate, infer missing text, add explanations, or invent content.',
                'When a region is unreadable, write [غير مقروء] rather than guessing.',
                'Return only the extracted document text.',
              ].join(' '),
            },
            {
              inline_data: {
                mime_type: 'application/pdf',
                data: Buffer.from(bytes).toString('base64'),
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 12000,
        },
      }),
      signal: AbortSignal.timeout(55_000),
    }
  )

  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { error?: { message?: string } }
    console.error('PDF text extraction failed', { status: response.status })
    throw new Error(detail.error?.message || 'تعذّر استخراج النص من ملف PDF عبر Gemini.')
  }

  const payload = await response.json() as {
    candidates?: Array<{
      finishReason?: string
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const candidate = payload.candidates?.[0]
  const text = candidate?.content?.parts?.map((part) => part.text ?? '').join('\n').trim() ?? ''
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('المستند طويل ولم يكتمل استخراجه. قسّمه إلى ملفات أصغر ثم أعد رفعها.')
  }
  if (!text) throw new Error('لم يتم العثور على نص قابل للاستخراج في ملف PDF.')
  return text
}
