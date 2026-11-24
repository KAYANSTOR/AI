import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMediaMessageCache, extractMediaDescriptor, extractText, requestedMaxBytes, unwrapMessageContent } from '../src/media.js'

const key = { id: 'MSG1', remoteJid: '967777000111@s.whatsapp.net' }

describe('WhatsApp QR media descriptor', () => {
  test('captures image, ptt voice note and document metadata without bytes', () => {
    const image = extractMediaDescriptor({ key, message: { imageMessage: { mimetype: 'image/jpeg', fileLength: { low: 2048, high: 0 }, caption: 'كم سعره؟' } } })
    assert.deepEqual(image, { messageId: 'MSG1', kind: 'image', mimeType: 'image/jpeg', fileName: null, fileLength: 2048, seconds: null, ptt: false, caption: 'كم سعره؟' })
    const voice = extractMediaDescriptor({ key, message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 14, ptt: true, fileLength: 9000 } } })
    assert.equal(voice.kind, 'audio')
    assert.equal(voice.ptt, true)
    assert.equal(voice.seconds, 14)
    const doc = extractMediaDescriptor({ key, message: { documentMessage: { mimetype: 'application/pdf', fileName: 'menu.pdf', fileLength: 4096 } } })
    assert.equal(doc.kind, 'document')
    assert.equal(doc.fileName, 'menu.pdf')
  })

  test('unwraps ephemeral and view-once containers', () => {
    const ephemeral = { key, message: { ephemeralMessage: { message: { audioMessage: { mimetype: 'audio/ogg', ptt: true, seconds: 5 } } } } }
    assert.equal(extractMediaDescriptor(ephemeral).kind, 'audio')
    const viewOnce = { key, message: { viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/png', caption: 'سري' } } } } }
    assert.equal(extractMediaDescriptor(viewOnce).caption, 'سري')
    const nested = { key, message: { ephemeralMessage: { message: { viewOnceMessage: { message: { imageMessage: { mimetype: 'image/webp' } } } } } } }
    assert.equal(extractMediaDescriptor(nested).mimeType, 'image/webp')
    assert.equal(extractText({ message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'مرحبا' } } } } }), 'مرحبا')
    const withCaption = { key, message: { documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'text/csv', caption: 'الأسعار' } } } } }
    assert.equal(extractMediaDescriptor(withCaption).caption, 'الأسعار')
    assert.equal(unwrapMessageContent(null), null)
  })

  test('plain text has no media descriptor', () => {
    assert.equal(extractMediaDescriptor({ key, message: { conversation: 'hi' } }), null)
  })

  test('message cache expires and is bounded', () => {
    let clock = 0
    const cache = createMediaMessageCache({ ttlMs: 1000, max: 2, now: () => clock })
    cache.set('c', { key: { id: 'a' } }); cache.set('c', { key: { id: 'b' } }); cache.set('c', { key: { id: 'c' } })
    assert.equal(cache.get('c', 'a'), null)
    assert.ok(cache.get('c', 'b'))
    clock = 5000
    assert.equal(cache.get('c', 'b'), null)
  })

  test('requested max bytes never exceeds the hard 5 MB cap', () => {
    assert.equal(requestedMaxBytes('2097152'), 2097152)
    assert.equal(requestedMaxBytes('999999999'), 5 * 1024 * 1024)
    assert.equal(requestedMaxBytes('abc'), 5 * 1024 * 1024)
  })
})
