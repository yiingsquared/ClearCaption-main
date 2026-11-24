window.captionOverlay?.onCaption(({ text, translation, size }) => {
  document.documentElement.style.setProperty('--size', `${size}px`);
  document.getElementById('original').textContent = text;
  document.getElementById('translated').textContent = translation;
});
