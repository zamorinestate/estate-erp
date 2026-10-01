'use strict';

import {
  ROLES,
} from './navigation.js';

import {
  pushNotification,
} from './notifications.js';

import {
  enqueuePopup,
} from './popup.js';

import {
  APP_VERSION,
} from './version.js';

let registration = null;
let updateAvailable = false;
let notifiedThisSession = false;
let reloadPending = false;
let updateCheckTimer = null;

const UPDATE_CHECK_INTERVAL_MS =
  30 * 60 * 1000;

export function getCurrentVersion() {
  return APP_VERSION;
}

export function isUpdateAvailable() {
  return updateAvailable;
}

function dispatchUpdateEvent() {
  window.dispatchEvent(
    new CustomEvent(
      'zamorin-update-available',
      {
        detail: {
          version: APP_VERSION,
        },
      }
    )
  );
}

function publishUpdateNotifications() {
  if (notifiedThisSession) {
    return;
  }

  notifiedThisSession = true;

  const managementNotification =
    pushNotification({
      category: 'System',
      severity: 'info',
      title:
        'A new Zamorin version is ready',
      message:
        'Open Settings when convenient to apply the update.',
      recipientRoles: [
        ROLES.MASTER,
        ROLES.OWNER,
        ROLES.CAFE_ADMIN,
      ],
      actionRequired: false,
      popupEligible: true,
      deepLink: 'settings',
    });

  const staffNotification =
    pushNotification({
      category: 'System',
      severity: 'info',
      title:
        'A new Zamorin version is ready',
      message:
        'Open Settings when convenient to apply the update.',
      recipientRoles: [
        ROLES.STAFF,
      ],
      actionRequired: false,
      popupEligible: true,
      deepLink: 'staff-settings',
    });

  if (managementNotification) {
    enqueuePopup(
      managementNotification
    );
  }

  if (staffNotification) {
    enqueuePopup(
      staffNotification
    );
  }
}

function markUpdateAvailable() {
  if (updateAvailable) {
    return;
  }

  updateAvailable = true;
  dispatchUpdateEvent();
  publishUpdateNotifications();
}

function observeInstallingWorker(
  installingWorker
) {
  if (!installingWorker) {
    return;
  }

  installingWorker.addEventListener(
    'statechange',
    () => {
      if (
        installingWorker.state ===
          'installed' &&
        navigator.serviceWorker.controller
      ) {
        markUpdateAvailable();
      }
    }
  );
}

function beginPeriodicUpdateChecks() {
  if (updateCheckTimer) {
    window.clearInterval(
      updateCheckTimer
    );
  }

  updateCheckTimer =
    window.setInterval(() => {
      registration
        ?.update()
        .catch(() => {});
    }, UPDATE_CHECK_INTERVAL_MS);
}

export async function registerServiceWorker() {
  if (
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return {
      supported: false,
      registered: false,
    };
  }

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    return { supported: true, registered: false };
  }

  try {
    registration =
      await navigator.serviceWorker.register(
        './sw.js',
        {
          scope: './',
          updateViaCache: 'none',
        }
      );

    if (registration.waiting) {
      markUpdateAvailable();
    }

    registration.addEventListener(
      'updatefound',
      () => {
        observeInstallingWorker(
          registration.installing
        );
      }
    );

    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (reloadPending) {
          return;
        }

        reloadPending = true;
        window.location.reload();
      }
    );

    registration
      .update()
      .catch(() => {});

    beginPeriodicUpdateChecks();

    return {
      supported: true,
      registered: true,
    };
  } catch {
    return {
      supported: true,
      registered: false,
    };
  }
}

export async function checkForUpdates() {
  if (!registration) {
    return {
      checked: false,
      updateAvailable,
    };
  }

  try {
    await registration.update();

    if (registration.waiting) {
      markUpdateAvailable();
    }

    return {
      checked: true,
      updateAvailable,
    };
  } catch {
    return {
      checked: false,
      updateAvailable,
    };
  }
}

export function applyUpdate() {
  if (
    registration?.waiting
  ) {
    registration.waiting.postMessage(
      'SKIP_WAITING'
    );

    return {
      applied: true,
      reloading: true,
    };
  }

  window.location.reload(); // SW update fallback: no waiting worker, force fresh fetch from network

  return {
    applied: false,
    reloading: true,
  };
}

export async function clearPublicAppCaches() {
  if (
    typeof navigator !== 'undefined' &&
    navigator.serviceWorker?.controller
  ) {
    navigator.serviceWorker.controller
      .postMessage(
        'CLEAR_PUBLIC_APP_CACHE'
      );
  }

  if (
    typeof caches === 'undefined'
  ) {
    return false;
  }

  const cacheNames =
    await caches.keys();

  const zamorinCacheNames =
    cacheNames.filter(
      (name) =>
        name.startsWith(
          'zamorin-pwa-'
        )
    );

  await Promise.all(
    zamorinCacheNames.map(
      (name) =>
        caches.delete(name)
    )
  );

  return true;
}