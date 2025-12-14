/**
 * Shared Content Formatter
 * Single source of truth for LaTeX rendering and markdown formatting
 * Used across: chat.js, orchestrator.js, roundtable.js, confessions.js
 */

/**
 * Render LaTeX expressions in content
 * Supports: $$...$$ (block), \[...\] (block), $...$ (inline), \(...\) (inline)
 * Protects code blocks and inline code from LaTeX processing
 */
function renderLatex(content) {
  if (!content || typeof katex === 'undefined') return content;

  // Protect code blocks from LaTeX processing
  const codeBlocks = [];
  let protectedContent = content.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODEBLOCK_${codeBlocks.length - 1}__`;
  });

  // Protect inline code
  const inlineCodes = [];
  protectedContent = protectedContent.replace(/`[^`]+`/g, (match) => {
    inlineCodes.push(match);
    return `__INLINECODE_${inlineCodes.length - 1}__`;
  });

  // Block math: $$...$$
  protectedContent = protectedContent.replace(/\$\$([\s\S]+?)\$\$/g, (match, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  // Block math: \[...\]
  protectedContent = protectedContent.replace(/\\\[([\s\S]+?)\\\]/g, (match, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  // Inline math: $...$
  protectedContent = protectedContent.replace(/\$([^\s$][^$]*?[^\s$])\$/g, (match, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  // Inline math: \(...\)
  protectedContent = protectedContent.replace(/\\\(([\s\S]+?)\\\)/g, (match, latex) => {
    try {
      return katex.renderToString(latex.trim(), { displayMode: false, throwOnError: false });
    } catch (e) {
      return match;
    }
  });

  // Restore inline code
  protectedContent = protectedContent.replace(/__INLINECODE_(\d+)__/g, (match, index) => {
    return inlineCodes[parseInt(index)];
  });

  // Restore code blocks
  protectedContent = protectedContent.replace(/__CODEBLOCK_(\d+)__/g, (match, index) => {
    return codeBlocks[parseInt(index)];
  });

  return protectedContent;
}

/**
 * Format content with LaTeX and markdown rendering
 */
function formatContent(content) {
  if (!content) return '';
  try {
    const withLatex = renderLatex(content);
    const rawHtml = marked.parse(withLatex);
    // Sanitize HTML to prevent XSS
    return typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;
  } catch (e) {
    return content;
  }
}

/**
 * Configure marked.js with standard settings
 * Call once on page load
 */
function configureMarked() {
  if (typeof marked === 'undefined') return;

  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: false,
    mangle: false
  });

  const renderer = new marked.Renderer();
  renderer.link = function (href, title, text) {
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
  };
  marked.use({ renderer });
}

/**
 * Parse thinking blocks from reasoning models (Qwen3, DeepSeek-R1)
 */
function parseThinkingContent(content) {
  if (!content) return { thinking: null, answer: content };

  const thinkMatch = content.match(/<think>([\s\S]*?)<\/think>\s*([\s\S]*)/i);
  if (thinkMatch && thinkMatch[1].trim().length > 0) {
    return {
      thinking: thinkMatch[1].trim(),
      answer: thinkMatch[2].trim()
    };
  }

  return { thinking: null, answer: content };
}

/**
 * Render collapsible thinking section HTML
 */
function renderThinkingSection(thinking) {
  const escapedThinking = thinking
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');

  return `
    <details class="thinking-section">
      <summary class="thinking-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        <span>Thinking process</span>
      </summary>
      <div class="thinking-content">${escapedThinking}</div>
    </details>
  `;
}

/**
 * Format content with thinking block support
 * Used by chat.js for reasoning models
 */
function formatContentWithThinking(content) {
  if (!content) return '';

  try {
    const { thinking, answer } = parseThinkingContent(content);
    let html = '';

    if (thinking) {
      html += renderThinkingSection(thinking);
    }

    const withLatex = renderLatex(answer);
    const rawHtml = marked.parse(withLatex);
    // Sanitize HTML
    html += typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(rawHtml) : rawHtml;

    return html;
  } catch (e) {
    return content
      .replace(/&/g, '&amp;')
      .replace(/<(?!think|\/think)/g, '&lt;')
      .replace(/(?<!think)>/g, '&gt;')
      .replace(/\\n/g, '<br>');
  }
}

/**
 * Escape HTML for safe display
 */
function escapeHTML(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
