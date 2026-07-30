#!/usr/bin/env python3
# Regenerate functions/_lib/brand_brief.js from docs/brand-standards-brief.md.
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
md = (root / 'docs/brand-standards-brief.md').read_text()
tpl = (root / 'functions/_lib/brand_brief.js').read_text()
head = tpl.split('export const BRAND_BRIEF')[0]
(root / 'functions/_lib/brand_brief.js').write_text(head + 'export const BRAND_BRIEF = ' + json.dumps(md) + ';\n')
print('synced', len(md), 'bytes')
