import { GAME, createDeck } from './fraction-transform-model.js?v=d94089bc8224';
import { startFractionGame } from './fraction-round.js?v=d94089bc8224';

startFractionGame(GAME, createDeck, { celebrate: true });
