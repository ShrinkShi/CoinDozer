/** Validate the actual shipped HTML inline JavaScript, not only src/main.js.
 * Catches duplicated top-level const names when a bundle is flattened.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'offline bundle should contain one inline game script');
const js=scripts[0][1];
assert.ok(js.includes('__m_activity'), 'activity module is bundled');
assert.ok(js.includes('__m_collisions'), 'collision module is bundled');
assert.ok(js.includes('__m_vehicleRig'), 'v0.6.4 vehicle rig is bundled with independent scope');
assert.ok(js.includes('__m_sceneRules'), 'v0.6.5 separate economy rules are bundled');
assert.ok(!html.includes('src="./src/main.js"'), 'no external module script');
assert.doesNotThrow(()=>new Script(js,{filename:'dist/index.html'}));
console.log('v0.6.3.2: built offline JavaScript syntax / independent module lexical scopes PASS');
