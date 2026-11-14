#!/usr/bin/env python3
"""Zero-dependency CoinDozer build, using Python 3 standard library only.

ES modules have an explicit dependency order; this does not resolve arbitrary
JavaScript imports. The source HTML must contain exactly the known stylesheet
and entry-script tags. Silent template drift is an error.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
MODULES = [
    'math.js', 'heading.js', 'cameraZoom.js', 'economy.js', 'telemetry.js',
    'flash.js', 'scoop.js', 'geometry.js', 'quality.js', 'renderer.js',
    'triggers.js', 'world.js', 'collisions.js', 'activity.js',
    'granular.js', 'physics.js', 'vehicle.js', 'main.js'
]
STYLE_TAG = '<link rel="stylesheet" href="./style.css" />'
SCRIPT_TAG = '<script type="module" src="./src/main.js"></script>'


class BuildError(RuntimeError):
    """A required source or bundled-output invariant is not satisfied."""


def replace_exact(source, needle, replacement, label):
    matches = source.count(needle)
    if matches != 1:
        raise BuildError(f'{label}: expected exactly one tag; found {matches}. '
                         'Update the bundle contract when changing the template.')
    return source.replace(needle, replacement)


def inline_assets(source, css, js):
    html = replace_exact(source, STYLE_TAG, '<style>\n' + css + '\n</style>', 'CSS')
    html = replace_exact(html, SCRIPT_TAG,
                         "<script>\n(()=>{'use strict';\n" + js + "\n})();\n</script>",
                         'entry script')
    if STYLE_TAG in html or SCRIPT_TAG in html:
        raise BuildError('Unreplaced original HTML asset tags')
    if re.search(r'<script[^>]*\bsrc\s*=|<link[^>]*\bhref\s*=', html, re.I):
        raise BuildError('Single-file output retains a dependent script or stylesheet')
    if 'src/main.js' in html or 'href="./style.css"' in html:
        raise BuildError('Single-file output still refers to source assets')
    if '<style>' not in html or "(()=>{'use strict';" not in html:
        raise BuildError('Bundled CSS or JavaScript content is missing')
    return html


def build(root=ROOT):
    js_parts = []
    for name in MODULES:
        path = root / 'src' / name
        if not path.is_file():
            raise BuildError(f'Missing source module: {name}')
        raw = path.read_text(encoding='utf-8')
        raw = re.sub(r'^import\s+[^\n]+;\s*$', '', raw, flags=re.M)
        raw = re.sub(r'^export\s*\{[^\n]+\};\s*$', '', raw, flags=re.M)
        raw = re.sub(r'\bexport\s+(?=(?:class|function|const|let)\b)', '', raw)
        if re.search(r'^\s*(?:import|export)\b', raw, re.M):
            raise BuildError(f'Unhandled module syntax in {name}')
        js_parts.append(f'// --- {name} ---\n' + raw)
    source = (root / 'index.html').read_text(encoding='utf-8')
    css = (root / 'style.css').read_text(encoding='utf-8')
    result = inline_assets(source, css, '\n'.join(js_parts))
    target = root / 'dist' / 'index.html'
    target.parent.mkdir(exist_ok=True)
    target.write_text(result, encoding='utf-8')
    print(f'Built {target}: {target.stat().st_size / 1024:.0f} KiB')
    return target


if __name__ == '__main__':
    build()
