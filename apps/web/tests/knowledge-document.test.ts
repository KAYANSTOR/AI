import { describe, expect, test } from 'bun:test'
import { deflateRawSync } from 'node:zlib'
import { extractDocxText, extractDocxTextFromXml } from '@/lib/knowledge/document-parser'
import { formatKnowledgeEmbeddingInput } from '@/lib/knowledge/embeddings'

function makeDocx(xml: string): Buffer {
  const name = Buffer.from('word/document.xml')
  const raw = Buffer.from(xml, 'utf8')
  const compressed = deflateRawSync(raw)

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(8, 8)
  local.writeUInt32LE(compressed.length, 18)
  local.writeUInt32LE(raw.length, 22)
  local.writeUInt16LE(name.length, 26)
  const localRecord = Buffer.concat([local, name, compressed])

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(compressed.length, 20)
  central.writeUInt32LE(raw.length, 24)
  central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(0, 42)
  const centralRecord = Buffer.concat([central, name])

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(centralRecord.length, 12)
  end.writeUInt32LE(localRecord.length, 16)

  return Buffer.concat([localRecord, centralRecord, end])
}

describe('knowledge document extraction', () => {
  test('extracts Arabic Word paragraphs, tabs, and XML entities', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>سياسة الإلغاء &amp; الاسترداد</w:t></w:r></w:p><w:p><w:r><w:t>المبلغ</w:t><w:tab/><w:t>100 ريال</w:t></w:r></w:p></w:body></w:document>'
    expect(extractDocxTextFromXml(xml)).toBe('سياسة الإلغاء & الاسترداد\nالمبلغ\t100 ريال')
  })

  test('reads and decompresses the main XML part from a DOCX container', () => {
    const docx = makeDocx('<w:document><w:body><w:p><w:r><w:t>معلومات المؤسسة</w:t></w:r></w:p></w:body></w:document>')
    expect(extractDocxText(docx)).toBe('معلومات المؤسسة')
  })

  test('rejects a non-ZIP or incomplete DOCX instead of accepting binary garbage', () => {
    expect(() => extractDocxText(Buffer.from('not-a-docx'))).toThrow()
  })
})

describe('Gemini semantic embedding input', () => {
  test('formats query and document instructions as required for asymmetric retrieval', () => {
    expect(formatKnowledgeEmbeddingInput('ما سياسة الإلغاء؟', 'query')).toBe('task: search result | query: ما سياسة الإلغاء؟')
    expect(formatKnowledgeEmbeddingInput('قبل 24 ساعة', 'document', 'سياسة الإلغاء')).toBe('title: سياسة الإلغاء | text: قبل 24 ساعة')
  })

  test('uses a stable title placeholder for untitled document chunks', () => {
    expect(formatKnowledgeEmbeddingInput('محتوى', 'document')).toBe('title: none | text: محتوى')
  })
})
