/* Inicio de la aplicación: ayuda, atajos y estado inicial.
 * Este archivo se carga al final, cuando ya existen todas las funciones.
 */
// Ayuda y atajos de teclado.
const helpModal = document.querySelector('#helpModal');
/** Oculta la ventana de ayuda y devuelve el foco visual al editor. */
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
