import { GAME, createDeck } from './fraction-transform-model.js?v=b3da00b5cc27';
import { startFractionGame } from './fraction-round.js?v=b3da00b5cc27';

startFractionGame(GAME, createDeck, { celebrate: true });
