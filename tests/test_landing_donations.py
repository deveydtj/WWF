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
