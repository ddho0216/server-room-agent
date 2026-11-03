import { SERVERS } from './servers.mjs';
import { renderRack } from './rack.mjs';

document.querySelector('#rack').innerHTML = renderRack(SERVERS);
