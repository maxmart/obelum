import type { Case } from '../case.js';
import { basics } from './basics.js';
import { structure } from './structure.js';
import { locality } from './locality.js';
import { formats } from './formats.js';
import { multi } from './multi-source.js';
import { bigpages } from './bigpages.js';
import { fixes } from './fixes.js';
import { divergent } from './divergent.js';

export const cases: Case[] = [...basics, ...structure, ...locality, ...formats, ...multi, ...bigpages, ...fixes, ...divergent];
