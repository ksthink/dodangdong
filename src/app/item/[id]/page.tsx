import Link from 'next/link';
import { notFound } from 'next/navigation';
import { currentRole } from '@/lib/access';
import { getRecord } from '@/lib/record';
import { num } from '@/lib/ui';
import MetadataTable from '@/components/record/MetadataTable';
import RelatedList from '@/components/record/RelatedList';
import Gallery from '@/components/record/Gallery';
import ShareRow from '@/components/record/ShareRow';
import { ClassPath, DateValue, TypeTag } from '@/components/search/parts';

export const dynamic = 'force-dynamic';

/**
 * 기록 하나.
 *
 * 이 아카이브의 중심 화면이다. 사진 한 장을 보여주는 일보다, 그것에 대해
 * 우리가 아는 것을 빠짐없이 펼쳐 보이는 일이 더 중요하다 — 사진은 언젠가
 * 빛이 바래지만 기술(記述)은 바래지 않는다.
 *
 * 그래서 상세정보 표를 접어 두지 않는다. 설명 바로 아래에 펼쳐 둔다.
 */
export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const role = await currentRole();
  const rec = await getRecord(role, id);

  if (!rec) notFound();

  const { item, meta, photos, original, audio, related, stories, crumbs, terms, transcript } =
    rec;

  return (
    <main className="wrap page-record">
      <nav className="crumbs" aria-label="분류 경로">
        <ClassPath steps={crumbs} />
      </nav>

      <header className="record-head">
        <p className="record-id">{item.identifier}</p>
        <h1 className="record-title jg-pixel">{item.title}</h1>
        <p className="record-summary">
          <TypeTag type={item.type} detail={item.doc_type} />
          {item.created_edtf || item.created_start ? (
            <DateValue
              value={item.created_edtf ?? item.created_start!}
              verified={item.date_verified}
            />
          ) : null}
        </p>
      </header>

      {item.description ? <p className="record-summary">{item.description}</p> : null}

      {/* 사진 한 장이면 크게, 여러 장이면 격자. 격자는 정사각형으로 자르지만
          뷰어는 원본 비율을 지킨다 — 가족사진에서 잘린 부분이 대개 중요하다. */}
      {photos.length === 1 ? (
        <figure className="record-single">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photos[0].src} alt={photos[0].alt} />
        </figure>
      ) : photos.length > 1 ? (
        <Gallery
          items={photos.map((p) => ({
            src: p.src,
            thumb: p.thumb,
            alt: p.alt,
            title: p.alt,
            identifier: p.identifier,
          }))}
          title="사진"
          showCaptions
        />
      ) : null}

      {audio ? (
        <div className="audio-box">
          <p className="audio-label">구술 녹음</p>
          {/* 브라우저 기본 재생기를 쓴다. 픽셀 문법에 맞는 재생기를 직접
              만들 수도 있지만, 재생·탐색·속도 조절을 스스로 다시 만드는 값이
              모양 하나보다 크지 않다. */}
          <audio className="audio-row" controls preload="none" src={audio.src} />
          {transcript && transcript.segments.length > 0 ? (
            <p className="audio-note">전사 {num(transcript.segments.length)}줄</p>
          ) : null}
        </div>
      ) : null}

      <MetadataTable record={meta} heading="상세정보" />

      {transcript && transcript.segments.length > 0 ? (
        <section className="transcript">
          <h2 className="jg-section-title jg-pixel">전사</h2>
          {transcript.segments.map((s, i) => (
            <div className="line" key={i}>
              <span className="t">{formatMs(s.start_ms)}</span>
              <span>{s.text}</span>
            </div>
          ))}
        </section>
      ) : null}

      {/* 이름은 명세대로 "관련 기록"으로 두되, 무엇을 기준으로 골랐는지는
          덧말로 밝힌다. 이 저장소에는 dc:relation 열이 없어 같은 묶음을
          기준으로 삼는데, 그 사실을 감추면 "왜 이것만 나오나"가 된다. */}
      {related.length > 0 ? (
        <div className="stack-s">
          <RelatedList title="관련 기록" code="dc:relation" items={related} />
          <p className="jg-note">같은 묶음에서 나온 기록입니다.</p>
        </div>
      ) : null}

      {stories.length > 0 ? (
        <div className="stack-s">
          <RelatedList
            title="관련 이야기"
            code="dcterms:isPartOf"
            items={stories.map((s) => ({ title: s.title, href: `/stories/${s.id}` }))}
          />
          <p className="jg-note">이 기록을 엮어 쓴 이야기입니다.</p>
        </div>
      ) : null}

      {/* 명세의 상세 화면은 이용조건으로 끝난다. 표 14행에도 한 줄이 있지만,
          내보내도 되는지는 나머지 열세 줄과 같은 무게로 읽혀서는 안 된다. */}
      <section className="jg-related record-terms">
        <h2 className="jg-section-title jg-pixel">이용조건</h2>
        <p className="jg-related-code">dc:rights</p>
        <p className="record-summary">{terms.access}</p>
        {terms.rights ? <p className="record-summary">{terms.rights}</p> : null}
        {terms.aiOptout ? (
          <p className="record-summary">기계 학습에 쓰지 않습니다.</p>
        ) : null}
        {terms.physicalLocation ? (
          <p className="record-summary">
            {`실물은 ${terms.physicalLocation}에 있습니다.`}
            {terms.physicalCondition ? ` 상태: ${terms.physicalCondition}` : ''}
          </p>
        ) : null}
      </section>

      <div className="record-actions">
        {original ? (
          <Link className="jg-btn jg-btn-secondary" href={`/media/${original.id}`}>
            {original.label}
          </Link>
        ) : null}
        {/* 공유 버튼은 두지 않는다 — 가족 사이트다. 주소 복사와 인쇄만 둔다. */}
        <ShareRow />
      </div>
    </main>
  );
}

/** 밀리초 → 0:07 */
function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
