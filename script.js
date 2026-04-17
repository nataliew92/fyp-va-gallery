// URLs for the V&A API and a variable to control how many results per page
const API_BASE   = 'https://api.vam.ac.uk/v2/objects/search';
const IMAGE_BASE = 'https://framemark.vam.ac.uk/collections';
const PAGE_SIZE  = 20;

let activeCountry = null;
let activeLayer   = null;
let currentPage   = 1;

const NAME_FIXES = {
  'United Kingdom':                  'England',
  'United States of America':        'United States',
  'Republic of Korea':               'Korea',
  'Dem. Rep. Korea':                 'Korea',
  "People's Republic of China":      'China',
  'Iran (Islamic Republic of)':      'Iran',
  'Viet Nam':                        'Vietnam',
  'Syrian Arab Republic':            'Syria',
  'Russian Federation':              'Russia',
  'Democratic Republic of the Congo':'Congo',
  'Republic of the Congo':           'Congo',
  'Czechia':                         'Czech Republic',
  'Myanmar':                         'Burma',
  'Türkiye':                         'Turkey',
  'Lao PDR':                         'Laos',
  'eSwatini':                        'Swaziland',
  'S. Sudan':                        'South Sudan',
};

function normaliseName(raw) { return NAME_FIXES[raw] || raw; }


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
  subdomains: 'abcd', maxZoom: 19,
  noWrap: true,
}).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
  subdomains: 'abcd', maxZoom: 19, pane: 'overlayPane',
  noWrap: true,
}).addTo(map);


// styles for the country polygons - default (invisible), hovered and selected (navy blue)
const styleDefault  = { fillColor:'#000000', fillOpacity:0,    color:'rgba(0,0,0,0.15)', weight:0.5, opacity:1 };
const styleHover    = { fillColor:'#1a5276', fillOpacity:0.2,  color:'#1a5276',          weight:2,   opacity:1 };
const styleSelected = { fillColor:'#1a5276', fillOpacity:0.35, color:'#1a5276',          weight:2.5, opacity:1 };


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
  tooltip.style.top  = (e.clientY - 28) + 'px';
});

function getName(feature) {
  return normaliseName(feature.properties.ADMIN || feature.properties.name || 'Unknown');
}

function onHover(e) {
  if (e.target !== activeLayer) e.target.setStyle({ ...styleHover });
  tooltip.textContent = getName(e.target.feature);
  tooltip.style.display = 'block';
}

function onOut(e) {
  if (e.target !== activeLayer) e.target.setStyle({ ...styleDefault });
  tooltip.style.display = 'none';
}

function onClick(e) {
  L.DomEvent.stopPropagation(e);
  if (activeLayer && activeLayer !== e.target) activeLayer.setStyle({ ...styleDefault });
  e.target.setStyle({ ...styleSelected });
  activeLayer = e.target;
  openCountryPanel(getName(e.target.feature));
}

map.on('click', () => closeCountryPanel());


// functions to open and close the country popup
function openCountryPanel(countryName) {
  activeCountry = countryName;
  currentPage   = 1;
  document.getElementById('panel-category').value = '';
  document.getElementById('panel-country-name').textContent = countryName;
  document.getElementById('panel-result-count').textContent = '';
  document.body.classList.add('panel-open');
  fetchArtefacts(1);
}

function closeCountryPanel() {
  document.body.classList.remove('panel-open');
  if (activeLayer) { activeLayer.setStyle({ ...styleDefault }); activeLayer = null; }
  activeCountry = null;
}

// close the popup if user clicks the dark background area outside it
function handleOverlayClick(e) {
  if (e.target === document.getElementById('overlay')) closeCountryPanel();
}


// this is where the actual API call happens - sends a request to the V&A and gets artefacts back
function fetchArtefacts(page = 1) {
  if (!activeCountry) return;
  currentPage = page;

  const category = document.getElementById('panel-category').value;
  const params   = new URLSearchParams();

  params.set('q_place_name',   activeCountry);
  params.set('image_restrict', '1');
  params.set('page_size',      PAGE_SIZE);
  params.set('page',           currentPage);
  if (category) params.set('id_category', category);

  showLoading();

  fetch(`${API_BASE}?${params}`)
    .then(r => r.json())
    .then(renderResults)
    .catch(() => showError());
}

function renderResults(data) {
  const records    = data.records;
  const totalCount = data.info.record_count;
  const totalPages = data.info.pages;

  hideLoading();

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
    const date  = item._primaryDate  || '';

    const imgContent = imgId
      ? `<img src="${IMAGE_BASE}/${imgId}/full/!300,300/0/default.jpg" alt="" loading="lazy">`
      : `<span class="no-img">No image</span>`;

    return `
      <div class="card" onclick="openDetail(${i})">
        <div class="card-img">${imgContent}</div>
        <div class="card-body">
          ${place ? `<div class="card-place-badge">${place}</div>` : ''}
          <div class="card-title">${title}</div>
          ${date ? `<div class="card-date">${date}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  buildPagination(currentPage, totalPages);
  document.getElementById('panel-body').scrollTo({ top: 0, behavior: 'smooth' });
}

function buildPagination(page, totalPages) {
  const el = document.getElementById('panel-pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }

  const start = Math.max(1, page - 2);
  const end   = Math.min(totalPages, start + 4);

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

  const imgId     = item._primaryImageId;
  const title     = item._primaryTitle            || 'Untitled';
  const place     = item._primaryPlace            || '—';
  const date      = item._primaryDate             || '—';
  const objType   = item.objectType               || '';
  const sysNum    = item.systemNumber             || '';
  const accession = item.accessionNumber          || '';
  const artist    = item._primaryMaker?.name      || '—';
  const location  = item._currentLocation?.displayName || '—';

  document.getElementById('detail-image-wrap').innerHTML = imgId
    ? `<img src="${IMAGE_BASE}/${imgId}/full/!600,600/0/default.jpg" alt="${title.replace(/"/g,'')}">`
    : `<div class="detail-no-img">No image available</div>`;

  document.getElementById('detail-object-type').textContent = objType;
  document.getElementById('detail-title').textContent       = title;
  document.getElementById('detail-place').textContent       = place;
  document.getElementById('detail-date').textContent        = date;
  document.getElementById('detail-artist').textContent      = artist;
  document.getElementById('detail-collection').textContent  = location;
  document.getElementById('detail-accession').textContent   = accession ? `Acc. no. ${accession}` : '';
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
  document.getElementById('panel-loading').style.display    = 'block';
  document.getElementById('panel-grid').innerHTML           = '';
  document.getElementById('panel-empty').style.display      = 'none';
  document.getElementById('panel-error').style.display      = 'none';
  document.getElementById('panel-pagination').innerHTML     = '';
  document.getElementById('panel-result-count').textContent = '';
}

function hideLoading() {
  document.getElementById('panel-loading').style.display = 'none';
}

function showError() {
  hideLoading();
  document.getElementById('panel-error').style.display = 'block';
}
