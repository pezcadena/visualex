/* Inspector y opciones de los elementos.
 * Construye los controles que aparecen al seleccionar imagen, onda o texto.
 */
/** Crea un control deslizante y llama a onInput con su valor numérico actualizado. */
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

/** Construye el deslizador de giro y mantiene sincronizados los grados y la capa. */
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

/** Reconstruye el panel según el tipo de elemento actualmente seleccionado. */
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

/** Agrega al inspector las opciones visuales propias de una onda o espectro. */
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

/** Crea los campos para editar contenido, fuente, color y tamaño del texto. */
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
