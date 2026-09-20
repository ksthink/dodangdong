'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/access';
import { edtfColumns, parseEdtf, edtfYear } from '@/lib/edtf';
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
    doc_type: nz(formData.get('doc_type')),
    description: nz(formData.get('description')),
    // 생산자는 여기서 다루지 않는다 — 전거에서 고르는 칸이라 폼이 따로다
    // (setItemCreator). 여기에 두면 기술을 저장할 때마다 빈 값으로 덮어쓴다.
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
  // 빈 값을 String() 으로 감싸면 "null" 이라는 글자가 되어 uuid 열에 들어간다.
  // 묶음 화면에서 부르면 값이 있고, 기록 목록에서 부르면 없다 — 둘 다 옳다.
  const bundleId = nz(formData.get('bundle_id'));
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

  // 기록이 바뀐 사실은 남겨야 한다. 여기서 조용히 실패하면 무엇을 언제
  // 고쳤는지가 영영 사라지고, 그것을 알아차릴 방법도 없다.
  // 고치기 자체는 이미 끝났으므로 그 점을 문구에 적는다.
  const { error: logError } = await supabase.from('event_log').insert({
    bundle_id: bundleId,
    action: 'bulk_update',
    after: { ids, patch },
  });
  if (logError) {
    throw new Error(
      `기록은 고쳤지만 기록장에 남기지 못했습니다: ${logError.message}`,
    );
  }

  if (bundleId) revalidatePath(`/admin/bundles/${bundleId}`);
  revalidatePath('/admin');
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

// ---------------------------------------------------------------- 분류
//
// 네 축 가운데 사람이 손으로 세우는 것은 주제분류뿐이다. 형태·출처는 기록
// 자체에서 유도되므로 따로 만들 것이 없고, 시기분류는 인물의 생애에 매여 있어
// 인물 화면에서 다룬다. 여기서는 주제분류를 만들고 고치고, 기록에 주제·시기를
// 붙인다.

/**
 * 주제분류 만들기.
 *
 * 부모를 주지 않으면 상위 분류가 된다. 두 단계까지만 허용하는 것은 DB 의
 * 트리거가 지키므로 여기서 따로 세지 않는다 — 규칙이 두 군데 있으면 언젠가
 * 어긋난다. 같은 부모 아래 같은 이름도 DB 의 유일 제약이 막는다.
 */
export async function createSubject(formData: FormData) {
  await requireAdmin();
  const label = nz(formData.get('label'));
  if (!label) {
    redirect('/admin/classes?error=' + encodeURIComponent('분류 이름이 필요합니다.'));
  }
  const parentId = nz(formData.get('parent_id'));

  // 맨 뒤에 붙인다. sort_order 는 순서만 정하므로 빈 자리를 찾지 않는다.
  // PostgREST 에서 NULL 은 `.eq` 로 걸리지 않으므로 상위는 `.is` 로 좁힌다.
  const base = db().from('subject').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const { data: last } = await (parentId ? base.eq('parent_id', parentId) : base.is('parent_id', null)).maybeSingle();

  const { error } = await db().from('subject').insert({
    label,
    parent_id: parentId,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  if (error) throw new Error(`주제분류 만들기 실패: ${error.message}`);
  revalidatePath('/admin/classes');
  revalidatePath('/search');
  redirect('/admin/classes');
}

export async function renameSubject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('subject_id') ?? '');
  const label = nz(formData.get('label'));
  if (!label) {
    redirect('/admin/classes?error=' + encodeURIComponent('분류 이름이 필요합니다.'));
  }

  const { error } = await db().from('subject').update({ label }).eq('id', id);
  if (error) throw new Error(`주제분류 이름 고치기 실패: ${error.message}`);

  // 찾기 화면은 분류를 id 가 아니라 이름으로 주소에 싣는다(facets.ts). 이름을
  // 고치면 예전 이름으로 걸어둔 링크는 아무것도 찾지 못한다 — 화면에 그렇게 적어 둔다.
  revalidatePath('/admin/classes');
  revalidatePath('/search');
  redirect('/admin/classes');
}

/**
 * 주제분류 지우기.
 *
 * 하위가 있으면 외래키의 cascade 가 하위까지 함께 지운다. 기록에 걸어둔
 * 연결도 같이 사라진다 — 기록 자체는 그대로 남지만 그 분류로는 다시 찾지
 * 못한다. 되돌릴 수 없으므로 화면에서 미리 알린다.
 */
export async function removeSubject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('subject_id') ?? '');

  const { error } = await db().from('subject').delete().eq('id', id);
  if (error) throw new Error(`주제분류 지우기 실패: ${error.message}`);

  revalidatePath('/admin/classes');
  revalidatePath('/search');
  redirect('/admin/classes');
}

/**
 * 기록에 걸린 주제분류를 통째로 다시 세운다.
 *
 * 체크박스 폼은 켜진 것만 보내고 끈 것은 아예 보내지 않는다. 무엇이 빠졌는지
 * 알 길이 없으므로 이 기록의 연결을 전부 지우고 받은 것만 다시 넣는다.
 * 트랜잭션이 아니라 두 번의 왕복이지만, 관리자 한 사람이 쓰는 화면이라
 * 그 사이에 끼어들 사람이 없다(moveBlock 과 같은 판단이다).
 */
export async function setItemSubjects(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id') ?? '');
  const ids = [...new Set(formData.getAll('subject_ids').map(String).filter(Boolean))];

  const { error: clearErr } = await supabase.from('item_subject').delete().eq('item_id', itemId);
  if (clearErr) throw new Error(`주제분류 비우기 실패: ${clearErr.message}`);

  if (ids.length > 0) {
    const { error } = await supabase
      .from('item_subject')
      .insert(ids.map((subject_id) => ({ item_id: itemId, subject_id })));
    if (error) throw new Error(`주제분류 붙이기 실패: ${error.message}`);
  }

  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/item/${itemId}`);
  revalidatePath('/search');
  redirect(`/admin/items/${itemId}`);
}

/** 시기분류도 같은 방식으로 통째로 다시 세운다. */
export async function setItemPeriods(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id') ?? '');
  const ids = [...new Set(formData.getAll('life_period_ids').map(String).filter(Boolean))];

  const { error: clearErr } = await supabase
    .from('item_life_period')
    .delete()
    .eq('item_id', itemId);
  if (clearErr) throw new Error(`시기분류 비우기 실패: ${clearErr.message}`);

  if (ids.length > 0) {
    const { error } = await supabase
      .from('item_life_period')
      .insert(ids.map((life_period_id) => ({ item_id: itemId, life_period_id })));
    if (error) throw new Error(`시기분류 붙이기 실패: ${error.message}`);
  }

  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/item/${itemId}`);
  revalidatePath('/search');
  redirect(`/admin/items/${itemId}`);
}

// ---------------------------------------------------------------- 기록 목록의 일괄 처리
//
// 기록 목록에서 여러 줄을 골라 한 번에 처리한다. 공개 범위 바꾸기는 이미
// bulkUpdateItems 가 하고, 나머지 둘을 여기 둔다.

/**
 * 고른 기록을 다른 묶음으로 옮긴다.
 *
 * 스캔을 잘못 넣는 일은 실제로 생긴다. 옮기면 상속값도 함께 바뀐다 —
 * 출처·입수 경위·권리·공개 범위를 직접 넣지 않은 기록은 새 묶음의 값을
 * 따르게 된다. 그것이 옮기기의 뜻이다: 이 기록은 저기서 나온 것이었다.
 *
 * 직접 넣은 값(덮어쓴 것)은 그대로 남는다. 묶음을 옮긴다고 해서 사람이
 * 적어 둔 것을 지우지는 않는다.
 */
export async function moveItemsToBundle(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll('item_ids').map(String).filter(Boolean);
  const bundleId = nz(formData.get('bundle_id'));
  if (ids.length === 0 || !bundleId) redirect('/admin');

  const { error } = await db().from('item').update({ bundle_id: bundleId }).in('id', ids);
  if (error) throw new Error(`묶음 옮기기 실패: ${error.message}`);

  await db()
    .from('event_log')
    .insert(ids.map((id) => ({ item_id: id, bundle_id: bundleId, action: 'move_bundle' })));

  revalidatePath('/admin');
  redirect('/admin');
}

/**
 * 고른 기록을 보관함으로 내린다.
 *
 * 지우지 않는다. 잘못 올린 것도 언젠가 "그때 그게 뭐였더라" 하고 찾게
 * 되고, 가족 아카이브에서 지운 것은 되돌릴 방법이 없다.
 */
export async function archiveItems(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll('item_ids').map(String).filter(Boolean);
  if (ids.length === 0) redirect('/admin');

  const { error } = await db().from('item').update({ is_archived: true }).in('id', ids);
  if (error) throw new Error(`보관 실패: ${error.message}`);

  await db()
    .from('event_log')
    .insert(ids.map((id) => ({ item_id: id, action: 'archive' })));

  revalidatePath('/admin');
  redirect('/admin');
}

// ---------------------------------------------------------------- 인물 편집
//
// 인물 목록(createPerson)은 이름을 묶어 두는 자리고, 여기는 한 인물을 깊이
// 고치는 자리다. 생애 시기가 이 묶음의 무게중심이다 — 찾기 화면의 시기분류
// (dcterms:temporal)는 life_period 에서 그대로 만들어지므로(facets.ts),
// 아래 addLifePeriod 가 네 갈래 분류의 한 축을 채우는 유일한 길이다.
//
// EDTF 는 원문을 그대로 두고 유도한 연도만 따로 저장한다. item 이
// created_edtf/created_start 에 쓰는 방식과 같다 — "1936?" 을 1936 으로
// 덮어써 버리면 추정이라는 사실이 사라진다.

/** 쉼표로 적은 별칭 한 칸을 배열로. 빈 칸은 떨군다. */
function aliasList(v: FormDataEntryValue | null): string[] {
  return String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 인물 화면으로 돌아가며 할 말을 싣는다. */
function toPerson(id: string, params?: Record<string, string>): never {
  const qs = new URLSearchParams(params ?? {}).toString();
  redirect(qs ? `/admin/people/${id}?${qs}` : `/admin/people/${id}`);
}

export async function updatePerson(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get('person_id') ?? '');

  const birth = nz(formData.get('birth_edtf'));
  const death = nz(formData.get('death_edtf'));

  const { error } = await db()
    .from('person')
    .update({
      display_name: nz(formData.get('display_name')) ?? '이름 미상',
      aliases: aliasList(formData.get('aliases')),
      birth_edtf: birth,
      death_edtf: death,
      // 정렬과 연표는 숫자로 돈다. 원문은 위에 그대로 두고 여기에만 유도값을 넣는다.
      born_year: edtfYear(birth),
      died_year: edtfYear(death),
      relation_to_root: nz(formData.get('relation_to_root')),
      note: nz(formData.get('note')),
    })
    .eq('id', id);
  if (error) throw new Error(`인물 저장 실패: ${error.message}`);

  revalidatePath(`/admin/people/${id}`);
  revalidatePath('/admin/people');
  revalidatePath(`/people/${id}`);
  revalidatePath('/people');
  revalidatePath('/chronicle');
  toPerson(id, { done: '인물을 저장했습니다.' });
}

/**
 * 생애 시기를 더한다 — 곧 시기분류 하나를 세우는 일이다.
 *
 * from_year <= to_year 제약이 DB 에 걸려 있다. 거꾸로 적은 기간을 그대로
 * 보내면 화면이 오류 페이지로 넘어가 방금 적은 것이 사라진다. 미리 걸러
 * 같은 화면으로 돌려보내는 편이 낫다.
 */
export async function addLifePeriod(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const personId = String(formData.get('person_id') ?? '');

  const label = nz(formData.get('label'));
  if (!label) toPerson(personId, { error: '시기의 이름을 적어 주세요.' });

  const fromEdtf = nz(formData.get('from_edtf'));
  const toEdtf = nz(formData.get('to_edtf'));
  const fromYear = edtfYear(fromEdtf);
  const toYear = edtfYear(toEdtf);
  if (fromYear !== null && toYear !== null && fromYear > toYear) {
    toPerson(personId, { error: `시작(${fromYear})이 끝(${toYear})보다 뒤입니다.` });
  }

  // 새 시기는 맨 뒤에 붙인다. 생애는 대개 순서대로 적어 내려가고, 순서를
  // 직접 고르게 하면 칸만 늘어난다.
  const { data: last, error: lastErr } = await supabase
    .from('life_period')
    .select('sort_order')
    .eq('person_id', personId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (lastErr) throw new Error(`생애 시기 순서 조회 실패: ${lastErr.message}`);

  const { error } = await supabase.from('life_period').insert({
    person_id: personId,
    label,
    from_edtf: fromEdtf,
    to_edtf: toEdtf,
    from_year: fromYear,
    to_year: toYear,
    sort_order: (last?.[0]?.sort_order ?? -1) + 1,
    note: nz(formData.get('note')),
  });
  if (error) throw new Error(`생애 시기 추가 실패: ${error.message}`);

  revalidatePath(`/admin/people/${personId}`);
  revalidatePath('/admin/classes');
  revalidatePath('/search');
  revalidatePath(`/people/${personId}`);
  revalidatePath('/chronicle');
  toPerson(personId, { done: `시기분류 "${label}" 을(를) 세웠습니다.` });
}

export async function updateLifePeriod(formData: FormData) {
  await requireAdmin();
  const personId = String(formData.get('person_id') ?? '');
  const id = String(formData.get('life_period_id') ?? '');

  const label = nz(formData.get('label'));
  if (!label) toPerson(personId, { error: '시기의 이름을 적어 주세요.' });

  const fromEdtf = nz(formData.get('from_edtf'));
  const toEdtf = nz(formData.get('to_edtf'));
  const fromYear = edtfYear(fromEdtf);
  const toYear = edtfYear(toEdtf);
  if (fromYear !== null && toYear !== null && fromYear > toYear) {
    toPerson(personId, { error: `시작(${fromYear})이 끝(${toYear})보다 뒤입니다.` });
  }

  const { error } = await db()
    .from('life_period')
    .update({
      label,
      from_edtf: fromEdtf,
      to_edtf: toEdtf,
      from_year: fromYear,
      to_year: toYear,
    })
    .eq('id', id);
  if (error) throw new Error(`생애 시기 저장 실패: ${error.message}`);

  revalidatePath(`/admin/people/${personId}`);
  revalidatePath('/admin/classes');
  revalidatePath('/search');
  revalidatePath(`/people/${personId}`);
  revalidatePath('/chronicle');
  toPerson(personId, { done: `"${label}" 을(를) 고쳤습니다.` });
}

/**
 * 생애 시기를 지운다.
 *
 * 걸려 있던 기록의 연결(item_life_period)도 함께 사라진다 — FK 가 CASCADE 다.
 * 기록 자체는 그대로 남고 분류만 떨어진다.
 */
export async function removeLifePeriod(formData: FormData) {
  await requireAdmin();
  const personId = String(formData.get('person_id') ?? '');
  const id = String(formData.get('life_period_id') ?? '');

  const { error } = await db().from('life_period').delete().eq('id', id);
  if (error) throw new Error(`생애 시기 지우기 실패: ${error.message}`);

  revalidatePath(`/admin/people/${personId}`);
  revalidatePath('/admin/classes');
  revalidatePath('/search');
  revalidatePath(`/people/${personId}`);
  revalidatePath('/chronicle');
  toPerson(personId, { done: '시기분류 하나를 지웠습니다.' });
}

/**
 * 가족 관계를 맺는다.
 *
 * 저장되는 종류는 parent 와 spouse 둘뿐이다. 자식은 parent 를 거꾸로 읽어
 * 나오는 것이라(people.ts) 따로 저장할 자리가 없다. 그래서 화면에서
 * "자식"을 고르면 여기서 방향을 뒤집어 (저 인물, 이 인물, parent) 로 넣는다 —
 * 사람에게 "저 사람 화면에 가서 맺으세요"라고 시키는 대신 기계가 뒤집는다.
 *
 * spouse 는 방향이 없다. 한쪽만 넣어두면 반대쪽 화면에서 보이지 않으므로
 * 양쪽에 다 넣는다.
 */
export async function addRelation(formData: FormData) {
  await requireAdmin();
  const me = String(formData.get('from_person_id') ?? '');
  const other = String(formData.get('to_person_id') ?? '');
  const kind = String(formData.get('kind') ?? '');

  if (!other) toPerson(me, { error: '맺을 인물을 골라 주세요.' });
  if (other === me) toPerson(me, { error: '자기 자신과는 관계를 맺을 수 없습니다.' });

  const rows =
    kind === 'child'
      ? [{ from_person_id: other, to_person_id: me, kind: 'parent' }]
      : kind === 'spouse'
        ? [
            { from_person_id: me, to_person_id: other, kind: 'spouse' },
            { from_person_id: other, to_person_id: me, kind: 'spouse' },
          ]
        : [{ from_person_id: me, to_person_id: other, kind: 'parent' }];

  // 이미 맺힌 관계를 다시 맺어도 오류로 끝나지 않게 한다. 양방향으로 넣는
  // 배우자는 한쪽만 남아 있는 상태가 실제로 생긴다.
  const { error } = await db().from('person_relation').upsert(rows, {
    onConflict: 'from_person_id,to_person_id,kind',
    ignoreDuplicates: true,
  });
  if (error) throw new Error(`가족 관계 맺기 실패: ${error.message}`);

  revalidatePath(`/admin/people/${me}`);
  revalidatePath(`/admin/people/${other}`);
  revalidatePath(`/people/${me}`);
  revalidatePath(`/people/${other}`);
  revalidatePath('/people');
  toPerson(me, { done: '가족 관계를 맺었습니다.' });
}

/** 관계를 끊는다. 배우자는 양쪽에 적혀 있으므로 양쪽 다 지운다. */
export async function removeRelation(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const me = String(formData.get('from_person_id') ?? '');
  const other = String(formData.get('to_person_id') ?? '');
  const kind = String(formData.get('kind') ?? '');
  const back = String(formData.get('person_id') ?? me);

  const pairs =
    kind === 'spouse'
      ? [
          [me, other],
          [other, me],
        ]
      : [[me, other]];
  const storedKind = kind === 'spouse' ? 'spouse' : 'parent';

  for (const [from, to] of pairs) {
    const { error } = await supabase
      .from('person_relation')
      .delete()
      .eq('from_person_id', from)
      .eq('to_person_id', to)
      .eq('kind', storedKind);
    if (error) throw new Error(`가족 관계 끊기 실패: ${error.message}`);
  }

  revalidatePath(`/admin/people/${me}`);
  revalidatePath(`/admin/people/${other}`);
  revalidatePath(`/people/${me}`);
  revalidatePath(`/people/${other}`);
  revalidatePath('/people');
  toPerson(back, { done: '가족 관계를 끊었습니다.' });
}

// ---------------------------------------------------------------- 인물 전거 연결
//
// 사람은 기록마다 이름을 새로 쓰지 않고, 한 번 등록해 두고 가리킨다.
// 그래야 "할머니", "김순자", "안동댁"이 한 사람으로 모이고, 연표·나이·
// 인물 페이지가 저절로 만들어진다.
//
// 화면의 PersonPicker 는 고른 결과를 세 갈래로 뱉는다. 등록된 사람은 id 로,
// 그 자리에서 새로 만들 사람은 `_new` 에 이름으로, 끝내 등록하지 않을 사람
// (기관·모르는 사람·미상)은 `_loose` 에 이름으로. 아래 두 액션이 그 셋을
// 받는 자리다.

/**
 * `_new` 로 온 이름들을 person 에 세우고 id 를 돌려준다.
 *
 * 이름만 넣는다. 나머지(생몰·호칭·관계)는 나중에 인물 화면에서 채운다 —
 * 사진을 정리하다 모르는 이름이 나왔다고 해서 인물 등록 화면으로 갔다
 * 오게 하면 하던 일을 잃는다. 비어 있는 인물이 하나 느는 편이 낫다.
 *
 * 같은 이름이 이미 있으면 그 사람을 쓴다. 한 번 등록해 두고 가리키자는
 * 것이 전거인데, 여기서 동명이인을 새로 만들면 도로 흩어진다.
 */
async function ensurePeopleByName(names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return [];

  const supabase = db();
  const { data: found } = await supabase
    .from('person')
    .select('id, display_name')
    .in('display_name', wanted);

  const byName = new Map<string, string>(
    (found ?? []).map((p) => [String(p.display_name), String(p.id)]),
  );

  const missing = wanted.filter((n) => !byName.has(n));
  if (missing.length > 0) {
    const { data: made, error } = await supabase
      .from('person')
      .insert(missing.map((display_name) => ({ display_name })))
      .select('id, display_name');
    if (error) throw new Error(`인물 등록 실패: ${error.message}`);
    for (const p of made ?? []) byName.set(String(p.display_name), String(p.id));
  }

  return wanted.map((n) => byName.get(n)).filter((v): v is string => Boolean(v));
}

/**
 * 등장인물을 통째로 다시 세운다.
 *
 * 분류(setItemSubjects)와 같은 방식이다 — 화면이 보낸 것이 곧 결과다.
 * 하나씩 넣고 빼면 "지금 누가 걸려 있는가"를 사람이 머리로 셈해야 한다.
 *
 * 다만 지우는 것은 role='depicted' 뿐이다. 촬영·씀·받음 같은 역할은 이
 * 칸이 다루지 않으므로, 통째로 비우면 이 화면에 뜨지도 않은 연결이
 * 조용히 사라진다.
 */
export async function setItemPeople(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id') ?? '');

  const picked = formData.getAll('people').map(String).filter(Boolean);
  const made = await ensurePeopleByName(formData.getAll('people_new').map(String));
  const ids = [...new Set([...picked, ...made])];

  // 등록하지 않은 이름은 기록 쪽에 둔다 — 가리킬 사람이 없으니 item_person 에
  // 넣을 수 없다.
  const loose = [...new Set(formData.getAll('people_loose').map(String).map((s) => s.trim()).filter(Boolean))];

  const { error: clearErr } = await supabase
    .from('item_person')
    .delete()
    .eq('item_id', itemId)
    .eq('role', 'depicted');
  if (clearErr) throw new Error(`등장인물 비우기 실패: ${clearErr.message}`);

  if (ids.length > 0) {
    const { error } = await supabase
      .from('item_person')
      .insert(ids.map((person_id) => ({ item_id: itemId, person_id, role: 'depicted' })));
    if (error) throw new Error(`등장인물 연결 실패: ${error.message}`);
  }

  const { error: looseErr } = await supabase
    .from('item')
    .update({ subject_names: loose })
    .eq('id', itemId);
  if (looseErr) throw new Error(`등장인물 이름 적기 실패: ${looseErr.message}`);

  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/item/${itemId}`);
  // 연결한 사람의 인물 페이지에 이 기록이 나와야 한다. 전거 연결의 목적이 그것이다.
  for (const personId of ids) revalidatePath(`/people/${personId}`);
  revalidatePath('/people');
  redirect(`/admin/items/${itemId}`);
}

/**
 * 생산자.
 *
 * 한 기록의 생산자는 한 사람이다. 전거에서 고르면 creator_id 로 가리키고,
 * 기관이나 미상처럼 등록하지 않을 것이면 item.creator 에 이름만 적는다.
 * 둘을 같이 채우지 않는다 — 어느 쪽이 참인지 알 수 없어진다.
 */
export async function setItemCreator(formData: FormData) {
  await requireAdmin();
  const supabase = db();
  const itemId = String(formData.get('item_id') ?? '');

  const picked = nz(formData.get('creator'));
  const [made] = await ensurePeopleByName(
    picked ? [] : formData.getAll('creator_new').map(String),
  );
  const creatorId = picked ?? made ?? null;
  const loose = creatorId ? null : nz(formData.get('creator_loose'));

  const { error } = await supabase
    .from('item')
    .update({ creator_id: creatorId, creator: loose })
    .eq('id', itemId);
  if (error) throw new Error(`생산자 저장 실패: ${error.message}`);

  revalidatePath(`/admin/items/${itemId}`);
  revalidatePath(`/item/${itemId}`);
  if (creatorId) revalidatePath(`/people/${creatorId}`);
  redirect(`/admin/items/${itemId}`);
}
