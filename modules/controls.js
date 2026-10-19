/* Eventos de la interfaz, colores, archivos y vista del lienzo.
 * Conecta botones y campos de index.html con las funciones del editor.
 */
// Un solo punto de entrada para el selector y el campo hexadecimal.
/** Sincroniza el lienzo, el selector visual y el campo hexadecimal del fondo. */
function setBackgroundColor(color) {
  const colorPicker = document.querySelector('#bgColor');
  const hexField = document.querySelector('#bgHex');
  stage.style.backgroundColor = color;
  colorPicker.value = color;
  hexField.value = color.slice(1).toUpperCase();
}

/** Aplica el color mientras se escribe, solo cuando el código hexadecimal es válido. */
function handleHexColorInput() {
  const field = document.querySelector('#bgHex');
  const color = field.value.trim();
  const fullHex = color.startsWith('#') ? color : `#${color}`;
  if (/^#[0-9a-fA-F]{6}$/.test(fullHex)) setBackgroundColor(fullHex);
}

/** Valida el color al terminar de escribir y restaura el último color correcto si falla. */
function handleHexColorCommit() {
  const field = document.querySelector('#bgHex');
  const color = field.value.trim();
  const fullHex = color.startsWith('#') ? color : `#${color}`;
  if (/^#[0-9a-fA-F]{6}$/.test(fullHex)) {
    setBackgroundColor(fullHex);
  } else {
    field.value = document.querySelector('#bgColor').value.slice(1).toUpperCase();
    showToast('Usa un color hexadecimal de 6 caracteres, por ejemplo D7F25E.');
  }
}

// Gestión de archivos: botones de carga y arrastrar/soltar.
function addFiles(fileList) {
  [...fileList].forEach(addImage);
}

fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  event.target.value = '';
});

document.querySelector('.empty-upload input').addEventListener('change', (event) => {
  addFiles(event.target.files);
  event.target.value = '';
});

// Cada botón añade un gráfico inicializado con valores predeterminados.
document.querySelector('#addWaveform').addEventListener('click', createWaveformGraphic);
document.querySelector('#addSpectrum').addEventListener('click', () => createWaveformGraphic('bars'));
document.querySelector('#addText').addEventListener('click', createTextGraphic);

assetList.addEventListener('dragstart', (event) => {
  // El orden del DOM de la lista es el orden de capas. Arrastrar un renglón y
  // soltarlo sobre otro cambia ese orden y updateStackingOrder actualiza el lienzo.
  const row = event.target.closest('.asset-item');
  if (!row) return;
  draggedAssetId = Number(row.dataset.id);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', row.dataset.id);
  row.classList.add('opacity-40');
});
assetList.addEventListener('dragover', (event) => {
  if (draggedAssetId === null) return;
  event.preventDefault();
  const targetRow = event.target.closest('.asset-item');
  if (!targetRow || Number(targetRow.dataset.id) === draggedAssetId) return;
  const targetBounds = targetRow.getBoundingClientRect();
  const insertBeforeTarget = event.clientY < targetBounds.top + targetBounds.height / 2;
  assetList.insertBefore(targetRow, insertBeforeTarget ? targetRow : targetRow.nextElementSibling);
});
assetList.addEventListener('drop', (event) => {
  if (draggedAssetId === null) return;
  event.preventDefault();
  draggedAssetId = null;
  updateStackingOrder();
});
assetList.addEventListener('dragend', (event) => {
  event.target.closest('.asset-item')?.classList.remove('opacity-40');
  draggedAssetId = null;
  updateStackingOrder();
});

const uploadZone = document.querySelector('#uploadZone');
// Evita que el navegador abra el archivo al soltarlo encima de la zona de carga.
for (const eventName of ['dragenter', 'dragover']) {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.add('border-[#9bb13e]', 'bg-[#f7f9ec]');
  });
}
for (const eventName of ['dragleave', 'drop']) {
  uploadZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadZone.classList.remove('border-[#9bb13e]', 'bg-[#f7f9ec]');
  });
}
uploadZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
stage.addEventListener('dragover', (event) => event.preventDefault());
stage.addEventListener('drop', (event) => {
  event.preventDefault();
  addFiles(event.dataTransfer.files);
});
stage.addEventListener('pointerdown', (event) => {
  if (event.target === stage || event.target === document.querySelector('#stageEmpty')) {
    selectedImageId = null;
    updateSelectionStyles();
    renderImageInspector();
  }
});

// El color se puede elegir con el control visual, el campo hexadecimal o las muestras.
document.querySelector('#bgColor').addEventListener('input', (event) => setBackgroundColor(event.target.value));
const hexField = document.querySelector('#bgHex');
hexField.addEventListener('input', handleHexColorInput);
hexField.addEventListener('blur', handleHexColorCommit);
hexField.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    handleHexColorCommit();
    hexField.blur();
  }
});
document.querySelectorAll('.swatches button').forEach((button) => {
  button.addEventListener('click', () => setBackgroundColor(button.dataset.color));
});

// Sensibilidad: amplifica la señal antes de compararla con el umbral de activación.
const sensitivitySlider = document.querySelector('#micSensitivity');
const thresholdSlider = document.querySelector('#micThreshold');
sensitivitySlider.addEventListener('input', () => {
  document.querySelector('#sensitivityValue').textContent = `${sensitivitySlider.value}%`;
});
thresholdSlider.addEventListener('input', () => {
  document.querySelector('#thresholdValue').textContent = `${thresholdSlider.value}%`;
});

document.querySelector('#centerButton').addEventListener('click', () => {
  const bounds = stage.getBoundingClientRect();
  imageItems.forEach((imageData) => {
    imageData.x = (bounds.width - imageData.width) / 2;
    imageData.y = (bounds.height - imageData.height) / 2;
    imageData.element.style.left = `${imageData.x}px`;
    imageData.element.style.top = `${imageData.y}px`;
  });
  showToast('Imágenes centradas');
});

document.querySelector('#fullscreenButton').addEventListener('click', () => {
  if (!document.fullscreenElement) stage.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.querySelector('#zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
document.querySelector('#zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));

/** Limita el zoom permitido y actualiza la escala de todas las capas. */
function setZoom(nextZoom) {
  zoom = Math.max(0.5, Math.min(1.5, nextZoom));
  document.querySelector('#zoomValue').textContent = `${Math.round(zoom * 100)}%`;
  stage.querySelectorAll('.stage-item').forEach((element) => { element.style.scale = zoom; });
}

// Micrófono y análisis de volumen por bandas de frecuencia.
