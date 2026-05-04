// intro and pill onboarding
function dismissIntro() {
  const intro = document.getElementById('intro');
  intro.classList.add('dismissing');
  setTimeout(() => {
    intro.style.display = 'none';
    showPill();
  }, 500);
}


function showPill() {
  const pill = document.getElementById('pill');
  pill.classList.add('visible');
}


function dismissPill() {
  const pill = document.getElementById('pill');
  pill.classList.add('dismissed');
  setTimeout(() => pill.remove(), 500);
}


// URLs for the V&A API and a variable to control how many results per page
const API_BASE = 'https://api.vam.ac.uk/v2/objects/search';
const IMAGE_BASE = 'https://framemark.vam.ac.uk/collections';
const PAGE_SIZE = 52; // chosen to fill the grid nicely without leaving gaps when filtering for images only

let activeCountry = null;
let activeLayer = null;
let currentPage = 1;

const NAME_FIXES = {
  'United Kingdom': 'England',
  'United States of America': 'United States',
  'Republic of Korea': 'Korea',
  'Dem. Rep. Korea': 'Korea',
  "People's Republic of China": 'China',
  'Iran (Islamic Republic of)': 'Iran',
  'Viet Nam': 'Vietnam',
  'Syrian Arab Republic': 'Syria',
  'Russian Federation': 'Russia',
  'Democratic Republic of the Congo': 'Congo',
  'Republic of the Congo': 'Congo',
  'Czechia': 'Czech Republic',
  'Myanmar': 'Burma',
  'Türkiye': 'Turkey',
  'Lao PDR': 'Laos',
  'eSwatini': 'Swaziland',
  'S. Sudan': 'South Sudan',
};


function normaliseName(raw) { return NAME_FIXES[raw] || raw; }


// called when a suggestion chip in the header is clicked
function openSuggestion(countryName) {
  openCountryPanel(countryName);
}


// setting up the leaflet map - center it on europe and set zoom limits so it doesn't go too far out
const map = L.map('map', {
  center: [45, 15],
  zoom: 4,
  minZoom: 4,
  maxZoom: 10,
  maxBounds: [[-85, -180], [85, 180]],
  maxBoundsViscosity: 1.0,
  worldCopyJump: false,
});

map.zoomControl.setPosition('bottomright');

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
  attribution: '© CARTO © OpenStreetMap',
  subdomains: 'abcd',
  maxZoom: 19,
  noWrap: true,
}).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd',
  maxZoom: 19,
  pane: 'overlayPane',
  noWrap: true,
}).addTo(map);


// styles for the country polygons - default (invisible), hovered and selected (navy blue)
const styleDefault = {
  fillColor: '#000000',
  fillOpacity: 0,
  color: 'rgba(0,0,0,0.15)',
  weight: 0.5, opacity: 1
};


const styleHover = {
  fillColor: '#1a5276',
  fillOpacity: 0.2,
  color: '#1a5276',
  weight: 2,
  opacity: 1
};


const styleSelected = {
  fillColor: '#1a5276',
  fillOpacity: 0.35, color: '#1a5276',
  weight: 2.5,
  opacity: 1
};


// fetch the world map geojson file from github - this gives us all the country shapes and names
const tooltip = document.getElementById('map-tooltip');
let geoLayer;

fetch('https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson')
  .then(r => r.json())
  .then(data => {
    geoLayer = L.geoJSON(data, {
      style: () => ({ ...styleDefault }),
      onEachFeature: (feature, layer) => {
        layer.on({ mouseover: onHover, mouseout: onOut, click: onClick });
      },
    }).addTo(map);
  });

document.getElementById('map').addEventListener('mousemove', e => {
  tooltip.style.left = (e.clientX + 14) + 'px';
  tooltip.style.top = (e.clientY - 28) + 'px';
});


function getName(feature) {
  return normaliseName(feature.properties.ADMIN || feature.properties.name || 'Unknown');
}


// caches artefact counts so we only hit the api once per country
const countryCountCache = {};


// fetches the artefact count for a country and updates the tooltip if still showing that country
function fetchCountryCount(countryName, targetEl) {
  // if we already have it cached, just render it
  if (countryCountCache[countryName] !== undefined) {
    renderCount(targetEl, countryCountCache[countryName], countryName);
    return;
  }

  const url = `${API_BASE}?q_place_name=${encodeURIComponent(countryName)}&page_size=1`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      const count = data.info.record_count;
      countryCountCache[countryName] = count;
      renderCount(targetEl, count, countryName);
    })
    .catch(() => {
      countryCountCache[countryName] = null;
      renderCount(targetEl, null, countryName);
    });
}

// actually writes the count text into the tooltip element
// only updates if the tooltip is still showing the same country the request was made for
function renderCount(el, count, expectedCountry) {
  if (!el || el.dataset.country !== expectedCountry) return;

  el.classList.remove('loading');
  if (count === null) {
    el.textContent = 'Click to explore';
  } else {
    const rounded = Math.round(count / 100) * 100;
    el.textContent = rounded > 0 ? `~${rounded.toLocaleString()} artefacts` : 'Click to explore';
  }
}


function onHover(e) {
  if (e.target !== activeLayer) e.target.setStyle({ ...styleHover });

  const countryName = getName(e.target.feature);
  const flagCode = COUNTRY_FLAGS[countryName];

  // build up the tooltip content
  const flagHtml = flagCode
    ? `<span class="tooltip-flag" style="background-image: url('https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/6.6.6/flags/4x3/${flagCode}.svg');"></span>`
    : '';

  tooltip.innerHTML = `
    ${flagHtml}
    <span class="tooltip-text">
      <span class="tooltip-name">${countryName}</span>
      <span class="tooltip-count loading" data-country="${countryName}">Loading…</span>
    </span>
  `;

  tooltip.classList.add('visible');

  // fetch the count (cached after first lookup per country)
  const countEl = tooltip.querySelector('.tooltip-count');
  fetchCountryCount(countryName, countEl);
}


function onOut(e) {
  if (e.target !== activeLayer) e.target.setStyle({ ...styleDefault });
  tooltip.classList.remove('visible');
}


function onClick(e) {
  L.DomEvent.stopPropagation(e);
  if (activeLayer && activeLayer !== e.target) activeLayer.setStyle({ ...styleDefault });
  e.target.setStyle({ ...styleSelected });
  activeLayer = e.target;
  inspoOverride = null; // clear any inspiration filters when user clicks a country normally
  openCountryPanel(getName(e.target.feature));
}

map.on('click', () => closeCountryPanel());


// stores any active inspiration filters
let inspoOverride = null;


// maps country names to their two letter flag icon codes
const COUNTRY_FLAGS = {
  // europe
  'England': 'gb-eng', 'Scotland': 'gb-sct', 'Wales': 'gb-wls',
  'France': 'fr', 'Germany': 'de', 'Italy': 'it', 'Spain': 'es',
  'Portugal': 'pt', 'Netherlands': 'nl', 'Belgium': 'be',
  'Switzerland': 'ch', 'Austria': 'at', 'Poland': 'pl',
  'Sweden': 'se', 'Norway': 'no', 'Denmark': 'dk', 'Finland': 'fi',
  'Iceland': 'is', 'Ireland': 'ie', 'Greece': 'gr', 'Turkey': 'tr',
  'Russia': 'ru', 'Ukraine': 'ua', 'Belarus': 'by', 'Moldova': 'md',
  'Romania': 'ro', 'Bulgaria': 'bg', 'Serbia': 'rs', 'Croatia': 'hr',
  'Slovenia': 'si', 'Bosnia and Herz.': 'ba', 'Montenegro': 'me',
  'Albania': 'al', 'North Macedonia': 'mk', 'Kosovo': 'xk',
  'Hungary': 'hu', 'Czech Republic': 'cz', 'Slovakia': 'sk',
  'Lithuania': 'lt', 'Latvia': 'lv', 'Estonia': 'ee',
  'Luxembourg': 'lu', 'Monaco': 'mc', 'Andorra': 'ad',
  'Malta': 'mt', 'Cyprus': 'cy', 'Liechtenstein': 'li',
  'San Marino': 'sm', 'Vatican': 'va',

  // middle east
  'Iran': 'ir', 'Iraq': 'iq', 'Syria': 'sy', 'Lebanon': 'lb',
  'Jordan': 'jo', 'Israel': 'il', 'Palestine': 'ps',
  'Saudi Arabia': 'sa', 'Yemen': 'ye', 'Oman': 'om',
  'United Arab Emirates': 'ae', 'Qatar': 'qa', 'Bahrain': 'bh',
  'Kuwait': 'kw',

  // asia
  'Japan': 'jp', 'China': 'cn', 'India': 'in', 'Korea': 'kr',
  'Vietnam': 'vn', 'Thailand': 'th', 'Indonesia': 'id',
  'Malaysia': 'my', 'Philippines': 'ph', 'Singapore': 'sg',
  'Myanmar': 'mm', 'Burma': 'mm', 'Cambodia': 'kh', 'Laos': 'la',
  'Nepal': 'np', 'Sri Lanka': 'lk', 'Pakistan': 'pk',
  'Afghanistan': 'af', 'Bangladesh': 'bd', 'Bhutan': 'bt',
  'Maldives': 'mv', 'Mongolia': 'mn', 'Taiwan': 'tw',
  'Timor-Leste': 'tl', 'Brunei': 'bn',
  'North Korea': 'kp', 'Uzbekistan': 'uz', 'Kazakhstan': 'kz',
  'Turkmenistan': 'tm', 'Tajikistan': 'tj', 'Kyrgyzstan': 'kg',
  'Azerbaijan': 'az', 'Armenia': 'am', 'Georgia': 'ge', 'South Korea': 'kr',

  // africa
  'Egypt': 'eg', 'Morocco': 'ma', 'Algeria': 'dz', 'Tunisia': 'tn',
  'Libya': 'ly', 'Sudan': 'sd', 'South Sudan': 'ss', 'Ethiopia': 'et',
  'Eritrea': 'er', 'Djibouti': 'dj', 'Somalia': 'so', 'Kenya': 'ke',
  'Uganda': 'ug', 'Tanzania': 'tz', 'Rwanda': 'rw', 'Burundi': 'bi',
  'Nigeria': 'ng', 'Ghana': 'gh', 'Senegal': 'sn', 'Mali': 'ml',
  'Niger': 'ne', 'Chad': 'td', 'Cameroon': 'cm', 'Ivory Coast': 'ci',
  'Burkina Faso': 'bf', 'Guinea': 'gn', 'Guinea-Bissau': 'gw',
  'Sierra Leone': 'sl', 'Liberia': 'lr', 'Togo': 'tg', 'Benin': 'bj',
  'Mauritania': 'mr', 'Gambia': 'gm', 'Cape Verde': 'cv',
  'Congo': 'cd', 'Central African Republic': 'cf', 'Gabon': 'ga',
  'Equatorial Guinea': 'gq', 'São Tomé and Príncipe': 'st',
  'Angola': 'ao', 'Zambia': 'zm', 'Zimbabwe': 'zw', 'Mozambique': 'mz',
  'Malawi': 'mw', 'Madagascar': 'mg', 'Namibia': 'na', 'Botswana': 'bw',
  'South Africa': 'za', 'Lesotho': 'ls', 'Swaziland': 'sz',
  'Eswatini': 'sz', 'Mauritius': 'mu', 'Seychelles': 'sc',
  'Comoros': 'km',

  // americas
  'United States': 'us', 'Canada': 'ca', 'Mexico': 'mx',
  'Guatemala': 'gt', 'Belize': 'bz', 'Honduras': 'hn',
  'El Salvador': 'sv', 'Nicaragua': 'ni', 'Costa Rica': 'cr',
  'Panama': 'pa', 'Cuba': 'cu', 'Jamaica': 'jm', 'Haiti': 'ht',
  'Dominican Republic': 'do', 'Puerto Rico': 'pr',
  'Trinidad and Tobago': 'tt', 'Barbados': 'bb', 'Bahamas': 'bs',
  'Colombia': 'co', 'Venezuela': 've', 'Guyana': 'gy',
  'Suriname': 'sr', 'Ecuador': 'ec', 'Peru': 'pe', 'Bolivia': 'bo',
  'Brazil': 'br', 'Paraguay': 'py', 'Uruguay': 'uy', 'Argentina': 'ar',
  'Chile': 'cl', 'Greenland': 'gl',

  // oceania
  'Australia': 'au', 'New Zealand': 'nz', 'Papua New Guinea': 'pg',
  'Fiji': 'fj', 'Solomon Islands': 'sb', 'Vanuatu': 'vu',
  'Samoa': 'ws', 'Tonga': 'to', 'Kiribati': 'ki', 'Palau': 'pw',
  'Marshall Islands': 'mh', 'Micronesia': 'fm', 'Nauru': 'nr',
  'Tuvalu': 'tv',
};


// functions to open and close the country popup and load the relevant data when it's opened
function openCountryPanel(countryName, preselectCategory) {
  activeCountry = countryName;
  currentPage = 1;
  document.getElementById('panel-country-name').textContent = countryName;
  document.getElementById('panel-result-count').textContent = '';

  // inject the country flag if we have a code for it
  const flagEl = document.getElementById('panel-country-flag');
  const flagCode = COUNTRY_FLAGS[countryName];
  if (flagCode) {
    flagEl.className = `fi fi-${flagCode}`;
  } else {
    flagEl.className = '';
  }

  document.body.classList.add('panel-open');

  if (preselectCategory) {
    loadCategories(countryName, preselectCategory);
  } else {
    loadCategories(countryName);
    fetchArtefacts(1);
  }
}


// fetches categories dynamically for the selected country and populates the dropdown
// uses the V&A's clusters endpoint, which returns category data specific to each country
// optionally preselects a category if passed in (used by the inspiration menu)
function loadCategories(countryName, preselectLabel) {
  const select = document.getElementById('panel-category');
  // show a loading state while the request is in flight and disable the dropdown to prevent user interaction
  select.innerHTML = '<option value="">Loading categories...</option>';
  select.disabled = true;

  // request all available categories for this country
  // cluster_size=100 ensures we get a reasonable cap of categories rather than the default
  const url = `https://api.vam.ac.uk/v2/objects/clusters/category/search?q_place_name=${encodeURIComponent(countryName)}&cluster_size=100`;

  fetch(url)
    .then(r => r.json())
    .then(data => {
      // default "All categories" option that clears any filter
      let options = '<option value="">All categories</option>';
      data
        .filter(cat => cat.id && cat.value && cat.count > 0)
        .sort((a, b) => a.value.localeCompare(b.value))
        .forEach(cat => {
          options += `<option value="${cat.id}">${cat.value} (${cat.count.toLocaleString()})</option>`;
        });
      select.innerHTML = options;
      select.disabled = false;

      // if we have a category to preselect, find its real id from the loaded list and apply it
      // this avoids the issue where artefacts were pre-filtered by the inspiration menu using a hardcoded category id that doesn't actually apply to the selected country, resulting in zero results and a confusing empty state
      if (preselectLabel) {
        const match = data.find(cat => cat.value.toLowerCase() === preselectLabel.toLowerCase());
        if (match) {
          select.value = match.id;
          inspoOverride = { category: match.id, keyword: null };
          fetchArtefacts(1);
        }
      }
    })
    .catch(() => {
      // fallback if the request fails - if everything fails or the API is unavailable
      select.innerHTML = `
        <option value="">All categories</option>
        <option value="THES48904">Ceramics</option>
        <option value="THES49003">Fashion</option>
        <option value="THES48943">Furniture</option>
        <option value="THES48986">Jewellery</option>
        <option value="THES49056">Photographs</option>
        <option value="THES49070">Sculpture</option>
        <option value="THES49093">Textiles</option>
        <option value="THES49048">Paintings</option>`;
      select.disabled = false;
    });
}


function closeCountryPanel() {
  document.body.classList.remove('panel-open');
  if (activeLayer) { activeLayer.setStyle({ ...styleDefault }); activeLayer = null; }
  activeCountry = null;
  inspoOverride = null; // make sure filters are cleared when panel closes
}


// close the popup if user clicks the dark background area outside it
function handleOverlayClick(e) {
  if (e.target === document.getElementById('overlay')) closeCountryPanel();
}


// this is where the actual API call happens - sends a request to the V&A and gets artefacts back
function fetchArtefacts(page = 1) {
  if (!activeCountry) return;
  currentPage = page;

  const category = inspoOverride?.category || document.getElementById('panel-category').value;
  const imagesOnly = document.getElementById('images-only').checked;

  showLoading();

  // if images only is ticked we might need to fetch multiple pages to fill up the grid
  // because the api returns some records without images even with image_restrict on
  if (imagesOnly) {
    fetchWithImages(page, category);
  } else {
    // normal single fetch when showing everything
    const params = new URLSearchParams();
    params.set('q_place_name', activeCountry);
    params.set('page_size', PAGE_SIZE);
    params.set('page', currentPage);
    if (category) params.set('id_category', category);

    fetch(`${API_BASE}?${params}`)
      .then(r => r.json())
      .then(renderResults)
      .catch(() => showError());
  }
}


// keeps fetching api pages until we have enough records with images
// or we've exhausted all available pages
function fetchWithImages(page, category, collected = [], apiPage = null, totalPages = null) {
  // first call - work out which api page to start on
  if (apiPage === null) apiPage = (page - 1) * 2 + 1;

  const params = new URLSearchParams();
  params.set('q_place_name', activeCountry);
  params.set('image_restrict', '1');
  params.set('page_size', PAGE_SIZE);
  params.set('page', apiPage);
  if (category) params.set('id_category', category);

  fetch(`${API_BASE}?${params}`)
    .then(r => r.json())
    .then(data => {
      if (totalPages === null) totalPages = data.info.pages;

      // keep only records that actually have an image
      const withImages = (data.records || []).filter(r => r._primaryImageId);
      collected = collected.concat(withImages);

      // if we have enough, or we've run out of api pages, render what we have
      if (collected.length >= PAGE_SIZE || apiPage >= totalPages) {
        renderResults({
          records: collected.slice(0, PAGE_SIZE),
          info: {
            record_count: data.info.record_count,
            pages: Math.max(1, Math.ceil(data.info.record_count / PAGE_SIZE)),
          },
        });
      } else {
        // otherwise fetch the next page and combine with what we have
        fetchWithImages(page, category, collected, apiPage + 1, totalPages);
      }
    })
    .catch(() => showError());
}


function renderResults(data) {
  let records = data.records;
  const totalCount = data.info.record_count;
  const totalPages = data.info.pages;

  hideLoading();

  // check for empty results before doing anything else
  if (!records || records.length === 0) {
    document.getElementById('panel-empty').style.display = 'block';
    document.getElementById('panel-result-count').textContent = '';
    document.getElementById('panel-pagination').innerHTML = '';
    return;
  }

  document.getElementById('panel-result-count').innerHTML =
    `<strong>${totalCount.toLocaleString()}</strong> artefacts found`;

  window._currentRecords = records;

  document.getElementById('panel-grid').innerHTML = records.map((item, i) => {
    const imgId = item._primaryImageId;
    const title = item._primaryTitle || 'Untitled';
    const place = item._primaryPlace || '';
    const date = item._primaryDate || '';

    const imgContent = imgId
      ? `<img src="${IMAGE_BASE}/${imgId}/full/!300,300/0/default.jpg" alt="" loading="lazy">`
      : `<span class="no-img">No image</span>`;

    return `
      <button class="card" type="button" onclick="openDetail(${i})">
        <div class="card-img">${imgContent}</div>
        <div class="card-body">
          ${place ? `<div class="card-place-badge">${place}</div>` : ''}
          <div class="card-title">${title}</div>
          ${date ? `<div class="card-date">${date}</div>` : ''}
        </div>
      </button>`;
  }).join('');

  buildPagination(currentPage, totalPages);
  document.getElementById('panel-body').scrollTo({ top: 0, behavior: 'smooth' });
}


function buildPagination(page, totalPages) {
  const el = document.getElementById('panel-pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, start + 4);

  let html = `<button class="page-btn" onclick="fetchArtefacts(${page - 1})"
                ${page === 1 ? 'disabled' : ''}>← Prev</button>`;

  for (let p = start; p <= end; p++) {
    html += `<button class="page-btn ${p === page ? 'active' : ''}"
               onclick="fetchArtefacts(${p})">${p}</button>`;
  }

  html += `<button class="page-btn" onclick="fetchArtefacts(${page + 1})"
             ${page === totalPages ? 'disabled' : ''}>Next →</button>`;

  el.innerHTML = html;
}


// opens the second popup showing full info about a specific artefact when a card is clicked
function openDetail(index) {
  const item = window._currentRecords[index];
  if (!item) return;

  const imgId = item._primaryImageId;
  const title = item._primaryTitle || 'Untitled';
  const place = item._primaryPlace || '—';
  const date = item._primaryDate || '—';
  const objType = item.objectType || '';
  const sysNum = item.systemNumber || '';
  const accession = item.accessionNumber || '';
  const artist = item._primaryMaker?.name || '—';
  const location = item._currentLocation?.displayName || '—';

  document.getElementById('detail-image-wrap').innerHTML = imgId
    ? `<img src="${IMAGE_BASE}/${imgId}/full/!600,600/0/default.jpg" alt="${title.replace(/"/g, '')}">`
    : `<div class="detail-no-img">No image available</div>`;

  document.getElementById('detail-object-type').textContent = objType;
  document.getElementById('detail-title').textContent = title;
  document.getElementById('detail-place').textContent = place;
  document.getElementById('detail-date').textContent = date;
  document.getElementById('detail-artist').textContent = artist;
  document.getElementById('detail-collection').textContent = location;
  document.getElementById('detail-accession').textContent = accession ? `Acc. no. ${accession}` : '';
  document.getElementById('detail-va-link').href = `https://collections.vam.ac.uk/item/${sysNum}/`;

  document.getElementById('detail-overlay').classList.add('visible');
}


function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('visible');
}


function handleDetailOverlayClick(e) {
  if (e.target === document.getElementById('detail-overlay')) closeDetail();
}


// pressing escape closes the detail popup first, then the country popup if you press it again
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('detail-overlay').classList.contains('visible')) {
      closeDetail();
    } else {
      closeCountryPanel();
    }
  }
});


// helper functions to show/hide the loading spinner and error message
function showLoading() {
  document.getElementById('panel-loading').style.display = 'block';
  document.getElementById('panel-grid').innerHTML = '';
  document.getElementById('panel-empty').style.display = 'none';
  document.getElementById('panel-error').style.display = 'none';
  document.getElementById('panel-pagination').innerHTML = '';
  document.getElementById('panel-result-count').textContent = '';
}


function hideLoading() {
  document.getElementById('panel-loading').style.display = 'none';
}


function showError() {
  hideLoading();
  document.getElementById('panel-error').style.display = 'block';
}


// inspiration menu
const inspoSelections = {
  category: { label: 'Ceramics', value: 'THES48904', emoji: '🏺' },
  country: { label: 'Japan', value: 'Japan', flag: 'jp' },
};


function openInspo() {
  document.getElementById('inspo-overlay').classList.add('visible');
  document.getElementById('inspo-panel').classList.add('visible');
}


function closeInspo() {
  document.getElementById('inspo-overlay').classList.remove('visible');
  document.getElementById('inspo-panel').classList.remove('visible');
  closeAllSelectors();
}


function toggleSelector(type) {
  const opts = document.getElementById('opts-' + type);
  const btn = document.querySelector('#sel-' + type + ' .inspo-selector-btn');
  const isOpen = opts.classList.contains('open');
  closeAllSelectors();
  if (!isOpen) {
    opts.classList.add('open');
    btn.classList.add('open');
  }
}


function closeAllSelectors() {
  document.querySelectorAll('.inspo-options').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.inspo-selector-btn').forEach(el => el.classList.remove('open'));
}


function pick(type, label, value, extra) {
  const btn = document.querySelector('#sel-' + type + ' .inspo-selector-btn');

  if (type === 'category') {
    inspoSelections.category = { label, value, emoji: extra };
    btn.querySelector('.sel-emoji').textContent = extra;
  } else if (type === 'country') {
    inspoSelections.country = { label, value, flag: extra };
    const flagEl = btn.querySelector('.sel-flag');
    flagEl.className = 'fi fi-' + extra + ' sel-flag';
  }

  btn.querySelector('.sel-label').textContent = label;

  document.querySelectorAll('#opts-' + type + ' .inspo-option').forEach(el => {
    el.classList.toggle('selected', el.textContent.trim().includes(label));
  });

  closeAllSelectors();
  document.getElementById('inspo-result').classList.remove('visible');
}


function discover() {
  const { category, country } = inspoSelections;
  inspoOverride = null; // reset before setting new filters so nothing carries over
  closeInspo();
  openCountryPanel(country.value, category.label);
}


const inspoAllOptions = {
  category: [
    { label: 'Ceramics', value: 'THES48904', emoji: '🏺' },
    { label: 'Jewellery', value: 'THES48986', emoji: '💍' },
    { label: 'Textiles', value: 'THES49093', emoji: '🧵' },
    { label: 'Sculpture', value: 'THES49070', emoji: '🗿' },
    { label: 'Paintings', value: 'THES49048', emoji: '🖼️' },
    { label: 'Fashion', value: 'THES49003', emoji: '👗' },
    { label: 'Furniture', value: 'THES48943', emoji: '🪑' },
    { label: 'Photographs', value: 'THES49056', emoji: '📷' },
  ],
  country: [
    { label: 'Japan', value: 'Japan', flag: 'jp' },
    { label: 'China', value: 'China', flag: 'cn' },
    { label: 'India', value: 'India', flag: 'in' },
    { label: 'Italy', value: 'Italy', flag: 'it' },
    { label: 'France', value: 'France', flag: 'fr' },
    { label: 'Egypt', value: 'Egypt', flag: 'eg' },
    { label: 'England', value: 'England', flag: 'gb-eng' },
    { label: 'Iran', value: 'Iran', flag: 'ir' },
    { label: 'Turkey', value: 'Turkey', flag: 'tr' },
    { label: 'Germany', value: 'Germany', flag: 'de' },
    { label: 'Spain', value: 'Spain', flag: 'es' },
    { label: 'Korea', value: 'Korea', flag: 'kr' },
  ],
};


function shuffle() {
  ['category', 'country'].forEach(type => {
    const opts = inspoAllOptions[type];
    const picked = opts[Math.floor(Math.random() * opts.length)];
    if (type === 'category') pick(type, picked.label, picked.value, picked.emoji);
    else pick(type, picked.label, picked.value, picked.flag);
  });
}

document.addEventListener('click', e => {
  if (!e.target.closest('.inspo-selector') && !e.target.closest('#inspo-trigger')) {
    closeAllSelectors();
  }
});


// carousel on the onboarding - auto-advances every few seconds but user can also click arrows or dots
const carouselSlides = document.querySelectorAll('.carousel-slide');
const carouselDots = document.querySelectorAll('.carousel-dot');
let carouselIndex = 0;
let carouselTimer = null;

// switch to a specific slide
function carouselShow(i) {
  carouselSlides[carouselIndex].classList.remove('active');
  carouselDots[carouselIndex].classList.remove('active');
  carouselIndex = (i + carouselSlides.length) % carouselSlides.length;
  carouselSlides[carouselIndex].classList.add('active');
  carouselDots[carouselIndex].classList.add('active');
}


// step forward or backward by amount (1 or -1)
function carouselGo(amount) {
  carouselShow(carouselIndex + amount);
  restartCarouselTimer();
}


// jump straight to a specific slide when a dot is clicked
function carouselJump(i) {
  carouselShow(i);
  restartCarouselTimer();
}


// reset the auto-advance timer after any manual interaction
// otherwise the carousel might tick over right after the user clicks
function restartCarouselTimer() {
  clearInterval(carouselTimer);
  startCarouselTimer();
}


function startCarouselTimer() {
  carouselTimer = setInterval(() => carouselShow(carouselIndex + 1), 3500);
}


if (carouselSlides.length > 0) {
  startCarouselTimer();
}


// preloads artefact counts for each suggestion chip so the hover state can show real numbers
// runs once when the page loads, silently in the background
function preloadSuggestionCounts() {
  const chips = document.querySelectorAll('.suggestion-chip');

  chips.forEach(chip => {
    const country = chip.dataset.country;
    const url = `${API_BASE}?q_place_name=${encodeURIComponent(country)}&page_size=1`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        const count = data.info.record_count;
        // round to nearest hundred for nicer display and softens the loose api filter
        const rounded = Math.round(count / 100) * 100;
        const hoverEl = chip.querySelector('.chip-hover');
        hoverEl.textContent = `~${rounded.toLocaleString()} artefacts`;
      })
      .catch(() => {
        // fallback if the request fails - just hide the hover state
        const hoverEl = chip.querySelector('.chip-hover');
        hoverEl.textContent = 'Explore →';
      });
  });
}


// kick it off after a brief delay so it doesn't compete with the map loading
setTimeout(preloadSuggestionCounts, 1000);