import { GAME, createDeck } from './fraction-transform-model.js';
import { startFractionGame } from './fraction-round.js?v=fraction-transform-access-v2';

startFractionGame(GAME, createDeck, { celebrate: true });
