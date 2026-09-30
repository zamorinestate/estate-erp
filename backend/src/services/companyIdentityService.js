'use strict';

/**
 * COMPANY / ORGANISATION IDENTITY MASTER SERVICE
 * Standard compliance: Sections 364–395 (EXPORT_ENGINE_COMPANY_IDENTITY_MASTER_STANDARD.md)
 * 
 * Single canonical source of truth for:
 *  - Official branding & vector logos (zero dummy placeholders)
 *  - Head Office statutory registration & multi-state GSTINs
 *  - Two-tier outlet-specific compliance profiles (FSSAI, outlet address)
 *  - Gated versioning, immutable audit trails, and export snapshot binding.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { CompanyIdentity } = require('../models/CompanyIdentity');
const { Cafe } = require('../models/Cafe');
const { ApiError } = require('../utils/ApiError');
const { recordAuditEvent } = require('./auditService');
const { executeTransactionWithRetry } = require('../utils/transactionHelper');

// Default Official Vector Logo Embeddings
let cachedOfficialLogoSvg = null;
let cachedMonochromeSvg = null;

function loadOfficialAppLogos() {
  if (cachedOfficialLogoSvg && cachedMonochromeSvg) {
    return { primarySvg: cachedOfficialLogoSvg, monochromeSvg: cachedMonochromeSvg };
  }

  try {
    const horizontalSvgPath = path.resolve(__dirname, '../../../frontend/src/assets/zamorin-logo-horizontal.svg');
    if (fs.existsSync(horizontalSvgPath)) {
      cachedOfficialLogoSvg = fs.readFileSync(horizontalSvgPath, 'utf8');
    }
  } catch (err) {
    // fallback clean SVG
  }

  if (!cachedOfficialLogoSvg) {
    cachedOfficialLogoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 670 220" width="100%" height="100%">
      <defs>
        <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#C6A567"/>
          <stop offset="100%" stop-color="#83622C"/>
        </linearGradient>
        <linearGradient id="n1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#16223F"/>
          <stop offset="100%" stop-color="#0B1220"/>
        </linearGradient>
        <g id="icn">
          <rect x="6" y="6" width="188" height="188" rx="52" fill="url(#n1)"/>
          <rect x="22" y="22" width="156" height="156" rx="38" fill="none" stroke="url(#g1)" stroke-width="2.25" opacity="0.9"/>
          <path d="M 58 68 L 142 68 L 58 132 L 142 132" fill="none" stroke="url(#g1)" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      </defs>
      <use href="#icn" transform="translate(20,15) scale(0.95)"/>
      <g transform="translate(250,0)">
        <text x="3" y="99" font-family="Playfair Display, Georgia, serif" font-weight="700" font-size="80" letter-spacing="3" fill="#16223F">ZAMORIN</text>
        <text x="5" y="162" font-family="system-ui, sans-serif" font-weight="400" font-size="22" letter-spacing="12" fill="#7C8598">ESTATE</text>
        <line x1="3" y1="178" x2="400" y2="178" stroke="#96733A" stroke-width="1.5"/>
        <text x="5" y="200" font-family="system-ui, sans-serif" font-weight="500" font-size="13" letter-spacing="5" fill="#96733A">PVT. LTD.</text>
      </g>
    </svg>`;
  }

  cachedMonochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100%" height="100%">
    <rect x="10" y="10" width="180" height="180" rx="48" fill="none" stroke="#16223F" stroke-width="4"/>
    <rect x="26" y="26" width="148" height="148" rx="36" fill="none" stroke="#16223F" stroke-width="2"/>
    <path d="M 58 68 L 142 68 L 58 132 L 142 132" fill="none" stroke="#16223F" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  return { primarySvg: cachedOfficialLogoSvg, monochromeSvg: cachedMonochromeSvg };
}

function modelSourceAvailable(model, methodName) {
  const method = model?.[methodName];
  return Boolean(
    mongoose.connection?.readyState === 1 ||
    method?.mock ||
    typeof method?.restore === 'function'
  );
}

function formatAddress(address = {}) {
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.pincode,
    address.country,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}

function formatOutletAddress(outlet = {}) {
  const gstPrincipalPlace = String(outlet?.registrations?.gstDetails?.principalPlace || '').trim();
  if (gstPrincipalPlace) return gstPrincipalPlace;
  const address = outlet?.address || {};
  return [
    address.building,
    address.unit,
    address.floor,
    address.street,
    address.area,
    address.city,
    address.district,
    address.state,
    address.pinCode,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ');
}
const LEGACY_SYNTHETIC_IDENTITY_MARKERS = Object.freeze({
  createdBy: 'System Provisioner',
  changeReason: 'Initial Canonical Company Identity Provisioning',
  legalName: 'Zamorin Speciality Coffee & Kitchens Pvt. Ltd.',
  pan: 'AABCT1332L',
  cin: 'U55101KA2024PTC189201',
  udyamNumber: 'UDYAM-KR-03-0019284',
  gstins: new Set(['29AABCT1332L1ZV', '32AABCZ1234M1Z8']),
  fssai: '10024043000192',
  bankingIfsc: 'HDFC0001742',
  bankingMaskedAccount: 'XXXX-XXXX-8921',
});

function detectLegacySyntheticIdentity(identity = {}) {
  const createdBy = String(identity.createdBy || '').trim();
  const changeReason = String(identity.changeReason || '').trim();
  if (
    createdBy !== LEGACY_SYNTHETIC_IDENTITY_MARKERS.createdBy ||
    changeReason !== LEGACY_SYNTHETIC_IDENTITY_MARKERS.changeReason
  ) {
    return { isLegacySynthetic: false, markers: [] };
  }

  const markers = [];
  if (String(identity.legalName || '').trim() === LEGACY_SYNTHETIC_IDENTITY_MARKERS.legalName) markers.push('legalName');
  if (String(identity.pan || '').trim().toUpperCase() === LEGACY_SYNTHETIC_IDENTITY_MARKERS.pan) markers.push('pan');
  if (String(identity.cin || '').trim().toUpperCase() === LEGACY_SYNTHETIC_IDENTITY_MARKERS.cin) markers.push('cin');
  if (String(identity.udyamNumber || '').trim().toUpperCase() === LEGACY_SYNTHETIC_IDENTITY_MARKERS.udyamNumber) markers.push('udyamNumber');

  const gstins = Array.isArray(identity.gstin)
    ? identity.gstin.map((entry) => String(entry?.number || '').trim().toUpperCase())
    : [];
  if (gstins.some((value) => LEGACY_SYNTHETIC_IDENTITY_MARKERS.gstins.has(value))) markers.push('gstin');

  const licences = Array.isArray(identity.licences)
    ? identity.licences.map((entry) => String(entry?.number || '').trim())
    : [];
  if (licences.includes(LEGACY_SYNTHETIC_IDENTITY_MARKERS.fssai)) markers.push('fssai');

  if (String(identity.banking?.ifsc || '').trim().toUpperCase() === LEGACY_SYNTHETIC_IDENTITY_MARKERS.bankingIfsc) {
    markers.push('banking.ifsc');
  }
  if (String(identity.banking?.accountNumberMasked || '').trim().toUpperCase() === LEGACY_SYNTHETIC_IDENTITY_MARKERS.bankingMaskedAccount) {
    markers.push('banking.accountNumberMasked');
  }

  return {
    isLegacySynthetic: markers.length >= 2,
    markers,
  };
}
class CompanyIdentityService {
  /**
   * Retrieves the current authoritative Company Identity.
   * Auto-provisions baseline version 1 if none exists.
   */
  static async getCurrentIdentity(organisationId, { allowLegacyUnverified = false } = {}) {
    const normalizedOrganisationId = String(organisationId || '').trim().toUpperCase();
    if (!normalizedOrganisationId) {
      throw new ApiError(400, 'ORGANISATION_REQUIRED', 'organisationId is required to resolve company identity.');
    }

    if (!modelSourceAvailable(CompanyIdentity, 'findOne')) {
      throw new ApiError(
        503,
        'COMPANY_IDENTITY_SOURCE_UNAVAILABLE',
        'The authoritative Organisation Identity source is unavailable.'
      );
    }

    let query;
    try {
      query = CompanyIdentity.findOne({
        organisationId: normalizedOrganisationId,
        status: 'CURRENT',
      });
      const identity = query && typeof query.lean === 'function'
        ? await query.lean()
        : await query;

      if (!identity) {
        throw new ApiError(
          409,
          'COMPANY_IDENTITY_NOT_CONFIGURED',
          'Organisation Identity has not been configured for this organisation.'
        );
      }

      const legacyDetection = detectLegacySyntheticIdentity(identity);
      if (legacyDetection.isLegacySynthetic && !allowLegacyUnverified) {
        throw new ApiError(
          409,
          'COMPANY_IDENTITY_REQUIRES_VERIFICATION',
          'The current Organisation Identity was created by the retired sample-data provisioner and must be reviewed and saved as a verified version before use in exports.',
          { markers: legacyDetection.markers }
        );
      }

      if (legacyDetection.isLegacySynthetic) {
        return {
          ...identity,
          identityVerificationStatus: 'LEGACY_SYNTHETIC_UNVERIFIED',
          verificationRequired: true,
          legacySyntheticMarkers: legacyDetection.markers,
        };
      }

      return {
        ...identity,
        identityVerificationStatus: 'VERIFIED_CONFIGURED',
        verificationRequired: false,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const wrapped = new ApiError(
        503,
        'COMPANY_IDENTITY_SOURCE_UNAVAILABLE',
        'The authoritative Organisation Identity could not be read.'
      );
      wrapped.originalError = error;
      throw wrapped;
    }
  }

  /**
   * Resolves authoritative export branding for any export generator (PDF/XLSX/CSV).
   * Implements two-tier resolution (Organisation vs Outlet) per Section 368.
   */
  static async resolveExportBranding({
    cafeId = null,
    sensitivityLevel = 'INTERNAL',
    organisationId,
  } = {}) {
    const normalizedOrganisationId = String(organisationId || '').trim().toUpperCase();
    if (!normalizedOrganisationId) {
      throw new ApiError(400, 'ORGANISATION_REQUIRED', 'organisationId is required to resolve export branding.');
    }

    const master = await this.getCurrentIdentity(normalizedOrganisationId);
    const logos = loadOfficialAppLogos();

    const normalizedCafeId = String(cafeId || '').trim().toUpperCase();
    const isOutletScoped = Boolean(
      normalizedCafeId &&
      normalizedCafeId !== 'ALL' &&
      normalizedCafeId !== 'GLOBAL'
    );

    let outletInfo = null;
    if (isOutletScoped) {
      if (!modelSourceAvailable(Cafe, 'findOne')) {
        throw new ApiError(
          503,
          'CAFE_IDENTITY_SOURCE_UNAVAILABLE',
          'Outlet-scoped export branding requires the authoritative café master.'
        );
      }

      const outletQuery = Cafe.findOne({
        organisationId: normalizedOrganisationId,
        cafeId: normalizedCafeId,
      });
      outletInfo = outletQuery && typeof outletQuery.lean === 'function'
        ? await outletQuery.lean()
        : await outletQuery;

      if (!outletInfo) {
        throw new ApiError(
          404,
          'CAFE_NOT_FOUND',
          'The requested café could not be resolved for export branding.'
        );
      }
    }

    const gstinList = Array.isArray(master.gstin) ? master.gstin : [];
    let resolvedGstin = String(
      gstinList.find((entry) => entry?.isPrimary)?.number ||
      gstinList[0]?.number ||
      ''
    ).trim().toUpperCase();

    const licenceList = Array.isArray(master.licences) ? master.licences : [];
    let resolvedFssai = String(
      licenceList.find((entry) => /FSSAI/i.test(String(entry?.type || '')))?.number ||
      ''
    ).trim();

    let resolvedAddress = formatAddress(master.registeredAddress || {});
    let outletName = String(master.brandName || '').trim();

    if (outletInfo) {
      const displayName = String(outletInfo.displayName || outletInfo.name || '').trim();
      outletName = displayName
        ? `${String(master.brandName || '').trim()} (${displayName})`
        : String(master.brandName || '').trim();

      const outletAddress = formatOutletAddress(outletInfo);
      if (outletAddress) resolvedAddress = outletAddress;

      const outletFssai = outletInfo.registrations?.fssai;
      if (outletFssai?.isApplicable === false) {
        resolvedFssai = '';
      } else if (outletFssai?.number) {
        resolvedFssai = String(outletFssai.number).trim();
      }

      const outletGstin =
        outletInfo.registrations?.gstDetails?.gstin ||
        outletInfo.registrations?.gstin ||
        '';
      if (outletGstin) {
        resolvedGstin = String(outletGstin).trim().toUpperCase();
      } else if (outletInfo.address?.state) {
        const stateName = String(outletInfo.address.state).trim().toLowerCase();
        const stateMatch = gstinList.find(
          (entry) => String(entry?.state || '').trim().toLowerCase() === stateName
        );
        if (stateMatch?.number) {
          resolvedGstin = String(stateMatch.number).trim().toUpperCase();
        }
      }
    }

    const legalName = String(master.legalName || '').trim();
    const brandName = String(master.brandName || '').trim();
    const missingCore = [];
    if (!legalName) missingCore.push('legalName');
    if (!brandName) missingCore.push('brandName');

    if (missingCore.length > 0) {
      throw new ApiError(
        409,
        'COMPANY_IDENTITY_INCOMPLETE',
        `Organisation Identity is incomplete: ${missingCore.join(', ')}.`
      );
    }

    const normalizedSensitivity = String(sensitivityLevel || 'INTERNAL').trim().toUpperCase();
    if (normalizedSensitivity === 'TAX_INVOICE') {
      const missingStatutory = [];
      if (!resolvedAddress) missingStatutory.push('address');
      if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(resolvedGstin)) {
        missingStatutory.push('gstin');
      }

      const fssaiApplicable = outletInfo
        ? outletInfo.registrations?.fssai?.isApplicable !== false
        : true;
      if (fssaiApplicable && !/^\d{14}$/.test(resolvedFssai)) {
        missingStatutory.push('fssai');
      }

      if (missingStatutory.length > 0) {
        throw new ApiError(
          409,
          'EXPORT_STATUTORY_IDENTITY_INCOMPLETE',
          `Tax-invoice branding is incomplete: ${missingStatutory.join(', ')}.`
        );
      }
    }

    const includeBanking =
      normalizedSensitivity === 'CONFIDENTIAL' ||
      normalizedSensitivity === 'TAX_INVOICE';

    return {
      organisationId: normalizedOrganisationId,
      legalName,
      brandName,
      outletName,
      tagline: String(master.tagline || '').trim(),
      logoSvg: master.logo?.primarySvg || logos.primarySvg,
      watermarkSvg: master.logo?.monochromeSvg || logos.monochromeSvg,
      address: resolvedAddress,
      gstin: resolvedGstin,
      fssai: resolvedFssai,
      pan: String(master.pan || '').trim().toUpperCase(),
      cin: String(master.cin || '').trim().toUpperCase(),
      contact: {
        phone: String(master.contact?.phone || '').trim(),
        email: String(master.contact?.email || '').trim().toLowerCase(),
        website: String(master.contact?.website || '').trim(),
      },
      banking: includeBanking ? (master.banking || null) : null,
      authorisedSignatory: master.authorisedSignatory || null,
      companyDetailsVersionId: `v${master.version}-${String(master._id)}`,
      versionNumber: master.version,
      identityStatus: 'CONFIGURED',
      isOutletScoped,
      cafeId: outletInfo?.cafeId || null,
    };
  }

  /**
   * Validates structured identity data per Section 386.
   */
  static validateIdentityData(data) {
    const errors = [];

    if (!data.legalName || data.legalName.trim().length < 3) {
      errors.push('Legal business name must be at least 3 characters.');
    }

    if (!data.brandName || data.brandName.trim().length < 2) {
      errors.push('Brand name must be at least 2 characters.');
    }

    if (data.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(data.pan.trim().toUpperCase())) {
      errors.push('PAN must be in valid format (5 letters, 4 digits, 1 letter).');
    }

    if (Array.isArray(data.gstin)) {
      for (let i = 0; i < data.gstin.length; i++) {
        const g = data.gstin[i];
        if (g.number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g.number.trim().toUpperCase())) {
          errors.push(`GSTIN at entry #${i + 1} (${g.number}) does not conform to 15-character Indian GST format.`);
        }
      }
    }

    if (data.registeredAddress?.pincode && !/^[1-9][0-9]{5}$/.test(data.registeredAddress.pincode.trim())) {
      errors.push('PIN code must be a 6-digit Indian postal code.');
    }

    if (errors.length > 0) {
      throw new ApiError(400, 'VALIDATION_FAILED', errors.join(' '));
    }
  }

  /**
   * Creates a new version of the Company Identity Master (Section 378/385).
   * Gated and audited.
   */
  static async createNewVersion({
    organisationId,
    updates = {},
    userId,
    actorRole = 'MASTER',
    userName = 'Primary Master',
    changeReason = 'Updated Corporate Details',
  }) {
    const normalizedOrganisationId = String(organisationId || '').trim().toUpperCase();
    const normalizedUserId = String(userId || '').trim().toUpperCase();
    const normalizedActorRole = String(actorRole || '').trim().toUpperCase();
    const reason = String(changeReason || '').trim();

    if (!normalizedOrganisationId) {
      throw new ApiError(400, 'ORGANISATION_REQUIRED', 'organisationId is required to update company identity.');
    }
    if (!normalizedUserId || !normalizedActorRole) {
      throw new ApiError(400, 'ACTOR_REQUIRED', 'Authenticated actor identity and role are required.');
    }
    if (reason.length < 5) {
      throw new ApiError(400, 'CHANGE_REASON_REQUIRED', 'A detailed change reason is required.');
    }

    const requestedOrganisationId = String(updates?.organisationId || '').trim().toUpperCase();
    if (requestedOrganisationId && requestedOrganisationId !== normalizedOrganisationId) {
      throw new ApiError(
        403,
        'CROSS_ORGANISATION_IDENTITY_DENIED',
        'Organisation Identity cannot be changed outside the authenticated organisation.'
      );
    }

    if (!modelSourceAvailable(CompanyIdentity, 'findOne')) {
      throw new ApiError(
        503,
        'COMPANY_IDENTITY_SOURCE_UNAVAILABLE',
        'The authoritative Organisation Identity source is unavailable.'
      );
    }

    const cleanUpdates = {
      ...updates,
      organisationId: normalizedOrganisationId,
    };
    for (const controlledField of [
      '_id',
      'id',
      '__v',
      'version',
      'status',
      'effectiveFrom',
      'createdBy',
      'changeReason',
      'supersedesId',
      'supersededById',
      'createdAt',
      'updatedAt',
    ]) {
      delete cleanUpdates[controlledField];
    }

    return executeTransactionWithRetry(async (session) => {
      let currentQuery = CompanyIdentity.findOne({
        organisationId: normalizedOrganisationId,
        status: 'CURRENT',
      });
      if (session && currentQuery && typeof currentQuery.session === 'function') {
        currentQuery = currentQuery.session(session);
      }
      const current = currentQuery && typeof currentQuery.lean === 'function'
        ? await currentQuery.lean()
        : await currentQuery;

      const legacyCurrent = detectLegacySyntheticIdentity(current || {});
      const safeCurrent = legacyCurrent.isLegacySynthetic
        ? {
            organisationId: normalizedOrganisationId,
            logo: current?.logo || undefined,
          }
        : (current || {});

      const merged = {
        ...safeCurrent,
        ...cleanUpdates,
        organisationId: normalizedOrganisationId,
        registeredAddress: {
          ...(safeCurrent?.registeredAddress || {}),
          ...(cleanUpdates.registeredAddress || {}),
        },
        contact: {
          ...(safeCurrent?.contact || {}),
          ...(cleanUpdates.contact || {}),
        },
        banking: {
          ...(safeCurrent?.banking || {}),
          ...(cleanUpdates.banking || {}),
        },
        authorisedSignatory: {
          ...(safeCurrent?.authorisedSignatory || {}),
          ...(cleanUpdates.authorisedSignatory || {}),
        },
      };

      for (const field of [
        '_id',
        'id',
        '__v',
        'createdAt',
        'updatedAt',
        'status',
        'version',
        'effectiveFrom',
        'createdBy',
        'changeReason',
        'supersedesId',
        'supersededById',
      ]) {
        delete merged[field];
      }

      this.validateIdentityData(merged);

      const nextVersionNum = Number(current?.version || 0) + 1;
      const logos = loadOfficialAppLogos();
      const payload = {
        ...merged,
        organisationId: normalizedOrganisationId,
        version: nextVersionNum,
        status: 'CURRENT',
        effectiveFrom: new Date(),
        createdBy: String(userName || normalizedUserId).trim(),
        changeReason: reason,
        supersedesId: current?._id || null,
        supersededById: null,
        logo: {
          ...(merged.logo || {}),
          primarySvg: merged.logo?.primarySvg || logos.primarySvg,
          monochromeSvg: merged.logo?.monochromeSvg || logos.monochromeSvg,
          primaryPngUrl: merged.logo?.primaryPngUrl || '/assets/zamorin-estate-logo.png',
          monochromePngUrl: merged.logo?.monochromePngUrl || '/assets/zamorin-estate-mark.png',
          ingestedAt: new Date(),
        },
      };

      if (current?._id) {
        const supersedeResult = await CompanyIdentity.updateOne(
          {
            _id: current._id,
            organisationId: normalizedOrganisationId,
            status: 'CURRENT',
            version: current.version,
          },
          {
            $set: {
              status: 'SUPERSEDED',
            },
          },
          session ? { session } : undefined
        );

        const matchedCount = Number(
          supersedeResult?.matchedCount ??
          supersedeResult?.n ??
          0
        );
        if (matchedCount !== 1) {
          throw new ApiError(
            409,
            'COMPANY_IDENTITY_VERSION_CONFLICT',
            'Organisation Identity changed concurrently. Reload and retry from the latest version.'
          );
        }
      }

      const newRecord = new CompanyIdentity(payload);
      await newRecord.save(session ? { session } : undefined);

      if (current?._id) {
        const lineageResult = await CompanyIdentity.updateOne(
          {
            _id: current._id,
            organisationId: normalizedOrganisationId,
            status: 'SUPERSEDED',
            version: current.version,
          },
          {
            $set: {
              supersededById: newRecord._id,
            },
          },
          session ? { session } : undefined
        );
        const matchedCount = Number(
          lineageResult?.matchedCount ??
          lineageResult?.n ??
          0
        );
        if (matchedCount !== 1) {
          throw new ApiError(
            409,
            'COMPANY_IDENTITY_LINEAGE_CONFLICT',
            'Organisation Identity lineage could not be finalized atomically.'
          );
        }
      }

      const audit = await recordAuditEvent({
        organisationId: normalizedOrganisationId,
        cafeId: 'GLOBAL',
        actorUserId: normalizedUserId,
        actorRole: normalizedActorRole,
        module: 'COMPANY_IDENTITY',
        action: current ? 'COMPANY_IDENTITY_VERSION_CREATED' : 'COMPANY_IDENTITY_INITIALIZED',
        entityType: 'COMPANY_IDENTITY',
        entityId: `COMPANY_IDENTITY_V${nextVersionNum}`,
        before: current || null,
        after: newRecord.toObject(),
        reason,
        result: 'SUCCESS',
        riskClassification: 'CRITICAL',
        metadata: {
          version: nextVersionNum,
          supersedesVersion: current?.version || null,
        },
        session,
      });

      if (!audit?.auditEventId) {
        throw new ApiError(
          503,
          'COMPANY_IDENTITY_AUDIT_NOT_CONFIRMED',
          'Organisation Identity was not changed because its immutable audit event could not be confirmed.'
        );
      }

      return newRecord.toObject();
    }, {
      requireTransactions: process.env.NODE_ENV === 'production',
    });
  }

  /**
   * Retrieves version history timeline (Section 385).
   */
  static async getVersionHistory(organisationId) {
    const normalizedOrganisationId = String(organisationId || '').trim().toUpperCase();
    if (!normalizedOrganisationId) {
      throw new ApiError(400, 'ORGANISATION_REQUIRED', 'organisationId is required to read identity history.');
    }
    if (!modelSourceAvailable(CompanyIdentity, 'find')) {
      throw new ApiError(
        503,
        'COMPANY_IDENTITY_SOURCE_UNAVAILABLE',
        'The authoritative Organisation Identity source is unavailable.'
      );
    }

    const query = CompanyIdentity.find({
      organisationId: normalizedOrganisationId,
    })
      .sort({ version: -1 })
      .select('version status effectiveFrom createdBy changeReason legalName brandName gstin createdAt');

    return query && typeof query.lean === 'function'
      ? query.lean()
      : query;
  }

}

module.exports = {
  CompanyIdentityService,
  loadOfficialAppLogos,
  detectLegacySyntheticIdentity,
};
