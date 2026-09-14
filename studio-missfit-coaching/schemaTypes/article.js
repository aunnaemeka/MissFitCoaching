import { defineField, defineType } from 'sanity';

/**
 * Article — powers the Insights page.
 *
 * Posts arrive two ways:
 *   - imported from Substack via scripts/import-substack.mjs, landing as
 *     drafts for review (source: 'substack')
 *   - written directly here (source: 'original')
 *
 * Categories are the five from MM-22. The pre-rebrand taxonomy (Executive
 * Coaching / Career Coaching / Job Search Coaching / Guides / Workbook /
 * Templates) is gone, so the eight legacy articles created in May 2025 will
 * show an invalid category until someone remaps or retires them.
 */
export const articleType = defineType({
    name: 'article',
    title: 'Article',
    type: 'document',
    groups: [
        { name: 'content', title: 'Content', default: true },
        { name: 'seo', title: 'SEO' },
        { name: 'source', title: 'Source' },
    ],
    fields: [
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            group: 'content',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            group: 'content',
            options: { source: 'title', maxLength: 96 },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'category',
            title: 'Category',
            type: 'string',
            group: 'content',
            description: 'Imported posts arrive with this blank. Set it before publishing.',
            options: {
                list: [
                    { title: 'Diagnosing the Search', value: 'Diagnosing the Search' },
                    { title: 'Building the Strategy', value: 'Building the Strategy' },
                    { title: 'Market-Ready', value: 'Market-Ready' },
                    { title: 'Go-to-Market', value: 'Go-to-Market' },
                    { title: 'Landing and Onboarding', value: 'Landing and Onboarding' },
                ],
            },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'excerpt',
            title: 'Excerpt',
            type: 'text',
            rows: 3,
            group: 'content',
            description: 'Shown on the Insights index. Auto-filled on import; edit freely.',
        }),
        defineField({
            name: 'content',
            title: 'Content',
            type: 'array',
            group: 'content',
            of: [{ type: 'block' }, { type: 'image', options: { hotspot: true } }],
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'mainImage',
            title: 'Main Image',
            type: 'image',
            group: 'content',
            options: { hotspot: true },
            // optional: Substack imports arrive without one, and the index
            // falls back to a branded placeholder rather than blocking publish
        }),
        defineField({
            name: 'readingTime',
            title: 'Reading Time (minutes)',
            type: 'number',
            group: 'content',
            description: 'Estimated on import from word count.',
            validation: (rule) => rule.min(1),
        }),
        defineField({
            name: 'publishedAt',
            title: 'Published At',
            type: 'datetime',
            group: 'content',
            initialValue: () => new Date().toISOString(),
            validation: (rule) => rule.required(),
        }),

        // ---- SEO -----------------------------------------------------------
        defineField({
            name: 'seoTitle',
            title: 'SEO Title',
            type: 'string',
            group: 'seo',
            description:
                'Overrides the page title in search results. Leave blank to use Title.',
            validation: (rule) => rule.max(60).warning('Over 60 characters usually gets truncated.'),
        }),
        defineField({
            name: 'seoDescription',
            title: 'SEO Description',
            type: 'text',
            rows: 2,
            group: 'seo',
            description:
                'Affects click-through, not ranking, and Google often rewrites it. ' +
                'Leave blank to use the excerpt.',
            validation: (rule) => rule.max(160).warning('Over 160 characters usually gets truncated.'),
        }),

        // ---- Source --------------------------------------------------------
        defineField({
            name: 'source',
            title: 'Source',
            type: 'string',
            group: 'source',
            initialValue: 'original',
            options: {
                list: [
                    { title: 'Written here', value: 'original' },
                    { title: 'Imported from Substack', value: 'substack' },
                ],
                layout: 'radio',
            },
        }),
        defineField({
            name: 'substackUrl',
            title: 'Substack URL',
            type: 'url',
            group: 'source',
            description:
                'The original post. Substack self-canonicalises, so the copy here will ' +
                'not outrank it — this link keeps the relationship explicit.',
            hidden: ({ document }) => document?.source !== 'substack',
        }),
        defineField({
            name: 'importedAt',
            title: 'Imported At',
            type: 'datetime',
            group: 'source',
            readOnly: true,
            hidden: ({ document }) => document?.source !== 'substack',
        }),
    ],
    preview: {
        select: { title: 'title', subtitle: 'category', media: 'mainImage' },
    },
});
