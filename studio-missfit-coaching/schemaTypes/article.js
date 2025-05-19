import { defineField, defineType } from 'sanity';
export const articleType = defineType({
    name: 'article',
    title: 'Article',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: {
                source: 'title',
                maxLength: 96,
            },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'category',
            title: 'Category',
            type: 'string',
            options: {
                list: [
                    { title: 'Executive Coaching', value: 'Executive Coaching' },
                    { title: 'Career Coaching', value: 'Career Coaching' },
                    { title: 'Job Search Coaching', value: 'Job Search Coaching' },
                    { title: 'Guides', value: 'Guides' },
                    { title: 'Workbook', value: 'Workbook' },
                    { title: 'Templates', value: 'Templates' },
                ],
            },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'content',
            title: 'Content',
            type: 'array',
            of: [
                { type: 'block' },
                { type: 'image', options: { hotspot: true } },
            ],
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'mainImage',
            title: 'Main Image',
            type: 'image',
            options: {
                hotspot: true,
            },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'readingTime',
            title: 'Reading Time (minutes)',
            type: 'number',
            validation: (rule) => rule.required().min(1),
        }),
        defineField({
            name: 'publishedAt',
            title: 'Published At',
            type: 'datetime',
            initialValue: () => new Date().toISOString(),
            validation: (rule) => rule.required(),
        }),
    ],
});
