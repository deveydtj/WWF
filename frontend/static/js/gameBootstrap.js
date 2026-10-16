import { ensureAgeEligibility } from './ageEligibility.js';
import { preparePrivateRoom, installRoomControls } from './privateRoom.js';
import { startActivityPings } from './activityPing.js';

startActivityPings();

ensureAgeEligibility().then(async eligible => {
  if (eligible && await preparePrivateRoom()) {
    await import('./main.js');
    installRoomControls();
  } else if (!eligible) window.top.location.href = '/';
});
