import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Replaces ```mermaid fenced code blocks with a non-`code` mdast node so
 * astro-expressive-code (which only walks `code` nodes) ignores them.
 * The node still serializes to <pre><code class="language-mermaid">…</code></pre>
 * via data.hName / data.hChildren, so rehype-mermaid can pick it up later.
 */
const plugin: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'code', (node, index, parent) => {
    if (!parent || index == null || node.lang !== 'mermaid') return
    parent.children[index] = {
      type: 'mermaidBlock',
      data: {
        hName: 'pre',
        hChildren: [
          {
            type: 'element',
            tagName: 'code',
            properties: { className: ['language-mermaid'] },
            children: [{ type: 'text', value: node.value }],
          },
        ],
      },
    } as never
  })
}

export default plugin
