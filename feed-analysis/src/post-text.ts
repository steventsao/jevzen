const blocks = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE']);

// innerText changes when our photo overlay hides the original. Read the DOM
// consistently in both states, retaining line breaks and emoji image labels.
function read(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
  if (!(node instanceof Element)) return '';
  if (['SCRIPT', 'STYLE', 'TEMPLATE'].includes(node.tagName)) return '';
  if (node.tagName === 'BR') return '\n';
  if (node.tagName === 'IMG') return node.getAttribute('alt') || '';
  const text = Array.from(node.childNodes, read).join('');
  return blocks.has(node.tagName) ? `\n${text}\n` : text;
}

export function textOf(article: HTMLElement): string {
  return Array.from(article.querySelectorAll('[data-testid="tweetText"]'), element =>
    read(element).replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim(),
  ).join('\n\nQuoted post:\n').trim();
}
