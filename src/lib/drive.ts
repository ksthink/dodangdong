import 'server-only';
import { db } from './db';

/**
 * Google Drive 연동.
 *
 * 권한 범위는 `drive.file` 하나다 — **앱이 만든 파일에만** 접근할 수 있다.
 * 관리자의 나머지 Drive 내용은 읽지도 쓰지도 못한다. 개인 자료를 다루는 도구가
 * 가져야 할 최소 권한이고, Google 앱 심사도 필요 없다.
 *
 * 리프레시 토큰은 환경변수가 아니라 DB(app_setting)에 둔다. 배포 환경에서는
 * 코드가 환경변수를 바꿀 수 없어서, 관리자가 화면에서 연결한 결과를 저장할 곳이
 * 필요하기 때문이다.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const REFRESH_TOKEN_KEY = 'google_refresh_token';
const ROOT_FOLDER_KEY = 'google_root_folder_id';

export class DriveNotConnected extends Error {
  constructor() {
    super('Google Drive 가 연결되지 않았습니다. 관리 화면에서 연결해 주세요.');
  }
}

function clientCredentials() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 이 필요합니다.');
  }
  return { id, secret };
}

// ---------------------------------------------------------------- 설정 저장소

export async function getSetting(key: string): Promise<string | null> {
  const { data } = await db().from('app_setting').select('value').eq('key', key).maybeSingle();
  return data?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await db()
    .from('app_setting')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw new Error(`설정 저장 실패: ${error.message}`);
}

export async function isDriveConnected(): Promise<boolean> {
  return (await getSetting(REFRESH_TOKEN_KEY)) !== null;
}

// ---------------------------------------------------------------- 인증

/** 액세스 토큰은 1시간짜리다. 요청마다 새로 받지 않도록 메모리에 잠깐 둔다. */
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const refresh = await getSetting(REFRESH_TOKEN_KEY);
  if (!refresh) throw new DriveNotConnected();

  const { id, secret } = clientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // 토큰이 취소됐다면 연결을 지워 관리자가 다시 연결하도록 유도한다.
    if (res.status === 400 || res.status === 401) {
      await db().from('app_setting').delete().eq('key', REFRESH_TOKEN_KEY);
    }
    throw new Error(`Google 토큰 갱신 실패 (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

export function consentUrl(redirectUri: string, state: string): string {
  const { id } = clientCredentials();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: DRIVE_SCOPE,
    // 리프레시 토큰은 최초 동의에서만 나온다. 다시 연결할 때도 받으려면 consent 강제.
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<void> {
  const { id, secret } = clientCredentials();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) throw new Error(`Google 인증 교환 실패: ${await res.text()}`);

  const json = (await res.json()) as { refresh_token?: string };
  if (!json.refresh_token) {
    throw new Error('리프레시 토큰이 오지 않았습니다. Google 계정의 앱 접근 권한을 해제한 뒤 다시 연결해 주세요.');
  }
  await setSetting(REFRESH_TOKEN_KEY, json.refresh_token);
  cachedToken = null;
}

export async function disconnect(): Promise<void> {
  await db().from('app_setting').delete().eq('key', REFRESH_TOKEN_KEY);
  cachedToken = null;
}

// ---------------------------------------------------------------- 폴더

async function driveFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await accessToken();
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const res = await driveFetch('/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Drive 폴더 생성 실패: ${await res.text()}`);
  const json = (await res.json()) as { id: string };
  return json.id;
}

/** 아카이브 최상위 폴더. 없으면 만들고 id 를 기억한다. */
export async function rootFolderId(): Promise<string> {
  const saved = await getSetting(ROOT_FOLDER_KEY);
  if (saved) {
    // 관리자가 Drive 에서 지웠을 수 있으니 살아 있는지 확인한다.
    const res = await driveFetch(`/files/${saved}?fields=id,trashed`);
    if (res.ok) {
      const json = (await res.json()) as { trashed: boolean };
      if (!json.trashed) return saved;
    }
  }
  const name = process.env.DRIVE_ROOT_FOLDER_NAME ?? '도당동 아카이브';
  const id = await createFolder(name);
  await setSetting(ROOT_FOLDER_KEY, id);
  return id;
}

/** 묶음 폴더. 없으면 만들어 bundle.drive_folder_id 에 적어둔다. */
export async function ensureBundleFolder(bundleId: string, bundleTitle: string): Promise<string> {
  const supabase = db();
  const { data: bundle } = await supabase
    .from('bundle')
    .select('drive_folder_id')
    .eq('id', bundleId)
    .single();

  if (bundle?.drive_folder_id) {
    const res = await driveFetch(`/files/${bundle.drive_folder_id}?fields=id,trashed`);
    if (res.ok) {
      const json = (await res.json()) as { trashed: boolean };
      if (!json.trashed) return bundle.drive_folder_id;
    }
  }

  const folderId = await createFolder(bundleTitle, await rootFolderId());
  await supabase.from('bundle').update({ drive_folder_id: folderId }).eq('id', bundleId);
  return folderId;
}

// ---------------------------------------------------------------- 업로드

/**
 * 재개 가능 업로드 세션을 연다.
 *
 * 돌려주는 것은 세션 URL 하나뿐이다. 액세스 토큰은 브라우저로 넘기지 않는다 —
 * 세션 URL 자체가 그 파일 하나에만 쓸 수 있는 일회용 자격이다.
 */
export async function createUploadSession(opts: {
  filename: string;
  mime: string;
  size: number;
  folderId: string;
}): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${UPLOAD_API}/files?uploadType=resumable&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': opts.mime,
      'X-Upload-Content-Length': String(opts.size),
    },
    body: JSON.stringify({ name: opts.filename, parents: [opts.folderId] }),
  });

  if (!res.ok) throw new Error(`업로드 세션 생성 실패: ${await res.text()}`);

  const location = res.headers.get('location');
  if (!location) throw new Error('업로드 세션 URL 을 받지 못했습니다.');
  return location;
}

// ---------------------------------------------------------------- 조회

export interface DriveFileMeta {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum: string | null;
  webViewLink: string;
  createdTime: string;
}

export async function fileMeta(fileId: string): Promise<DriveFileMeta> {
  const res = await driveFetch(
    `/files/${fileId}?fields=id,name,mimeType,size,md5Checksum,webViewLink,createdTime`,
  );
  if (!res.ok) throw new Error(`Drive 파일 조회 실패: ${await res.text()}`);
  const json = (await res.json()) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    md5Checksum?: string;
    webViewLink?: string;
    createdTime: string;
  };
  return {
    id: json.id,
    name: json.name,
    mimeType: json.mimeType,
    size: Number(json.size ?? 0),
    md5Checksum: json.md5Checksum ?? null,
    webViewLink: json.webViewLink ?? `https://drive.google.com/file/d/${json.id}/view`,
    createdTime: json.createdTime,
  };
}

/**
 * 파일 바이트를 내려받는다. 축소본을 만들어야 하는 이미지에만 쓴다 —
 * 영상까지 내려받으면 서버 메모리가 감당하지 못하고, 그럴 이유도 없다.
 */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const res = await driveFetch(`/files/${fileId}?alt=media`);
  if (!res.ok) throw new Error(`Drive 파일 내려받기 실패: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 업로드는 됐지만 등록에 실패한 파일을 치운다. 앱이 만든 파일이므로 지울 수 있다. */
export async function deleteFile(fileId: string): Promise<void> {
  await driveFetch(`/files/${fileId}`, { method: 'DELETE' });
}
