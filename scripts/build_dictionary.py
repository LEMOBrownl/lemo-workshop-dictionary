"""Build searchable records from column-aligned OCR, retaining scan provenance."""
import collections
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / '.work' / 'ocr'
PAGES = json.loads((CACHE / 'all-pages.json').read_text())


def clean(text, language):
    text = re.sub(r'\s+', ' ', text).strip(' |•_')
    if language == 'de':
        text = re.sub(r'^2(?=[a-zäöü])', 'Z', text)
        text = re.sub(r'^[£€](?=[a-z])', 'E', text)
        for a, b in [('SchweiB', 'Schweiß'), ('schweiB', 'schweiß'), ('Schwei8', 'Schweiß'),
                     ('AbreiB', 'Abreiß'), ('Abrei8', 'Abreiß'), ('AuBen', 'Außen'),
                     ('auBen', 'außen'), ('AnschluB', 'Anschluß'), ('VerschluB', 'Verschluß'),
                     ('FuB', 'Fuß'), ('MaBe', 'Maße'), ('maBe', 'maße'),
                     ('Rol Len', 'Rollen'), ('Rol len', 'Rollen'), ('rol len', 'rollen'),
                     ('Schwei Bb', 'Schweißb'), ('Schwei B', 'Schweiß'),
                     ('Abwickelwel le', 'Abwickelwelle'), ('Nadel leiste', 'Nadelleiste'),
                     ('Nadel lager', 'Nadellager'), ('Kugel lager', 'Kugellager'),
                     ('Abfal l', 'Abfall'), ('AufreiB', 'Aufreiß')]:
            text = text.replace(a, b)
    return text


def normalize(text):
    return re.sub(r'[^a-z0-9]', '', unicodedata.normalize('NFKD', text.lower().replace('ß', 'ss')))


def category(printed):
    if printed <= 15:
        return 'Assemblies'
    if printed <= 41 or 87 <= printed <= 102 or 126 <= printed <= 140:
        return 'Machine terminology'
    if 47 <= printed <= 50 or 103 <= printed <= 105 or 141 <= printed <= 143:
        return 'Products & film'
    if 51 <= printed <= 79 or 106 <= printed <= 125 or 144 <= printed <= 163:
        return 'Spare parts'
    if 80 <= printed <= 83:
        return 'Bearings'
    return 'Technical data'


def lines(page):
    result = collections.OrderedDict()
    for word in page['words']:
        minimum = .085
        if not minimum * page['height'] < word['y'] < .935 * page['height']:
            continue
        if word['x'] < .10 * page['width']:
            continue
        result.setdefault(word['line'], []).append(word)
    return list(result.values())


records = []
for page in PAGES:
    printed = page['printed']
    if not printed or not (2 <= printed <= 41 or 47 <= printed <= 163):
        continue
    if 42 <= printed <= 46:
        continue
    order = ['en', 'de', 'fr'] if 87 <= printed <= 125 else ['fr', 'de', 'en'] if printed >= 126 else ['de', 'en', 'fr']
    group = ''
    current = None
    for row in lines(page):
        columns = [[], [], []]
        for word in sorted(row, key=lambda w: w['x']):
            x = word['x'] / page['width']
            column = 0 if x < .399 else 1 if x < .686 else 2
            columns[column].append(word)
        texts = {language: clean(' '.join(w['text'] for w in col), language) for language, col in zip(order, columns)}
        left = texts[order[0]]
        nonempty = sum(bool(text) for text in texts.values())
        if not nonempty:
            continue
        group_candidate = re.sub(r'[\s~.,]+$', '', left)
        if nonempty == 1 and left and (re.fullmatch(r'\(?\d+\)?[.,]?\s*[A-Z0-9-]+', group_candidate, re.I)
                                                     or (printed < 10 and re.fullmatch(r'[A-Za-z0-9/-]{1,12}', group_candidate))):
            group = group_candidate.replace('BSZz', 'BSZ')
            current = None
            continue
        if not current and nonempty < 2:
            continue
        # Every new left-column entry anchors a translation row. Continuations
        # without that anchor, parenthetical lines and broken words stay together.
        continuation = not left or left.startswith('(') and not re.match(r'\(\d+\)\s*[A-Z]', left)
        if current and left:
            previous = current[order[0]]
            continuation = continuation or (previous.endswith('-') and (nonempty < 3 or left[0].islower())) or bool(re.match(
                r'^(für |fur |und |mit |der |des |zur |schleifende |de Dichtung|standscheiben|lager$)', left))
            if printed < 10 and group and current['context'] == group:
                continuation = True
        if continuation and current:
            for language in order:
                addition = texts[language]
                if addition:
                    current[language] += ('' if current[language].endswith('-') else ' ') + addition
            current['_conf'].extend(w['confidence'] for w in row)
            continue
        if nonempty < 2:
            current = None
            continue
        if any(re.search(r'(Gesamtterminologie|Technische Daten|Ersatzteilliste|Ersatzicilliste)', text, re.I) for text in texts.values()):
            current = None
            continue
        if not any(re.search('[A-Za-zÄÖÜäöüéèà]', text) for text in texts.values()):
            continue
        if current and printed < 16 and current['de'].isupper() and texts['de'].isupper():
            for language in order:
                if texts[language]:
                    current[language] += ('' if current[language].endswith('-') else ' ') + texts[language]
            current['_conf'].extend(w['confidence'] for w in row)
            continue
        current = dict(texts, category=category(printed), context=group,
                       sources=[{'page': page['page'], 'printed': printed, 'context': group}],
                       _conf=[w['confidence'] for w in row])
        records.append(current)

# Visually checked against the source image, not inferred from the OCR.
checked_page10 = {
    'blowing air fingers': ('Blaskamm', 'blowing air fingers', 'peigne de soufflage'),
    'rubber plate': ('Einlage', 'rubber plate', 'plaque de caoutchouc'),
    'cutting blade': ('Schneidmesser', 'cutting blade', 'lame de découpe'),
    'draw roller': ('Vorzugswalze', 'draw roller', 'rouleau de tirage'),
    'air cylinder': ('Nadelzylinder', 'air cylinder', 'cylindre à aiguilles'),
    'unwind shaft': ('Abwickelwelle', 'unwind shaft', 'arbre de déroulement'),
    'air shaft': ('Expansionswelle', 'air shaft', 'arbre à expansion'),
    'film reel': ('Folienrolle', 'film reel', 'bobine de film'),
    'edge guide system': ('Kantensteuerung', 'edge guide system', 'système de guidage latéral'),
    'cooling bar': ('Kühlleiste', 'cooling bar', 'barre de refroidissement'),
    'reel brake': ('Rollenabbremsung', 'reel brake', 'freinage de la bobine'),
    'dancer': ('Tänzer', 'dancer', 'baladeur'),
    'sealing/welding ber': ('Schweißbalken', 'sealing/welding bar', 'barre de soudure'),
}
for record in records:
    if record['sources'][0]['page'] == 12 and record['en'] in checked_page10:
        record.update(zip(['de', 'en', 'fr'], checked_page10[record['en']]))
        record['_checked'] = True

unique = {}
for record in records:
    key = '|'.join(normalize(record[lang]) for lang in ['de', 'en', 'fr'])
    # Reverse indexes repeat the German-led glossary. Attach corroborating
    # locations when their text agrees; expose all other readings in page search.
    if record['sources'][0]['printed'] >= 87 and key not in unique:
        continue
    if not record['de'].strip():
        continue
    if key in unique:
        existing = unique[key]
        existing['sources'].extend(source for source in record['sources'] if source not in existing['sources'])
        existing['_conf'].extend(record['_conf'])
        if record['context'] and record['context'] not in existing['context']:
            existing['context'] = ', '.join(filter(None, [existing['context'], record['context']]))
        continue
    unique[key] = record

output = []
for key, record in unique.items():
    confidences = record.pop('_conf')
    record['id'] = 'scan-' + hashlib.sha1(key.encode()).hexdigest()[:12]
    record['confidence'] = round(sum(confidences) / len(confidences))
    record['review'] = min(confidences) < 40 or record['confidence'] < 83 or any(not record[lang] for lang in ['de', 'en', 'fr'])
    record['verified'] = record.pop('_checked', False)
    if record['verified']:
        record['review'] = False
    output.append(record)

# The scan has been checked visually for these specific rows on printed page 10.
verified = {
    ('Blaskamm', 'blowing air fingers'): ('Blaskamm', 'blowing air fingers', 'peigne de soufflage'),
    ('Einlage', 'rubber plate'): ('Einlage', 'rubber plate', 'plaque de caoutchouc'),
    ('Schneidmesser', 'cutting blade'): ('Schneidmesser', 'cutting blade', 'lame de découpe'),
    ('Vorzugswalze', 'draw roller'): ('Vorzugswalze', 'draw roller', 'rouleau de tirage'),
    ('Nadelzylinder', 'air cylinder'): ('Nadelzylinder', 'air cylinder', 'cylindre à aiguilles'),
    ('Abwickelwelle', 'unwind shaft'): ('Abwickelwelle', 'unwind shaft', 'arbre de déroulement'),
    ('Expansionswelle', 'air shaft'): ('Expansionswelle', 'air shaft', 'arbre à expansion'),
    ('Folienrolle', 'film reel'): ('Folienrolle', 'film reel', 'bobine de film'),
    ('Kantensteuerung', 'edge guide system'): ('Kantensteuerung', 'edge guide system', 'système de guidage latéral'),
}
for record in output:
    if any(source['page'] == 12 for source in record['sources']):
        match = verified.get((record['de'], record['en']))
        if match:
            record.update(zip(['de', 'en', 'fr'], match))
            record.update(verified=True, review=False)

output.sort(key=lambda record: normalize(record['de']))
(ROOT / 'docs' / 'dictionary.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':')))
print(json.dumps({'entries': len(output), 'categories': dict(collections.Counter(r['category'] for r in output)),
                  'flagged': sum(r['review'] for r in output), 'visuallyChecked': sum(r['verified'] for r in output)}, indent=2))
for record in output:
    if 'blask' in record['de'].lower():
        print(json.dumps(record, ensure_ascii=False))
