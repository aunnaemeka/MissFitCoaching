import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';
export default defineConfig({
    name: 'default',
    title: 'MissFit Coaching',
    projectId: '6lsv3s2h',
    dataset: 'production',
    plugins: [structureTool(), visionTool()],
    schema: {
        types: schemaTypes,
    },
});
