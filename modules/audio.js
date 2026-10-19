/* Entrada de micrófono y análisis de audio.
 * Convierte el sonido en niveles que alimentan las ondas y efectos visuales.
 */
// Micrófono y análisis de volumen por bandas de frecuencia.
document.querySelector('#micButton').addEventListener('click', toggleMicrophone);

/** Inicia la captura de audio o la detiene si ya estaba activa. */
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
    // Algunos navegadores mantienen el contexto suspendido tras esperar el permiso
    // del micrófono. Si no se reanuda, el analizador entrega una señal plana y la
    // onda parece no reaccionar aunque el permiso se haya concedido.
    if (audioContext.state === 'suspended') await audioContext.resume();
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
    microphoneStream?.getTracks().forEach((track) => track.stop());
    audioContext?.close();
    microphoneStream = null;
    audioContext = null;
    audioAnalyser = null;
    button.disabled = false;
    button.innerHTML = '<span>◉</span> Activar micrófono';
    showToast(error.name === 'NotAllowedError'
      ? 'Permite el acceso al micrófono en tu navegador.'
      : 'No se pudo iniciar el micrófono.');
  }
}

/** Cancela el análisis, libera el micrófono y devuelve las capas a su estado base. */
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

/** Promedia una porción del espectro y la expresa como valor entre cero y uno. */
function averageLevel(values, start, end) {
  // Web Audio entrega valores entre 0 y 255. Esta función promedia solo una
  // sección del espectro y la normaliza a 0..1.
  const first = Math.floor(start * values.length);
  const last = Math.max(first + 1, Math.floor(end * values.length));
  let total = 0;
  for (let index = first; index < last; index += 1) total += values[index];
  return total / (last - first) / 255;
}

/** Aplica el umbral de ruido y la ganancia elegida a una señal normalizada. */
function applySensitivity(level) {
  // Primero quitamos el ruido por debajo del umbral; después amplificamos lo que
  // queda. El límite 1 evita que una sensibilidad alta produzca valores inválidos.
  const sensitivity = Number(sensitivitySlider.value) / 100;
  const threshold = Number(thresholdSlider.value) / 100;
  if (level <= threshold) return 0;
  return Math.min(1, ((level - threshold) / (1 - threshold)) * sensitivity);
}

/** Lee audio en cada frame, calcula bandas y entrega esos niveles a las capas. */
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

/** Suaviza la respuesta de una imagen y la convierte en movimiento o brillo CSS. */
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
