'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { edtfColumns, parseEdtf } from '@/lib/edtf';
import { disconnect } from '@/lib/drive';
import {
  beginEnrollment,
  activateEnrollment,
  disableTotp,
  regenerateRecoveryCodes,
} from '@/lib/two-factor';

/** 빈 문자열은 NULL 로. 상속 필드에서 ''과 NULL 은 뜻이 다르다. */
function nz(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

// ---------------------------------------------------------------- 2단계 인증

export async function startEnrollment() {
  await requireAdmin();
  await beginEnrollment();
  revalidatePath('/admin/security');
  redirect('/admin/security');
}

export async function confirmEnrollment(formData: FormData) {
  await requireAdmin();
  const codes = await activateEnrollment(String(formData.get('code') ?? ''));
  if (!codes) {
    redirect(`/admin/security?error=${encodeURIComponent('코드가 맞지 않습니다. 앱에 뜬 6자리를 다시 확인해 주세요.')}`);
  }
  // 복구 코드는 이 한 번만 보여준다. 어디에도 원본을 남기지 않는다.
  redirect(`/admin/security?codes=${encodeURIComponent(codes.join(','))}`);
}

export async function newRecoveryCodes(formData: FormData) {
  await requireAdmin();
  const codes = await regenerateRecoveryCodes(String(formData.get('code') ?? ''));
  if (!codes) {
    redirect(`/admin/security?error=${encodeURIComponent('코드가 맞지 않습니다.')}`);
  }
  redirect(`/admin/security?codes=${encodeURIComponent(codes.join(','))}`);
}

export async function turnOffTotp(formData: FormData) {
  await requireAdmin();
  const ok = await disableTotp(String(formData.get('code') ?? ''));
  if (!ok) {
    redirect(`/admin/security?error=${encodeURIComponent('코드가 맞지 않습니다.')}`);
  }
  revalidatePath('/admin/security');
  redirect(`/admin/security?done=${encodeURIComponent('2단계 인증을 껐습니다.')}`);
}

/** Google Drive 연결 해제. Drive 의 파일과 기술 정보는 그대로 남는다. */
export async function disconnectDrive() {
  await requireAdmin();
  await disconnect();
  revalidatePath('/admin/storage');
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

// ---------------------------------------------------------------- 큐레이션
//
// 이야기는 자료가 아니라 자료를 가리키는 묶음이다. 여기서 하는 일은
// 원 자료를 고치는 것이 아니라 가리키는 순서와 큐레이터의 말을 바꾸는 것뿐이다.

export async function createStory(formData: FormData) {
  await requireAdmin();
  const title = nz(formData.get('title'));
  if (!title) redirect('/admin/curation?error=' + encodeURIComponent('이야기 제목이 필요합니다.'));

  const { data, error } = await db()
    .from('collection')
    .insert({
      title,
      kind: 'story',
      summary: nz(formData.get('summary')),
      period_edtf: nz(formData.get('period_edtf')),
    })
    .select('id')
    .single();

  if (error) throw new Error(`이야기 만들기 실패: ${error.message}`);
  revalidatePath('/admin/curation');
  redirect(`/admin/curation/${data.id}`);
}

export async function updateStory(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('collection_id') ?? '');
  const { error } = await db()
    .from('collection')
    .update({
      title: nz(formData.get('title')),
      summary: nz(formData.get('summary')),
      period_edtf: nz(formData.get('period_edtf')),
      cover_item_id: nz(formData.get('cover_item_id')),
    })
    .eq('id', id);

  if (error) throw new Error(`이야기 수정 실패: ${error.message}`);
  revalidatePath(`/admin/curation/${id}`);
  revalidatePath(`/stories/${id}`);
  redirect(`/admin/curation/${id}`);
}

export async function addBlock(formData: FormData) {
  await requireAdmin();
  const collectionId = String(formData.get('collection_id') ?? '');
  const kind = String(formData.get('kind') ?? 'text');

  // 맨 뒤에 붙인다. position 은 (collection_id, position) 유일 제약이 걸려
  // 있으므로 빈 자리를 찾지 말고 지금 최대값 다음을 쓴다.
  const { data: last } = await db()
    .from('curation_block')
    .select('position')
    .eq('collection_id', collectionId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db().from('curation_block').insert({
    collection_id: collectionId,
    position: (last?.position ?? -1) + 1,
    kind,
  });

  if (error) throw new Error(`블록 추가 실패: ${error.message}`);
  revalidatePath(`/admin/curation/${collectionId}`);
  redirect(`/admin/curation/${collectionId}`);
}

export async function updateBlock(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('block_id') ?? '');
  const collectionId = String(formData.get('collection_id') ?? '');
  const tc = nz(formData.get('timecode_ms'));

  const { error } = await db()
    .from('curation_block')
    .update({
      body: nz(formData.get('body')),
      caption: nz(formData.get('caption')),
      speaker_id: nz(formData.get('speaker_id')),
      timecode_ms: tc ? Number(tc) : null,
    })
    .eq('id', id);

  if (error) throw new Error(`블록 수정 실패: ${error.message}`);
  revalidatePath(`/admin/curation/${collectionId}`);
  revalidatePath(`/stories/${collectionId}`);
  redirect(`/admin/curation/${collectionId}`);
}

/**
 * 블록 순서 바꾸기.
 *
 * (collection_id, position) 에 유일 제약이 걸려 있어 두 행의 값을 그냥
 * 맞바꾸면 중간에 충돌한다. 한쪽을 잠깐 음수로 빼 두고 세 번에 나눠 옮긴다.
 * 트랜잭션이 아니라 세 번의 왕복이지만, 관리자 한 사람이 쓰는 화면이라
 * 그 사이에 끼어들 사람이 없다.
 */
export async function moveBlock(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('blockId') ?? formData.get('block_id') ?? '');
  const dir = String(formData.get('dir') ?? formData.get('direction') ?? 'up') === 'up' ? -1 : 1;

  const supabase = db();
  const { data: me } = await supabase
    .from('curation_block')
    .select('id, position, collection_id')
    .eq('id', id)
    .maybeSingle();
  if (!me) redirect('/admin/curation');
  const collectionId = me.collection_id;

  const { data: neighbour } = await supabase
    .from('curation_block')
    .select('id, position')
    .eq('collection_id', collectionId)
    .eq('position', me.position + dir)
    .maybeSingle();
  // 끝에서 더 밀면 아무 일도 하지 않는다.
  if (!neighbour) redirect(`/admin/curation/${collectionId}`);

  await supabase.from('curation_block').update({ position: -1 }).eq('id', me.id);
  await supabase.from('curation_block').update({ position: me.position }).eq('id', neighbour.id);
  await supabase.from('curation_block').update({ position: neighbour.position }).eq('id', me.id);

  revalidatePath(`/admin/curation/${collectionId}`);
  revalidatePath(`/stories/${collectionId}`);
  redirect(`/admin/curation/${collectionId}`);
}

export async function removeBlock(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('blockId') ?? formData.get('block_id') ?? '');

  const { data: blk } = await db()
    .from('curation_block')
    .select('collection_id')
    .eq('id', id)
    .maybeSingle();
  if (!blk) redirect('/admin/curation');
  const collectionId = blk.collection_id;

  const { error } = await db().from('curation_block').delete().eq('id', id);
  if (error) throw new Error(`블록 지우기 실패: ${error.message}`);

  // 빈 자리가 생겨도 position 은 순서만 정하므로 다시 매기지 않는다.
  // 촘촘하게 유지하려다 매번 전체를 다시 쓰는 편이 더 위험하다.
  revalidatePath(`/admin/curation/${collectionId}`);
  revalidatePath(`/stories/${collectionId}`);
  redirect(`/admin/curation/${collectionId}`);
}

export async function addRef(formData: FormData) {
  await requireAdmin();
  const blockId = String(formData.get('blockId') ?? formData.get('block_id') ?? '');
  const itemId = String(formData.get('itemId') ?? formData.get('item_id') ?? '');

  const { data: blk } = await db()
    .from('curation_block')
    .select('collection_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!blk) redirect('/admin/curation');
  const collectionId = blk.collection_id;

  const { data: last } = await db()
    .from('curation_ref')
    .select('sort_order')
    .eq('block_id', blockId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  // 같은 자료를 두 번 넣어도 조용히 넘어간다 — 두 번 누른 것뿐이다.
  const { error } = await db()
    .from('curation_ref')
    .upsert(
      { block_id: blockId, item_id: itemId, sort_order: (last?.sort_order ?? -1) + 1 },
      { onConflict: 'block_id,item_id', ignoreDuplicates: true },
    );

  if (error) throw new Error(`자료 넣기 실패: ${error.message}`);
  revalidatePath(`/admin/curation/${collectionId}`);
  revalidatePath(`/stories/${collectionId}`);
  redirect(`/admin/curation/${collectionId}`);
}

export async function removeRef(formData: FormData) {
  await requireAdmin();
  const blockId = String(formData.get('blockId') ?? formData.get('block_id') ?? '');
  const itemId = String(formData.get('itemId') ?? formData.get('item_id') ?? '');

  const { data: blk } = await db()
    .from('curation_block')
    .select('collection_id')
    .eq('id', blockId)
    .maybeSingle();
  if (!blk) redirect('/admin/curation');
  const collectionId = blk.collection_id;

  const { error } = await db()
    .from('curation_ref')
    .delete()
    .eq('block_id', blockId)
    .eq('item_id', itemId);

  if (error) throw new Error(`자료 빼기 실패: ${error.message}`);
  revalidatePath(`/admin/curation/${collectionId}`);
  revalidatePath(`/stories/${collectionId}`);
  redirect(`/admin/curation/${collectionId}`);
}

// ---------------------------------------------------------------- 히어로 편성

/**
 * 첫 화면의 자리 하나를 정한다.
 *
 * 고른 이야기이거나 자동 종류이거나 — 둘 다 채우면 DB 가 막는다. 어느 쪽이
 * 참인지 판단할 근거가 없기 때문이다. 화면에서도 하나만 고르게 하지만,
 * 여기서 한 번 더 비워 준다.
 */
export async function setHeroSlot(formData: FormData) {
  await requireAdmin();
  const slot = Number(formData.get('slot') ?? 0);
  const collectionId = nz(formData.get('collectionId'));
  const autoKind = nz(formData.get('autoKind'));

  const row = {
    slot,
    // 고른 이야기가 있으면 그쪽이 이긴다. 둘 다 채우면 DB 가 막는다 —
    // 어느 쪽이 참인지 판단할 근거가 없기 때문이다.
    collection_id: collectionId,
    auto_kind: collectionId ? null : autoKind,
    starts_on: nz(formData.get('startsOn')),
    ends_on: nz(formData.get('endsOn')),
    modified_at: new Date().toISOString(),
  };

  const { error } = await db().from('hero_slot').upsert(row, { onConflict: 'slot' });
  if (error) throw new Error(`히어로 편성 실패: ${error.message}`);

  revalidatePath('/admin/hero');
  revalidatePath('/');
  redirect('/admin/hero');
}
