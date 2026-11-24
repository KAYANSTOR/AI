import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import {
  embedKnowledgeText,
  KNOWLEDGE_EMBEDDING_MODEL,
} from '@/lib/knowledge/embeddings'
import { memoryContentHash } from '@/lib/personal-assistant/memory-normalize'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CATEGORIES = ['fact', 'preference', 'contact', 'project', 'document'] as const
type MemoryCategory = (typeof CATEGORIES)[number]
const MAX_CONTENT_CHARS = 500
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type MemoryRequest = {
  id?: unknown
  category?: unknown
  content?: unknown
}

async function getMemoryContext() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  return { db: access.db, userId: access.owner.userId, organizationId: access.owner.organizationId }
}

function parseBody(value: unknown): MemoryRequest | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as MemoryRequest)
    : null
}

function isCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value)
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

function databaseError() {
  return NextResponse.json({ error: 'memory_request_failed' }, { status: 500 })
}

export async function GET() {
  const context = await getMemoryContext()
  if (context instanceof NextResponse) return context

  const { data, error } = await context.db
    .from('user_memories')
    .select('id, category, content, confidence, updated_at')
    .eq('organization_id', context.organizationId)
    .eq('user_id', context.userId)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (error) {
    console.error('personal_memory_list_failed', error.code)
    return databaseError()
  }
  return NextResponse.json({ memories: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const context = await getMemoryContext()
  if (context instanceof NextResponse) return context

  const body = parseBody(await request.json().catch(() => null))
  if (!body) return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  if (!isCategory(body.category)) return NextResponse.json({ error: 'invalid_category' }, { status: 400 })
  if (typeof body.content !== 'string') return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
  const content = body.content.trim().slice(0, MAX_CONTENT_CHARS)
  if (!content) return NextResponse.json({ error: 'empty_content' }, { status: 400 })

  const embedding = await embedKnowledgeText(content, 'document', 'Personal memory')
  const { data, error } = await context.db
    .from('user_memories')
    .insert({
      organization_id: context.organizationId,
      user_id: context.userId,
      category: body.category,
      content,
      content_hash: memoryContentHash(content),
      content_embedding: embedding,
      embedding_model: embedding ? KNOWLEDGE_EMBEDDING_MODEL : null,
      confidence: 0.95,
    })
    .select('id')
    .maybeSingle()

  if (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: 'duplicate_memory' }, { status: 409 })
    console.error('personal_memory_create_failed', error.code)
    return databaseError()
  }
  return NextResponse.json({ ok: true, id: data?.id }, { status: 201 })
}

export async function PATCH(request: Request) {
  const context = await getMemoryContext()
  if (context instanceof NextResponse) return context

  const body = parseBody(await request.json().catch(() => null))
  if (!body || typeof body.id !== 'string' || !UUID_RE.test(body.id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (body.category !== undefined) {
    if (!isCategory(body.category)) return NextResponse.json({ error: 'invalid_category' }, { status: 400 })
    updates.category = body.category
  }
  if (body.content !== undefined) {
    if (typeof body.content !== 'string') return NextResponse.json({ error: 'invalid_content' }, { status: 400 })
    const content = body.content.trim().slice(0, MAX_CONTENT_CHARS)
    if (!content) return NextResponse.json({ error: 'empty_content' }, { status: 400 })
    const embedding = await embedKnowledgeText(content, 'document', 'Personal memory')
    updates.content = content
    updates.content_hash = memoryContentHash(content)
    updates.content_embedding = embedding
    updates.embedding_model = embedding ? KNOWLEDGE_EMBEDDING_MODEL : null
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'nothing_to_update' }, { status: 400 })
  }

  const { data, error } = await context.db
    .from('user_memories')
    .update(updates)
    .eq('id', body.id)
    .eq('organization_id', context.organizationId)
    .eq('user_id', context.userId)
    .select('id')
    .maybeSingle()

  if (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: 'duplicate_memory' }, { status: 409 })
    console.error('personal_memory_update_failed', error.code)
    return databaseError()
  }
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const context = await getMemoryContext()
  if (context instanceof NextResponse) return context

  const id = new URL(request.url).searchParams.get('id')
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: 'invalid_id' }, { status: 400 })

  const { data, error } = await context.db
    .from('user_memories')
    .delete()
    .eq('id', id)
    .eq('organization_id', context.organizationId)
    .eq('user_id', context.userId)
    .select('id')

  if (error) {
    console.error('personal_memory_delete_failed', error.code)
    return databaseError()
  }
  if (!data?.length) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
