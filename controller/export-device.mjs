import fs from 'node:fs';
import path from 'node:path';
const destination=process.argv[2];if(!destination)throw Error('Provide an output HTML path.');
const source=process.argv[3]||'dist/index.html';
const sourceDir=path.dirname(source);
let html=fs.readFileSync(source,'utf8');
html=html.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,name)=>'<style>'+fs.readFileSync(path.join(sourceDir,name),'utf8').replace(/@import url\([^;]+;/g,'')+'</style>');
html=html.replace(/<script src="([^"]+)"><\/script>/g,(_,name)=>'<script>'+fs.readFileSync(path.join(sourceDir,name),'utf8')+'</script>');
fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,html);console.log('Created standalone ESP32 UI: '+destination);
