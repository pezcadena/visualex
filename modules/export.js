/* Exportación del lienzo como PNG.
 * Dibuja las capas en un canvas temporal y crea la descarga del archivo.
 */
document.querySelector('#exportButton').addEventListener('click', exportCanvas);

/** Compone las capas respetando su orden y genera el canvas de exportación. */
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

/** Pinta una capa centrada y girada sin modificar el contexto de las demás. */
function drawRotatedItem(context, source, item) {
  // Canvas rota alrededor del origen. Trasladamos al centro del elemento, giramos,
  // y dibujamos usando coordenadas relativas a ese centro.
  context.save();
  context.translate(item.x + item.width / 2, item.y + item.height / 2);
  context.rotate(((item.rotation || 0) * Math.PI) / 180);
  context.drawImage(source, -item.width / 2, -item.height / 2, item.width, item.height);
  context.restore();
}

/** Convierte el canvas en un archivo PNG y dispara su descarga en el navegador. */
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
