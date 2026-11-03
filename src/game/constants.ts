export const VIEW_W = 1280;
export const VIEW_H = 720;

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** 10 seconds of recorded history. */
export const HISTORY_TICKS = 600;
export const MAX_ECHOES = 3;
/** a rewind shorter than this does not leave an echo behind */
export const MIN_ECHO_TICKS = 40;

// Player body (collision box, feet-anchored)
export const PW = 22;
export const PH = 54;

// Movement tuning — hand-tuned for a responsive, slightly weighty feel
export const RUN_SPEED = 300;
export const SNEAK_SPEED = 105;
export const GROUND_ACCEL = 2800;
export const TURN_ACCEL = 4600;
export const GROUND_DECEL = 3600;
export const AIR_ACCEL = 2000;
export const AIR_DECEL = 900;
export const GRAVITY = 2300;
export const JUMP_V = 800;
export const MAX_FALL = 1150;
export const FALL_MULT = 1.22;
export const JUMP_CUT_MULT = 2.9;
export const APEX_BAND = 140;
export const APEX_MULT = 0.62;
export const COYOTE_TICKS = 7;
export const BUFFER_TICKS = 8;
export const CORNER_FORGIVE = 7;
export const DROP_TICKS = 14;

// Rewind / foresight
export const REWIND_COOLDOWN_TICKS = 40;
export const FORESIGHT_MAX = 1;
export const FORESIGHT_DRAIN = 0.22; // per second of real time
export const FORESIGHT_REGEN = 0.12;
export const FORESIGHT_MIN_START = 0.12;
export const FORESIGHT_TIMESCALE = 0.55;
export const PREDICT_STRIDE = 3; // ticks between stored prediction frames
