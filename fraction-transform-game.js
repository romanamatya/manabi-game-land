import { GAME, createDeck } from './fraction-transform-model.js?v=fraction-single-digit-v1';
import { startFractionGame } from './fraction-round.js?v=fraction-transform-access-v2';

startFractionGame(GAME, createDeck, { celebrate: true });
