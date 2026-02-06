#!/usr/bin/env node
/**
 * Fetch GitHub Models catalog at build time and save as static JSON
 * Local models are read from config/models.py (single source of truth)
 */

import { execSync } from 'child_process';

const GITHUB_MODELS_CATALOG_URL = 'https://models.github.ai/catalog/models';

function getLocalModels() {
    try {
        const output = execSync('python3 ../../../scripts/generate_models_json.py', {
            encoding: 'utf-8',
            cwd: new URL('.', import.meta.url).pathname
        });
        const data = JSON.parse(output);
        return data.models;
    } catch (error) {
        console.error('❌ Failed to generate local models from config:', error.message);
        console.log('⚠️ Using empty local models list');
        return [];
    }
}

async function fetchGitHubModels() {
    console.log('📡 Fetching GitHub Models catalog...');

    try {
        const response = await fetch(GITHUB_MODELS_CATALOG_URL);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const catalog = await response.json();
        console.log(`✅ Fetched ${catalog.length} models from GitHub catalog`);

        // Filter to chat-capable models (exclude embeddings)
        const chatModels = catalog.filter(m =>
            m.supported_output_modalities?.includes('text') &&
            !m.supported_output_modalities?.includes('embeddings')
        );

        // Transform to our format
        const apiModels = chatModels.map((m, index) => ({
            id: m.id,
            name: m.name,
            type: 'api',
            priority: index + 1,
            context_length: m.limits?.max_input_tokens || 128000,
            publisher: m.publisher,
            summary: m.summary,
            capabilities: m.capabilities || [],
        }));

        console.log(`✅ Processed ${apiModels.length} chat-capable API models`);
        return apiModels;

    } catch (error) {
        console.error('❌ Failed to fetch GitHub Models catalog:', error.message);
        console.log('⚠️ Using fallback API models list');

        // Fallback static list
        return [
            { id: 'openai/gpt-4o', name: 'OpenAI GPT-4o', type: 'api', priority: 1, context_length: 131072 },
            { id: 'openai/gpt-4.1', name: 'OpenAI GPT-4.1', type: 'api', priority: 2, context_length: 1048576 },
            { id: 'deepseek/deepseek-v3-0324', name: 'DeepSeek-V3-0324', type: 'api', priority: 3, context_length: 128000 },
            { id: 'meta/llama-3.3-70b-instruct', name: 'Llama-3.3-70B-Instruct', type: 'api', priority: 4, context_length: 128000 },
            { id: 'mistral-ai/mistral-small-2503', name: 'Mistral Small 3.1', type: 'api', priority: 5, context_length: 128000 },
        ];
    }
}

async function main() {
    const localModels = getLocalModels();
    const apiModels = await fetchGitHubModels();

    const allModels = {
        models: [...localModels, ...apiModels],
        fetchedAt: new Date().toISOString(),
        source: 'build-time',
    };

    // Output JSON to stdout (will be captured by build script)
    console.log('\n📦 Models data:');
    console.log(JSON.stringify(allModels, null, 2));

    // Write to file
    const fs = await import('fs');
    const path = await import('path');
    const outPath = path.join(process.cwd(), 'public', 'models.json');

    fs.writeFileSync(outPath, JSON.stringify(allModels, null, 2));
    console.log(`\n✅ Wrote ${allModels.models.length} models to ${outPath}`);
}

main().catch(console.error);
