import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) throw new Error('DATABASE_URL is required for knowledge runtime verification.')

const hostname = new URL(databaseUrl).hostname
const sql = postgres(databaseUrl, {
  max: 1,
  ssl: hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.railway.internal') ? false : 'require',
  onnotice: () => undefined,
})

const rollback = new Error('ROLLBACK_KNOWLEDGE_RUNTIME_VERIFICATION')
const organizationId = randomUUID()
const vector = Array.from({ length: 768 }, (_value, index) => index === 0 ? 1 : 0)
const fileBytes = Buffer.from('kayan-knowledge-source-file', 'utf8')
const fileBase64 = fileBytes.toString('base64')
const contentHash = 'a'.repeat(64)

try {
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(
        'INSERT INTO public.organizations (id, name) VALUES ($1, $2)',
        [organizationId, 'Knowledge CI verification']
      )

      const documentResult = await tx.unsafe(
        `SELECT public.ingest_knowledge_document(
          $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::jsonb
        ) AS id`,
        [
          organizationId,
          'ci-knowledge.txt',
          'text/plain',
          contentHash,
          'Document content for semantic retrieval verification.',
          fileBase64,
          sql.json([{
            chunk_index: 0,
            content: 'Document content for semantic retrieval verification.',
            content_hash: 'b'.repeat(64),
            content_embedding: vector,
            embedding_model: 'gemini-embedding-2',
          }]),
        ]
      )
      const documentId = documentResult[0]?.id
      assert.ok(documentId, 'ingest RPC must return a document UUID')

      const storedFile = await tx.unsafe(
        'SELECT original_file = decode($2, \'base64\') AS preserved FROM public.knowledge_documents WHERE id = $1',
        [documentId, fileBase64]
      )
      assert.equal(storedFile[0]?.preserved, true, 'the uploaded original bytes must be preserved')

      const semanticMatches = await tx.unsafe(
        `SELECT id, title, score
         FROM public.search_knowledge_hybrid($1::uuid, $2::text, $3::jsonb, NULL, 5)`,
        [organizationId, 'a query with no literal overlap', sql.json(vector)]
      )
      assert.equal(semanticMatches.length, 1, 'semantic similarity must retrieve a chunk without lexical overlap')
      assert.ok(Number(semanticMatches[0].score) > 0.7, 'an identical vector should receive a high similarity score')

      const unrelatedVector = Array.from({ length: 768 }, (_value, index) => index === 1 ? 1 : 0)
      const unrelatedMatches = await tx.unsafe(
        `SELECT id FROM public.search_knowledge_hybrid($1::uuid, $2::text, $3::jsonb, NULL, 5)`,
        [organizationId, 'a completely unrelated query', sql.json(unrelatedVector)]
      )
      assert.equal(unrelatedMatches.length, 0, 'unrelated semantic vectors must not create weak false-positive matches')

      const chunkId = randomUUID()
      await tx.unsafe(
        `INSERT INTO public.knowledge_chunks
          (id, organization_id, document_id, chunk_index, content, content_hash)
         VALUES ($1, $2, $3, 1, $4, $5)`,
        [chunkId, organizationId, documentId, 'Legacy document chunk awaiting embedding', 'c'.repeat(64)]
      )
      const indexedChunk = await tx.unsafe(
        'SELECT public.update_knowledge_chunk_embedding($1::uuid, $2::uuid, $3::jsonb, $4::text) AS id',
        [organizationId, chunkId, sql.json(vector), 'gemini-embedding-2']
      )
      assert.equal(indexedChunk[0]?.id, chunkId, 'chunk backfill RPC must update only the scoped row')

      const aclRows = await tx.unsafe(
        `SELECT
          has_function_privilege('anon', 'public.search_knowledge_hybrid(uuid,text,jsonb,text,integer)', 'EXECUTE') AS anon_can_search,
          has_function_privilege('authenticated', 'public.search_knowledge_hybrid(uuid,text,jsonb,text,integer)', 'EXECUTE') AS member_can_search,
          has_function_privilege('anon', 'public.ingest_knowledge_document(uuid,text,text,text,text,text,jsonb)', 'EXECUTE') AS anon_can_ingest`
      )
      assert.equal(aclRows[0]?.anon_can_search, false, 'anonymous callers must not execute tenant knowledge search')
      assert.equal(aclRows[0]?.member_can_search, true, 'authenticated tenant members must execute knowledge search subject to RLS')
      assert.equal(aclRows[0]?.anon_can_ingest, false, 'anonymous callers must not ingest tenant documents')

      const factId = randomUUID()
      await tx.unsafe(
        `INSERT INTO public.knowledge_base
          (id, organization_id, title, content, category, is_active, content_hash)
         VALUES ($1, $2, $3, $4, $5, TRUE, $6)`,
        [factId, organizationId, 'Current title', 'Current content before revision', 'general', 'd'.repeat(64)]
      )
      const revisionUpdate = await tx.unsafe(
        `SELECT public.update_knowledge_with_revision(
          $1::uuid, $2::uuid, $3::text, $4::text, $5::text, $6::text,
          $7::jsonb, $8::text, $9::text, $10::text
        ) AS id`,
        [
          organizationId, factId, 'Updated title', 'Updated content',
          'general', 'e'.repeat(64), sql.json(vector), 'gemini-embedding-2',
          'CI revision test', 'update',
        ]
      )
      assert.equal(revisionUpdate[0]?.id, factId, 'revision update RPC must update the scoped fact')

      const revisionRows = await tx.unsafe(
        'SELECT revision_number, title, content FROM public.knowledge_revisions WHERE organization_id = $1 AND knowledge_id = $2',
        [organizationId, factId]
      )
      assert.equal(revisionRows.length, 1, 'an explicit update must append one previous revision')
      assert.equal(revisionRows[0].title, 'Current title')
      assert.equal(revisionRows[0].content, 'Current content before revision')

      throw rollback
    })
  } catch (error) {
    if (error !== rollback) throw error
  }
  console.log('Knowledge runtime verification passed: atomic ingestion, original bytes, hybrid semantic search, tenant-scoped chunk backfill, and revision snapshots.')
} finally {
  await sql.end({ timeout: 5 })
}
