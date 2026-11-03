// Slot indices for the world state vector. The whole simulation state is one Float64Array,
// so snapshotting for rewind is a single typed-array copy and is bit-exact.

export const S_TICK = 0;

// Player block
export const P_X = 1; // centre x
export const P_Y = 2; // feet y
export const P_VX = 3;
export const P_VY = 4;
export const P_FACE = 5;
export const P_GROUND = 6;
export const P_COYOTE = 7;
export const P_BUF = 8;
export const P_LAND = 9; // landing animation timer (ticks)
export const P_LANDV = 10; // landing impact velocity
export const P_INTER = 11; // interaction animation timer
export const P_DEAD = 12;
export const P_DROP = 13;
export const P_STEP = 14; // footstep distance accumulator
export const P_WAKE = 15; // waking-up animation timer
export const P_SNEAK = 16;
export const P_SURF = 17;
export const P_NOISE = 18;
export const P_SKID = 19;
export const P_AIR = 20;
export const P_JUMPT = 21; // ticks since jump (for anim)
export const P_BLOCK_END = 32;

export const FLAG_GROUND = 1;
export const FLAG_INTER = 2;
export const FLAG_SNEAK = 4;
export const FLAG_SKID = 8;
export const FLAG_WAKE = 16;
