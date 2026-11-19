/**
 * Annapurna Assist's limits, in one place: the chat shows them (lib only, no server code, so the browser
 * can import it) and the API route enforces them (app/api/assistant/route.ts).
 */

/** Longest question, in characters. Long pastes use up tokens and are a common way to sneak in tricks. */
export const MAX_LENGTH = 1000;

/** Questions one admin can ask per day (India time, starts again at midnight). Keeps one admin from using up the free tier. */
export const DAILY_LIMIT = 50;
