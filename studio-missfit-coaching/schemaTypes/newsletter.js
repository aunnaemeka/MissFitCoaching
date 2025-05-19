import { defineField, defineType } from 'sanity';
export const newsletterType = defineType({
    name: 'newsletter',
    title: 'Newsletter',
    type: 'document',
    fields: [
        defineField({
            name: 'number',
            title: 'Newsletter Number (e.g. #101)',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'title',
            title: 'Title',
            type: 'string',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'publishedAt',
            title: 'Published Date',
            type: 'datetime',
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: { source: 'title', maxLength: 96 },
            validation: (rule) => rule.required(),
        }),
        defineField({
            name: 'content',
            title: 'Content',
            type: 'array',
            of: [{ type: 'block' }, { type: 'image', options: { hotspot: true } }],
            validation: (rule) => rule.required(),
        }),
    ],
});
