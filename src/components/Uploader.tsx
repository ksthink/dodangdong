'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Status = 'wait' | 'uploading' | 'indexing' | 'created' | 'duplicate' | 'failed';

interface Entry {
  name: string;
  size: number;
  status: Status;
  percent: number;
  message?: string;
}

const STATUS_LABEL: Record<Status, string> = {
  wait: '대기',
  uploading: '올리는 중',
  indexing: '색인 중',
  created: '완료',
  duplicate: '이미 있음',
  failed: '실패',
};

/**
 * 업로드.
 *
 * 파일은 브라우저에서 Google Drive 로 곧장 간다 — 우리 서버를 통과하지 않는다.
 * 서버는 세션 URL 을 발급하고, 업로드가 끝난 뒤 색인만 한다.
 *
 * 한 파일씩 순서대로 보낸다. 느려 보여도, 중간에 무엇이 걸렸는지 눈으로 확인할 수
 * 있는 편이 수천 장을 다룰 때 훨씬 안전하다.
 */
export function Uploader({ bundleId }: { bundleId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [needsConnect, setNeedsConnect] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const patch = useCallback((idx: number, next: Partial<Entry>) => {
    setEntries((prev) => prev.map((e, j) => (j === idx ? { ...e, ...next } : e)));
  }, []);

  /** Drive 세션 URL 로 직접 전송. 진행률을 보려고 XHR 을 쓴다. */
  const putToDrive = useCallback(
    (sessionUrl: string, file: File, onProgress: (pct: number) => void) =>
      new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', sessionUrl, true);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText) as { id: string };
              if (json.id) return resolve(json.id);
              reject(new Error('Drive 가 파일 id 를 돌려주지 않았습니다'));
            } catch {
              reject(new Error('Drive 응답을 읽지 못했습니다'));
            }
          } else {
            reject(new Error(`Drive 업로드 실패 (${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error('네트워크 오류로 업로드가 끊겼습니다'));
        xhr.send(file);
      }),
    [],
  );

  const upload = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setRunning(true);
      const start = entries.length;
      setEntries((prev) => [
        ...prev,
        ...files.map((f) => ({ name: f.name, size: f.size, status: 'wait' as Status, percent: 0 })),
      ]);

      for (let i = 0; i < files.length; i++) {
        const idx = start + i;
        const file = files[i];
        patch(idx, { status: 'uploading', percent: 0 });

        try {
          // 1. 서버에서 업로드 세션을 받는다 (토큰은 넘어오지 않는다)
          const sres = await fetch('/api/upload/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bundle_id: bundleId,
              filename: file.name,
              mime: file.type,
              size: file.size,
            }),
          });
          const sjson = await sres.json();
          if (!sres.ok) {
            if (sjson.needsConnect) setNeedsConnect(true);
            throw new Error(sjson.error ?? '세션 생성 실패');
          }

          // 2. 브라우저 → Drive 직행
          const driveFileId = await putToDrive(sjson.sessionUrl, file, (pct) =>
            patch(idx, { percent: pct }),
          );

          // 3. 색인
          patch(idx, { status: 'indexing', percent: 100 });
          const rres = await fetch('/api/upload/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bundle_id: bundleId, drive_file_id: driveFileId }),
          });
          const rjson = await rres.json();

          patch(idx, {
            status: (rjson.status as Status) ?? 'failed',
            message: rjson.warning ?? rjson.reason ?? rjson.identifier,
          });
        } catch (err) {
          patch(idx, {
            status: 'failed',
            message: err instanceof Error ? err.message : '실패',
          });
        }
      }

      setRunning(false);
      router.refresh();
    },
    [bundleId, entries.length, patch, putToDrive, router],
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
      {needsConnect && (
        <div className="callout">
          Google Drive 가 연결되지 않았습니다.{' '}
          <a href="/admin/storage" style={{ color: 'var(--accent)' }}>
            저장소 설정에서 연결
          </a>
          한 뒤 다시 시도해 주세요.
        </div>
      )}

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
        파일을 여기에 끌어다 놓으세요
        <br />
        <span className="small">사진 · 음성 · 영상 · 스캔 PDF — 크기 제한 없음</span>
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
                  <span className="dim"> · {formatBytes(e.size)}</span>
                  {e.message && <span className="dim"> · {e.message}</span>}
                  {e.status === 'uploading' && (
                    <span
                      style={{
                        display: 'block',
                        height: 4,
                        background: 'var(--panel-2)',
                        border: '1px solid var(--edge-2)',
                        marginTop: 2,
                      }}
                    >
                      <span
                        style={{
                          display: 'block',
                          height: '100%',
                          width: `${e.percent}%`,
                          background: 'var(--accent)',
                        }}
                      />
                    </span>
                  )}
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
                  {e.status === 'uploading' ? `${e.percent}%` : STATUS_LABEL[e.status]}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function formatBytes(n: number) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}
