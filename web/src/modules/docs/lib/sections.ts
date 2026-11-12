/**
 * The Docs page's sections, in the brief's order (prompts/11-docs.md). Each
 * id is the section's anchor, so a link such as /docs#fees can be shared,
 * and each is an entry in the table of contents.
 */
export const DOC_SECTIONS = ["about", "launching", "curve", "fees", "locks", "crew", "tax", "score", "safety", "faq"] as const;

export type DocSection = (typeof DOC_SECTIONS)[number];

/** The id of a section's heading, which names the section's region. */
export const titleId = (section: DocSection) => `${section}-title`;
