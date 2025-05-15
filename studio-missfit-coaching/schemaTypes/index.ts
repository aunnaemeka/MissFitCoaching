import { SchemaTypeDefinition } from 'sanity';
import { articleType } from './article';
import { newsletterType } from './newsletter';

export const schemaTypes: SchemaTypeDefinition[] = [articleType, newsletterType];