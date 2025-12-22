#!/usr/bin/env node
/**
 * Fetch GitHub Models catalog at build time and save as static JSON
 * This allows the extension to work without a backend
 */

const GITHUB_MODELS_CATALOG_URL = 'https://models.github.ai/catalog/models';

// Local models that run on inference servers
const LOCAL_MODELS = [
    { id: 'qwen3-4b', name: 'Qwen3 4B', type: 'local', priority: 1, context_length: 128000 },
    { id: 'deepseek-r1-distill-qwen-1.5b', name: 'DeepSeek R1 1.5B', type: 'local', priority: 2, context_length: 64000 },
    { id: 'gemma-3-12b-it', name: 'Gemma 3 12B', type: 'local', priority: 3, context_length: 8192 },
    { id: 'mistral-7b-instruct-v0.3', name: 'Mistral 7B v0.3', type: 'local', priority: 4, context_length: 32768 },
    { id: 'phi-3-mini', name: 'Phi-3 Mini', type: 'local', priority: 5, context_length: 128000 },
    { id: 'rnj-1-instruct', name: 'RNJ-1 Instruct', type: 'local', priority: 6, context_length: 8192 },
    { id: 'llama-3.2-3b', name: 'Llama 3.2-3B', type: 'local', priority: 7, context_length: 128000 },
];

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
    const apiModels = await fetchGitHubModels();

    const allModels = {
        models: [...LOCAL_MODELS, ...apiModels],
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
