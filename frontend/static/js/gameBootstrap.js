import { ensureAgeEligibility } from './ageEligibility.js';
import { preparePrivateRoom, installRoomControls } from './privateRoom.js';

ensureAgeEligibility().then(async eligible => {
  if (eligible && await preparePrivateRoom()) {
    await import('./main.js');
    installRoomControls();
  } else if (!eligible) window.top.location.href = '/';
});
