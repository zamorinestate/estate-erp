/**
 * ============================================================================
 * ZAMORIN CAFÉ ERP — CLIENT OFFLINE MANAGER (REC-13 / R02-09)
 * ============================================================================
 * Canonical Offline Queue of Record utilizing IndexedDB:
 * - Durable IndexedDB storage engine (ZamorinOfflineDB_v2 / pos_queue)
 * - Strict Transaction Lifecycle State Machine:
 *     CAPTURING -> PENDING_SYNC -> SYNCING -> SYNCED
 *     RETRYABLE_FAILURE | AUTH_REQUIRED | CONFLICT_REVIEW_REQUIRED | MANUAL_REVIEW_REQUIRED
 * - Storage persistence detection (PERSISTENT_STORAGE_GRANTED / BEST_EFFORT_STORAGE)
 * - QuotaExceededError protection (Atomic write -> verify before reporting success)
 * - Immutable Sale Identity (saleAttemptId, idempotencyKey minted before network loss)
 * - Safe offline tender policy (CASH permitted; CARD/UPI rejected offline)
 * - Background Sync feature detection with complete foreground fallback
 * - Multi-tab synchronization safety via Web Locks API
 * - Cross-café scoping & zero KDS
 * - CTL-08 (Sync Offline Queue) control handler
 */

const DB_NAME = 'ZamorinOfflineDB_v2';
const DB_VERSION = 1;
const QUEUE_STORE = 'pos_queue';
const META_STORE = 'storage_meta';

export const QUEUE_STATUSES = {
  CAPTURING: 'CAPTURING',
  PENDING_SYNC: 'PENDING_SYNC',
  SYNCING: 'SYNCING',
  SYNCED: 'SYNCED',
  RETRYABLE_FAILURE: 'RETRYABLE_FAILURE',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  CONFLICT_REVIEW_REQUIRED: 'CONFLICT_REVIEW_REQUIRED',
  MANUAL_REVIEW_REQUIRED: 'MANUAL_REVIEW_REQUIRED',
};

export const PERSISTENCE_STATUS = {
  PERSISTENT_STORAGE_GRANTED: 'PERSISTENT_STORAGE_GRANTED',
  BEST_EFFORT_STORAGE: 'BEST_EFFORT_STORAGE',
  STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
};

class OfflineManager {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.syncing = false;
    this.persistenceStatus = PERSISTENCE_STATUS.STORAGE_UNAVAILABLE;
    this._listeners = [];
    this._dbPromise = null;
    this._sequenceCounter = 0;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
      this.initPersistence();
    }
  }

  /**
   * Initializes IndexedDB connection and handles schema migration safely.
   */
  async getDB() {
    if (this._dbPromise) return this._dbPromise;

    if (typeof indexedDB === 'undefined') {
      throw new Error('INDEXEDDB_UNAVAILABLE: IndexedDB is required for financial offline queue.');
    }

    this._dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Non-destructive schema creation: preserve pending records
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'localQueueId' });
          store.createIndex('saleAttemptId', 'saleAttemptId', { unique: true });
          store.createIndex('idempotencyKey', 'idempotencyKey', { unique: true });
          store.createIndex('cafeId', 'cafeId', { unique: false });
          store.createIndex('queueStatus', 'queueStatus', { unique: false });
          store.createIndex('queueCreatedAt', 'queueCreatedAt', { unique: false });
          store.createIndex('localSequence', 'localSequence', { unique: false });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });

    return this._dbPromise;
  }

  /**
   * Storage persistence evaluation and request.
   */
  async initPersistence() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      try {
        let isPersisted = await navigator.storage.persisted();
        if (!isPersisted && navigator.storage.persist) {
          isPersisted = await navigator.storage.persist();
        }
        this.persistenceStatus = isPersisted
          ? PERSISTENCE_STATUS.PERSISTENT_STORAGE_GRANTED
          : PERSISTENCE_STATUS.BEST_EFFORT_STORAGE;
      } catch (_) {
        this.persistenceStatus = PERSISTENCE_STATUS.BEST_EFFORT_STORAGE;
      }
    } else {
      this.persistenceStatus = PERSISTENCE_STATUS.BEST_EFFORT_STORAGE;
    }
    return this.persistenceStatus;
  }

  /**
   * Estimates storage quota and usage.
   */
  async getStorageEstimate() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        return {
          usage: est.usage || 0,
          quota: est.quota || 0,
          percentage: est.quota ? Math.round((est.usage / est.quota) * 100) : 0,
        };
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  /**
   * Generates monotonic sequence numbers and unique UUIDs.
   */
  generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    const d = Date.now().toString(36);
    const r = Math.random().toString(36).substring(2, 10);
    return `uid-${d}-${r}`;
  }

  /**
   * Resolves tender policy for offline capture.
   * CASH permitted; electronic payments (CARD, UPI) strictly rejected offline.
   */
  validateOfflineTender(paymentMethod) {
    const normTender = String(paymentMethod || 'CASH').trim().toUpperCase();
    if (normTender === 'CASH') {
      return { allowed: true };
    }
    return {
      allowed: false,
      errorCode: 'PAYMENT_METHOD_REQUIRES_NETWORK',
      message: `Network connection required for ${normTender}. Offline processing is prohibited for digital payment methods.`,
    };
  }

  /**
   * Computes deterministic request fingerprint.
   */
  computeFingerprint(payload) {
    const raw = JSON.stringify({
      cafeId: payload.cafeId,
      totalPaisa: payload.totalPaisa,
      paymentMethod: payload.paymentMethod,
      itemCount: payload.lineItems?.length,
    });
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `fp-${Math.abs(hash).toString(16)}`;
  }

  /**
   * Enqueues an offline sale into IndexedDB with atomic validation and quota protection.
   * Execution sequence:
   * 1. Validate tender policy
   * 2. Mint immutable saleAttemptId & idempotencyKey
   * 3. Construct offline sale record (CAPTURING -> PENDING_SYNC)
   * 4. Persist in IndexedDB (handling QuotaExceededError)
   * 5. Verify queue record read from DB
   * 6. Register Background Sync if supported
   * 7. Return verified offline record
   */
  async enqueueSale(saleData = {}) {
    // 1. Validate tender
    const tenderCheck = this.validateOfflineTender(saleData.paymentMethod);
    if (!tenderCheck.allowed) {
      throw new Error(tenderCheck.message);
    }

    const db = await this.getDB();
    this._sequenceCounter++;

    const now = new Date().toISOString();
    const localQueueId = `Q-${Date.now()}-${this._sequenceCounter}`;
    const idempotencyKey = saleData.idempotencyKey || `IDEM-OFF-${Date.now()}-${this.generateUUID().substring(0, 8)}`;
    const saleAttemptId = saleData.saleAttemptId || `ATT-${idempotencyKey}`;
    const requestFingerprint = this.computeFingerprint(saleData);

    const queueRecord = {
      localQueueId,
      saleAttemptId,
      idempotencyKey,
      requestFingerprint,
      organisationId: saleData.organisationId || 'ORG-ZAMORIN',
      cafeId: saleData.cafeId || '',
      originatingUserId: saleData.originatingUserId || saleData.userId || 'CASHIER',
      originatingDeviceId: saleData.deviceId || 'DEV-POS-01',
      shiftId: saleData.shiftId || saleData.registerSessionId || '',
      capturedAtClient: now,
      queueCreatedAt: now,
      localSequence: this._sequenceCounter,
      catalogVersion: saleData.catalogVersion || 'CAT-V1',
      lineItems: Array.isArray(saleData.lineItems) ? saleData.lineItems : [],
      totalPaisa: Number(saleData.totalPaisa) || 0,
      subtotalPaisa: Number(saleData.subtotalPaisa) || 0,
      taxPaisa: Number(saleData.taxPaisa) || 0,
      discountPaisa: Number(saleData.discountPaisa) || 0,
      paymentMethod: 'CASH',
      orderType: saleData.orderType || 'QUICK_SALE',
      serviceMode: saleData.serviceMode || 'QUICK_SALE',
      tableNumber: saleData.tableNumber || '',
      tableToken: saleData.tableToken || '',
      guestCovers: saleData.guestCovers || 1,
      tenders: [
        {
          paymentMethod: 'CASH',
          amountPaisa: Number(saleData.totalPaisa) || 0,
          provider: 'CASH_REGISTER',
          paymentReference: `CASH-${localQueueId}`,
        },
      ],
      queueStatus: QUEUE_STATUSES.PENDING_SYNC,
      retryCount: 0,
      lastAttemptAt: null,
      nextRetryAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      serverBillId: null,
      serverInvoiceNumber: null,
      serverFinalizedAt: null,
    };

    // 4. Atomic IndexedDB write with QuotaExceededError protection
    await new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([QUEUE_STORE], 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const addReq = store.add(queueRecord);

        addReq.onsuccess = () => resolve(addReq.result);
        addReq.onerror = (evt) => {
          const err = evt.target.error;
          if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
            reject(new Error('QUOTA_EXCEEDED: Local storage limit reached. Transaction could not be persisted. Offline sale aborted.'));
          } else {
            reject(err);
          }
        };
      } catch (err) {
        reject(err);
      }
    });

    // 5. Verify record exists in DB before declaring success
    const verified = await this.getQueueItem(localQueueId);
    if (!verified) {
      throw new Error('LOCAL_PERSISTENCE_VERIFICATION_FAILED: Queue record was not committed to IndexedDB.');
    }

    // 6. Optional Background Sync trigger
    this.requestBackgroundSync();

    this.notifyListeners();
    return verified;
  }

  /**
   * Retrieves single item from IndexedDB.
   */
  async getQueueItem(localQueueId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([QUEUE_STORE], 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.get(localQueueId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (evt) => reject(evt.target.error);
    });
  }

  /**
   * Retrieves all items from IndexedDB.
   */
  async getAllQueueItems() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([QUEUE_STORE], 'readonly');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (evt) => reject(evt.target.error);
    });
  }

  /**
   * Retrieves queue items scoped to a specific cafe.
   */
  async getQueueForCafe(cafeId) {
    const all = await this.getAllQueueItems();
    const cleanCafe = String(cafeId || '').trim().toUpperCase();
    if (!cleanCafe) return all;
    return all.filter((item) => String(item.cafeId || '').trim().toUpperCase() === cleanCafe);
  }

  /**
   * Returns count of pending sales waiting for sync.
   */
  async getPendingCount(cafeId = '') {
    const items = await this.getQueueForCafe(cafeId);
    return items.filter((it) =>
      it.queueStatus === QUEUE_STATUSES.PENDING_SYNC ||
      it.queueStatus === QUEUE_STATUSES.RETRYABLE_FAILURE ||
      it.queueStatus === QUEUE_STATUSES.SYNCING
    ).length;
  }

  /**
   * Updates an item's status in IndexedDB safely.
   */
  async updateQueueItem(item) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([QUEUE_STORE], 'readwrite');
      const store = tx.objectStore(QUEUE_STORE);
      const req = store.put(item);
      req.onsuccess = () => resolve(item);
      req.onerror = (evt) => reject(evt.target.error);
    });
  }

  /**
   * Feature-detects and optionally registers Background Sync.
   */
  async requestBackgroundSync() {
    if (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'SyncManager' in window
    ) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.sync) {
          await reg.sync.register('zamorin-pos-queue-sync');
          return true;
        }
      } catch (_) {}
    }
    return false;
  }

  /**
   * Executes FIFO sync across all pending transactions.
   * Multi-tab concurrency protected via Web Locks API (navigator.locks).
   */
  async syncNow(apiClient = null, targetCafeId = '') {
    if (this.syncing) {
      return { syncedCount: 0, status: 'ALREADY_IN_PROGRESS' };
    }

    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
      return await navigator.locks.request('zamorin_pos_queue_sync_lock', async () => {
        return await this._executeSync(apiClient, targetCafeId);
      });
    }

    return await this._executeSync(apiClient, targetCafeId);
  }

  /**
   * Internal FIFO sync processing routine.
   */
  async _executeSync(apiClient, targetCafeId) {
    this.syncing = true;
    const syncSummary = {
      totalAttempted: 0,
      syncedCount: 0,
      conflictCount: 0,
      authRequiredCount: 0,
      failedCount: 0,
      items: [],
    };

    try {
      const allItems = await this.getAllQueueItems();
      const cleanCafe = String(targetCafeId || '').trim().toUpperCase();

      // FIFO Order: sorted by queueCreatedAt asc, localSequence asc
      const pendingItems = allItems
        .filter((it) => {
          if (cleanCafe && String(it.cafeId || '').trim().toUpperCase() !== cleanCafe) return false;
          return (
            it.queueStatus === QUEUE_STATUSES.PENDING_SYNC ||
            it.queueStatus === QUEUE_STATUSES.RETRYABLE_FAILURE ||
            it.queueStatus === QUEUE_STATUSES.SYNCING
          );
        })
        .sort((a, b) => {
          const tA = new Date(a.queueCreatedAt).getTime();
          const tB = new Date(b.queueCreatedAt).getTime();
          if (tA !== tB) return tA - tB;
          return (a.localSequence || 0) - (b.localSequence || 0);
        });

      if (pendingItems.length === 0) {
        return syncSummary;
      }

      syncSummary.totalAttempted = pendingItems.length;

      // Mark items SYNCING
      for (const item of pendingItems) {
        item.queueStatus = QUEUE_STATUSES.SYNCING;
        item.lastAttemptAt = new Date().toISOString();
        await this.updateQueueItem(item);
      }

      // Group by cafe for cross-café isolation in batch API
      const cafeGroups = {};
      for (const item of pendingItems) {
        const cid = item.cafeId || 'UNKNOWN';
        if (!cafeGroups[cid]) cafeGroups[cid] = [];
        cafeGroups[cid].push(item);
      }

      for (const [cafeId, txs] of Object.entries(cafeGroups)) {
        try {
          const payload = {
            cafeId,
            transactions: txs.map((t) => ({
              clientOfflineId: t.saleAttemptId || t.localQueueId,
              saleAttemptId: t.saleAttemptId,
              idempotencyKey: t.idempotencyKey,
              orderType: t.orderType,
              serviceMode: t.serviceMode,
              tableNumber: t.tableNumber,
              tableToken: t.tableToken,
              guestCovers: t.guestCovers,
              totalPaisa: t.totalPaisa,
              discountPaisa: t.discountPaisa,
              paymentMethod: t.paymentMethod,
              catalogVersion: t.catalogVersion,
              lineItems: t.lineItems,
              tenders: t.tenders,
              capturedAtClient: t.capturedAtClient,
              offlineCreatedAt: t.queueCreatedAt,
              originatingUserId: t.originatingUserId,
              deviceId: t.originatingDeviceId,
            })),
          };

          const endpoint = '/api/v1/pos/offline-sync';
          let responseData = null;

          if (apiClient && typeof apiClient.post === 'function') {
            const res = await apiClient.post(endpoint, payload);
            responseData = res?.data || res;
          } else if (typeof fetch !== 'undefined') {
            const httpRes = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            if (httpRes.status === 401) {
              for (const it of txs) {
                it.queueStatus = QUEUE_STATUSES.AUTH_REQUIRED;
                it.lastErrorCode = '401_UNAUTHORIZED';
                await this.updateQueueItem(it);
                syncSummary.authRequiredCount++;
              }
              continue;
            }
            responseData = await httpRes.json();
          }

          const syncItems = responseData?.data?.items || responseData?.items || [];
          const resultMap = new Map();
          for (const s of syncItems) {
            resultMap.set(s.clientOfflineId, s);
          }

          for (const item of txs) {
            const serverResult = resultMap.get(item.saleAttemptId) || resultMap.get(item.localQueueId);
            if (serverResult) {
              if (serverResult.status === 'SYNCED' || serverResult.status === 'ALREADY_SYNCED' || serverResult.status === 'SYNCED_WITH_FLAG') {
                item.queueStatus = QUEUE_STATUSES.SYNCED;
                item.serverBillId = serverResult.billId;
                item.serverInvoiceNumber = serverResult.invoiceNumber;
                item.serverFinalizedAt = new Date().toISOString();
                item.lastErrorMessage = null;
                await this.updateQueueItem(item);
                syncSummary.syncedCount++;
              } else if (serverResult.status === 'CONFLICT_REVIEW_REQUIRED') {
                item.queueStatus = QUEUE_STATUSES.CONFLICT_REVIEW_REQUIRED;
                item.lastErrorCode = serverResult.errorCode || 'CONFLICT';
                item.lastErrorMessage = serverResult.reason;
                await this.updateQueueItem(item);
                syncSummary.conflictCount++;
              } else {
                item.retryCount = (item.retryCount || 0) + 1;
                item.queueStatus = item.retryCount >= 5 ? QUEUE_STATUSES.MANUAL_REVIEW_REQUIRED : QUEUE_STATUSES.RETRYABLE_FAILURE;
                item.lastErrorCode = serverResult.errorCode || 'SERVER_REJECTED';
                item.lastErrorMessage = serverResult.reason;
                await this.updateQueueItem(item);
                syncSummary.failedCount++;
              }
            } else {
              // Unconfirmed outcome for this item
              item.queueStatus = QUEUE_STATUSES.RETRYABLE_FAILURE;
              await this.updateQueueItem(item);
              syncSummary.failedCount++;
            }
          }
        } catch (netErr) {
          // Network loss or timeout: preserve items as RETRYABLE_FAILURE
          for (const it of txs) {
            it.retryCount = (it.retryCount || 0) + 1;
            it.queueStatus = it.retryCount >= 5 ? QUEUE_STATUSES.MANUAL_REVIEW_REQUIRED : QUEUE_STATUSES.RETRYABLE_FAILURE;
            it.lastErrorMessage = netErr.message || 'Network unreachable';
            await this.updateQueueItem(it);
          }
          syncSummary.failedCount += txs.length;
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('zamorin:offline-sync-complete', { detail: syncSummary })
        );
      }
    } finally {
      this.syncing = false;
      this.notifyListeners();
    }

    return syncSummary;
  }

  handleOnline() {
    this.isOnline = true;
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zamorin:connectivity-changed', { detail: { isOnline: true } }));
    }
    // Attempt foreground sync
    this.syncNow();
  }

  handleOffline() {
    this.isOnline = false;
    this.notifyListeners();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('zamorin:connectivity-changed', { detail: { isOnline: false } }));
    }
  }

  subscribe(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  }

  async notifyListeners() {
    let pendingCount = 0;
    try {
      pendingCount = await this.getPendingCount();
    } catch (_) {}

    const status = {
      isOnline: this.isOnline,
      pendingCount,
      syncing: this.syncing,
      persistenceStatus: this.persistenceStatus,
    };

    this._listeners.forEach((cb) => {
      try {
        cb(status);
      } catch (_) {}
    });
  }
}

export const offlineManager = new OfflineManager();

if (typeof window !== 'undefined') {
  window.offlineManager = offlineManager;
}
