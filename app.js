// DMC Color Matcher - Fixed Viewport Version
// Proper zoom/pan with color picking

// State
let dmcColors = [];
let currentImage = null;
let imageDataCache = null; // Cached image data for color picking
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

// Click vs Drag detection
let mouseDownX = 0;
let mouseDownY = 0;
let isDragging = false;
const DRAG_THRESHOLD = 5; // pixels moved to consider it a drag

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const canvasSection = document.getElementById('canvasSection');
const imageCanvas = document.getElementById('imageCanvas');
const ctx = imageCanvas.getContext('2d');
const cursor = document.getElementById('cursor');
const sizeButtons = document.getElementById('sizeButtons');
let currentEyedropperSize = 1; // Default 1px
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
const zoomResetBtn = document.getElementById('zoomResetBtn');
const zoomLevel = document.getElementById('zoomLevel');
const minimapContainer = document.getElementById('minimapContainer');
const minimapCanvas = document.getElementById('minimapCanvas');
const minimapCtx = minimapCanvas.getContext('2d');
const minimapViewport = document.getElementById('minimapViewport');

async function init() {
    try {
        const response = await fetch('./dmc_master_data.json');
        const data = await response.json();
        dmcColors = data.colors;
        console.log(`Loaded ${dmcColors.length} DMC colors`);
    } catch (e) {
        console.error('Failed to load DMC data:', e);
    }

    // Initialize state
    resultsSection.style.display = 'none';
    canvasSection.style.display = 'none';
    exportCsvBtn.style.display = 'none';
    if (exportPdfBtn) exportPdfBtn.style.display = 'none';

    // Clear history on reload
    colorHistory = [];
    localStorage.removeItem('dmcHistory');
    renderHistory();

    setupEventListeners();
}

function setupEventListeners() {
    // Upload - input covers entire area, so click is handled natively
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

    const zoomSlider = document.getElementById('zoomSlider');

    // Zoom Slider
    zoomSlider.addEventListener('input', (e) => {
        const newZoom = parseFloat(e.target.value);
        setZoom(newZoom);
    });

    zoomResetBtn.addEventListener('click', () => {
        setZoom(1);
        zoomSlider.value = 1;
        viewportWidth = imageCanvas.width;
        viewportHeight = imageCanvas.height;
        offsetX = 0;
        offsetY = 0;
        render();
    });

    // Eyedropper size buttons
    sizeButtons.addEventListener('click', (e) => {
        if (e.target.classList.contains('size-btn')) {
            // Update active state
            sizeButtons.querySelectorAll('.size-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            // Update size value
            currentEyedropperSize = parseInt(e.target.dataset.size);
        }
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
    findMatchBtn.addEventListener('click', findMatches);
    clearHistoryBtn.addEventListener('click', clearHistory);
    exportCsvBtn.addEventListener('click', exportToCSV);
    if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportToPDF);

    // Minimap click to navigate
    minimapContainer.addEventListener('click', onMinimapClick);
}

function handleImageFile(file) {
    if (!file.type.startsWith('image/')) return;

    // If there's an existing image with history, ask if user wants to clear
    if (currentImage && colorHistory.length > 0) {
        if (confirm('新しい画像を読み込みます。現在の抽出履歴をクリアしますか？')) {
            colorHistory = [];
            localStorage.setItem('dmcHistory', JSON.stringify(colorHistory));
            renderHistory();
        }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            currentImage = img;
            // Cache image data for fast color picking
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(img, 0, 0);
            imageDataCache = tempCtx.getImageData(0, 0, img.width, img.height);

            canvasSection.style.display = 'block';
            resultsSection.style.display = 'none';
            setupViewport();
            pickedColor = null;
            findMatchBtn.disabled = true;
        };
        img.onerror = () => {
            alert('画像の読み込みに失敗しました。別の画像ファイルを試してください。');
            console.error('Failed to load image');
        };
        img.src = e.target.result;
    };
    reader.onerror = () => {
        alert('ファイルの読み込みに失敗しました。');
        console.error('Failed to read file');
    };
    reader.readAsDataURL(file);
}

function setupViewport() {
    const container = imageCanvas.parentElement;
    viewportWidth = container.clientWidth;
    
    // Responsive height based on screen width
    let maxHeight;
    if (window.innerWidth >= 1024) {
        // PC: larger height
        maxHeight = 600;
    } else if (window.innerWidth >= 768) {
        // Tablet: medium height
        maxHeight = 500;
    } else {
        // Mobile: smaller height
        maxHeight = 350;
    }
    viewportHeight = Math.min(maxHeight, viewportWidth * 0.75);

    imageCanvas.width = viewportWidth;
    imageCanvas.height = viewportHeight;

    // Calculate scale to fit image
    const scaleX = viewportWidth / currentImage.width;
    const scaleY = viewportHeight / currentImage.height;
    imageScale = Math.min(scaleX, scaleY, 1);

    // Initialize minimap
    initMinimap();

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
    zoom = Math.max(0.5, Math.min(16, zoom * factor));
    if (centerX !== undefined && centerY !== undefined) {
        offsetX = centerX - (centerX - offsetX) * (zoom / oldZoom);
        offsetY = centerY - (centerY - offsetY) * (zoom / oldZoom);
    }
    clampOffsets();
    render();
    updateZoomDisplay();

    // Sync slider position
    const slider = document.getElementById('zoomSlider');
    if (slider) slider.value = zoom;
}

function updateZoomDisplay() {
    if (zoomLevel) zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
}

function setZoom(newZoom) {
    zoom = newZoom;
    zoomLevel.textContent = `${Math.round(zoom * 100)}%`;

    // Sync slider if it exists and value differs
    const slider = document.getElementById('zoomSlider');
    if (slider && Math.abs(parseFloat(slider.value) - zoom) > 0.01) {
        slider.value = zoom;
    }

    render();
    // Cursor size is updated dynamically in showCursor function
}

function render() {
    if (!currentImage) return;
    ctx.fillStyle = '#d5ccc0';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom * imageScale, zoom * imageScale);
    ctx.drawImage(currentImage, 0, 0);
    ctx.restore();

    // Build DMC color to number mapping (first occurrence gets the number)
    const dmcToNumber = new Map();
    let numberCounter = 1;
    [...colorHistory].reverse().forEach(entry => {
        if (!dmcToNumber.has(entry.dmc_id)) {
            dmcToNumber.set(entry.dmc_id, numberCounter++);
        }
    });

    // Draw Pins (grouped by DMC color number)
    [...colorHistory].reverse().forEach((entry) => {
        if (entry.x === undefined || entry.y === undefined) return;

        const px = (entry.x * zoom * imageScale) + offsetX;
        const py = (entry.y * zoom * imageScale) + offsetY;

        // Check if pin is roughly visible
        if (px < -40 || px > viewportWidth + 40 || py < -40 || py > viewportHeight + 40) return;

        // Get pin number based on DMC color
        const pinNumber = dmcToNumber.get(entry.dmc_id);

        // Label position - offset to top-right
        const labelOffsetX = 20;
        const labelOffsetY = -20;
        const labelX = px + labelOffsetX;
        const labelY = py + labelOffsetY;

        // Draw connecting line
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(labelX, labelY);
        ctx.strokeStyle = 'rgba(107, 83, 68, 0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw small pin marker (dot)
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#6b5344';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw number label
        const labelText = pinNumber.toString();
        const labelWidth = Math.max(16, labelText.length * 8 + 6);

        // Background for number
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.roundRect(labelX - labelWidth / 2, labelY - 8, labelWidth, 16, 3);
        ctx.fill();
        ctx.strokeStyle = '#6b5344';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Number text
        ctx.fillStyle = '#6b5344';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pinNumber, labelX, labelY);
    });

    // Ensure offsets stay within bounds after any transformation
    clampOffsets();
    imageCanvas.style.cursor = isPanning ? 'grabbing' : 'crosshair';

    // Update minimap viewport indicator
    updateMinimapViewport();
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

// Minimap functions
function initMinimap() {
    if (!currentImage) return;

    // Set minimap canvas size (fixed aspect ratio container)
    const containerWidth = 120;
    const containerHeight = 90;
    const imgAspect = currentImage.width / currentImage.height;
    const containerAspect = containerWidth / containerHeight;

    let mapW, mapH;
    if (imgAspect > containerAspect) {
        mapW = containerWidth;
        mapH = containerWidth / imgAspect;
    } else {
        mapH = containerHeight;
        mapW = containerHeight * imgAspect;
    }

    minimapCanvas.width = mapW;
    minimapCanvas.height = mapH;
    minimapCanvas.style.width = mapW + 'px';
    minimapCanvas.style.height = mapH + 'px';

    // Center minimap canvas in container
    minimapCanvas.style.position = 'absolute';
    minimapCanvas.style.left = ((containerWidth - mapW) / 2) + 'px';
    minimapCanvas.style.top = ((containerHeight - mapH) / 2) + 'px';

    // Draw image on minimap
    minimapCtx.drawImage(currentImage, 0, 0, mapW, mapH);

    // Show minimap
    minimapContainer.classList.add('visible');
}

function updateMinimapViewport() {
    if (!currentImage || !minimapCanvas.width) return;

    const mapW = minimapCanvas.width;
    const mapH = minimapCanvas.height;

    // Visible area in image coordinates
    const visibleLeft = -offsetX / (imageScale * zoom);
    const visibleTop = -offsetY / (imageScale * zoom);
    const visibleWidth = viewportWidth / (imageScale * zoom);
    const visibleHeight = viewportHeight / (imageScale * zoom);

    // Convert to minimap coordinates
    const scaleToMinimap = mapW / currentImage.width;

    let vpLeft = visibleLeft * scaleToMinimap;
    let vpTop = visibleTop * scaleToMinimap;
    let vpWidth = visibleWidth * scaleToMinimap;
    let vpHeight = visibleHeight * scaleToMinimap;

    // Clamp to minimap bounds
    vpLeft = Math.max(0, vpLeft);
    vpTop = Math.max(0, vpTop);
    vpWidth = Math.min(mapW - vpLeft, vpWidth);
    vpHeight = Math.min(mapH - vpTop, vpHeight);

    // Position viewport indicator
    const containerWidth = 120;
    const containerHeight = 90;
    const canvasOffsetLeft = (containerWidth - mapW) / 2;
    const canvasOffsetTop = (containerHeight - mapH) / 2;

    minimapViewport.style.left = (canvasOffsetLeft + vpLeft) + 'px';
    minimapViewport.style.top = (canvasOffsetTop + vpTop) + 'px';
    minimapViewport.style.width = vpWidth + 'px';
    minimapViewport.style.height = vpHeight + 'px';

    // Hide viewport indicator if showing entire image
    if (vpWidth >= mapW - 2 && vpHeight >= mapH - 2) {
        minimapViewport.style.display = 'none';
    } else {
        minimapViewport.style.display = 'block';
    }
}

function onMinimapClick(e) {
    if (!currentImage) return;

    const rect = minimapCanvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click to image coordinates
    const imgX = (clickX / minimapCanvas.width) * currentImage.width;
    const imgY = (clickY / minimapCanvas.height) * currentImage.height;

    // Center viewport on clicked position
    offsetX = viewportWidth / 2 - imgX * imageScale * zoom;
    offsetY = viewportHeight / 2 - imgY * imageScale * zoom;

    clampOffsets();
    render();
    updateMinimapViewport();
}

// Mouse Events
function onMouseDown(e) {
    const rect = imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Record start position for click vs drag detection
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    isDragging = false;

    // Always prepare for potential pan
    panStartX = e.clientX;
    panStartY = e.clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;

    // Check pin click first (immediate feedback)
    if (checkPinClick(x, y)) return;
}

function onMouseMove(e) {
    const rect = imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if mouse button is pressed (dragging)
    if (e.buttons === 1) {
        e.preventDefault(); // Prevent page scrolling during drag
        const dx = e.clientX - mouseDownX;
        const dy = e.clientY - mouseDownY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If moved beyond threshold, it's a drag (pan)
        if (distance > DRAG_THRESHOLD) {
            // First time entering drag mode - reset pan start to current position
            if (!isDragging) {
                isDragging = true;
                isPanning = true;
                panStartX = e.clientX;
                panStartY = e.clientY;
                startOffsetX = offsetX;
                startOffsetY = offsetY;
                imageCanvas.style.cursor = 'grabbing';
            }
            // Update offset based on movement from drag start
            offsetX = startOffsetX + (e.clientX - panStartX);
            offsetY = startOffsetY + (e.clientY - panStartY);
            clampOffsets();
            render();
        }
    } else {
        // Mouse not pressed - show cursor preview
        showCursor(x, y);
    }
}

function onMouseUp(e) {
    const rect = imageCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // If it was a click (not a drag), pick color
    if (!isDragging) {
        pickColor(x, y);
    }

    isPanning = false;
    isDragging = false;
    imageCanvas.style.cursor = 'crosshair';
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
let touchStartX = 0;
let touchStartY = 0;
let isTouchDragging = false;

function onTouchStart(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        touchStartDist = getTouchDist(e.touches);
        touchStartZoom = zoom;
        isTouchDragging = true;
    } else if (e.touches.length === 1) {
        const rect = imageCanvas.getBoundingClientRect();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isTouchDragging = false;

        // Prepare for potential pan
        panStartX = e.touches[0].clientX;
        panStartY = e.touches[0].clientY;
        startOffsetX = offsetX;
        startOffsetY = offsetY;
    }
}

function onTouchMove(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = getTouchDist(e.touches);
        zoom = Math.max(0.5, Math.min(16, touchStartZoom * (dist / touchStartDist)));
        clampOffsets();
        render();
        updateZoomDisplay();
        // Sync slider position
        const slider = document.getElementById('zoomSlider');
        if (slider) slider.value = zoom;
    } else if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // If moved beyond threshold, it's a drag (pan)
        if (distance > DRAG_THRESHOLD) {
            e.preventDefault(); // Prevent page scrolling during drag
            if (!isTouchDragging) {
                isTouchDragging = true;
                isPanning = true;
                panStartX = e.touches[0].clientX;
                panStartY = e.touches[0].clientY;
                startOffsetX = offsetX;
                startOffsetY = offsetY;
            }
            offsetX = startOffsetX + (e.touches[0].clientX - panStartX);
            offsetY = startOffsetY + (e.touches[0].clientY - panStartY);
            clampOffsets();
            render();
        }
    }
}

function onTouchEnd(e) {
    // If it was a tap (not a drag), pick color
    if (!isTouchDragging && e.changedTouches.length === 1) {
        const rect = imageCanvas.getBoundingClientRect();
        const x = e.changedTouches[0].clientX - rect.left;
        const y = e.changedTouches[0].clientY - rect.top;
        pickColor(x, y);
    }
    isPanning = false;
    isTouchDragging = false;
}

function getTouchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

// Cursor preview
function showCursor(x, y) {
    const size = currentEyedropperSize;
    // Calculate actual pixel size on screen based on zoom
    const actualSize = size * zoom * imageScale;
    // Minimum display size varies by pixel size for visibility
    const minSize = 8 + (size * 4); // 1px->12, 2px->16, 3px->20, 5px->28
    const displaySize = Math.max(actualSize, minSize);
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
    const size = currentEyedropperSize;
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

// Get color from cached image data (fast)
function getColorAt(canvasX, canvasY, size) {
    if (!currentImage || !imageDataCache) return null;
    const imgCoords = canvasToImage(canvasX, canvasY);
    const imgX = Math.round(imgCoords.x);
    const imgY = Math.round(imgCoords.y);
    if (imgX < 0 || imgX >= currentImage.width || imgY < 0 || imgY >= currentImage.height) {
        return null;
    }

    const halfSize = Math.floor(size / 2);
    const startX = Math.max(0, imgX - halfSize);
    const startY = Math.max(0, imgY - halfSize);
    const endX = Math.min(currentImage.width, imgX + halfSize + 1);
    const endY = Math.min(currentImage.height, imgY + halfSize + 1);

    const data = imageDataCache.data;
    const width = currentImage.width;
    let r = 0, g = 0, b = 0, count = 0;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const idx = (y * width + x) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
        }
    }

    if (count === 0) return null;
    r = Math.round(r / count);
    g = Math.round(g / count);
    b = Math.round(b / count);
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { r, g, b, hex };
}


// Check if a pin or its label was clicked
function checkPinClick(clickX, clickY) {
    // Check in reverse order (newest first)
    for (let i = colorHistory.length - 1; i >= 0; i--) {
        const entry = colorHistory[i];
        if (entry.x === undefined || entry.y === undefined) continue;

        const px = (entry.x * zoom * imageScale) + offsetX;
        const py = (entry.y * zoom * imageScale) + offsetY;

        // Check pin dot (radius 3 + margin)
        const dx = clickX - px;
        const dy = clickY - py;
        if (dx * dx + dy * dy <= 64) { // radius 8
            highlightHistoryItem(entry.id);
            return true;
        }

        // Check label area (offset to top-right)
        const labelX = px + 20;
        const labelY = py - 20;
        const labelDx = clickX - labelX;
        const labelDy = clickY - labelY;
        if (Math.abs(labelDx) <= 12 && Math.abs(labelDy) <= 12) {
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
    const matches = ColorMatcher.findClosestDMC(targetLab, dmcColors, 3);
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
    if (!window.currentMatches || !window.currentMatches[index]) {
        console.error('Invalid match index:', index);
        return;
    }
    const match = window.currentMatches[index];
    document.querySelectorAll('.match-item').forEach((el, i) => {
        el.classList.toggle('selected', i === index);
    });
    addToHistory(match);
}

// Make selectMatch available globally for onclick handlers
window.selectMatch = selectMatch;

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
    const historySection = document.getElementById('historySection');

    if (colorHistory.length === 0) {
        historyList.innerHTML = '<p class="empty-message">まだ履歴がありません</p>';
        historySection.style.display = 'none'; // Hide section when empty
        exportCsvBtn.style.display = 'none';
        if (exportPdfBtn) exportPdfBtn.style.display = 'none';
        return;
    }

    // Show section when there are items
    historySection.style.display = 'block';

    exportCsvBtn.style.display = 'block';
    if (exportPdfBtn) {
        exportPdfBtn.style.display = 'block';
    }

    // Build DMC color to number mapping (same logic as render)
    const dmcToNumber = new Map();
    let numberCounter = 1;
    [...colorHistory].reverse().forEach(entry => {
        if (!dmcToNumber.has(entry.dmc_id)) {
            dmcToNumber.set(entry.dmc_id, numberCounter++);
        }
    });

    historyList.innerHTML = colorHistory.map(entry => {
        const pinNumber = dmcToNumber.get(entry.dmc_id);
        return `
    <div class="history-item">
      <div class="pin-number">${pinNumber}</div>
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
  `;
    }).join('');
}

function deleteHistoryItem(id) {
    colorHistory = colorHistory.filter(e => e.id !== id);
    localStorage.setItem('dmcHistory', JSON.stringify(colorHistory));
    render();
    renderHistory();
}

// Make deleteHistoryItem available globally for onclick handlers
window.deleteHistoryItem = deleteHistoryItem;

function clearHistory() {
    if (colorHistory.length === 0) {
        alert('クリアする履歴がありません');
        return;
    }
    if (confirm('履歴をすべて削除しますか？')) {
        colorHistory = [];
        localStorage.setItem('dmcHistory', JSON.stringify(colorHistory));

        // Hide results section and reset picked color
        resultsSection.style.display = 'none';
        pickedColor = null;
        findMatchBtn.disabled = true;
        colorSwatch.style.backgroundColor = '';
        rgbValue.textContent = 'RGB: -';
        hexValue.textContent = 'HEX: -';

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

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `dmc_colors_${dateStr}.csv`;

        // Add BOM for Excel compatibility and create Blob
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });

        // Use FileSaver.js for reliable download
        if (window.saveAs) {
            window.saveAs(blob, filename);
        } else {
            // Fallback just in case library fails to load
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            setTimeout(() => document.body.removeChild(link), 100);
        }

        console.log('Download initiated via FileSaver.js');

    } catch (e) {
        console.error('CSV Export Failed:', e);
        alert('CSV出力に失敗しました:\n' + e.message);
    }
}

function exportToPDF() {
    try {
        console.log('Starting PDF Export...');
        if (!window.jspdf) {
            throw new Error('PDFライブラリが読み込まれていません。ページを再読み込みしてください。');
        }
        if (!currentImage) {
            throw new Error('画像が読み込まれていません。');
        }
        if (colorHistory.length === 0) {
            throw new Error('抽出履歴がありません。');
        }

        const { jsPDF } = window.jspdf;

        // ===== Calculate bounding box of all pins =====
        const pinsWithCoords = colorHistory.filter(e => e.x !== undefined && e.y !== undefined);
        if (pinsWithCoords.length === 0) {
            throw new Error('ピンの位置情報がありません。');
        }

        // Find min/max coordinates
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        pinsWithCoords.forEach(pin => {
            minX = Math.min(minX, pin.x);
            minY = Math.min(minY, pin.y);
            maxX = Math.max(maxX, pin.x);
            maxY = Math.max(maxY, pin.y);
        });

        // Add margin around pins (50px or 10% of dimension, whichever is larger)
        const pinMarginX = Math.max(50, (maxX - minX) * 0.1);
        const pinMarginY = Math.max(50, (maxY - minY) * 0.1);

        // Clamp to image bounds
        const cropX = Math.max(0, Math.floor(minX - pinMarginX));
        const cropY = Math.max(0, Math.floor(minY - pinMarginY));
        const cropX2 = Math.min(currentImage.width, Math.ceil(maxX + pinMarginX));
        const cropY2 = Math.min(currentImage.height, Math.ceil(maxY + pinMarginY));
        const cropW = cropX2 - cropX;
        const cropH = cropY2 - cropY;

        // Create offscreen canvas for cropped image with pins
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropW;
        cropCanvas.height = cropH;
        const cropCtx = cropCanvas.getContext('2d');

        // Draw cropped portion of original image
        cropCtx.drawImage(currentImage, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // Build DMC color to number mapping
        const dmcToNumber = new Map();
        let numberCounter = 1;
        [...colorHistory].reverse().forEach(entry => {
            if (!dmcToNumber.has(entry.dmc_id)) {
                dmcToNumber.set(entry.dmc_id, numberCounter++);
            }
        });

        // Draw pins on cropped canvas
        [...colorHistory].reverse().forEach((entry) => {
            if (entry.x === undefined || entry.y === undefined) return;

            // Adjust pin position relative to crop area
            const px = entry.x - cropX;
            const py = entry.y - cropY;

            // Get pin number based on DMC color
            const pinNumber = dmcToNumber.get(entry.dmc_id);

            // Label position - offset to top-right
            const labelOffsetX = 25;
            const labelOffsetY = -25;
            const labelX = px + labelOffsetX;
            const labelY = py + labelOffsetY;

            // Draw connecting line
            cropCtx.beginPath();
            cropCtx.moveTo(px, py);
            cropCtx.lineTo(labelX, labelY);
            cropCtx.strokeStyle = 'rgba(107, 83, 68, 0.7)';
            cropCtx.lineWidth = 1;
            cropCtx.stroke();

            // Draw small pin marker (dot)
            cropCtx.beginPath();
            cropCtx.arc(px, py, 4, 0, Math.PI * 2);
            cropCtx.fillStyle = '#6b5344';
            cropCtx.fill();
            cropCtx.strokeStyle = 'white';
            cropCtx.lineWidth = 2;
            cropCtx.stroke();

            // Draw number label
            const labelText = pinNumber.toString();
            const labelWidth = Math.max(18, labelText.length * 9 + 8);

            // Background for number
            cropCtx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            cropCtx.beginPath();
            cropCtx.roundRect(labelX - labelWidth / 2, labelY - 9, labelWidth, 18, 3);
            cropCtx.fill();
            cropCtx.strokeStyle = '#6b5344';
            cropCtx.lineWidth = 1;
            cropCtx.stroke();

            // Number text
            cropCtx.fillStyle = '#6b5344';
            cropCtx.font = 'bold 12px sans-serif';
            cropCtx.textAlign = 'center';
            cropCtx.textBaseline = 'middle';
            cropCtx.fillText(pinNumber, labelX, labelY);
        });

        // Determine orientation based on cropped area aspect ratio
        const cropAspect = cropW / cropH;
        const isLandscape = cropAspect > 1;
        const orientation = isLandscape ? 'l' : 'p';

        const doc = new jsPDF(orientation);

        // ===== PAGE 1: Cropped Image with Pins =====

        // A4 dimensions depend on orientation
        const pageWidth = isLandscape ? 297 : 210;
        const pageHeight = isLandscape ? 210 : 297;

        // Small title at top
        doc.setFontSize(14);
        doc.text('DMC Color Matcher Report', 10, 12);
        doc.setFontSize(9);
        doc.text(`Date: ${new Date().toISOString().slice(0, 10)}`, 10, 18);

        // Get cropped canvas as image
        const croppedDataUrl = cropCanvas.toDataURL('image/jpeg', 0.95);

        // Use almost full page for image (with small margins)
        const margin = 10;
        const availableWidth = pageWidth - (margin * 2);
        const availableHeight = pageHeight - 30 - margin; // 30mm for header

        // Calculate image dimensions to fit while maintaining aspect ratio
        let imgWidth, imgHeight;

        if (cropAspect > availableWidth / availableHeight) {
            // Image is wider - fit to width
            imgWidth = availableWidth;
            imgHeight = imgWidth / cropAspect;
        } else {
            // Image is taller - fit to height
            imgHeight = availableHeight;
            imgWidth = imgHeight * cropAspect;
        }

        // Center the image horizontally
        const imgX = (pageWidth - imgWidth) / 2;
        const imgY = 25; // Start after header

        doc.addImage(croppedDataUrl, 'JPEG', imgX, imgY, imgWidth, imgHeight);

        // ===== PAGE 2: Color Table (portrait) =====
        doc.addPage('p');

        // Page 2 title
        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text('DMC Color List', 14, 20);

        // Prepare table data - group by DMC color
        const tableColumn = ["No.", "", "DMC", "Color Name", "DMC Hex", "Picked Hex", "ΔE"];

        // Group entries by DMC color and get unique entries
        const uniqueDmcEntries = [];
        const seenDmc = new Set();
        [...colorHistory].reverse().forEach(item => {
            if (!seenDmc.has(item.dmc_id)) {
                seenDmc.add(item.dmc_id);
                uniqueDmcEntries.push(item);
            }
        });

        const tableRows = uniqueDmcEntries.map((item, index) => {
            const pinNumber = index + 1;
            return [
                pinNumber.toString(),
                '', // Placeholder for color swatch
                item.dmc_id,
                item.name_en,
                item.hex,
                item.picked_hex,
                item.deltaE.toFixed(2)
            ];
        });

        // Calculate table width to fill page (with margins)
        const tableMargin = 14;
        const tableWidth = 210 - (tableMargin * 2); // 182mm (A4 portrait width)

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 28,
            margin: { left: tableMargin, right: tableMargin },
            tableWidth: tableWidth,
            theme: 'grid',
            styles: {
                fontSize: 10,
                cellPadding: 4
            },
            headStyles: {
                fillColor: [107, 83, 68],
                fontSize: 11,
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' }, // Pin
                1: { cellWidth: 20 }, // Color swatch
                2: { cellWidth: 25 }, // DMC
                3: { cellWidth: 'auto' }, // Color Name (auto-fill remaining space)
                4: { cellWidth: 28 }, // DMC Hex
                5: { cellWidth: 28 }, // Picked Hex
                6: { cellWidth: 20, halign: 'center' } // ΔE
            },
            didDrawCell: function (data) {
                // Draw color swatches in column 1 (index 1)
                if (data.column.index === 1 && data.section === 'body') {
                    const rowIndex = data.row.index;
                    const item = uniqueDmcEntries[rowIndex];

                    // Draw picked color swatch (left half)
                    const hex1 = item.picked_hex;
                    const rgb1 = hexToRgb(hex1);
                    doc.setFillColor(rgb1.r, rgb1.g, rgb1.b);
                    doc.rect(data.cell.x + 1, data.cell.y + 1, 6, data.cell.height - 2, 'F');

                    // Draw DMC color swatch (right half)
                    const hex2 = item.hex;
                    const rgb2 = hexToRgb(hex2);
                    doc.setFillColor(rgb2.r, rgb2.g, rgb2.b);
                    doc.rect(data.cell.x + 8, data.cell.y + 1, 6, data.cell.height - 2, 'F');
                }
            }
        });

        // Add Delta E explanation note at the bottom
        const finalY = doc.lastAutoTable.finalY || 50;
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('* Delta E (ΔE): Color difference value.', 10, finalY + 10);
        doc.text('  0-2 = Almost identical,  2-5 = Close match,  5-10 = Slightly different,  10+ = Clearly different', 10, finalY + 15);

        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const filename = `dmc_report_${dateStr}.pdf`;

        console.log('PDF Generated. Saving as:', filename);

        doc.save(filename);

        console.log('PDF download initiated via doc.save().');

    } catch (e) {
        console.error('PDF Export Failed:', e);
        alert('PDF出力に失敗しました:\n' + e.message);
    }
}

// Helper function to convert hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

init();
