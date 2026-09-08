import test from 'node:test';
import assert from 'node:assert/strict';
import {renderArt,normalizeArt,presets} from '../public/card-art.js';
test('concept exports escape names and keep executable content out of SVG',()=>{
 const svg=renderArt({owner:'<script>alert("x")</script>'});
 assert.doesNotMatch(svg,/<script|foreignObject|onload=/);
 assert.match(svg,/&lt;script&gt;/);
 assert.match(svg,/DEMO \/ NOT LIVE/);
});
test('optional blocks disappear when disabled',()=>{
 const svg=renderArt({mascot:'none',caption:'none',heatmap:false,stack:false,streak:false,cache:false,rank:false,trend:false,doodles:false});
 for(const element of ['flame','trend','doodles','caption']) assert.ok(svg.includes(`data-element="${element}"`));
 for(const label of ['day streak','cache read','Rank #','little heat','usual suspects'])assert.ok(!svg.includes(label),label);
});
test('normalization bounds untrusted choices and presets exclude executable content',()=>{
 assert.equal(normalizeArt({mascot:'<img>',palette:'url(x)',heatmap:'false'}).mascot,'flame');
 assert.equal(normalizeArt({owner:'x'.repeat(100)}).owner.length,39);
 for(const preset of Object.values(presets)){const svg=renderArt(preset);assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.doesNotMatch(svg,/<script|foreignObject|onload=/);}
});
