import type { Root, Element } from 'hast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

/**
 * Strips `@font-face` rules from <style> elements inside mermaid-rendered SVGs.
 * The font-face is needed at build time so Playwright measures text with the
 * correct font, but the page itself already loads the font globally — so leaving
 * the @font-face baked into every SVG just bloats the HTML by ~54KB per diagram.
 */
const plugin: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'svg') return
    if (typeof node.properties?.id !== 'string' || !node.properties.id.startsWith('mermaid-')) return
    visit(node, 'element', (child: Element) => {
      if (child.tagName !== 'style') return
      for (const text of child.children) {
        if (text.type === 'text') {
          text.value = text.value.replace(/@font-face\s*\{[^}]*\}/g, '')
        }
      }
    })
  })
}

export default plugin
