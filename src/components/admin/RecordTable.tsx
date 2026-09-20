'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cx, num } from '@/lib/ui';
import type { AccessLevel } from '@/lib/session';
import Checkbox from './Checkbox';
import StatusBadge from './StatusBadge';

/**
 * 관리용 자료 표.
 *
 * 여러 줄을 골라 한꺼번에 처리한다. 고른 줄은 화면에서 바로 표시되어야
 * 하므로 이 조각만 클라이언트다 — 다만 처리는 <form> 제출로 넘긴다.
 * 고른 id 를 hidden input 으로 심어 보내므로 서버 액션은 이 표가
 * 클라이언트인지 모르고, 자바스크립트가 죽어도 표 자체는 읽힌다.
 *
 * 형태 칸에 TypeTag 를 쓰지 않은 것은 취향이 아니라 경계 때문이다.
 * @/components/search/parts 는 server-only 인 chronicle 을 거쳐가므로
 * 클라이언트로 들어올 수 없다. 여기서는 코드만 고정폭으로 적는다.
 */

export interface RecordTableRow {
  id: string;
  title: string;
  href?: string;
  /** DCMI 유형 코드. 예: 'Image'. */
  type: string;
  access: AccessLevel;
  updated: string;
  /** 제목 아래에 작게 붙는 덧말 — "원본 없음" 같은 것. */
  note?: string;
}

export interface RecordTableProps {
  rows: RecordTableRow[];
  /** 한 쪽에 보이는 줄보다 전체가 많을 때. 없으면 rows 의 수. */
  total?: number;
  /** 일괄 처리를 받는 서버 액션. 없으면 고르기만 되고 단추는 나오지 않는다. */
  action?: (formData: FormData) => void | Promise<void>;
}

/** 일괄 처리 단추. name="op" 하나로 어느 것을 눌렀는지 서버가 안다. */
const BULK_OPS: { op: string; label: string; variant: 'secondary' | 'text' }[] = [
  { op: 'access', label: '공개 범위 바꾸기', variant: 'secondary' },
  { op: 'bundle', label: '묶음에 넣기', variant: 'secondary' },
  { op: 'delete', label: '삭제', variant: 'text' },
];

export default function RecordTable({ rows, total, action }: RecordTableProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = selected.filter((id) => rows.some((r) => r.id === id));
  const allOn = rows.length > 0 && chosen.length === rows.length;

  function toggle(id: string, on: boolean) {
    setSelected((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  return (
    <form className="jg-rtable-wrap" action={action}>
      {chosen.map((id) => (
        <input key={id} type="hidden" name="id" value={id} />
      ))}
      <div className="jg-rtable-bar">
        {chosen.length ? (
          <span>
            <strong>{chosen.length}</strong>건 선택
          </span>
        ) : (
          <span>
            전체 <strong>{num(total ?? rows.length)}</strong>건
          </span>
        )}
        {chosen.length && action ? (
          <span className="jg-rtable-actions">
            {BULK_OPS.map((b) => (
              <button key={b.op} type="submit" name="op" value={b.op} className={cx('jg-btn', `jg-btn-${b.variant}`)}>
                {b.label}
              </button>
            ))}
          </span>
        ) : null}
      </div>
      <table className="jg-rtable">
        <thead>
          <tr>
            <th className="is-check">
              <Checkbox
                ariaLabel="모두 선택"
                checked={allOn}
                onChange={(on) => setSelected(on ? rows.map((r) => r.id) : [])}
              />
            </th>
            <th>식별자</th>
            <th>제목</th>
            <th>형태</th>
            <th>공개 범위</th>
            <th>수정일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const on = chosen.includes(r.id);
            return (
              <tr key={r.id} className={on ? 'is-selected' : undefined}>
                <td className="is-check">
                  <Checkbox
                    ariaLabel={`${r.title} 선택`}
                    checked={on}
                    onChange={(next) => toggle(r.id, next)}
                  />
                </td>
                <td className="is-mono">{r.id}</td>
                <td className="is-title">
                  {r.href ? <Link href={r.href}>{r.title}</Link> : r.title}
                  {r.note ? <span className="jg-rtable-note">{r.note}</span> : null}
                </td>
                <td className="is-mono is-muted">{r.type}</td>
                <td>
                  <StatusBadge level={r.access} />
                </td>
                <td className="is-mono is-muted">{r.updated}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </form>
  );
}
