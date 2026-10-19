/* Estado compartido y utilidades generales del editor.
 * Los scripts se cargan en el orden indicado al final de index.html.
 */
// Recorrido general: los controles crean o actualizan objetos en `imageItems`;
// esos objetos se muestran en el lienzo y en la lista, y el micrófono actualiza
// sus efectos en cada frame. El mismo registro sirve para exportar el resultado.
// Estado compartido por los archivos de esta aplicación. Aunque se carga en
// scripts separados, el navegador permite que se comuniquen en el mismo orden.
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

/** Convierte bytes en una etiqueta legible para mostrar el tamaño de un archivo. */
function formatFileSize(fileSize) {
  const kilobytes = Math.max(1, Math.round(fileSize / 1024));
  return kilobytes >= 1024
    ? `${(kilobytes / 1024).toFixed(1)} MB`
    : `${kilobytes} KB`;
}

/** Actualiza el contador y muestra u oculta el mensaje de lienzo vacío. */
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
