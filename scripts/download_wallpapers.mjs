import fs from 'fs';
import path from 'path';
import https from 'https';

const ASSETS_DIR = path.resolve('frontend/src/assets');

// Curated 12 distinct 4K estate, coffee, plantation, mountain landscapes
const IMAGES = [
  { file: 'estate-bg-1.jpg', url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-2.jpg', url: 'https://images.unsplash.com/photo-1544735716-392fe2489ffa?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-3.jpg', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-4.jpg', url: 'https://images.unsplash.com/photo-1528181304800-259b08848526?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-5.jpg', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-6.jpg', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-7.jpg', url: 'https://images.unsplash.com/photo-1426604966848-d7adac402bff?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-8.jpg', url: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-9.jpg', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-10.jpg', url: 'https://images.unsplash.com/photo-1511497584788-87676104235f?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-11.jpg', url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2560&auto=format&fit=crop' },
  { file: 'estate-bg-12.jpg', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2560&auto=format&fit=crop' }
];

function downloadOne(item) {
  const dest = path.join(ASSETS_DIR, item.file);
  const tempDest = dest + '.tmp';
  return new Promise((resolve) => {
    const req = https.get(item.url, { timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return https.get(res.headers.location, { timeout: 15000 }, (res2) => {
          if (res2.statusCode !== 200) {
            console.warn(`[SKIP] ${item.file}: status ${res2.statusCode}`);
            return resolve(false);
          }
          const file = fs.createWriteStream(tempDest);
          res2.pipe(file);
          file.on('finish', () => {
            file.close();
            fs.renameSync(tempDest, dest);
            const sz = Math.round(fs.statSync(dest).size / 1024);
            console.log(`✓ Downloaded ${item.file} (${sz} KB)`);
            resolve(true);
          });
        }).on('error', (e) => {
          console.warn(`[ERR] ${item.file}:`, e.message);
          resolve(false);
        });
      }
      if (res.statusCode !== 200) {
        console.warn(`[SKIP] ${item.file}: status ${res.statusCode}`);
        return resolve(false);
      }
      const file = fs.createWriteStream(tempDest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.renameSync(tempDest, dest);
        const sz = Math.round(fs.statSync(dest).size / 1024);
        console.log(`✓ Downloaded ${item.file} (${sz} KB)`);
        resolve(true);
      });
    });
    req.on('error', (e) => {
      console.warn(`[ERR] ${item.file}:`, e.message);
      resolve(false);
    });
    req.on('timeout', () => {
      req.destroy();
      console.warn(`[TIMEOUT] ${item.file}`);
      resolve(false);
    });
  });
}

async function main() {
  console.log('Downloading 12 wallpapers concurrently...');
  const results = await Promise.all(IMAGES.map(downloadOne));
  const successCount = results.filter(Boolean).length;
  console.log(`Finished: ${successCount}/${IMAGES.length} wallpapers downloaded.`);
}

main();
