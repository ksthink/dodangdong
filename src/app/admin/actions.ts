'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { edtfColumns, parseEdtf } from '@/lib/edtf';

/** 빈 문자열은 NULL 로. 상속 필드에서 ''과 NULL 은 뜻이 다르다. */
function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

export async function createAcquisition(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const { data, error } = await supabase
    .from('acquisition')
    .insert({
      visited_on: nz(formData.get('visited_on')) ?? new Date().toISOString().slice(0, 10),
      from_label: nz(formData.get('from_label')),
      location: nz(formData.get('location')),
      note: nz(formData.get('note')),
    })
    .select('id')
    .single();
  if (error) throw new Error(`수집 세션 생성 실패: ${error.message}`);
  revalidatePath('/admin/acquisitions');
  redirect(`/admin/acquisitions?created=${data.id}`);
}

export async function createBundle(formData: FormData) {
  await requireAdmin();
  const supabase = db();

  const periodEdtf = nz(formData.get('period_edtf'));
  const parsed = parseEdtf(periodEdtf);

  const { data, error } = await supabase
    .from('bundle')
    .insert({
      acquisition_id: nz(formData.get('acquisition_id')),
      title: nz(formData.get('title')) ?? '이름 없는 묶음',
      kind: nz(formData.get('kind')) ?? 'folder',
      source: nz(formData.get('source')) ?? '출처 미상',
      provenance: nz(formData.get('provenance')),
      place_id: nz(formData.get('place_id')),
      rights: nz(formData.get('rights')),
      default_access_level: nz(formData.get('default_access_level')) ?? 'family',
      period_edtf: periodEdtf,
      period_start: parsed.start,
      period_end: parsed.end,
      digitized_by: nz(formData.get('digitized_by')),
      digitized_on: nz(formData.get('digitized_on')),
      note: nz(formData.get('note')),
    })
    .select('id')
    .single();

  if (error) throw new Error(`묶음 생성 실패: ${error.message}`);
  revalidatePath('/admin');
  redirect(`/admin/bundles/${data.id}`);
}

export async function updateBundle(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const id = String(formData.get('id'));

  const periodEdtf = nz(formData.get('period_edtf'));
  const parsed = parseEdtf(periodEdtf);

  const { error } = await supabase
    .from('bundle')
    .update({
      title: nz(formData.get('title')) ?? '이름 없는 묶음',
      kind: nz(formData.get('kind')) ?? 'folder',
      source: nz(formData.get('source')) ?? '출처 미상',
      provenance: nz(formData.get('provenance')),
      rights: nz(formData.get('rights')),
      default_access_level: nz(formData.get('default_access_level')) ?? 'family',
      period_edtf: periodEdtf,
      period_start: parsed.start,
      period_end: parsed.end,
      digitized_by: nz(formData.get('digitized_by')),
      note: nz(formData.get('note')),
    })
    .eq('id', id);

  if (error) throw new Error(`묶음 수정 실패: ${error.message}`);
  await supabase.from('event_log').insert({ bundle_id: id, action: 'bundle_update' });
  revalidatePath(`/admin/bundles/${id}`);
}

export async function updateItem(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const id = String(formData.get('id'));

  const { data: before } = await supabase.from('item').select('*').eq('id', id).single();

  const patch: Record<string, unknown> = {
    title: nz(formData.get('title')) ?? '제목 없음',
    type: String(formData.get('type')),
    description: nz(formData.get('description')),
    creator: nz(formData.get('creator')),
    medium: nz(formData.get('medium')),
    extent: nz(formData.get('extent')),
    language: nz(formData.get('language')),
    is_featured: formData.get('is_featured') === 'on',
    // 상속 필드 — 비우면 다시 묶음 값을 물려받는다
    source: nz(formData.get('source')),
    provenance: nz(formData.get('provenance')),
    rights: nz(formData.get('rights')),
    access_level: nz(formData.get('access_level')),
    place_id: nz(formData.get('place_id')),
    ...edtfColumns(nz(formData.get('created_edtf'))),
  };

  const { error } = await supabase.from('item').update(patch).eq('id', id);
  if (error) throw new Error(`자료 수정 실패: ${error.message}`);

  await supabase.from('event_log').insert({
    item_id: id,
    action: 'item_update',
    before,
    after: patch,
  });

  revalidatePath(`/admin/items/${id}`);
  revalidatePath(`/item/${id}`);
  revalidatePath('/');
}

/** 인물 연결. 같은 사람을 다른 역할로 여러 번 붙일 수 있다. */
export async function linkPerson(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id'));
  const personId = nz(formData.get('person_id'));
  const role = String(formData.get('role') ?? 'depicted');
  if (!personId) return;

  await supabase.from('item_person').upsert({ item_id: itemId, person_id: personId, role });
  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/item/${itemId}`);
}

export async function unlinkPerson(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id'));
  const personId = String(formData.get('person_id'));
  const role = String(formData.get('role'));
  await supabase
    .from('item_person')
    .delete()
    .eq('item_id', itemId)
    .eq('person_id', personId)
    .eq('role', role);
  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/item/${itemId}`);
}

export async function createPerson(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const aliases = String(formData.get('aliases') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const { error } = await supabase.from('person').insert({
    display_name: nz(formData.get('display_name')) ?? '이름 미상',
    aliases,
    relation_to_root: nz(formData.get('relation_to_root')),
    birth_edtf: nz(formData.get('birth_edtf')),
    death_edtf: nz(formData.get('death_edtf')),
    note: nz(formData.get('note')),
  });
  if (error) throw new Error(`인물 등록 실패: ${error.message}`);
  revalidatePath('/admin/people');
  revalidatePath('/people');
}

/**
 * 일괄 편집 — 묶음 안의 여러 자료에 같은 값을 한 번에.
 * 수천 장을 다룰 때 실제로 시간을 아껴주는 유일한 도구다.
 */
export async function bulkUpdateItems(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const bundleId = String(formData.get('bundle_id'));
  const ids = formData.getAll('item_ids').map(String);
  if (ids.length === 0) return;

  const patch: Record<string, unknown> = {};
  const edtf = nz(formData.get('created_edtf'));
  if (edtf) Object.assign(patch, edtfColumns(edtf));
  const access = nz(formData.get('access_level'));
  if (access) patch.access_level = access;
  const type = nz(formData.get('type'));
  if (type) patch.type = type;
  if (formData.get('mark_featured') === 'on') patch.is_featured = true;

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from('item').update(patch).in('id', ids);
  if (error) throw new Error(`일괄 편집 실패: ${error.message}`);

  await supabase.from('event_log').insert({
    bundle_id: bundleId,
    action: 'bulk_update',
    after: { ids, patch },
  });

  revalidatePath(`/admin/bundles/${bundleId}`);
  revalidatePath('/');
}

export async function createCollection(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const { error } = await supabase.from('collection').insert({
    title: nz(formData.get('title')) ?? '이름 없는 모음집',
    kind: nz(formData.get('kind')) ?? 'topic',
    description: nz(formData.get('description')),
    period_edtf: nz(formData.get('period_edtf')),
  });
  if (error) throw new Error(`모음집 생성 실패: ${error.message}`);
  revalidatePath('/admin/collections');
  revalidatePath('/collections');
}

export async function addToCollection(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id'));
  const collectionId = nz(formData.get('collection_id'));
  if (!collectionId) return;
  await supabase.from('item_collection').upsert({ item_id: itemId, collection_id: collectionId });

  // 표지가 비어 있으면 첫 자료를 표지로 삼는다.
  const { data: col } = await supabase
    .from('collection')
    .select('cover_item_id')
    .eq('id', collectionId)
    .single();
  if (col && !col.cover_item_id) {
    await supabase.from('collection').update({ cover_item_id: itemId }).eq('id', collectionId);
  }

  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/collections/${collectionId}`);
  revalidatePath('/collections');
}

/** 삭제는 없다. 보관 상태로 내려갈 뿐이다. */
export async function archiveItem(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const id = String(formData.get('id'));
  const archived = formData.get('archived') === 'true';
  await supabase.from('item').update({ is_archived: archived }).eq('id', id);
  await supabase
    .from('event_log')
    .insert({ item_id: id, action: archived ? 'archive' : 'unarchive' });
  revalidatePath(`/admin/items/${id}`);
  revalidatePath('/');
}
