import type { Root } from 'mdast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Replaces ```mermaid fenced code blocks with a non-`code` mdast node so
 * astro-expressive-code (which only walks `code` nodes) ignores them.
 * Serializes to <pre class="mermaid">{source}</pre>, which the client-side
 * mermaid loader picks up via mermaid.run().
 */
const plugin: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'code', (node, index, parent) => {
    if (!parent || index == null || node.lang !== 'mermaid') return
    parent.children[index] = {
      type: 'mermaidBlock',
      data: {
        hName: 'pre',
        hProperties: { className: ['mermaid'] },
        hChildren: [{ type: 'text', value: node.value }],
      },
    } as never
  })
}

export default plugin
