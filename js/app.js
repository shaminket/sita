/**
 * ShaMinKet — Motor de Citas Bibliográficas (APA 7, MLA 9, Chicago, Harvard, IEEE, Vancouver)
 * Soporta links de páginas web, links de imágenes y archivos/capturas de imagen pegadas.
 */

const state = {
  sourceType: 'webpage', // 'webpage' | 'image'
  activeFormat: 'apa7',  // 'apa7' | 'mla9' | 'chicago' | 'harvard' | 'ieee' | 'vancouver'
  snowEnabled: true,
  savedCitations: [],
  metadata: {
    authorLast: '',
    authorFirst: '',
    isCorporateAuthor: false,
    year: '',
    month: '',
    day: '',
    title: '',
    siteName: '',
    url: '',
    imageType: 'Fotografía', // Fotografía, Ilustración, Infografía, Imagen digital
    accessDate: new Date()
  }
};

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const MONTHS_SHORT_ES = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'
];

// Diccionario de sitios comunes para reconocimiento instantáneo y limpio
const KNOWN_SITES = {
  'wikipedia.org': { site: 'Wikipedia', author: 'Colaboradores de Wikipedia', corp: true },
  'unam.mx': { site: 'Universidad Nacional Autónoma de México (UNAM)', author: 'UNAM', corp: true },
  'scielo.org': { site: 'SciELO', author: '', corp: false },
  'redalyc.org': { site: 'Redalyc', author: '', corp: false },
  'Dialnet': { site: 'Dialnet', author: '', corp: false },
  'nationalgeographic': { site: 'National Geographic', author: 'National Geographic', corp: true },
  'bbc.com': { site: 'BBC News Mundo', author: 'BBC News Mundo', corp: true },
  'elpais.com': { site: 'El País', author: 'El País', corp: true },
  'unsplash.com': { site: 'Unsplash', author: '', corp: false },
  'pexels.com': { site: 'Pexels', author: '', corp: false },
  'pixabay.com': { site: 'Pixabay', author: '', corp: false },
  'wikimedia.org': { site: 'Wikimedia Commons', author: 'Wikimedia Commons', corp: true },
  'pinterest.com': { site: 'Pinterest', author: '', corp: false },
  'youtube.com': { site: 'YouTube', author: '', corp: false },
  'youtu.be': { site: 'YouTube', author: '', corp: false }
};

document.addEventListener('DOMContentLoaded', () => {
  initSnowfall();
  bindEvents();
  // Cargar un ejemplo inicial limpio para que el usuario vea el formato de inmediato
  loadQuickExample('articulo');
});

/* ==========================================================================
   1. EFECTOS NAVIDEÑOS SHAMINKET (NIEVE + CAMPANITAS EN SINTETIZADOR WEB AUDIO)
   ========================================================================== */
function initSnowfall() {
  const container = document.getElementById('snowCanvas');
  if (!container) return;
  container.innerHTML = '';

  const colors = [
    'rgba(224, 242, 254, 0.75)', // Blanco escarcha
    'rgba(96, 165, 250, 0.75)',  // Azul ShaMinKet
    'rgba(167, 139, 250, 0.75)'  // Morado ShaMinKet
  ];

  for (let i = 0; i < 34; i++) {
    const flake = document.createElement('div');
    flake.className = 'snowflake';
    const size = (Math.random() * 4.5 + 2).toFixed(1);
    flake.style.width = `${size}px`;
    flake.style.height = `${size}px`;
    flake.style.left = `${(Math.random() * 100).toFixed(2)}vw`;
    flake.style.background = colors[i % colors.length];
    flake.style.boxShadow = `0 0 6px ${colors[i % colors.length]}`;
    flake.style.animationDuration = `${(Math.random() * 9 + 7).toFixed(1)}s`;
    flake.style.animationDelay = `${(Math.random() * 6).toFixed(1)}s`;
    container.appendChild(flake);
  }
}

function playWinterChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    // Acorde cristalino invernal (Mi menor 9 / destello nocturno)
    const notes = [659.25, 783.99, 987.77, 1174.66, 1567.98];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.09);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.11, ctx.currentTime + idx * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + idx * 0.09 + 1.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.09);
      osc.stop(ctx.currentTime + idx * 0.09 + 1.15);
    });
  } catch (e) {
    // Ignorar si el navegador bloquea audio sin interacción previa
  }
}

/* ==========================================================================
   2. EXTRACCIÓN INTELIGENTE DE DATOS DESDE UN LINK O IMAGEN
   ========================================================================== */
async function processInputUrl(rawInput) {
  const cleaned = (rawInput || '').trim();
  if (!cleaned) return;

  const btnCite = document.getElementById('btnGenerate');
  const origText = btnCite.innerHTML;
  btnCite.innerHTML = '<span>❄</span> Analizando...';

  // Detectar automáticamente si el link apunta a una imagen
  const isImageUrl = /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)(\?.*)?$/i.test(cleaned) ||
                     /unsplash\.com\/photos|pexels\.com\/photo|pixabay\.com\/photos|commons\.wikimedia\.org\/wiki\/File:/i.test(cleaned);

  if (isImageUrl && state.sourceType !== 'image') {
    setSourceMode('image', false);
  }

  // 1. Parseo heurístico inmediato de la URL
  const parsed = parseUrlHeuristics(cleaned);
  Object.assign(state.metadata, parsed);

  // 2. Intentar enriquecer el título o autor si hay conexión (vía microlink o allorigins con timeout corto)
  if (/^https?:\/\//i.test(cleaned)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2800);
      const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(cleaned)}`;
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        if (json && json.status === 'success' && json.data) {
          const d = json.data;
          if (d.title) state.metadata.title = cleanPageTitle(d.title, d.publisher);
          if (d.publisher) state.metadata.siteName = d.publisher;
          if (d.author) {
            applyAuthorString(d.author);
          }
          if (d.date) {
            const dt = new Date(d.date);
            if (!isNaN(dt.getFullYear())) {
              state.metadata.year = String(dt.getFullYear());
              state.metadata.month = MONTHS_ES[dt.getMonth()];
              state.metadata.day = String(dt.getDate());
            }
          }
          if (d.image && d.image.url && state.sourceType === 'image') {
            showThumbnail(d.image.url);
          }
        }
      }
    } catch (_) {
      // Continúa silenciosamente con la heurística local si está offline o bloqueado
    }
  }

  if (isImageUrl && /^https?:\/\//i.test(cleaned)) {
    showThumbnail(cleaned);
  }

  syncInputsFromState();
  renderCitations();
  btnCite.innerHTML = origText;
}

function parseUrlHeuristics(rawInput) {
  let urlStr = rawInput;
  if (!/^https?:\/\//i.test(urlStr) && !urlStr.startsWith('data:')) {
    urlStr = 'https://' + urlStr;
  }

  const result = {
    authorLast: '',
    authorFirst: '',
    isCorporateAuthor: false,
    year: '',
    month: '',
    day: '',
    title: '',
    siteName: '',
    url: urlStr
  };

  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./i, '');

    // Verificar diccionario de sitios conocidos
    let matchedKnown = null;
    for (const key of Object.keys(KNOWN_SITES)) {
      if (host.includes(key)) {
        matchedKnown = KNOWN_SITES[key];
        break;
      }
    }

    if (matchedKnown) {
      result.siteName = matchedKnown.site;
      if (matchedKnown.author) {
        result.authorLast = matchedKnown.author;
        result.isCorporateAuthor = matchedKnown.corp;
      }
    } else {
      // Formatear nombre del dominio como nombre del sitio (ej. bbc.com -> Bbc, unam.mx -> UNAM)
      const domainBase = host.split('.')[0];
      result.siteName = domainBase.length <= 4
        ? domainBase.toUpperCase()
        : domainBase.charAt(0).toUpperCase() + domainBase.slice(1);
      result.authorLast = result.siteName;
      result.isCorporateAuthor = true;
    }

    // Extraer posible fecha en la ruta (ej. /2025/11/24/ o /2026/)
    const fullDateMatch = u.pathname.match(/\/(20\d{2}|19\d{2})\/(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\b/);
    const yearMonthMatch = u.pathname.match(/\/(20\d{2}|19\d{2})\/(0[1-9]|1[0-2])\b/);
    const yearOnlyMatch = u.pathname.match(/\/(20\d{2}|19\d{2})\b/);

    if (fullDateMatch) {
      result.year = fullDateMatch[1];
      result.month = MONTHS_ES[parseInt(fullDateMatch[2], 10) - 1];
      result.day = String(parseInt(fullDateMatch[3], 10));
    } else if (yearMonthMatch) {
      result.year = yearMonthMatch[1];
      result.month = MONTHS_ES[parseInt(yearMonthMatch[2], 10) - 1];
    } else if (yearOnlyMatch) {
      result.year = yearOnlyMatch[1];
    }

    // Extraer título legible del último segmento de la URL
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      let lastSeg = decodeURIComponent(segments[segments.length - 1]);
      // Quitar extensiones (.html, .php, .jpg, .png)
      lastSeg = lastSeg.replace(/\.(html?|php|aspx?|jsp|jpg|jpeg|png|webp|gif|svg)$/i, '');
      // Quitar IDs numéricos largos al final o principio
      lastSeg = lastSeg.replace(/[-_]\d{5,}$/, '');
      // Reemplazar guiones y guiones bajos por espacios
      lastSeg = lastSeg.replace(/[-_]+/g, ' ').trim();

      if (lastSeg.length > 2) {
        result.title = lastSeg.charAt(0).toUpperCase() + lastSeg.slice(1);
      }
    }

    if (!result.title) {
      result.title = state.sourceType === 'image'
        ? `Imagen publicada en ${result.siteName}`
        : `Página principal de ${result.siteName}`;
    }
  } catch (err) {
    result.title = rawInput;
    result.siteName = 'Fuente digital';
  }

  return result;
}

function cleanPageTitle(rawTitle, publisher) {
  let t = rawTitle.trim();
  if (publisher) {
    const escaped = publisher.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\s*[-|•–—]\\s*${escaped}$`, 'i'), '');
  }
  t = t.replace(/\s*[-|–—]\s*Wikipedia, la enciclopedia libre$/i, '');
  return t.trim();
}

function applyAuthorString(authorStr) {
  const clean = authorStr.trim();
  if (!clean) return;
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    state.metadata.authorLast = parts[0];
    state.metadata.authorFirst = '';
    state.metadata.isCorporateAuthor = true;
  } else {
    state.metadata.authorLast = parts.slice(-1).join(' ');
    state.metadata.authorFirst = parts.slice(0, -1).join(' ');
    state.metadata.isCorporateAuthor = false;
  }
}

/* ==========================================================================
   3. GENERADOR DE CITAS EN MÚLTIPLES FORMATOS ACADÉMICOS
   ========================================================================== */
function formatAuthorAPA(m) {
  const last = (m.authorLast || '').trim();
  const first = (m.authorFirst || '').trim();
  if (!last && !first) return m.siteName || 'Autor desconocido';
  if (!first || m.isCorporateAuthor) return last;
  const initials = first
    .split(/\s+/)
    .filter(Boolean)
    .map(n => `${n.charAt(0).toUpperCase()}.`)
    .join(' ');
  return `${last}, ${initials}`;
}

function formatAuthorMLA(m) {
  const last = (m.authorLast || '').trim();
  const first = (m.authorFirst || '').trim();
  if (!last && !first) return m.siteName || 'Autor desconocido';
  if (!first || m.isCorporateAuthor) return last;
  return `${last}, ${first}`;
}

function formatAuthorFull(m) {
  const last = (m.authorLast || '').trim();
  const first = (m.authorFirst || '').trim();
  if (!last && !first) return m.siteName || 'Autor desconocido';
  if (!first || m.isCorporateAuthor) return last;
  return `${first} ${last}`;
}

function formatDateAPA(m) {
  const y = (m.year || '').trim();
  const mo = (m.month || '').trim().toLowerCase();
  const d = (m.day || '').trim();
  if (!y) return 's. f.';
  if (y && mo && d) return `${y}, ${d} de ${mo}`;
  if (y && mo) return `${y}, ${mo}`;
  return y;
}

function formatAccessDateFull() {
  const now = state.metadata.accessDate || new Date();
  const d = now.getDate();
  const m = MONTHS_ES[now.getMonth()];
  const y = now.getFullYear();
  return `${d} de ${m} de ${y}`;
}

function generateCitationHTML(format, m) {
  const isImage = state.sourceType === 'image';
  const title = (m.title || (isImage ? 'Imagen sin título' : 'Documento sin título')).trim();
  const site = (m.siteName || 'Sitio web').trim();
  const url = (m.url || '').trim();
  const year = (m.year || '').trim() || 's. f.';
  const imgBracket = isImage ? ` [${m.imageType || 'Imagen'}]` : '';

  switch (format) {
    case 'apa7': {
      // APA 7ma Edición Oficial (Páginas Web e Imágenes)
      const author = formatAuthorAPA(m);
      const dateStr = formatDateAPA(m);
      // En APA 7: si el autor es igual al nombre del sitio, se omite el nombre del sitio para no repetir
      const showSite = site && site.toLowerCase() !== author.toLowerCase();
      const siteSegment = showSite ? ` ${site}.` : '';
      const urlSegment = url ? ` <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color: var(--accent-blue-light); text-decoration: none;">${escapeHtml(url)}</a>` : '';
      return `${escapeHtml(author)}. (${escapeHtml(dateStr)}). <em>${escapeHtml(title)}</em>${escapeHtml(imgBracket)}.${escapeHtml(siteSegment)}${urlSegment}`;
    }

    case 'mla9': {
      // MLA 9na Edición
      const author = formatAuthorMLA(m);
      const datePart = m.year ? `${m.day ? m.day + ' ' : ''}${m.month ? m.month + ' ' : ''}${m.year}` : 's. f.';
      const typeTag = isImage ? ` ${m.imageType || 'Imagen digital'}.` : '';
      const urlClean = url ? ` <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color: var(--accent-blue-light); text-decoration: none;">${escapeHtml(url)}</a>.` : '';
      return `${escapeHtml(author)}. "${escapeHtml(title)}." <em>${escapeHtml(site)}</em>, ${escapeHtml(datePart)}.${escapeHtml(typeTag)}${urlClean} Consultado el ${formatAccessDateFull()}.`;
    }

    case 'chicago': {
      // Chicago 17ma Edición (Notas y Bibliografía)
      const author = formatAuthorMLA(m);
      const datePart = m.year ? `${m.day ? m.day + ' de ' : ''}${m.month ? m.month + ' de ' : ''}${m.year}` : `consultado el ${formatAccessDateFull()}`;
      const typeTag = isImage ? ` (${m.imageType.toLowerCase()})` : '';
      const urlPart = url ? ` <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color: var(--accent-blue-light); text-decoration: none;">${escapeHtml(url)}</a>.` : '';
      return `${escapeHtml(author)}. "${escapeHtml(title)}"${escapeHtml(typeTag)}. <em>${escapeHtml(site)}</em>. ${escapeHtml(datePart)}.${urlPart}`;
    }

    case 'harvard': {
      // Estilo Harvard
      const author = formatAuthorAPA(m);
      const typeTag = isImage ? ` [${m.imageType}]` : ' [En línea]';
      const urlPart = url ? ` Disponible en: <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color: var(--accent-blue-light); text-decoration: none;">${escapeHtml(url)}</a>` : '';
      return `${escapeHtml(author)} (${escapeHtml(year)}) <em>${escapeHtml(title)}</em>${escapeHtml(typeTag)}. ${escapeHtml(site)}.${urlPart} [Consultado: ${formatAccessDateFull()}].`;
    }

    case 'ieee': {
      // Estilo IEEE
      const firstInit = (m.authorFirst || '').trim()
        ? m.authorFirst.trim().split(/\s+/).map(n => `${n.charAt(0).toUpperCase()}.`).join(' ') + ' '
        : '';
      const author = (m.authorLast || m.siteName || 'Autor').trim();
      const typeTag = isImage ? ` [${m.imageType}]` : ' [En línea]';
      const urlPart = url ? ` Disponible en: <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color: var(--accent-blue-light); text-decoration: none;">${escapeHtml(url)}</a>` : '';
      return `[1] ${escapeHtml(firstInit + author)}, "${escapeHtml(title)}," <em>${escapeHtml(site)}</em>, ${escapeHtml(year)}.${escapeHtml(typeTag)}.${urlPart} [Accedido: ${formatAccessDateFull()}].`;
    }

    case 'vancouver': {
      // Estilo Vancouver (Ciencias de la Salud / Biomédico)
      const firstInit = (m.authorFirst || '').trim()
        ? ' ' + m.authorFirst.trim().split(/\s+/).map(n => n.charAt(0).toUpperCase()).join('')
        : '';
      const author = ((m.authorLast || m.siteName || 'Autor').trim()) + firstInit;
      const typeTag = isImage ? ` [Imagen en Internet]` : ` [Internet]`;
      const urlPart = url ? ` Disponible en: <a href="${escapeAttr(url)}" target="_blank" rel="noopener" style="color: var(--accent-blue-light); text-decoration: none;">${escapeHtml(url)}</a>` : '';
      return `${escapeHtml(author)}. ${escapeHtml(title)}${escapeHtml(typeTag)}. ${escapeHtml(site)}; ${escapeHtml(year)} [citado ${formatAccessDateFull()}].${urlPart}`;
    }

    default:
      return '';
  }
}

function generateInTextCitations(format, m) {
  const authorShort = (m.authorLast || m.siteName || 'Autor').trim();
  const year = (m.year || '').trim() || 's. f.';

  if (format === 'ieee') {
    return { parenthetical: '[1]', narrative: 'Según [1]' };
  }
  if (format === 'vancouver') {
    return { parenthetical: '(1)', narrative: 'Según el autor (1)' };
  }
  if (format === 'mla9') {
    return { parenthetical: `(${authorShort})`, narrative: `${authorShort} señala que...` };
  }
  // APA 7, Harvard, Chicago Autor-Fecha
  return {
    parenthetical: `(${authorShort}, ${year})`,
    narrative: `${authorShort} (${year})`
  };
}

/* ==========================================================================
   4. RENDERIZADO Y SINCRONIZACIÓN DE LA INTERFAZ
   ========================================================================== */
function renderCitations() {
  readInputsToState();

  const outputEl = document.getElementById('citationOutput');
  const formatLabelEl = document.getElementById('activeFormatLabel');
  const parenEl = document.getElementById('intextParenthetical');
  const narraEl = document.getElementById('intextNarrative');

  const formatNames = {
    apa7: 'APA 7ª Edición (Estándar Académico)',
    mla9: 'MLA 9ª Edición (Humanidades)',
    chicago: 'Chicago 17ª Edición',
    harvard: 'Estilo Harvard',
    ieee: 'IEEE (Ingeniería y Ciencias)',
    vancouver: 'Vancouver (Ciencias de la Salud)'
  };

  const suffix = state.sourceType === 'image' ? ' • Imagen / Figura' : ' • Página Web';
  formatLabelEl.textContent = (formatNames[state.activeFormat] || 'APA 7ª Edición') + suffix;

  outputEl.innerHTML = generateCitationHTML(state.activeFormat, state.metadata);

  const intext = generateInTextCitations(state.activeFormat, state.metadata);
  parenEl.textContent = intext.parenthetical;
  narraEl.textContent = intext.narrative;
}

function syncInputsFromState() {
  const m = state.metadata;
  document.getElementById('fieldAuthorLast').value = m.authorLast || '';
  document.getElementById('fieldAuthorFirst').value = m.authorFirst || '';
  document.getElementById('fieldYear').value = m.year || '';
  document.getElementById('fieldMonth').value = m.month || '';
  document.getElementById('fieldDay').value = m.day || '';
  document.getElementById('fieldTitle').value = m.title || '';
  document.getElementById('fieldSite').value = m.siteName || '';
  document.getElementById('fieldImageType').value = m.imageType || 'Fotografía';
}

function readInputsToState() {
  state.metadata.authorLast = document.getElementById('fieldAuthorLast').value;
  state.metadata.authorFirst = document.getElementById('fieldAuthorFirst').value;
  state.metadata.year = document.getElementById('fieldYear').value;
  state.metadata.month = document.getElementById('fieldMonth').value;
  state.metadata.day = document.getElementById('fieldDay').value;
  state.metadata.title = document.getElementById('fieldTitle').value;
  state.metadata.siteName = document.getElementById('fieldSite').value;
  state.metadata.imageType = document.getElementById('fieldImageType').value;
  const rawUrl = document.getElementById('urlInput').value.trim();
  if (rawUrl && !rawUrl.startsWith('Archivo local:')) {
    state.metadata.url = rawUrl;
  }
}

function setSourceMode(mode, shouldRender = true) {
  state.sourceType = mode;
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  const dropzone = document.getElementById('imageDropzone');
  const imgTypeGroup = document.getElementById('imageTypeFieldGroup');
  const urlInput = document.getElementById('urlInput');

  if (mode === 'image') {
    dropzone.classList.add('visible');
    imgTypeGroup.style.display = 'flex';
    urlInput.placeholder = 'Pega el link de la imagen o súbela / pégala con Cmd+V...';
  } else {
    dropzone.classList.remove('visible');
    imgTypeGroup.style.display = 'none';
    urlInput.placeholder = 'Pega aquí el link de la página web o artículo (ej. https://...)...';
  }

  if (shouldRender) renderCitations();
}

function showThumbnail(src) {
  const thumb = document.getElementById('imagePreviewThumb');
  if (!thumb) return;
  thumb.src = src;
  thumb.style.display = 'block';
}

/* ==========================================================================
   5. EJEMPLOS RÁPIDOS Y EVENTOS
   ========================================================================== */
function loadQuickExample(type) {
  const urlInput = document.getElementById('urlInput');
  if (type === 'articulo') {
    setSourceMode('webpage', false);
    urlInput.value = 'https://www.revista.unam.mx/2025/11/inteligencia-artificial-y-educacion';
    state.metadata = {
      authorLast: 'García',
      authorFirst: 'Roberto',
      isCorporateAuthor: false,
      year: '2025',
      month: 'noviembre',
      day: '14',
      title: 'Inteligencia artificial y educación en el siglo XXI',
      siteName: 'Revista Digital Universitaria UNAM',
      url: 'https://www.revista.unam.mx/2025/11/inteligencia-artificial-y-educacion',
      imageType: 'Fotografía',
      accessDate: new Date()
    };
  } else if (type === 'wikipedia') {
    setSourceMode('webpage', false);
    urlInput.value = 'https://es.wikipedia.org/wiki/M%C3%A1quina_de_Atwood';
    state.metadata = {
      authorLast: 'Colaboradores de Wikipedia',
      authorFirst: '',
      isCorporateAuthor: true,
      year: '2026',
      month: 'octubre',
      day: '12',
      title: 'Máquina de Atwood',
      siteName: 'Wikipedia, La enciclopedia libre',
      url: 'https://es.wikipedia.org/wiki/M%C3%A1quina_de_Atwood',
      imageType: 'Fotografía',
      accessDate: new Date()
    };
  } else if (type === 'imagen') {
    setSourceMode('image', false);
    urlInput.value = 'https://images.unsplash.com/photo-nebulosa-orion-2025.jpg';
    state.metadata = {
      authorLast: 'Mendoza',
      authorFirst: 'Elena',
      isCorporateAuthor: false,
      year: '2025',
      month: 'diciembre',
      day: '04',
      title: 'Nebulosa de Orión en espectro profundo',
      siteName: 'Unsplash',
      url: 'https://images.unsplash.com/photo-nebulosa-orion-2025.jpg',
      imageType: 'Fotografía',
      accessDate: new Date()
    };
  }
  syncInputsFromState();
  renderCitations();
}

function handleImageFile(file) {
  if (!file) return;
  setSourceMode('image', false);

  const reader = new FileReader();
  reader.onload = (e) => {
    showThumbnail(e.target.result);
  };
  reader.readAsDataURL(file);

  const cleanName = file.name
    .replace(/\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();

  const fileDate = file.lastModified ? new Date(file.lastModified) : new Date();
  state.metadata.title = cleanName
    ? cleanName.charAt(0).toUpperCase() + cleanName.slice(1)
    : 'Imagen digital sin título';
  state.metadata.year = String(fileDate.getFullYear());
  state.metadata.month = MONTHS_ES[fileDate.getMonth()];
  state.metadata.day = String(fileDate.getDate());
  if (!state.metadata.siteName) state.metadata.siteName = 'Archivo digital';
  if (!state.metadata.authorLast) state.metadata.authorLast = 'Autor';

  document.getElementById('urlInput').value = `Archivo local: ${file.name}`;
  syncInputsFromState();
  renderCitations();
}

function bindEvents() {
  // Cambiar entre Página Web e Imagen
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setSourceMode(btn.dataset.mode);
    });
  });

  // Botón Citar Ahora y Enter en el input
  const urlInput = document.getElementById('urlInput');
  document.getElementById('btnGenerate').addEventListener('click', () => {
    processInputUrl(urlInput.value);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      processInputUrl(urlInput.value);
    }
  });

  // Al pegar un link directamente en el input, procesarlo al instante
  urlInput.addEventListener('paste', (e) => {
    setTimeout(() => {
      processInputUrl(urlInput.value);
    }, 60);
  });

  // Pegar una imagen desde el portapapeles en cualquier parte de la ventana (Cmd+V)
  window.addEventListener('paste', (e) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      const file = e.clipboardData.files[0];
      if (file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    }
  });

  // Subir imagen desde el selector o arrastrando
  const dropzone = document.getElementById('imageDropzone');
  const fileInput = document.getElementById('imageFileInput');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-blue)';
  });
  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = '';
  });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = '';
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  // Botones de formato (APA 7, MLA 9, Chicago, Harvard, IEEE, Vancouver)
  document.querySelectorAll('.format-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFormat = btn.dataset.format;
      renderCitations();
    });
  });

  // Mostrar/ocultar cajón de edición manual de datos
  const drawer = document.getElementById('metadataDrawer');
  const toggleBtn = document.getElementById('btnToggleMetadata');
  toggleBtn.addEventListener('click', () => {
    const isOpen = drawer.classList.toggle('open');
    toggleBtn.innerHTML = isOpen ? '<span>▲</span> Ocultar detalles' : '<span>✎</span> Ajustar datos (autor, fecha, título)';
  });

  // Actualizar cita en tiempo real al editar cualquier campo
  document.querySelectorAll('#metadataDrawer input, #metadataDrawer select').forEach(input => {
    input.addEventListener('input', () => renderCitations());
  });

  // Chips de ejemplos
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => loadQuickExample(chip.dataset.example));
  });

  // Copiar referencia principal
  document.getElementById('btnCopyMain').addEventListener('click', () => {
    const text = document.getElementById('citationOutput').innerText;
    copyTextWithFeedback(text, document.getElementById('btnCopyMain'), '<span>✓</span> ¡Copiada!');
  });

  // Guardar referencia en la lista inferior
  document.getElementById('btnSaveCitation').addEventListener('click', () => {
    const html = document.getElementById('citationOutput').innerHTML;
    const text = document.getElementById('citationOutput').innerText;
    state.savedCitations.unshift({ html, text, format: state.activeFormat.toUpperCase() });
    renderSavedList();
  });

  // Copiar citas en el texto
  document.getElementById('btnCopyParen').addEventListener('click', (e) => {
    copyTextWithFeedback(document.getElementById('intextParenthetical').innerText, e.currentTarget, '✓');
  });
  document.getElementById('btnCopyNarra').addEventListener('click', (e) => {
    copyTextWithFeedback(document.getElementById('intextNarrative').innerText, e.currentTarget, '✓');
  });

  // Copiar toda la bibliografía acumulada
  document.getElementById('btnCopyAllSaved').addEventListener('click', (e) => {
    const allText = state.savedCitations.map(c => c.text).join('\n\n');
    copyTextWithFeedback(allText, e.currentTarget, '✓ Todo copiado');
  });

  // Controles navideños del header
  document.getElementById('btnChime').addEventListener('click', () => {
    playWinterChime();
  });

  document.getElementById('btnToggleSnow').addEventListener('click', (e) => {
    state.snowEnabled = !state.snowEnabled;
    const canvas = document.getElementById('snowCanvas');
    canvas.style.display = state.snowEnabled ? 'block' : 'none';
    e.currentTarget.style.opacity = state.snowEnabled ? '1' : '0.5';
  });
}

function renderSavedList() {
  const section = document.getElementById('savedSection');
  const list = document.getElementById('savedList');
  if (state.savedCitations.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  list.innerHTML = '';

  state.savedCitations.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'saved-item';
    row.innerHTML = `
      <div class="saved-item-text">
        <span style="font-size: 0.7rem; font-weight: 700; color: var(--accent-purple-light); margin-right: 6px;">[${escapeHtml(item.format)}]</span>
        ${item.html}
      </div>
      <button class="mini-copy-btn" data-idx="${idx}">Borrar</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      state.savedCitations.splice(idx, 1);
      renderSavedList();
    });
    list.appendChild(row);
  });
}

function copyTextWithFeedback(text, btn, feedbackHTML) {
  navigator.clipboard.writeText(text).then(() => {
    const prev = btn.innerHTML;
    btn.innerHTML = feedbackHTML;
    setTimeout(() => {
      btn.innerHTML = prev;
    }, 1500);
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '').replace(/"/g, '&quot;');
}
