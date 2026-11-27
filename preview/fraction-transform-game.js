import { GAME, createDeck } from './fraction-transform-model.js?v=417321ae8777';
import { startFractionGame } from './fraction-round.js?v=417321ae8777';

startFractionGame(GAME, createDeck, { celebrate: true });
