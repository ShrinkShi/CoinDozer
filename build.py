#!/usr/bin/env python3
"""Zero-dependency offline bundle with actual per-module lexical scope.

The project uses only named ESM imports/exports. Each module executes in its
own closure with explicit imported bindings, so unrelated local const names
cannot collide in the single-file distribution.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent
# Dependency order: modules may only import entries which appear above them.
MODULES = [
    'math.js','heading.js','mapLayout.js','navigation.js','economy.js','vehicleRig.js','cameraZoom.js','sceneRules.js','telemetry.js',
    'flash.js','scoop.js','geometry.js','quality.js','renderer.js',
    'triggers.js','collisions.js','activity.js','terrain.js','granular.js','vehicle.js',
    'world.js','physics.js','main.js'
]
STYLE_TAG = '<link rel="stylesheet" href="./style.css" />'
SCRIPT_TAG = '<script type="module" src="./src/main.js"></script>'
IMPORT_RE = re.compile(
    r"""^import\s+\{([^}]+)\}\s+from\s+['"]\./([^'"]+)['"];\s*$""",re.M)
EXPORT_DECL = re.compile(r'\bexport\s+(?=(?:class|function|const|let)\b)')
EXPORT_NAMES = re.compile(
    r'^export\s+(?:class|function|const|let)\s+([A-Za-z_$][\w$]*)',re.M)
EXPORT_LIST = re.compile(r'^export\s*\{([^}]+)\};?\s*$',re.M)

class BuildError(RuntimeError):
    """A required source or bundle invariant is not satisfied."""

def replace_exact(source,needle,replacement,label):
    matches=source.count(needle)
    if matches!=1:
        raise BuildError(f'{label}: expected exactly one tag; found {matches}. '
                         'Update the bundling contract after editing the template.')
    return source.replace(needle,replacement)

def inline_assets(source,css,js):
    html=replace_exact(source,STYLE_TAG,'<style>\n'+css+'\n</style>','CSS')
    html=replace_exact(
        html,SCRIPT_TAG,"<script>\n(()=>{'use strict';\n"+js+"\n})();\n</script>",
        'entry script')
    if STYLE_TAG in html or SCRIPT_TAG in html:
        raise BuildError('Original entry assets remain in built output')
    if re.search(r'<script[^>]*\bsrc\s*=|<link[^>]*\bhref\s*=',html,re.I):
        raise BuildError('Single-file output retains a dependent script or stylesheet')
    if 'src/main.js' in html or 'href="./style.css"' in html:
        raise BuildError('Output still refers to non-inlined source assets')
    if '<style>' not in html or "(()=>{'use strict';" not in html:
        raise BuildError('Bundled CSS or JS content is missing')
    return html

def module_var(filename):
    if not re.fullmatch(r'[A-Za-z0-9_]+\.js',filename):
        raise BuildError(f'Unsupported module filename: {filename}')
    return '__m_'+filename[:-3]

def scoped_module(name,content,compiled):
    imports=[]
    def replace_import(match):
        symbols=match.group(1).strip()
        dep=match.group(2)
        if dep not in compiled:
            raise BuildError(f'{name} imports {dep} before it is initialized')
        for item in symbols.split(','):
            item=item.strip()
            pair=item.split(' as ')
            if len(pair)==1:
                imports.append((pair[0],pair[0],dep))
            elif len(pair)==2:
                imports.append((pair[0],pair[1],dep))
            else:
                raise BuildError(f'Unsupported import binding: {item}')
        return ''
    content=IMPORT_RE.sub(replace_import,content)
    exports=list(EXPORT_NAMES.findall(content))
    def replace_export_list(match):
        for spec in match.group(1).split(','):
            spec=spec.strip()
            pair=spec.split(' as ')
            if len(pair)!=1:
                raise BuildError(f'Export alias unsupported in {name}: {spec}')
            exports.append(pair[0])
        return ''
    content=EXPORT_LIST.sub(replace_export_list,content)
    content=EXPORT_DECL.sub('',content)
    if re.search(r'^\s*(?:import|export)\b',content,re.M):
        raise BuildError(f'Unhandled ESM statement in {name}')
    prelude=[f'const {{{origin}: {local}}} = {module_var(dep)};'
             for origin,local,dep in imports]
    unique=list(dict.fromkeys(exports))
    return (
        f'// --- {name} (isolated) ---\n'
        f'const {module_var(name)} = (()=>{{\n'
        + "'use strict';\n"
        + '\n'.join(prelude)+'\n'
        + content+'\n'
        + 'return {'+','.join(unique)+'};\n'
        + '})();\n'
    )

def build(root=ROOT):
    compiled=set()
    parts=[]
    for name in MODULES:
        file=root/'src'/name
        if not file.is_file():
            raise BuildError(f'Missing module: {name}')
        parts.append(scoped_module(name,file.read_text(encoding='utf-8'),compiled))
        compiled.add(name)
    source=(root/'index.html').read_text(encoding='utf-8')
    css=(root/'style.css').read_text(encoding='utf-8')
    output=inline_assets(source,css,'\n'.join(parts))
    target=root/'dist'/'index.html'
    target.parent.mkdir(exist_ok=True)
    target.write_text(output,encoding='utf-8')
    print(f'Built {target}: {target.stat().st_size / 1024:.0f} KiB')
    return target

if __name__=='__main__':
    build()
