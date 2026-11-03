import { floor1 } from './floor1';
import { floor2 } from './floor2';
import { floor3 } from './floor3';
import { floor4 } from './floor4';
import { floor5 } from './floor5';
import { garage } from './garage';
import type { LevelDef } from './types';

export const LEVELS: LevelDef[] = [floor5, floor4, floor3, floor2, floor1, garage];
