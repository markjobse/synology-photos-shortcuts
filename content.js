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

function getElementTextVariants(element) {
  if (!element) return [];

  const variants = dedupeTextList([
    element.getAttribute?.('aria-label'),
    element.getAttribute?.('title'),
    element.getAttribute?.('data-path'),
    element.getAttribute?.('data-name'),
    element.getAttribute?.('data-label'),
    element.querySelector?.('.button-text')?.textContent,
    element.querySelector?.('[class*="label"]')?.textContent,
    element.querySelector?.('[class*="name"]')?.textContent,
    element.querySelector?.('[class*="title"]')?.textContent,
    element.textContent,
  ].flatMap(value => splitDestinationPath(value)));

  return variants.filter(text => text && !isIgnoredDestinationText(text));
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

function waitForDelay(delay) {
  return new Promise(resolve => window.setTimeout(resolve, delay));
}

function isScrollableElement(element) {
  if (!element || !isVisible(element)) return false;

  const style = window.getComputedStyle(element);
  const overflowY = style.overflowY || style.overflow;
  return ['auto', 'scroll', 'overlay'].includes(overflowY)
    && element.scrollHeight - element.clientHeight > 24;
}

function getDestinationScrollContainers(dialog) {
  const containers = [];
  const navigator = findDestinationNavigator(dialog);
  const sampleCandidate = navigator?.querySelector(destinationNavigatorItemSelector)
    || dialog.querySelector(destinationCandidateSelector);

  let current = sampleCandidate;
  while (current && dialog.contains(current)) {
    if (isScrollableElement(current) && !containers.includes(current)) {
      containers.push(current);
    }

    if (current === dialog) break;
    current = current.parentElement;
  }

  if (navigator && isScrollableElement(navigator) && !containers.includes(navigator)) {
    containers.push(navigator);
  }

  return containers;
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
    confirmTexts: ['Kopieren naar', 'Kopiëren naar', 'Copy to'],
  },
  move: {
    confirmTexts: ['Verplaatsen naar', 'Move to'],
  },
};

const destinationStorageKey = 'synologyPhotosShortcuts:lastDestinations:v1';
const legacyDebugStorageKeys = [
  'synologyPhotosShortcuts:debugMarker',
  'synologyPhotosShortcuts:debugSelection',
  'synologyPhotosShortcuts:debugDialog',
  'synologyPhotosShortcuts:debugBreadcrumbs',
  'synologyPhotosShortcuts:debugRestore',
];
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
  ...destinationDialogConfigs.copy.confirmTexts,
  ...destinationDialogConfigs.move.confirmTexts,
  'Annuleren',
  'Cancel',
];
const destinationRootLabels = ['Root', 'All photos', 'All Photos', "Alle foto's"];
const actionTexts = {
  cancel: ['Annuleren', 'Cancel'],
  editTags: ['Tags bewerken', 'Bewerk tags', 'Edit tags'],
  information: ['Informatie', 'Information', 'Info'],
  rotate: ['Draaien', 'Rotate'],
  addToAlbum: ['Toevoegen aan Album', 'Toevoegen aan album', 'Add to Album', 'Add to album'],
  copyTo: destinationDialogConfigs.copy.confirmTexts,
  delete: ['Verwijderen', 'Delete'],
  original: ['Origineel', 'Original'],
};

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

function removeFromWindowStorage(keys) {
  keys.forEach((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch (_error) {
      // Ignore storage cleanup errors.
    }
  });
}

function cleanupLegacyDebugStorage() {
  removeFromWindowStorage(legacyDebugStorageKeys);

  if (canUseExtensionStorage()) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.remove(legacyDebugStorageKeys, () => {
          removeFromWindowStorage(legacyDebugStorageKeys);
          resolve();
        });
      } catch (_error) {
        removeFromWindowStorage(legacyDebugStorageKeys);
        resolve();
      }
    });
  }

  return Promise.resolve();
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

function getDestinationBreadcrumbPrefixSegments(dialog) {
  const menuLists = Array.from(document.querySelectorAll('.synofoto-menu-list'))
    .filter(menuList => isVisible(menuList));

  let firstNonEmptySegments = [];
  for (const menuList of menuLists) {
    const segments = dedupeTextList(
      Array.from(menuList.querySelectorAll('.synofoto-menu-text-button'))
        .map(button => getButtonText(button))
        .filter(text => text && text !== '...' && !isIgnoredDestinationText(text)),
    );

    if (segments.length === 0) continue;
    if (firstNonEmptySegments.length === 0) {
      firstNonEmptySegments = segments;
    }

    if (segments.some(segment => isRootDestinationSegment(segment))) {
      return segments;
    }
  }

  return firstNonEmptySegments;
}

function getDestinationBreadcrumbPath(dialog) {
  const breadcrumbMeasures = Array.from(dialog.querySelectorAll('.synofoto-breadcrumbs-measure'));

  for (const measure of breadcrumbMeasures) {
    const hasActiveBreadcrumb = Boolean(measure.querySelector('.synofoto-breadcrumbs-link.activate'));
    if (!hasActiveBreadcrumb) continue;

    const prefixSegments = getDestinationBreadcrumbPrefixSegments(dialog);
    const segments = [];

    Array.from(measure.children).forEach((child) => {
      if (child.matches('.synofoto-menu-button')) {
        const menuButton = child.querySelector('.synofoto-breadcrumb-menu-button');
        const menuButtonText = getButtonText(menuButton);

        if (menuButtonText === '...') {
          segments.push(...prefixSegments);
        } else if (menuButtonText && !isIgnoredDestinationText(menuButtonText)) {
          segments.push(menuButtonText);
        }

        return;
      }

      if (!child.matches('.synofoto-breadcrumbs-menu')) return;

      const breadcrumbLink = child.querySelector('.synofoto-breadcrumbs-link');
      const breadcrumbText = normalizeText(
        breadcrumbLink?.querySelector('.button-text')?.textContent
        || breadcrumbLink?.textContent,
      );

      if (!breadcrumbText || breadcrumbText === '...' || isIgnoredDestinationText(breadcrumbText)) return;
      segments.push(breadcrumbText);
    });

    const resolvedSegments = dedupeTextList(segments);
    if (resolvedSegments.length > 0) {
      return resolvedSegments;
    }
  }

  return [];
}

function splitDestinationPath(value) {
  return normalizeText(value)
    .split(/[\\/]+/)
    .map(segment => normalizeText(segment))
    .filter(Boolean);
}

function isRootDestinationSegment(segment) {
  return matchesAnyText(segment, destinationRootLabels);
}

function getDestinationPathSegments(destination) {
  const pathSegments = Array.isArray(destination?.path)
    ? destination.path.flatMap(segment => splitDestinationPath(segment))
    : [];

  const segments = dedupeTextList([
    ...pathSegments,
    destination?.label,
  ]);

  if (segments.length > 1 && isRootDestinationSegment(segments[0])) {
    return segments.slice(1);
  }

  return segments;
}

function getDestinationRestoreSegments(destination) {
  return getDestinationPathSegments(destination);
}

function stripRootDestinationSegments(segments) {
  if (segments.length > 1 && isRootDestinationSegment(segments[0])) {
    return segments.slice(1);
  }

  return segments;
}

function getCurrentDestinationPathSegments(dialog) {
  return stripRootDestinationSegments(
    dedupeTextList(getDestinationBreadcrumbPath(dialog).flatMap(segment => splitDestinationPath(segment))),
  );
}

function getCommonDestinationPathLength(left, right) {
  const maxLength = Math.min(left.length, right.length);
  let index = 0;

  while (index < maxLength && normalizeKey(left[index]) === normalizeKey(right[index])) {
    index += 1;
  }

  return index;
}

function getDestinationCandidateLevel(element, dialog) {
  const levelAttributes = [
    element?.getAttribute?.('aria-level'),
    element?.getAttribute?.('data-level'),
    element?.getAttribute?.('data-depth'),
  ];

  for (const value of levelAttributes) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  let ancestorDepth = 0;
  let parentCandidate = element?.parentElement?.closest?.(destinationCandidateSelector) || null;

  while (parentCandidate && dialog.contains(parentCandidate)) {
    ancestorDepth += 1;
    parentCandidate = parentCandidate.parentElement?.closest?.(destinationCandidateSelector) || null;
  }

  if (ancestorDepth > 0) {
    return ancestorDepth + 1;
  }

  const navigator = findDestinationNavigator(dialog);
  if (navigator?.getAttribute('role') === 'tree') {
    return 1;
  }

  return null;
}

function getDestinationPathFromVisibleLevels(dialog, element) {
  const candidates = collectDestinationCandidates(dialog);
  const candidateIndex = candidates.indexOf(element);
  if (candidateIndex === -1) return [];

  const currentLevel = getDestinationCandidateLevel(element, dialog);
  if (!currentLevel || currentLevel <= 1) {
    return [getElementText(element)].filter(Boolean);
  }

  const path = [getElementText(element)].filter(Boolean);
  let targetLevel = currentLevel - 1;

  for (let index = candidateIndex - 1; index >= 0 && targetLevel >= 1; index -= 1) {
    const candidate = candidates[index];
    const candidateLevel = getDestinationCandidateLevel(candidate, dialog);
    if (!candidateLevel || candidateLevel !== targetLevel) continue;

    path.unshift(getElementText(candidate));
    targetLevel -= 1;
  }

  return path.filter(Boolean);
}

function getDestinationElementPath(dialog, element, label) {
  const breadcrumbPath = getDestinationBreadcrumbPath(dialog);
  const hierarchyPath = breadcrumbPath.length === 0
    ? getDestinationPathFromVisibleLevels(dialog, element)
    : [];

  return dedupeTextList([
    ...breadcrumbPath,
    ...hierarchyPath,
    ...splitDestinationPath(element.getAttribute?.('data-path')),
    label,
  ]);
}

function buildDestinationFromBreadcrumbs(dialog, preferredLabel = '') {
  const breadcrumbPath = dedupeTextList(
    getDestinationBreadcrumbPath(dialog).flatMap(segment => splitDestinationPath(segment)),
  );
  if (breadcrumbPath.length === 0) return null;

  const expectedLabel = normalizeText(preferredLabel);
  const lastSegment = breadcrumbPath[breadcrumbPath.length - 1] || expectedLabel;
  const breadcrumbContainsExpected = !expectedLabel || breadcrumbPath.some(
    segment => normalizeKey(segment) === normalizeKey(expectedLabel),
  );

  if (expectedLabel && !breadcrumbContainsExpected && normalizeKey(lastSegment) !== normalizeKey(expectedLabel)) {
    return null;
  }

  return {
    label: lastSegment,
    path: breadcrumbPath,
    savedAt: Date.now(),
  };
}

function buildDestinationFromElement(dialog, element) {
  const label = getElementText(element);
  if (!label || isIgnoredDestinationText(label) || label.length > 120) return null;

  const path = getDestinationElementPath(dialog, element, label);

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
  const exactMatch = candidates.find(candidate => (
    getElementTextVariants(candidate).some(variant => normalizeKey(variant) === normalizedLabel)
  ));
  if (exactMatch) return exactMatch;

  return candidates.find(candidate => (
    getElementTextVariants(candidate).some(variant => normalizeKey(variant).includes(normalizedLabel))
  )) || null;
}

async function findDestinationCandidateByLabelWithScroll(dialog, label) {
  const directMatch = findDestinationCandidateByLabel(dialog, label);
  if (directMatch) {
    return directMatch;
  }

  const scrollContainers = getDestinationScrollContainers(dialog);
  if (scrollContainers.length === 0) {
    return null;
  }

  for (const container of scrollContainers) {
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    if (maxScrollTop <= 0) continue;

    const step = Math.max(Math.floor(container.clientHeight * 0.85), 120);
    const visitedPositions = new Set();

    const visitPosition = async (scrollTop) => {
      const boundedScrollTop = Math.max(0, Math.min(maxScrollTop, Math.round(scrollTop)));
      if (visitedPositions.has(boundedScrollTop)) return;

      visitedPositions.add(boundedScrollTop);
      container.scrollTop = boundedScrollTop;
      container.dispatchEvent(new Event('scroll', { bubbles: true }));
      await waitForDelay(150);
    };

    await visitPosition(0);
    let candidate = findDestinationCandidateByLabel(dialog, label);
    if (candidate) {
      return candidate;
    }

    while (container.scrollTop < maxScrollTop - 1) {
      const nextScrollTop = Math.min(maxScrollTop, container.scrollTop + step);
      await visitPosition(nextScrollTop);

      candidate = findDestinationCandidateByLabel(dialog, label);
      if (candidate) {
        return candidate;
      }
    }
  }

  return null;
}

async function persistCapturedDestination(dialog, destination) {
  const state = destinationDialogState.get(dialog);
  if (!state || state.restoreInProgress || !destination) return;

  await destinationStore.ready;

  const storedDestination = getStoredDestination(state.type);
  if (areDestinationsEqual(storedDestination, destination)) return;

  await saveStoredDestination(state.type, destination);
  state.pendingSelectionLabel = null;
}

function scheduleBreadcrumbDestinationCapture(dialog, preferredLabel) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  state.pendingSelectionLabel = normalizeText(preferredLabel);

  if (state.breadcrumbCaptureTimer) {
    window.clearTimeout(state.breadcrumbCaptureTimer);
  }

  let attempts = 0;
  const tryCapture = () => {
    const latestState = destinationDialogState.get(dialog);
    if (!latestState || !document.contains(dialog)) return;

    const capturedFromBreadcrumbs = buildDestinationFromBreadcrumbs(dialog, latestState.pendingSelectionLabel);
    if (capturedFromBreadcrumbs) {
      latestState.lastCapturedDestination = capturedFromBreadcrumbs;
      void persistCapturedDestination(dialog, capturedFromBreadcrumbs);
      latestState.breadcrumbCaptureTimer = null;
      return;
    }

    attempts += 1;
    if (attempts < 8) {
      latestState.breadcrumbCaptureTimer = window.setTimeout(tryCapture, 180);
      return;
    }

    const fallbackDestination = captureSelectedDestination(dialog) || latestState.lastCapturedDestination;
    if (fallbackDestination) {
      latestState.lastCapturedDestination = fallbackDestination;
      void persistCapturedDestination(dialog, fallbackDestination);
    }

    latestState.breadcrumbCaptureTimer = null;
  };

  state.breadcrumbCaptureTimer = window.setTimeout(tryCapture, 150);
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

  state.lastCapturedDestination = buildDestinationFromBreadcrumbs(dialog, state.pendingSelectionLabel)
    || captureSelectedDestination(dialog)
    || state.lastCapturedDestination;
  if (!state.lastCapturedDestination) return;

  await destinationStore.ready;
  await saveStoredDestination(state.type, state.lastCapturedDestination);
  state.pendingSelectionLabel = null;
}

async function restoreDestinationForDialog(dialog) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  await destinationStore.ready;

  const storedDestination = getStoredDestination(state.type);
  if (!storedDestination) return;

  state.restoreConfirmedPrefixLength = 0;
  let attempts = 0;
  const restoreSegments = getDestinationRestoreSegments(storedDestination);
  if (restoreSegments.length === 0) return;

  const scheduleTryRestore = (delay) => {
    window.setTimeout(() => {
      void tryRestore();
    }, delay);
  };

  const waitForRestoreProgress = (clickedSegmentIndex, clickedSegment, baselinePath) => {
    let checks = 0;

    const checkProgress = () => {
      if (!document.contains(dialog)) return;

      const latestState = destinationDialogState.get(dialog);
      if (!latestState || latestState.restoreComplete) return;

      const currentPath = getCurrentDestinationPathSegments(dialog);
      const currentSelection = captureSelectedDestination(dialog);
      const currentPathLength = getCommonDestinationPathLength(currentPath, restoreSegments);
      const isFinalSegment = clickedSegmentIndex >= restoreSegments.length - 1;
      const pathChanged = normalizeKey(currentPath.join('/')) !== normalizeKey(baselinePath.join('/'));
      const pathAdvanced = pathChanged && currentPathLength > clickedSegmentIndex;
      const finalSegmentSelected = isFinalSegment
        && currentSelection
        && normalizeKey(currentSelection.label) === normalizeKey(clickedSegment);

      if (pathAdvanced || finalSegmentSelected) {
        latestState.restoreConfirmedPrefixLength = Math.max(
          latestState.restoreConfirmedPrefixLength || 0,
          currentPathLength,
        );
        scheduleTryRestore(250);
        return;
      }

      checks += 1;
      if (checks < 10) {
        window.setTimeout(checkProgress, 250);
        return;
      }

      scheduleTryRestore(700);
    };

    window.setTimeout(checkProgress, 250);
  };

  const tryRestore = async () => {
    if (!document.contains(dialog)) return;

    const latestState = destinationDialogState.get(dialog);
    if (!latestState || latestState.restoreComplete || latestState.restoreInProgress) return;

    latestState.restoreInProgress = true;

    const currentPath = getCurrentDestinationPathSegments(dialog);
    const currentSelection = captureSelectedDestination(dialog);
    const currentPathLength = getCommonDestinationPathLength(currentPath, restoreSegments);
    const confirmedPrefixLength = latestState.restoreConfirmedPrefixLength || 0;
    const currentPathMatchesTarget = currentPathLength === restoreSegments.length
      && currentPath.length === restoreSegments.length;

    if (
      currentPathMatchesTarget
      || (currentSelection && normalizeKey(currentSelection.label) === normalizeKey(storedDestination.label))
    ) {
      latestState.restoreComplete = true;
      latestState.restoreInProgress = false;
      return;
    }

    const nextSegmentIndex = Math.min(confirmedPrefixLength, restoreSegments.length - 1);
    const nextSegment = restoreSegments[nextSegmentIndex];
    const candidate = await findDestinationCandidateByLabelWithScroll(dialog, nextSegment);
    const refreshedState = destinationDialogState.get(dialog);

    if (!document.contains(dialog) || !refreshedState || refreshedState.restoreComplete) {
      if (refreshedState) {
        refreshedState.restoreInProgress = false;
      }
      return;
    }

    if (candidate) {
      refreshedState.lastInteractedCandidate = candidate;
      try {
        candidate.scrollIntoView({ block: 'nearest' });
      } catch (_error) {
        // Ignore scroll errors; clicking is still attempted below.
      }
      candidate.click();
      refreshedState.lastCapturedDestination = buildDestinationFromElement(dialog, candidate) || refreshedState.lastCapturedDestination;

      attempts = 0;
      refreshedState.restoreInProgress = false;
      waitForRestoreProgress(nextSegmentIndex, nextSegment, currentPath);
      return;
    }

    if (currentPathLength > confirmedPrefixLength) {
      refreshedState.restoreConfirmedPrefixLength = currentPathLength;
      refreshedState.restoreInProgress = false;
      scheduleTryRestore(250);
      return;
    }

    attempts += 1;
    if (!refreshedState.restoreComplete && attempts < 14) {
      refreshedState.restoreInProgress = false;
      scheduleTryRestore(400);
      return;
    }

    refreshedState.restoreInProgress = false;
  };

  scheduleTryRestore(250);
}

function handleDestinationDialogClick(dialog, event) {
  const state = destinationDialogState.get(dialog);
  if (!state) return;

  const navigator = findDestinationNavigator(dialog);
  if (navigator && navigator.contains(event.target)) {
    const navigatorCandidate = event.target.closest(destinationNavigatorItemSelector);
    if (navigatorCandidate && isDestinationCandidate(navigatorCandidate, dialog)) {
      const clickedLabel = getElementText(navigatorCandidate);
      state.lastInteractedCandidate = navigatorCandidate;
      state.pendingSelectionLabel = clickedLabel;
      scheduleBreadcrumbDestinationCapture(dialog, clickedLabel);
    }
    return;
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

  const clickedLabel = getElementText(clickedControl);
  state.lastInteractedCandidate = clickedControl;
  state.pendingSelectionLabel = clickedLabel;
  scheduleBreadcrumbDestinationCapture(dialog, clickedLabel);
}

function wireDestinationDialog(dialog, type) {
  if (observedDestinationDialogs.has(dialog)) return;

  observedDestinationDialogs.add(dialog);
  destinationDialogState.set(dialog, {
    type,
    breadcrumbCaptureTimer: null,
    captureTimer: null,
    lastCapturedDestination: null,
    lastInteractedCandidate: null,
    pendingSelectionLabel: null,
    restoreConfirmedPrefixLength: 0,
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
      const activeLabel = getElementText(document.activeElement);
      state.pendingSelectionLabel = activeLabel;
      scheduleBreadcrumbDestinationCapture(dialog, activeLabel);
    }

    if (event.key === 'Enter') {
      window.setTimeout(() => {
        void persistDestinationFromDialog(dialog);
      }, 0);
    }
  }, true);

  void restoreDestinationForDialog(dialog);
}

let destinationDialogScanScheduled = false;

function scanDestinationDialogs() {
  findOpenDestinationDialogs().forEach(({ type, dialog }) => {
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
  void cleanupLegacyDebugStorage();

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

function startDestinationDialogWatch() {
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
    const deselectButton = findButtonByTooltip('.synofoto-icon-button', actionTexts.cancel);
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
  const editTagsButton = findButton('button.synofoto-menu-text-button', actionTexts.editTags);
  if (editTagsButton) {
    editTagsButton.click();
  } else {
    const infoButton = findButtonByTooltip('.synofoto-lightbox-toolbar-right-button', actionTexts.information);
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
  const rotateButton = findButton('.synofoto-menu-text-button', actionTexts.rotate);
  if (rotateButton) rotateButton.click();
}

// Action: Add to Album (Shift + A)
function addToAlbum() {
  const selectionButton = findButtonByTooltip('.synofoto-selected-bar-button', actionTexts.addToAlbum);
  if (selectionButton) {
    selectionButton.click();
  } else {
    const lightboxButton = findButton('.synofoto-menu-text-button', actionTexts.addToAlbum);
    if (lightboxButton) lightboxButton.click();
  }
}

// Action: Copy To (Shift + C)
function copyTo() {
  const selectionButton = findButtonByTooltip('.synofoto-selected-bar-button', actionTexts.copyTo);
  if (selectionButton) {
    selectionButton.click();
  } else {
    const lightboxButton = findButton('.synofoto-menu-text-button', actionTexts.copyTo);
    if (lightboxButton) lightboxButton.click();
  }

  startDestinationDialogWatch();
}

// Action: Open Delete Dialog (Shift + Delete or Shift + Back NORMSPACE)
function deleteDialog() {
  const selectionButton = findButtonByTooltip('.synofoto-selected-bar-button', actionTexts.delete);
  if (selectionButton) {
    selectionButton.click();
  } else {
    const lightboxButton = findButtonByTooltip('.synofoto-lightbox-toolbar-right-button', actionTexts.delete);
    if (lightboxButton) lightboxButton.click();
  }
}

// Action: Download (Shift + D)
function download() {
  const selectViewDownloadButton = findButton('.synofoto-menu-text-button', actionTexts.original)
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
