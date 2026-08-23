/* This is a script to build the site with Pagefind */

const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

function runIconGeneration() {
    const iconScript = join(process.cwd(), 'scripts', 'generate-icons.js');
    const iconCacheFile = join(process.cwd(), 'src', 'utils', 'icons.ts');

    if (existsSync(iconScript)) {
        console.log('Generating icon bundle...');
        execSync('node scripts/generate-icons.js', {
            stdio: 'inherit',
            cwd: process.cwd(),
        });
        return;
    }

    if (existsSync(iconCacheFile)) {
        console.warn('scripts/generate-icons.js not found. Using committed src/utils/icons.ts fallback.');
        return;
    }

    console.error('Missing both scripts/generate-icons.js and src/utils/icons.ts.');
    process.exit(1);
}

// Main function
function main() {
    const outputDir = 'dist';

    console.log('🚀 Deployment target: Cloudflare Pages');
    console.log(`📁 Pagefind output directory: ${outputDir}`);

    try {
        runIconGeneration();

        // Run Astro build
        console.log('🔨 Running Astro build...');
        execSync(`pnpm exec astro build`.trim(), {
            stdio: 'inherit',
            cwd: process.cwd() // Ensure in the correct directory
        });

        // Check if output directory exists
        if (!existsSync(outputDir)) {
            console.error(`❌ Output directory does not exist: ${outputDir}`);
            process.exit(1);
        }

        // Run Pagefind
        console.log(`🔍 Running Pagefind search index generation...`);
        execSync(`pnpm exec pagefind --site ${outputDir}`, {
            stdio: 'inherit',
            cwd: process.cwd() // Ensure in the correct directory
        });

        // Remove known third-party source-map metadata, then enforce the final artifact policy.
        console.log('Sanitizing production artifacts...');
        execSync('node scripts/sanitize-production-artifacts.cjs', {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        console.log('Validating production artifacts...');
        execSync('node scripts/validate-production-artifacts.cjs', {
            stdio: 'inherit',
            cwd: process.cwd()
        });

        console.log('✅ Build completed!');
        console.log(`📊 Search index generated at: ${outputDir}/pagefind/`);

    } catch (error) {
        console.error('❌ Build failed:', error.message);
        process.exit(1);
    }
}

main();
