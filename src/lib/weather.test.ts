import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayChance, weatherOn } from './weather.ts';

test('the chance is the same all day', () => {
  const morning = new Date(2026, 10, 16, 7, 30);
  const night = new Date(2026, 10, 16, 23, 59);
  assert.equal(dayChance(morning), dayChance(night));
});

test('the chance is a number from 0 up to 1, and changes with the day', () => {
  const seen = new Set<number>();
  for (let day = 1; day <= 28; day++) {
    const chance = dayChance(new Date(2026, 1, day));
    assert.ok(chance >= 0 && chance < 1);
    seen.add(chance);
  }
  assert.equal(seen.size, 28);
});

test('it never rains in winter and never snows in summer', () => {
  for (let i = 0; i < 100; i++) {
    const chance = i / 100;
    assert.notEqual(weatherOn(new Date(2026, 0, 10), chance), 'rain');
    assert.notEqual(weatherOn(new Date(2026, 6, 10), chance), 'snow');
  }
});

test('most days of a year are clear, and every kind of weather turns up', () => {
  const counts = { clear: 0, rain: 0, snow: 0 };
  for (let day = 0; day < 365; day++) counts[weatherOn(new Date(2026, 0, 1 + day))]++;
  assert.ok(counts.clear > 365 / 2);
  assert.ok(counts.rain > 20);
  assert.ok(counts.snow > 20);
});

test('the shoulder months can go either way', () => {
  const november = new Date(2026, 10, 16);
  assert.equal(weatherOn(november, 0.1), 'snow');
  assert.equal(weatherOn(november, 0.3), 'rain');
  assert.equal(weatherOn(november, 0.9), 'clear');
});
