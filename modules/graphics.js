/* Gráficos y manipulación visual.
 * Aquí se dibujan ondas/textos y se implementan arrastre, tamaño y rotación.
 */
/** Añade una onda o espectro al lienzo con el estilo inicial solicitado. */
function createWaveformGraphic(style = 'line') {
  // Crea uno de los gráficos predefinidos. `line` dibuja una onda continua y `bars`
  // usa el mismo audio para construir un espectro de barras.
  const bounds = stage.getBoundingClientRect();
  const isSpectrum = style === 'bars';
  const graphic = {
    id: nextImageId++,
    type: 'waveform',
    name: isSpectrum ? 'Espectro de barras' : 'Onda de sonido',
    x: Math.max(15, (bounds.width - 300) / 2),
    y: Math.max(15, (bounds.height - 140) / 2),
    width: 300,
    height: 140,
    rotation: 0,
    style,
    color: '#19191d',
    amplitude: 60,
    detail: 48,
    thickness: 3,
  };

  imageItems.set(graphic.id, graphic);
  createCanvasImage(graphic);
  drawWaveform(graphic, currentWaveformData);
  createAssetRow(graphic);
  selectImage(graphic.id);
  updateImageCount();
}

/** Crea una capa de texto con valores iniciales y la selecciona para editarla. */
function createTextGraphic() {
  const bounds = stage.getBoundingClientRect();
  const textGraphic = {
    id: nextImageId++,
    type: 'text',
    name: 'Texto',
    content: 'Tu texto aquí',
    fontFamily: 'Manrope',
    fontSize: 48,
    color: '#19191d',
    x: Math.max(15, (bounds.width - 360) / 2),
    y: Math.max(15, (bounds.height - 120) / 2),
    width: 360,
    height: 120,
    rotation: 0,
  };
  imageItems.set(textGraphic.id, textGraphic);
  createCanvasImage(textGraphic);
  drawTextGraphic(textGraphic);
  createAssetRow(textGraphic);
  selectImage(textGraphic.id);
  updateImageCount();
}

/** Vuelve a dibujar el texto en su canvas usando sus propiedades actuales. */
function drawTextGraphic(textGraphic) {
  // Canvas guarda los píxeles a doble resolución para que el texto se vea nítido.
  // Separa los saltos de línea y centra el bloque completo dentro de su área.
  const canvas = textGraphic.canvas;
  if (!canvas) return;

  const pixelRatio = 2;
  const width = Math.max(1, textGraphic.width);
  const height = Math.max(1, textGraphic.height);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);

  const context = canvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.fillStyle = textGraphic.color;
  context.font = `${textGraphic.fontSize}px "${textGraphic.fontFamily}"`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const lines = textGraphic.content.split('\n');
  const lineHeight = textGraphic.fontSize * 1.2;
  const firstLineY = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, width / 2, firstLineY + index * lineHeight, width);
  });
}

/** Dibuja la señal del micrófono o una onda de muestra si el micro está apagado. */
function drawWaveform(graphic, samples) {
  // `samples` es la señal de tiempo del micrófono. Si es null, dibujamos una onda
  // de muestra para que el gráfico también tenga una apariencia al estar en silencio.
  const canvas = graphic.canvas;
  if (!canvas) return;

  const width = Math.max(1, graphic.width);
  const height = Math.max(1, graphic.height);
  const pixelRatio = 2;
  if (canvas.width !== Math.round(width * pixelRatio)) canvas.width = Math.round(width * pixelRatio);
  if (canvas.height !== Math.round(height * pixelRatio)) canvas.height = Math.round(height * pixelRatio);

  const context = canvas.getContext('2d');
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  context.strokeStyle = graphic.color;
  context.fillStyle = graphic.color;
  context.lineWidth = graphic.thickness;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  const centerY = height / 2;
  const amplitude = (height * 0.46 * graphic.amplitude) / 100;
  // Cada modo convierte las muestras en una línea continua o en barras verticales.
  // Convierte la señal en una altura por punto. La sensibilidad y el umbral también
  // se aplican aquí para que el gráfico reaccione con los mismos ajustes del micro.
  const sampleAt = (index, count) => {
    if (!samples) {
      const phase = (index / Math.max(1, count - 1)) * Math.PI * 5;
      return Math.sin(phase) * 0.56 + Math.sin(phase * 2.7) * 0.18;
    }

    const sampleIndex = Math.round((index / Math.max(1, count - 1)) * (samples.length - 1));
    const rawValue = (samples[sampleIndex] - 128) / 128;
    const adjustedValue = microphoneStream
      ? applySensitivity(Math.abs(rawValue))
      : Math.abs(rawValue);
    return Math.sign(rawValue) * adjustedValue;
  };

  if (graphic.style === 'bars') {
    const barWidth = Math.max(1, (width / graphic.detail) * 0.52);
    for (let index = 0; index < graphic.detail; index += 1) {
      const value = sampleAt(index, graphic.detail);
      const barHeight = Math.max(graphic.thickness, Math.abs(value) * amplitude * 2);
      const x = ((index + 0.5) / graphic.detail) * width - barWidth / 2;
      context.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    }
    return;
  }

  context.beginPath();
  for (let index = 0; index < graphic.detail; index += 1) {
    const x = (index / Math.max(1, graphic.detail - 1)) * width;
    const y = centerY - sampleAt(index, graphic.detail) * amplitude;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.stroke();
}

/** Mueve una capa siguiendo el puntero y convierte las coordenadas según el zoom. */
function startDragging(event, imageData, element) {
  // Guardamos la posición y el punto de inicio del puntero. Durante el arrastre,
  // convertimos píxeles de pantalla a coordenadas del lienzo usando el zoom actual.
  element.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  const originalX = imageData.x;
  const originalY = imageData.y;

  function moveImage(moveEvent) {
    imageData.x = originalX + (moveEvent.clientX - startX) / zoom;
    imageData.y = originalY + (moveEvent.clientY - startY) / zoom;
    element.style.left = `${imageData.x}px`;
    element.style.top = `${imageData.y}px`;
  }

  function stopDragging() {
    element.removeEventListener('pointermove', moveImage);
    element.removeEventListener('pointerup', stopDragging);
    element.removeEventListener('pointercancel', stopDragging);
  }

  element.addEventListener('pointermove', moveImage);
  element.addEventListener('pointerup', stopDragging);
  element.addEventListener('pointercancel', stopDragging);
}

/** Cambia el tamaño desde el tirador indicado y conserva la proporción en las esquinas. */
function startResizing(event, imageData, element, direction) {
  // `direction` vale, por ejemplo, "se" para la esquina inferior derecha o "n"
  // para el tirador superior. Las esquinas conservan la proporción original y,
  // al tirar desde arriba o la izquierda, el borde opuesto queda fijo.
  event.preventDefault();
  event.target.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  const originalWidth = imageData.width;
  const originalHeight = imageData.height;
  const originalX = imageData.x;
  const originalY = imageData.y;
  const aspectRatio = imageData.height / imageData.width;
  const changesWidth = direction.includes('e') || direction.includes('w');
  const changesHeight = direction.includes('n') || direction.includes('s');
  const widthDirection = direction.includes('w') ? -1 : 1;
  const heightDirection = direction.includes('n') ? -1 : 1;

  function resizeImage(moveEvent) {
    const deltaX = (moveEvent.clientX - startX) / zoom;
    const deltaY = (moveEvent.clientY - startY) / zoom;
    let nextWidth = changesWidth ? originalWidth + deltaX * widthDirection : originalWidth;
    let nextHeight = changesHeight ? originalHeight + deltaY * heightDirection : originalHeight;

    if (changesWidth && changesHeight) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) nextHeight = nextWidth * aspectRatio;
      else nextWidth = nextHeight / aspectRatio;
    }
    nextWidth = Math.max(36, nextWidth);
    nextHeight = Math.max(36, nextHeight);

    imageData.width = nextWidth;
    imageData.height = nextHeight;
    imageData.x = direction.includes('w') ? originalX + originalWidth - nextWidth : originalX;
    imageData.y = direction.includes('n') ? originalY + originalHeight - nextHeight : originalY;
    element.style.left = `${imageData.x}px`;
    element.style.top = `${imageData.y}px`;
    element.style.width = `${imageData.width}px`;
    element.style.height = `${imageData.height}px`;
    if (imageData.type === 'waveform') drawWaveform(imageData, currentWaveformData);
    if (imageData.type === 'text') drawTextGraphic(imageData);
  }

  function stopResizing() {
    event.target.removeEventListener('pointermove', resizeImage);
    event.target.removeEventListener('pointerup', stopResizing);
    event.target.removeEventListener('pointercancel', stopResizing);
  }

  event.target.addEventListener('pointermove', resizeImage);
  event.target.addEventListener('pointerup', stopResizing);
  event.target.addEventListener('pointercancel', stopResizing);
}

/** Calcula el giro alrededor del centro de la capa mientras se arrastra el tirador. */
function startRotating(event, imageData, element) {
  // Calculamos los cambios de ángulo alrededor del centro. Normalizamos cada paso
  // al cruzar el límite entre -180° y 180° para que el giro no salte de repente.
  event.preventDefault();
  const rotateButton = event.target.closest('.rotate-handle');
  rotateButton.setPointerCapture(event.pointerId);

  const bounds = element.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  let previousAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX);

  function rotateImage(moveEvent) {
    const angle = Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX);
    let angleDelta = angle - previousAngle;
    if (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
    if (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    imageData.rotation = (imageData.rotation || 0) + (angleDelta * 180) / Math.PI;
    previousAngle = angle;
    element.style.rotate = `${imageData.rotation}deg`;
    const output = document.querySelector('#rotationValue');
    const slider = document.querySelector('#rotationSlider');
    if (output && Number(element.dataset.id) === selectedImageId) {
      const normalized = ((imageData.rotation % 360) + 540) % 360 - 180;
      output.textContent = `${Math.round(normalized)}°`;
      slider.value = String(Math.round(normalized));
    }
  }

  function stopRotating() {
    rotateButton.removeEventListener('pointermove', rotateImage);
    rotateButton.removeEventListener('pointerup', stopRotating);
    rotateButton.removeEventListener('pointercancel', stopRotating);
  }

  rotateButton.addEventListener('pointermove', rotateImage);
  rotateButton.addEventListener('pointerup', stopRotating);
  rotateButton.addEventListener('pointercancel', stopRotating);
}

/** Quita una capa del lienzo, de la lista y del registro central del proyecto. */
function removeImage(imageId) {
  const imageData = imageItems.get(imageId);
  if (!imageData) return;

  imageData.element.remove();
  if (imageData.url) URL.revokeObjectURL(imageData.url);
  imageItems.delete(imageId);
  assetList.querySelector(`[data-id="${imageId}"]`)?.remove();

  if (selectedImageId === imageId) selectedImageId = null;
  if (imageItems.size === 0) {
    assetList.innerHTML = '<div class="empty-assets p-[6px] text-center text-[9px] text-[#aaa89f]">Tus imágenes aparecerán aquí</div>';
  }

  renderImageInspector();
  updateImageCount();
}

/** Limpia las transformaciones anteriores antes de iniciar o reiniciar un efecto. */
function applyImageEffect(imageData) {
  const element = imageData.element;
  if (!element || imageData.type === 'waveform') return;

  element.style.transition = 'transform .12s ease, filter .12s ease';
  element.style.transform = '';
  element.style.filter = '';
  element.style.width = `${imageData.width}px`;
  element.style.height = `${imageData.height}px`;
  imageData.effectResponse = 0;
}

// Un solo punto de entrada para el selector y el campo hexadecimal.
