"""Extract the scanned reference; keep original page locations for every token."""
import concurrent.futures
import csv
import io
import json
import os
from pathlib import Path
import subprocess
import sys

import fitz
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source-data' / 'Lemo_Woerterbuch.pdf'
CACHE = ROOT / '.work' / 'ocr'
OUTPUT = ROOT / 'docs'


def extract(page_number):
    cache = CACHE / f'{page_number:03}.json'
    image_path = OUTPUT / 'source' / f'{page_number:03}.jpg'
    if cache.exists() and image_path.exists():
        return json.loads(cache.read_text())
    with fitz.open(SOURCE) as document:
        pix = document[page_number - 1].get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
    picture = Image.open(io.BytesIO(pix.tobytes('png'))).rotate(180, expand=True)
    picture.save(image_path, quality=84, optimize=True)
    recognition_path = CACHE / f'{page_number:03}.png'
    picture.save(recognition_path)
    env = dict(os.environ, OMP_THREAD_LIMIT='1')
    result = subprocess.run(['tesseract', str(recognition_path), 'stdout', '--psm', '6', 'tsv'],
                            capture_output=True, text=True, check=True, env=env)
    words = []
    lines = {}
    for row in csv.DictReader(io.StringIO(result.stdout), delimiter='\t', quoting=csv.QUOTE_NONE):
        if row['level'] != '5' or not row['text'].strip():
            continue
        word = {'text': row['text'], 'x': int(row['left']), 'y': int(row['top']),
                'w': int(row['width']), 'h': int(row['height']), 'confidence': float(row['conf']),
                'line': '-'.join(row[key] for key in ['block_num', 'par_num', 'line_num'])}
        words.append(word)
        lines.setdefault(word['line'], []).append(word['text'])
    data = {'page': page_number, 'printed': page_number - 2 if page_number > 2 else None,
            'width': picture.width, 'height': picture.height, 'words': words,
            'text': '\n'.join(' '.join(words) for words in lines.values())}
    cache.write_text(json.dumps(data, ensure_ascii=False))
    recognition_path.unlink(missing_ok=True)
    return data


if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    (OUTPUT / 'source').mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=6) as pool:
        pages = []
        for data in pool.map(extract, range(1, 166)):
            pages.append(data)
            if len(pages) % 15 == 0:
                print(f'Extracted {len(pages)}/165 pages', flush=True)
    (CACHE / 'all-pages.json').write_text(json.dumps(pages, ensure_ascii=False))
    (OUTPUT / 'pages.json').write_text(json.dumps([
        {key: page[key] for key in ['page', 'printed', 'text']} for page in pages
    ], ensure_ascii=False))
    print('Page extraction complete', flush=True)
