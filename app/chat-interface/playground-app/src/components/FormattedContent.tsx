import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { splitThinkingContent } from '../utils/thinking';

interface FormattedContentProps {
  text: string;
  thinkingText?: string;
  showThinking?: boolean;
}

export default function FormattedContent({ text, thinkingText, showThinking = true }: FormattedContentProps) {
  const { thinking: tagThinking, answer } = splitThinkingContent(text);
  const thinking = thinkingText && thinkingText.trim().length > 0 ? thinkingText : tagThinking;

  return (
    <div>
      {thinking && showThinking && (
        <details className="mb-3 rounded-lg border border-slate-700/50 bg-slate-900/40">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-slate-300">
            Thinking
          </summary>
          <pre className="px-3 pb-3 pt-1 text-xs text-slate-400 whitespace-pre-wrap">
            {thinking}
          </pre>
        </details>
      )}

      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeKatex, { throwOnError: false }],
          [rehypeHighlight, { ignoreMissing: true }],
        ]}
        components={{
          a: ({ ...props }) => (
            <a
              {...props}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            />
          ),
          pre: ({ ...props }) => (
            <pre
              {...props}
              className="rounded-lg bg-slate-950/70 p-3 overflow-x-auto text-sm"
            />
          ),
          code: (props: any) => {
            const { inline, className, children, ...rest } = props;
            if (inline) {
              return (
                <code
                  {...rest}
                  className="px-1 py-0.5 rounded bg-slate-800/70 text-slate-200 text-[0.9em]"
                >
                  {children}
                </code>
              );
            }
            return (
              <code {...rest} className={className}>
                {children}
              </code>
            );
          },
        }}
      >
        {answer}
      </ReactMarkdown>
    </div>
  );
}
