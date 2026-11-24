import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire(`${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || '/opt/node_modules'}/`);
const sharp = require('sharp');
const svg = readFileSync('web/mark.svg');
const png = await sharp(svg).resize(512,512).png().toBuffer();
writeFileSync('desktop/icon.png', png);
const entries = [];
for (const [tag,size] of [['ic07',128],['ic08',256],['ic09',512],['ic10',1024]]) {
  const data = await sharp(svg).resize(size,size).png().toBuffer();
  const header = Buffer.alloc(8); header.write(tag); header.writeUInt32BE(data.length+8,4); entries.push(header,data);
}
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns'); icnsHeader.writeUInt32BE(entries.reduce((a,b)=>a+b.length,8),4);
writeFileSync('desktop/icon.icns',Buffer.concat([icnsHeader,...entries]));
const icoPNG=await sharp(svg).resize(256,256).png().toBuffer();
const icoHeader=Buffer.alloc(22); icoHeader.writeUInt16LE(1,2);icoHeader.writeUInt16LE(1,4);icoHeader.writeUInt16LE(1,10);icoHeader.writeUInt16LE(32,12);icoHeader.writeUInt32LE(icoPNG.length,14);icoHeader.writeUInt32LE(22,18);
writeFileSync('desktop/icon.ico',Buffer.concat([icoHeader,icoPNG]));
console.log('Created app icons.');
