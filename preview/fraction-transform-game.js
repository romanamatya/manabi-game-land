import { GAME, createDeck } from './fraction-transform-model.js?v=3b98e712c0d7';
import { startFractionGame } from './fraction-round.js?v=3b98e712c0d7';

startFractionGame(GAME, createDeck, { celebrate: true });
