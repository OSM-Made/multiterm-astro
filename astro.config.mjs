// @ts-check
import { readFileSync } from 'node:fs'
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import sitemap from '@astrojs/sitemap'
import mdx from '@astrojs/mdx'
import { rehypeHeadingIds } from '@astrojs/markdown-remark'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import expressiveCode from 'astro-expressive-code'
import siteConfig from './src/site.config'
import { pluginLineNumbers } from '@expressive-code/plugin-line-numbers'
import remarkDescription from './src/plugins/remark-description'/* Add description to frontmatter */
import remarkReadingTime from './src/plugins/remark-reading-time'/* Add reading time to frontmatter */
import rehypeTitleFigure from './src/plugins/rehype-title-figure'/* Wraps titles in figures */
import { remarkGithubCard } from './src/plugins/remark-github-card'
import { fromHtmlIsomorphic } from 'hast-util-from-html-isomorphic'
import rehypeExternalLinks from 'rehype-external-links'
import remarkDirective from 'remark-directive'/* Handle ::: directives as nodes */
import rehypeUnwrapImages from 'rehype-unwrap-images'
import { remarkAdmonitions } from './src/plugins/remark-admonitions'/* Add admonitions */
import remarkCharacterDialogue from './src/plugins/remark-character-dialogue'/* Custom plugin to handle character admonitions */
import remarkUnknownDirectives from './src/plugins/remark-unknown-directives'/* Custom plugin to handle unknown admonitions */
import remarkMath from 'remark-math'/* for latex math support */
import rehypeKatex from 'rehype-katex'/* again, for latex math support */
import remarkGemoji from './src/plugins/remark-gemoji'/* for shortcode emoji support */
import rehypePixelated from './src/plugins/rehype-pixelated'
import remarkMermaidPassthrough from './src/plugins/remark-mermaid-passthrough'/* Bypass expressive-code for ```mermaid blocks */
import rehypeMermaid from 'rehype-mermaid'/* Build-time mermaid → SVG */
import rehypeStripMermaidFontface from './src/plugins/rehype-strip-mermaid-fontface'/* Drop bulky @font-face from mermaid SVG <style> after build */

const jetbrainsMonoDataUri =
  'data:font/woff2;base64,' +
  readFileSync(
    './node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
  ).toString('base64')
import cloudflare from '@astrojs/cloudflare';
/* Custom plugin to handle pixelated images */

// https://astro.build/config
export default defineConfig({
  site: siteConfig.site,
  trailingSlash: siteConfig.trailingSlashes ? 'always' : 'never',
  prefetch: true,

  markdown: {
    remarkPlugins: [
      [remarkDescription, { maxChars: 200 }],
      remarkReadingTime,
      remarkDirective,
      remarkGithubCard,
      remarkAdmonitions,
      [remarkCharacterDialogue, { characters: siteConfig.characters }],
      remarkUnknownDirectives,
      remarkMath,
      remarkGemoji,
      remarkMermaidPassthrough,
    ],
    rehypePlugins: [
      [rehypeHeadingIds, { headingIdCompat: true }],
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
      rehypeTitleFigure,
      [
        rehypeExternalLinks,
        {
          rel: ['noreferrer', 'noopener'],
          target: '_blank',
        },
      ],
      rehypeUnwrapImages,
      rehypePixelated,
      rehypeKatex,
      [
        rehypeMermaid,
        {
          strategy: 'inline-svg',
          mermaidConfig: {
            theme: 'base',
            flowchart: { padding: 16, wrappingWidth: 400 },
            themeVariables: {
              fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace',
            },
            themeCSS: `
              @font-face {
                font-family: 'JetBrains Mono Variable';
                font-style: normal;
                font-weight: 100 800;
                font-display: block;
                src: url('${jetbrainsMonoDataUri}') format('woff2-variations');
              }
              .node rect, .node polygon, .node circle, .node ellipse, .node path {
                fill: color-mix(in oklab, var(--theme-foreground) 5%, transparent) !important;
                stroke: var(--theme-accent) !important;
                stroke-width: 1.5px !important;
              }
              .node .label, .nodeLabel, .nodeLabel p {
                color: var(--theme-foreground) !important;
                fill: var(--theme-foreground) !important;
              }
              /* Don't clip if display-time text is slightly wider than build-time measurement.
                 Center the inner div on the foreignObject's midpoint so any overflow spreads
                 symmetrically left/right rather than only to the right. */
              .node foreignObject {
                overflow: visible !important;
              }
              .node foreignObject > div {
                display: inline-block !important;
                position: relative !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                width: max-content !important;
                max-width: none !important;
                white-space: nowrap !important;
              }
              .nodeLabel, .nodeLabel p {
                white-space: nowrap !important;
              }
              .edgePath .path, .flowchart-link {
                stroke: color-mix(in oklab, var(--theme-foreground) 60%, transparent) !important;
                stroke-width: 1.5px !important;
              }
              .edgeLabel, .edgeLabel p, .edgeLabel rect {
                background-color: var(--theme-background) !important;
                color: var(--theme-foreground) !important;
                fill: var(--theme-background) !important;
              }
              .edgeLabel foreignObject div {
                background-color: var(--theme-background) !important;
                color: var(--theme-foreground) !important;
              }
              .arrowMarkerPath, marker path, defs path {
                fill: color-mix(in oklab, var(--theme-foreground) 60%, transparent) !important;
                stroke: color-mix(in oklab, var(--theme-foreground) 60%, transparent) !important;
              }
              .cluster rect { fill: transparent !important; stroke: var(--theme-separator) !important; }
            `,
          },
        },
      ],
      rehypeStripMermaidFontface,
    ],
  },

  image: {
    responsiveStyles: true,
  },

  vite: {
    plugins: [tailwindcss()],
    
    ssr: {
      external: [
        'path',
        'fs',
        'crypto',
        'child_process',
        '@resvg/resvg-js'
      ],
    },
  },

  integrations: [
    sitemap(),
    expressiveCode({
      themes: siteConfig.themes.include,
      useDarkModeMediaQuery: false,
      defaultProps: {
        showLineNumbers: false,
        wrap: false,
      },
      plugins: [pluginLineNumbers()],
    }), // Must come after expressive-code integration
    mdx(),
  ],

  experimental: {
    contentIntellisense: true,
  },
})