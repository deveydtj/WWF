"""Check funding display and payment-link safety without a payment service."""
import subprocess


def test_donation_configuration():
    subprocess.run(['node', '--input-type=module', '-e', """
import assert from 'node:assert/strict';
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', hidden: false, dataset: {}, attributes: {},
    style: { setProperty(key, value) { this[key] = value; } },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; if (key === 'href') delete this.href; },
  });
  return elements.get(id);
}
global.document = { addEventListener() {}, getElementById: element };
const { updateDonationSection } = await import('./frontend/landing.js');
updateDonationSection();
assert.equal(element('donationPercent').textContent, '—');
assert.equal(element('donationRaised').textContent, '—');
assert.equal(element('donationLink').hidden, true);
assert.equal(element('donationPending').hidden, false);
assert.equal(element('donationProgress').attributes['aria-valuenow'], undefined);

updateDonationSection({ url: 'https://example.com/donate', goal: 100, raised: 65 });
assert.equal(element('donationPercent').textContent, '65%');
assert.equal(element('donationRaised').textContent, '$65.00');
assert.equal(element('donationGoal').textContent, '$100.00');
assert.equal(element('donationSection').style['--donation-progress'], 65);
assert.equal(element('donationProgress').attributes['aria-valuenow'], '65');
assert.equal(element('donationLink').href, 'https://example.com/donate');
assert.equal(element('donationLink').hidden, false);
assert.equal(element('donationPending').hidden, true);

updateDonationSection({ goal: 100, raised: 150 });
assert.equal(element('donationPercent').textContent, '100%');
assert.equal(element('donationRaised').textContent, '$150.00');
assert.equal(element('donationProgressLabel').textContent, 'Goal reached. Thank you!');
assert.equal(element('donationLink').href, undefined);
updateDonationSection({ goal: 100, raised: 0 });
assert.equal(element('donationPercent').textContent, '0%');
assert.equal(element('donationSection').dataset.funded, 'false');

for (const totals of [{ goal: 0, raised: 1 }, { goal: 100, raised: -1 },
                      { goal: Infinity, raised: 10 }, { goal: 100, raised: null }]) {
  updateDonationSection(totals);
  assert.equal(element('donationPercent').textContent, '—');
  assert.equal(element('donationProgress').attributes['aria-valuenow'], undefined);
}
for (const url of ['javascript:alert(1)', 'http://example.com', 'bad link',
                   'https://user:password@example.com', null]) {
  updateDonationSection({ url, goal: 100, raised: 65 });
  assert.equal(element('donationLink').hidden, true);
  assert.equal(element('donationLink').href, undefined);
}
"""], check=True, capture_output=True, text=True)


def test_live_donation_total_grows_and_celebrates():
    subprocess.run(['node', '--input-type=module', '-e', """
import assert from 'node:assert/strict';
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    textContent: '', hidden: false, dataset: {}, attributes: {}, offsetWidth: 0,
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); } },
    style: { setProperty(key, value) { this[key] = value; } },
    setAttribute(key, value) { this.attributes[key] = value; },
    removeAttribute(key) { delete this.attributes[key]; if (key === 'href') delete this.href; },
  });
  return elements.get(id);
}
global.document = { addEventListener() {}, getElementById: element, hidden: false };
global.window = { matchMedia: () => ({ matches: true }) };   // reduced motion: no rAF needed
global.setTimeout = () => 0;
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem(k, v) { store[k] = v; } };
const month = new Date().toISOString().slice(0, 7);
let served = { month, raised: 4, goal: 10, url: 'https://buy.stripe.com/test' };
global.fetch = async () => ({ ok: true, json: async () => served });

const landing = await import('./frontend/landing.js');
landing.finishDonationIntro();

// Totals from an earlier month count as $0 this month.
assert.equal(landing.parseDonationTotals({ month: '1999-01', raised: 50, goal: 10 }).raised, 0);
assert.equal(landing.parseDonationTotals({ month, raised: 'x', goal: 10 }), null);
assert.equal(landing.parseDonationTotals(null), null);

await landing.loadDonationTotals();
assert.equal(element('donationPercent').textContent, '40%');
assert.equal(element('donationRaised').textContent, '$4.00');
assert.equal(element('donationGoal').textContent, '$10.00');
assert.equal(element('donationLink').href, 'https://buy.stripe.com/test');
assert.equal(JSON.parse(store['wordsquad.donationSeen']).raised, 4);
assert.equal(element('donationSection').classList.set.has('donation-celebrate'), false);

served = { ...served, raised: 9 };
await landing.loadDonationTotals();
assert.equal(element('donationPercent').textContent, '90%');
assert.equal(element('donationProgressLabel').textContent, '+$5.00 · Thank you!');
assert.equal(JSON.parse(store['wordsquad.donationSeen']).raised, 9);

// A failed fetch leaves the card alone.
global.fetch = async () => { throw new Error('offline'); };
assert.equal(await landing.loadDonationTotals(), null);
assert.equal(element('donationPercent').textContent, '90%');
"""], check=True, capture_output=True, text=True)
