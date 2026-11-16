import fs from 'node:fs';import {html} from '../worker/ui.js';
fs.mkdirSync('public',{recursive:true});fs.writeFileSync('public/index.html',html);
