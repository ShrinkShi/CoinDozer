#!/usr/bin/env python3
"""Zero-dependency static build: bundle ES modules into a single offline HTML.
Source development remains modular; dist/index.html works as file:// and GitHub Pages.
"""
from pathlib import Path
import re, html
root=Path(__file__).resolve().parent
paths=['math.js','heading.js','cameraZoom.js','economy.js','scoop.js','geometry.js','renderer.js','world.js','granular.js','physics.js','vehicle.js','main.js']
js=[]
for name in paths:
    raw=(root/'src'/name).read_text()
    if name=='vehicle.js':
        raw=raw.replace("import {PALETTE as C} from './world.js';", 'const C = PALETTE;')
    raw=re.sub(r'^import\s+[^\n]+;\s*$', '',raw,flags=re.M)
    raw=re.sub(r'^export\s*\{[^\n]+\};\s*$', '',raw,flags=re.M)
    raw=re.sub(r'\bexport\s+(?=(?:class|function|const|let)\b)', '',raw)
    js.append(f'// --- {name} ---\n'+raw)
body='\n'.join(js)
assert 'import ' not in body and 'export ' not in body
source=(root/'index.html').read_text()
css=(root/'style.css').read_text()
output=source.replace('<link rel="stylesheet" href="./style.css" />','<style>\n'+css+'\n</style>')
output=output.replace('<script type="module" src="./src/main.js"></script>','<script>\n(()=>{\'use strict\';\n'+body+'\n})();\n</script>')
(root/'dist').mkdir(exist_ok=True)
(root/'dist'/'index.html').write_text(output)
print(f'Built dist/index.html: {(root/"dist"/"index.html").stat().st_size/1024:.0f} KB')
