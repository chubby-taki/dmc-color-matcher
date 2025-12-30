// DMC Color Matcher - Fixed Viewport Version
// Proper zoom/pan with color picking

// State
let dmcColors = [];
let currentImage = null;
let pickedColor = null;
let pickedX = 0;
let pickedY = 0;
let colorHistory = [];

// Viewport state - fixed canvas size, image moves within
let viewportWidth = 0;
let viewportHeight = 0;
let imageScale = 1;  // Scale to fit image in viewport
let zoom = 1;
let offsetX = 0;
let offsetY = 0;

// Interaction state
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let startOffsetX = 0;
let startOffsetY = 0;
let isEyedropperMode = true;

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const canvasSection = document.getElementById('canvasSection');
const imageCanvas = document.getElementById('imageCanvas');
const ctx = imageCanvas.getContext('2d');
const cursor = document.getElementById('cursor');
const eyedropperSize = document.getElementById('eyedropperSize');
const sizeValue = document.getElementById('sizeValue');
const colorSwatch = document.getElementById('colorSwatch');
const rgbValue = document.getElementById('rgbValue');
const hexValue = document.getElementById('hexValue');
const findMatchBtn = document.getElementById('findMatchBtn');
const resultsSection = document.getElementById('resultsSection');
const matchList = document.getElementById('matchList');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomLevel = document.getElementById('zoomLevel');
const modeToggleBtn = document.getElementById('modeToggleBtn');

async function init() {
    try {
        const response = await fetch('./dmc_master_data.json');
        const data = await response.json();
        dmcColors = data.colors;
        console.log(`Loaded ${dmcColors.length} DMC colors`);
    } catch (e) {
        console.error('Failed to load DMC data:', e);
    }

    const savedHistory = localStorage.getItem('dmcHistory');
    if (savedHistory) {
        colorHistory = JSON.parse(savedHistory);
        renderHistory();
    }

    setupEventListeners();
}

function setupEventListeners() {
    // Upload
    uploadArea.addEventListener('click', () => imageInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]);
    });
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleImageFile(e.target.files[0]);
    });

    eyedropperSize.addEventListener('input', (e) => {
        sizeValue.textContent = `${e.target.value}x${e.target.value}`;
    });

    // Canvas events
    imageCanvas.addEventListener('mousedown', onMouseDown);
    imageCanvas.addEventListener('mousemove', onMouseMove);
    imageCanvas.addEventListener('mouseup', onMouseUp);
    imageCanvas.addEventListener('mouseleave', onMouseLeave);
    imageCanvas.addEventListener('wheel', onWheel, { passive: false });

    // Touch
    imageCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
    imageCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
    imageCanvas.addEventListener('touchend', onTouchEnd);

    // Buttons
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => applyZoom(1.5));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => applyZoom(1 / 1.5));
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', resetView);
    if (modeToggleBtn) modeToggleBtn.addEventListener('click', toggleMode);

    findMatchBtn.addEventListener('click', findMatches);
    clearHistoryBtn.addEventListener('click', clearHistory);
    exportCsvBtn.addEventListener('click', exportToCSV);
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPDF);
}

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            canvasSection.style.display = 'block';
            resultsSection.style.display = 'none';
            setupViewport();
            pickedColor = null;
            findMatchBtn.disabled = true;
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function setupViewport() {
    const container = imageCanvas.parentElement;
    viewportWidth = container.clientWidth;
    viewportHeight = Math.min(400, viewportWidth * 0.75);

    imageCanvas.width = viewportWidth;
    imageCanvas.height = viewportHeight;

    // Calculate scale to fit image
    const scaleX = viewportWidth / currentImage.width;
    const scaleY = viewportHeight / currentImage.height;
    imageScale = Math.min(scaleX, scaleY, 1);

    resetView();
}

function resetView() {
    zoom = 1;
    const scaledW = currentImage.width * imageScale;
    const scaledH = currentImage.height * imageScale;
    offsetX = (viewportWidth - scaledW) / 2;
    offsetY = (viewportHeight - scaledH) / 2;
    clampOffsets();
    render();
    updateZoomDisplay();
}

function applyZoom(factor, centerX, centerY) {
    const oldZoom = zoom;
    zoom = Math.max(0.5, Math.min(8, zoom * factor));
    if (centerX !== undefined && centerY !== undefined) {
        offsetX = centerX - (centerX - offsetX) * (zoom / oldZoom);
        offsetY = centerY - (centerY - offsetY) * (zoom / oldZoom);
    }
    clampOffsets();
    render();
    updateZoomDisplay();
}

function updateZoomDisplay() {
    if (zoomLevel) zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}

function toggleMode() {
    isEyedropperMode = !isEyedropperMode;
    if (modeToggleBtn) {
        modeToggleBtn.textContent = isEyedropperMode ? '🔍 スポイト' : '✋ パン';
        modeToggleBtn.classList.toggle('pan-mode', !isEyedropperMode);
    }
    imageCanvas.style.cursor = isEyedropperMode ? 'crosshair' : 'grab';
}

function render() {
    if (!currentImage) return;
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom * imageScale, zoom * imageScale);
    ctx.drawImage(currentImage, 0, 0);
    ctx.restore();

    // Draw Pins (newest on top, numbered from oldest=1 to newest=N)
    [...colorHistory].reverse().forEach((entry, reversedIndex) => {
        if (entry.x === undefined || entry.y === undefined) return;

        const px = (entry.x * zoom * imageScale) + offsetX;
        const py = (entry.y * zoom * imageScale) + offsetY;

        // Check if pin is roughly visible
        if (px < -20 || px > viewportWidth + 20 || py < -20 || py > viewportHeight + 20) return;

        // Draw Pin (White circle with number)
        ctx.beginPath();
        ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fill();
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Pin number: oldest=1, newest=N
        const pinNumber = colorHistory.length - reversedIndex;
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pinNumber, px, py);
    });

    // Ensure offsets stay within bounds after any transformation
    clampOffsets();
    imageCanvas.style.cursor = isEyedropperMode ? 'crosshair' : (isPanning ? 'grabbing' : 'grab');
}

// Helper to keep image within viewport bounds
function clampOffsets() {
    if (!currentImage) return;
    const scaledW = currentImage.width * imageScale * zoom;
    const scaledH = currentImage.height * imageScale * zoom;
    // Horizontal bounds
    if (scaledW <= viewportWidth) {
        offsetX = (viewportWidth - scaledW) / 2;
    } else {
        const minX = viewportWidth - scaledW; // negative
        if (offsetX > 0) offsetX = 0;
        if (offsetX < minX) offsetX = minX;
    }
    // Vertical bounds
    if (scaledH <= viewportHeight) {
        offsetY = (viewportHeight - scaledH) / 2;
    } else {
        const minY = viewportHeight - scaledH;
        if (offsetY > 0) offsetY = 0;
        if (offsetY < minY) offsetY = minY;
    }
}

// Convert canvas coordinates to image coordinates
function canvasToImage(canvasX, canvasY) {
    const imgX = (canvasX - offsetX) / (zoom * imageScale);
    const imgY = (canvasY - offsetY) / (zoom * imageScale);
    return { x: imgX, y: imgY };
}

// Mouse Events
function onMouseDown(e) {
    const rect = imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!isEyedropperMode || e.shiftKey) {
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
        imageCanvas.style.cursor = 'grabbing';
    } else {
        // Check pin click first
        if (checkPinClick(x, y)) return;
        pickColor(x, y);
    }
}

function onMouseMove(e) {
    const rect = imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (isPanning) {
        offsetX = startOffsetX + (e.clientX - panStartX);
        offsetY = startOffsetY + (e.clientY - panStartY);
        clampOffsets();
        render();
    } else if (isEyedropperMode) {
        showCursor(x, y);
    }
}

function onMouseUp() {
    isPanning = false;
    imageCanvas.style.cursor = isEyedropperMode ? 'crosshair' : 'grab';
}

function onMouseLeave() {
    isPanning = false;
    cursor.style.display = 'none';
}

function onWheel(e) {
    e.preventDefault();
    const rect = imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    applyZoom(factor, x, y);
}

// Touch Events
let touchStartDist = 0;
let touchStartZoom = 1;

function onTouchStart(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        touchStartDist = getTouchDist(e.touches);
        touchStartZoom = zoom;
    } else if (e.touches.length === 1) {
        const rect = imageCanvas.getBoundingClientRect();
        const x = e.touches[0].clientX - rect.left;
        const y = e.touches[0].clientY - rect.top;
        if (!isEyedropperMode) {
            isPanning = true;
            panStartX = e.touches[0].clientX;
            panStartY = e.touches[0].clientY;
            startOffsetX = offsetX;
            startOffsetY = offsetY;
        } else {
            pickColor(x, y);
        }
    }
}

function onTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        zoom = Math.max(0.5, Math.min(8, touchStartZoom * (dist / touchStartDist)));
        clampOffsets();
        render();
        updateZoomDisplay();
    } else if (e.touches.length === 1 && isPanning) {
        offsetX = startOffsetX + (e.touches[0].clientX - panStartX);
        offsetY = startOffsetY + (e.touches[0].clientY - panStartY);
        clampOffsets();
        render();
    }
}

function onTouchEnd() {
    isPanning = false;
}

function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Cursor preview
function showCursor(x, y) {
    const size = parseInt(eyedropperSize.value);
    const displaySize = Math.max(size * zoom * imageScale, 10);
    cursor.style.display = 'block';
    cursor.style.width = `${displaySize}px`;
    cursor.style.height = `${displaySize}px`;
    cursor.style.left = `${x - displaySize / 2}px`;
    cursor.style.top = `${y - displaySize / 2}px`;
    const color = getColorAt(x, y, size);
    if (color) {
        cursor.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
    }
}

// Pick color at canvas position
function pickColor(canvasX, canvasY) {
    const size = parseInt(eyedropperSize.value);
    const color = getColorAt(canvasX, canvasY, size);
    if (color) {
        const imgCoords = canvasToImage(canvasX, canvasY);
        pickedX = Math.round(imgCoords.x);
        pickedY = Math.round(imgCoords.y);
        pickedColor = color;
        colorSwatch.style.backgroundColor = `rgb(${color.r}, ${color.g}, ${color.b})`;
        rgbValue.textContent = `RGB: ${color.r}, ${color.g}, ${color.b}`;
        hexValue.textContent = `HEX: ${color.hex}`;
        findMatchBtn.disabled = false;
    }
}

// Get color from original image
function getColorAt(canvasX, canvasY, size) {
    if (!currentImage) return null;
    const imgCoords = canvasToImage(canvasX, canvasY);
    const imgX = Math.round(imgCoords.x);
    const imgY = Math.round(imgCoords.y);
    if (imgX < 0 || imgX >= currentImage.width || imgY < 0 || imgY >= currentImage.height) {
        return null;
    }
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentImage.width;
    tempCanvas.height = currentImage.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(currentImage, 0, 0);
    const halfSize = Math.floor(size / 2);
    const startX = Math.max(0, imgX - halfSize);
    const startY = Math.max(0, imgY - halfSize);
    const endX = Math.min(currentImage.width, imgX + halfSize + 1);
    const endY = Math.min(currentImage.height, imgY + halfSize + 1);
    try {
        const imageData = tempCtx.getImageData(startX, startY, endX - startX, endY - startY);
        const data = imageData.data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            count++;
        }
        if (count === 0) return null;
        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);
        const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
        return { r, g, b, hex };
    } catch (e) {
        return null;
    }
}


// Check if a pin was clicked
function checkPinClick(clickX, clickY) {
    // Check in standard order (Newest first). Since newest are drawn on top, checking newest first is correct for z-order hit testing.
    for (const entry of colorHistory) {
        if (entry.x === undefined || entry.y === undefined) continue;

        const px = (entry.x * zoom * imageScale) + offsetX;
        const py = (entry.y * zoom * imageScale) + offsetY;

        // Pin radius is 10, give a bit of leeway (12)
        const dx = clickX - px;
        const dy = clickY - py;
        if (dx * dx + dy * dy <= 144) {
            highlightHistoryItem(entry.id);
            return true;
        }
    }
    return false;
}

function highlightHistoryItem(id) {
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('highlight'));
    // Find index in DOM
    const index = colorHistory.findIndex(e => e.id === id);
    if (index !== -1 && historyList.children[index]) {
        const item = historyList.children[index];
        item.classList.add('highlight');
        item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Find DMC matches
function findMatches() {
    if (!pickedColor || dmcColors.length === 0) return;
    const targetLab = ColorMatcher.rgbToLab(pickedColor.r, pickedColor.g, pickedColor.b);
    const matches = ColorMatcher.findClosestDMC(targetLab, dmcColors, 5);
    matchList.innerHTML = matches.map((match, i) => {
        const quality = ColorMatcher.getMatchQuality(match.deltaE);
        return `
      <div class="match-item" onclick="selectMatch(${i})">
        <div class="match-swatch" style="background-color: ${match.hex}"></div>
        <div class="match-info">
          <div class="dmc-number">DMC ${match.dmc_id}</div>
          <div class="dmc-name">${match.name_en}</div>
        </div>
        <div class="match-score">
          <div class="delta-e">ΔE: ${match.deltaE.toFixed(2)}</div>
          <div class="score-bar">
            <div class="score-fill ${quality.class}" style="width: ${quality.percent}%"></div>
          </div>
        </div>
      </div>
    `;
    }).join('');
    window.currentMatches = matches;
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function selectMatch(index) {
    const match = window.currentMatches[index];
    document.querySelectorAll('.match-item').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });
    addToHistory(match);
}

function addToHistory(match) {
    const entry = {
        id: Date.now(),
        dmc_id: match.dmc_id,
        name_en: match.name_en,
        hex: match.hex,
        rgb: match.rgb,
        picked_hex: pickedColor.hex,
        picked_rgb: [pickedColor.r, pickedColor.g, pickedColor.b],
        deltaE: match.deltaE,
        x: pickedX,
        y: pickedY,
        timestamp: new Date().toISOString()
    };
    colorHistory.unshift(entry);
    localStorage.setItem('dmcHistory', JSON.stringify(colorHistory));
    render();
    renderHistory();
}

function renderHistory() {
    if (colorHistory.length === 0) {
        historyList.innerHTML = '<p class="empty-message">まだ履歴がありません</p>';
        exportCsvBtn.style.display = 'none';
        if (exportPdfBtn) exportPdfBtn.style.display = 'none';
        return;
    }
    exportCsvBtn.style.display = 'block';
    if (exportPdfBtn) {
        exportPdfBtn.style.display = 'block';
    }
    historyList.innerHTML = colorHistory.map(entry => `
    <div class="history-item">
      <div class="history-swatches">
        <div class="swatch" style="background-color: ${entry.picked_hex}"></div>
        <div class="swatch" style="background-color: ${entry.hex}"></div>
      </div>
      <div class="info">
        <div class="dmc-id">DMC ${entry.dmc_id}</div>
        <div class="details">${entry.name_en} • ΔE: ${entry.deltaE.toFixed(2)}</div>
      </div>
      <button class="delete-btn" onclick="deleteHistoryItem(${entry.id})">×</button>
    </div>
  `).join('');
}

function deleteHistoryItem(id) {
    colorHistory = colorHistory.filter(e => e.id !== id);
    localStorage.setItem('dmcHistory', JSON.stringify(colorHistory));
    render();
    renderHistory();
}

function clearHistory() {
    if (confirm('履歴をすべて削除しますか？')) {
        colorHistory = [];
        localStorage.setItem('dmcHistory', JSON.stringify(colorHistory));
        render();
        renderHistory();
    }
}

function exportToCSV() {
    try {
        console.log('Starting CSV Export...');
        const headers = ['DMC番号', '色名', 'DMC HEX', 'DMC RGB', '抽出色 HEX', '抽出色 RGB', 'ΔE', '日時'];
        const rows = colorHistory.map(e => [
            e.dmc_id, e.name_en, e.hex, e.rgb.join(' '),
            e.picked_hex, e.picked_rgb.join(' '), e.deltaE.toFixed(2),
            new Date(e.timestamp).toLocaleString('ja-JP')
        ]);
        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        console.log('CSV Data Generated:', csvContent.length, 'bytes');

        // Use Data URI method (often more robust than Blobs for local files)
        // Add BOM for Excel compatibility
        const BOM = '\uFEFF';
        const encodedUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(BOM + csvContent);

        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `dmc_colors_${dateStr}.csv`;

        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', filename);
        document.body.appendChild(link);

        console.log('Clicking download link...');
        link.click();
        document.body.removeChild(link);
        console.log('Download initiated.');

    } catch (e) {
        console.error('CSV Export Failed:', e);
        alert('CSV出力に失敗しました:\n' + e.message);
    }
}

async function exportToPDF() {
    try {
        console.log('Starting PDF Export...');
        if (!window.jspdf) {
            throw new Error('PDFライブラリが読み込まれていません。ページを再読み込みしてください。');
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(18);
        doc.text('DMC Color Matcher Report', 14, 22);

        doc.setFontSize(11);
        doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, 14, 30);

        const tableColumn = ["DMC No.", "Color Name", "DMC Hex", "Picked Hex", "Delta E"];
        const tableRows = colorHistory.map(item => [
            item.dmc_id,
            item.name_en,
            item.hex,
            item.picked_hex,
            item.deltaE.toFixed(2)
        ]);

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 40,
            theme: 'grid',
            styles: { fontSize: 10 },
            headStyles: { fillColor: [44, 62, 80] }
        });

        const dateStr = new Date().toISOString().slice(0, 10);
        const filename = `dmc_report_${dateStr}.pdf`;

        console.log('PDF Generated. Saving via jsPDF.save()...');

        // Revert to native library method which handles browser quirks better
        doc.save(filename);

    } catch (e) {
        console.error('PDF Export Failed:', e);
        alert('PDF出力に失敗しました:\n' + e.message);
    }
}

init();
