import { ensureAgeEligibility } from './ageEligibility.js';

// Accept only local game routes; query parameters cannot create an open redirect.
const next = new URLSearchParams(window.location.search).get('next') || '/';
const destination = /^(\/|\/game|\/lobby\/[A-Za-z0-9]{6})$/.test(next) ? next : '/';
ensureAgeEligibility().then(eligible => {
  if (eligible) window.location.replace(destination);
});
