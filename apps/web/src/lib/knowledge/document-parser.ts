import { inflateRawSync } from 'node:zlib'

const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024

function readUInt16(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buffer.length) throw new Error('ملف DOCX غير صالح.')
  return buffer.readUInt16LE(offset)
}

function readUInt32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) throw new Error('ملف DOCX غير صالح.')
  return buffer.readUInt32LE(offset)
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, number: string) => {
      const codePoint = Number(number)
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ''
    })
    .replace(/&#x([\da-f]+);/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16)
      return codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : ''
    })
}

export function extractDocxTextFromXml(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/?\s*>/g, '\t')
      .replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/g, '\n')
      .replace(/<\/w:p\s*>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Minimal, bounded DOCX reader for word/document.xml. No external XML parser or ZIP dependency. */
export function extractDocxText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes)
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error('الملف ليس مستند DOCX صالحاً.')
  }

  const eocdSearchStart = Math.max(0, buffer.length - 65_557)
  let eocdOffset = -1
  for (let offset = buffer.length - 22; offset >= eocdSearchStart; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) throw new Error('تعذّر قراءة بنية ملف DOCX.')

  const entryCount = readUInt16(buffer, eocdOffset + 10)
  const directoryOffset = readUInt32(buffer, eocdOffset + 16)
  let cursor = directoryOffset
  let documentXml: Buffer | null = null

  for (let index = 0; index < entryCount; index++) {
    if (readUInt32(buffer, cursor) !== 0x02014b50) {
      throw new Error('فهرس ملف DOCX غير صالح.')
    }

    const compressionMethod = readUInt16(buffer, cursor + 10)
    const compressedSize = readUInt32(buffer, cursor + 20)
    const uncompressedSize = readUInt32(buffer, cursor + 24)
    const nameLength = readUInt16(buffer, cursor + 28)
    const extraLength = readUInt16(buffer, cursor + 30)
    const commentLength = readUInt16(buffer, cursor + 32)
    const localHeaderOffset = readUInt32(buffer, cursor + 42)
    const nameStart = cursor + 46
    const entryName = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8')

    if (entryName === 'word/document.xml') {
      if (uncompressedSize > MAX_DOCX_XML_BYTES || compressedSize > buffer.length) {
        throw new Error('حجم محتوى DOCX بعد فك الضغط يتجاوز الحد المسموح.')
      }
      if ((readUInt16(buffer, cursor + 8) & 0x0001) !== 0) {
        throw new Error('المستند مشفّر ولا يمكن قراءته.')
      }
      if (readUInt32(buffer, localHeaderOffset) !== 0x04034b50) {
        throw new Error('بيانات DOCX الداخلية غير صالحة.')
      }
      const localNameLength = readUInt16(buffer, localHeaderOffset + 26)
      const localExtraLength = readUInt16(buffer, localHeaderOffset + 28)
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize)

      if (compressionMethod === 0) documentXml = compressed
      else if (compressionMethod === 8) documentXml = inflateRawSync(compressed, { maxOutputLength: MAX_DOCX_XML_BYTES })
      else throw new Error('طريقة ضغط DOCX غير مدعومة.')
      break
    }

    cursor = nameStart + nameLength + extraLength + commentLength
  }

  if (!documentXml) throw new Error('لم يتم العثور على نص المستند داخل DOCX.')
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(documentXml)
  return extractDocxTextFromXml(xml)
}
