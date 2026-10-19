/* Carga, selección, capas y controles del inspector.
 * Estas funciones construyen y mantienen los elementos que viven en el lienzo.
 */
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

/** Crea el renglón de la lista lateral para seleccionar, ordenar o borrar una capa. */
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

/** Guarda qué capa está seleccionada y sincroniza el lienzo con su inspector. */
function selectImage(imageId) {
  selectedImageId = imageId;
  updateSelectionStyles();
  renderImageInspector();
}
