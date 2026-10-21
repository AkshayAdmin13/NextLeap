'use strict';

(() => {
  const CITIES = ['New Delhi', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Patna', 'Jaipur', 'London'];
  const $ = (id) => document.getElementById(id);
  const ui = {
    form: $('search-form'), input: $('city-input'), searchButton: document.querySelector('.search-button'), chips: $('city-chips'),
    status: $('status-region'), statusIcon: $('status-icon'), statusTitle: $('status-title'), statusMessage: $('status-message'), retry: $('retry-button'),
    weather: $('weather-section'), empty: $('empty-state'), hero: $('weather-hero'), moodCard: $('mood-card'),
    name: $('location-name'), region: $('location-region'), countryShort: $('location-country-short'), localDate: $('weather-local-date'), localTime: $('local-time'),
    temp: $('temperature-value'), condition: $('condition-text'), icon: $('condition-icon'), feels: $('feels-like-value'),
    metricFeels: $('metric-feels'), humidity: $('metric-humidity'), humidityTrack: $('humidity-track'), wind: $('metric-wind'), uv: $('metric-uv'), uvNote: $('uv-note'), cloud: $('metric-cloud'), winddir: $('metric-winddir'), gust: $('gust-note'),
    mood: $('mood-name'), moodGlyph: $('mood-glyph'), moodExplanation: $('mood-explanation'), updated: $('updated-label'),
    tabRaw: $('tab-raw'), tabFormatted: $('tab-formatted'), panel: $('json-panel'), output: $('json-code'), lineNumbers: $('line-numbers'), copy: $('copy-json'), bytes: $('response-byte-count'), state: $('inspector-state'), fileLabel: $('response-file-label'), toast: $('toast')
  };

  let latestRaw = '';
  let latestObject = null;
  let selectedTab = 'raw';
  let latestCity = '';
  let requestSequence = 0;
  let activeController = null;
  let toastTimer = null;

  function getMood(temp, humidity, wind) {
    if (window.AtmosMood && typeof window.AtmosMood.getMood === 'function') return window.AtmosMood.getMood(temp, humidity, wind);
    return { name: 'Mixed', key: 'mixed', icon: '◌', explanation: 'Conditions sit outside the main comfort ranges. Check the live metrics to plan your day.' };
  }

  function renderChips() {
    ui.chips.replaceChildren();
    CITIES.forEach((city) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'city-chip'; button.textContent = city;
      button.dataset.city = city; button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => searchCity(city));
      ui.chips.append(button);
    });
  }

  function setActiveChip(city) {
    const normalized = String(city || '').trim().toLocaleLowerCase();
    ui.chips.querySelectorAll('.city-chip').forEach((chip) => {
      const active = chip.dataset.city.toLocaleLowerCase() === normalized;
      chip.classList.toggle('active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
  }

  function setLoading(isLoading) {
    ui.searchButton.disabled = isLoading;
    ui.input.disabled = isLoading;
    ui.searchButton.querySelector('span:first-child').textContent = isLoading ? 'Loading…' : 'Search';
    ui.chips.querySelectorAll('button').forEach((chip) => { chip.disabled = isLoading; });
    if (isLoading) {
      ui.status.hidden = false; ui.statusIcon.textContent = '…'; ui.statusTitle.textContent = 'Reading the atmosphere';
      ui.statusMessage.textContent = `Fetching current conditions for ${latestCity}.`;
      ui.retry.hidden = true; ui.weather.hidden = true; ui.empty.hidden = true;
    }
  }

  function showStatus(title, message, retryable = false, isError = true) {
    ui.status.hidden = false; ui.statusIcon.textContent = isError ? '!' : 'i';
    ui.statusTitle.textContent = title; ui.statusMessage.textContent = message; ui.retry.hidden = !retryable;
  }

  function hideStatus() { ui.status.hidden = true; }

  function errorMessage(status, data, rawText) {
    const apiError = data && data.error;
    const code = Number(apiError && apiError.code);
    const message = apiError && typeof apiError.message === 'string' ? apiError.message : '';
    if (code === 1006) return ['City not found', 'We couldn’t find that place. Check the spelling or try a nearby city.'];
    if (code === 2006 || code === 1002) return ['Weather service needs attention', 'The server-side WeatherAPI credential is missing or invalid. Check deployment settings.'];
    if (code === 2007 || status === 429) return ['Request limit reached', 'The weather service is rate-limiting requests. Please pause briefly and retry.'];
    if (status === 400 && code === 1005) return ['Search couldn’t be understood', 'Try a city name such as Mumbai, London, or New York.'];
    if (status === 504) return ['Weather service timed out', 'The request took too long. Check your connection and try again.'];
    if (status === 502 || status >= 500) return ['Weather service unavailable', 'The weather service could not respond right now. Try again in a moment.'];
    if (message && message.length < 220) return ['Couldn’t fetch weather', message];
    if (!rawText) return ['Couldn’t fetch weather', 'No response body was returned. Please retry.'];
    return ['Unexpected response', 'The service returned a response we could not interpret. Please try again.'];
  }

  function formatLocalTime(localtime) {
    if (!localtime || typeof localtime !== 'string') return { date: 'LOCAL DATE UNAVAILABLE', time: 'Local time unavailable' };
    const parts = localtime.split(' ');
    const d = parts[0] || '';
    const t = parts[1] || '';
    const dateParts = d.split('-');
    const niceDate = dateParts.length === 3 ? `${dateParts[2]} ${new Date(`${d}T12:00:00`).toLocaleDateString('en', { month: 'short' })} ${dateParts[0]}` : d;
    return { date: niceDate.toUpperCase(), time: `${t || '—'} LOCAL TIME` };
  }

  function uvDescription(value) {
    if (value < 3) return 'Low · minimal protection';
    if (value < 6) return 'Moderate · some protection';
    if (value < 8) return 'High · protect your skin';
    if (value < 11) return 'Very high · extra protection';
    return 'Extreme · avoid peak sun';
  }

  function applyMood(mood) {
    ui.hero.className = `weather-hero mood-${mood.key}`;
    ui.moodCard.className = `mood-card mood-${mood.key}`;
    ui.mood.textContent = mood.name; ui.moodGlyph.textContent = mood.icon; ui.moodExplanation.textContent = mood.explanation;
    const level = ({ scorching: 12, freezing: 2, muggy: 9, windy: 8, pleasant: 4, comfortable: 6, mixed: 5 })[mood.key] || 5;
    ui.moodCard.querySelectorAll('.mood-meter span').forEach((bar, index) => {
      bar.style.background = index < level ? moodColor(mood.key) : '#303135';
      bar.style.opacity = index < level ? String(.5 + (index / Math.max(level, 1)) * .5) : '1';
    });
  }

  function moodColor(key) {
    return ({ scorching: '#ffab6c', freezing: '#7eb9ff', muggy: '#ffa3ba', windy: '#8cbcff', pleasant: '#d6ff83', comfortable: '#b6d887', mixed: '#92958a' })[key] || '#d6ff83';
  }

  function renderWeather(data) {
    const loc = data && data.location;
    const current = data && data.current;
    if (!loc || !current || typeof loc.name !== 'string' || typeof current.temp_c !== 'number' || !current.condition) {
      throw new Error('The response did not contain the expected current-weather fields.');
    }
    latestObject = data;
    ui.name.textContent = loc.name;
    const subline = [loc.region, loc.country].filter(Boolean).join(', ');
    ui.region.textContent = subline || 'Location details unavailable';
    ui.countryShort.textContent = loc.country ? loc.country.toLocaleUpperCase() : 'LIVE';
    const time = formatLocalTime(loc.localtime);
    ui.localDate.textContent = time.date; ui.localTime.textContent = time.time;
    ui.temp.textContent = Number(current.temp_c).toFixed(1).replace(/\.0$/, '');
    ui.condition.textContent = current.condition.text || 'Condition unavailable';
    ui.icon.src = current.condition.icon ? (current.condition.icon.startsWith('//') ? `https:${current.condition.icon}` : current.condition.icon) : '';
    ui.icon.alt = current.condition.text ? `${current.condition.text} icon` : 'Weather condition icon';
    ui.feels.textContent = `${Number(current.feelslike_c).toFixed(1).replace(/\.0$/, '')}°C`;
    ui.metricFeels.textContent = Number(current.feelslike_c).toFixed(1).replace(/\.0$/, '');
    ui.humidity.textContent = Number(current.humidity);
    ui.humidityTrack.style.width = `${Math.max(0, Math.min(100, Number(current.humidity) || 0))}%`;
    ui.wind.textContent = Number(current.wind_kph).toFixed(1).replace(/\.0$/, '');
    ui.uv.textContent = current.uv == null ? '—' : Number(current.uv).toFixed(1).replace(/\.0$/, '');
    ui.uvNote.textContent = current.uv == null ? 'Not supplied by API' : uvDescription(Number(current.uv));
    ui.cloud.textContent = current.cloud == null ? '—' : Number(current.cloud);
    ui.winddir.textContent = current.wind_dir || '—';
    ui.gust.textContent = current.gust_kph == null ? 'Gust not supplied' : `Gust ${Number(current.gust_kph).toFixed(1).replace(/\.0$/, '')} km/h`;
    applyMood(getMood(current.temp_c, current.humidity, current.wind_kph));
    ui.weather.hidden = false; ui.empty.hidden = true; hideStatus();
    ui.updated.textContent = `UPDATED ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    setActiveChip(loc.name);
  }

  function syntaxHighlight(json) {
    const tokenPattern = /"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b|[{}\[\],:]/g;
    const escapeHtml = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let result = '';
    let lastIndex = 0;
    for (const match of String(json).matchAll(tokenPattern)) {
      result += escapeHtml(String(json).slice(lastIndex, match.index));
      const token = match[0];
      let className = 'json-punctuation';
      if (token.startsWith('"')) className = /"\s*:$/.test(token) ? 'json-key' : 'json-string';
      else if (token === 'true' || token === 'false') className = 'json-boolean';
      else if (token === 'null') className = 'json-null';
      else if (/^-?\d/.test(token)) className = 'json-number';
      if (className === 'json-key') {
        const keyParts = token.match(/^("(?:\\.|[^"\\])*")(\s*:)$/);
        if (keyParts) result += `<span class="json-key">${escapeHtml(keyParts[1])}</span><span class="json-punctuation">${escapeHtml(keyParts[2])}</span>`;
        else result += escapeHtml(token);
      } else {
        result += `<span class="${className}">${escapeHtml(token)}</span>`;
      }
      lastIndex = match.index + token.length;
    }
    result += escapeHtml(String(json).slice(lastIndex));
    return result;
  }

  function currentDisplayedText() {
    if (selectedTab === 'formatted' && latestObject !== null) return JSON.stringify(latestObject, null, 2);
    return latestRaw;
  }

  function renderJson() {
    const displayText = currentDisplayedText();
    if (selectedTab === 'formatted' && latestObject !== null) ui.output.innerHTML = syntaxHighlight(displayText);
    else ui.output.textContent = displayText || 'No response body received.';
    const lines = Math.max(1, (displayText || '').split('\n').length);
    ui.lineNumbers.textContent = Array.from({ length: lines }, (_, i) => String(i + 1)).join('\n');
    ui.bytes.textContent = latestRaw ? `${new TextEncoder().encode(latestRaw).length.toLocaleString()} BYTES` : 'AWAITING RESPONSE';
    ui.copy.disabled = !latestRaw;
    ui.panel.setAttribute('aria-labelledby', selectedTab === 'raw' ? 'tab-raw' : 'tab-formatted');
    ui.tabRaw.classList.toggle('active', selectedTab === 'raw'); ui.tabRaw.setAttribute('aria-selected', String(selectedTab === 'raw'));
    ui.tabFormatted.classList.toggle('active', selectedTab === 'formatted'); ui.tabFormatted.setAttribute('aria-selected', String(selectedTab === 'formatted'));
    ui.fileLabel.innerHTML = '<span class="file-dot"></span> response.json';
    ui.state.textContent = latestRaw ? (latestObject === null ? 'RESPONSE RECEIVED · NON-JSON BODY' : 'LATEST RESPONSE LOADED') : 'NO RESPONSE YET';
    ui.copy.querySelector('span').textContent = 'Copy JSON';
  }

  function parseResponse(raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  async function searchCity(city) {
    const requestedCity = String(city || '').trim();
    if (!requestedCity || requestedCity.length > 80) {
      if (activeController) activeController.abort();
      activeController = null;
      requestSequence += 1;
      setLoading(false);
      if (!requestedCity) {
        showStatus('Add a city to begin', 'Enter a city name, then press Enter or select Search.', false, false);
        ui.input.focus(); return;
      }
      showStatus('City name is too long', 'Please keep city names to 80 characters or fewer.');
      return;
    }
    if (activeController) activeController.abort();
    activeController = new AbortController();
    const controller = activeController;
    const seq = ++requestSequence;
    latestCity = requestedCity;
    setActiveChip(requestedCity);
    ui.input.value = requestedCity;
    setLoading(true); setLoadingStateInspector();
    try {
      const response = await fetch(`/api/weather?city=${encodeURIComponent(requestedCity)}`, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      const raw = await response.text();
      if (seq !== requestSequence) return;
      latestRaw = raw;
      latestObject = parseResponse(raw);
      renderJson();
      if (!response.ok) {
        const [title, message] = errorMessage(response.status, latestObject, raw);
        ui.weather.hidden = true; ui.empty.hidden = true;
        showStatus(title, message, true); return;
      }
      if (!latestObject) {
        ui.weather.hidden = true; ui.empty.hidden = true;
        showStatus('Unexpected response', 'The weather service returned non-JSON content. The body is available in the inspector.', true); return;
      }
      try { renderWeather(latestObject); }
      catch (error) {
        ui.weather.hidden = true; ui.empty.hidden = true;
        showStatus('Incomplete weather data', error.message || 'The response is missing required weather fields.', true);
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      if (seq !== requestSequence) return;
      latestRaw = JSON.stringify({ error: { code: 'NETWORK_ERROR', message: 'The request failed before a response was received.' } }, null, 2);
      latestObject = parseResponse(latestRaw); renderJson();
      ui.weather.hidden = true; ui.empty.hidden = true;
      showStatus('Connection problem', 'Could not connect to the weather endpoint. Check your connection and retry.', true);
    } finally {
      if (seq === requestSequence) { setLoading(false); activeController = null; }
    }
  }

  function setLoadingStateInspector() {
    ui.state.textContent = 'REQUEST IN PROGRESS';
  }

  function showToast(message) {
    ui.toast.textContent = message; ui.toast.classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 1900);
  }

  ui.form.addEventListener('submit', (event) => { event.preventDefault(); searchCity(ui.input.value); });
  ui.retry.addEventListener('click', () => searchCity(latestCity || ui.input.value));
  ui.tabRaw.addEventListener('click', () => { selectedTab = 'raw'; renderJson(); });
  ui.tabFormatted.addEventListener('click', () => { selectedTab = 'formatted'; renderJson(); });
  ui.copy.addEventListener('click', async () => {
    const textToCopy = currentDisplayedText();
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast(selectedTab === 'raw' ? 'Raw response copied' : 'Formatted JSON copied');
    } catch {
      const area = document.createElement('textarea'); area.value = textToCopy; area.setAttribute('readonly', '');
      area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select();
      const success = document.execCommand('copy'); area.remove();
      showToast(success ? 'JSON copied' : 'Copy unavailable in this browser');
    }
  });

  renderChips();
  renderJson();
})();
