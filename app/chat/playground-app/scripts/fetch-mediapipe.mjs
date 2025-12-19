/**
 * Download MediaPipe assets at build time for extension mode
 * This allows gesture recognition to work without CSP issues
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEDIAPIPE_VERSION = '0.10.0';
const OUT_DIR = path.join(__dirname, '../public/mediapipe');

// WASM files needed from jsdelivr
const WASM_FILES = [
    'vision_wasm_internal.js',
    'vision_wasm_internal.wasm',
];

// Model files from Google Storage
const MODEL_FILES = [
    {
        url: 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task',
        name: 'gesture_recognizer.task'
    },
    {
        url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        name: 'hand_landmarker.task'
    }
];

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlinkSync(dest);
                return download(response.headers.location, dest).then(resolve).catch(reject);
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(dest);
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
}

async function main() {
    console.log('Downloading MediaPipe assets for extension mode...');

    // Create output directory
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    // Download WASM files
    console.log('\n📦 Downloading WASM files...');
    for (const file of WASM_FILES) {
        const url = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm/${file}`;
        const dest = path.join(OUT_DIR, file);

        if (fs.existsSync(dest)) {
            console.log(`  ✓ ${file} (cached)`);
            continue;
        }

        console.log(`  ↓ ${file}...`);
        try {
            await download(url, dest);
            console.log(`  ✓ ${file}`);
        } catch (err) {
            console.error(`  ✗ ${file}: ${err.message}`);
        }
    }

    // Download model files
    console.log('\n🧠 Downloading model files...');
    for (const { url, name } of MODEL_FILES) {
        const dest = path.join(OUT_DIR, name);

        if (fs.existsSync(dest)) {
            console.log(`  ✓ ${name} (cached)`);
            continue;
        }

        console.log(`  ↓ ${name}...`);
        try {
            await download(url, dest);
            console.log(`  ✓ ${name}`);
        } catch (err) {
            console.error(`  ✗ ${name}: ${err.message}`);
        }
    }

    console.log('\n✓ MediaPipe assets downloaded');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
