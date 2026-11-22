import React from 'react';

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      return (
        <code
          key={key}
          className="rounded-md border border-[#D8D4CA] bg-[#F4F2EC] px-1.5 py-0.5 font-mono text-[0.86em] text-[#1C1B19]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length >= 4) {
      return (
        <strong key={key} className="font-semibold text-[#12110F]">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length >= 2) {
      return (
        <em key={key} className="italic text-[#2C2A26]">
          {token.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={key}>{token}</React.Fragment>;
  });
}

export function MarkdownLite({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <div
          key={`code-${i}`}
          className="my-3 overflow-hidden rounded-xl border border-[#D8D4CA] bg-[#F6F4EF]"
        >
          {lang && (
            <div className="border-b border-[#DFDBD1] bg-[#EFECE5] px-3.5 py-1.5 font-mono text-[11px] font-medium text-[#5E5A52]">
              {lang}
            </div>
          )}
          <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-[#1C1B19]">
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>,
      );
      continue;
    }

    // Blank lines
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const cls =
        level === 1
          ? 'mt-4 mb-2 text-lg font-semibold tracking-[-0.01em] text-[#12110F]'
          : level === 2
            ? 'mt-3.5 mb-1.5 text-base font-semibold tracking-[-0.01em] text-[#12110F]'
            : 'mt-3 mb-1 text-[15px] font-semibold text-[#1C1B19]';
      blocks.push(
        <h4 key={`h-${i}`} className={cls}>
          {renderInline(text, `h-${i}`)}
        </h4>,
      );
      i += 1;
      continue;
    }

    // Unordered lists
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${start}`} className="my-2.5 list-disc space-y-1.5 pl-5 text-[#1C1B19]">
          {items.map((item, idx) => (
            <li key={`li-${start}-${idx}`} className="leading-[1.78]">
              {renderInline(item, `ul-${start}-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered lists
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${start}`} className="my-2.5 list-decimal space-y-1.5 pl-5 text-[#1C1B19]">
          {items.map((item, idx) => (
            <li key={`oli-${start}-${idx}`} className="leading-[1.78]">
              {renderInline(item, `ol-${start}-${idx}`)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      blocks.push(<hr key={`hr-${i}`} className="my-3.5 border-[#D8D4CA]" />);
      i += 1;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    const start = i;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trimStart().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*•]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${start}`} className="my-2.5 first:mt-0 last:mb-0 leading-[1.78] text-[#1C1B19]">
        {paraLines.map((pLine, idx) => (
          <React.Fragment key={`pl-${start}-${idx}`}>
            {idx > 0 && <br />}
            {renderInline(pLine, `p-${start}-${idx}`)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div className="text-[15px]">{blocks}</div>;
}
