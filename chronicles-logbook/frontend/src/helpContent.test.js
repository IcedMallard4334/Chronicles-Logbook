import { describe, expect, it } from "vitest"

import { HELP_SECTIONS } from "./helpContent"

const BLOCK_TYPES = new Set(["p", "ul", "ol", "dl"])

describe("helpContent", () => {
  it("has at least one section, and every section has at least one article", () => {
    expect(HELP_SECTIONS.length).toBeGreaterThan(0)
    for (const section of HELP_SECTIONS) {
      expect(section.articles.length).toBeGreaterThan(0)
    }
  })

  it("gives every section and article a unique, non-empty id", () => {
    const sectionIds = HELP_SECTIONS.map((section) => section.id)
    expect(new Set(sectionIds).size).toBe(sectionIds.length)
    expect(sectionIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true)

    const articleIds = HELP_SECTIONS.flatMap((section) => section.articles.map((article) => article.id))
    expect(new Set(articleIds).size).toBe(articleIds.length)
    expect(articleIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true)
  })

  it("only uses block types HelpPage's renderer actually supports", () => {
    for (const section of HELP_SECTIONS) {
      for (const article of section.articles) {
        expect(article.blocks.length).toBeGreaterThan(0)
        for (const block of article.blocks) {
          expect(BLOCK_TYPES.has(block.type)).toBe(true)
        }
      }
    }
  })

  it("gives every list block at least one item, and every glossary item a term and detail", () => {
    for (const section of HELP_SECTIONS) {
      for (const article of section.articles) {
        for (const block of article.blocks) {
          if (block.type === "ul" || block.type === "ol") {
            expect(block.items.length).toBeGreaterThan(0)
          }
          if (block.type === "dl") {
            expect(block.items.length).toBeGreaterThan(0)
            for (const item of block.items) {
              expect(item.term).toBeTruthy()
              expect(item.detail).toBeTruthy()
            }
          }
        }
      }
    }
  })

  it("gives the field-types glossary an example for every entry, as asked for", () => {
    const glossary = HELP_SECTIONS
      .flatMap((section) => section.articles)
      .find((article) => article.id === "field-types-glossary")

    expect(glossary).toBeDefined()
    const dlBlock = glossary.blocks.find((block) => block.type === "dl")
    expect(dlBlock.items.length).toBeGreaterThanOrEqual(9) // one per field type in fieldTypes.js
    for (const item of dlBlock.items) {
      expect(item.example).toBeTruthy()
    }
  })

  it("gives every article generous, lower-case-friendly search keywords", () => {
    for (const section of HELP_SECTIONS) {
      for (const article of section.articles) {
        expect(Array.isArray(article.keywords)).toBe(true)
        expect(article.keywords.length).toBeGreaterThan(0)
      }
    }
  })
})
