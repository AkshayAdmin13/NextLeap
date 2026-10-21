'use strict';

/**
 * Deterministic weather mood engine.
 * Priority is intentional: extreme heat/cold > humid heat > high wind > comfort bands > mixed.
 * Keep this function pure so the exact rules can be tested without a browser or API.
 */
function getMood(tempC, humidity, windKph) {
  const temp = Number(tempC);
  const humid = Number(humidity);
  const wind = Number(windKph);

  if (![temp, humid, wind].every(Number.isFinite)) {
    return { name: 'Mixed', key: 'mixed', icon: '◌', explanation: 'A mix of conditions. Check the details before heading out.' };
  }
  if (temp >= 38) {
    return { name: 'Scorching', key: 'scorching', icon: '☀', explanation: 'Intense heat is in charge. Seek shade, hydrate, and keep outdoor plans light.' };
  }
  if (temp <= 5) {
    return { name: 'Freezing', key: 'freezing', icon: '❄', explanation: 'Cold conditions call for an extra layer and a little more time to warm up.' };
  }
  if (humid >= 80 && temp >= 28) {
    return { name: 'Muggy', key: 'muggy', icon: '〰', explanation: 'Warm, moisture-heavy air can feel sticky. Water and breathable layers help.' };
  }
  if (wind >= 30) {
    return { name: 'Windy', key: 'windy', icon: '↝', explanation: 'Breezy conditions may affect umbrellas, cycling, and exposed outdoor plans.' };
  }
  if (temp >= 20 && temp <= 30 && humid <= 60 && wind <= 20) {
    return { name: 'Pleasant', key: 'pleasant', icon: '✳', explanation: 'A balanced mix of warmth, humidity, and breeze makes this a good time to be out.' };
  }
  if (temp >= 15 && temp <= 30 && humid <= 75 && wind <= 30) {
    return { name: 'Comfortable', key: 'comfortable', icon: '◒', explanation: 'Mostly manageable conditions with no major weather extreme standing out.' };
  }
  return { name: 'Mixed', key: 'mixed', icon: '◌', explanation: 'Conditions sit outside the main comfort ranges. Use the live metrics to plan your day.' };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { getMood };
if (typeof window !== 'undefined') window.AtmosMood = { getMood };
