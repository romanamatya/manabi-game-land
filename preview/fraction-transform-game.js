import { GAME, createDeck } from './fraction-transform-model.js?v=de280faf770e';
import { startFractionGame } from './fraction-round.js?v=de280faf770e';

startFractionGame(GAME, createDeck, { celebrate: true });
