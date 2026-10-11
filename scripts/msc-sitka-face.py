"""Materialize the original Small named instance only for DOCX embedding.

Keep original editable-embedding permissions and every glyph; no font install.
The caller captures bytes in memory and stores only OOXML obfuscated parts.
Requires fonttools==4.60.1 in the supplied private tools directory.
"""
import io
import sys

sys.path.insert(0, sys.argv[3])
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

font = TTFont(sys.argv[1])
if font['OS/2'].fsType != 8:
    raise ValueError('Original font does not permit editable document embedding')
weight = int(sys.argv[2])
instance = next(
    item for item in font['fvar'].instances
    if item.coordinates == {'opsz': 6.0, 'wght': float(weight)}
)
output = instantiateVariableFont(
    font, instance.coordinates, inplace=False, updateFontNames=False,
)
# The font's fvar Small instance is opsz=6 while STAT's Small nominal is 8.
# Select the actual named instance, then use its legacy static family names;
# otherwise auto naming rejects that perfectly valid original instance.
italic = 'Italic' in font['name'].getDebugName(2)
style = ('Bold ' if weight == 700 else '') + ('Italic' if italic else '')
style = style.strip() or 'Regular'
values = {1: 'Sitka Small', 2: style, 4: 'Sitka Small' + ('' if style == 'Regular' else ' ' + style),
          6: 'SitkaSmall' + ('' if style == 'Regular' else '-' + style.replace(' ', '')),
          16: 'Sitka Small', 17: style}
for record in output['name'].names:
    if record.nameID in values:
        record.string = values[record.nameID].encode(record.getEncoding())
if output['OS/2'].fsType != font['OS/2'].fsType:
    raise ValueError('Embedding permissions changed')
buffer = io.BytesIO()
output.save(buffer)
sys.stdout.buffer.write(buffer.getvalue())
