import { GAME, createDeck } from './fraction-transform-model.js?v=a6a54f792358';
import { startFractionGame } from './fraction-round.js?v=a6a54f792358';

startFractionGame(GAME, createDeck, { celebrate: true });
