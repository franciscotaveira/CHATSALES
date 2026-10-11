import type { ReactNode } from "react";

/**
 * Safely parses WhatsApp formatted text (*bold*, _italic_, ~strike~, ```code```)
 * into native React elements WITHOUT using dangerouslySetInnerHTML.
 */

export const renderWhatsappMarkdown = (
  text?: string | null,
  options?: { singleLine?: boolean }
): ReactNode => {
  if (!text) return null;

  if (options?.singleLine) {
    const singleLineText = text.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    return parseFormattedSpan(singleLineText, "sl");
  }

  // Split lines to preserve intentional line breaks
  const lines = text.split("\n");

  return lines.map((line, lineIdx) => {
    const parsedLine = parseFormattedSpan(line, `l-${lineIdx}`);
    return (
      <span key={`line-${lineIdx}`}>
        {parsedLine}
        {lineIdx < lines.length - 1 && <br />}
      </span>
    );
  });
};

const parseFormattedSpan = (content: string, keyPrefix: string): ReactNode[] => {
  if (!content) return [];

  // Match:
  // 1. ```code``` blocks
  // 2. *bold*
  // 3. _italic_
  // 4. ~strike~
  const pattern = /(```[\s\S]*?```|\*[^\s*](?:[^*]*?[^\s*])?\*|_[^\s_](?:[^_]*?[^\s_])?_|~[^\s~](?:[^~]*?[^\s~])?~)/g;

  const parts = content.split(pattern);
  const nodes: ReactNode[] = [];

  parts.forEach((part, idx) => {
    if (!part) return;
    const key = `${keyPrefix}-${idx}`;

    if (part.startsWith("```") && part.endsWith("```") && part.length >= 6) {
      const inner = part.slice(3, -3);
      nodes.push(<code key={key}>{inner}</code>);
    } else if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      const inner = part.slice(1, -1);
      nodes.push(<strong key={key}>{inner}</strong>);
    } else if (part.startsWith("_") && part.endsWith("_") && part.length >= 2) {
      const inner = part.slice(1, -1);
      nodes.push(<em key={key}>{inner}</em>);
    } else if (part.startsWith("~") && part.endsWith("~") && part.length >= 2) {
      const inner = part.slice(1, -1);
      nodes.push(<del key={key}>{inner}</del>);
    } else {
      nodes.push(<span key={key}>{part}</span>);
    }
  });

  return nodes;
};
