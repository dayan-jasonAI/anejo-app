"""Build static, renamed editorial instances from existing bundled variable fonts.
Requires fontTools 4.66.0; no downloads or runtime service calls.
"""
from pathlib import Path
from hashlib import sha256
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
import fontTools
root = Path(__file__).resolve().parent
records = []
for filename, weight, family, style in [
    ('CormorantGaramond.ttf', 600, 'Anejo Editorial Serif', 'SemiBold'),
    ('JosefinSans.ttf', 500, 'Anejo Editorial Sans', 'Medium'),
]:
    source = root.parent / 'cardgen/fonts' / filename
    font = TTFont(source, recalcTimestamp=False)
    font = instantiateVariableFont(font, {'wght': weight}, inplace=True)
    # Renamed derivative families; retain copyright and license name records.
    names = {1: family, 2: style, 3: family.replace(' ', '')+'-'+style+'-1',
             4: family+' '+style, 6: family.replace(' ', '')+'-'+style,
             16: family, 17: style}
    for record in list(font['name'].names):
        if record.nameID in names:
            font['name'].setName(names[record.nameID], record.nameID, record.platformID, record.platEncID, record.langID)
    font['OS/2'].usWeightClass = weight
    target = root / 'assets' / (family.replace(' ', '')+'-'+style+'.ttf')
    font.save(target)
    checked = TTFont(target)
    assert 'fvar' not in checked and checked['OS/2'].usWeightClass == weight
    records.append({'source':str(source.relative_to(root.parent.parent)), 'source_sha256':sha256(source.read_bytes()).hexdigest(),
                    'output':target.name,'sha256':sha256(target.read_bytes()).hexdigest(), 'family':family,'weight':weight})
(root/'assets/editorial-fonts.json').write_text(json.dumps({'fontTools':fontTools.__version__,'fonts':records},indent=2)+'\n')
