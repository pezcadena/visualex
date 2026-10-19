(() => {
  // Recorrido general: los controles crean o actualizan objetos en `imageItems`;
  // esos objetos se muestran en el lienzo y en la lista, y el micrófono actualiza
  // sus efectos en cada frame. El mismo registro sirve para exportar el resultado.
  // La aplicación vive dentro de esta función para mantener sus variables privadas:
  // no añadimos nombres al objeto global del navegador.
  const stage = document.querySelector('#stage');
  const fileInput = document.querySelector('#fileInput');
  const assetList = document.querySelector('#assetList');

  // Registro central de los elementos del proyecto. La clave es su id y el valor
  // guarda posición, tamaño y opciones. `type` indica si es imagen, onda o texto.
  const imageItems = new Map();

  // Los efectos se definen una sola vez y se usan para poblar el selector de cada imagen.
  const availableEffects = [
    { id: 'pulse', label: 'Pulso' },
    { id: 'scale', label: 'Crecer con el bajo' },
    { id: 'float', label: 'Flotar' },
    { id: 'shake', label: 'Vibrar' },
    { id: 'spin', label: 'Girar' },
    { id: 'glow', label: 'Brillar' },
    { id: 'none', label: 'Sin efecto' },
  ];

  let selectedImageId = null;
  let draggedAssetId = null;
  let nextImageId = 1;
  let zoom = 1;
  let toastTimeout;
  let microphoneStream = null;
  let audioContext = null;
  let audioAnalyser = null;
  let audioFrame = 0;
  let currentWaveformData = null;

  // Muestra un aviso breve en la parte inferior del lienzo.
  function showToast(message) {
    const toast = document.querySelector('#toast');
    toast.textContent = message;
    toast.classList.add('translate-y-0', 'opacity-100');
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => {
      toast.classList.remove('translate-y-0', 'opacity-100');
    }, 2600);
  }

  function formatFileSize(fileSize) {
    const kilobytes = Math.max(1, Math.round(fileSize / 1024));
    return kilobytes >= 1024
      ? `${(kilobytes / 1024).toFixed(1)} MB`
      : `${kilobytes} KB`;
  }

  function updateImageCount() {
    const count = imageItems.size;
    const noun = count === 1 ? 'elemento' : 'elementos';
    document.querySelector('#imageCount').textContent = `${count} ${noun}`;
    document.querySelector('#stageEmpty').style.display = count ? 'none' : 'flex';
  }

  // Mantiene resaltado tanto el renglón de la lista como el elemento del lienzo.
  // La selección solo afecta a la presentación; no cambia el orden de las capas.
  function updateSelectionStyles() {
    document.querySelectorAll('.asset-item').forEach((row) => {
      const isSelected = Number(row.dataset.id) === selectedImageId;
      row.classList.toggle('bg-[#f0efe9]', isSelected);
      row.classList.toggle('border-[#e6e4dc]', isSelected);
    });
    document.querySelectorAll('.stage-item').forEach((element) => {
      const isSelected = Number(element.dataset.id) === selectedImageId;
      element.classList.toggle('ring-1', isSelected);
      element.classList.toggle('ring-[#252526aa]', isSelected);
      element.querySelectorAll('.selection-handle, .rotate-handle').forEach((handle) => {
        handle.classList.toggle('hidden', !isSelected);
      });
    });
  }

  // Añade una imagen al lienzo y a la lista del panel.
  // Primero esperamos a que el navegador conozca sus dimensiones para conservar
  // la proporción al calcular un tamaño inicial que quepa dentro del lienzo.
  function addImage(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Elige un archivo de imagen.');
      return;
    }

    const imageId = nextImageId++;
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      const stageBounds = stage.getBoundingClientRect();
      const fitScale = Math.min(1, 210 / image.width, 210 / image.height);
      const width = Math.max(40, image.width * fitScale);
      const height = Math.max(40, image.height * fitScale);
      const imageData = {
        id: imageId,
        type: 'image',
        file,
        url: imageUrl,
        name: file.name,
        width,
        height,
        rotation: 0,
        x: Math.max(15, (stageBounds.width - width) / 2 + (Math.random() - 0.5) * 150),
        y: Math.max(15, (stageBounds.height - height) / 2 + (Math.random() - 0.5) * 110),
        effect: 'pulse',
        intensity: 1.3,
        speed: 1,
        distance: 48,
        bassResponse: 160,
        effectResponse: 0,
      };

      imageItems.set(imageId, imageData);
      createCanvasImage(imageData);
      createAssetRow(imageData);
      selectImage(imageId);
      updateImageCount();
    };

    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      showToast(`No se pudo abrir “${file.name}”.`);
    };
    image.src = imageUrl;
  }

  function createCanvasImage(imageData) {
    // Todas las capas comparten este contenedor: permite mover, girar, cambiar el
    // tamaño y controlar su profundidad sin importar qué contenido tengan dentro.
    const element = document.createElement('div');
    element.className = 'stage-item absolute flex origin-center touch-none select-none cursor-grab items-center justify-center will-change-transform';
    element.dataset.id = imageData.id;
    element.style.width = `${imageData.width}px`;
    element.style.height = `${imageData.height}px`;
    element.style.left = `${imageData.x}px`;
    element.style.top = `${imageData.y}px`;
    element.style.rotate = `${imageData.rotation || 0}deg`;

    // Las ondas y el texto se dibujan en canvas. Las imágenes subidas usan un <img>.
    if (imageData.type === 'waveform') {
      const canvas = document.createElement('canvas');
      canvas.className = 'pointer-events-none h-full w-full drop-shadow-[0_3px_8px_#0002]';
      imageData.canvas = canvas;
      element.append(canvas);
    } else {
      const image = document.createElement('img');
      image.className = 'block h-full w-full pointer-events-none object-contain drop-shadow-[0_9px_14px_#0002]';
      image.src = imageData.url;
      image.alt = imageData.name;
      element.append(image);
    }

    // Ocho tiradores: las esquinas cambian ancho y alto juntos para mantener la
    // proporción; los del centro de cada lado permiten ajustar una dimensión.
    const resizeHandlePositions = {
      nw: 'left-[-6px] top-[-6px] cursor-nwse-resize',
      n: 'left-1/2 top-[-6px] -translate-x-1/2 cursor-ns-resize',
      ne: 'right-[-6px] top-[-6px] cursor-nesw-resize',
      e: 'right-[-6px] top-1/2 -translate-y-1/2 cursor-ew-resize',
      se: 'right-[-6px] bottom-[-6px] cursor-nwse-resize',
      s: 'bottom-[-6px] left-1/2 -translate-x-1/2 cursor-ns-resize',
      sw: 'bottom-[-6px] left-[-6px] cursor-nesw-resize',
      w: 'top-1/2 left-[-6px] -translate-y-1/2 cursor-ew-resize',
    };
    Object.entries(resizeHandlePositions).forEach(([direction, positionClasses]) => {
      const handle = document.createElement('span');
      handle.className = `selection-handle hidden absolute z-10 h-3 w-3 rounded-full border-2 border-white bg-ink shadow ${positionClasses}`;
      handle.dataset.resize = direction;
      element.append(handle);
    });

    const rotateHandle = document.createElement('button');
    rotateHandle.type = 'button';
    rotateHandle.className = 'rotate-handle hidden absolute -top-9 left-1/2 z-10 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-white bg-ink text-[13px] text-white shadow';
    rotateHandle.textContent = '↻';
    element.append(rotateHandle);
    stage.append(element);
    imageData.element = element;

    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      selectImage(imageData.id);

      const resizeHandle = event.target.closest('[data-resize]');
      if (resizeHandle) {
        startResizing(event, imageData, element, resizeHandle.dataset.resize);
      } else if (event.target.closest('.rotate-handle')) {
        startRotating(event, imageData, element);
      } else {
        startDragging(event, imageData, element);
      }
    });

    applyImageEffect(imageData);
  }

  function createAssetRow(imageData) {
    document.querySelector('.empty-assets')?.remove();

    const row = document.createElement('div');
    row.className = 'asset-item flex cursor-pointer items-center gap-2 rounded border border-transparent px-[6px] py-[5px] hover:bg-[#f0efe9]';
    row.dataset.id = imageData.id;
    row.draggable = true;

    let thumbnail;
    if (imageData.type === 'waveform' || imageData.type === 'text') {
      thumbnail = document.createElement('span');
      thumbnail.className = 'asset-thumb grid h-7 w-7 place-items-center rounded-[3px] bg-[#e8edcf] text-lg text-[#738927]';
      thumbnail.textContent = imageData.type === 'waveform' ? '∿' : 'T';
    } else {
      thumbnail = document.createElement('img');
      thumbnail.className = 'asset-thumb h-7 w-7 rounded-[3px] bg-[#eeede8] object-contain';
      thumbnail.src = imageData.url;
      thumbnail.alt = '';
    }

    const metadata = document.createElement('div');
    metadata.className = 'asset-meta min-w-0 flex-1';

    const name = document.createElement('b');
    name.className = 'block overflow-hidden text-ellipsis whitespace-nowrap text-[9px] font-bold';
    name.textContent = imageData.name;
    name.title = imageData.name;

    const size = document.createElement('span');
    size.className = 'font-mono text-[8px] text-[#939189]';
    size.textContent = imageData.type === 'image'
      ? formatFileSize(imageData.file.size)
      : imageData.type === 'text' ? 'Texto · editable' : 'Gráfico · reactivo';
    metadata.append(name, size);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'asset-delete cursor-pointer border-0 bg-transparent px-[3px] text-base text-[#999]';
    deleteButton.setAttribute('aria-label', `Eliminar ${imageData.name}`);
    deleteButton.textContent = '×';

    row.append(thumbnail, metadata, deleteButton);
    row.addEventListener('click', (event) => {
      if (!event.target.closest('.asset-delete')) selectImage(imageData.id);
    });
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      removeImage(imageData.id);
    });
    assetList.prepend(row);
    updateStackingOrder();
  }

  function updateStackingOrder() {
    // El primer renglón de la lista representa la capa del frente. Un z-index más
    // alto la dibuja por encima de las capas que aparecen debajo.
    const rows = [...assetList.querySelectorAll('.asset-item')];
    rows.forEach((row, index) => {
      const imageData = imageItems.get(Number(row.dataset.id));
      if (imageData) imageData.element.style.zIndex = String(rows.length - index);
    });
  }

  function selectImage(imageId) {
    selectedImageId = imageId;
    updateSelectionStyles();
    renderImageInspector();
  }

  function createRangeControl({ label, value, min, max, suffix, onInput }) {
    // Constructor compartido para los deslizadores del inspector. `onInput` recibe
    // el nuevo valor numérico cada vez que la persona mueve el control.
    const wrapper = document.createElement('div');
    wrapper.className = 'image-control my-[10px]';

    const heading = document.createElement('label');
    heading.className = 'slider-label mb-[6px] flex justify-between text-[9px] text-[#73736d]';

    const labelText = document.createElement('span');
    labelText.textContent = label;
    const valueText = document.createElement('span');
    valueText.className = 'font-mono text-[8px] text-[#85847c]';
    valueText.textContent = `${value}${suffix}`;
    heading.append(labelText, valueText);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.value = value;
    slider.className = 'gain-slider my-0 block h-1 w-full cursor-pointer accent-[#9eb83e]';
    slider.addEventListener('input', () => {
      valueText.textContent = `${slider.value}${suffix}`;
      onInput(Number(slider.value));
    });

    wrapper.append(heading, slider);
    return wrapper;
  }

  function createRotationControl(imageData) {
    // El control muestra la rotación dentro de -180°..180°, aunque el tirador pueda
    // completar vueltas y guardar valores mayores dentro del estado del elemento.
    const normalizedRotation = ((imageData.rotation % 360) + 540) % 360 - 180;
    const control = createRangeControl({
      label: 'Rotación',
      value: Math.round(normalizedRotation),
      min: -180,
      max: 180,
      suffix: '°',
      onInput: (value) => {
        imageData.rotation = value;
        imageData.element.style.rotate = `${value}deg`;
      },
    });
    control.querySelector('input').id = 'rotationSlider';
    control.querySelector('.slider-label span:last-child').id = 'rotationValue';
    return control;
  }

  function renderImageInspector() {
    // Se reconstruye el inspector al cambiar la selección para que sus controles
    // siempre correspondan al elemento activo.
    document.querySelector('.image-inspector')?.remove();
    const imageData = imageItems.get(selectedImageId);
    if (!imageData) return;

    const inspector = document.createElement('section');
    inspector.className = 'side-section image-inspector border-t border-line py-[17px]';
    inspector.innerHTML = '<div class="section-heading mb-[14px] flex items-center gap-[9px]"><span class="font-mono text-[10px] text-[#9da33f]">04</span><h2 class="m-0 text-[11px] font-bold">Elemento seleccionado</h2><span class="h-px flex-1 bg-line"></span></div>';

    const name = document.createElement('div');
    name.className = 'selected-title mb-3 overflow-hidden text-ellipsis whitespace-nowrap text-[9px] text-[#73726b]';
    name.textContent = imageData.name;

    if (imageData.type === 'waveform') {
      inspector.append(name);
      inspector.append(createRotationControl(imageData));
      addWaveformControls(inspector, imageData);
      document.querySelector('.background-section').before(inspector);
      return;
    }
    if (imageData.type === 'text') {
      inspector.append(name, createRotationControl(imageData));
      addTextControls(inspector, imageData);
      document.querySelector('.background-section').before(inspector);
      return;
    }

    const effectLabel = document.createElement('label');
    effectLabel.className = 'inspector-label mb-[6px] block text-[9px] text-[#73736d]';
    effectLabel.textContent = 'Efecto al escuchar';

    const effectSelect = document.createElement('select');
    effectSelect.className = 'effect-select mb-3 h-[30px] w-full rounded border border-[#e2e0d9] bg-white px-2 text-[10px] text-[#45453f]';
    for (const effect of availableEffects) {
      const option = document.createElement('option');
      option.value = effect.id;
      option.textContent = effect.label;
      option.selected = effect.id === imageData.effect;
      effectSelect.append(option);
    }
    effectSelect.addEventListener('change', () => {
      imageData.effect = effectSelect.value;
      applyImageEffect(imageData);
      updateEffectControlVisibility();
    });

    const intensityControl = createRangeControl({
      label: 'Intensidad', value: Math.round(imageData.intensity * 100),
      min: 25, max: 200, suffix: '%',
      onInput: (value) => { imageData.intensity = value / 100; },
    });
    const speedControl = createRangeControl({
      label: 'Velocidad', value: Math.round(imageData.speed * 100),
      min: 25, max: 250, suffix: '%',
      onInput: (value) => { imageData.speed = value / 100; },
    });
    const distanceControl = createRangeControl({
      label: 'Recorrido', value: imageData.distance,
      min: 0, max: 100, suffix: ' px',
      onInput: (value) => { imageData.distance = value; },
    });
    distanceControl.classList.add('distance-control');
    const bassControl = createRangeControl({
      label: 'Énfasis en bajos', value: imageData.bassResponse,
      min: 0, max: 300, suffix: '%',
      onInput: (value) => { imageData.bassResponse = value; },
    });

    const helpText = document.createElement('p');
    helpText.className = 'inspector-help mt-[6px] text-[8px] leading-[1.5] text-[#99978f]';
    helpText.textContent = 'Ajusta cuánto se mueve y a qué velocidad responde al sonido.';

    inspector.append(name, createRotationControl(imageData), effectLabel, effectSelect, intensityControl, speedControl, distanceControl, bassControl, helpText);
    document.querySelector('.background-section').before(inspector);

    function updateEffectControlVisibility() {
      const usesDistance = ['float', 'shake', 'spin', 'glow'].includes(imageData.effect);
      distanceControl.hidden = !usesDistance;
      intensityControl.hidden = imageData.effect === 'none';
      speedControl.hidden = imageData.effect === 'none';
      bassControl.hidden = imageData.effect === 'none';
    }
    updateEffectControlVisibility();
  }

  function addWaveformControls(inspector, graphic) {
    // Parámetros propios de la onda y del espectro: forma, color y densidad visual.
    const styleLabel = document.createElement('label');
    styleLabel.className = 'inspector-label mb-[6px] block text-[9px] text-[#73736d]';
    styleLabel.textContent = 'Estilo de onda';

    const styleSelect = document.createElement('select');
    styleSelect.className = 'effect-select mb-3 h-[30px] w-full rounded border border-[#e2e0d9] bg-white px-2 text-[10px] text-[#45453f]';
    [['line', 'Línea'], ['bars', 'Barras']].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      option.selected = value === graphic.style;
      styleSelect.append(option);
    });
    styleSelect.addEventListener('change', () => {
      graphic.style = styleSelect.value;
      drawWaveform(graphic, currentWaveformData);
    });

    const colorRow = document.createElement('label');
    colorRow.className = 'mb-3 flex items-center justify-between text-[9px] text-[#73736d]';
    colorRow.append('Color de la onda');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = graphic.color;
    colorInput.className = 'h-7 w-10 cursor-pointer rounded border border-[#e2e0d9] bg-white p-[3px]';
    colorInput.setAttribute('aria-label', 'Color de la onda');
    colorInput.addEventListener('input', () => {
      graphic.color = colorInput.value;
      drawWaveform(graphic, currentWaveformData);
    });
    colorRow.append(colorInput);

    const amplitudeControl = createRangeControl({
      label: 'Amplitud', value: graphic.amplitude, min: 10, max: 100, suffix: '%',
      onInput: (value) => { graphic.amplitude = value; drawWaveform(graphic, currentWaveformData); },
    });
    const detailControl = createRangeControl({
      label: 'Detalle', value: graphic.detail, min: 12, max: 120, suffix: '',
      onInput: (value) => { graphic.detail = value; drawWaveform(graphic, currentWaveformData); },
    });
    const thicknessControl = createRangeControl({
      label: 'Grosor', value: graphic.thickness, min: 1, max: 10, suffix: ' px',
      onInput: (value) => { graphic.thickness = value; drawWaveform(graphic, currentWaveformData); },
    });

    const helpText = document.createElement('p');
    helpText.className = 'mt-[6px] text-[8px] leading-[1.5] text-[#99978f]';
    helpText.textContent = 'La onda sigue la señal del micrófono mientras está activo.';
    inspector.append(styleLabel, styleSelect, colorRow, amplitudeControl, detailControl, thicknessControl, helpText);
  }

  const googleFontFamilies = [
    'Manrope', 'Space Grotesk', 'Bebas Neue', 'Oswald',
    'Orbitron', 'Playfair Display', 'DM Mono',
  ];

  function addTextControls(inspector, textGraphic) {
    // El texto se conserva como contenido editable; los controles redibujan el
    // canvas para que el cambio se vea en el lienzo y también salga en la exportación.
    const contentLabel = document.createElement('label');
    contentLabel.className = 'inspector-label mb-[6px] block text-[9px] text-[#73736d]';
    contentLabel.textContent = 'Contenido';

    const contentInput = document.createElement('textarea');
    contentInput.className = 'mb-3 min-h-16 w-full resize-y rounded border border-[#e2e0d9] bg-white p-2 text-[10px] text-[#45453f]';
    contentInput.value = textGraphic.content;
    contentInput.setAttribute('aria-label', 'Texto del elemento');
    contentInput.addEventListener('input', () => {
      textGraphic.content = contentInput.value;
      drawTextGraphic(textGraphic);
    });

    const fontLabel = document.createElement('label');
    fontLabel.className = 'inspector-label mb-[6px] block text-[9px] text-[#73736d]';
    fontLabel.textContent = 'Fuente de Google Fonts';

    const fontSelect = document.createElement('select');
    fontSelect.className = 'effect-select mb-3 h-[30px] w-full rounded border border-[#e2e0d9] bg-white px-2 text-[10px] text-[#45453f]';
    googleFontFamilies.forEach((fontFamily) => {
      const option = document.createElement('option');
      option.value = fontFamily;
      option.textContent = fontFamily;
      option.selected = fontFamily === textGraphic.fontFamily;
      fontSelect.append(option);
    });
    fontSelect.addEventListener('change', () => {
      textGraphic.fontFamily = fontSelect.value;
      document.fonts.load(`${textGraphic.fontSize}px "${textGraphic.fontFamily}"`).then(() => drawTextGraphic(textGraphic));
      drawTextGraphic(textGraphic);
    });

    const colorRow = document.createElement('label');
    colorRow.className = 'mb-3 flex items-center justify-between text-[9px] text-[#73736d]';
    colorRow.append('Color del texto');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = textGraphic.color;
    colorInput.className = 'h-7 w-10 cursor-pointer rounded border border-[#e2e0d9] bg-white p-[3px]';
    colorInput.setAttribute('aria-label', 'Color del texto');
    colorInput.addEventListener('input', () => {
      textGraphic.color = colorInput.value;
      drawTextGraphic(textGraphic);
    });
    colorRow.append(colorInput);

    const sizeControl = createRangeControl({
      label: 'Tamaño', value: textGraphic.fontSize, min: 14, max: 120, suffix: ' px',
      onInput: (value) => {
        textGraphic.fontSize = value;
        drawTextGraphic(textGraphic);
      },
    });
    inspector.append(contentLabel, contentInput, fontLabel, fontSelect, colorRow, sizeControl);
  }

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
  function setBackgroundColor(color) {
    const colorPicker = document.querySelector('#bgColor');
    const hexField = document.querySelector('#bgHex');
    stage.style.backgroundColor = color;
    colorPicker.value = color;
    hexField.value = color.slice(1).toUpperCase();
  }

  function handleHexColorInput() {
    const field = document.querySelector('#bgHex');
    const color = field.value.trim();
    const fullHex = color.startsWith('#') ? color : `#${color}`;
    if (/^#[0-9a-fA-F]{6}$/.test(fullHex)) setBackgroundColor(fullHex);
  }

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

  function setZoom(nextZoom) {
    zoom = Math.max(0.5, Math.min(1.5, nextZoom));
    document.querySelector('#zoomValue').textContent = `${Math.round(zoom * 100)}%`;
    stage.querySelectorAll('.stage-item').forEach((element) => { element.style.scale = zoom; });
  }

  // Micrófono y análisis de volumen por bandas de frecuencia.
  document.querySelector('#micButton').addEventListener('click', toggleMicrophone);

  async function toggleMicrophone() {
    if (microphoneStream) {
      stopMicrophone();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('El navegador requiere HTTPS para usar el micrófono.');
      return;
    }

    const button = document.querySelector('#micButton');
    button.disabled = true;
    button.innerHTML = '<span>◉</span> Conectando…';

    try {
      // El navegador pide permiso. Desactivar la cancelación de ruido ayuda a
      // conservar los golpes y cambios de volumen que disparan los efectos.
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const microphoneSource = audioContext.createMediaStreamSource(microphoneStream);
      audioAnalyser = audioContext.createAnalyser();
      audioAnalyser.fftSize = 512;
      audioAnalyser.smoothingTimeConstant = 0.72;
      microphoneSource.connect(audioAnalyser);

      document.querySelector('#micTitle').textContent = 'Escuchando';
      document.querySelector('#micSubtitle').textContent = 'El lienzo está reaccionando';
      document.querySelector('#micStatus').classList.replace('bg-[#c8c6be]', 'bg-[#82af3c]');
      document.querySelector('#micStatus').classList.add('shadow-[0_0_0_3px_#82af3c22]');
      button.classList.add('bg-[#80952c]');
      button.innerHTML = '<span>■</span> Desactivar micrófono';
      button.disabled = false;
      startAudioAnimation();
    } catch (error) {
      microphoneStream = null;
      button.disabled = false;
      button.innerHTML = '<span>◉</span> Activar micrófono';
      showToast(error.name === 'NotAllowedError'
        ? 'Permite el acceso al micrófono en tu navegador.'
        : 'No se pudo iniciar el micrófono.');
    }
  }

  function stopMicrophone() {
    // Se cancela el bucle de animación, se cierran las pistas de entrada y se
    // devuelven los elementos a su tamaño y apariencia de reposo.
    cancelAnimationFrame(audioFrame);
    microphoneStream?.getTracks().forEach((track) => track.stop());
    audioContext?.close();
    microphoneStream = null;
    audioContext = null;
    audioAnalyser = null;
    currentWaveformData = null;

    document.querySelector('#micTitle').textContent = 'Micro apagado';
    document.querySelector('#micSubtitle').textContent = 'Activa el micro para empezar';
    document.querySelector('#micStatus').classList.replace('bg-[#82af3c]', 'bg-[#c8c6be]');
    document.querySelector('#micStatus').classList.remove('shadow-[0_0_0_3px_#82af3c22]');
    document.querySelector('#micButton').classList.remove('bg-[#80952c]');
    document.querySelector('#micButton').innerHTML = '<span>◉</span> Activar micrófono';
    document.querySelector('#meterFill').style.width = '0%';
    document.querySelector('#audioPercent').textContent = '0%';

    imageItems.forEach((imageData) => {
      if (imageData.type === 'waveform') {
        drawWaveform(imageData, null);
        return;
      }
      imageData.element.style.transform = '';
      imageData.element.style.filter = '';
      imageData.element.style.width = `${imageData.width}px`;
      imageData.element.style.height = `${imageData.height}px`;
      imageData.effectResponse = 0;
    });
  }

  function averageLevel(values, start, end) {
    // Web Audio entrega valores entre 0 y 255. Esta función promedia solo una
    // sección del espectro y la normaliza a 0..1.
    const first = Math.floor(start * values.length);
    const last = Math.max(first + 1, Math.floor(end * values.length));
    let total = 0;
    for (let index = first; index < last; index += 1) total += values[index];
    return total / (last - first) / 255;
  }

  function applySensitivity(level) {
    // Primero quitamos el ruido por debajo del umbral; después amplificamos lo que
    // queda. El límite 1 evita que una sensibilidad alta produzca valores inválidos.
    const sensitivity = Number(sensitivitySlider.value) / 100;
    const threshold = Number(thresholdSlider.value) / 100;
    if (level <= threshold) return 0;
    return Math.min(1, ((level - threshold) / (1 - threshold)) * sensitivity);
  }

  function startAudioAnimation() {
    const frequencyData = new Uint8Array(audioAnalyser.frequencyBinCount);
    const waveformData = new Uint8Array(audioAnalyser.fftSize);
    let previousFrameTime = performance.now();
    let previousBassLevel = 0;
    let kickEnvelope = 0;
    const animationTick = (frameTime) => {
      if (!audioAnalyser) return;
      audioAnalyser.getByteFrequencyData(frequencyData);
      audioAnalyser.getByteTimeDomainData(waveformData);
      currentWaveformData = waveformData;
      const elapsed = Math.min(50, frameTime - previousFrameTime);
      previousFrameTime = frameTime;

      // El espectro se divide en graves, medios y agudos para que cada efecto pueda
      // seguir una parte distinta de la música.
      const rawLevel = averageLevel(frequencyData, 0, 1);
      const rawBassLevel = averageLevel(frequencyData, 0, 0.14);
      const bassRise = rawBassLevel - previousBassLevel;
      const kickThreshold = Number(thresholdSlider.value) / 100;
      // Un kick suele aparecer como una subida rápida de energía en graves. La
      // envolvente conserva el pico unos milisegundos para que el movimiento se note.
      if (rawBassLevel > kickThreshold && bassRise > Math.max(0.006, rawBassLevel * 0.16)) {
        kickEnvelope = Math.min(1, 0.35 + rawBassLevel * 2 + bassRise * 10);
      } else {
        kickEnvelope *= Math.exp(-elapsed / 190);
      }
      previousBassLevel = rawBassLevel;
      const bandLevels = {
        all: applySensitivity(rawLevel),
        bass: applySensitivity(rawBassLevel),
        kick: applySensitivity(Math.max(rawBassLevel, kickEnvelope * 0.55)),
        mids: applySensitivity(averageLevel(frequencyData, 0.16, 0.58)),
        treble: applySensitivity(averageLevel(frequencyData, 0.58, 1)),
      };

      const meterPercent = Math.round(Math.min(1, rawLevel * 2.7) * 100);
      document.querySelector('#meterFill').style.width = `${meterPercent}%`;
      document.querySelector('#audioPercent').textContent = `${meterPercent}%`;

      imageItems.forEach((imageData) => {
        if (imageData.type === 'waveform') drawWaveform(imageData, waveformData);
        else if (imageData.type === 'image') animateImage(imageData, bandLevels, elapsed);
      });
      audioFrame = requestAnimationFrame(animationTick);
    };
    audioFrame = requestAnimationFrame(animationTick);
  }

  function animateImage(imageData, levels, elapsed) {
    // Cada efecto toma una banda distinta y puede recibir un refuerzo adicional de
    // los kicks. `effectResponse` suaviza la señal para que el movimiento no tiemble.
    const element = imageData.element;
    const bandForEffect = {
      pulse: levels.kick,
      scale: levels.bass,
      float: levels.mids,
      shake: levels.treble,
      spin: levels.all,
      glow: levels.treble,
      none: 0,
    }[imageData.effect];

    const kickResponse = levels.kick * (imageData.bassResponse / 100);
    const targetResponse = Math.min(1, (bandForEffect + kickResponse) * imageData.intensity);
    const responseSpeed = 1 - Math.exp((-elapsed * imageData.speed) / 150);
    imageData.effectResponse += (targetResponse - imageData.effectResponse) * responseSpeed;
    const response = imageData.effectResponse;
    const time = performance.now() * imageData.speed;

    // La señal ya normalizada se convierte en transformaciones CSS concretas.
    switch (imageData.effect) {
      case 'pulse':
        element.style.transform = `scale(${1 + response * .5})`;
        break;
      case 'scale':
        element.style.transform = `scale(${1 + response * 0.4})`;
        break;
      case 'float':
        element.style.transform = `translateY(${-response * imageData.distance}px)`;
        break;
      case 'shake': {
        const shake = response * imageData.distance * 0.12;
        element.style.transform = `translate(${Math.sin(time / 35) * shake}px, ${Math.cos(time / 28) * shake}px)`;
        break;
      }
      case 'spin':
        element.style.transform = `rotate(${response * imageData.distance * Math.sin(time / 300)}deg)`;
        break;
      case 'glow':
        element.style.filter = `drop-shadow(0 0 ${response * imageData.distance}px rgba(255, 255, 255, ${response}))`;
        break;
      default:
        element.style.transform = '';
        element.style.filter = '';
    }

  }

  // Exporta una imagen fija del lienzo con el color y la posición actuales.
  document.querySelector('#exportButton').addEventListener('click', exportCanvas);

  function exportCanvas() {
    // La exportación usa otro canvas para crear un PNG descargable sin alterar el editor.
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext('2d');
    context.scale(2, 2);
    context.fillStyle = getComputedStyle(stage).backgroundColor;
    context.fillRect(0, 0, width, height);

    // Se exporta de atrás hacia delante para respetar las mismas capas visibles en
    // pantalla. Los canvases de texto y gráficos ya contienen sus parámetros.
    const imagesToDraw = [...assetList.querySelectorAll('.asset-item')]
      .reverse()
      .map((row) => imageItems.get(Number(row.dataset.id)))
      .filter(Boolean);
    if (imagesToDraw.length === 0) {
      downloadExport(canvas);
      return;
    }

    let remainingImages = imagesToDraw.length;
    imagesToDraw.forEach((imageData) => {
      if (imageData.type !== 'image') {
        drawRotatedItem(context, imageData.canvas, imageData);
        remainingImages -= 1;
        if (remainingImages === 0) downloadExport(canvas);
        return;
      }

      const image = new Image();
      image.onload = () => {
        drawRotatedItem(context, image, imageData);
        remainingImages -= 1;
        if (remainingImages === 0) downloadExport(canvas);
      };
      image.onerror = () => {
        remainingImages -= 1;
        if (remainingImages === 0) downloadExport(canvas);
      };
      image.src = imageData.url;
    });
  }

  function drawRotatedItem(context, source, item) {
    // Canvas rota alrededor del origen. Trasladamos al centro del elemento, giramos,
    // y dibujamos usando coordenadas relativas a ese centro.
    context.save();
    context.translate(item.x + item.width / 2, item.y + item.height / 2);
    context.rotate(((item.rotation || 0) * Math.PI) / 180);
    context.drawImage(source, -item.width / 2, -item.height / 2, item.width, item.height);
    context.restore();
  }

  function downloadExport(canvas) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = 'ritmo-lienzo.png';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      showToast('Lienzo exportado como PNG');
    });
  }

  // Ayuda y atajos de teclado.
  const helpModal = document.querySelector('#helpModal');
  function closeHelpModal() {
    helpModal.classList.add('hidden');
    helpModal.classList.remove('flex');
  }

  document.querySelector('#helpButton').addEventListener('click', () => {
    helpModal.classList.remove('hidden');
    helpModal.classList.add('flex');
  });
  document.querySelector('#closeHelp').addEventListener('click', closeHelpModal);
  document.querySelector('#gotIt').addEventListener('click', closeHelpModal);
  helpModal.addEventListener('click', (event) => {
    if (event.target === helpModal) closeHelpModal();
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeHelpModal();
    const isTextInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedImageId !== null && !isTextInput) {
      removeImage(selectedImageId);
    }
  });

  updateImageCount();
})();
