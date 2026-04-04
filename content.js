// Helper to find a button by selector and text
function findButton(selector, text) {
  const texts = Array.isArray(text) ? text : [text];
  const buttons = document.querySelectorAll(selector);
  for (const button of buttons) {
    const buttonText = button.querySelector('.button-text')?.textContent.trim();
    if (texts.includes(buttonText)) return button;
  }
  return null;
}

function findButtonByTooltip(selector, text) {
  const texts = Array.isArray(text) ? text : [text];
  const buttons = document.querySelectorAll(selector);
  for (const button of buttons) {
    const tooltip = button.getAttribute('data-tooltip-content')?.trim();
    if (texts.includes(tooltip)) return button;
  }
  return null;
}

// Action: Select All (Ctrl + A)
function selectAll() {
  const checkboxes = document.querySelectorAll('.synofoto-selectable-checkbox');
  if (checkboxes.length === 0) return;

  const allSelected = Array.from(checkboxes).every(cb => cb.classList.contains('checked'));

  if (allSelected) {
    const deselectButton = document.querySelector('.synofoto-icon-button[data-tooltip-content="Annuleren"]');
    if (deselectButton) {
      deselectButton.click();
      return;
    }
  }

  checkboxes.forEach(cb => {
    if (!cb.classList.contains('checked')) cb.click();
  });
}

// Action: Add Tags (Shift + T)
function addTags() {
  const editTagsButton = findButton('button.synofoto-menu-text-button', 'Edit tags');
  if (editTagsButton) {
    editTagsButton.click();
  } else {
    const infoButton = document.querySelector('.synofoto-lightbox-toolbar-right-button[data-tooltip-content="Informatie"]');
    if (infoButton) {
      infoButton.click();
      setTimeout(() => {
        const input = document.querySelector('.synofoto__input[placeholder*="tags"]');
        if (input) input.focus();
      }, 50);
    }
  }
}

// Action: Rotate (Shift + R)
function rotate() {
  const rotateButton = findButton('.synofoto-menu-text-button', 'Draaien');
  if (rotateButton) rotateButton.click();
}

// Action: Add to Album (Shift + A)
function addToAlbum() {
  const selectionButton = document.querySelector('.synofoto-selected-bar-button[data-tooltip-content="Toevoegen aan Album"]');
  if (selectionButton) {
    selectionButton.click();
  } else {
    const lightboxButton = findButton('.synofoto-menu-text-button', 'Toevoegen aan album');
    if (lightboxButton) lightboxButton.click();
  }
}

// Action: Copy To (Shift + C)
function copyTo() {
  const buttonTexts = ['Kopi\u00ebren naar', 'Copy to'];
  const selectionButton = findButtonByTooltip('.synofoto-selected-bar-button', buttonTexts);
  if (selectionButton) {
    selectionButton.click();
  } else {
    const lightboxButton = findButton('.synofoto-menu-text-button', buttonTexts);
    if (lightboxButton) lightboxButton.click();
  }
}

// Action: Open Delete Dialog (Shift + Delete or Shift + Back NORMSPACE)
function deleteDialog() {
  const selectionButton = document.querySelector('.synofoto-selected-bar-button[data-tooltip-content="Verwijderen"]');
  if (selectionButton) {
    selectionButton.click();
  } else {
    const lightboxButton = document.querySelector('.synofoto-lightbox-toolbar-right-button[data-tooltip-content="Verwijderen"]');
    if (lightboxButton) lightboxButton.click();
  }
}

// Action: Download (Shift + D)
function download() {
  const selectViewDownloadButton = findButton('.synofoto-menu-text-button', 'Origineel')
  if (selectViewDownloadButton) {
    selectViewDownloadButton.click();
  }
}

// Action: Change View (Shift + Tab)
function changeView() {
  const changeViewButton = document.querySelector('.synofoto-change-view-btn');
  if (changeViewButton) {
    changeViewButton.click();
  }
}

// Action: Rate Photo (1-5 keys for 1-5 stars)
function ratePhoto(rating) {
  // Find the rating stars; assuming they are in order and clickable to set rating
  const stars = document.querySelectorAll('.synofoto-icon-button-rating');
  if (stars.length >= rating) {
    stars[rating - 1].click(); // Click the nth star to set to n stars
  }
}

// Map key to actions (Shift + {Key})
const actions = {
  'T': addTags,
  'R': rotate,
  'A': addToAlbum,
  'C': copyTo,
  'D': download,
  'Tab': changeView,
  'Delete': deleteDialog,
  'Backspace': deleteDialog,
};

// Add the keydown event listener
document.addEventListener('keydown', (event) => {
  if (
      event.target.tagName === 'INPUT'
      || event.target.tagName === 'TEXTAREA'
      || event.target.isContentEditable
  ) return;

  if (event.shiftKey) {
    const action = actions[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  }

  // Select All shortcut
  // Cmd + A on Mac, CTRL + A on Windows
  const isMac = navigator.platform.toUpperCase().includes('MAC');
  const selectAllKey = isMac ? event.metaKey : event.ctrlKey;
  if (selectAllKey && event.key === 'a') {
    event.preventDefault(); // Prevent the default browser "select all" behavior
    selectAll(); // Run our custom "Select All" function
  }

  // Rating shortcuts
  if (event.key >= '1' && event.key <= '5' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    ratePhoto(parseInt(event.key));
  }
}, true);
