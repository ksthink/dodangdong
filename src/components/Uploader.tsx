'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'wait' | 'busy' | 'created' | 'duplicate' | 'failed';

interface Entry {
  name: string;
  size: number;
  status: Status;
  message?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  wait: '대기',
  busy: '올리는 중',
  created: '완료',
  duplicate: '이미 있음',
  failed: '실패',
};

/**
 * 폴더째 끌어다 놓는 적재 화면.
 *
 * 한 파일씩 순서대로 보낸다. 느려 보여도, 중간에 무엇이 걸렸는지 눈으로 확인할 수 있는 편이
 * 수천 장을 다룰 때 훨씬 안전하다.
 */
export function Uploader({ bundleId }: { bundleId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setRunning(true);
      const start = entries.length;
      setEntries((prev) => [
        ...prev,
        ...files.map((f) => ({ name: f.name, size: f.size, status: 'wait' as Status })),
      ]);

      for (let i = 0; i < files.length; i++) {
        const idx = start + i;
        setEntries((prev) => prev.map((e, j) => (j === idx ? { ...e, status: 'busy' } : e)));

        const body = new FormData();
        body.append('bundle_id', bundleId);
        body.append('file', files[i]);

        try {
          const res = await fetch('/api/upload', { method: 'POST', body });
          const data = await res.json();
          setEntries((prev) =>
            prev.map((e, j) =>
              j === idx
                ? {
                    ...e,
                    status: (data.status as Status) ?? 'failed',
                    message: data.reason ?? data.identifier,
                  }
                : e,
            ),
          );
        } catch (err) {
          setEntries((prev) =>
            prev.map((e, j) =>
              j === idx
                ? { ...e, status: 'failed', message: err instanceof Error ? err.message : '전송 실패' }
                : e,
            ),
          );
        }
      }

      setRunning(false);
      router.refresh();
    },
    [bundleId, entries.length, router],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      upload(Array.from(e.dataTransfer.files));
    },
    [upload],
  );

  const done = entries.filter((e) => e.status === 'created').length;
  const dupes = entries.filter((e) => e.status === 'duplicate').length;
  const failed = entries.filter((e) => e.status === 'failed').length;

  return (
    <div className="stack">
      <div
        className="dz"
        style={dragging ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        파일이나 폴더를 여기에 끌어다 놓으세요
        <br />
        <span className="small">사진 · 음성 · 영상 · 스캔 PDF</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          upload(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      {entries.length > 0 && (
        <>
          <div className="row">
            <span className="chip accent">완료 {done}</span>
            {dupes > 0 && <span className="chip">이미 있음 {dupes}</span>}
            {failed > 0 && <span className="chip warn">실패 {failed}</span>}
            {running && <span className="small">올리는 중… 창을 닫지 마세요</span>}
          </div>

          <div className="queue">
            {entries.map((e, i) => (
              <div className="qrow" key={`${e.name}-${i}`}>
                <span className="tile" style={{ width: 36, height: 36 }} />
                <span className="name">
                  {e.name}
                  {e.message && <span className="dim"> · {e.message}</span>}
                </span>
                <span
                  className="small"
                  style={{
                    color:
                      e.status === 'created'
                        ? 'var(--accent)'
                        : e.status === 'failed'
                          ? 'var(--danger)'
                          : 'var(--muted)',
                  }}
                >
                  {STATUS_LABEL[e.status]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
