import assert from 'node:assert/strict';
import { defaultResponses, matchResponse, validateResponse } from '../src/assistant_logic.js';
import { watchData, refreshQueue } from '../src/data_sync.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rows = defaultResponses();
assert.equal(rows.length, 21);
assert.equal(matchResponse(rows, 'كيف أسجل؟').id, 'registration');
assert.equal(matchResponse(rows, 'كم سعر الباقة الفضية؟').id, 'prices');
assert.equal(matchResponse(rows, 'السلام عليكم').id, 'hello');
assert.equal(matchResponse(rows, ''), null);
assert.ok(!rows.some(row => /تجريب/.test(row.answer)));
rows.find(row => row.id === 'hello').active = false;
assert.equal(matchResponse(rows, 'السلام عليكم').id, 'unknown');
assert.throws(() => validateResponse({ ...rows[0], answer: ' ' }));
assert.equal(validateResponse(rows[1]).id, 'plans');

let changed = 0, value = 1, onPayload, onStatus, removed = false, reads = 0;
const target = new EventTarget(), doc = new EventTarget();
doc.hidden = false;
const channel = {
  on(event, filter, callback) { assert.equal(filter.table, 'app_data_revision'); onPayload = callback; return this; },
  subscribe(callback) { onStatus = callback; return this; }
};
const store = { mode: 'cloud', sb: {
  channel() { return channel; },
  removeChannel(result) { assert.equal(result, channel); removed = true; },
  from(table) {
    assert.equal(table, 'app_data_revision');
    return { select: () => ({ eq: () => ({ single: async () => { reads++; return { data: { version: value } }; } }) }) };
  }
} };
const stop = watchData(store, () => changed++, { target, doc, pollMs: 20 });
await sleep(5);
assert.equal(changed, 0);
onPayload({ new: { version: 2 } });
onPayload({ new: { version: 2 } });
onPayload({ new: { version: 1 } });
assert.equal(changed, 1, 'repeated or stale revisions cannot refresh the view again');
value = 3;
await sleep(30);
assert.equal(changed, 2, 'polling catches a missed websocket event');
onStatus('SUBSCRIBED');
await sleep(5);
assert.equal(changed, 3, 'reconnecting refetches data');
doc.hidden = true;
const before = reads;
await sleep(25);
assert.equal(reads, before, 'hidden tabs do not poll');
doc.hidden = false;
doc.dispatchEvent(new Event('visibilitychange'));
await sleep(5);
assert.equal(changed, 4, 'resuming a hidden tab refreshes data');
target.dispatchEvent(new Event('sama-data-changed'));
assert.equal(changed, 5, 'same-tab writes refresh other views');
stop();
onPayload({ new: { version: 9 } });
target.dispatchEvent(new Event('online'));
assert.equal(changed, 5);
assert.ok(removed);

let edits = true, renders = 0, failOnce = false;
const request = refreshQueue(async () => { if (failOnce) { failOnce = false; throw Error('offline'); } renders++; }, () => edits, { delay: 2, retry: 5 });
request(); request(); request();
await sleep(12);
assert.equal(renders, 0, 'an incoming change cannot replace unsaved input');
edits = false;
await sleep(12);
assert.equal(renders, 1, 'a burst of changes is rendered once after editing ends');
failOnce = true;
request();
await sleep(18);
assert.equal(renders, 2, 'failed refreshes are retried');
request.stop();
console.log('PASS assistant matching, validation, live revisions, reconnects, fallback polling, edit protection and retries');
