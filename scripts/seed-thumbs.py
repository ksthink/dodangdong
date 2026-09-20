#!/usr/bin/env python3
"""
로컬 개발용 자리표시 이미지.

seed-local.sql 이 자료를 넣고, 이 스크립트가 그 자료의 썸네일을 만들어
스토리지에 올린 뒤 file 행을 넣는다. 둘을 나눈 까닭은 이미지가 DB 가 아니라
스토리지에 들어가기 때문이다 — SQL 만으로는 바이트를 올릴 수 없다.

실제 가족사진이 없으므로 회색 톤의 추상 무늬를 둔다. 사진인 척하지 않는 것이
중요하다. 목적은 연표·갤러리의 배치와 비율을 눈으로 확인하는 것이고, 진짜
사진이 들어왔을 때 어떻게 보일지 가늠할 수 있으면 충분하다.

명세는 "사진이 이 사이트의 유일한 풍부한 색"이라고 말한다. 그러나 지어낸
사진에까지 색을 넣으면 그 규칙을 시험할 수 없게 되므로 여기서는 무채색을 쓴다.

  로컬에만 쓴다. 운영 DB·스토리지에 돌리지 않는다.

  python3 scripts/seed-thumbs.py

환경변수(없으면 로컬 Supabase 기본값):
  SUPABASE_URL         기본 http://127.0.0.1:54321
  SUPABASE_SECRET_KEY  기본 supabase CLI 의 로컬 service_role 키
"""
import hashlib
import json
import os
import struct
import subprocess
import sys
import zlib

API = os.environ.get('SUPABASE_URL', 'http://127.0.0.1:54321').rstrip('/')
KEY = os.environ.get('SUPABASE_SECRET_KEY') or (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.'
    'eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.'
    'EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU')
DB = ['docker', 'exec', '-i', 'supabase_db_family', 'psql', '-U', 'postgres', '-d', 'postgres']

GREYS = [0x2E, 0x44, 0x5A, 0x70, 0x86, 0x9C, 0xB2, 0xC8]
SIZES = (('thumb', 320, 240, 16), ('display', 960, 720, 48))


def png(width, height, pixels):
    """의존성 없이 PNG 를 만든다. pixels 는 (r,g,b) 의 행 우선 목록."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # 필터 없음
        for x in range(width):
            raw.extend(pixels[y * width + x])

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data
                + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
            + chunk(b'IEND', b''))


def placeholder(seed, w, h, cell):
    """
    식별자 해시로 굵은 격자 무늬를 그린다. 같은 자료는 늘 같은 무늬가 되므로
    화면을 다시 띄워도 배치가 흔들리지 않고, 무엇이 무엇인지 구별된다.
    """
    digest = hashlib.sha256(seed.encode()).digest()
    cols = (w + cell - 1) // cell
    rows = (h + cell - 1) // cell
    px = []
    for y in range(h):
        gy = y // cell
        for x in range(w):
            gx = x // cell
            base = GREYS[digest[(gy * cols + gx) % len(digest)] % len(GREYS)]
            # 가장자리를 어둡게 해 사진의 덩어리감을 흉내 낸다.
            inner = 2 <= gx < cols - 2 and 2 <= gy < rows - 2
            v = max(0, min(255, base + (0 if inner else -18)))
            px.append((v, v, v))
    return png(w, h, px)


def psql(sql, quiet=True):
    args = DB + (['-q'] if quiet else ['-tA'])
    r = subprocess.run(args, input=sql.encode(), capture_output=True)
    if r.returncode != 0:
        sys.exit(f'psql 실패: {r.stderr.decode()}')
    return r.stdout.decode().strip()


def upload(path, data):
    r = subprocess.run(
        ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}',
         '-X', 'POST', f'{API}/storage/v1/object/derivatives/{path}',
         '-H', f'Authorization: Bearer {KEY}',
         '-H', 'Content-Type: image/png',
         '-H', 'x-upsert: true',
         '--data-binary', '@-'],
        input=data, capture_output=True)
    return r.stdout.decode().strip()


def main():
    rows = json.loads(psql(
        "select coalesce(json_agg(json_build_object("
        "'id', id, 'identifier', identifier, 'type', type)), '[]') from item",
        quiet=False) or '[]')

    if not rows:
        sys.exit('자료가 없습니다. 먼저 scripts/seed-local.sql 을 넣으세요.')

    psql('delete from file;')

    values, skipped, failed = [], 0, 0
    for r in rows:
        # 사건은 파일이 없는 것이 정상이다 — 오히려 그것이 사건의 성질이다.
        if r['type'] == 'Event':
            skipped += 1
            continue
        for role, w, h, cell in SIZES:
            data = placeholder(f"{r['identifier']}:{role}", w, h, cell)
            path = f"{r['identifier']}/{role}.png"
            code = upload(path, data)
            if not code.startswith('2'):
                print(f'  올리기 실패 {path} -> HTTP {code}', file=sys.stderr)
                failed += 1
                continue
            values.append(
                f"('{r['id']}', '{role}', 'derivatives', '{path}', "
                f"'image/png', {len(data)}, {w}, {h})")

    if values:
        psql('insert into file (item_id, role, storage_bucket, storage_path, '
             'mime, bytes, width, height) values\n' + ',\n'.join(values) + ';')

    print(f'자리표시 이미지 {len(values)}건을 올리고 file 행을 넣었습니다. '
          f'(사건 {skipped}건은 파일 없음{", 실패 " + str(failed) + "건" if failed else ""})')


if __name__ == '__main__':
    main()
