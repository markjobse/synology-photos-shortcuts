function normalizeText(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function getButtonText(button) {
  return normalizeText(button.querySelector('.button-text')?.textContent || button.textContent);
}

function getElementText(element) {
  if (!element) return '';

  const preferredTextNode = element.querySelector(
    '.button-text, [class*="label"], [class*="name"], [class*="title"]',
  );

  return normalizeText(
    element.getAttribute?.('aria-label')
    || preferredTextNode?.textContent
    || element.textContent,
  );
}

function matchesAnyText(value, texts) {
  const normalizedValue = normalizeKey(value);
  return texts.some(text => normalizeKey(text) === normalizedValue);
}

function isVisible(element) {
  if (!element) return false;

  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
}

// Helper to find a button by selector and text
function findButton(selector, text) {
  const texts = Array.isArray(text) ? text : [text];
  const buttons = document.querySelectorAll(selector);
  for (const button of buttons) {
    if (matchesAnyText(getButtonText(button), texts)) return button;
  }
  return null;
}

function findButtonByTooltip(selector, text) {
  const texts = Array.isArray(text) ? text : [text];
  const buttons = document.querySelectorAll(selector);
  for (const button of buttons) {
    const tooltip = normalizeText(button.getAttribute('data-tooltip-content'));
    if (matchesAnyText(tooltip, texts)) return button;
  }
  return null;
}

const destinationDialogConfigs = {
  copy: {
    confirmTexts: ['Kopiëren naar', 'Copy to'],
  },
  move: {
    confirmTexts: ['Verplaatsen naar', 'Move to'],
  },
};

const destinationStorageKey = 'synologyPhotosShortcuts:lastDestinations:v1';
const debugStorageKey = 'synologyPhotosShortcuts:debugMarker';
const debugSelectionStorageKey = 'synologyPhotosShortcuts:debugSelection';
const debugDialogStorageKey = 'synologyPhotosShortcuts:debugDialog';
const destinationNavigatorSelector = '.synofoto-folder-navigator, .synofoto-folder-navigation-table';
const destinationNavigatorItemSelector = [
  '[role="treeitem"]',
  '[role="option"]',
  '[data-path]',
  '[data-folder-id]',
  '[data-id]',
  '.synofoto-folder-navigation-table-item',
  '.synofoto-tree-item',
  '.synofoto-tree-node',
  '.synofoto-folder-item',
  '.synofoto-folder-node',
  '.synofoto-folder-navigator-item',
  '.synofoto-folder-navigator-node',
  '.syno-tree-item',
  '.syno-tree-node',
  '.syno-list-item',
  'li',
].join(', ');
const destinationCandidateSelector = [
  '[role="treeitem"]',
  '[role="option"]',
  '[role="row"]',
  '[role="button"]',
  'button',
  '.synofoto-folder-navigation-table-item',
  '.synofoto-tree-item',
  '.synofoto-tree-node',
  '.synofoto-selector-item',
  '.synofoto-file-browser-item',
  '.syno-tree-item',
  '.syno-tree-node',
  '.syno-list-item',
  'li',
].join(', ');
const destinationSelectionSelector = [
  '[aria-selected="true"]',
  '[aria-current="true"]',
  '[data-selected="true"]',
  '.selected',
  '.is-selected',
  '.active',
  '.checked',
  '.current',
].join(', ');
const destinationIgnoredTexts = [
  'Kopiëren naar',
  'Copy to',
  'Verplaatsen naar',
  'Move to',
  'Annuleren',
  'Cancel',
];

const destinationStore = {
  values: {},
  ready: null,
};
const destinationDialogState = new WeakMap();
const observedDestinationDialogs = new WeakSet();
let destinationDialogsInitialized = false;

function getDestinationScope() {
  return window.location.origin;
}

function dedupeTextList(values) {
  const uniqueValues = [];
  values.forEach((value) => {
    const text = normalizeText(value);
    if (!text) return;
    if (uniqueValues[uniqueValues.length - 1] === text) return;
    if (!uniqueValues.includes(text)) uniqueValues.push(text);
  });
  return uniqueValues;
}

function readFromWindowStorage(key, fallbackValue) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallbackValue;
  } catch (_error) {
    return fallbackValue;
  }
}

function writeToWindowStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_error) {
    // Ignore storage errors and continue without persistence.
  }
}

function canUseExtensionStorage() {
  try {
    return typeof chrome !== 'undefined'
      && Boolean(chrome.runtime?.id)
      && Boolean(chrome.storage?.local);
  } catch (_error) {
    return false;
  }
}

function loadStoredDestinations() {
  return new Promise((resolve) => {
    if (canUseExtensionStorage()) {
      try {
        chrome.storage.local.get([destinationStorageKey], (result) => {
          if (chrome.runtime?.lastError) {
            destinationStore.values = readFromWindowStorage(destinationStorageKey, {});
            resolve(destinationStore.values);
            return;
          }

          destinationStore.values = result[destinationStorageKey] || {};
          resolve(destinationStore.values);
        });
        return;
      } catch (_error) {
        destinationStore.values = readFromWindowStorage(destinationStorageKey, {});
        resolve(destinationStore.values);
        return;
      }
    }

    destinationStore.values = readFromWindowStorage(destinationStorageKey, {});
    resolve(destinationStore.values);
  });
}

function persistStoredDestinations() {
  if (canUseExtensionStorage()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [destinationStorageKey]: destinationStore.values }, () => {
          if (chrome.runtime?.lastError) {
            writeToWindowStorage(destinationStorageKey, destinationStore.values);
          }

          resolve();
        });
      } catch (_error) {
        writeToWindowStorage(destinationStorageKey, destinationStore.values);
        resolve();
      }
    });
  }

  writeToWindowStorage(destinationStorageKey, destinationStore.values);
  return Promise.resolve();
}

function saveToExtensionStorage(key, value) {
  if (canUseExtensionStorage()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime?.lastError) {
            writeToWindowStorage(key, value);
          }

          resolve();
        });
      } catch (_error) {
        writeToWindowStorage(key, value);
        resolve();
      }
    });
  }

  writeToWindowStorage(key, value);
  return Promise.resolve();
}

function writeDebugStorageMarker() {
  const randomValue = `debug-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return saveToExtensionStorage(debugStorageKey, {
    value: randomValue,
    savedAt: new Date().toISOString(),
    href: window.location.href,
  });
}

function getElementClasses(element) {
  if (!element?.classList) return [];
  return Array.from(element.classList);
}

function getElementDataset(element) {
  if (!element?.dataset) return {};
  return { ...element.dataset };
}

function buildSelectionDebugPayload(reason, dialog, candidate, extra = {}) {
  return {
    reason,
    savedAt: new Date().toISOString(),
    href: window.location.href,
    candidateText: getElementText(candidate),
    candidateClasses: getElementClasses(candidate),
    candidateDataset: getElementDataset(candidate),
    candidateAriaSelected: candidate?.getAttribute?.('aria-selected') || null,
    candidateAriaChecked: candidate?.getAttribute?.('aria-checked') || null,
    candidateDataPath: candidate?.getAttribute?.('data-path') || null,
    navigatorFound: Boolean(findDestinationNavigator(dialog)),
    dialogType: destinationDialogState.get(dialog)?.type || null,
    extra,
  };
}

async function writeSelectionDebug(reason, dialog, candidate, extra = {}) {
  await saveToExtensionStorage(
    debugSelectionStorageKey,
    buildSelectionDebugPayload(reason, dialog, candidate, extra),
  );
}

async function writeDialogDebug(reason, dialog, extra = {}) {
  await saveToExtensionStorage(debugDialogStorageKey, {
    reason,
    savedAt: new Date().toISOString(),
    href: window.location.href,
    dialogType: destinationDialogState.get(dialog)?.type || inferDestinationDialogType(dialog),
    dialogClasses: getElementClasses(dialog),
    dialogText: normalizeText(dialog.textContent).slice(0, 400),
    navigatorFound: Boolean(findDestinationNavigator(dialog)),
    navigatorSelector: destinationNavigatorSelector,
    extra,
  });
}

function getStoredDestination(type) {
  return destinationStore.values[getDestinationScope()]?.[type] || null;
}

function areDestinationsEqual(left, right) {
  if (!left || !right) return false;

  const leftPath = Array.isArray(left.path) ? left.path.map(normalizeKey) : [];
  const rightPath = Array.isArray(right.path) ? right.path.map(normalizeKey) : [];

  return normalizeKey(left.label) === normalizeKey(right.label)
    && leftPath.length === rightPath.length
    && leftPath.every((segment, index) => segment === rightPath[index]);
}

async function saveStoredDestination(type, destination) {
  const scope = getDestinationScope();

  if (!destinationStore.values[scope]) {
    destinationStore.values[scope] = {};
  }

  destinationStore.values[scope][type] = destination;
  await persistStoredDestinations();
}

function isIgnoredDestinationText(text) {
  return matchesAnyText(text, destinationIgnoredTexts);
}

function findDestinationDialogContainer(element) {
  return element.closest(
    '[role="dialog"], [aria-modal="true"], .synofoto-dialog, .synofoto-modal, [class*="dialog"], [class*="modal"]',
  );
}

function findDestinationNavigator(dialog) {
  if (dialog.matches?.(destinationNavigatorSelector)) {
    return dialog;
  }

  return dialog.querySelector(destinationNavigatorSelector);
}

function inferDestinationDialogType(dialog) {
  const dialogText = normalizeKey(dialog.textContent);

  for (const [type, config] of Object.entries(destinationDialogConfigs)) {
    if (getDestinationDialogConfirmButton(dialog, type)) {
      return type;
    }

    if (config.confirmTexts.some(text => dialogText.includes(normalizeKey(text)))) {
      return type;
    }
  }

  return 'copy';
}

function getDestinationDialogConfirmButton(dialog, type) {
  const confirmTexts = destinationDialogConfigs[type]?.confirmTexts || [];
  return Array.from(dialog.querySelectorAll('button, [role="button"]')).find(button => (
    isVisible(button) && matchesAnyText(getButtonText(button), confirmTexts)
  )) || null;
}

function findOpenDestinationDialogs() {
  const foundDialogs = [];
  const seenDialogs = new Set();

  const navigators = document.querySelectorAll(destinationNavigatorSelector);
  navigators.forEach((navigator) => {
    if (!isVisible(navigator)) return;

    const dialog = findDestinationDialogContainer(navigator) || navigator;
    if (seenDialogs.has(dialog)) return;

    seenDialogs.add(dialog);
    foundDialogs.push({ type: inferDestinationDialogType(dialog), dialog });
  });

  const navigationItems = document.querySelectorAll('.synofoto-folder-navigation-table-item');
  navigationItems.forEach((item) => {
    if (!isVisible(item)) return;

    const dialog = findDestinationDialogContainer(item);
    if (!dialog || seenDialogs.has(dialog)) return;

    seenDialogs.add(dialog);
    foundDialogs.push({ type: inferDestinationDialogType(dialog), dialog });
  });

  Object.entries(destinationDialogConfigs).forEach(([type, config]) => {
    const buttons = document.querySelectorAll('button, [role="button"]');
    buttons.forEach((button) => {
      if (!isVisible(button) || !matchesAnyText(getButtonText(button), config.confirmTexts)) return;

      const dialog = findDestinationDialogContainer(button);
      if (!dialog || seenDialogs.has(dialog)) return;

      seenDialogs.add(dialog);
      foundDialogs.push({ type, dialog });
    });
  });

  return foundDialogs;
}

function getDestinationBreadcrumbPath(dialog) {
  const breadcrumbContainers = dialog.querySelectorAll(
    '[aria-label*="breadcrumb" i], [class*="breadcrumb"], nav[aria-label*="breadcrumb" i]',
  );

  for (const container of breadcrumbContainers) {
    const segments = dedupeTextList(
      Array.from(container.querySelectorAll('button, [role="button"], a, span'))
        .map(node => normalizeText(node.textContent))
        .filter(text => text && !isIgnoredDestinationText(text)),
    );

    if (segments.length > 0 && segments.length <= 8) {
      return segments;
    }
  }

  return [];
}

function buildDestinationFromElement(dialog, element) {
  const label = getElementText(element);
  if (!label || isIgnoredDestinationText(label) || label.length > 120) return null;

  const path = dedupeTextList([
    ...getDestinationBreadcrumbPath(dialog),
    ...normalizeText(element.getAttribute?.('data-path')).split('/'),
    label,
  ]);

  return {
    label,
    path,
    savedAt: Date.now(),
  };
}

function isDestinationCandidate(element, dialog) {
  if (!element || !dialog.contains(element) || !isVisible(element)) return false;

  const label = getElementText(element);
  if (!label || isIgnoredDestinationText(label) || label.length > 120) return false;

  if (element.matches('button, [role="button"]')) {
    const listLikeContainer = element.closest(
      '[role="tree"], [role="listbox"], [role="grid"], [class*="tree"], [class*="list"], [class*="browser"], [class*="selector"]',
    );
    if (!listLikeContainer || listLikeContainer === dialog) return false;
  }

  const dialogConfirmButton = getDestinationDialogConfirmButton(dialog, destinationDialogState.get(dialog)?.type || 'copy');
  if (dialogConfirmButton && (element === dialogConfirmButton || dialogConfirmButton.contains(element))) return false;

  const footerContainer = element.closest('[class*="footer"]');
  return !footerContainer || !dialog.contains(footerContainer);
}

function collectDestinationCandidates(dialog) {
  const navigator = findDestinationNavigator(dialog);
  if (navigator) {
    return Array.from(navigator.querySelectorAll(destinationNavigatorItemSelector))
      .filter(element => isDestinationCandidate(element, dialog));
  }

  return Array.from(dialog.querySelectorAll(destinationCandidateSelector))
    .filter(element => isDestinationCandidate(element, dialog));
}

function isDestinationSelected(element) {
  return element.matches(destinationSelectionSelector)
    || Boolean(element.closest(destinationSelectionSelector))
    || element.getAttribute('aria-checked') === 'true';
}

function captureSelectedDestination(dialog) {
  const navigator = findDestinationNavigator(dialog);
  if (navigator) {
    const activeDescendantId = navigator.getAttribute('aria-activedescendant');
    if (activeDescendantId) {
      const activeElement = document.getElementById(activeDescendantId);
      const activeDestination = buildDestinationFromElement(dialog, activeElement);
      if (activeDestination) return activeDestination;
    }
  }

  const selectedCandidate = collectDestinationCandidates(dialog)
    .find(candidate => isDestinationSelected(candidate));

  return buildDestinationFromElement(dialog, selectedCandidate);
}

function findDestinationCandidateByLabel(dialog, label) {
  const normalizedLabel = normalizeKey(label);
  if (!normalizedLabel) return null;

  const candidates = collectDestinationCandidates(dialog);
  const exactMatch = candidates.find(candidate => normalizeKey(getElementText(candidate)) === normalizedLabel);
  if (exactMatch) return exactMatch;

  return candidates.find(candidate => normalizeKey(getElementText(candidate)).includes(normalizedLabel)) || null;
}

function getRestoreLabels(destination) {
  return dedupeTextList([
    ...(Array.isArray(destination?.path) ? destination.path : []),
    destination?.label,
  ]);
}

async function persistCapturedDestination(dialog, destination) {
  const state = destinationDialogState.get(dialog);
  if (!state || state.restoreInProgress || !destination) return;

  await destinationStore.ready;

  const storedDestination = getStoredDestination(state.type);
  if (areDestinationsEqual(storedDestination, destination)) return;

  await saveStoredDestination(state.type, destination);
  await writeSelectionDebug('persist-captured-destination', dialog, state.lastInteractedCandidate, {
    destination,
  });
}

function scheduleDestinationCapture(dialog, delay = 120, options = {}) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  if (state.captureTimer) {
    window.clearTimeout(state.captureTimer);
  }

  state.captureTimer = window.setTimeout(() => {
    const capturedDestination = captureSelectedDestination(dialog) || state.lastCapturedDestination;
    state.lastCapturedDestination = capturedDestination;

    if (options.persist && capturedDestination) {
      void persistCapturedDestination(dialog, capturedDestination);
    }

    state.captureTimer = null;
  }, delay);
}

async function persistDestinationFromDialog(dialog) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  state.lastCapturedDestination = captureSelectedDestination(dialog) || state.lastCapturedDestination;
  if (!state.lastCapturedDestination) return;

  await destinationStore.ready;
  await saveStoredDestination(state.type, state.lastCapturedDestination);
  await writeSelectionDebug('persist-on-confirm', dialog, state.lastInteractedCandidate, {
    destination: state.lastCapturedDestination,
  });
}

async function restoreDestinationForDialog(dialog) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  await destinationStore.ready;

  const storedDestination = getStoredDestination(state.type);
  if (!storedDestination) return;

  let attempts = 0;
  const labelsToRestore = getRestoreLabels(storedDestination);

  const tryRestore = () => {
    if (!document.contains(dialog)) return;

    const latestState = destinationDialogState.get(dialog);
    if (!latestState || latestState.restoreComplete) return;

    latestState.restoreInProgress = true;

    const currentSelection = captureSelectedDestination(dialog);
    if (currentSelection && normalizeKey(currentSelection.label) === normalizeKey(storedDestination.label)) {
      latestState.restoreComplete = true;
      latestState.restoreInProgress = false;
      return;
    }

    for (const label of labelsToRestore) {
      const candidate = findDestinationCandidateByLabel(dialog, label);
      if (!candidate) continue;

      candidate.click();
      latestState.lastCapturedDestination = buildDestinationFromElement(dialog, candidate) || latestState.lastCapturedDestination;

      if (normalizeKey(getElementText(candidate)) === normalizeKey(storedDestination.label)) {
        latestState.restoreComplete = true;
      }

      break;
    }

    attempts += 1;
    if (!latestState.restoreComplete && attempts < 12) {
      window.setTimeout(tryRestore, 250);
      return;
    }

    latestState.restoreInProgress = false;
  };

  window.setTimeout(tryRestore, 150);
}

function handleDestinationDialogClick(dialog, event) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  const navigator = findDestinationNavigator(dialog);
  if (navigator && navigator.contains(event.target)) {
    const navigatorCandidate = event.target.closest(destinationNavigatorItemSelector);
    if (navigatorCandidate && isDestinationCandidate(navigatorCandidate, dialog)) {
      state.lastInteractedCandidate = navigatorCandidate;
      state.lastCapturedDestination = buildDestinationFromElement(dialog, navigatorCandidate) || state.lastCapturedDestination;
      void writeSelectionDebug('navigator-item-click', dialog, navigatorCandidate, {
        destination: state.lastCapturedDestination,
      });
    } else {
      void writeSelectionDebug('navigator-non-item-click', dialog, event.target, {
        targetTagName: event.target?.tagName || null,
      });
    }

    scheduleDestinationCapture(dialog, 150, { persist: true });
  }

  const clickedControl = event.target.closest(destinationCandidateSelector);
  if (!clickedControl || !dialog.contains(clickedControl)) return;

  const confirmButton = getDestinationDialogConfirmButton(dialog, state.type);
  if (confirmButton && (clickedControl === confirmButton || confirmButton.contains(clickedControl))) {
    window.setTimeout(() => {
      void persistDestinationFromDialog(dialog);
    }, 0);
    return;
  }

  if (!isDestinationCandidate(clickedControl, dialog)) return;

  state.lastInteractedCandidate = clickedControl;
  state.lastCapturedDestination = buildDestinationFromElement(dialog, clickedControl) || state.lastCapturedDestination;
  void writeSelectionDebug('generic-candidate-click', dialog, clickedControl, {
    destination: state.lastCapturedDestination,
  });
  scheduleDestinationCapture(dialog, 120, { persist: true });
}

function wireDestinationDialog(dialog, type) {
  if (observedDestinationDialogs.has(dialog)) return;

  observedDestinationDialogs.add(dialog);
  destinationDialogState.set(dialog, {
    type,
    captureTimer: null,
    lastCapturedDestination: null,
    lastInteractedCandidate: null,
    restoreComplete: false,
    restoreInProgress: false,
  });

  dialog.addEventListener('click', event => handleDestinationDialogClick(dialog, event), true);
  dialog.addEventListener('keydown', (event) => {
    const navigator = findDestinationNavigator(dialog);
    const navigatorIsActive = navigator && (navigator.contains(event.target) || navigator.contains(document.activeElement));

    if (
      navigatorIsActive
      && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)
    ) {
      void writeSelectionDebug('navigator-keydown', dialog, document.activeElement, {
        key: event.key,
      });
      scheduleDestinationCapture(dialog, 180, { persist: true });
    }

    if (event.key === 'Enter') {
      window.setTimeout(() => {
        void persistDestinationFromDialog(dialog);
      }, 0);
    }
  }, true);

  void writeDialogDebug('wire-dialog', dialog, { type });
  void restoreDestinationForDialog(dialog);
}

let destinationDialogScanScheduled = false;

function scanDestinationDialogs() {
  findOpenDestinationDialogs().forEach(({ type, dialog }) => {
    void writeDialogDebug('scan-found-dialog', dialog, { type });
    wireDestinationDialog(dialog, type);
  });
}

function scheduleDestinationDialogScan() {
  if (destinationDialogScanScheduled) return;

  destinationDialogScanScheduled = true;
  window.setTimeout(() => {
    destinationDialogScanScheduled = false;
    scanDestinationDialogs();
  }, 50);
}

function initializeDestinationDialogs() {
  if (destinationDialogsInitialized) return;

  destinationStore.ready = destinationStore.ready || loadStoredDestinations();
  void writeDebugStorageMarker();

  if (!document.body) {
    document.addEventListener('DOMContentLoaded', initializeDestinationDialogs, { once: true });
    return;
  }

  destinationDialogsInitialized = true;

  const observer = new MutationObserver(() => {
    scheduleDestinationDialogScan();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('click', scheduleDestinationDialogScan, true);
  scheduleDestinationDialogScan();
}

function startDestinationDialogWatch(reason) {
  void writeDialogDebug('start-watch', document.body || document.documentElement, { reason });
  scheduleDestinationDialogScan();

  [150, 400, 900].forEach((delay) => {
    window.setTimeout(() => {
      scheduleDestinationDialogScan();
    }, delay);
  });
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

  startDestinationDialogWatch('copy-shortcut');
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

initializeDestinationDialogs();

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
