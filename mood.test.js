'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getMood } = require('../lib/mood');

test('mood priority: scorching heat wins first', () => {
  assert.equal(getMood(39, 90, 35).name, 'Scorching');
});

test('mood priority: freezing wins before wind', () => {
  assert.equal(getMood(5, 50, 40).name, 'Freezing');
});

test('muggy wins before wind when humid heat overlaps', () => {
  assert.equal(getMood(29, 85, 35).name, 'Muggy');
});

test('high wind is Windy when no higher-priority condition matches', () => {
  assert.equal(getMood(22, 50, 30).name, 'Windy');
});

test('pleasant requires the tighter comfort band', () => {
  assert.equal(getMood(24, 55, 12).name, 'Pleasant');
});

test('comfortable catches the broader comfort band', () => {
  assert.equal(getMood(18, 70, 24).name, 'Comfortable');
});

test('unmatched conditions and invalid inputs return Mixed', () => {
  assert.equal(getMood(34, 45, 12).name, 'Mixed');
  assert.equal(getMood('not a number', 45, 12).name, 'Mixed');
});
